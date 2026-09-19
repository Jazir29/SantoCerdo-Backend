import pool from '../config/db';
import { PoolConnection } from 'mysql2/promise';
import { AppError } from './errors';
import { recordMovement } from './stock.service';

// ── Private helpers ───────────────────────────────────────────

function computeBatchCosts(
  ingredients: { name: string; amount: number }[],
  operations: { name: string; amount: number }[],
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

async function insertBatchDetails(
  conn: PoolConnection,
  batchId: number,
  ingredients: { name: string; amount: number }[],
  operations: { name: string; amount: number }[],
) {
  if (ingredients?.length > 0) {
    const ingValues = ingredients.map(i => [batchId, i.name || '', Number(i.amount) || 0]);
    await conn.query(`INSERT INTO batch_ingredients (batch_id, name, amount) VALUES ?`, [ingValues]);
  }
  if (operations?.length > 0) {
    const opValues = operations.map(o => [batchId, o.name || '', Number(o.amount) || 0]);
    await conn.query(`INSERT INTO batch_operations (batch_id, name, amount) VALUES ?`, [opValues]);
  }
}

async function getBatchWithDetails(conn: PoolConnection, batchId: number) {
  const [batches]     = await conn.query('SELECT * FROM production_batches WHERE id = ?', [batchId]) as any[];
  const [ingredients] = await conn.query('SELECT * FROM batch_ingredients WHERE batch_id = ? ORDER BY id', [batchId]) as any[];
  const [operations]  = await conn.query('SELECT * FROM batch_operations WHERE batch_id = ? ORDER BY id', [batchId]) as any[];
  return { ...batches[0], ingredients_detail: ingredients, operations_detail: operations };
}

// ── Public service methods ────────────────────────────────────

export async function list(
  page: number,
  limit: number,
  search: string,
): Promise<{ data: any[]; total: number; totalPages: number; page: number }> {
  const offset = (page - 1) * limit;

  const [data] = await pool.query(
    `SELECT * FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR description LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`,
    [search, search, limit, offset],
  ) as any[];

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR description LIKE ?)`,
    [search, search],
  ) as any[];

  const total = countRows[0].total;
  return { data, total, totalPages: Math.ceil(total / limit), page };
}

export async function create(
  data: {
    name: string;
    description?: string;
    price: number;
    cost: number;
    stock?: number;
    min_stock?: number;
    category?: string;
    image_url?: string;
    weight_grams?: number;
  },
  userId: number,
): Promise<any> {
  const { name, description, price, cost, stock, min_stock, category, image_url, weight_grams } = data;

  const [result] = await pool.query(
    `INSERT INTO products (name, description, price, cost, weight_grams, stock, min_stock, category, image_url, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, description ?? null, price, cost, weight_grams ?? null, stock ?? 0, min_stock ?? 20, category ?? null, image_url ?? null, userId, userId],
  ) as any[];

  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]) as any[];
  return rows[0];
}

export async function update(
  id: number,
  data: {
    name: string;
    description?: string;
    price: number;
    cost: number;
    stock: number;
    min_stock?: number;
    category?: string;
    image_url?: string;
    weight_grams?: number;
  },
  userId: number,
): Promise<void> {
  const { name, description, price, cost, min_stock, category, image_url, weight_grams } = data;

  await pool.query(
    `UPDATE products SET name = ?, description = ?, price = ?, cost = ?, weight_grams = ?, min_stock = ?, category = ?, image_url = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [name, description ?? null, price, cost, weight_grams ?? null, min_stock ?? 20, category ?? null, image_url ?? null, userId, id],
  );
}

export async function remove(id: number, userId: number): Promise<void> {
  await pool.query(
    `UPDATE products SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [userId, id],
  );
}

export async function createWithBatch(
  data: {
    name: string;
    description?: string | null;
    category?: string;
    batch_yield_grams: number;
    unit_weight_grams: number;
    price_per_unit: number;
    ingredients_detail: { name: string; amount: number }[];
    operations_detail: { name: string; amount: number }[];
    notes?: string;
  },
  userId: number,
): Promise<any> {
  const { name, description, category, batch_yield_grams, unit_weight_grams, price_per_unit, ingredients_detail, operations_detail, notes } = data;

  const computed = computeBatchCosts(ingredients_detail, operations_detail, batch_yield_grams, unit_weight_grams, price_per_unit);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [productResult] = await conn.query(
      `INSERT INTO products (name, description, price, cost, weight_grams, stock, category, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description ?? null, price_per_unit, computed.costPerUnit, unit_weight_grams, computed.unitsProduced, category ?? null, userId, userId],
    ) as any[];

    const productId = productResult.insertId;

    const [batchResult] = await conn.query(
      `INSERT INTO production_batches (product_id, batch_yield_grams, unit_weight_grams, units_produced, total_ingredients_cost, total_operations_cost, total_batch_cost, cost_per_unit, price_per_unit, margin_percent, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, batch_yield_grams, unit_weight_grams, computed.unitsProduced, computed.totalIngredientsCost, computed.totalOperationsCost, computed.totalBatchCost, computed.costPerUnit, price_per_unit, computed.marginPercent, notes ?? null, userId],
    ) as any[];

    const batchId = batchResult.insertId;
    await insertBatchDetails(conn, batchId, ingredients_detail, operations_detail);
    await recordMovement(conn, productId, computed.unitsProduced, 'batch', batchId, 'batch', userId, notes ?? undefined);
    await conn.commit();

    const [product] = await conn.query('SELECT * FROM products WHERE id = ?', [productId]) as any[];
    return product[0];
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function addBatch(
  productId: number,
  data: {
    batch_yield_grams: number;
    unit_weight_grams: number;
    price_per_unit: number;
    ingredients_detail: { name: string; amount: number }[];
    operations_detail: { name: string; amount: number }[];
    notes?: string;
    update_product_price?: boolean;
  },
  userId: number,
): Promise<any> {
  const { batch_yield_grams, unit_weight_grams, price_per_unit, ingredients_detail, operations_detail, notes, update_product_price } = data;

  const computed = computeBatchCosts(ingredients_detail, operations_detail, batch_yield_grams, unit_weight_grams, price_per_unit);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO production_batches (product_id, batch_yield_grams, unit_weight_grams, units_produced, total_ingredients_cost, total_operations_cost, total_batch_cost, cost_per_unit, price_per_unit, margin_percent, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, batch_yield_grams, unit_weight_grams, computed.unitsProduced, computed.totalIngredientsCost, computed.totalOperationsCost, computed.totalBatchCost, computed.costPerUnit, price_per_unit, computed.marginPercent, notes ?? null, userId],
    ) as any[];

    const batchId = result.insertId;
    await insertBatchDetails(conn, batchId, ingredients_detail, operations_detail);

    if (update_product_price) {
      await conn.query(
        `UPDATE products SET price = ?, cost = ?, weight_grams = ?, stock = stock + ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
        [price_per_unit, computed.costPerUnit, unit_weight_grams, computed.unitsProduced, userId, productId],
      );
    } else {
      await conn.query(
        `UPDATE products SET stock = stock + ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
        [computed.unitsProduced, userId, productId],
      );
    }
    await recordMovement(conn, productId, computed.unitsProduced, 'batch', batchId, 'batch', userId, notes ?? undefined);

    await conn.commit();
    const batch = await getBatchWithDetails(conn, batchId);
    return batch;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function adjustStock(
  productId: number,
  data: { quantity: number; reason: string; notes?: string | null },
  userId: number,
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT id, stock FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [productId],
    ) as any[];
    const product = (rows as any[])[0];
    if (!product) throw new AppError(404, 'Producto no encontrado');

    const newStock = product.stock + data.quantity;
    if (newStock < 0) {
      throw new AppError(400, `Stock insuficiente. Stock actual: ${product.stock}, ajuste: ${data.quantity}`);
    }

    await conn.query(
      'UPDATE products SET stock = ?, updated_by = ? WHERE id = ?',
      [newStock, userId, productId],
    );

    const notes = `${data.reason}${data.notes ? ` — ${data.notes}` : ''}`;
    await recordMovement(conn, productId, data.quantity, 'adjustment', null, null, userId, notes);

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function getBatchHistory(productId: number): Promise<any[]> {
  const [batches] = await pool.query(
    `SELECT pb.*, CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''), IF(u.second_last_name IS NOT NULL AND u.second_last_name != '', CONCAT(' ', u.second_last_name), '')) AS created_by_name
     FROM production_batches pb
     LEFT JOIN users u ON pb.created_by = u.id
     WHERE pb.product_id = ? AND pb.deleted_at IS NULL
     ORDER BY pb.created_at DESC`,
    [productId],
  ) as any[];

  if ((batches as any[]).length === 0) return [];

  const batchIds = (batches as any[]).map((b: any) => b.id);

  const [[ingredients], [operations]] = await Promise.all([
    pool.query('SELECT * FROM batch_ingredients WHERE batch_id IN (?) ORDER BY batch_id, id', [batchIds]),
    pool.query('SELECT * FROM batch_operations  WHERE batch_id IN (?) ORDER BY batch_id, id', [batchIds]),
  ]) as any[];

  const ingMap = new Map<number, any[]>();
  const opMap  = new Map<number, any[]>();
  for (const r of ingredients as any[]) { if (!ingMap.has(r.batch_id)) ingMap.set(r.batch_id, []); ingMap.get(r.batch_id)!.push(r); }
  for (const r of operations  as any[]) { if (!opMap.has(r.batch_id))  opMap.set(r.batch_id, []);  opMap.get(r.batch_id)!.push(r);  }

  return (batches as any[]).map((b: any) => ({
    ...b,
    ingredients_detail: ingMap.get(b.id) ?? [],
    operations_detail:  opMap.get(b.id)  ?? [],
  }));
}
