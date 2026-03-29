import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

// GET /api/batches?page=1&limit=10&search=
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page   = Math.max(Number(req.query.page) || 1, 1);
  const limit  = Math.min(Number(req.query.limit) || 10, 100);
  const offset = (page - 1) * limit;
  const search = `%${req.query.search || ''}%`;

  try {
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
      [search, limit, offset]
    ) as any[];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total
       FROM production_batches pb
       JOIN products p ON pb.product_id = p.id
       WHERE p.name LIKE ?`,
      [search]
    ) as any[];

    // Enriquecer con ingredientes y operaciones
    const enriched = await Promise.all(
      rows.map(async (batch: any) => {
        const [ingredients] = await pool.query(
          'SELECT * FROM batch_ingredients WHERE batch_id = ? ORDER BY id',
          [batch.id]
        ) as any[];

        const [operations] = await pool.query(
          'SELECT * FROM batch_operations WHERE batch_id = ? ORDER BY id',
          [batch.id]
        ) as any[];

        return {
          ...batch,
          ingredients_detail: ingredients,
          operations_detail:  operations,
        };
      })
    );

    const total = countRows[0].total;
    res.json({
      data:       enriched,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener registros de producción' });
  }
});

export default router;