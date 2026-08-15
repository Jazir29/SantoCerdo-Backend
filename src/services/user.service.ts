import pool from '../config/db';
import bcrypt from 'bcryptjs';
import { AppError } from './errors';

export async function getAll(): Promise<any[]> {
  const [rows] = await pool.query(
    'SELECT id, username, first_name, last_name, second_last_name, role FROM users WHERE deleted_at IS NULL ORDER BY id ASC',
  ) as any[];
  return rows;
}

export async function create(
  data: {
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    second_last_name?: string;
    role: string;
  },
  createdBy: number,
): Promise<any> {
  const { username, password, first_name, last_name, second_last_name, role } = data;

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL',
    [username],
  ) as any[];
  if ((existing as any[]).length > 0) throw new AppError(409, 'El nombre de usuario ya existe');

  const hashed = await bcrypt.hash(password, 10);

  const [result] = await pool.query(
    'INSERT INTO users (username, password, first_name, last_name, second_last_name, role, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [username, hashed, first_name, last_name, second_last_name || null, role, createdBy],
  ) as any[];

  return { id: (result as any).insertId, username, first_name, last_name, second_last_name: second_last_name || null, role };
}

export async function update(
  id: number,
  data: {
    username: string;
    first_name: string;
    last_name: string;
    second_last_name?: string;
    role: string;
    password?: string;
  },
  updatedBy: number,
): Promise<any> {
  const { username, first_name, last_name, second_last_name, role, password } = data;

  if (password) {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET username=?, first_name=?, last_name=?, second_last_name=?, role=?, password=?, updated_by=? WHERE id=?',
      [username, first_name, last_name, second_last_name || null, role, hashed, updatedBy, id],
    );
  } else {
    await pool.query(
      'UPDATE users SET username=?, first_name=?, last_name=?, second_last_name=?, role=?, updated_by=? WHERE id=?',
      [username, first_name, last_name, second_last_name || null, role, updatedBy, id],
    );
  }

  return { id, username, first_name, last_name, second_last_name: second_last_name || null, role };
}

export async function updateProfile(
  id: number,
  data: {
    username?: string;
    first_name?: string;
    last_name?: string;
    second_last_name?: string;
    currentPassword?: string;
    newPassword?: string;
  },
  updatedBy: number,
): Promise<any> {
  const { username, first_name, last_name, second_last_name, currentPassword, newPassword } = data;

  const [rows] = await pool.query(
    'SELECT password FROM users WHERE id = ? AND deleted_at IS NULL',
    [id],
  ) as any[];

  if (!(rows as any[])[0]) throw new AppError(404, 'Usuario no encontrado');

  if (newPassword) {
    if (!currentPassword) throw new AppError(400, 'Debes ingresar tu contraseña actual');
    const isValid = await bcrypt.compare(currentPassword, (rows as any[])[0].password);
    if (!isValid) throw new AppError(401, 'Contraseña actual incorrecta');
  }

  if (newPassword) {
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET username=?, first_name=?, last_name=?, second_last_name=?, password=?, updated_by=? WHERE id=?',
      [username, first_name, last_name, second_last_name || null, hashed, updatedBy, id],
    );
  } else {
    await pool.query(
      'UPDATE users SET username=?, first_name=?, last_name=?, second_last_name=?, updated_by=? WHERE id=?',
      [username, first_name, last_name, second_last_name || null, updatedBy, id],
    );
  }

  return { id, username, first_name, last_name, second_last_name: second_last_name || null };
}

export async function remove(id: number, deletedBy: number): Promise<void> {
  if (id === deletedBy) throw new AppError(400, 'No puedes eliminar tu propio usuario');

  await pool.query(
    'UPDATE users SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
    [deletedBy, id],
  );
}
