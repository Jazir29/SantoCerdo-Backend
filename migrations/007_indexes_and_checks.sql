-- Índices faltantes en tablas con soft delete
ALTER TABLE users             ADD INDEX idx_users_deleted     (deleted_at);
ALTER TABLE customer_addresses ADD INDEX idx_addresses_deleted (deleted_at);
ALTER TABLE promotions         ADD INDEX idx_promotions_active  (active);

-- Índices compuestos para queries de listado frecuentes
ALTER TABLE stock_movements ADD INDEX idx_sm_product_date (product_id, created_at);
ALTER TABLE orders          ADD INDEX idx_orders_list     (deleted_at, created_at);

-- CHECK constraints (MySQL 8+)
ALTER TABLE order_items         ADD CONSTRAINT chk_items_qty     CHECK (quantity > 0);
ALTER TABLE orders              ADD CONSTRAINT chk_orders_amount  CHECK (total_amount >= 0);
ALTER TABLE promotions          ADD CONSTRAINT chk_promo_value    CHECK (value > 0);
ALTER TABLE production_batches  ADD CONSTRAINT chk_batches_units  CHECK (units_produced > 0);
