// Storefront Client Logic
let currentCategory = '';
let currentSearch = '';
let currentSort = 'newest';
let onlyInStock = false;
let cart = JSON.parse(localStorage.getItem('electro_cart_items') || '[]');
let productsCache = [];
let quickViewProduct = null;

// -----------------------------------------------------------------------------
// MULTI-CURRENCY SUPPORT
// -----------------------------------------------------------------------------
const CURRENCIES = {
  RUB: { code: 'RUB', symbol: '₽', rate: 1, flag: '🇷🇺', label: 'RUB (₽)', decimals: 0 },
  USD: { code: 'USD', symbol: '$', rate: 0.0108, flag: '🇺🇸', label: 'USD ($)', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', rate: 0.0098, flag: '🇪🇺', label: 'EUR (€)', decimals: 2 },
  KZT: { code: 'KZT', symbol: '₸', rate: 5.15, flag: '🇰🇿', label: 'KZT (₸)', decimals: 0 },
  BYN: { code: 'BYN', symbol: 'Br', rate: 0.035, flag: '🇧🇾', label: 'BYN (Br)', decimals: 2 },
  TRY: { code: 'TRY', symbol: '₺', rate: 0.37, flag: '🇹🇷', label: 'TRY (₺)', decimals: 2 },
  AED: { code: 'AED', symbol: 'د.إ', rate: 0.0397, flag: '🇦🇪', label: 'AED (د.إ)', decimals: 2 }
};
let currentCurrency = localStorage.getItem('electro_currency') || 'RUB';

// Currency Formatter
function formatPrice(num) {
  if (num === null || num === undefined) return '';
  const curr = CURRENCIES[currentCurrency] || CURRENCIES.RUB;
  const converted = num * curr.rate;
  
  let formatted;
  if (curr.decimals === 0) {
    formatted = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(converted));
  } else {
    formatted = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(converted);
  }

  if (curr.symbol === '$' || curr.symbol === '€') {
    return `${curr.symbol} ${formatted}`;
  }
  return `${formatted} ${curr.symbol}`;
}

function setCurrency(code) {
  if (!CURRENCIES[code]) return;
  currentCurrency = code;
  localStorage.setItem('electro_currency', code);
  updateCurrencyUI();
  loadProducts();
  renderCartDrawer();
  if (quickViewProduct) openQuickView(quickViewProduct.id);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const checkoutTotalDisplay = document.getElementById('checkoutTotalDisplay');
  if (checkoutTotalDisplay) {
    checkoutTotalDisplay.textContent = formatPrice(total);
  }

  const dropdown = document.getElementById('currencyDropdownMenu');
  if (dropdown) dropdown.classList.add('hidden');

  showToast(`Валюта переключена на ${CURRENCIES[code].label}`, 'info');
}

function updateCurrencyUI() {
  const curr = CURRENCIES[currentCurrency] || CURRENCIES.RUB;
  const flagEl = document.getElementById('currentCurrencyFlag');
  const labelEl = document.getElementById('currentCurrencyLabel');
  if (flagEl) flagEl.textContent = curr.flag;
  if (labelEl) labelEl.textContent = curr.label;
}

// -----------------------------------------------------------------------------
// PHONE COUNTRY ROULETTE
// -----------------------------------------------------------------------------
const COUNTRIES = [
  { name: 'Россия', code: 'RU', dial: '+7', flag: '🇷🇺', placeholder: '(999) 123-45-67' },
  { name: 'Беларусь', code: 'BY', dial: '+375', flag: '🇧🇾', placeholder: '(29) 123-45-67' },
  { name: 'Казахстан', code: 'KZ', dial: '+7', flag: '🇰🇿', placeholder: '(701) 123-45-67' },
  { name: 'Узбекистан', code: 'UZ', dial: '+998', flag: '🇺🇿', placeholder: '90 123-45-67' },
  { name: 'Кыргызстан', code: 'KG', dial: '+996', flag: '🇰🇬', placeholder: '555 123-456' },
  { name: 'Армения', code: 'AM', dial: '+374', flag: '🇦🇲', placeholder: '91 123-456' },
  { name: 'Грузия', code: 'GE', dial: '+995', flag: '🇬🇪', placeholder: '599 12-34-56' },
  { name: 'Азербайджан', code: 'AZ', dial: '+994', flag: '🇦🇿', placeholder: '50 123-45-67' },
  { name: 'Таджикистан', code: 'TJ', dial: '+992', flag: '🇹🇯', placeholder: '90 123-4567' },
  { name: 'Молдова', code: 'MD', dial: '+373', flag: '🇲🇩', placeholder: '69 123-456' },
  { name: 'Турция', code: 'TR', dial: '+90', flag: '🇹🇷', placeholder: '532 123-4567' },
  { name: 'ОАЭ (Дубай)', code: 'AE', dial: '+971', flag: '🇦🇪', placeholder: '50 123-4567' },
  { name: 'США / Канада', code: 'US', dial: '+1', flag: '🇺🇸', placeholder: '(555) 123-4567' },
  { name: 'Германия', code: 'DE', dial: '+49', flag: '🇩🇪', placeholder: '151 1234567' },
  { name: 'Великобритания', code: 'GB', dial: '+44', flag: '🇬🇧', placeholder: '7911 123456' },
  { name: 'Франция', code: 'FR', dial: '+33', flag: '🇫🇷', placeholder: '6 12 34 56 78' },
  { name: 'Израиль', code: 'IL', dial: '+972', flag: '🇮🇱', placeholder: '50-123-4567' },
  { name: 'Китай', code: 'CN', dial: '+86', flag: '🇨🇳', placeholder: '138 0000 0000' },
  { name: 'Польша', code: 'PL', dial: '+48', flag: '🇵🇱', placeholder: '501 123 456' },
  { name: 'Италия', code: 'IT', dial: '+39', flag: '🇮🇹', placeholder: '320 123 4567' },
  { name: 'Испания', code: 'ES', dial: '+34', flag: '🇪🇸', placeholder: '612 34 56 78' }
];

let selectedCountry = COUNTRIES[0]; // Russia default

function renderCountriesRoulette(search = '') {
  const container = document.getElementById('countriesListContainer');
  if (!container) return;

  const query = search.trim().toLowerCase();
  const filtered = COUNTRIES.filter(c => 
    c.name.toLowerCase().includes(query) || 
    c.dial.includes(query) ||
    c.code.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    container.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Страна не найдена</div>';
    return;
  }

  container.innerHTML = filtered.map(c => `
    <div 
      onclick="selectCountry('${c.code}')" 
      class="px-3 py-2 flex items-center justify-between hover:bg-blue-50 cursor-pointer rounded-xl transition-colors select-none ${selectedCountry.code === c.code ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700'}"
    >
      <div class="flex items-center gap-2 text-xs truncate">
        <span class="text-base">${c.flag}</span>
        <span class="truncate">${c.name}</span>
      </div>
      <span class="font-mono text-xs text-slate-500 font-semibold ml-2">${c.dial}</span>
    </div>
  `).join('');
}

function selectCountry(code) {
  const country = COUNTRIES.find(c => c.code === code);
  if (!country) return;

  selectedCountry = country;
  document.getElementById('selectedCountryFlag').textContent = country.flag;
  document.getElementById('selectedCountryDial').textContent = country.dial;
  
  const phoneInput = document.getElementById('phoneLocalInput');
  phoneInput.placeholder = country.placeholder;
  
  updateFullPhone();
  
  document.getElementById('countryDropdownMenu').classList.add('hidden');
  phoneInput.focus();
}

function updateFullPhone() {
  const localVal = document.getElementById('phoneLocalInput')?.value.trim() || '';
  const hiddenInput = document.getElementById('fullPhoneHidden');
  if (hiddenInput) {
    hiddenInput.value = localVal ? `${selectedCountry.dial} ${localVal}` : '';
  }
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  
  let bg = 'bg-slate-900 text-white';
  let icon = 'info';
  if (type === 'success') {
    bg = 'bg-emerald-600 text-white';
    icon = 'check-circle';
  } else if (type === 'error') {
    bg = 'bg-rose-600 text-white';
    icon = 'alert-triangle';
  }

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium ${bg} toast-enter pointer-events-auto`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-5 h-5 flex-shrink-0"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// -----------------------------------------------------------------------------
// CART MANAGEMENT
// -----------------------------------------------------------------------------
function saveCart() {
  localStorage.setItem('electro_cart_items', JSON.stringify(cart));
  updateCartBadge();
  renderCartDrawer();
}

function updateCartBadge() {
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const badge = document.getElementById('cartCountBadge');
  const drawerBadge = document.getElementById('drawerItemsCount');
  
  badge.textContent = totalCount;
  if (drawerBadge) drawerBadge.textContent = totalCount;
  
  if (totalCount > 0) {
    badge.classList.remove('opacity-0');
  }
}

function addToCart(product, quantity = 1) {
  if (product.stock <= 0) {
    showToast(`Товара "${product.name}" нет в наличии`, 'error');
    return;
  }

  const existing = cart.find(it => it.productId === product.id);
  if (existing) {
    if (existing.quantity + quantity > product.stock) {
      showToast(`На складе доступно максимум ${product.stock} шт.`, 'error');
      return;
    }
    existing.quantity += quantity;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      stock: product.stock,
      quantity: quantity
    });
  }

  saveCart();
  showToast(`«${product.name}» добавлен в корзину!`, 'success');
}

function updateCartQuantity(productId, delta) {
  const item = cart.find(it => it.productId === productId);
  if (!item) return;

  const newQty = item.quantity + delta;
  if (newQty <= 0) {
    removeFromCart(productId);
    return;
  }

  if (newQty > item.stock) {
    showToast(`На складе доступно только ${item.stock} шт.`, 'error');
    return;
  }

  item.quantity = newQty;
  saveCart();
}

function removeFromCart(productId) {
  cart = cart.filter(it => it.productId !== productId);
  saveCart();
  showToast('Товар удален из корзины', 'info');
}

function openCartDrawer() {
  renderCartDrawer();
  const backdrop = document.getElementById('cartDrawerBackdrop');
  const drawer = document.getElementById('cartDrawer');
  
  backdrop.classList.remove('opacity-0', 'pointer-events-none');
  backdrop.classList.add('opacity-100');
  drawer.classList.remove('translate-x-full');
}

function closeCartDrawer() {
  const backdrop = document.getElementById('cartDrawerBackdrop');
  const drawer = document.getElementById('cartDrawer');
  
  backdrop.classList.add('opacity-0', 'pointer-events-none');
  backdrop.classList.remove('opacity-100');
  drawer.classList.add('translate-x-full');
}

function renderCartDrawer() {
  const container = document.getElementById('cartItemsContainer');
  const emptyMsg = document.getElementById('emptyCartMessage');
  const footer = document.getElementById('cartFooter');
  const subtotalEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');

  if (cart.length === 0) {
    container.innerHTML = '';
    emptyMsg.classList.remove('hidden');
    footer.classList.add('hidden');
    return;
  }

  emptyMsg.classList.add('hidden');
  footer.classList.remove('hidden');

  let subtotal = 0;
  container.innerHTML = cart.map(item => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;
    return `
      <div class="flex items-center gap-2.5 bg-slate-50 p-2 rounded-xl border border-slate-200">
        <img src="${item.image_url}" alt="${item.name}" class="w-12 h-12 object-cover rounded-lg bg-white border border-slate-100 flex-shrink-0">
        <div class="flex-1 min-w-0">
          <h4 class="text-xs font-semibold text-slate-800 truncate" title="${item.name}">${item.name}</h4>
          <div class="text-xs font-bold text-blue-600 mb-1.5">${formatPrice(item.price)}</div>
          
          <div class="flex items-center justify-between">
            <div class="flex items-center border border-slate-200 bg-white rounded-md overflow-hidden">
              <button onclick="updateCartQuantity(${item.productId}, -1)" class="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer">−</button>
              <span class="w-6 text-center text-[11px] font-semibold text-slate-800">${item.quantity}</span>
              <button onclick="updateCartQuantity(${item.productId}, 1)" class="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer">+</button>
            </div>
            
            <button onclick="removeFromCart(${item.productId})" class="text-slate-400 hover:text-rose-500 p-1 rounded-md transition-colors cursor-pointer" title="Удалить">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  subtotalEl.textContent = formatPrice(subtotal);
  totalEl.textContent = formatPrice(subtotal);

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// CATALOG & PRODUCTS FETCHING
// -----------------------------------------------------------------------------
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    
    const tabsContainer = document.getElementById('categoryTabs');
    const allCountBadge = document.getElementById('allCountBadge');
    
    let totalAllProducts = categories.reduce((sum, c) => sum + c.product_count, 0);
    allCountBadge.textContent = totalAllProducts;

    const html = categories.map(cat => `
      <button 
        data-category="${cat.slug}" 
        class="cat-pill flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 whitespace-nowrap cursor-pointer"
      >
        <span>${cat.name}</span>
        <span class="text-[10px] opacity-75 px-1 rounded-full">${cat.product_count}</span>
      </button>
    `).join('');

    tabsContainer.insertAdjacentHTML('beforeend', html);

    // Click handler for category pills
    document.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-pill').forEach(b => {
          b.className = 'cat-pill flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 whitespace-nowrap cursor-pointer';
        });
        btn.className = 'cat-pill active flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all bg-blue-600 text-white whitespace-nowrap shadow-xs cursor-pointer';
        currentCategory = btn.getAttribute('data-category') || '';
        loadProducts();
      });
    });

  } catch (err) {
    console.error('Failed to load categories', err);
  }
}

async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyCatalogState');
  const countDisplay = document.getElementById('productsCount');

  grid.innerHTML = `
    <div class="col-span-full py-12 text-center text-slate-400 text-xs">
      <div class="inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
      <p>Загрузка товаров...</p>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    if (currentCategory) params.append('category', currentCategory);
    if (currentSearch) params.append('q', currentSearch);
    if (currentSort) params.append('sort', currentSort);
    if (onlyInStock) params.append('in_stock', 'true');

    const res = await fetch(`/api/products?${params.toString()}`);
    const products = await res.json();
    productsCache = products;

    countDisplay.textContent = products.length;

    if (products.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    grid.innerHTML = products.map(p => {
      const discountPercent = p.old_price ? Math.round(((p.old_price - p.price) / p.old_price) * 100) : 0;
      const isOutOfStock = p.stock <= 0;

      return `
        <div class="product-card bg-white rounded-xl border border-slate-200/90 overflow-hidden flex flex-col justify-between group relative shadow-xs">
          
          <!-- Badges -->
          <div class="absolute top-2 left-2 z-10 flex flex-col gap-1">
            ${discountPercent > 0 ? `
              <span class="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-md">-${discountPercent}%</span>
            ` : ''}
            ${p.stock > 0 && p.stock <= 5 ? `
              <span class="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md">Осталось ${p.stock}</span>
            ` : ''}
          </div>

          <!-- Quick view icon button -->
          <button 
            onclick="openQuickView(${p.id})" 
            class="absolute top-2 right-2 z-10 w-6 h-6 bg-white/90 hover:bg-white text-slate-500 hover:text-blue-600 rounded-full flex items-center justify-center shadow-xs transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Быстрый просмотр"
          >
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          </button>

          <!-- Product Image (Compact container) -->
          <div class="bg-slate-50/60 p-3 h-36 sm:h-40 flex items-center justify-center cursor-pointer overflow-hidden relative" onclick="openQuickView(${p.id})">
            <img 
              src="${p.image_url}" 
              alt="${p.name}" 
              class="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
              loading="lazy"
            >
            ${isOutOfStock ? `
              <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center text-white font-bold text-[11px]">
                Нет в наличии
              </div>
            ` : ''}
          </div>

          <!-- Product Details -->
          <div class="p-2.5 flex-1 flex flex-col justify-between">
            <div>
              <span class="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-0.5">${p.category_name}</span>
              <h3 
                class="font-semibold text-slate-800 text-xs leading-snug line-clamp-2 hover:text-blue-600 cursor-pointer transition-colors mb-2" 
                title="${p.name}"
                onclick="openQuickView(${p.id})"
              >
                ${p.name}
              </h3>
            </div>

            <div class="pt-1.5 border-t border-slate-100">
              <div class="flex items-baseline gap-1.5 mb-2">
                <span class="text-sm font-bold text-slate-900">${formatPrice(p.price)}</span>
                ${p.old_price ? `
                  <span class="text-[10px] line-through text-slate-400">${formatPrice(p.old_price)}</span>
                ` : ''}
              </div>

              <button 
                onclick="handleAddToCartClick(${p.id})" 
                ${isOutOfStock ? 'disabled' : ''} 
                class="w-full py-1.5 px-2 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 transition-all ${
                  isOutOfStock 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white cursor-pointer active:scale-95'
                }"
              >
                <i data-lucide="shopping-bag" class="w-3.5 h-3.5"></i>
                <span>${isOutOfStock ? 'Раскуплено' : 'В корзину'}</span>
              </button>
            </div>
          </div>

        </div>
      `;
    }).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading products', err);
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-rose-500 text-xs">Ошибка загрузки товаров с сервера</div>';
  }
}

function handleAddToCartClick(productId) {
  const product = productsCache.find(p => p.id === productId);
  if (product) {
    addToCart(product, 1);
  }
}

// -----------------------------------------------------------------------------
// PRODUCT QUICK VIEW MODAL
// -----------------------------------------------------------------------------
function openQuickView(productId) {
  const p = productsCache.find(item => item.id === productId);
  if (!p) return;

  quickViewProduct = p;

  document.getElementById('qvImage').src = p.image_url;
  document.getElementById('qvImage').alt = p.name;
  document.getElementById('qvCategory').textContent = p.category_name;
  document.getElementById('qvTitle').textContent = p.name;
  document.getElementById('qvPrice').textContent = formatPrice(p.price);
  
  const oldPriceEl = document.getElementById('qvOldPrice');
  if (p.old_price) {
    oldPriceEl.textContent = formatPrice(p.old_price);
    oldPriceEl.classList.remove('hidden');
  } else {
    oldPriceEl.classList.add('hidden');
  }

  document.getElementById('qvDescription').textContent = p.description || 'Описание отсутствует';
  document.getElementById('qvSpecs').textContent = p.specs || 'Стандартная комплектация';

  const stockBadge = document.getElementById('qvStockBadge');
  if (p.stock > 0) {
    stockBadge.textContent = `В наличии: ${p.stock} шт.`;
    stockBadge.className = 'absolute bottom-4 left-4 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800';
    document.getElementById('qvAddToCartBtn').disabled = false;
    document.getElementById('qvAddToCartBtn').classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    stockBadge.textContent = 'Нет в наличии';
    stockBadge.className = 'absolute bottom-4 left-4 text-xs font-semibold px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800';
    document.getElementById('qvAddToCartBtn').disabled = true;
    document.getElementById('qvAddToCartBtn').classList.add('opacity-50', 'cursor-not-allowed');
  }

  const modal = document.getElementById('quickViewModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  lucide.createIcons();
}

function closeQuickView() {
  const modal = document.getElementById('quickViewModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// -----------------------------------------------------------------------------
// CHECKOUT & ORDER SUBMISSION
// -----------------------------------------------------------------------------
function openCheckoutModal() {
  if (cart.length === 0) {
    showToast('Ваша корзина пуста', 'error');
    return;
  }

  closeCartDrawer();

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  document.getElementById('checkoutTotalDisplay').textContent = formatPrice(total);

  // Initialize and render country phone roulette
  renderCountriesRoulette();
  updateFullPhone();

  const modal = document.getElementById('checkoutModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('submitOrderBtn');
  
  // Ensure full international phone is populated
  updateFullPhone();
  const fullPhone = document.getElementById('fullPhoneHidden')?.value || `${selectedCountry.dial} ${document.getElementById('phoneLocalInput')?.value}`;

  const formData = new FormData(form);
  const orderPayload = {
    customerName: formData.get('customerName'),
    customerPhone: fullPhone.trim(),
    customerEmail: formData.get('customerEmail'),
    customerAddress: formData.get('customerAddress'),
    paymentMethod: formData.get('paymentMethod'),
    comment: formData.get('comment'),
    items: cart.map(it => ({
      productId: it.productId,
      quantity: it.quantity
    }))
  };

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Оформление...</span>
    `;

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка при создании заказа');
    }

    // Success! Clear cart & phone inputs
    cart = [];
    saveCart();
    form.reset();
    if (document.getElementById('phoneLocalInput')) document.getElementById('phoneLocalInput').value = '';
    if (document.getElementById('fullPhoneHidden')) document.getElementById('fullPhoneHidden').value = '';
    closeCheckoutModal();

    // Show order success modal
    document.getElementById('successOrderNumber').textContent = `#${data.orderNumber}`;
    const successModal = document.getElementById('orderSuccessModal');
    successModal.classList.remove('hidden');
    successModal.classList.add('flex');
    lucide.createIcons();

    // Reload products to refresh stock counts
    loadProducts();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
      <i data-lucide="check-circle" class="w-5 h-5"></i>
      <span>Подтвердить и отправить заказ</span>
    `;
    lucide.createIcons();
  }
}

// -----------------------------------------------------------------------------
// EVENT LISTENERS & INITIALIZATION
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Init lucide
  lucide.createIcons();

  // Load initial data
  updateCurrencyUI();
  loadCategories();
  loadProducts();
  updateCartBadge();

  // Currency Dropdown triggers
  const currencyBtn = document.getElementById('currencySelectBtn');
  const currencyMenu = document.getElementById('currencyDropdownMenu');
  if (currencyBtn && currencyMenu) {
    currencyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currencyMenu.classList.toggle('hidden');
    });
  }

  // Country Phone Roulette triggers
  const countryBtn = document.getElementById('countrySelectBtn');
  const countryMenu = document.getElementById('countryDropdownMenu');
  const countrySearch = document.getElementById('countrySearchInput');
  const phoneLocalInput = document.getElementById('phoneLocalInput');

  if (countryBtn && countryMenu) {
    countryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = countryMenu.classList.toggle('hidden');
      if (!isHidden && countrySearch) {
        countrySearch.value = '';
        renderCountriesRoulette();
        countrySearch.focus();
      }
    });
  }

  if (countrySearch) {
    countrySearch.addEventListener('input', (e) => {
      renderCountriesRoulette(e.target.value);
    });
    countrySearch.addEventListener('click', (e) => e.stopPropagation());
  }

  if (phoneLocalInput) {
    phoneLocalInput.addEventListener('input', () => {
      updateFullPhone();
    });
  }

  // Close menus on outside click
  document.addEventListener('click', (e) => {
    if (currencyMenu && !currencyMenu.contains(e.target) && e.target !== currencyBtn) {
      currencyMenu.classList.add('hidden');
    }
    if (countryMenu && !countryMenu.contains(e.target) && !countryBtn.contains(e.target)) {
      countryMenu.classList.add('hidden');
    }
  });

  // Cart drawer triggers
  document.getElementById('cartBtn').addEventListener('click', openCartDrawer);
  document.getElementById('closeCartBtn').addEventListener('click', closeCartDrawer);
  document.getElementById('cartDrawerBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'cartDrawerBackdrop') closeCartDrawer();
  });
  document.getElementById('exploreCatalogBtn')?.addEventListener('click', closeCartDrawer);

  // Quick view triggers
  document.getElementById('closeQuickViewBtn').addEventListener('click', closeQuickView);
  document.getElementById('quickViewModal').addEventListener('click', (e) => {
    if (e.target.id === 'quickViewModal') closeQuickView();
  });
  document.getElementById('qvAddToCartBtn').addEventListener('click', () => {
    if (quickViewProduct) {
      addToCart(quickViewProduct, 1);
      closeQuickView();
    }
  });

  // Checkout triggers
  document.getElementById('proceedToCheckoutBtn').addEventListener('click', openCheckoutModal);
  document.getElementById('closeCheckoutBtn').addEventListener('click', closeCheckoutModal);
  document.getElementById('checkoutModal').addEventListener('click', (e) => {
    if (e.target.id === 'checkoutModal') closeCheckoutModal();
  });
  document.getElementById('checkoutForm').addEventListener('submit', handleOrderSubmit);

  // Success modal close
  document.getElementById('closeSuccessBtn').addEventListener('click', () => {
    document.getElementById('orderSuccessModal').classList.add('hidden');
    document.getElementById('orderSuccessModal').classList.remove('flex');
  });

  // Search input debouncer
  let searchTimeout = null;
  const searchInput = document.getElementById('searchInput');
  const mobileSearchInput = document.getElementById('mobileSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  function handleSearch(val) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = val;
      if (val) {
        clearSearchBtn.classList.remove('hidden');
      } else {
        clearSearchBtn.classList.add('hidden');
      }
      loadProducts();
    }, 300);
  }

  searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
    mobileSearchInput.value = e.target.value;
  });

  mobileSearchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
    searchInput.value = e.target.value;
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    mobileSearchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    currentSearch = '';
    loadProducts();
  });

  // Sorting
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    loadProducts();
  });

  // In Stock Only
  document.getElementById('inStockCheckbox').addEventListener('change', (e) => {
    onlyInStock = e.target.checked;
    loadProducts();
  });

  // Reset filters
  document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
    currentCategory = '';
    currentSearch = '';
    currentSort = 'newest';
    onlyInStock = false;
    searchInput.value = '';
    mobileSearchInput.value = '';
    document.getElementById('inStockCheckbox').checked = false;
    document.getElementById('sortSelect').value = 'newest';
    
    document.querySelectorAll('.cat-pill').forEach((btn, idx) => {
      if (idx === 0) {
        btn.className = 'cat-pill active flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all bg-blue-600 text-white whitespace-nowrap shadow-xs cursor-pointer';
      } else {
        btn.className = 'cat-pill flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 whitespace-nowrap cursor-pointer';
      }
    });

    loadProducts();
  });
});
