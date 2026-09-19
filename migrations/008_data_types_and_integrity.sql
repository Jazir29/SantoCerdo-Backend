-- 1. Corregir dato corrupto: roles fuera del dominio → 'admin'
--    (debe ejecutarse ANTES del ALTER a ENUM)
UPDATE users
SET role = 'admin'
WHERE role NOT IN ('admin', 'vendedor', 'produccion')
  AND deleted_at IS NULL;

-- 2. users.role varchar(50) → ENUM con los tres roles válidos
ALTER TABLE users
  MODIFY COLUMN role ENUM('admin', 'vendedor', 'produccion') NOT NULL DEFAULT 'admin';

-- 3. orders.discount_amount nullable → NOT NULL DEFAULT 0.00
--    Primero normalizar NULLs existentes, luego cambiar el tipo
UPDATE orders SET discount_amount = 0.00 WHERE discount_amount IS NULL;
ALTER TABLE orders
  MODIFY COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT '0.00';

-- 4. Unique parcial en customers.document_id + type
--    Evita que existan dos clientes activos con el mismo tipo y documento
--    Nota: registros soft-deleted quedan excluidos por convención de aplicación
ALTER TABLE customers
  ADD UNIQUE KEY uq_customer_doc_type (document_id, type);
