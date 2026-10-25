require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error('⚠️ Предупреждение: DATABASE_URL не задана в переменных окружения!');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Неожиданная ошибка пула PostgreSQL:', err);
});

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function query(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

async function queryOne(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

async function findOrCreateCustomer(data) {
  let customer = await queryOne('SELECT * FROM customers WHERE phone = $1', [data.phone]);
  if (!customer) {
    customer = await queryOne(
      `INSERT INTO customers (name, phone, email, address, total_orders, total_spent)
       VALUES ($1, $2, $3, $4, 0, 0)
       RETURNING *`,
      [data.name, data.phone, data.email || '', data.address || '']
    );
  } else {
    customer = await queryOne(
      `UPDATE customers 
       SET name = $1, email = COALESCE(NULLIF($2, ''), email), address = COALESCE(NULLIF($3, ''), address), updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [data.name, data.email || '', data.address || '', customer.id]
    );
  }
  return customer;
}

async function recalculateCustomerTotals(customerId, client = pool) {
  const statsRes = await client.query(
    `SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::int as spent
     FROM orders 
     WHERE customer_id = $1 AND status != 'отменен'`,
    [customerId]
  );
  const row = statsRes.rows[0];
  const orderCount = row ? row.count : 0;
  const totalSpent = row ? row.spent : 0;

  await client.query(
    `UPDATE customers 
     SET total_orders = $1, total_spent = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [orderCount, totalSpent, customerId]
  );
}

async function createOrder(orderData, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check stock
    for (const item of items) {
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [item.productId]);
      const product = prodRes.rows[0];
      if (!product) {
        throw new Error(`Товар ID ${item.productId} не найден`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Недостаточно товара "${product.name}" на складе (остаток: ${product.stock})`);
      }
    }

    // 2. Customer
    let customerRes = await client.query('SELECT * FROM customers WHERE phone = $1', [orderData.customerPhone]);
    let customer;
    if (customerRes.rows.length === 0) {
      const insCust = await client.query(
        `INSERT INTO customers (name, phone, email, address, total_orders, total_spent)
         VALUES ($1, $2, $3, $4, 0, 0)
         RETURNING *`,
        [orderData.customerName, orderData.customerPhone, orderData.customerEmail || '', orderData.customerAddress || '']
      );
      customer = insCust.rows[0];
    } else {
      customer = customerRes.rows[0];
      const updCust = await client.query(
        `UPDATE customers
         SET name = $1, email = COALESCE(NULLIF($2, ''), email), address = COALESCE(NULLIF($3, ''), address), updated_at = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [orderData.customerName, orderData.customerEmail || '', orderData.customerAddress || '', customer.id]
      );
      customer = updCust.rows[0];
    }

    // 3. Next order number
    const countRes = await client.query('SELECT COUNT(*)::int as count FROM orders');
    const nextNumber = 1001 + countRes.rows[0].count;
    const orderNumber = `ORD-${nextNumber}`;

    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const orderRes = await client.query(
      `INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, customer_email, customer_address, payment_method, comment, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'новый')
       RETURNING *`,
      [
        orderNumber,
        customer.id,
        orderData.customerName,
        orderData.customerPhone,
        orderData.customerEmail || '',
        orderData.customerAddress,
        orderData.paymentMethod || 'При получении',
        orderData.comment || '',
        totalAmount
      ]
    );
    const order = orderRes.rows[0];

    // 4. Insert items and decrement stock
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, total, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.id,
          item.productId,
          item.name,
          item.price,
          item.quantity,
          item.price * item.quantity,
          item.image_url || ''
        ]
      );

      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [item.quantity, item.productId]
      );
    }

    // 5. Recalculate customer totals
    await recalculateCustomerTotals(customer.id, client);

    await client.query('COMMIT');

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      totalAmount: order.total_amount,
      customerId: customer.id
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateOrderStatus(orderId, newStatus) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const curRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const currentOrder = curRes.rows[0];
    if (!currentOrder) {
      throw new Error('Заказ не найден');
    }

    const prevStatus = currentOrder.status;
    if (prevStatus !== newStatus) {
      const itemsRes = await client.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
      const items = itemsRes.rows;

      if (newStatus === 'отменен' && prevStatus !== 'отменен') {
        for (const it of items) {
          if (it.product_id) {
            await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [it.quantity, it.product_id]);
          }
        }
      } else if (prevStatus === 'отменен' && newStatus !== 'отменен') {
        for (const it of items) {
          if (it.product_id) {
            await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [it.quantity, it.product_id]);
          }
        }
      }

      await client.query(
        'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStatus, orderId]
      );

      await recalculateCustomerTotals(currentOrder.customer_id, client);
    }

    await client.query('COMMIT');

    const updatedRes = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    return updatedRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  queryOne,
  hashPassword,
  createOrder,
  updateOrderStatus,
  recalculateCustomerTotals,
  findOrCreateCustomer
};
