import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

interface Filter { sql: string; params: any[] }

function buildDateFilter(range: string, startDate?: string, endDate?: string): Filter {
  if (startDate && endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return { sql: '', params: [] };
    }
    return { sql: 'AND DATE(o.created_at) BETWEEN ? AND ?', params: [startDate, endDate] };
  }
  const presets: Record<string, Filter> = {
    today:     { sql: 'AND DATE(o.created_at) = CURDATE()', params: [] },
    '7days':   { sql: 'AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)', params: [] },
    '30days':  { sql: 'AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)', params: [] },
    '90days':  { sql: 'AND o.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)', params: [] },
    thisMonth: { sql: "AND DATE_FORMAT(o.created_at,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')", params: [] },
    thisYear:  { sql: 'AND YEAR(o.created_at) = YEAR(NOW())', params: [] },
    all:       { sql: '', params: [] },
  };
  return presets[range] ?? presets['30days'];
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const range        = req.query.range        as string || '30days';
  const status       = req.query.status       as string || 'all';
  const customerType = req.query.customerType as string || 'all';
  const startDate    = req.query.startDate    as string | undefined;
  const endDate      = req.query.endDate      as string | undefined;

  const allowedStatus = ['pending', 'shipped', 'completed', 'cancelled', 'all'];
  const allowedType   = ['natural', 'empresa', 'all'];
  const safeStatus    = allowedStatus.includes(status) ? status : 'all';
  const safeType      = allowedType.includes(customerType) ? customerType : 'all';

  const dateFilt: Filter = buildDateFilter(range, startDate, endDate);

  const statusFilt: Filter = safeStatus !== 'all'
    ? { sql: 'AND o.status = ?', params: [safeStatus] }
    : { sql: '', params: [] };

  const revStatusFilt: Filter = safeStatus !== 'all'
    ? { sql: 'AND o.status = ?', params: [safeStatus] }
    : { sql: "AND o.status != 'cancelled'", params: [] };

  const typeFilt: Filter = safeType !== 'all'
    ? { sql: 'AND c.type = ?', params: [safeType] }
    : { sql: '', params: [] };

  const base = 'FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.deleted_at IS NULL';

  const allP = [...dateFilt.params, ...statusFilt.params,    ...typeFilt.params];
  const revP = [...dateFilt.params, ...revStatusFilt.params, ...typeFilt.params];

  const allWhere = `${base} ${dateFilt.sql} ${statusFilt.sql}    ${typeFilt.sql}`;
  const revWhere = `${base} ${dateFilt.sql} ${revStatusFilt.sql} ${typeFilt.sql}`;

  try {
    const [[revRow]]      = await pool.query(`SELECT SUM(o.total_amount)   as total ${revWhere}`, revP) as any[];
    const [[discRow]]     = await pool.query(`SELECT SUM(o.discount_amount) as total ${revWhere}`, revP) as any[];
    const [[ordRow]]      = await pool.query(`SELECT COUNT(*) as count ${allWhere}`, allP) as any[];
    const [[custRow]]     = await pool.query(`SELECT COUNT(DISTINCT o.customer_id) as count ${allWhere}`, allP) as any[];
    const [[avgRow]]      = await pool.query(`SELECT AVG(o.total_amount) as avg ${revWhere}`, revP) as any[];
    const [[lowStockRow]] = await pool.query(
      'SELECT COUNT(*) as count FROM products WHERE stock <= 20 AND deleted_at IS NULL'
    ) as any[];

    const [topProductRows] = await pool.query(`
      SELECT p.name,
             SUM(oi.quantity) as total_sold,
             SUM(
               oi.quantity * oi.price *
               CASE
                 WHEN (o.total_amount + o.discount_amount) > 0
                 THEN o.total_amount / (o.total_amount + o.discount_amount)
                 ELSE 1
               END
             ) as total_revenue
      FROM order_items oi
      JOIN products p  ON oi.product_id = p.id
      JOIN orders o    ON oi.order_id   = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL
        ${dateFilt.sql} ${revStatusFilt.sql} ${typeFilt.sql}
      GROUP BY p.id ORDER BY total_sold DESC LIMIT 1
    `, revP) as any[];

    const [recentOrders] = await pool.query(`
      SELECT o.id, c.name as customer_name, o.total_amount, o.status, o.created_at
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilt.sql} ${statusFilt.sql} ${typeFilt.sql}
      ORDER BY o.created_at DESC LIMIT 5
    `, allP) as any[];

    const [salesData] = await pool.query(`
      SELECT DATE(o.created_at) as date,
             SUM(o.total_amount) as amount,
             COUNT(o.id) as orderCount
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilt.sql} ${revStatusFilt.sql} ${typeFilt.sql}
      GROUP BY DATE(o.created_at) ORDER BY date ASC
    `, revP) as any[];

    const [salesByCustomerType] = await pool.query(`
      SELECT c.type as name, SUM(o.total_amount) as value
      FROM orders o JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilt.sql} ${revStatusFilt.sql}
      GROUP BY c.type
    `, [...dateFilt.params, ...revStatusFilt.params]) as any[];

    const [revenueVsCost] = await pool.query(`
      SELECT DATE(o.created_at) as date,
             SUM(oi.price * oi.quantity) as revenue,
             SUM(p.cost  * oi.quantity)  as cost
      FROM orders o
      JOIN order_items oi ON o.id  = oi.order_id
      JOIN products p     ON oi.product_id = p.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilt.sql} ${revStatusFilt.sql} ${typeFilt.sql}
      GROUP BY DATE(o.created_at) ORDER BY date ASC
    `, revP) as any[];

    const [topCustomers] = await pool.query(`
      SELECT COALESCE(c.trade_name, CONCAT(c.name,' ',COALESCE(c.last_name,''))) as name,
             SUM(o.total_amount) as value
      FROM orders o JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilt.sql} ${revStatusFilt.sql} ${typeFilt.sql}
      GROUP BY c.id ORDER BY value DESC LIMIT 5
    `, revP) as any[];

    const [salesByDistrict] = await pool.query(`
      SELECT COALESCE(o.delivery_district,'Sin distrito') as name,
             SUM(o.total_amount) as value
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilt.sql} ${revStatusFilt.sql} ${typeFilt.sql}
      GROUP BY o.delivery_district ORDER BY value DESC LIMIT 5
    `, revP) as any[];

    const [topProductsList] = await pool.query(`
      SELECT p.name, SUM(oi.quantity) as value
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o   ON oi.order_id   = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL
        ${dateFilt.sql} ${revStatusFilt.sql} ${typeFilt.sql}
      GROUP BY p.id ORDER BY value DESC LIMIT 5
    `, revP) as any[];

    const [orderStatusDistribution] = await pool.query(`
      SELECT o.status as name, COUNT(*) as value
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilt.sql} ${typeFilt.sql}
      GROUP BY o.status
    `, [...dateFilt.params, ...typeFilt.params]) as any[];

    res.json({
      revenue:                 revRow.total      || 0,
      discounts:               discRow.total     || 0,
      orders:                  ordRow.count,
      customers:               custRow.count,
      avgOrderValue:           avgRow.avg        || 0,
      lowStock:                lowStockRow.count,
      topProduct:              topProductRows[0] || { name: 'N/A', total_sold: 0 },
      recentOrders,
      salesData,
      salesByCustomerType,
      revenueVsCost,
      topCustomers,
      salesByDistrict,
      topProductsList,
      orderStatusDistribution,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
});

export default router;
