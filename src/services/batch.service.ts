import pool from '../config/db';

export async function list(params: {
  page: number;
  limit: number;
  search: string;
}): Promise<{ data: any[]; total: number; page: number; totalPages: number }> {
  const { page, limit, search } = params;
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(
    `SELECT
       pb.*,
       p.name  AS product_name,
       p.weight_grams AS product_weight_grams,
       u.name  AS created_by_name
     FROM production_batches pb
     JOIN products p ON pb.product_id = p.id
     LEFT JOIN users u ON pb.created_by = u.id
     WHERE p.name LIKE ?
     ORDER BY pb.created_at DESC
     LIMIT ? OFFSET ?`,
    [search, limit, offset],
  ) as any[];

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM production_batches pb JOIN products p ON pb.product_id = p.id WHERE p.name LIKE ?`,
    [search],
  ) as any[];

  const enriched = await Promise.all(
    rows.map(async (batch: any) => {
      const [ingredients] = await pool.query(
        'SELECT * FROM batch_ingredients WHERE batch_id = ? ORDER BY id',
        [batch.id],
      ) as any[];

      const [operations] = await pool.query(
        'SELECT * FROM batch_operations WHERE batch_id = ? ORDER BY id',
        [batch.id],
      ) as any[];

      return { ...batch, ingredients_detail: ingredients, operations_detail: operations };
    }),
  );

  const total = countRows[0].total;
  return { data: enriched, total, page, totalPages: Math.ceil(total / limit) };
}
