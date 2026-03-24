import { Router, Request, Response } from 'express';
import pool from '../config/db';

const router = Router();

function buildDateFilter(range: string, startDate?: string, endDate?: string): string {
  if (startDate && endDate) {
    const s = startDate.replace(/[^0-9-]/g, '');
    const e = endDate.replace(/[^0-9-]/g, '');
    return `AND DATE(o.created_at) BETWEEN '${s}' AND '${e}'`;
  }
  const map: Record<string, string> = {
    today:     "AND DATE(o.created_at) = CURDATE()",
    '7days':   "AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
    '30days':  "AND o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
    '90days':  "AND o.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)",
    thisMonth: "AND DATE_FORMAT(o.created_at,'%Y-%m') = DATE_FORMAT(NOW(),'%Y-%m')",
    thisYear:  "AND YEAR(o.created_at) = YEAR(NOW())",
    all:       '',
  };
  return map[range] ?? map['30days'];
}

// GET /api/stats
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const range        = req.query.range        as string || '30days';
  const status       = req.query.status       as string || 'all';
  const customerType = req.query.customerType as string || 'all';
  const startDate    = req.query.startDate    as string | undefined;
  const endDate      = req.query.endDate      as string | undefined;

  const allowedStatus = ['pending','processing','shipped','delivered','cancelled','all'];
  const allowedType   = ['natural','empresa','all'];
  const safeStatus    = allowedStatus.includes(status) ? status : 'all';
  const safeType      = allowedType.includes(customerType) ? customerType : 'all';

  const dateFilter         = buildDateFilter(range, startDate, endDate);
  const statusFilter       = safeStatus !== 'all' ? `AND o.status = '${safeStatus}'`      : '';
  const revenueStatusFilter= safeStatus !== 'all' ? `AND o.status = '${safeStatus}'`      : "AND o.status != 'cancelled'";
  const typeFilter         = safeType   !== 'all' ? `AND c.type   = '${safeType}'`        : '';

  // Filtro base — siempre excluye registros borrados lógicamente
  const base    = `FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.deleted_at IS NULL`;
  const allFilt = `${base} ${dateFilter} ${statusFilter} ${typeFilter}`;
  const revFilt = `${base} ${dateFilter} ${revenueStatusFilter} ${typeFilter}`;

  try {
    const [[revRow]]      = await pool.query(`SELECT SUM(o.total_amount)   as total ${revFilt}`) as any[];
    const [[discRow]]     = await pool.query(`SELECT SUM(o.discount_amount) as total ${revFilt}`) as any[];
    const [[ordRow]]      = await pool.query(`SELECT COUNT(*) as count ${allFilt}`) as any[];
    const [[custRow]]     = await pool.query(`SELECT COUNT(DISTINCT o.customer_id) as count ${allFilt}`) as any[];
    const [[avgRow]]      = await pool.query(`SELECT AVG(o.total_amount) as avg ${revFilt}`) as any[];
    const [[lowStockRow]] = await pool.query(
      `SELECT COUNT(*) as count FROM products WHERE stock <= 20 AND deleted_at IS NULL`
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
        ${dateFilter} ${revenueStatusFilter} ${typeFilter}
      GROUP BY p.id ORDER BY total_sold DESC LIMIT 1
    `) as any[];

    const [recentOrders] = await pool.query(`
      SELECT o.id, c.name as customer_name, o.total_amount, o.status, o.created_at
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilter} ${statusFilter} ${typeFilter}
      ORDER BY o.created_at DESC LIMIT 5
    `) as any[];

    const [salesData] = await pool.query(`
      SELECT DATE(o.created_at) as date,
             SUM(o.total_amount) as amount,
             COUNT(o.id) as orderCount
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilter} ${revenueStatusFilter} ${typeFilter}
      GROUP BY DATE(o.created_at) ORDER BY date ASC
    `) as any[];

    const [salesByCustomerType] = await pool.query(`
      SELECT c.type as name, SUM(o.total_amount) as value
      FROM orders o JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilter} ${revenueStatusFilter}
      GROUP BY c.type
    `) as any[];

    const [revenueVsCost] = await pool.query(`
      SELECT DATE(o.created_at) as date,
             SUM(oi.price * oi.quantity) as revenue,
             SUM(p.cost  * oi.quantity)  as cost
      FROM orders o
      JOIN order_items oi ON o.id  = oi.order_id
      JOIN products p     ON oi.product_id = p.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilter} ${revenueStatusFilter} ${typeFilter}
      GROUP BY DATE(o.created_at) ORDER BY date ASC
    `) as any[];

    const [topCustomers] = await pool.query(`
      SELECT COALESCE(c.trade_name, CONCAT(c.name,' ',COALESCE(c.last_name,''))) as name,
             SUM(o.total_amount) as value
      FROM orders o JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilter} ${revenueStatusFilter} ${typeFilter}
      GROUP BY c.id ORDER BY value DESC LIMIT 5
    `) as any[];

    const [salesByDistrict] = await pool.query(`
      SELECT COALESCE(o.delivery_district,'Sin distrito') as name,
             SUM(o.total_amount) as value
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilter} ${revenueStatusFilter} ${typeFilter}
      GROUP BY o.delivery_district ORDER BY value DESC LIMIT 5
    `) as any[];

    const [topProductsList] = await pool.query(`
      SELECT p.name, SUM(oi.quantity) as value
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o   ON oi.order_id   = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL AND p.deleted_at IS NULL
        ${dateFilter} ${revenueStatusFilter} ${typeFilter}
      GROUP BY p.id ORDER BY value DESC LIMIT 5
    `) as any[];

    const [orderStatusDistribution] = await pool.query(`
      SELECT o.status as name, COUNT(*) as value
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.deleted_at IS NULL ${dateFilter} ${typeFilter}
      GROUP BY o.status
    `) as any[];

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
