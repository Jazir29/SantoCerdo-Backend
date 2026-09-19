-- Añadir soft delete a production_batches para consistencia con el resto de entidades
ALTER TABLE production_batches
  ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD COLUMN updated_by INT DEFAULT NULL AFTER updated_at,
  ADD COLUMN deleted_at DATETIME DEFAULT NULL AFTER updated_by,
  ADD COLUMN deleted_by INT DEFAULT NULL AFTER deleted_at;

ALTER TABLE production_batches
  ADD INDEX idx_batches_deleted (deleted_at);

ALTER TABLE production_batches
  ADD CONSTRAINT pb_fk_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL,
  ADD CONSTRAINT pb_fk_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE SET NULL;
