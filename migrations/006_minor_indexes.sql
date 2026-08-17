ALTER TABLE customers ADD INDEX idx_customers_type (type);
ALTER TABLE customers ADD INDEX idx_customers_document_id (document_id);
ALTER TABLE products  ADD INDEX idx_products_category (category);
ALTER TABLE users     ADD INDEX idx_users_role (role);
