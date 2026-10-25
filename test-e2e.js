// Automated E2E Test Suite for ElectroHub Online Store & CRM
const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

let authToken = '';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (authToken && !headers['Authorization'] && !headers['Cookie']) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', err => reject(err));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function logPass(msg) {
  console.log(`  \x1b[32m✔ PASS:\x1b[0m ${msg}`);
}

function logFail(msg, detail = '') {
  console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${msg}`);
  if (detail) console.error(`    Detail:`, detail);
  process.exit(1);
}

async function runTests() {
  console.log('\n========================================================');
  console.log('🧪 ЗАПУСК АВТОМАТИЗИРОВАННОГО E2E ТЕСТИРОВАНИЯ ИНТЕРНЕТ-МАГАЗИНА');
  console.log('========================================================\n');

  try {
    // 1. Categories
    console.log('📦 ТЕСТ 1: Публичный каталог категорий');
    const catRes = await request('GET', '/api/categories');
    if (catRes.status === 200 && Array.isArray(catRes.body) && catRes.body.length >= 5) {
      logPass(`Категории загружены (${catRes.body.length} шт.): ${catRes.body.map(c => c.name).join(', ')}`);
    } else {
      logFail('Ошибка при получении категорий', catRes);
    }

    // 2. Products Listing & Search
    console.log('\n🔍 ТЕСТ 2: Каталог товаров, фильтрация и поиск');
    const prodRes = await request('GET', '/api/products');
    if (prodRes.status === 200 && Array.isArray(prodRes.body) && prodRes.body.length > 0) {
      logPass(`Список товаров загружен (${prodRes.body.length} товаров в наличии)`);
    } else {
      logFail('Ошибка при получении товаров', prodRes);
    }

    // Search query test
    const searchRes = await request('GET', '/api/products?q=iPhone');
    if (searchRes.status === 200 && searchRes.body.some(p => p.name.includes('iPhone'))) {
      logPass(`Живой поиск работает корректно: найден "${searchRes.body[0].name}"`);
    } else {
      logFail('Поиск по слову iPhone не вернул результатов', searchRes);
    }

    // Category filter test
    const filterCatRes = await request('GET', '/api/products?category=smartphones');
    if (filterCatRes.status === 200 && filterCatRes.body.length > 0) {
      logPass(`Фильтр по категории "smartphones" работает (${filterCatRes.body.length} товаров)`);
    } else {
      logFail('Фильтрация по категории не сработала', filterCatRes);
    }

    // 3. Checkout & Order Placement
    console.log('\n🛒 ТЕСТ 3: Оформление заказа и списание остатков на складе');
    const targetProduct = prodRes.body[0];
    const initialStock = targetProduct.stock;

    const orderPayload = {
      customerName: 'Сергей Тестовый',
      customerPhone: '+7 (999) 777-88-99',
      customerEmail: 'sergey.test@example.com',
      customerAddress: 'г. Москва, ул. Арбат, дом 15, кв. 3',
      paymentMethod: 'Банковской картой онлайн',
      comment: 'Тестовый заказ для E2E проверки',
      items: [
        { productId: targetProduct.id, quantity: 2 }
      ]
    };

    const orderRes = await request('POST', '/api/orders', orderPayload);
    if (orderRes.status === 201 && orderRes.body.success && orderRes.body.orderNumber) {
      logPass(`Заказ #${orderRes.body.orderNumber} успешно создан на сумму ${orderRes.body.totalAmount} ₽`);
    } else {
      logFail('Не удалось создать заказ', orderRes);
    }

    const testOrderId = orderRes.body.orderId;

    // Verify stock reduction
    const updatedProdRes = await request('GET', `/api/products/${targetProduct.id}`);
    if (updatedProdRes.body.stock === initialStock - 2) {
      logPass(`Остаток товара "${targetProduct.name}" корректно уменьшен с ${initialStock} до ${updatedProdRes.body.stock} шт.`);
    } else {
      logFail(`Остаток на складе не уменьшился (ожидалось ${initialStock - 2}, получено ${updatedProdRes.body.stock})`);
    }

    // 4. Admin Auth & Security
    console.log('\n🔒 ТЕСТ 4: Безопасность и авторизация в закрытой CRM');
    
    // Unauthorized attempt
    const unauthRes = await request('GET', '/api/admin/stats');
    if (unauthRes.status === 401) {
      logPass('Неавторизованный запрос к /api/admin/stats успешно заблокирован (401)');
    } else {
      logFail('Доступ без авторизации не заблокирован', unauthRes);
    }

    // Wrong password
    const wrongAuthRes = await request('POST', '/api/admin/login', {
      username: 'danik',
      password: 'wrong_password_123'
    });
    if (wrongAuthRes.status === 401) {
      logPass('Вход с неверным паролем отклонен (401)');
    } else {
      logFail('Вход с неверным паролем не был отклонен', wrongAuthRes);
    }

    // Correct login: danik / 20112005
    const loginRes = await request('POST', '/api/admin/login', {
      username: 'danik',
      password: '20112005'
    });
    if (loginRes.status === 200 && loginRes.body.success && loginRes.body.token) {
      authToken = loginRes.body.token;
      logPass(`Авторизация администратора danik / 20112005 прошла успешно (получен токен сессии)`);
    } else {
      logFail('Ошибка авторизации с верными учетными данными', loginRes);
    }

    // Check /api/admin/me
    const meRes = await request('GET', '/api/admin/me');
    if (meRes.status === 200 && meRes.body.user.username === 'danik') {
      logPass(`Профиль сессии подтвержден: ${meRes.body.user.fullName} (${meRes.body.user.username})`);
    } else {
      logFail('Не удалось получить профиль текущего администратора', meRes);
    }

    // 5. Admin Dashboard Stats
    console.log('\n📊 ТЕСТ 5: Статистика CRM дашборда');
    const statsRes = await request('GET', '/api/admin/stats');
    if (statsRes.status === 200 && statsRes.body.totalOrders > 0) {
      logPass(`Дашборд: Заказов: ${statsRes.body.totalOrders}, Выручка: ${statsRes.body.totalRevenue} ₽, Клиентов: ${statsRes.body.totalCustomers}`);
    } else {
      logFail('Ошибка при получении статистики дашборда', statsRes);
    }

    // 6. Product Management (Add, Edit, Delete)
    console.log('\n🛠 ТЕСТ 6: Управление товарами администратором (CRUD)');
    
    // Add product
    const newProdPayload = {
      name: 'Sony PlayStation 5 Pro Edition',
      category_id: 1,
      price: 89990,
      old_price: 99990,
      stock: 5,
      specs: 'Память: 2TB SSD | 4K 120fps | Wi-Fi 7',
      description: 'Новейшая игровая консоль с поддержкой трассировки лучей и PSSR апскейлинга.',
      image_url: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80'
    };
    const addProdRes = await request('POST', '/api/admin/products', newProdPayload);
    if (addProdRes.status === 201 && addProdRes.body.success) {
      logPass(`Товар "${addProdRes.body.product.name}" успешно добавлен в базу (ID: ${addProdRes.body.product.id})`);
    } else {
      logFail('Ошибка добавления товара', addProdRes);
    }
    const createdProdId = addProdRes.body.product.id;

    // Edit product
    const editProdRes = await request('PUT', `/api/admin/products/${createdProdId}`, {
      ...newProdPayload,
      price: 84990,
      stock: 8
    });
    if (editProdRes.status === 200 && editProdRes.body.product.price === 84990) {
      logPass(`Товар успешно отредактирован: новая цена ${editProdRes.body.product.price} ₽, остаток ${editProdRes.body.product.stock} шт.`);
    } else {
      logFail('Ошибка редактирования товара', editProdRes);
    }

    // Delete product
    const delProdRes = await request('DELETE', `/api/admin/products/${createdProdId}`);
    if (delProdRes.status === 200 && delProdRes.body.success) {
      logPass(`Товар ID ${createdProdId} успешно удален`);
    } else {
      logFail('Ошибка удаления товара', delProdRes);
    }

    // 7. Orders Processing & Status Lifecycle
    console.log('\n📋 ТЕСТ 7: Обработка заказов и смена статусов');
    const ordersListRes = await request('GET', '/api/admin/orders');
    if (ordersListRes.status === 200 && ordersListRes.body.some(o => o.id === testOrderId)) {
      logPass(`Созданный заказ ID ${testOrderId} отображается в списке заказов администратора`);
    } else {
      logFail('Созданный заказ не найден в списке заказов CRM', ordersListRes);
    }

    // Change status to "в_обработке"
    const stProcRes = await request('PATCH', `/api/admin/orders/${testOrderId}/status`, { status: 'в_обработке' });
    if (stProcRes.status === 200 && stProcRes.body.order.status === 'в_обработке') {
      logPass(`Статус заказа изменен: "в_обработке"`);
    } else {
      logFail('Ошибка смены статуса на в_обработке', stProcRes);
    }

    // Change status to "доставлен"
    const stDelivRes = await request('PATCH', `/api/admin/orders/${testOrderId}/status`, { status: 'доставлен' });
    if (stDelivRes.status === 200 && stDelivRes.body.order.status === 'доставлен') {
      logPass(`Статус заказа изменен: "доставлен"`);
    } else {
      logFail('Ошибка смены статуса на доставлен', stDelivRes);
    }

    // 8. CRM Customer Card & History
    console.log('\n👥 ТЕСТ 8: Карточки клиентов CRM, история заказов и заметки');
    const custsRes = await request('GET', '/api/admin/customers');
    const testCust = custsRes.body.find(c => c.phone === '+7 (999) 777-88-99');
    if (testCust) {
      logPass(`Клиент "${testCust.name}" найден в CRM базе (Всего заказов: ${testCust.total_orders}, LTV: ${testCust.total_spent} ₽)`);
    } else {
      logFail('Клиент из заказа не найден в CRM базе', custsRes);
    }

    // Open detailed customer card
    const custCardRes = await request('GET', `/api/admin/customers/${testCust.id}`);
    if (custCardRes.status === 200 && Array.isArray(custCardRes.body.orders) && custCardRes.body.orders.length > 0) {
      logPass(`Карточка CRM загружена: история включает ${custCardRes.body.orders.length} заказ(ов) с полным составом позиций`);
    } else {
      logFail('Ошибка загрузки детальной карточки клиента', custCardRes);
    }

    // Add CRM Note
    const addNoteRes = await request('POST', `/api/admin/customers/${testCust.id}/notes`, {
      note: 'Просил отправлять трек-номер в Telegram. Клиент доволен покупкой.'
    });
    if (addNoteRes.status === 201 && addNoteRes.body.success) {
      logPass(`CRM заметка менеджера danik успешно сохранена в истории клиента`);
    } else {
      logFail('Ошибка добавления CRM заметки', addNoteRes);
    }

    console.log('\n========================================================');
    console.log('🎉 ВСЕ ТЕСТЫ УСПЕШНО ПРОЙДЕНЫ! СИСТЕМА ПОЛНОСТЬЮ ГОТОВА К РАБОТЕ!');
    console.log('========================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('Непредвиденная ошибка при тестировании:', err);
    process.exit(1);
  }
}

// Start testing
runTests();
