import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// GET /api/customers
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const limit  = Math.min(Number(req.query.limit) || 10, 1000);
  const offset = Number(req.query.offset) || 0;
  const search = `%${req.query.search || ''}%`;
  const type   = req.query.type as string | undefined;

  // Filtros de dirección ahora van contra customer_addresses
  const department = req.query.department as string | undefined;
  const province   = req.query.province   as string | undefined;
  const district   = req.query.district   as string | undefined;

  const conditions: string[] = [
    'c.deleted_at IS NULL',
    `(c.name LIKE ? OR c.last_name LIKE ? OR c.trade_name LIKE ? OR c.document_id LIKE ?
      OR EXISTS (
        SELECT 1 FROM customer_addresses ca
        WHERE ca.customer_id = c.id AND ca.deleted_at IS NULL
          AND (ca.address LIKE ? OR ca.district LIKE ? OR ca.department LIKE ?)
      ))`,
  ];
  const params: any[] = [search, search, search, search, search, search, search];

  if (type       && type       !== 'all') { conditions.push('c.type = ?'); params.push(type); }
  if (department && department !== 'all') {
    conditions.push('EXISTS (SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.department = ? AND ca.deleted_at IS NULL)');
    params.push(department);
  }
  if (province && province !== 'all') {
    conditions.push('EXISTS (SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.province = ? AND ca.deleted_at IS NULL)');
    params.push(province);
  }
  if (district && district !== 'all') {
    conditions.push('EXISTS (SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id AND ca.district = ? AND ca.deleted_at IS NULL)');
    params.push(district);
  }

  const where = conditions.join(' AND ');

  try {
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
      [...params, limit, offset]
    ) as any[];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM customers c WHERE ${where}`,
      params
    ) as any[];

    res.json({ items, total: countRows[0].total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener clientes' });
  }
});

// POST /api/customers
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { type, document_id, name, last_name, trade_name, email, phone } = req.body;
  const userId = req.user!.id;

  if (!name) { res.status(400).json({ message: 'El nombre es requerido' }); return; }

  try {
    const [result] = await pool.query(
      `INSERT INTO customers
         (type, document_id, name, last_name, trade_name, email, phone, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type || 'natural', document_id ?? null, name, last_name ?? null,
       trade_name ?? null, email ?? null, phone ?? null, userId, userId]
    ) as any[];

    const [rows] = await pool.query(
      'SELECT * FROM customers WHERE id = ?', [result.insertId]
    ) as any[];

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear cliente' });
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { type, document_id, name, last_name, trade_name, email, phone } = req.body;
  const userId = req.user!.id;

  try {
    await pool.query(
      `UPDATE customers
       SET type = ?, document_id = ?, name = ?, last_name = ?, trade_name = ?,
           email = ?, phone = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [type || 'natural', document_id ?? null, name, last_name ?? null,
       trade_name ?? null, email ?? null, phone ?? null, userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar cliente' });
  }
});

// PUT /api/customers/:id/favorite-address
router.put('/:id/favorite-address', async (req: Request, res: Response): Promise<void> => {
  const { addressId } = req.body;
  const customerId = req.params.id;
  const userId = req.user!.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE customer_addresses SET is_favorite = 0, updated_by = ? WHERE customer_id = ? AND deleted_at IS NULL',
      [userId, customerId]
    );
    if (addressId) {
      await conn.query(
        'UPDATE customer_addresses SET is_favorite = 1, updated_by = ? WHERE id = ? AND customer_id = ?',
        [userId, addressId, customerId]
      );
    }
    await conn.query(
      'UPDATE customers SET favorite_address_id = ?, updated_by = ? WHERE id = ?',
      [addressId || null, userId, customerId]
    );
    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar dirección favorita' });
  } finally {
    conn.release();
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  try {
    await pool.query(
      `UPDATE customers SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL`,
      [userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar cliente' });
  }
});

// ── Direcciones ──────────────────────────────────────────────

// GET /api/customers/:id/addresses
router.get('/:id/addresses', async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM customer_addresses
       WHERE customer_id = ? AND deleted_at IS NULL
       ORDER BY is_favorite DESC, id ASC`,
      [req.params.id]
    ) as any[];
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener direcciones' });
  }
});

// POST /api/customers/:id/addresses
router.post('/:id/addresses', async (req: Request, res: Response): Promise<void> => {
  const { name, address, reference, department, province, district } = req.body;
  const userId = req.user!.id;

  if (!address) { res.status(400).json({ message: 'La dirección es requerida' }); return; }

  try {
    const [result] = await pool.query(
      `INSERT INTO customer_addresses
         (customer_id, name, address, reference, department, province, district, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, name ?? null, address, reference ?? null,
       department ?? null, province ?? null, district ?? null, userId, userId]
    ) as any[];

    const [rows] = await pool.query(
      'SELECT * FROM customer_addresses WHERE id = ?', [result.insertId]
    ) as any[];

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear dirección' });
  }
});

// PUT /api/customers/:id/addresses/:addressId
router.put('/:id/addresses/:addressId', async (req: Request, res: Response): Promise<void> => {
  const { name, address, reference, department, province, district } = req.body;
  const userId = req.user!.id;

  try {
    await pool.query(
      `UPDATE customer_addresses
       SET name = ?, address = ?, reference = ?, department = ?,
           province = ?, district = ?, updated_by = ?
       WHERE id = ? AND customer_id = ? AND deleted_at IS NULL`,
      [name ?? null, address, reference ?? null, department ?? null,
       province ?? null, district ?? null, userId, req.params.addressId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar dirección' });
  }
});

// DELETE /api/customers/:id/addresses/:addressId
router.delete('/:id/addresses/:addressId', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  try {
    await pool.query(
      `UPDATE customer_addresses SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ? AND customer_id = ? AND deleted_at IS NULL`,
      [userId, req.params.addressId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar dirección' });
  }
});

export default router;