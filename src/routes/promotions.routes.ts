import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// GET /api/promotions?page=1&limit=10&search=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page   = Number(req.query.page)  || 1;
  const limit  = Number(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = `%${req.query.search || ''}%`;

  try {
    const [data] = await pool.query(
      `SELECT * FROM promotions
       WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ?)
       ORDER BY id DESC LIMIT ? OFFSET ?`,
      [search, search, limit, offset]
    ) as any[];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM promotions
       WHERE deleted_at IS NULL AND (name LIKE ? OR code LIKE ?)`,
      [search, search]
    ) as any[];

    const total = countRows[0].total;
    res.json({ data, total, totalPages: Math.ceil(total / limit), page });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener promociones' });
  }
});

// GET /api/promotions/validate/:code  — debe ir ANTES de /:id
router.get('/validate/:code', async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM promotions
       WHERE code = ? AND active = 1 AND deleted_at IS NULL
         AND (start_date IS NULL OR start_date <= NOW())
         AND (end_date   IS NULL OR end_date   >= NOW())`,
      [req.params.code]
    ) as any[];

    rows[0]
      ? res.json({ valid: true, promotion: rows[0] })
      : res.json({ valid: false, message: 'Cupón inválido o expirado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al validar promoción' });
  }
});

// POST /api/promotions
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { name, code, type, value, start_date, end_date, active } = req.body;
  const userId = req.user!.id;

  if (!name || !code || !type || value == null) {
    res.status(400).json({ message: 'Nombre, código, tipo y valor son requeridos' });
    return;
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO promotions
         (name, code, type, value, start_date, end_date, active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, code.toUpperCase(), type, value,
       start_date || null, end_date || null, active ? 1 : 0, userId, userId]
    ) as any[];

    const [rows] = await pool.query(
      'SELECT * FROM promotions WHERE id = ?', [result.insertId]
    ) as any[];

    res.status(201).json(rows[0]);
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'El código de promoción ya existe' });
    } else {
      console.error(error);
      res.status(500).json({ message: 'Error al crear promoción' });
    }
  }
});

// PUT /api/promotions/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { name, code, type, value, start_date, end_date, active } = req.body;
  const userId = req.user!.id;

  try {
    await pool.query(
      `UPDATE promotions
       SET name = ?, code = ?, type = ?, value = ?,
           start_date = ?, end_date = ?, active = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [name, code.toUpperCase(), type, value,
       start_date || null, end_date || null, active ? 1 : 0, userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'El código de promoción ya existe' });
    } else {
      console.error(error);
      res.status(500).json({ message: 'Error al actualizar promoción' });
    }
  }
});

// DELETE /api/promotions/:id  — borrado lógico
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  try {
    await pool.query(
      `UPDATE promotions SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar promoción' });
  }
});

export default router;
