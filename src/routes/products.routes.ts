import { Router, Request, Response } from 'express';
import pool from '../config/db';
import { requireRole } from '../middlewares/auth';

const router = Router();

// GET /api/products
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
router.post('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { name, description, price, cost, stock, category, image_url, weight_grams } = req.body;
  const userId = req.user!.id;

  if (!name || price == null || cost == null) {
    res.status(400).json({ message: 'Nombre, precio y costo son requeridos' });
    return;
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO products
         (name, description, price, cost, weight_grams, stock, category, image_url, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description ?? null, price, cost, weight_grams ?? null,
       stock ?? 0, category ?? null, image_url ?? null, userId, userId]
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

// POST /api/products/batches/new-product
router.post('/batches/new-product', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const {
    name, category,
    batch_yield_grams, unit_weight_grams,
    price_per_unit,
    ingredients_detail, operations_detail, notes
  } = req.body;

  if (!name || !price_per_unit) {
    res.status(400).json({ message: 'Nombre y precio son requeridos' });
    return;
  }

  // H4: recalcular costos en el backend, ignorar valores del cliente
  const computed = computeBatchCosts(
    ingredients_detail, operations_detail,
    batch_yield_grams, unit_weight_grams, price_per_unit
  );

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Crear producto
    const [productResult] = await conn.query(
      `INSERT INTO products
         (name, description, price, cost, weight_grams, stock, category, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        `Manteca artesanal ${unit_weight_grams}g`,
        price_per_unit, computed.costPerUnit,
        unit_weight_grams, computed.unitsProduced,
        category ?? null, userId, userId
      ]
    ) as any[];

    const productId = productResult.insertId;

    // 2. Crear lote inicial
    const [batchResult] = await conn.query(
      `INSERT INTO production_batches
         (product_id, batch_yield_grams, unit_weight_grams, units_produced,
          total_ingredients_cost, total_operations_cost, total_batch_cost,
          cost_per_unit, price_per_unit, margin_percent, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, batch_yield_grams, unit_weight_grams, computed.unitsProduced,
        computed.totalIngredientsCost, computed.totalOperationsCost, computed.totalBatchCost,
        computed.costPerUnit, price_per_unit, computed.marginPercent,
        notes ?? null, userId
      ]
    ) as any[];

    const batchId = batchResult.insertId;

    // 3. Insertar detalles normalizados
    await insertBatchDetails(conn, batchId, ingredients_detail, operations_detail);

    await conn.commit();

    const [product] = await conn.query(
      'SELECT * FROM products WHERE id = ?', [productId]
    ) as any[];

    res.status(201).json(product[0]);
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ message: 'Error al crear producto con lote' });
  } finally {
    conn.release();
  }
});

// PUT /api/products/:id
router.put('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { name, description, price, cost, stock, category, image_url, weight_grams } = req.body;
  const userId = req.user!.id;

  try {
    await pool.query(
      `UPDATE products
       SET name = ?, description = ?, price = ?, cost = ?, weight_grams = ?,
           stock = ?, category = ?, image_url = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [name, description ?? null, price, cost, weight_grams ?? null,
       stock, category ?? null, image_url ?? null, userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar producto' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  try {
    await pool.query(
      `UPDATE products SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar producto' });
  }
});

// ── Helper: recalcula costos del lote desde los detalles ─────
function computeBatchCosts(
  ingredients: { name: string; amount: number }[],
  operations:  { name: string; amount: number }[],
  batchYieldGrams: number,
  unitWeightGrams: number,
  pricePerUnit: number,
) {
  const totalIngredientsCost = (ingredients ?? []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalOperationsCost  = (operations  ?? []).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const totalBatchCost       = totalIngredientsCost + totalOperationsCost;
  const unitsProduced        = unitWeightGrams > 0 ? Math.floor(batchYieldGrams / unitWeightGrams) : 0;
  const costPerUnit          = unitsProduced > 0 ? totalBatchCost / unitsProduced : 0;
  const marginPercent        = pricePerUnit > 0 ? ((pricePerUnit - costPerUnit) / pricePerUnit) * 100 : 0;

  return {
    totalIngredientsCost: Number(totalIngredientsCost.toFixed(2)),
    totalOperationsCost:  Number(totalOperationsCost.toFixed(2)),
    totalBatchCost:       Number(totalBatchCost.toFixed(2)),
    unitsProduced,
    costPerUnit:          Number(costPerUnit.toFixed(2)),
    marginPercent:        Number(marginPercent.toFixed(2)),
  };
}

// ── Helper: inserta ingredientes y operaciones de un lote ────
async function insertBatchDetails(
  conn: any,
  batchId: number,
  ingredients: { name: string; amount: number }[],
  operations: { name: string; amount: number }[]
) {
  if (ingredients?.length > 0) {
    const ingValues = ingredients.map(i => [batchId, i.name || '', Number(i.amount) || 0]);
    await conn.query(
      `INSERT INTO batch_ingredients (batch_id, name, amount) VALUES ?`,
      [ingValues]
    );
  }
  if (operations?.length > 0) {
    const opValues = operations.map(o => [batchId, o.name || '', Number(o.amount) || 0]);
    await conn.query(
      `INSERT INTO batch_operations (batch_id, name, amount) VALUES ?`,
      [opValues]
    );
  }
}

// ── Helper: obtiene lote con sus detalles ────────────────────
async function getBatchWithDetails(conn: any, batchId: number) {
  const [batches] = await conn.query(
    'SELECT * FROM production_batches WHERE id = ?', [batchId]
  ) as any[];

  const [ingredients] = await conn.query(
    'SELECT * FROM batch_ingredients WHERE batch_id = ? ORDER BY id', [batchId]
  ) as any[];

  const [operations] = await conn.query(
    'SELECT * FROM batch_operations WHERE batch_id = ? ORDER BY id', [batchId]
  ) as any[];

  return {
    ...batches[0],
    ingredients_detail: ingredients,
    operations_detail: operations,
  };
}

// POST /api/products/:id/batches
router.post('/:id/batches', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const productId = Number(req.params.id);
  const userId = req.user!.id;
  const {
    batch_yield_grams, unit_weight_grams,
    price_per_unit,
    ingredients_detail, operations_detail,
    notes
  } = req.body;

  // H4: recalcular costos en el backend, ignorar valores del cliente
  const computed = computeBatchCosts(
    ingredients_detail, operations_detail,
    batch_yield_grams, unit_weight_grams, price_per_unit
  );

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Insertar lote
    const [result] = await conn.query(
      `INSERT INTO production_batches
         (product_id, batch_yield_grams, unit_weight_grams, units_produced,
          total_ingredients_cost, total_operations_cost, total_batch_cost,
          cost_per_unit, price_per_unit, margin_percent, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, batch_yield_grams, unit_weight_grams, computed.unitsProduced,
        computed.totalIngredientsCost, computed.totalOperationsCost, computed.totalBatchCost,
        computed.costPerUnit, price_per_unit, computed.marginPercent,
        notes ?? null, userId
      ]
    ) as any[];

    const batchId = result.insertId;

    // 2. Insertar detalles normalizados
    await insertBatchDetails(conn, batchId, ingredients_detail, operations_detail);

    // 3. Actualizar producto
    await conn.query(
      `UPDATE products
       SET price = ?, cost = ?, weight_grams = ?,
           stock = stock + ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [price_per_unit, computed.costPerUnit, unit_weight_grams,
       computed.unitsProduced, userId, productId]
    );

    await conn.commit();

    const batch = await getBatchWithDetails(conn, batchId);
    res.status(201).json(batch);
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ message: 'Error al registrar lote' });
  } finally {
    conn.release();
  }
});

// GET /api/products/:id/batches
router.get('/:id/batches', async (req: Request, res: Response): Promise<void> => {
  try {
    const [batches] = await pool.query(
      `SELECT pb.*, u.name as created_by_name
       FROM production_batches pb
       LEFT JOIN users u ON pb.created_by = u.id
       WHERE pb.product_id = ?
       ORDER BY pb.created_at DESC`,
      [req.params.id]
    ) as any[];

    // Enriquecer cada lote con sus detalles
    const enriched = await Promise.all(
      batches.map(async (batch: any) => {
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
          operations_detail: operations,
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener historial de lotes' });
  }
});



export default router;