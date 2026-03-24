import { Router, Request, Response } from 'express';
import pool from '../config/db';
import { PoolConnection } from 'mysql2/promise';

const router = Router();

// ── Helper: aplicar promoción ────────────────────────────────
async function applyPromotion(
  conn: PoolConnection,
  promotionId: number | null,
  subtotal: number
): Promise<{ finalTotal: number; discountAmount: number; validPromoId: number | null }> {
  if (!promotionId) return { finalTotal: subtotal, discountAmount: 0, validPromoId: null };

  const [rows] = await conn.query(
    `SELECT * FROM promotions
     WHERE id = ? AND active = 1 AND deleted_at IS NULL
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date   IS NULL OR end_date   >= NOW())`,
    [promotionId]
  ) as any[];

  const promo = rows[0];
  if (!promo) return { finalTotal: subtotal, discountAmount: 0, validPromoId: null };

  const discount = promo.type === 'percentage'
    ? subtotal * (promo.value / 100)
    : Number(promo.value);

  return {
    finalTotal:    Math.max(0, subtotal - discount),
    discountAmount: discount,
    validPromoId:  promotionId,
  };
}

// ── GET /api/orders ──────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const limit     = Math.min(Number(req.query.limit) || 10, 200);
  const offset    = Number(req.query.offset) || 0;
  const search    = `%${req.query.search || ''}%`;
  const status    = req.query.status    as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate   = req.query.endDate   as string | undefined;

  const conditions = [
    'o.deleted_at IS NULL',
    `(c.name LIKE ? OR c.last_name LIKE ? OR c.trade_name LIKE ?
      OR CAST(o.id AS CHAR) LIKE ?)`,
  ];
  const params: any[] = [search, search, search, search];

  if (status && status !== 'all') { conditions.push('o.status = ?');              params.push(status); }
  if (startDate)                  { conditions.push('DATE(o.created_at) >= ?');   params.push(startDate); }
  if (endDate)                    { conditions.push('DATE(o.created_at) <= ?');   params.push(endDate); }

  const where = conditions.join(' AND ');

  try {
    const [items] = await pool.query(
      `SELECT o.*,
              c.name AS customer_name, c.last_name AS customer_last_name, c.trade_name,
              p.name AS promotion_name, p.code AS promotion_code
       FROM orders o
       LEFT JOIN customers  c ON o.customer_id  = c.id
       LEFT JOIN promotions p ON o.promotion_id = p.id
       WHERE ${where}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ) as any[];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE ${where}`,
      params
    ) as any[];

    res.json({ items, total: countRows[0].total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener órdenes' });
  }
});

// ── GET /api/orders/:id ──────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const [orderRows] = await pool.query(
      `SELECT o.*, o.id AS order_id,
              c.type, c.document_id, c.name AS customer_name, c.last_name, c.trade_name,
              c.email, c.phone,
              p.name AS promotion_name, p.code AS promotion_code
       FROM orders o
       LEFT JOIN customers  c ON o.customer_id  = c.id
       LEFT JOIN promotions p ON o.promotion_id = p.id
       WHERE o.id = ? AND o.deleted_at IS NULL`,
      [req.params.id]
    ) as any[];

    if (!orderRows[0]) { res.status(404).json({ message: 'Orden no encontrada' }); return; }

    const [items] = await pool.query(
      `SELECT oi.*, p.name AS product_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [req.params.id]
    ) as any[];

    res.json({ ...orderRows[0], items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener la orden' });
  }
});

// ── POST /api/orders ─────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {
    customer_id, items, promotion_id,
    delivery_address, delivery_department, delivery_province,
    delivery_district, delivery_reference, new_address_to_save,
  } = req.body;
  const userId = req.user!.id;

  if (!customer_id || !items?.length) {
    res.status(400).json({ message: 'Cliente e ítems son requeridos' });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Guardar nueva dirección si se solicitó
    if (new_address_to_save?.save) {
      const [countRows] = await conn.query(
        'SELECT COUNT(*) as count FROM customer_addresses WHERE customer_id = ? AND deleted_at IS NULL',
        [customer_id]
      ) as any[];
      const addressName = new_address_to_save.name || `Dirección ${countRows[0].count + 2}`;
      await conn.query(
        `INSERT INTO customer_addresses
           (customer_id, name, address, reference, department, province, district, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customer_id, addressName, new_address_to_save.address, new_address_to_save.reference,
         new_address_to_save.department, new_address_to_save.province, new_address_to_save.district,
         userId, userId]
      );
    }

    const subtotal: number = items.reduce(
      (acc: number, item: any) => acc + item.price * item.quantity, 0
    );
    const { finalTotal, discountAmount, validPromoId } =
      await applyPromotion(conn, promotion_id || null, subtotal);

    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (customer_id, total_amount, status, created_at,
          delivery_address, delivery_department, delivery_province,
          delivery_district, delivery_reference,
          promotion_id, discount_amount, created_by, updated_by)
       VALUES (?, ?, 'pending', NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, finalTotal,
       delivery_address, delivery_department, delivery_province,
       delivery_district, delivery_reference,
       validPromoId, discountAmount, userId, userId]
    ) as any[];

    const orderId = orderResult.insertId;

    for (const item of items) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, item.price, userId, userId]
      );
      await conn.query(
        'UPDATE products SET stock = stock - ?, updated_by = ? WHERE id = ?',
        [item.quantity, userId, item.product_id]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, orderId });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ message: 'Error al crear la orden' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/orders/:id/status ───────────────────────────────
router.put('/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body;
  const userId = req.user!.id;
  const allowed = ['pending', 'shipped', 'completed', 'cancelled'];

  if (!allowed.includes(status)) {
    res.status(400).json({ message: 'Estado inválido' });
    return;
  }

  try {
    await pool.query(
      'UPDATE orders SET status = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [status, userId, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar estado' });
  }
});

// ── PUT /api/orders/:id ──────────────────────────────────────
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const {
    customer_id, items, promotion_id,
    delivery_address, delivery_department, delivery_province,
    delivery_district, delivery_reference,
  } = req.body;
  const orderId = req.params.id;
  const userId  = req.user!.id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Restaurar stock de ítems anteriores
    const [oldItems] = await conn.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]
    ) as any[];
    for (const item of oldItems) {
      await conn.query(
        'UPDATE products SET stock = stock + ?, updated_by = ? WHERE id = ?',
        [item.quantity, userId, item.product_id]
      );
    }

    await conn.query('DELETE FROM order_items WHERE order_id = ?', [orderId]);

    const subtotal: number = items.reduce(
      (acc: number, item: any) => acc + item.price * item.quantity, 0
    );
    const { finalTotal, discountAmount, validPromoId } =
      await applyPromotion(conn, promotion_id || null, subtotal);

    await conn.query(
      `UPDATE orders
       SET customer_id = ?, total_amount = ?,
           delivery_address = ?, delivery_department = ?, delivery_province = ?,
           delivery_district = ?, delivery_reference = ?,
           promotion_id = ?, discount_amount = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [customer_id, finalTotal,
       delivery_address, delivery_department, delivery_province,
       delivery_district, delivery_reference,
       validPromoId, discountAmount, userId, orderId]
    );

    for (const item of items) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, item.price, userId, userId]
      );
      await conn.query(
        'UPDATE products SET stock = stock - ?, updated_by = ? WHERE id = ?',
        [item.quantity, userId, item.product_id]
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar la orden' });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/orders/:id  — borrado lógico + restaurar stock ──
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const conn   = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [orderRows] = await conn.query(
      'SELECT status FROM orders WHERE id = ? AND deleted_at IS NULL', [req.params.id]
    ) as any[];

    if (!orderRows[0]) { res.status(404).json({ message: 'Orden no encontrada' }); return; }

    // Restaurar stock solo si no estaba ya cancelada
    if (orderRows[0].status !== 'cancelled') {
      const [items] = await conn.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = ?', [req.params.id]
      ) as any[];
      for (const item of items) {
        await conn.query(
          'UPDATE products SET stock = stock + ?, updated_by = ? WHERE id = ?',
          [item.quantity, userId, item.product_id]
        );
      }
    }

    await conn.query(
      `UPDATE orders SET status = 'cancelled', updated_by = ?
       WHERE id = ?`,
      [userId, req.params.id]
    );

    await conn.commit();
    res.json({ success: true });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    res.status(500).json({ message: 'Error al cancelar la orden' });
  } finally {
    conn.release();
  }
});

export default router;