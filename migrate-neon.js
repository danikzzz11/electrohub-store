require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('⏳ Подключение к базе данных Neon PostgreSQL...');
  const client = await pool.connect();
  try {
    console.log('🛠 Создание таблиц базы данных...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        icon TEXT DEFAULT 'tag'
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        price INTEGER NOT NULL,
        old_price INTEGER,
        stock INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        specs TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        address TEXT,
        total_orders INTEGER DEFAULT 0,
        total_spent INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        customer_address TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        comment TEXT,
        total_amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'новый',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        total INTEGER NOT NULL,
        image_url TEXT
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crm_notes (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        author TEXT DEFAULT 'danik',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    `);

    // Ensure Admin user exists: danik / 20112005
    const adminCheck = await client.query('SELECT * FROM admin_users WHERE username = $1', ['danik']);
    if (adminCheck.rows.length === 0) {
      const hash = crypto.createHash('sha256').update('20112005').digest('hex');
      await client.query(
        'INSERT INTO admin_users (username, password_hash, full_name) VALUES ($1, $2, $3)',
        ['danik', hash, 'Даниил (Администратор CRM)']
      );
      console.log('✅ Администратор danik создан.');
    }

    // Categories list (8 categories)
    const categoriesList = [
      { name: 'Смартфоны', slug: 'smartphones', icon: 'smartphone' },
      { name: 'Ноутбуки', slug: 'laptops', icon: 'laptop' },
      { name: 'Планшеты', slug: 'tablets', icon: 'tablet' },
      { name: 'Аудио', slug: 'audio', icon: 'headphones' },
      { name: 'Умные часы', slug: 'smartwatches', icon: 'watch' },
      { name: 'Гейминг', slug: 'gaming', icon: 'gamepad-2' },
      { name: 'Умный дом', slug: 'smart_home', icon: 'home' },
      { name: 'Аксессуары', slug: 'accessories', icon: 'cable' }
    ];

    for (const cat of categoriesList) {
      await client.query(`
        INSERT INTO categories (name, slug, icon)
        VALUES ($1, $2, $3)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon
      `, [cat.name, cat.slug, cat.icon]);
    }

    const catRows = await client.query('SELECT id, slug FROM categories');
    const catMap = {};
    for (const r of catRows.rows) {
      catMap[r.slug] = r.id;
    }

    // 46 High-Quality Products
    const products = [
      // Смартфоны
      {
        name: 'Apple iPhone 15 Pro Max 256GB Titanium',
        category: 'smartphones',
        price: 139990,
        old_price: 154990,
        stock: 14,
        description: 'Флагманский смартфон в легком титановом корпусе с процессором A17 Pro, продвинутой 48 Мп камерой и USB-C.',
        specs: '256 ГБ | 6.7" OLED 120 Гц | Чип: A17 Pro | Камера: 48+12+12 Мп',
        image_url: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Apple iPhone 16 Pro 128GB Black Titanium',
        category: 'smartphones',
        price: 149990,
        old_price: 162990,
        stock: 10,
        description: 'Новейший флагман с улучшенным чипом A18 Pro, кнопкой Camera Control и титановым матовым корпусом.',
        specs: '128 ГБ | 6.3" Super Retina XDR 120 Гц | A18 Pro | Camera Control',
        image_url: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Samsung Galaxy S24 Ultra 512GB Titanium Gray',
        category: 'smartphones',
        price: 129990,
        old_price: 144990,
        stock: 9,
        description: 'Ультрасовременный смартфон со встроенным стилусом S Pen, искусственным интеллектом Galaxy AI и 200 Мп камерой.',
        specs: '512 ГБ | 6.8" AMOLED 2X 120 Гц | S Pen | 200 Мп | Galaxy AI',
        image_url: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Samsung Galaxy S24+ 256GB Cobalt Violet',
        category: 'smartphones',
        price: 94990,
        old_price: 104990,
        stock: 15,
        description: 'Идеальный баланс размера и мощности: 6.7" экран, батарея 4900 мАч и расширенные функции фотосъемки.',
        specs: '256 ГБ | 6.7" Dynamic AMOLED 2X | Exynos 2400 | 50 Мп',
        image_url: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Xiaomi 14 Pro 12/256GB Black',
        category: 'smartphones',
        price: 84990,
        old_price: 94990,
        stock: 18,
        description: 'Мощный флагман с оптикой Leica Summilux, процессором Snapdragon 8 Gen 3 и сверхбыстрой зарядкой 120W.',
        specs: '256 ГБ | RAM: 12 ГБ | Snapdragon 8 Gen 3 | Leica 50 Мп | 120W',
        image_url: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Google Pixel 8 Pro 128GB Obsidian',
        category: 'smartphones',
        price: 89990,
        old_price: 99990,
        stock: 11,
        description: 'Смартфон от Google с эталонной мобильной камерой, чипом Tensor G3 и фирменным чистым Android.',
        specs: '128 ГБ | 6.7" LTPO OLED | Google Tensor G3 | Камера Google AI',
        image_url: 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'OnePlus 12 16/512GB Silky Black',
        category: 'smartphones',
        price: 82990,
        old_price: 89990,
        stock: 13,
        description: 'Скорость и плавность без компромиссов: 2K дисплей, камера Hasselblad 4-го поколения и зарядка 100W.',
        specs: '512 ГБ | RAM: 16 ГБ | 2K AMOLED 120 Гц | Камера Hasselblad | 100W',
        image_url: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Nothing Phone (2) 12/256GB Dark Grey',
        category: 'smartphones',
        price: 64990,
        old_price: 72990,
        stock: 16,
        description: 'Уникальный прозрачный дизайн с настраиваемым светодиодным интерфейсом Glyph и экраном LTPO OLED.',
        specs: '256 ГБ | RAM: 12 ГБ | Glyph Interface подсветка | 6.7" OLED 120 Гц',
        image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80'
      },

      // Ноутбуки
      {
        name: 'Apple MacBook Pro 16 M3 Pro 18/512GB Space Black',
        category: 'laptops',
        price: 249990,
        old_price: 279990,
        stock: 6,
        description: 'Профессиональный ноутбук для сложнейших задач. Потрясающий экран Liquid Retina XDR и до 22 часов автономной работы.',
        specs: 'M3 Pro 12-core | 18 ГБ RAM | 512 ГБ SSD | 16.2" Liquid Retina XDR',
        image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Apple MacBook Air 15 M3 16/512GB Midnight',
        category: 'laptops',
        price: 164990,
        old_price: 179990,
        stock: 12,
        description: 'Большой 15-дюймовый дисплей в ультратонком бесшумном корпусе толщиной всего 11.5 мм.',
        specs: 'M3 8-core | 16 ГБ RAM | 512 ГБ SSD | 15.3" Liquid Retina',
        image_url: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'ASUS ROG Zephyrus G16 OLED Gaming',
        category: 'laptops',
        price: 199990,
        old_price: 219990,
        stock: 4,
        description: 'Тонкий и мощный геймерский ноутбук с OLED 240 Гц экраном, видеокартой RTX 4070 и процессором Intel Core Ultra 9.',
        specs: '16" 2.5K OLED 240Hz | Core Ultra 9 | RTX 4070 8GB | 1TB SSD',
        image_url: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Lenovo ThinkPad X1 Carbon Gen 11',
        category: 'laptops',
        price: 169990,
        old_price: null,
        stock: 8,
        description: 'Эталон бизнес-ультрабука в сверхлегком корпусе из углеродного волокна с легендарной клавиатурой ThinkPad.',
        specs: '14" WUXGA IPS | Intel Core i7-1365U | 16 ГБ RAM | 512 ГБ SSD | 1.12 кг',
        image_url: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Dell XPS 15 9530 OLED Touch',
        category: 'laptops',
        price: 219990,
        old_price: 239990,
        stock: 5,
        description: 'Премиальный ноутбук для создателей контента с сенсорным 3.5K OLED дисплеем и видеокартой RTX 4060.',
        specs: '15.6" 3.5K OLED Touch | Core i9-13900H | RTX 4060 | 32 ГБ RAM | 1TB',
        image_url: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'HP Spectre x360 14 2-in-1 OLED',
        category: 'laptops',
        price: 154990,
        old_price: 169990,
        stock: 7,
        description: 'Элегантный трансформер с экраном 360°, сенсорным 2.8K OLED дисплеем и стилусом в комплекте.',
        specs: '14" 2.8K OLED Сенсорный 360° | Core Ultra 7 | 16 ГБ | 1TB SSD | Стилус',
        image_url: 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Acer Predator Helios 16 Gaming Laptop',
        category: 'laptops',
        price: 174990,
        old_price: 189990,
        stock: 6,
        description: 'Максимальная игровая производительность с охлаждением жидким металлом и экраном 240 Гц.',
        specs: '16" WQXGA 240Hz | Core i7-14700HX | RTX 4070 | 16 ГБ DDR5 | 1TB SSD',
        image_url: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=800&q=80'
      },

      // Планшеты
      {
        name: 'Apple iPad Pro 11 M4 256GB Space Black',
        category: 'tablets',
        price: 119990,
        old_price: 134990,
        stock: 9,
        description: 'Революционный планшет с процессором Apple M4 и революционным дисплеем Ultra Retina XDR Tandem OLED.',
        specs: 'Чип Apple M4 | Ultra Retina XDR Tandem OLED | 256 ГБ | Толщина 5.3 мм',
        image_url: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Apple iPad Air 13 M2 128GB Starlight',
        category: 'tablets',
        price: 89990,
        old_price: 98990,
        stock: 14,
        description: 'Большой 13-дюймовый дисплей Liquid Retina и мощный чип M2 для творчества, учебы и работы.',
        specs: '13" Liquid Retina | Чип M2 | 128 ГБ | Поддержка Apple Pencil Pro',
        image_url: 'https://images.unsplash.com/photo-1561154464-82e9adf32764?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Samsung Galaxy Tab S9 Ultra 512GB Graphite',
        category: 'tablets',
        price: 114990,
        old_price: 129990,
        stock: 8,
        description: 'Огромный 14.6" AMOLED дисплей со стилусом S Pen и влагозащитой IP68 для комфортной работы в любых условиях.',
        specs: '14.6" Dynamic AMOLED 2X 120Hz | S Pen | Snapdragon 8 Gen 2 | IP68',
        image_url: 'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Xiaomi Pad 6S Pro 12.4 8/256GB',
        category: 'tablets',
        price: 54990,
        old_price: 62990,
        stock: 18,
        description: 'Большой планшет с экраном 3K 144 Гц, 6 динамиками и аккумулятором 10000 мАч со сверхбыстрой зарядкой 120W.',
        specs: '12.4" 3K 144Hz | Snapdragon 8 Gen 2 | 10000 мАч | 120W зарядка',
        image_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80'
      },

      // Аудио
      {
        name: 'Sony WH-1000XM5 Wireless Noise Cancelling',
        category: 'audio',
        price: 36990,
        old_price: 42990,
        stock: 22,
        description: 'Беспроводные полноразмерные наушники с лучшим на рынке активным шумоподавлением и поддержкой LDAC Hi-Res Audio.',
        specs: 'Шумоподавление: 8 микрофонов Auto NC | Автономность: до 30 ч | Быстрая зарядка: 3 мин = 3 часа',
        image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Apple AirPods Max Space Gray',
        category: 'audio',
        price: 64990,
        old_price: 71990,
        stock: 7,
        description: 'Премиальные накладные наушники от Apple с пространственным звуком, динамическим отслеживанием головы и алюминиевым корпусом.',
        specs: '40 мм драйвер Apple | Чип: Apple H1 в каждой чашке | Пространственное аудио | Smart Case',
        image_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Apple AirPods Pro 2 с кейсом USB-C MagSafe',
        category: 'audio',
        price: 24990,
        old_price: 27990,
        stock: 35,
        description: 'Легендарные TWS-наушники с адаптивным аудио, улучшенным шумоподавлением и поддержкой поиска через Локатор.',
        specs: 'Чип H2 | Адаптивное шумоподавление | Сенсор громкости | Защита IP54',
        image_url: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Marshall Stanmore III Bluetooth Speaker',
        category: 'audio',
        price: 41990,
        old_price: null,
        stock: 11,
        description: 'Легендарная домашняя колонка с винтажным рок-н-ролльным дизайном и захватывающим стереозвучанием.',
        specs: '80 Вт мощность | Bluetooth 5.2 | RCA и 3.5 мм | Аналоговые ручки Bass/Treble',
        image_url: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Bose QuietComfort Ultra Headphones',
        category: 'audio',
        price: 44990,
        old_price: 49990,
        stock: 14,
        description: 'Флагманские наушники Bose с пространственным звучанием Immersive Audio и мягким оголовьем для долгого комфорта.',
        specs: 'Bose Immersive Audio | Режим Aware | До 24 часов работы | Мягкая посадка',
        image_url: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Sennheiser Momentum 4 Wireless Black',
        category: 'audio',
        price: 34990,
        old_price: 39990,
        stock: 16,
        description: 'Премиальные наушники с аудифильским звучанием и рекордным временем автономной работы до 60 часов.',
        specs: 'Рекордные 60 часов автономности | 42 мм излучатели | Адаптивный ANC',
        image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Портативная колонка JBL Boombox 3 Black',
        category: 'audio',
        price: 47990,
        old_price: 52990,
        stock: 9,
        description: 'Мощный глубокий бас, прочный влагозащитный корпус IP67 и встроенный пауэрбанк для вечеринок на открытом воздухе.',
        specs: '180 Вт RMS | Мощный глубокий бас | Защита от воды IP67 | До 24 часов музыки',
        image_url: 'https://images.unsplash.com/photo-1524678606370-a47ad25cb82a?auto=format&fit=crop&w=800&q=80'
      },

      // Умные часы
      {
        name: 'Apple Watch Ultra 2 GPS + Cellular 49mm',
        category: 'smartwatches',
        price: 89990,
        old_price: 99990,
        stock: 12,
        description: 'Самые прочные и функциональные часы Apple для экстремального спорта, туризма и дайвинга с титановым корпусом.',
        specs: '49 мм Титан | Яркость 3000 нит | Водонепроницаемость 100 м | Автономность: до 72 ч',
        image_url: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Apple Watch Series 9 GPS 45mm Midnight',
        category: 'smartwatches',
        price: 44990,
        old_price: 49990,
        stock: 20,
        description: 'Смарт-часы с новым жестом Double Tap, ярким экраном 2000 нит и комплексным мониторингом здоровья.',
        specs: 'Чип S9 SiP | Жест Double Tap | Яркость 2000 нит | ЭКГ и SpO2',
        image_url: 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Samsung Galaxy Watch 6 Classic 47mm Black',
        category: 'smartwatches',
        price: 32990,
        old_price: 37990,
        stock: 15,
        description: 'Классические смарт-часы с вращающимся безелем, мониторингом состава тела, ЭКГ и измерением давления.',
        specs: '1.5" Super AMOLED | Вращающийся безель | ЭКГ, давление, анализ состава тела',
        image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Garmin Fenix 7 Pro Sapphire Solar 47mm',
        category: 'smartwatches',
        price: 94990,
        old_price: 104990,
        stock: 8,
        description: 'Премиум часы для триатлона и походов с подзарядкой от солнца, картографией TopoActive и встроенным светодиодным фонариком.',
        specs: 'Сапфировое стекло с солнечной подзарядкой | Карты TopoActive | Фонарик | До 22 дней',
        image_url: 'https://images.unsplash.com/photo-1510017803434-a899398421b3?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Huawei Watch Ultimate Voyage Blue',
        category: 'smartwatches',
        price: 69990,
        old_price: 79990,
        stock: 10,
        description: 'Корпус из уникального сплава «жидкий металл», погружение под воду на глубину до 100 метров и до 14 дней автономности.',
        specs: 'Корпус из сплава «жидкий металл» | Погружение до 100 м | Экспедиционный режим | До 14 дней',
        image_url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80'
      },

      // Гейминг
      {
        name: 'Sony PlayStation 5 Slim 1TB + 2 геймпада DualSense',
        category: 'gaming',
        price: 64990,
        old_price: 71990,
        stock: 14,
        description: 'Компактная обновленная версия PS5 со встроенным накопителем 1TB SSD и двумя оригинальными геймпадами в комплекте.',
        specs: '1TB SSD | 4K 120Hz | Ray Tracing | 2 беспроводных геймпада в комплекте',
        image_url: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Microsoft Xbox Series X 1TB Black',
        category: 'gaming',
        price: 59990,
        old_price: 66990,
        stock: 11,
        description: 'Самая мощная консоль Xbox с графикой 12 терафлопс, молниеносным SSD и поддержкой обратной совместимости.',
        specs: '12 TFLOPS графики | 1TB NVMe SSD | Быстрое переключение Quick Resume | 4K 120fps',
        image_url: 'https://images.unsplash.com/photo-1621259182978-fbf93132d53d?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Nintendo Switch OLED Model White',
        category: 'gaming',
        price: 34990,
        old_price: 38990,
        stock: 19,
        description: 'Яркий 7-дюймовый OLED-дисплей, улучшенная встроенная аудиосистема и широкая регулируемая опора для настольного режима.',
        specs: '7" яркий OLED экран | 64 ГБ памяти | Улучшенный звук | Регулируемая опора',
        image_url: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Портативная консоль Valve Steam Deck OLED 512GB',
        category: 'gaming',
        price: 74990,
        old_price: 82990,
        stock: 8,
        description: 'Полноценный ПК-гейминг в ваших руках: роскошный HDR OLED 90 Гц экран, емкая батарея и быстрый Wi-Fi 6E.',
        specs: '7.4" HDR OLED 90Hz | 6-нм кастомный APU | 512 ГБ NVMe | Батарея 50 Вт·ч',
        image_url: 'https://images.unsplash.com/photo-1612287232230-67e4f0c4068c?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Беспроводной геймпад Sony DualSense Edge',
        category: 'gaming',
        price: 24990,
        old_price: 27990,
        stock: 23,
        description: 'Профессиональный контроллер для PlayStation 5 со сменными стиками, настраиваемыми триггерами и задними лепестками.',
        specs: 'Сменные модули джойстиков | Настраиваемые триггеры | Задние лепестки | Чехол',
        image_url: 'https://images.unsplash.com/photo-1592840496694-26d035b52b48?auto=format&fit=crop&w=800&q=80'
      },

      // Умный дом
      {
        name: 'Робот-пылесос Roborock S8 Pro Ultra Black',
        category: 'smart_home',
        price: 109990,
        old_price: 124990,
        stock: 7,
        description: 'Флагманский робот-уборщик с автоматической очисткой контейнера, полосканием швабры горячей водой и сушкой горячим воздухом.',
        specs: 'Станция самоочистки RockDock Ultra | Всасывание 6000 Па | Двойная виброшвабра',
        image_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Умная колонка Яндекс Станция Дуо Макс с Алисой',
        category: 'smart_home',
        price: 42990,
        old_price: 46990,
        stock: 15,
        description: 'Первая Станция с поворотным сенсорным экраном, мощным звуком 60 Вт и встроенным хабом Zigbee для умного дома.',
        specs: 'Поворотный Full HD дисплей 10.5" | Звук 60 Вт | Встроенный хаб Zigbee | Камера',
        image_url: 'https://images.unsplash.com/photo-1543512214-318c7553f230?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Медиаплеер Apple TV 4K 128GB Wi-Fi + Ethernet',
        category: 'smart_home',
        price: 18990,
        old_price: 21990,
        stock: 25,
        description: 'Кинематографический опыт с чипом A15 Bionic, Dolby Atmos, поддержкой умного дома Thread и пультом Siri Remote.',
        specs: 'Чип A15 Bionic | Поддержка HDR10+ и Dolby Vision | Пульт Siri Remote Type-C',
        image_url: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Очиститель воздуха Xiaomi Smart Air Purifier 4 Pro',
        category: 'smart_home',
        price: 21990,
        old_price: 24990,
        stock: 17,
        description: 'Эффективная очистка воздуха в помещениях до 60 м², лазерный датчик частиц и управление со смартфона.',
        specs: 'Площадь до 60 м² | CADR 500 м³/ч | Фильтр 3-в-1 с углём | OLED экран | Тихий режим',
        image_url: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&w=800&q=80'
      },

      // Аксессуары
      {
        name: 'Сетевое зарядное устройство Anker Prime 67W GaN',
        category: 'accessories',
        price: 4990,
        old_price: 5990,
        stock: 45,
        description: 'Компактное ультрамощное GaN зарядное устройство с 3 портами (2x USB-C + USB-A) для одновременной зарядки ноутбука и смартфона.',
        specs: 'Мощность: 67 Вт GaNPrime | Порты: 2x Type-C, 1x USB-A | Защита: ActiveShield 2.0',
        image_url: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Беспроводная мышь Logitech MX Master 3S',
        category: 'accessories',
        price: 11990,
        old_price: 13990,
        stock: 28,
        description: 'Эталон эргономичной мыши для продуктивной работы с электромагнитным колесом MagSpeed и тихими кликами.',
        specs: 'Сенсор: 8000 DPI Darkfield (работает на стекле) | Скролл: MagSpeed 1000 строк/сек | До 70 дней работы',
        image_url: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Внешний аккумулятор Baseus Blade 100W 20000mAh',
        category: 'accessories',
        price: 7490,
        old_price: 8990,
        stock: 33,
        description: 'Ультратонкий пауэрбанк толщиной всего 18 мм с цифровым дисплеем мощности и быстрой зарядкой ноутбуков до 100 Вт.',
        specs: 'Емкость: 20000 мАч | Выход: 100W Power Delivery | Дисплей времени и мощности | 4 порта',
        image_url: 'https://images.unsplash.com/photo-1609592807693-5162a7442111?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Клавиатура Apple Magic Keyboard с Touch ID и цифровой панелью',
        category: 'accessories',
        price: 19990,
        old_price: 22990,
        stock: 16,
        description: 'Встроенный сканер отпечатков Touch ID для быстрой авторизации, тихий ножничный механизм и месяц автономной работы.',
        specs: 'Встроенный сканер Touch ID | Ножничный механизм | Месяц автономности | Кабель в оплётке',
        image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Беспроводная зарядная станция Belkin BoostCharge Pro 3-in-1 MagSafe 15W',
        category: 'accessories',
        price: 16990,
        old_price: 19990,
        stock: 14,
        description: 'Официальная быстрая беспроводная зарядка 15W для iPhone, Apple Watch и футляра AirPods одновременно.',
        specs: 'Официальный MagSafe 15W | Быстрая зарядка Apple Watch | Зарядка AirPods | Премиум сталь',
        image_url: 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?auto=format&fit=crop&w=800&q=80'
      },
      {
        name: 'Многофункциональный хаб Satechi Pro Hub Max USB4',
        category: 'accessories',
        price: 9990,
        old_price: 11990,
        stock: 22,
        description: 'Фирменный алюминиевый адаптер для расширения портов MacBook Pro с портом USB4 до 40 Гбит/с.',
        specs: 'USB4 до 40 Гбит/с | HDMI 4K 60Hz | Gigabit Ethernet | SD/microSD | Аудио 3.5 мм',
        image_url: 'https://images.unsplash.com/photo-1622434641406-a158123450f9?auto=format&fit=crop&w=800&q=80'
      }
    ];

    console.log(`📦 Заполнение каталога (${products.length} товаров)...`);

    for (const p of products) {
      const catId = catMap[p.category];
      if (!catId) continue;
      
      const check = await client.query('SELECT id FROM products WHERE name = $1', [p.name]);
      if (check.rows.length === 0) {
        await client.query(`
          INSERT INTO products (name, category_id, price, old_price, stock, description, specs, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [p.name, catId, p.price, p.old_price, p.stock, p.description, p.specs, p.image_url]);
      }
    }

    // Seed sample customers & orders if none
    const custCountRes = await client.query('SELECT count(*) as c FROM customers');
    if (parseInt(custCountRes.rows[0].c, 10) === 0) {
      console.log('👥 Добавление демо-клиентов и заказов в CRM...');

      const c1 = await client.query(`
        INSERT INTO customers (name, phone, email, address, total_orders, total_spent, notes)
        VALUES ($1, $2, $3, $4, 1, 204980, $5)
        RETURNING id
      `, [
        'Алексей Смирнов',
        '+7 (999) 111-22-33',
        'alexey.smirnov@example.com',
        'г. Москва, ул. Тверская 12, кв. 45',
        'VIP-клиент. Предпочитает вечернюю курьерскую доставку после 19:00.'
      ]);

      const c2 = await client.query(`
        INSERT INTO customers (name, phone, email, address, total_orders, total_spent, notes)
        VALUES ($1, $2, $3, $4, 1, 41980, $5)
        RETURNING id
      `, [
        'Екатерина Иванова',
        '+7 (999) 222-33-44',
        'kate.iva@example.com',
        'г. Санкт-Петербург, Невский пр. 54, кв. 10',
        'Просила звонить курьеру за 1 час до доставки.'
      ]);

      const c3 = await client.query(`
        INSERT INTO customers (name, phone, email, address, total_orders, total_spent, notes)
        VALUES ($1, $2, $3, $4, 1, 249990, $5)
        RETURNING id
      `, [
        'Дмитрий Соколов',
        '+7 (999) 333-44-55',
        'd.sokolov@example.com',
        'г. Казань, ул. Баумана 28, кв. 7',
        'Постоянный корпоративный заказчик.'
      ]);

      // Seed orders
      await client.query(`
        INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, customer_email, customer_address, payment_method, comment, total_amount, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        'ORD-1001',
        c1.rows[0].id,
        'Алексей Смирнов',
        '+7 (999) 111-22-33',
        'alexey.smirnov@example.com',
        'г. Москва, ул. Тверская 12, кв. 45',
        'Картой онлайн',
        'Оставить консьержу',
        204980,
        'доставлен'
      ]);

      await client.query(`
        INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, customer_email, customer_address, payment_method, comment, total_amount, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        'ORD-1002',
        c2.rows[0].id,
        'Екатерина Иванова',
        '+7 (999) 222-33-44',
        'kate.iva@example.com',
        'г. Санкт-Петербург, Невский пр. 54, кв. 10',
        'При получении',
        'Домофон 10В',
        41980,
        'в_обработке'
      ]);

      await client.query(`
        INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, customer_email, customer_address, payment_method, comment, total_amount, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        'ORD-1003',
        c3.rows[0].id,
        'Дмитрий Соколов',
        '+7 (999) 333-44-55',
        'd.sokolov@example.com',
        'г. Казань, ул. Баумана 28, кв. 7',
        'Онлайн картой',
        'Срочная доставка',
        249990,
        'новый'
      ]);

      // Seed notes
      await client.query(`
        INSERT INTO crm_notes (customer_id, note, author)
        VALUES ($1, $2, $3)
      `, [c1.rows[0].id, 'Клиент оставил отличный отзыв о доставке!', 'danik']);
    }

    const totalProds = await client.query('SELECT count(*) as c FROM products');
    const totalCats = await client.query('SELECT count(*) as c FROM categories');
    console.log(`🎉 Миграция успешно завершена! В базе: ${totalCats.rows[0].c} категорий, ${totalProds.rows[0].c} товаров.`);

  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
