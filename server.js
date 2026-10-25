require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const { pool, query, queryOne, hashPassword, createOrder, updateOrderStatus } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Admin authentication middleware
async function adminAuth(req, res, next) {
  try {
    let token = req.cookies.admin_token;
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация администратора' });
    }

    const session = await queryOne(
      'SELECT * FROM admin_sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (!session) {
      return res.status(401).json({ error: 'Сессия истекла или недействительна' });
    }

    req.admin = { username: session.username };
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// -----------------------------------------------------------------------------
// PUBLIC STOREFRONT API
// -----------------------------------------------------------------------------

// Get categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await query(`
      SELECT c.*, COUNT(p.id)::int as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.id ASC
    `);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get products with filters, search, sort
app.get('/api/products', async (req, res) => {
  try {
    const { category, q, sort, in_stock } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let pIdx = 1;

    if (category) {
      if (isNaN(category)) {
        sql += ` AND c.slug = $${pIdx++}`;
      } else {
        sql += ` AND p.category_id = $${pIdx++}`;
      }
      params.push(category);
    }

    if (q && q.trim()) {
      sql += ` AND (p.name ILIKE $${pIdx} OR p.description ILIKE $${pIdx} OR p.specs ILIKE $${pIdx})`;
      params.push(`%${q.trim()}%`);
      pIdx++;
    }

    if (in_stock === 'true') {
      sql += ` AND p.stock > 0`;
    }

    if (sort === 'price_asc') {
      sql += ` ORDER BY p.price ASC`;
    } else if (sort === 'price_desc') {
      sql += ` ORDER BY p.price DESC`;
    } else if (sort === 'name_asc') {
      sql += ` ORDER BY p.name ASC`;
    } else {
      sql += ` ORDER BY p.id DESC`;
    }

    const products = await query(sql, params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await queryOne(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (!product) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    // Related products in the same category
    const related = await query(`
      SELECT id, name, price, old_price, image_url, stock
      FROM products 
      WHERE category_id = $1 AND id != $2
      LIMIT 4
    `, [product.category_id, product.id]);

    res.json({ ...product, related });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create order (Checkout)
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, customerAddress, paymentMethod, comment, items } = req.body;

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: 'Пожалуйста, укажите имя получателя' });
    }
    if (!customerPhone || !customerPhone.trim()) {
      return res.status(400).json({ error: 'Пожалуйста, укажите контактный телефон' });
    }
    if (!customerAddress || !customerAddress.trim()) {
      return res.status(400).json({ error: 'Пожалуйста, укажите адрес доставки' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Корзина пуста' });
    }

    // Validate and fetch order item details
    const orderItems = [];
    for (const it of items) {
      const prod = await queryOne('SELECT id, name, price, stock, image_url FROM products WHERE id = $1', [it.productId]);
      if (!prod) {
        return res.status(400).json({ error: `Товар ID ${it.productId} не существует` });
      }
      if (prod.stock < it.quantity) {
        return res.status(400).json({ error: `Товара "${prod.name}" недостаточно на складе (в наличии ${prod.stock} шт.)` });
      }
      orderItems.push({
        productId: prod.id,
        name: prod.name,
        price: prod.price,
        quantity: parseInt(it.quantity, 10),
        image_url: prod.image_url
      });
    }

    const result = await createOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: (customerEmail || '').trim(),
      customerAddress: customerAddress.trim(),
      paymentMethod: paymentMethod || 'При получении',
      comment: (comment || '').trim()
    }, orderItems);

    res.status(201).json({
      success: true,
      message: 'Заказ успешно создан!',
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      totalAmount: result.totalAmount
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// ADMIN AUTHENTICATION API
// -----------------------------------------------------------------------------

// Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    const user = await queryOne('SELECT * FROM admin_users WHERE username = $1', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const hashedInput = hashPassword(password);
    if (user.password_hash !== hashedInput) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Generate token valid for 24 hours
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await query(
      'INSERT INTO admin_sessions (token, username, expires_at) VALUES ($1, $2, $3)',
      [token, user.username, expiresAt]
    );

    // Set cookie
    res.cookie('admin_token', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        fullName: user.full_name
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check current admin session
app.get('/api/admin/me', adminAuth, async (req, res) => {
  try {
    const user = await queryOne('SELECT username, full_name FROM admin_users WHERE username = $1', [req.admin.username]);
    res.json({ 
      success: true, 
      user: {
        username: user.username,
        fullName: user.full_name
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/api/admin/logout', async (req, res) => {
  try {
    const token = req.cookies.admin_token;
    if (token) {
      await query('DELETE FROM admin_sessions WHERE token = $1', [token]);
    }
    res.clearCookie('admin_token');
    res.json({ success: true, message: 'Выход выполнен успешно' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
// ADMIN CRM & MANAGEMENT API (Protected)
// -----------------------------------------------------------------------------

// Dashboard Stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const ordersCountRow = await queryOne('SELECT COUNT(*)::int as count FROM orders');
    const totalOrders = ordersCountRow ? ordersCountRow.count : 0;

    const pendingOrdersRow = await queryOne("SELECT COUNT(*)::int as count FROM orders WHERE status IN ('новый', 'в_обработке')");
    const pendingOrders = pendingOrdersRow ? pendingOrdersRow.count : 0;

    const customersCountRow = await queryOne('SELECT COUNT(*)::int as count FROM customers');
    const totalCustomers = customersCountRow ? customersCountRow.count : 0;

    const productsCountRow = await queryOne('SELECT COUNT(*)::int as count FROM products');
    const totalProducts = productsCountRow ? productsCountRow.count : 0;

    const lowStockRow = await queryOne('SELECT COUNT(*)::int as count FROM products WHERE stock <= 5');
    const lowStock = lowStockRow ? lowStockRow.count : 0;

    const revenueRow = await queryOne("SELECT COALESCE(SUM(total_amount), 0)::int as revenue FROM orders WHERE status != 'отменен'");
    const totalRevenue = revenueRow ? revenueRow.revenue : 0;

    const statusCounts = await query(`
      SELECT status, COUNT(*)::int as count 
      FROM orders 
      GROUP BY status
    `);

    const recentOrders = await query(`
      SELECT o.*, 
             (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as items_count
      FROM orders o 
      ORDER BY o.id DESC 
      LIMIT 6
    `);

    res.json({
      totalRevenue,
      totalOrders,
      pendingOrders,
      totalCustomers,
      totalProducts,
      lowStock,
      statusCounts,
      recentOrders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Products management
app.get('/api/admin/products', adminAuth, async (req, res) => {
  try {
    const { search, category_id } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let pIdx = 1;

    if (category_id) {
      sql += ` AND p.category_id = $${pIdx++}`;
      params.push(category_id);
    }
    if (search && search.trim()) {
      sql += ` AND (p.name ILIKE $${pIdx} OR p.description ILIKE $${pIdx})`;
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    sql += ' ORDER BY p.id DESC';
    const products = await query(sql, params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add product
app.post('/api/admin/products', adminAuth, async (req, res) => {
  try {
    const { name, category_id, price, old_price, stock, description, specs, image_url } = req.body;

    if (!name || !category_id || price === undefined) {
      return res.status(400).json({ error: 'Название, категория и цена обязательны для заполнения' });
    }

    const defaultImg = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80';
    const newProd = await queryOne(`
      INSERT INTO products (name, category_id, price, old_price, stock, description, specs, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      name.trim(),
      parseInt(category_id, 10),
      parseInt(price, 10),
      old_price ? parseInt(old_price, 10) : null,
      stock !== undefined ? parseInt(stock, 10) : 0,
      description || '',
      specs || '',
      image_url || defaultImg
    ]);

    res.status(201).json({ success: true, product: newProd });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update product
app.put('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const { name, category_id, price, old_price, stock, description, specs, image_url } = req.body;
    const prodId = req.params.id;

    const existing = await queryOne('SELECT * FROM products WHERE id = $1', [prodId]);
    if (!existing) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const updated = await queryOne(`
      UPDATE products 
      SET name = $1, category_id = $2, price = $3, old_price = $4, stock = $5, description = $6, specs = $7, image_url = $8
      WHERE id = $9
      RETURNING *
    `, [
      name !== undefined ? name.trim() : existing.name,
      category_id !== undefined ? parseInt(category_id, 10) : existing.category_id,
      price !== undefined ? parseInt(price, 10) : existing.price,
      old_price !== undefined ? (old_price ? parseInt(old_price, 10) : null) : existing.old_price,
      stock !== undefined ? parseInt(stock, 10) : existing.stock,
      description !== undefined ? description : existing.description,
      specs !== undefined ? specs : existing.specs,
      image_url !== undefined ? image_url : existing.image_url,
      prodId
    ]);

    res.json({ success: true, product: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete product
app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const prodId = req.params.id;
    const existing = await queryOne('SELECT * FROM products WHERE id = $1', [prodId]);
    if (!existing) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    await query('DELETE FROM products WHERE id = $1', [prodId]);
    res.json({ success: true, message: `Товар "${existing.name}" успешно удален` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Orders management
app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `
      SELECT o.*, 
             (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as items_count,
             (SELECT STRING_AGG(product_name, ', ') FROM order_items WHERE order_id = o.id) as items_summary
      FROM orders o
      WHERE 1=1
    `;
    const params = [];
    let pIdx = 1;

    if (status && status !== 'all') {
      sql += ` AND o.status = $${pIdx++}`;
      params.push(status);
    }

    if (search && search.trim()) {
      sql += ` AND (o.order_number ILIKE $${pIdx} OR o.customer_name ILIKE $${pIdx} OR o.customer_phone ILIKE $${pIdx})`;
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    sql += ' ORDER BY o.id DESC';
    const orders = await query(sql, params);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single order with items
app.get('/api/admin/orders/:id', adminAuth, async (req, res) => {
  try {
    const order = await queryOne('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const items = await query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    const customer = await queryOne('SELECT * FROM customers WHERE id = $1', [order.customer_id]);

    res.json({
      ...order,
      items,
      customer
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status
app.patch('/api/admin/orders/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['новый', 'в_обработке', 'отправлен', 'доставлен', 'отменен'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Недопустимый статус. Допустимые: ${validStatuses.join(', ')}` });
    }

    const updatedOrder = await updateOrderStatus(req.params.id, status);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Customers CRM
app.get('/api/admin/customers', adminAuth, async (req, res) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT c.*, 
             MAX(o.created_at) as last_order_date
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let pIdx = 1;

    if (search && search.trim()) {
      sql += ` AND (c.name ILIKE $${pIdx} OR c.phone ILIKE $${pIdx} OR c.email ILIKE $${pIdx})`;
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    sql += ' GROUP BY c.id ORDER BY c.total_spent DESC, c.id DESC';
    const customers = await query(sql, params);

    // Compute VIP status badge & AOV
    const enhanced = customers.map(c => {
      let segment = 'Новичок';
      if (c.total_spent >= 150000 || c.total_orders >= 5) {
        segment = 'VIP';
      } else if (c.total_orders >= 2) {
        segment = 'Постоянный';
      }
      return {
        ...c,
        segment,
        aov: c.total_orders > 0 ? Math.round(c.total_spent / c.total_orders) : 0
      };
    });

    res.json(enhanced);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single Customer Card with full CRM order history & notes
app.get('/api/admin/customers/:id', adminAuth, async (req, res) => {
  try {
    const customer = await queryOne('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!customer) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    // Customer orders
    const orders = await query(`
      SELECT o.*, 
             (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as items_count
      FROM orders o 
      WHERE o.customer_id = $1
      ORDER BY o.id DESC
    `, [customer.id]);

    for (const ord of orders) {
      ord.items = await query('SELECT * FROM order_items WHERE order_id = $1', [ord.id]);
    }

    // CRM Notes
    const notes = await query(`
      SELECT * FROM crm_notes 
      WHERE customer_id = $1
      ORDER BY id DESC
    `, [customer.id]);

    let segment = 'Новичок';
    if (customer.total_spent >= 150000 || customer.total_orders >= 5) {
      segment = 'VIP';
    } else if (customer.total_orders >= 2) {
      segment = 'Постоянный';
    }

    const aov = customer.total_orders > 0 ? Math.round(customer.total_spent / customer.total_orders) : 0;

    res.json({
      customer: {
        ...customer,
        segment,
        aov
      },
      orders,
      notes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add CRM Note to customer
app.post('/api/admin/customers/:id/notes', adminAuth, async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Текст заметки не может быть пустым' });
    }

    const customer = await queryOne('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!customer) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }

    const newNote = await queryOne(`
      INSERT INTO crm_notes (customer_id, note, author)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [customer.id, note.trim(), req.admin.username]);

    res.status(201).json({ success: true, note: newNote });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route alias
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start Server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Интернет-магазин и CRM запущены на http://localhost:${PORT}`);
    console.log(`🛒 Веб-витрина: http://localhost:${PORT}/`);
    console.log(`🔒 Админ-панель (CRM): http://localhost:${PORT}/admin`);
    console.log(`🔑 Логин: danik | Пароль: 20112005`);
    console.log(`===================================================`);
  });
}

module.exports = app;
