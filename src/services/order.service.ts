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
  try {
    const [results] = await pool.query(
      'CALL sp_order_create(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        customer_id, userId, JSON.stringify(items),
        promotion_id ?? null,
        delivery_address ?? null, delivery_department ?? null,
        delivery_province ?? null, delivery_district ?? null,
        delivery_reference ?? null,
        new_address_to_save?.save ? 1 : 0,
        new_address_to_save?.name ?? null,
        new_address_to_save?.address ?? null,
        new_address_to_save?.reference ?? null,
        new_address_to_save?.department ?? null,
        new_address_to_save?.province ?? null,
        new_address_to_save?.district ?? null,
      ],
    ) as any[];
    return { orderId: (results as any[][])[0][0].orderId };
  } catch (err: any) {
    const msg: string = err.sqlMessage || err.message || 'Error al crear la orden';
    throw new AppError(400, msg);
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
  try {
    await pool.query(
      'CALL sp_order_update(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id, customer_id, userId, JSON.stringify(items),
        promotion_id ?? null,
        delivery_address ?? null, delivery_department ?? null,
        delivery_province ?? null, delivery_district ?? null,
        delivery_reference ?? null,
      ],
    );
  } catch (err: any) {
    const msg: string = err.sqlMessage || err.message || 'Error al actualizar la orden';
    throw new AppError(msg.includes('no encontrada') ? 404 : 400, msg);
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
  try {
    await pool.query('CALL sp_order_cancel(?, ?)', [id, userId]);
  } catch (err: any) {
    const msg: string = err.sqlMessage || err.message || 'Error al cancelar la orden';
    throw new AppError(msg.includes('no encontrada') ? 404 : 400, msg);
  }
}
