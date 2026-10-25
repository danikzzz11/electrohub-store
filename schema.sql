-- ============================================================================
-- SQLite Schema for Online Store + CRM
-- Engine: node:sqlite (DatabaseSync)
-- ============================================================================

-- 0. Рекомендуемые PRAGMA-настройки производительности и целостности
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

-- ============================================================================
-- 1. ТАБЛИЦА: categories (Категории товаров)
-- ============================================================================
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 2. ТАБЛИЦА: products (Товары)
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 0),
  old_price REAL DEFAULT NULL CHECK(old_price IS NULL OR old_price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 3. ТАБЛИЦА: customers (Клиенты CRM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  total_orders INTEGER NOT NULL DEFAULT 0 CHECK(total_orders >= 0),
  total_spent REAL NOT NULL DEFAULT 0.0 CHECK(total_spent >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 4. ТАБЛИЦА: orders (Заказы)
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  customer_address TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash', 'card_online', 'card_on_delivery')),
  comment TEXT NOT NULL DEFAULT '',
  total_amount REAL NOT NULL DEFAULT 0.0 CHECK(total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'processing', 'shipped', 'delivered', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 5. ТАБЛИЦА: order_items (Позиции заказа)
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  total REAL NOT NULL CHECK(total >= 0)
);

-- ============================================================================
-- 6. ТАБЛИЦА: admin_users (Администраторы системы)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- 7. ТАБЛИЦА: crm_notes (Заметки по клиентам в CRM)
-- ============================================================================
CREATE TABLE IF NOT EXISTS crm_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- ИНДЕКСЫ (Ускорение выборки, поиска и фильтрации)
-- ============================================================================
-- Категории
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- Товары: фильтрация по категории, поиск по названию, сортировка в витрине
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_active_cat ON products(is_active, category_id);

-- Клиенты: быстрый поиск по телефону и email
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- Заказы: привязка к клиенту, фильтрация по статусу, хронологический порядок
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Позиции заказов: внешний ключ заказа и товара
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- CRM заметки: вывод истории по клиенту
CREATE INDEX IF NOT EXISTS idx_crm_notes_customer ON crm_notes(customer_id);

-- ============================================================================
-- ТРИГГЕРЫ: Автоматический пересчет total_orders и total_spent у клиентов
-- ============================================================================

-- При создании нового заказа
CREATE TRIGGER IF NOT EXISTS trg_orders_after_insert
AFTER INSERT ON orders
FOR EACH ROW
WHEN NEW.customer_id IS NOT NULL
BEGIN
  UPDATE customers
  SET total_orders = (
        SELECT COUNT(*) FROM orders
        WHERE customer_id = NEW.customer_id AND status != 'cancelled'
      ),
      total_spent = COALESCE((
        SELECT ROUND(SUM(total_amount), 2) FROM orders
        WHERE customer_id = NEW.customer_id AND status != 'cancelled'
      ), 0.0),
      updated_at = datetime('now')
  WHERE id = NEW.customer_id;
END;

-- При обновлении заказа (изменение статуса, суммы или привязки к клиенту)
CREATE TRIGGER IF NOT EXISTS trg_orders_after_update
AFTER UPDATE OF customer_id, total_amount, status ON orders
FOR EACH ROW
BEGIN
  -- Обновление данных нового (или текущего) клиента
  UPDATE customers
  SET total_orders = (
        SELECT COUNT(*) FROM orders
        WHERE customer_id = NEW.customer_id AND status != 'cancelled'
      ),
      total_spent = COALESCE((
        SELECT ROUND(SUM(total_amount), 2) FROM orders
        WHERE customer_id = NEW.customer_id AND status != 'cancelled'
      ), 0.0),
      updated_at = datetime('now')
  WHERE id = NEW.customer_id AND NEW.customer_id IS NOT NULL;

  -- Обновление данных старого клиента, если заказ перепривязан
  UPDATE customers
  SET total_orders = (
        SELECT COUNT(*) FROM orders
        WHERE customer_id = OLD.customer_id AND status != 'cancelled'
      ),
      total_spent = COALESCE((
        SELECT ROUND(SUM(total_amount), 2) FROM orders
        WHERE customer_id = OLD.customer_id AND status != 'cancelled'
      ), 0.0),
      updated_at = datetime('now')
  WHERE id = OLD.customer_id
    AND OLD.customer_id IS NOT NULL
    AND OLD.customer_id != NEW.customer_id;
END;

-- При удалении заказа
CREATE TRIGGER IF NOT EXISTS trg_orders_after_delete
AFTER DELETE ON orders
FOR EACH ROW
WHEN OLD.customer_id IS NOT NULL
BEGIN
  UPDATE customers
  SET total_orders = (
        SELECT COUNT(*) FROM orders
        WHERE customer_id = OLD.customer_id AND status != 'cancelled'
      ),
      total_spent = COALESCE((
        SELECT ROUND(SUM(total_amount), 2) FROM orders
        WHERE customer_id = OLD.customer_id AND status != 'cancelled'
      ), 0.0),
      updated_at = datetime('now')
  WHERE id = OLD.customer_id;
END;
