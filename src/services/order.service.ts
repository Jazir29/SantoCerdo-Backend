import pool from '../config/db';
import { PoolConnection } from 'mysql2/promise';
import { AppError } from './errors';
import { recordMovement } from './stock.service';

// ── Private helpers ───────────────────────────────────────────

async function fetchPrices(
  conn: PoolConnection,
  productIds: number[],
): Promise<Map<number, number>> {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map(() => '?').join(',');
  const [rows] = await conn.query(
    `SELECT id, price FROM products WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    productIds,
  ) as any[];
  const map = new Map<number, number>();
  for (const row of rows) map.set(Number(row.id), Number(row.price));
  return map;
}

async function applyPromotion(
  conn: PoolConnection,
  promotionId: number | null,
  subtotal: number,
): Promise<{ finalTotal: number; discountAmount: number; validPromoId: number | null }> {
  if (!promotionId) return { finalTotal: subtotal, discountAmount: 0, validPromoId: null };

  const [rows] = await conn.query(
    `SELECT * FROM promotions WHERE id = ? AND active = 1 AND deleted_at IS NULL AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())`,
    [promotionId],
  ) as any[];

  const promo = rows[0];
  if (!promo) return { finalTotal: subtotal, discountAmount: 0, validPromoId: null };

  const discount = promo.type === 'percentage'
    ? subtotal * (promo.value / 100)
    : Number(promo.value);

  return {
    finalTotal:     Math.max(0, subtotal - discount),
    discountAmount: discount,
    validPromoId:   promotionId,
  };
}

// ── Public service methods ────────────────────────────────────

export async function list(params: {
  page: number;
  limit: number;
  search: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ data: any[]; total: number; totalPages: number; page: number }> {
  const { page, limit, search, status, startDate, endDate } = params;
  const offset = (page - 1) * limit;

  const conditions = [
    'o.deleted_at IS NULL',
    `(c.name LIKE ? OR c.last_name LIKE ? OR c.trade_name LIKE ? OR CAST(o.id AS CHAR) LIKE ?)`,
  ];
  const queryParams: any[] = [search, search, search, search];

  if (status && status !== 'all') { conditions.push('o.status = ?'); queryParams.push(status); }
  if (startDate)                  { conditions.push('DATE(o.created_at) >= ?'); queryParams.push(startDate); }
  if (endDate)                    { conditions.push('DATE(o.created_at) <= ?'); queryParams.push(endDate); }

  const where = conditions.join(' AND ');

  const [items] = await pool.query(
    `SELECT o.*, c.name AS customer_name, c.last_name AS customer_last_name, c.trade_name, p.name AS promotion_name, p.code AS promotion_code
     FROM orders o
     LEFT JOIN customers  c ON o.customer_id  = c.id
     LEFT JOIN promotions p ON o.promotion_id = p.id
     WHERE ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset],
  ) as any[];

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE ${where}`,
    queryParams,
  ) as any[];

  const total = countRows[0].total;
  return { data: items, total, totalPages: Math.ceil(total / limit), page };
}

export async function getById(id: number): Promise<{ order: any; items: any[] }> {
  const [orderRows] = await pool.query(
    `SELECT o.*, o.id AS order_id,
            c.type, c.document_id, c.name AS customer_name, c.last_name, c.trade_name,
            c.email, c.phone,
            p.name AS promotion_name, p.code AS promotion_code
     FROM orders o
     LEFT JOIN customers  c ON o.customer_id  = c.id
     LEFT JOIN promotions p ON o.promotion_id = p.id
     WHERE o.id = ? AND o.deleted_at IS NULL`,
    [id],
  ) as any[];

  if (!orderRows[0]) throw new AppError(404, 'Orden no encontrada');

  const [items] = await pool.query(
    `SELECT oi.*, p.name AS product_name FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`,
    [id],
  ) as any[];

  return { order: orderRows[0], items };
}

export async function create(
  data: {
    customer_id: number;
    items: { product_id: number; quantity: number }[];
    promotion_id?: number;
    delivery_address?: string;
    delivery_department?: string;
    delivery_province?: string;
    delivery_district?: string;
    delivery_reference?: string;
    new_address_to_save?: {
      save?: boolean;
      name?: string;
      address?: string;
      reference?: string;
      department?: string;
      province?: string;
      district?: string;
    };
  },
  userId: number,
): Promise<{ orderId: number }> {
  const {
    customer_id, items, promotion_id,
    delivery_address, delivery_department, delivery_province,
    delivery_district, delivery_reference, new_address_to_save,
  } = data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (new_address_to_save?.save) {
      const [countRows] = await conn.query(
        'SELECT COUNT(*) as count FROM customer_addresses WHERE customer_id = ? AND deleted_at IS NULL',
        [customer_id],
      ) as any[];
      const addressName = new_address_to_save.name || `Dirección ${countRows[0].count + 2}`;
      await conn.query(
        `INSERT INTO customer_addresses (customer_id, name, address, reference, department, province, district, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customer_id, addressName, new_address_to_save.address, new_address_to_save.reference,
         new_address_to_save.department, new_address_to_save.province, new_address_to_save.district,
         userId, userId],
      );
    }

    const productIds = [...new Set((items as any[]).map((i: any) => Number(i.product_id)))];
    const priceMap = await fetchPrices(conn, productIds);
    for (const item of items) {
      if (!priceMap.has(Number(item.product_id))) {
        throw new AppError(400, `Producto ${item.product_id} no encontrado`);
      }
    }

    const subtotal: number = (items as any[]).reduce(
      (acc: number, item: any) => acc + priceMap.get(Number(item.product_id))! * item.quantity, 0,
    );
    const { finalTotal, discountAmount, validPromoId } =
      await applyPromotion(conn, promotion_id || null, subtotal);

    const [orderResult] = await conn.query(
      `INSERT INTO orders (customer_id, total_amount, status, created_at, delivery_address, delivery_department, delivery_province, delivery_district, delivery_reference, promotion_id, discount_amount, created_by, updated_by) VALUES (?, ?, 'pending', NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, finalTotal, delivery_address, delivery_department, delivery_province,
       delivery_district, delivery_reference, validPromoId, discountAmount, userId, userId],
    ) as any[];

    const orderId = orderResult.insertId;

    for (const item of items) {
      const unitPrice = priceMap.get(Number(item.product_id))!;

      const [stockRows] = await conn.query(
        'SELECT stock FROM products WHERE id = ? FOR UPDATE',
        [item.product_id],
      ) as any[];
      if (!stockRows[0] || stockRows[0].stock < item.quantity) {
        throw new AppError(400, `Stock insuficiente para el producto ${item.product_id}`);
      }

      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, unitPrice, userId, userId],
      );
      await conn.query(
        'UPDATE products SET stock = stock - ?, updated_by = ? WHERE id = ?',
        [item.quantity, userId, item.product_id],
      );
      await recordMovement(conn, item.product_id, -item.quantity, 'order_create', orderId, 'order', userId);
    }

    await conn.commit();
    return { orderId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function update(
  id: number,
  data: {
    customer_id: number;
    items: { product_id: number; quantity: number }[];
    promotion_id?: number;
    delivery_address?: string;
    delivery_department?: string;
    delivery_province?: string;
    delivery_district?: string;
    delivery_reference?: string;
  },
  userId: number,
): Promise<void> {
  const {
    customer_id, items, promotion_id,
    delivery_address, delivery_department, delivery_province,
    delivery_district, delivery_reference,
  } = data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [oldItems] = await conn.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id],
    ) as any[];
    for (const item of oldItems) {
      await conn.query(
        'UPDATE products SET stock = stock + ?, updated_by = ? WHERE id = ?',
        [item.quantity, userId, item.product_id],
      );
      await recordMovement(conn, item.product_id, item.quantity, 'order_update', Number(id), 'order', userId, 'Restauración por edición de orden');
    }

    await conn.query('DELETE FROM order_items WHERE order_id = ?', [id]);

    const productIds = [...new Set((items as any[]).map((i: any) => Number(i.product_id)))];
    const priceMap = await fetchPrices(conn, productIds);
    for (const item of items) {
      if (!priceMap.has(Number(item.product_id))) {
        throw new AppError(400, `Producto ${item.product_id} no encontrado`);
      }
    }

    const subtotal: number = (items as any[]).reduce(
      (acc: number, item: any) => acc + priceMap.get(Number(item.product_id))! * item.quantity, 0,
    );
    const { finalTotal, discountAmount, validPromoId } =
      await applyPromotion(conn, promotion_id || null, subtotal);

    await conn.query(
      `UPDATE orders SET customer_id = ?, total_amount = ?, delivery_address = ?, delivery_department = ?, delivery_province = ?, delivery_district = ?, delivery_reference = ?, promotion_id = ?, discount_amount = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
      [customer_id, finalTotal, delivery_address, delivery_department, delivery_province,
       delivery_district, delivery_reference, validPromoId, discountAmount, userId, id],
    );

    for (const item of items) {
      const unitPrice = priceMap.get(Number(item.product_id))!;

      const [stockRows] = await conn.query(
        'SELECT stock FROM products WHERE id = ? FOR UPDATE',
        [item.product_id],
      ) as any[];
      if (!stockRows[0] || stockRows[0].stock < item.quantity) {
        throw new AppError(400, `Stock insuficiente para el producto ${item.product_id}`);
      }

      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, item.product_id, item.quantity, unitPrice, userId, userId],
      );
      await conn.query(
        'UPDATE products SET stock = stock - ?, updated_by = ? WHERE id = ?',
        [item.quantity, userId, item.product_id],
      );
      await recordMovement(conn, item.product_id, -item.quantity, 'order_update', Number(id), 'order', userId);
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateStatus(id: number, status: string, userId: number): Promise<void> {
  await pool.query(
    'UPDATE orders SET status = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
    [status, userId, id],
  );
}

export async function updatePayment(
  id: number,
  data: { payment_status: string; payment_method?: string | null },
  userId: number,
): Promise<void> {
  const paid_at = data.payment_status === 'paid' ? new Date() : null;
  await pool.query(
    'UPDATE orders SET payment_status = ?, payment_method = ?, paid_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
    [data.payment_status, data.payment_method ?? null, paid_at, userId, id],
  );
}

export async function cancel(id: number, userId: number): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query(
      'SELECT status FROM orders WHERE id = ? AND deleted_at IS NULL', [id],
    ) as any[];

    if (!orderRows[0]) throw new AppError(404, 'Orden no encontrada');

    if (orderRows[0].status !== 'cancelled') {
      const [items] = await conn.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id],
      ) as any[];
      for (const item of items) {
        await conn.query(
          'UPDATE products SET stock = stock + ?, updated_by = ? WHERE id = ?',
          [item.quantity, userId, item.product_id],
        );
        await recordMovement(conn, item.product_id, item.quantity, 'order_cancel', Number(id), 'order', userId);
      }
    }

    await conn.query(
      `UPDATE orders SET status = 'cancelled', updated_by = ? WHERE id = ?`,
      [userId, id],
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
