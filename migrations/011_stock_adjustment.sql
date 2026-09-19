-- Agrega 'adjustment' al ENUM de movimientos de stock
ALTER TABLE stock_movements
  MODIFY COLUMN type ENUM('batch','order_create','order_cancel','order_update','adjustment')
    COLLATE utf8mb4_unicode_ci NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('011');
