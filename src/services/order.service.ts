import pool from '../config/db';
import { AppError } from './errors';

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

// Valida la promo y retorna { discount, promoId }; throw si inválida.
async function applyPromotion(
  conn: any,
  promotionId: number,
  subtotal: number,
): Promise<{ discount: number; promoId: number }> {
  const [rows]: any = await conn.query(
    `SELECT type, value, max_uses, current_uses
     FROM promotions
     WHERE id = ? AND active = 1 AND deleted_at IS NULL
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date   IS NULL OR end_date   >= NOW())`,
    [promotionId],
  );
  const promo = rows[0];
  if (!promo) throw new AppError(400, 'Promoción inválida o expirada');
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
    throw new AppError(400, 'Esta promoción ha alcanzado su límite de usos');
  }
  const discount = promo.type === 'percentage'
    ? subtotal * (Number(promo.value) / 100)
    : Number(promo.value);
  return { discount, promoId: promotionId };
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

    // Guardar nueva dirección si se pidió
    if (new_address_to_save?.save && new_address_to_save.address) {
      const [[cntRow]]: any = await conn.query(
        `SELECT COUNT(*) AS c FROM customer_addresses WHERE customer_id = ? AND deleted_at IS NULL`,
        [customer_id],
      );
      const addrName = new_address_to_save.name && new_address_to_save.name.trim() !== ''
        ? new_address_to_save.name
        : `Dirección ${cntRow.c + 2}`;
      await conn.query(
        `INSERT INTO customer_addresses
          (customer_id, name, address, reference, department, province, district, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customer_id, addrName, new_address_to_save.address,
          new_address_to_save.reference ?? null,
          new_address_to_save.department ?? null,
          new_address_to_save.province ?? null,
          new_address_to_save.district ?? null,
          userId, userId,
        ],
      );
    }

    // Primera pasada: validar stock y precios, calcular subtotal
    const priceMap = new Map<number, number>();
    let subtotal = 0;
    for (const item of items) {
      const [prodRows]: any = await conn.query(
        `SELECT price, stock FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [item.product_id],
      );
      const prod = prodRows[0];
      if (!prod) throw new AppError(400, `Producto ${item.product_id} no encontrado`);
      if (prod.stock < item.quantity) {
        throw new AppError(400, `Stock insuficiente para el producto ${item.product_id}`);
      }
      priceMap.set(item.product_id, Number(prod.price));
      subtotal += Number(prod.price) * item.quantity;
    }

    // Promoción
    let discount = 0;
    let validPromoId: number | null = null;
    if (promotion_id) {
      const result = await applyPromotion(conn, promotion_id, subtotal);
      discount = result.discount;
      validPromoId = result.promoId;
    }

    const total = Math.max(0, subtotal - discount);

    // Insertar orden
    const [orderResult]: any = await conn.query(
      `INSERT INTO orders
        (customer_id, total_amount, status, created_at,
         delivery_address, delivery_department, delivery_province,
         delivery_district, delivery_reference,
         promotion_id, discount_amount, created_by, updated_by)
       VALUES (?, ?, 'pending', NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer_id, total,
        delivery_address ?? null, delivery_department ?? null,
        delivery_province ?? null, delivery_district ?? null,
        delivery_reference ?? null,
        validPromoId, discount, userId, userId,
      ],
    );
    const orderId = orderResult.insertId;

    if (validPromoId !== null) {
      await conn.query(
        `UPDATE promotions SET current_uses = current_uses + 1 WHERE id = ?`,
        [validPromoId],
      );
    }

    // Segunda pasada: insertar items, descontar stock, registrar movimientos
    for (const item of items) {
      const price = priceMap.get(item.product_id)!;
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, price, userId, userId],
      );
      await conn.query(
        `UPDATE products SET stock = stock - ?, updated_by = ? WHERE id = ?`,
        [item.quantity, userId, item.product_id],
      );
      await conn.query(
        `INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, created_by)
         VALUES (?, ?, 'order_create', ?, 'order', ?)`,
        [item.product_id, -item.quantity, orderId, userId],
      );
    }

    await conn.commit();
    return { orderId };
  } catch (err) {
    await conn.rollback();
    throw err;
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
  const [statusRows] = await pool.query(
    'SELECT status FROM orders WHERE id = ? AND deleted_at IS NULL',
    [id],
  ) as any[];
  const existing = (statusRows as any[])[0];
  if (!existing) throw new AppError(404, 'Orden no encontrada');
  if (existing.status === 'completed') throw new AppError(400, 'No se puede editar una orden completada');
  if (existing.status === 'cancelled') throw new AppError(400, 'No se puede editar una orden cancelada');

  const {
    customer_id, items, promotion_id,
    delivery_address, delivery_department, delivery_province,
    delivery_district, delivery_reference,
  } = data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[orderRow]]: any = await conn.query(
      `SELECT promotion_id FROM orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    const oldPromo: number | null = orderRow?.promotion_id ?? null;

    // Restaurar stock de los items anteriores
    const [oldItems]: any = await conn.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = ?`,
      [id],
    );
    for (const old of oldItems) {
      await conn.query(
        `UPDATE products SET stock = stock + ?, updated_by = ? WHERE id = ?`,
        [old.quantity, userId, old.product_id],
      );
      await conn.query(
        `INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, notes, created_by)
         VALUES (?, ?, 'order_update', ?, 'order', 'Restauración por edición de orden', ?)`,
        [old.product_id, old.quantity, id, userId],
      );
    }

    await conn.query(`DELETE FROM order_items WHERE order_id = ?`, [id]);

    // Validar nuevos items y calcular subtotal
    const priceMap = new Map<number, number>();
    let subtotal = 0;
    for (const item of items) {
      const [prodRows]: any = await conn.query(
        `SELECT price, stock FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [item.product_id],
      );
      const prod = prodRows[0];
      if (!prod) throw new AppError(400, `Producto ${item.product_id} no encontrado`);
      if (prod.stock < item.quantity) {
        throw new AppError(400, `Stock insuficiente para el producto ${item.product_id}`);
      }
      priceMap.set(item.product_id, Number(prod.price));
      subtotal += Number(prod.price) * item.quantity;
    }

    // Promoción
    let discount = 0;
    let validPromoId: number | null = null;
    if (promotion_id) {
      const result = await applyPromotion(conn, promotion_id, subtotal);
      discount = result.discount;
      validPromoId = result.promoId;
    }

    const total = Math.max(0, subtotal - discount);

    await conn.query(
      `UPDATE orders
       SET customer_id = ?, total_amount = ?,
           delivery_address = ?, delivery_department = ?, delivery_province = ?,
           delivery_district = ?, delivery_reference = ?,
           promotion_id = ?, discount_amount = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        customer_id, total,
        delivery_address ?? null, delivery_department ?? null,
        delivery_province ?? null, delivery_district ?? null,
        delivery_reference ?? null,
        validPromoId, discount, userId, id,
      ],
    );

    // Ajustar usos de promo si cambió
    if (oldPromo !== validPromoId) {
      if (oldPromo !== null) {
        await conn.query(
          `UPDATE promotions SET current_uses = GREATEST(0, current_uses - 1) WHERE id = ?`,
          [oldPromo],
        );
      }
      if (validPromoId !== null) {
        await conn.query(
          `UPDATE promotions SET current_uses = current_uses + 1 WHERE id = ?`,
          [validPromoId],
        );
      }
    }

    // Insertar nuevos items, descontar stock
    for (const item of items) {
      const price = priceMap.get(item.product_id)!;
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, item.product_id, item.quantity, price, userId, userId],
      );
      await conn.query(
        `UPDATE products SET stock = stock - ?, updated_by = ? WHERE id = ?`,
        [item.quantity, userId, item.product_id],
      );
      await conn.query(
        `INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, created_by)
         VALUES (?, ?, 'order_update', ?, 'order', ?)`,
        [item.product_id, -item.quantity, id, userId],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ['shipped', 'completed', 'cancelled'],
  shipped:   ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function updateStatus(id: number, status: string, userId: number): Promise<void> {
  const [rows] = await pool.query(
    'SELECT status FROM orders WHERE id = ? AND deleted_at IS NULL',
    [id],
  ) as any[];
  const order = (rows as any[])[0];
  if (!order) throw new AppError(404, 'Orden no encontrada');

  const allowed = VALID_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(status)) {
    throw new AppError(400, `No se puede cambiar el estado de '${order.status}' a '${status}'`);
  }

  if (status === 'cancelled') {
    await cancel(id, userId);
    return;
  }

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
  const [rows] = await pool.query(
    'SELECT status FROM orders WHERE id = ? AND deleted_at IS NULL',
    [id],
  ) as any[];
  const order = (rows as any[])[0];
  if (!order) throw new AppError(404, 'Orden no encontrada');
  if (order.status === 'cancelled') {
    throw new AppError(400, 'No se puede registrar un pago en una orden cancelada');
  }

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

    const [[order]]: any = await conn.query(
      `SELECT status, promotion_id FROM orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    if (!order) throw new AppError(404, 'Orden no encontrada');

    if (order.status !== 'cancelled') {
      const [items]: any = await conn.query(
        `SELECT product_id, quantity FROM order_items WHERE order_id = ?`,
        [id],
      );
      for (const item of items) {
        await conn.query(
          `UPDATE products SET stock = stock + ?, updated_by = ? WHERE id = ?`,
          [item.quantity, userId, item.product_id],
        );
        await conn.query(
          `INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, created_by)
           VALUES (?, ?, 'order_cancel', ?, 'order', ?)`,
          [item.product_id, item.quantity, id, userId],
        );
      }

      if (order.promotion_id !== null) {
        await conn.query(
          `UPDATE promotions SET current_uses = GREATEST(0, current_uses - 1) WHERE id = ?`,
          [order.promotion_id],
        );
      }
    }

    await conn.query(
      `UPDATE orders SET status = 'cancelled', updated_by = ? WHERE id = ?`,
      [userId, id],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
