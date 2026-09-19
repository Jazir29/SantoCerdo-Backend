DELIMITER $$

DROP PROCEDURE IF EXISTS sp_order_cancel$$
DROP PROCEDURE IF EXISTS sp_order_create$$
DROP PROCEDURE IF EXISTS sp_order_update$$

-- ============================================================
--  sp_order_cancel
--  Cancela una orden: restaura stock, registra movimientos,
--  decrementa usos de promo y actualiza el status.
-- ============================================================
CREATE PROCEDURE sp_order_cancel(
  IN p_order_id INT,
  IN p_user_id  INT
)
BEGIN
  DECLARE v_status   VARCHAR(20);
  DECLARE v_promo_id INT;
  DECLARE v_prod_id  INT;
  DECLARE v_qty      INT;
  DECLARE done       BOOLEAN DEFAULT FALSE;

  DECLARE cur_items CURSOR FOR
    SELECT product_id, quantity FROM order_items WHERE order_id = p_order_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT status, promotion_id
  INTO   v_status, v_promo_id
  FROM   orders
  WHERE  id = p_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orden no encontrada';
  END IF;

  IF v_status != 'cancelled' THEN
    SET done = FALSE;
    OPEN cur_items;
    items_loop: LOOP
      FETCH cur_items INTO v_prod_id, v_qty;
      IF done THEN LEAVE items_loop; END IF;

      UPDATE products
        SET stock = stock + v_qty, updated_by = p_user_id
        WHERE id = v_prod_id;

      INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, created_by)
        VALUES (v_prod_id, v_qty, 'order_cancel', p_order_id, 'order', p_user_id);
    END LOOP;
    CLOSE cur_items;

    IF v_promo_id IS NOT NULL THEN
      UPDATE promotions
        SET current_uses = GREATEST(0, current_uses - 1)
        WHERE id = v_promo_id;
    END IF;
  END IF;

  UPDATE orders
    SET status = 'cancelled', updated_by = p_user_id
    WHERE id = p_order_id;

  COMMIT;
END$$

-- ============================================================
--  sp_order_create
--  Crea una orden completa dentro de una transacción:
--  valida stock, aplica promo, inserta orden + items,
--  descuenta stock y registra movimientos.
--  Retorna: SELECT orderId AS orderId
-- ============================================================
CREATE PROCEDURE sp_order_create(
  IN p_customer_id        INT,
  IN p_user_id            INT,
  IN p_items              JSON,
  IN p_promotion_id       INT,
  IN p_delivery_address   TEXT,
  IN p_delivery_dept      VARCHAR(100),
  IN p_delivery_province  VARCHAR(100),
  IN p_delivery_district  VARCHAR(100),
  IN p_delivery_reference TEXT,
  IN p_save_address       TINYINT,
  IN p_addr_name          VARCHAR(200),
  IN p_addr_value         TEXT,
  IN p_addr_reference     TEXT,
  IN p_addr_dept          VARCHAR(100),
  IN p_addr_province      VARCHAR(100),
  IN p_addr_district      VARCHAR(100)
)
BEGIN
  DECLARE done         BOOLEAN DEFAULT FALSE;
  DECLARE v_i          INT DEFAULT 0;
  DECLARE v_item_count INT;
  DECLARE v_prod_id    INT;
  DECLARE v_qty        INT;
  DECLARE v_price      DECIMAL(10,2);
  DECLARE v_stock      INT;
  DECLARE v_subtotal   DECIMAL(10,2) DEFAULT 0;
  DECLARE v_discount   DECIMAL(10,2) DEFAULT 0;
  DECLARE v_total      DECIMAL(10,2);
  DECLARE v_promo_type VARCHAR(20);
  DECLARE v_promo_val  DECIMAL(10,2);
  DECLARE v_promo_max  INT;
  DECLARE v_promo_used INT;
  DECLARE v_valid_promo INT DEFAULT NULL;
  DECLARE v_order_id   INT;
  DECLARE v_addr_count INT;
  DECLARE v_addr_name  VARCHAR(200);

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  IF p_save_address = 1 THEN
    SELECT COUNT(*) INTO v_addr_count
      FROM customer_addresses WHERE customer_id = p_customer_id AND deleted_at IS NULL;
    SET v_addr_name = IF(p_addr_name IS NULL OR p_addr_name = '',
                         CONCAT('Dirección ', v_addr_count + 2), p_addr_name);
    INSERT INTO customer_addresses
      (customer_id, name, address, reference, department, province, district, created_by, updated_by)
    VALUES
      (p_customer_id, v_addr_name, p_addr_value, p_addr_reference,
       p_addr_dept, p_addr_province, p_addr_district, p_user_id, p_user_id);
  END IF;

  -- Primera pasada: validar existencia y stock, calcular subtotal
  SET v_item_count = JSON_LENGTH(p_items);
  WHILE v_i < v_item_count DO
    SET v_prod_id = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].product_id')));
    SET v_qty     = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].quantity')));
    SET done      = FALSE;

    SELECT price, stock INTO v_price, v_stock
      FROM products WHERE id = v_prod_id AND deleted_at IS NULL FOR UPDATE;

    IF done OR v_price IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = CONCAT('Producto ', v_prod_id, ' no encontrado');
    END IF;
    IF v_stock < v_qty THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = CONCAT('Stock insuficiente para el producto ', v_prod_id);
    END IF;

    SET v_subtotal = v_subtotal + (v_price * v_qty);
    SET v_i = v_i + 1;
  END WHILE;

  -- Aplicar promoción
  IF p_promotion_id IS NOT NULL THEN
    SET done = FALSE;
    SELECT type, value, max_uses, current_uses
    INTO   v_promo_type, v_promo_val, v_promo_max, v_promo_used
    FROM   promotions
    WHERE  id = p_promotion_id AND active = 1 AND deleted_at IS NULL
      AND (start_date IS NULL OR start_date <= NOW())
      AND (end_date IS NULL OR end_date >= NOW());

    IF NOT done AND (v_promo_max IS NULL OR v_promo_used < v_promo_max) THEN
      SET v_valid_promo = p_promotion_id;
      SET v_discount    = IF(v_promo_type = 'percentage',
                             v_subtotal * (v_promo_val / 100),
                             v_promo_val);
    END IF;
  END IF;

  SET v_total = GREATEST(0, v_subtotal - v_discount);

  INSERT INTO orders
    (customer_id, total_amount, status, created_at,
     delivery_address, delivery_department, delivery_province,
     delivery_district, delivery_reference,
     promotion_id, discount_amount, created_by, updated_by)
  VALUES
    (p_customer_id, v_total, 'pending', NOW(),
     p_delivery_address, p_delivery_dept, p_delivery_province,
     p_delivery_district, p_delivery_reference,
     v_valid_promo, v_discount, p_user_id, p_user_id);

  SET v_order_id = LAST_INSERT_ID();

  IF v_valid_promo IS NOT NULL THEN
    UPDATE promotions SET current_uses = current_uses + 1 WHERE id = v_valid_promo;
  END IF;

  -- Segunda pasada: insertar items, descontar stock, registrar movimientos
  SET v_i = 0;
  WHILE v_i < v_item_count DO
    SET v_prod_id = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].product_id')));
    SET v_qty     = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].quantity')));

    SELECT price INTO v_price FROM products WHERE id = v_prod_id AND deleted_at IS NULL;

    INSERT INTO order_items (order_id, product_id, quantity, price, created_by, updated_by)
      VALUES (v_order_id, v_prod_id, v_qty, v_price, p_user_id, p_user_id);

    UPDATE products SET stock = stock - v_qty, updated_by = p_user_id WHERE id = v_prod_id;

    INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, created_by)
      VALUES (v_prod_id, -v_qty, 'order_create', v_order_id, 'order', p_user_id);

    SET v_i = v_i + 1;
  END WHILE;

  COMMIT;
  SELECT v_order_id AS orderId;
END$$

-- ============================================================
--  sp_order_update
--  Edita una orden: restaura stock viejo, aplica nuevos items,
--  recalcula promo y registra movimientos.
-- ============================================================
CREATE PROCEDURE sp_order_update(
  IN p_id                 INT,
  IN p_customer_id        INT,
  IN p_user_id            INT,
  IN p_items              JSON,
  IN p_promotion_id       INT,
  IN p_delivery_address   TEXT,
  IN p_delivery_dept      VARCHAR(100),
  IN p_delivery_province  VARCHAR(100),
  IN p_delivery_district  VARCHAR(100),
  IN p_delivery_reference TEXT
)
BEGIN
  DECLARE v_found      INT DEFAULT 0;
  DECLARE v_old_promo  INT;
  DECLARE v_prod_id    INT;
  DECLARE v_qty        INT;
  DECLARE done         BOOLEAN DEFAULT FALSE;
  DECLARE v_i          INT DEFAULT 0;
  DECLARE v_item_count INT;
  DECLARE v_price      DECIMAL(10,2);
  DECLARE v_stock      INT;
  DECLARE v_subtotal   DECIMAL(10,2) DEFAULT 0;
  DECLARE v_discount   DECIMAL(10,2) DEFAULT 0;
  DECLARE v_total      DECIMAL(10,2);
  DECLARE v_promo_type VARCHAR(20);
  DECLARE v_promo_val  DECIMAL(10,2);
  DECLARE v_promo_max  INT;
  DECLARE v_promo_used INT;
  DECLARE v_valid_promo INT DEFAULT NULL;

  DECLARE cur_old CURSOR FOR
    SELECT product_id, quantity FROM order_items WHERE order_id = p_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  -- Verificar existencia antes de abrir transacción
  SELECT COUNT(*) INTO v_found FROM orders WHERE id = p_id AND deleted_at IS NULL;
  IF v_found = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Orden no encontrada';
  END IF;

  START TRANSACTION;

  SELECT promotion_id INTO v_old_promo
    FROM orders WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;

  -- Restaurar stock de los items anteriores
  SET done = FALSE;
  OPEN cur_old;
  old_loop: LOOP
    FETCH cur_old INTO v_prod_id, v_qty;
    IF done THEN LEAVE old_loop; END IF;

    UPDATE products SET stock = stock + v_qty, updated_by = p_user_id WHERE id = v_prod_id;

    INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, notes, created_by)
      VALUES (v_prod_id, v_qty, 'order_update', p_id, 'order', 'Restauración por edición de orden', p_user_id);
  END LOOP;
  CLOSE cur_old;

  DELETE FROM order_items WHERE order_id = p_id;

  -- Validar nuevos productos y calcular subtotal
  SET v_item_count = JSON_LENGTH(p_items);
  WHILE v_i < v_item_count DO
    SET v_prod_id = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].product_id')));
    SET v_qty     = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].quantity')));
    SET done      = FALSE;

    SELECT price, stock INTO v_price, v_stock
      FROM products WHERE id = v_prod_id AND deleted_at IS NULL FOR UPDATE;

    IF done OR v_price IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = CONCAT('Producto ', v_prod_id, ' no encontrado');
    END IF;
    IF v_stock < v_qty THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = CONCAT('Stock insuficiente para el producto ', v_prod_id);
    END IF;

    SET v_subtotal = v_subtotal + (v_price * v_qty);
    SET v_i = v_i + 1;
  END WHILE;

  -- Aplicar promoción
  IF p_promotion_id IS NOT NULL THEN
    SET done = FALSE;
    SELECT type, value, max_uses, current_uses
    INTO   v_promo_type, v_promo_val, v_promo_max, v_promo_used
    FROM   promotions
    WHERE  id = p_promotion_id AND active = 1 AND deleted_at IS NULL
      AND (start_date IS NULL OR start_date <= NOW())
      AND (end_date IS NULL OR end_date >= NOW());

    IF NOT done AND (v_promo_max IS NULL OR v_promo_used < v_promo_max) THEN
      SET v_valid_promo = p_promotion_id;
      SET v_discount    = IF(v_promo_type = 'percentage',
                             v_subtotal * (v_promo_val / 100),
                             v_promo_val);
    END IF;
  END IF;

  SET v_total = GREATEST(0, v_subtotal - v_discount);

  UPDATE orders
  SET customer_id         = p_customer_id,
      total_amount        = v_total,
      delivery_address    = p_delivery_address,
      delivery_department = p_delivery_dept,
      delivery_province   = p_delivery_province,
      delivery_district   = p_delivery_district,
      delivery_reference  = p_delivery_reference,
      promotion_id        = v_valid_promo,
      discount_amount     = v_discount,
      updated_by          = p_user_id
  WHERE id = p_id AND deleted_at IS NULL;

  -- Ajustar usos de promoción si cambió
  IF NOT (v_old_promo <=> v_valid_promo) THEN
    IF v_old_promo IS NOT NULL THEN
      UPDATE promotions SET current_uses = GREATEST(0, current_uses - 1) WHERE id = v_old_promo;
    END IF;
    IF v_valid_promo IS NOT NULL THEN
      UPDATE promotions SET current_uses = current_uses + 1 WHERE id = v_valid_promo;
    END IF;
  END IF;

  -- Insertar nuevos items, descontar stock, registrar movimientos
  SET v_i = 0;
  WHILE v_i < v_item_count DO
    SET v_prod_id = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].product_id')));
    SET v_qty     = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].quantity')));

    SELECT price INTO v_price FROM products WHERE id = v_prod_id AND deleted_at IS NULL;

    INSERT INTO order_items (order_id, product_id, quantity, price, created_by, updated_by)
      VALUES (p_id, v_prod_id, v_qty, v_price, p_user_id, p_user_id);

    UPDATE products SET stock = stock - v_qty, updated_by = p_user_id WHERE id = v_prod_id;

    INSERT INTO stock_movements (product_id, quantity, type, reference_id, reference_type, created_by)
      VALUES (v_prod_id, -v_qty, 'order_update', p_id, 'order', p_user_id);

    SET v_i = v_i + 1;
  END WHILE;

  COMMIT;
END$$

DELIMITER ;
