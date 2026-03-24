import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// GET /api/products?limit=10&offset=0&search=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const limit  = Math.min(Number(req.query.limit) || 10, 1000);
  const offset = Number(req.query.offset) || 0;
  const search = `%${req.query.search || ''}%`;

  try {
    const [items] = await pool.query(
      `SELECT * FROM products
       WHERE deleted_at IS NULL
         AND (name LIKE ? OR description LIKE ?)
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [search, search, limit, offset]
    ) as any[];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM products
       WHERE deleted_at IS NULL
         AND (name LIKE ? OR description LIKE ?)`,
      [search, search]
    ) as any[];

    res.json({ items, total: countRows[0].total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos' });
  }
});

// POST /api/products
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { name, description, price, cost, stock, category, image_url } = req.body;
  const userId = req.user!.id;

  if (!name || price == null || cost == null) {
    res.status(400).json({ message: 'Nombre, precio y costo son requeridos' });
    return;
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO products
         (name, description, price, cost, stock, category, image_url, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description ?? null, price, cost, stock ?? 0,
       category ?? null, image_url ?? null, userId, userId]
    ) as any[];

    const [rows] = await pool.query(
      'SELECT * FROM products WHERE id = ?', [result.insertId]
    ) as any[];

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear producto' });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { name, description, price, cost, stock, category, image_url } = req.body;
  const userId = req.user!.id;

  try {
    await pool.query(
      `UPDATE products
       SET name = ?, description = ?, price = ?, cost = ?, stock = ?,
           category = ?, image_url = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [name, description ?? null, price, cost, stock,
       category ?? null, image_url ?? null, userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar producto' });
  }
});

// DELETE /api/products/:id  — borrado lógico
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  try {
    await pool.query(
      `UPDATE products
       SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar producto' });
  }
});

export default router;
