import pool from '../config/db';

export async function list(params: {
  page: number;
  limit: number;
  search: string;
}): Promise<{ data: any[]; total: number; page: number; totalPages: number }> {
  const { page, limit, search } = params;
  const offset = (page - 1) * limit;

  const [[rows], [countRows]] = await Promise.all([
    pool.query(
      `SELECT
         pb.*,
         p.name  AS product_name,
         p.weight_grams AS product_weight_grams,
         CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''), IF(u.second_last_name IS NOT NULL AND u.second_last_name != '', CONCAT(' ', u.second_last_name), '')) AS created_by_name
       FROM production_batches pb
       JOIN products p ON pb.product_id = p.id
       LEFT JOIN users u ON pb.created_by = u.id
       WHERE pb.deleted_at IS NULL AND p.name LIKE ?
       ORDER BY pb.created_at DESC
       LIMIT ? OFFSET ?`,
      [search, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*) as total FROM production_batches pb JOIN products p ON pb.product_id = p.id WHERE pb.deleted_at IS NULL AND p.name LIKE ?`,
      [search],
    ),
  ]) as any[];

  const total = countRows[0].total;

  if ((rows as any[]).length === 0) {
    return { data: [], total, page, totalPages: Math.ceil(total / limit) };
  }

  const batchIds = (rows as any[]).map((b: any) => b.id);

  const [[ingredients], [operations]] = await Promise.all([
    pool.query('SELECT * FROM batch_ingredients WHERE batch_id IN (?) ORDER BY batch_id, id', [batchIds]),
    pool.query('SELECT * FROM batch_operations  WHERE batch_id IN (?) ORDER BY batch_id, id', [batchIds]),
  ]) as any[];

  const ingMap = new Map<number, any[]>();
  const opMap  = new Map<number, any[]>();
  for (const r of ingredients as any[]) { if (!ingMap.has(r.batch_id)) ingMap.set(r.batch_id, []); ingMap.get(r.batch_id)!.push(r); }
  for (const r of operations  as any[]) { if (!opMap.has(r.batch_id))  opMap.set(r.batch_id, []);  opMap.get(r.batch_id)!.push(r);  }

  const data = (rows as any[]).map((b: any) => ({
    ...b,
    ingredients_detail: ingMap.get(b.id) ?? [],
    operations_detail:  opMap.get(b.id)  ?? [],
  }));

  return { data, total, page, totalPages: Math.ceil(total / limit) };
}
