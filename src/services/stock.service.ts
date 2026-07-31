import pool from '../config/db';
import { PoolConnection } from 'mysql2/promise';

// ── Helper used inside existing transactions ──────────────────

export async function recordMovement(
  conn: PoolConnection,
  productId: number,
  quantity: number,
  type: 'batch' | 'order_create' | 'order_cancel' | 'order_update',
  referenceId: number | null,
  referenceType: 'order' | 'batch' | null,
  userId: number,
  notes?: string,
): Promise<void> {
  await conn.query(
    `INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [productId, quantity, type, referenceId ?? null, referenceType ?? null, notes ?? null, userId],
  );
}

// ── Public list method ────────────────────────────────────────

export async function list(params: {
  page: number;
  limit: number;
  productId?: number;
  type?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ data: any[]; total: number; totalPages: number; page: number }> {
  const { page, limit, productId, type, startDate, endDate } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (productId) {
    conditions.push('sm.product_id = ?');
    queryParams.push(productId);
  }
  if (type && type !== 'all') {
    conditions.push('sm.type = ?');
    queryParams.push(type);
  }
  if (startDate) {
    conditions.push('DATE(sm.created_at) >= ?');
    queryParams.push(startDate);
  }
  if (endDate) {
    conditions.push('DATE(sm.created_at) <= ?');
    queryParams.push(endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [data] = await pool.query(
    `SELECT
       sm.id,
       sm.product_id,
       sm.quantity,
       sm.type,
       sm.reference_id,
       sm.reference_type,
       sm.notes,
       sm.created_at,
       sm.created_by,
       p.name  AS product_name,
       CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) AS created_by_name
     FROM stock_movements sm
     LEFT JOIN products p ON sm.product_id = p.id
     LEFT JOIN users    u ON sm.created_by  = u.id
     ${where}
     ORDER BY sm.created_at DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset],
  ) as any[];

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM stock_movements sm ${where}`,
    queryParams,
  ) as any[];

  const total = countRows[0].total;
  return { data, total, totalPages: Math.ceil(total / limit), page };
}
