CREATE TABLE IF NOT EXISTS `order_returns` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `order_id`   INT          NOT NULL,
  `reason`     VARCHAR(200) NOT NULL,
  `notes`      VARCHAR(500)          DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` INT                   DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_returns_order` (`order_id`),
  CONSTRAINT `fk_ret_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_ret_user`  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_return_items` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `return_id`  INT NOT NULL,
  `product_id` INT NOT NULL,
  `quantity`   INT NOT NULL,
  `price`      DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_reti_return`  FOREIGN KEY (`return_id`)  REFERENCES `order_returns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reti_product` FOREIGN KEY (`product_id`) REFERENCES `products`      (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('015');
