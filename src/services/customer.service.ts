import pool from '../config/db';
import { AppError } from './errors';

export async function list(params: {
  page: number;
  limit: number;
  search: string;
  type?: string;
  department?: string;
  province?: string;
  district?: string;
}): Promise<{ data: any[]; total: number; totalPages: number; page: number }> {
  const { page, limit, search, type, department, province, district } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = [
    'c.deleted_at IS NULL',
    `(c.name LIKE ? OR c.last_name LIKE ? OR c.trade_name LIKE ? OR c.document_id LIKE ?
      OR EXISTS (
        SELECT 1 FROM customer_addresses ca
        WHERE ca.customer_id = c.id AND ca.deleted_at IS NULL
          AND (ca.address LIKE ? OR ca.district LIKE ? OR ca.department LIKE ?)
      ))`,
  ];
  const queryParams: any[] = [search, search, search, search, search, search, search];

  if (type && type !== 'all') {
    conditions.push('c.type = ?');
    queryParams.push(type);
  }
  if (department && department !== 'all') {
    conditions.push('EXISTS (SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.department = ? AND ca.deleted_at IS NULL)');
    queryParams.push(department);
  }
  if (province && province !== 'all') {
    conditions.push('EXISTS (SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.province = ? AND ca.deleted_at IS NULL)');
    queryParams.push(province);
  }
  if (district && district !== 'all') {
    conditions.push('EXISTS (SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.district = ? AND ca.deleted_at IS NULL)');
    queryParams.push(district);
  }

  const where = conditions.join(' AND ');

  const [items] = await pool.query(
    `SELECT c.*,
            fa.address    AS primary_address,
            fa.department AS primary_department,
            fa.province   AS primary_province,
            fa.district   AS primary_district,
            fa.reference  AS primary_reference
     FROM customers c
     LEFT JOIN customer_addresses fa ON (
       fa.customer_id = c.id AND fa.deleted_at IS NULL
       AND fa.id = (
         SELECT id FROM customer_addresses
         WHERE customer_id = c.id AND deleted_at IS NULL
         ORDER BY is_favorite DESC, id ASC
         LIMIT 1
       )
     )
     WHERE ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset],
  ) as any[];

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM customers c WHERE ${where}`,
    queryParams,
  ) as any[];

  const total = countRows[0].total;
  return { data: items, total, totalPages: Math.ceil(total / limit), page };
}

export async function create(
  data: {
    type?: string;
    document_id?: string;
    name: string;
    last_name?: string;
    trade_name?: string;
    email?: string;
    phone?: string;
  },
  userId: number,
): Promise<any> {
  const { type, document_id, name, last_name, trade_name, email, phone } = data;

  const [result] = await pool.query(
    `INSERT INTO customers (type, document_id, name, last_name, trade_name, email, phone, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [type || 'natural', document_id ?? null, name, last_name ?? null, trade_name ?? null, email ?? null, phone ?? null, userId, userId],
  ) as any[];

  const [rows] = await pool.query('SELECT * FROM customers WHERE id = ?', [result.insertId]) as any[];
  return rows[0];
}

export async function update(
  id: number,
  data: {
    type?: string;
    document_id?: string;
    name: string;
    last_name?: string;
    trade_name?: string;
    email?: string;
    phone?: string;
  },
  userId: number,
): Promise<void> {
  const { type, document_id, name, last_name, trade_name, email, phone } = data;

  await pool.query(
    `UPDATE customers SET type = ?, document_id = ?, name = ?, last_name = ?, trade_name = ?, email = ?, phone = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [type || 'natural', document_id ?? null, name, last_name ?? null, trade_name ?? null, email ?? null, phone ?? null, userId, id],
  );
}

export async function remove(id: number, userId: number): Promise<void> {
  await pool.query(
    `UPDATE customers SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [userId, id],
  );
}

export async function getAddresses(customerId: number): Promise<any[]> {
  const [rows] = await pool.query(
    `SELECT * FROM customer_addresses WHERE customer_id = ? AND deleted_at IS NULL ORDER BY is_favorite DESC, id ASC`,
    [customerId],
  ) as any[];
  return rows;
}

export async function createAddress(
  customerId: number,
  data: {
    name?: string;
    address: string;
    reference?: string;
    department?: string;
    province?: string;
    district?: string;
  },
  userId: number,
): Promise<any> {
  const { name, address, reference, department, province, district } = data;

  const [result] = await pool.query(
    `INSERT INTO customer_addresses (customer_id, name, address, reference, department, province, district, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, name ?? null, address, reference ?? null, department ?? null, province ?? null, district ?? null, userId, userId],
  ) as any[];

  const [rows] = await pool.query('SELECT * FROM customer_addresses WHERE id = ?', [result.insertId]) as any[];
  return rows[0];
}

export async function updateAddress(
  customerId: number,
  addressId: number,
  data: {
    name?: string;
    address: string;
    reference?: string;
    department?: string;
    province?: string;
    district?: string;
  },
  userId: number,
): Promise<void> {
  const { name, address, reference, department, province, district } = data;

  await pool.query(
    `UPDATE customer_addresses SET name = ?, address = ?, reference = ?, department = ?, province = ?, district = ?, updated_by = ? WHERE id = ? AND customer_id = ? AND deleted_at IS NULL`,
    [name ?? null, address, reference ?? null, department ?? null, province ?? null, district ?? null, userId, addressId, customerId],
  );
}

export async function deleteAddress(customerId: number, addressId: number, userId: number): Promise<void> {
  await pool.query(
    `UPDATE customer_addresses SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND customer_id = ? AND deleted_at IS NULL`,
    [userId, addressId, customerId],
  );
}

export async function updateFavoriteAddress(
  customerId: number,
  addressId: number | null,
  userId: number,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE customer_addresses SET is_favorite = 0, updated_by = ? WHERE customer_id = ? AND deleted_at IS NULL',
      [userId, customerId],
    );
    if (addressId) {
      await conn.query(
        'UPDATE customer_addresses SET is_favorite = 1, updated_by = ? WHERE id = ? AND customer_id = ?',
        [userId, addressId, customerId],
      );
    }
    await conn.query(
      'UPDATE customers SET favorite_address_id = ?, updated_by = ? WHERE id = ?',
      [addressId || null, userId, customerId],
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
