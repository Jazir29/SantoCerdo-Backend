import pool from '../config/db';
import { AppError } from './errors';

export async function listByCategory(category: string): Promise<{ code: string; name: string }[]> {
  const [rows] = await pool.query(
    'SELECT code, name FROM catalogs WHERE category = ? AND active = 1 ORDER BY sort_order ASC, id ASC',
    [category],
  ) as any[];
  return rows;
}

export async function listCategories(): Promise<string[]> {
  const [rows] = await pool.query(
    'SELECT DISTINCT category FROM catalogs WHERE active = 1 ORDER BY category ASC',
  ) as any[];
  return (rows as any[]).map((r: any) => r.category);
}

export async function upsert(
  category: string,
  code: string,
  data: { name: string; sort_order?: number; active?: number },
): Promise<void> {
  await pool.query(
    `INSERT INTO catalogs (category, code, name, sort_order, active)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order), active = VALUES(active)`,
    [category, code, data.name, data.sort_order ?? 0, data.active ?? 1],
  );
}

export async function toggleActive(category: string, code: string): Promise<void> {
  const [result] = await pool.query(
    'UPDATE catalogs SET active = NOT active WHERE category = ? AND code = ?',
    [category, code],
  ) as any[];
  if ((result as any).affectedRows === 0) throw new AppError(404, 'Catálogo no encontrado');
}
