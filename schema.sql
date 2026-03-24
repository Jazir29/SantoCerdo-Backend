-- ============================================================
--  Santo Cerdo ERP — Schema MySQL
--  Ejecutar una sola vez para inicializar la base de datos
-- ============================================================

CREATE DATABASE IF NOT EXISTS santo_cerdo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE santo_cerdo;

-- ============================================================
--  CAMPOS DE AUDITORÍA (presentes en TODAS las tablas)
--  created_at  — fecha/hora de creación del registro
--  created_by  — id del usuario que creó el registro
--  updated_at  — fecha/hora de la última modificación (auto)
--  updated_by  — id del usuario que hizo la última modificación
--  deleted_at  — fecha de borrado lógico (NULL = registro activo)
--  deleted_by  — id del usuario que eliminó el registro
--
--  El borrado es LÓGICO: nunca se elimina físicamente un registro.
--  Todos los SELECT deben filtrar WHERE deleted_at IS NULL.
-- ============================================================

-- ------------------------------------------------------------
-- Usuarios del sistema
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(100)  UNIQUE NOT NULL,
  password   VARCHAR(255)  NOT NULL,          -- bcrypt hash
  name       VARCHAR(200)  NOT NULL,
  role       VARCHAR(50)   NOT NULL DEFAULT 'admin',
  -- Auditoría
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INT      DEFAULT NULL,           -- self-reference, NULL en el primer admin
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT      DEFAULT NULL,
  deleted_at DATETIME DEFAULT NULL,
  deleted_by INT      DEFAULT NULL
);

-- ------------------------------------------------------------
-- Productos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255)   NOT NULL,
  description TEXT,
  price       DECIMAL(10, 2) NOT NULL,
  cost        DECIMAL(10, 2) NOT NULL,
  stock       INT            NOT NULL DEFAULT 0,
  category    VARCHAR(100),
  image_url   VARCHAR(500),
  -- Auditoría
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by  INT      DEFAULT NULL,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT      DEFAULT NULL,
  deleted_at  DATETIME DEFAULT NULL,
  deleted_by  INT      DEFAULT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Clientes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  type                ENUM('natural', 'empresa') NOT NULL DEFAULT 'natural',
  document_id         VARCHAR(20),
  name                VARCHAR(200) NOT NULL,
  last_name           VARCHAR(200),
  trade_name          VARCHAR(200),
  email               VARCHAR(255),
  phone               VARCHAR(30),
  -- Dirección principal (snapshot para historial de órdenes)
  department          VARCHAR(100),
  province            VARCHAR(100),
  district            VARCHAR(100),
  address             TEXT,
  reference           TEXT,
  favorite_address_id INT      DEFAULT NULL,  -- FK diferida (ver ALTER abajo)
  -- Auditoría
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by          INT      DEFAULT NULL,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by          INT      DEFAULT NULL,
  deleted_at          DATETIME DEFAULT NULL,
  deleted_by          INT      DEFAULT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Direcciones adicionales del cliente
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_addresses (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  name        VARCHAR(200),
  address     TEXT NOT NULL,
  reference   TEXT,
  department  VARCHAR(100),
  province    VARCHAR(100),
  district    VARCHAR(100),
  is_favorite TINYINT(1) DEFAULT 0,
  -- Auditoría
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by  INT      DEFAULT NULL,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT      DEFAULT NULL,
  deleted_at  DATETIME DEFAULT NULL,
  deleted_by  INT      DEFAULT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES users(id)     ON DELETE SET NULL,
  FOREIGN KEY (updated_by)  REFERENCES users(id)     ON DELETE SET NULL,
  FOREIGN KEY (deleted_by)  REFERENCES users(id)     ON DELETE SET NULL
);

-- FK diferida customers → customer_addresses (evita referencia circular en CREATE)
ALTER TABLE customers
  ADD CONSTRAINT fk_customer_favorite_address
  FOREIGN KEY (favorite_address_id)
  REFERENCES customer_addresses(id)
  ON DELETE SET NULL;

-- ------------------------------------------------------------
-- Promociones / cupones
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255)                NOT NULL,
  code       VARCHAR(100) UNIQUE         NOT NULL,
  type       ENUM('percentage', 'fixed') NOT NULL,
  value      DECIMAL(10, 2)              NOT NULL,
  start_date DATETIME,
  end_date   DATETIME,
  active     TINYINT(1) DEFAULT 1,
  -- Auditoría
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INT      DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT      DEFAULT NULL,
  deleted_at DATETIME DEFAULT NULL,
  deleted_by INT      DEFAULT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Órdenes
-- Dirección de entrega guardada como snapshot: si el cliente
-- actualiza su dirección, el historial de órdenes no se altera.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  customer_id         INT,
  total_amount        DECIMAL(10, 2) NOT NULL,
  status              ENUM('pending','processing','shipped','delivered','cancelled')
                        NOT NULL DEFAULT 'pending',
  -- Snapshot de dirección de entrega
  delivery_address    TEXT,
  delivery_department VARCHAR(100),
  delivery_province   VARCHAR(100),
  delivery_district   VARCHAR(100),
  delivery_reference  TEXT,
  -- Promoción aplicada
  promotion_id        INT,
  discount_amount     DECIMAL(10, 2) DEFAULT 0,
  -- Auditoría
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by          INT      DEFAULT NULL,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by          INT      DEFAULT NULL,
  deleted_at          DATETIME DEFAULT NULL,
  deleted_by          INT      DEFAULT NULL,
  FOREIGN KEY (customer_id)  REFERENCES customers(id)  ON DELETE SET NULL,
  FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE SET NULL,
  FOREIGN KEY (updated_by)   REFERENCES users(id)      ON DELETE SET NULL,
  FOREIGN KEY (deleted_by)   REFERENCES users(id)      ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- Ítems de una orden
-- Sin deleted_at propio: su ciclo de vida lo controla la orden.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   INT            NOT NULL,
  product_id INT,
  quantity   INT            NOT NULL,
  price      DECIMAL(10, 2) NOT NULL,
  -- Auditoría (sin borrado lógico — la orden padre lo gestiona)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INT      DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by INT      DEFAULT NULL,
  FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id)    ON DELETE SET NULL
);

-- ============================================================
--  Índices de performance
-- ============================================================
-- Consultas frecuentes por relación
CREATE INDEX idx_orders_customer    ON orders(customer_id);
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_orders_created_at  ON orders(created_at);
CREATE INDEX idx_items_order        ON order_items(order_id);
CREATE INDEX idx_items_product      ON order_items(product_id);
CREATE INDEX idx_addresses_customer ON customer_addresses(customer_id);

-- Filtrado de registros activos (WHERE deleted_at IS NULL)
CREATE INDEX idx_products_deleted   ON products(deleted_at);
CREATE INDEX idx_customers_deleted  ON customers(deleted_at);
CREATE INDEX idx_promotions_deleted ON promotions(deleted_at);
CREATE INDEX idx_orders_deleted     ON orders(deleted_at);

-- ============================================================
--  Datos iniciales — ejecutar: npm run seed
-- ============================================================
