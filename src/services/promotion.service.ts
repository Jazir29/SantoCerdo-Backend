import pool from '../config/db';
import { AppError } from './errors';

export async function list(params: {
  page: number;
  limit: number;
  search: string;
}): Promise<{ data: any[]; total: number; totalPages: number; page: number }> {
  const { page, limit, search } = params;
  const offset = (page - 1) * limit;

  const [data] = await pool.query(
    `SELECT * FROM promotions WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`,
    [search, search, limit, offset],
  ) as any[];

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM promotions WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ?)`,
    [search, search],
  ) as any[];

  const total = countRows[0].total;
  return { data, total, totalPages: Math.ceil(total / limit), page };
}

export async function validateCode(
  code: string,
): Promise<{ valid: true; promotion: any } | { valid: false; message: string }> {
  const [rows] = await pool.query(
    `SELECT * FROM promotions WHERE code = ? AND active = 1 AND deleted_at IS NULL AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())`,
    [code],
  ) as any[];

  if (rows[0]) return { valid: true, promotion: rows[0] };
  return { valid: false, message: 'Cupón inválido o expirado' };
}

export async function create(
  data: {
    name: string;
    code: string;
    type: string;
    value: number;
    start_date?: string;
    end_date?: string;
    active?: boolean;
  },
  userId: number,
): Promise<any> {
  const { name, code, type, value, start_date, end_date, active } = data;

  try {
    const [result] = await pool.query(
      `INSERT INTO promotions (name, code, type, value, start_date, end_date, active, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, code.toUpperCase(), type, value, start_date || null, end_date || null, active ? 1 : 0, userId, userId],
    ) as any[];

    const [rows] = await pool.query('SELECT * FROM promotions WHERE id = ?', [result.insertId]) as any[];
    return rows[0];
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError(409, 'El código de promoción ya existe');
    throw error;
  }
}

export async function update(
  id: number,
  data: {
    name: string;
    code: string;
    type: string;
    value: number;
    start_date?: string;
    end_date?: string;
    active?: boolean;
  },
  userId: number,
): Promise<void> {
  const { name, code, type, value, start_date, end_date, active } = data;

  try {
    await pool.query(
      `UPDATE promotions SET name = ?, code = ?, type = ?, value = ?, start_date = ?, end_date = ?, active = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
      [name, code.toUpperCase(), type, value, start_date || null, end_date || null, active ? 1 : 0, userId, id],
    );
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError(409, 'El código de promoción ya existe');
    throw error;
  }
}

export async function remove(id: number, userId: number): Promise<void> {
  await pool.query(
    `UPDATE promotions SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [userId, id],
  );
}
