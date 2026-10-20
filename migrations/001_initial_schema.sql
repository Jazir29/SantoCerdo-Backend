-- ─────────────────────────────────────────────────────────────────────────
-- Schema inicial completo — reconstruido desde backup Clever Cloud (2026-10-18)
-- Representa el estado tras aplicar migraciones 002-011
-- Las migraciones 010 (stored procedures), 012 (catalogs), 013 (sp_promo_strict),
-- 014 (product.min_stock) y 015 (order_returns) correrán después de ésta.
-- ─────────────────────────────────────────────────────────────────────────

SET FOREIGN_KEY_CHECKS = 0;

-- ── users (sin FKs iniciales, se auto-referencia) ──────────────
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `second_last_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('admin','vendedor','produccion') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── products ────────────────────────────────────────────────────
CREATE TABLE `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(10,2) NOT NULL,
  `cost` decimal(10,2) NOT NULL,
  `weight_grams` int DEFAULT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `deleted_by` (`deleted_by`),
  KEY `idx_products_deleted` (`deleted_at`),
  KEY `idx_products_category` (`category`),
  CONSTRAINT `products_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `products_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `products_ibfk_3` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── customers ───────────────────────────────────────────────────
CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` enum('natural','empresa') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'natural',
  `document_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trade_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `favorite_address_id` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_doc_type` (`document_id`,`type`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `deleted_by` (`deleted_by`),
  KEY `fk_customer_favorite_address` (`favorite_address_id`),
  KEY `idx_customers_deleted` (`deleted_at`),
  KEY `idx_customers_type` (`type`),
  KEY `idx_customers_document_id` (`document_id`),
  CONSTRAINT `customers_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `customers_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `customers_ibfk_3` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── customer_addresses ──────────────────────────────────────────
CREATE TABLE `customer_addresses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` text COLLATE utf8mb4_unicode_ci,
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `district` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_favorite` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `deleted_by` (`deleted_by`),
  KEY `idx_addresses_customer` (`customer_id`),
  KEY `idx_addresses_deleted` (`deleted_at`),
  CONSTRAINT `customer_addresses_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `customer_addresses_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `customer_addresses_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `customer_addresses_ibfk_4` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `customers`
  ADD CONSTRAINT `fk_customer_favorite_address` FOREIGN KEY (`favorite_address_id`) REFERENCES `customer_addresses` (`id`) ON DELETE SET NULL;

-- ── promotions ──────────────────────────────────────────────────
CREATE TABLE `promotions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('percentage','fixed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` decimal(10,2) NOT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `active` tinyint(1) DEFAULT '1',
  `max_uses` int DEFAULT NULL,
  `current_uses` int NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `deleted_by` (`deleted_by`),
  KEY `idx_promotions_deleted` (`deleted_at`),
  KEY `idx_promotions_active` (`active`),
  CONSTRAINT `promotions_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `promotions_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `promotions_ibfk_3` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_promo_value` CHECK ((`value` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── orders ──────────────────────────────────────────────────────
CREATE TABLE `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `status` enum('pending','shipped','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `payment_status` enum('unpaid','partial','paid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `payment_method` enum('cash','transfer','yape','plin','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `delivery_address` text COLLATE utf8mb4_unicode_ci,
  `delivery_department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_province` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_district` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_reference` text COLLATE utf8mb4_unicode_ci,
  `promotion_id` int DEFAULT NULL,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `promotion_id` (`promotion_id`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `deleted_by` (`deleted_by`),
  KEY `idx_orders_customer` (`customer_id`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_created_at` (`created_at`),
  KEY `idx_orders_deleted` (`deleted_at`),
  KEY `idx_orders_payment_status` (`payment_status`),
  KEY `idx_orders_list` (`deleted_at`,`created_at`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`promotion_id`) REFERENCES `promotions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_ibfk_5` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_orders_amount` CHECK ((`total_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── order_items ─────────────────────────────────────────────────
CREATE TABLE `order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `product_id` int DEFAULT NULL,
  `quantity` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `idx_items_order` (`order_id`),
  KEY `idx_items_product` (`product_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_items_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `order_items_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_items_qty` CHECK ((`quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── production_batches ──────────────────────────────────────────
CREATE TABLE `production_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `batch_yield_grams` int NOT NULL DEFAULT '0',
  `unit_weight_grams` int NOT NULL,
  `units_produced` int NOT NULL,
  `total_ingredients_cost` decimal(10,2) NOT NULL,
  `total_operations_cost` decimal(10,2) NOT NULL,
  `total_batch_cost` decimal(10,2) NOT NULL,
  `cost_per_unit` decimal(10,2) NOT NULL,
  `price_per_unit` decimal(10,2) NOT NULL,
  `margin_percent` decimal(5,2) NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_batches_product` (`product_id`),
  KEY `batches_ibfk_2` (`created_by`),
  KEY `idx_batches_deleted` (`deleted_at`),
  KEY `pb_fk_updated_by` (`updated_by`),
  KEY `pb_fk_deleted_by` (`deleted_by`),
  CONSTRAINT `batches_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `batches_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `pb_fk_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `pb_fk_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_batches_units` CHECK ((`units_produced` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── batch_ingredients ───────────────────────────────────────────
CREATE TABLE `batch_ingredients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_batch_ingredients` (`batch_id`),
  CONSTRAINT `bi_ibfk_1` FOREIGN KEY (`batch_id`) REFERENCES `production_batches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── batch_operations ────────────────────────────────────────────
CREATE TABLE `batch_operations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_batch_operations` (`batch_id`),
  CONSTRAINT `bo_ibfk_1` FOREIGN KEY (`batch_id`) REFERENCES `production_batches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── stock_movements (incluye 'adjustment' en ENUM — efecto de mig 011) ──
CREATE TABLE `stock_movements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `quantity` int NOT NULL COMMENT 'Positive = entrada, negative = salida',
  `type` enum('batch','order_create','order_cancel','order_update','adjustment') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference_id` int DEFAULT NULL COMMENT 'order_id or batch_id',
  `reference_type` enum('order','batch') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sm_product` (`product_id`),
  KEY `idx_sm_created_at` (`created_at`),
  KEY `idx_sm_type` (`type`),
  KEY `fk_sm_user` (`created_by`),
  KEY `idx_sm_product_date` (`product_id`,`created_at`),
  CONSTRAINT `fk_sm_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sm_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ─────────────────────────────────────────────────────────────────────────
-- Marcar como aplicadas las migraciones cuyos efectos ya están en el schema
-- de arriba (todas excepto 010, 012, 013, 014, 015 que correrán después).
-- ─────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO schema_migrations (name) VALUES
  ('002_stock_movements.sql'),
  ('003_order_payment.sql'),
  ('004_promotion_max_uses.sql'),
  ('005_users_name_fields.sql'),
  ('006_minor_indexes.sql'),
  ('007_indexes_and_checks.sql'),
  ('008_data_types_and_integrity.sql'),
  ('009_batches_soft_delete.sql'),
  ('011_stock_adjustment.sql');
