ALTER TABLE products
  ADD COLUMN `min_stock` INT NOT NULL DEFAULT 20
    COMMENT 'Umbral de stock bajo configurable por producto'
    AFTER `stock`;

INSERT INTO schema_migrations (version) VALUES ('014');
