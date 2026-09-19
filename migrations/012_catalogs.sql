CREATE TABLE IF NOT EXISTS `catalogs` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `category`   VARCHAR(100) NOT NULL,
  `code`       VARCHAR(100) NOT NULL,
  `name`       VARCHAR(200) NOT NULL,
  `sort_order` INT          NOT NULL DEFAULT 0,
  `active`     TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_catalog` (`category`, `code`),
  KEY `idx_catalog_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `catalogs` (`category`, `code`, `name`, `sort_order`) VALUES
  -- Roles
  ('roles', 'admin',      'Administrador', 1),
  ('roles', 'vendedor',   'Vendedor',      2),
  ('roles', 'produccion', 'Producción',    3),

  -- Estado de órdenes
  ('order_status', 'pending',   'Pendiente',  1),
  ('order_status', 'shipped',   'Enviado',    2),
  ('order_status', 'completed', 'Completado', 3),
  ('order_status', 'cancelled', 'Cancelado',  4),

  -- Estado de pago
  ('payment_status', 'unpaid',  'Sin pagar',       1),
  ('payment_status', 'partial', 'Pago parcial',    2),
  ('payment_status', 'paid',    'Pagado',          3),

  -- Método de pago
  ('payment_method', 'cash',     'Efectivo',        1),
  ('payment_method', 'transfer', 'Transferencia',   2),
  ('payment_method', 'yape',     'Yape',            3),
  ('payment_method', 'plin',     'Plin',            4),
  ('payment_method', 'other',    'Otro',            5),

  -- Tipo de cliente
  ('customer_type', 'natural',  'Persona Natural', 1),
  ('customer_type', 'empresa',  'Empresa',         2),

  -- Tipo de promoción
  ('promotion_type', 'percentage', 'Porcentaje', 1),
  ('promotion_type', 'fixed',      'Monto fijo', 2),

  -- Motivos de ajuste de stock
  ('stock_adjustment_reason', 'merma',       'Merma',              1),
  ('stock_adjustment_reason', 'vencimiento', 'Vencimiento',        2),
  ('stock_adjustment_reason', 'rotura',      'Rotura / Daño',      3),
  ('stock_adjustment_reason', 'conteo',      'Corrección de conteo', 4),
  ('stock_adjustment_reason', 'donacion',    'Donación',           5),
  ('stock_adjustment_reason', 'otro',        'Otro',               6);

INSERT INTO schema_migrations (version) VALUES ('012');
