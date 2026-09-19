import pool from '../config/db';
import { AppError } from './errors';

export async function createReturn(
  orderId: number,
  data: { reason: string; notes?: string | null; items: { product_id: number; quantity: number }[] },
  userId: number,
): Promise<{ returnId: number }> {
  const { reason, notes, items } = data;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Validate order exists and is not cancelled/pending (can only return completed/shipped)
    const [[orderRows]]: any = await conn.query(
      `SELECT id, status FROM orders WHERE id = ? AND deleted_at IS NULL`,
      [orderId],
    );
    if (!orderRows) throw new AppError(404, 'Orden no encontrada');
    if (orderRows.status === 'cancelled') throw new AppError(400, 'No se puede registrar devolución de una orden cancelada');
    if (orderRows.status === 'pending') throw new AppError(400, 'No se puede registrar devolución de una orden pendiente');

    // Fetch original order items for validation
    const [orderItems]: any = await conn.query(
      `SELECT product_id, quantity FROM order_items WHERE order_id = ?`,
      [orderId],
    );
    const orderItemMap = new Map<number, number>(
      orderItems.map((r: any) => [r.product_id, r.quantity]),
    );

    // Fetch already-returned quantities for this order (partial returns)
    const [returnedRows]: any = await conn.query(
      `SELECT ri.product_id, SUM(ri.quantity) AS returned
       FROM order_return_items ri
       JOIN order_returns r ON ri.return_id = r.id
       WHERE r.order_id = ?
       GROUP BY ri.product_id`,
      [orderId],
    );
    const alreadyReturned = new Map<number, number>(
      returnedRows.map((r: any) => [r.product_id, Number(r.returned)]),
    );

    // Validate each item
    for (const item of items) {
      const ordered = orderItemMap.get(item.product_id);
      if (!ordered) throw new AppError(400, `El producto ${item.product_id} no pertenece a esta orden`);
      if (item.quantity <= 0) throw new AppError(400, 'La cantidad a devolver debe ser mayor a cero');
      const previouslyReturned = alreadyReturned.get(item.product_id) ?? 0;
      if (item.quantity > ordered - previouslyReturned) {
        throw new AppError(400, `La cantidad a devolver del producto ${item.product_id} excede lo disponible (máx: ${ordered - previouslyReturned})`);
      }
    }

    // Fetch prices from order_items for the return record
    const productIds = items.map(i => i.product_id);
    const [priceRows]: any = await conn.query(
      `SELECT product_id, price FROM order_items WHERE order_id = ? AND product_id IN (?)`,
      [orderId, productIds],
    );
    const priceMap = new Map<number, number>(
      priceRows.map((r: any) => [r.product_id, Number(r.price)]),
    );

    // Insert return header
    const [returnResult]: any = await conn.query(
      `INSERT INTO order_returns (order_id, reason, notes, created_by) VALUES (?, ?, ?, ?)`,
      [orderId, reason, notes ?? null, userId],
    );
    const returnId = returnResult.insertId;

    // Insert return items + restore stock + record movements
    for (const item of items) {
      const price = priceMap.get(item.product_id) ?? 0;

      await conn.query(
        `INSERT INTO order_return_items (return_id, product_id, quantity, price) VALUES (?, ?, ?, ?)`,
        [returnId, item.product_id, item.quantity, price],
      );

      await conn.query(
        `UPDATE products SET stock = stock + ? WHERE id = ?`,
        [item.quantity, item.product_id],
      );

      await conn.query(
        `INSERT INTO stock_movements (product_id, type, quantity, reason, created_by)
         VALUES (?, 'adjustment', ?, ?, ?)`,
        [item.product_id, item.quantity, `Devolución orden #${orderId} — ${reason}`, userId],
      );
    }

    await conn.commit();
    return { returnId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listByOrder(orderId: number): Promise<any[]> {
  const [returns]: any = await pool.query(
    `SELECT r.id, r.reason, r.notes, r.created_at,
            u.first_name, u.last_name
     FROM order_returns r
     LEFT JOIN users u ON r.created_by = u.id
     WHERE r.order_id = ?
     ORDER BY r.created_at DESC`,
    [orderId],
  );

  if (returns.length === 0) return [];

  const returnIds = returns.map((r: any) => r.id);
  const [items]: any = await pool.query(
    `SELECT ri.return_id, ri.product_id, ri.quantity, ri.price, p.name AS product_name
     FROM order_return_items ri
     JOIN products p ON ri.product_id = p.id
     WHERE ri.return_id IN (?)`,
    [returnIds],
  );

  const itemsByReturn = new Map<number, any[]>();
  for (const item of items) {
    if (!itemsByReturn.has(item.return_id)) itemsByReturn.set(item.return_id, []);
    itemsByReturn.get(item.return_id)!.push(item);
  }

  return returns.map((r: any) => ({
    ...r,
    items: itemsByReturn.get(r.id) ?? [],
  }));
}
