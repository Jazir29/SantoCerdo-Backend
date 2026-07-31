ALTER TABLE `orders`
  ADD COLUMN `payment_status` ENUM('unpaid', 'partial', 'paid') NOT NULL DEFAULT 'unpaid' AFTER `status`,
  ADD COLUMN `payment_method` ENUM('cash', 'transfer', 'yape', 'plin', 'other') NULL DEFAULT NULL AFTER `payment_status`,
  ADD COLUMN `paid_at` DATETIME NULL DEFAULT NULL AFTER `payment_method`;

ALTER TABLE `orders` ADD INDEX `idx_orders_payment_status` (`payment_status`);
