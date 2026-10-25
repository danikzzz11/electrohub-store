// Admin Panel & CRM Client Logic
let currentTab = 'dashboard';
let adminUser = null;
let categoriesList = [];
let activeOrder = null;
let activeCustomer = null;
let currentOrderStatusFilter = 'all';

// Formatters
function formatPrice(num) {
  return new Intl.NumberFormat('ru-RU').format(num) + ' ₽';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusBadge(status) {
  const map = {
    'новый': { bg: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Новый' },
    'в_обработке': { bg: 'bg-amber-100 text-amber-800 border-amber-200', label: 'В обработке' },
    'отправлен': { bg: 'bg-indigo-100 text-indigo-800 border-indigo-200', label: 'Отправлен' },
    'доставлен': { bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Доставлен' },
    'отменен': { bg: 'bg-rose-100 text-rose-800 border-rose-200', label: 'Отменен' },
  };
  const config = map[status] || { bg: 'bg-slate-100 text-slate-800 border-slate-200', label: status };
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${config.bg}">${config.label}</span>`;
}

function getSegmentBadge(segment) {
  if (segment === 'VIP') {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">★ VIP</span>`;
  }
  if (segment === 'Постоянный') {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Постоянный</span>`;
  }
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Новичок</span>`;
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

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold ${bg} toast-enter pointer-events-auto`;
  toast.innerHTML = `
    <i data-lucide="${icon}" class="w-4 h-4 flex-shrink-0"></i>
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
// AUTHENTICATION
// -----------------------------------------------------------------------------
async function checkAuth() {
  try {
    const res = await fetch('/api/admin/me');
    if (res.ok) {
      const data = await res.json();
      adminUser = data.user;
      showApp();
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('adminApp').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminApp').classList.remove('hidden');
  document.getElementById('adminFullName').textContent = adminUser?.fullName || 'Даниил (danik)';
  loadAllAdminData();
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const submitBtn = document.getElementById('loginSubmitBtn');

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      <span>Проверка данных...</span>
    `;

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Неверный логин или пароль');
    }

    adminUser = data.user;
    showToast(`Добро пожаловать, ${adminUser.fullName}!`, 'success');
    showApp();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `
      <i data-lucide="log-in" class="w-4 h-4"></i>
      <span>Войти в систему</span>
    `;
    lucide.createIcons();
  }
}

async function handleLogout() {
  try {
    await fetch('/api/admin/logout', { method: 'POST' });
    showToast('Вы вышли из системы', 'info');
    showLogin();
  } catch (err) {
    console.error('Logout error', err);
  }
}

// -----------------------------------------------------------------------------
// TAB NAVIGATION
// -----------------------------------------------------------------------------
function switchTab(tabName) {
  currentTab = tabName;

  // Update nav buttons style
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.className = 'nav-btn active w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all bg-blue-600 text-white shadow-md shadow-blue-600/30';
    } else {
      btn.className = 'nav-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all text-slate-300 hover:bg-slate-800 hover:text-white';
    }
  });

  // Toggle panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.add('hidden');
  });

  const activePane = document.getElementById(`tab-${tabName}`);
  if (activePane) activePane.classList.remove('hidden');

  // Header Titles
  const titleEl = document.getElementById('currentTabTitle');
  const subEl = document.getElementById('currentTabSubtitle');

  if (tabName === 'dashboard') {
    titleEl.textContent = 'Обзор и статистика';
    subEl.textContent = 'Ключевые показатели работы интернет-магазина';
    loadDashboard();
  } else if (tabName === 'orders') {
    titleEl.textContent = 'Обработка заказов';
    subEl.textContent = 'Управление заказами, изменение статусов и доставка';
    loadOrders();
  } else if (tabName === 'products') {
    titleEl.textContent = 'Управление товарами';
    subEl.textContent = 'Каталог, складские остатки, добавление и удаление товаров';
    loadProducts();
  } else if (tabName === 'customers') {
    titleEl.textContent = 'База клиентов (CRM)';
    subEl.textContent = 'Карточки клиентов, сегментация, история покупок и заметки';
    loadCustomers();
  }

  lucide.createIcons();
}

function loadAllAdminData() {
  loadCategories();
  loadDashboard();
  loadOrders();
  loadProducts();
  loadCustomers();
}

// -----------------------------------------------------------------------------
// CATEGORIES
// -----------------------------------------------------------------------------
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    categoriesList = await res.json();

    // Populate category filter in products tab
    const filterSelect = document.getElementById('adminProductCategoryFilter');
    const modalSelect = document.getElementById('prodCategory');

    const options = categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    filterSelect.innerHTML = `<option value="">Все категории</option>` + options;
    modalSelect.innerHTML = options;
  } catch (err) {
    console.error('Error loading categories', err);
  }
}

// -----------------------------------------------------------------------------
// DASHBOARD
// -----------------------------------------------------------------------------
async function loadDashboard() {
  try {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) return;

    const stats = await res.json();

    document.getElementById('statRevenue').textContent = formatPrice(stats.totalRevenue);
    document.getElementById('statOrders').textContent = stats.totalOrders;
    document.getElementById('statPendingOrders').textContent = `${stats.pendingOrders} требуют обработки`;
    document.getElementById('statCustomers').textContent = stats.totalCustomers;
    document.getElementById('statProducts').textContent = stats.totalProducts;
    document.getElementById('statLowStock').textContent = `${stats.lowStock} с низким остатком`;

    const navBadge = document.getElementById('navOrdersBadge');
    if (navBadge) navBadge.textContent = stats.pendingOrders;

    // Recent orders table
    const recentBody = document.getElementById('recentOrdersTableBody');
    if (stats.recentOrders.length === 0) {
      recentBody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400">Заказов пока нет</td></tr>';
      return;
    }

    recentBody.innerHTML = stats.recentOrders.map(ord => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-5 py-3 font-mono font-bold text-blue-600">${ord.order_number}</td>
        <td class="px-5 py-3 text-slate-500">${formatDate(ord.created_at)}</td>
        <td class="px-5 py-3 font-medium text-slate-900">${ord.customer_name}</td>
        <td class="px-5 py-3 font-bold text-slate-900">${formatPrice(ord.total_amount)}</td>
        <td class="px-5 py-3">${getStatusBadge(ord.status)}</td>
        <td class="px-5 py-3 text-right">
          <button onclick="openOrderDetail(${ord.id})" class="px-3 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-semibold transition-all">
            Просмотр
          </button>
        </td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading dashboard stats', err);
  }
}

// -----------------------------------------------------------------------------
// PRODUCTS MANAGEMENT
// -----------------------------------------------------------------------------
async function loadProducts() {
  try {
    const search = document.getElementById('adminProductSearch')?.value || '';
    const categoryId = document.getElementById('adminProductCategoryFilter')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (categoryId) params.append('category_id', categoryId);

    const res = await fetch(`/api/admin/products?${params.toString()}`);
    const products = await res.json();

    const tbody = document.getElementById('adminProductsTableBody');
    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-400">Товары не найдены</td></tr>';
      return;
    }

    tbody.innerHTML = products.map(p => {
      let stockColor = 'bg-emerald-100 text-emerald-800';
      if (p.stock === 0) stockColor = 'bg-rose-100 text-rose-800';
      else if (p.stock <= 5) stockColor = 'bg-amber-100 text-amber-800';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-5 py-3 flex items-center gap-3">
            <img src="${p.image_url}" alt="${p.name}" class="w-10 h-10 object-cover rounded-xl bg-slate-100 border border-slate-200 flex-shrink-0">
            <div>
              <div class="font-bold text-slate-900 leading-snug line-clamp-1">${p.name}</div>
              <div class="text-[11px] text-slate-400 line-clamp-1">${p.specs || '—'}</div>
            </div>
          </td>
          <td class="px-5 py-3 font-medium text-slate-600">${p.category_name}</td>
          <td class="px-5 py-3">
            <div class="font-bold text-slate-900">${formatPrice(p.price)}</div>
            ${p.old_price ? `<div class="text-[10px] line-through text-slate-400">${formatPrice(p.old_price)}</div>` : ''}
          </td>
          <td class="px-5 py-3">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${stockColor}">
              ${p.stock} шт.
            </span>
          </td>
          <td class="px-5 py-3 text-right">
            <div class="inline-flex items-center gap-1.5">
              <button onclick="openEditProductModal(${p.id})" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors" title="Редактировать">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Удалить">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading products', err);
  }
}

function openAddProductModal() {
  document.getElementById('productForm').reset();
  document.getElementById('editProductId').value = '';
  document.getElementById('productModalTitle').textContent = 'Добавить новый товар';
  
  const modal = document.getElementById('productModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

async function openEditProductModal(productId) {
  try {
    const res = await fetch(`/api/products/${productId}`);
    if (!res.ok) throw new Error('Не удалось загрузить товар');
    const p = await res.json();

    document.getElementById('editProductId').value = p.id;
    document.getElementById('prodName').value = p.name;
    document.getElementById('prodCategory').value = p.category_id;
    document.getElementById('prodPrice').value = p.price;
    document.getElementById('prodOldPrice').value = p.old_price || '';
    document.getElementById('prodStock').value = p.stock;
    document.getElementById('prodImage').value = p.image_url;
    document.getElementById('prodSpecs').value = p.specs || '';
    document.getElementById('prodDesc').value = p.description || '';

    document.getElementById('productModalTitle').textContent = 'Редактировать товар';

    const modal = document.getElementById('productModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeProductModal() {
  const modal = document.getElementById('productModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleProductFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editProductId').value;
  const payload = {
    name: document.getElementById('prodName').value,
    category_id: document.getElementById('prodCategory').value,
    price: document.getElementById('prodPrice').value,
    old_price: document.getElementById('prodOldPrice').value || null,
    stock: document.getElementById('prodStock').value,
    image_url: document.getElementById('prodImage').value,
    specs: document.getElementById('prodSpecs').value,
    description: document.getElementById('prodDesc').value
  };

  try {
    const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка при сохранении товара');

    showToast(id ? 'Товар успешно обновлен' : 'Товар успешно добавлен', 'success');
    closeProductModal();
    loadProducts();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProduct(productId, productName) {
  if (!confirm(`Вы действительно хотите удалить товар "${productName}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка при удалении');

    showToast('Товар удален', 'info');
    loadProducts();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// -----------------------------------------------------------------------------
// ORDERS PROCESSING
// -----------------------------------------------------------------------------
async function loadOrders() {
  try {
    const search = document.getElementById('adminOrderSearch')?.value || '';
    const params = new URLSearchParams();
    if (currentOrderStatusFilter && currentOrderStatusFilter !== 'all') {
      params.append('status', currentOrderStatusFilter);
    }
    if (search) params.append('search', search);

    const res = await fetch(`/api/admin/orders?${params.toString()}`);
    const orders = await res.json();

    const tbody = document.getElementById('adminOrdersTableBody');
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-400">Заказы не найдены</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map(ord => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-5 py-3 font-mono font-bold text-blue-600">${ord.order_number}</td>
        <td class="px-5 py-3 text-slate-500">${formatDate(ord.created_at)}</td>
        <td class="px-5 py-3">
          <div class="font-bold text-slate-900">${ord.customer_name}</div>
          <div class="text-[11px] text-slate-500 font-mono">${ord.customer_phone}</div>
        </td>
        <td class="px-5 py-3">
          <div class="font-bold text-slate-900">${formatPrice(ord.total_amount)}</div>
          <div class="text-[11px] text-slate-400 truncate max-w-xs" title="${ord.items_summary || ''}">${ord.items_summary || `${ord.items_count} поз.`}</div>
        </td>
        <td class="px-5 py-3">
          <select 
            onchange="changeOrderStatusDirectly(${ord.id}, this.value)" 
            class="text-xs font-semibold rounded-lg px-2 py-1 bg-white border border-slate-200 outline-none cursor-pointer"
          >
            <option value="новый" ${ord.status === 'новый' ? 'selected' : ''}>Новый</option>
            <option value="в_обработке" ${ord.status === 'в_обработке' ? 'selected' : ''}>В обработке</option>
            <option value="отправлен" ${ord.status === 'отправлен' ? 'selected' : ''}>Отправлен</option>
            <option value="доставлен" ${ord.status === 'доставлен' ? 'selected' : ''}>Доставлен</option>
            <option value="отменен" ${ord.status === 'отменен' ? 'selected' : ''}>Отменен</option>
          </select>
        </td>
        <td class="px-5 py-3 text-right">
          <button onclick="openOrderDetail(${ord.id})" class="px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-semibold transition-all">
            Детали
          </button>
        </td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading orders', err);
  }
}

async function changeOrderStatusDirectly(orderId, newStatus) {
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка изменения статуса');

    showToast(`Статус заказа изменен на "${newStatus}"`, 'success');
    loadOrders();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openOrderDetail(orderId) {
  try {
    const res = await fetch(`/api/admin/orders/${orderId}`);
    if (!res.ok) throw new Error('Заказ не найден');
    const ord = await res.json();
    activeOrder = ord;

    document.getElementById('modalOrderNumber').textContent = `Заказ #${ord.order_number}`;
    document.getElementById('modalOrderStatusBadge').innerHTML = getStatusBadge(ord.status);
    document.getElementById('modalStatusSelect').value = ord.status;

    document.getElementById('modalCustName').textContent = ord.customer_name;
    document.getElementById('modalCustPhone').textContent = ord.customer_phone;
    document.getElementById('modalCustEmail').textContent = ord.customer_email || 'Email не указан';
    document.getElementById('modalDeliveryAddress').textContent = ord.customer_address;
    document.getElementById('modalPaymentMethod').textContent = ord.payment_method;
    document.getElementById('modalComment').textContent = ord.comment || 'Без комментариев';

    // Link to CRM Card
    document.getElementById('modalOpenCrmBtn').onclick = () => {
      closeOrderDetail();
      openCustomerCrm(ord.customer_id);
    };

    // Items
    const itemsTbody = document.getElementById('modalOrderItemsBody');
    itemsTbody.innerHTML = ord.items.map(it => `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-2.5 flex items-center gap-2">
          ${it.image_url ? `<img src="${it.image_url}" class="w-8 h-8 object-cover rounded-lg">` : ''}
          <span class="font-semibold text-slate-800">${it.product_name}</span>
        </td>
        <td class="px-4 py-2.5">${formatPrice(it.price)}</td>
        <td class="px-4 py-2.5 font-bold">${it.quantity}</td>
        <td class="px-4 py-2.5 text-right font-bold text-slate-900">${formatPrice(it.total)}</td>
      </tr>
    `).join('');

    document.getElementById('modalOrderTotal').textContent = formatPrice(ord.total_amount);

    const modal = document.getElementById('orderDetailModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeOrderDetail() {
  const modal = document.getElementById('orderDetailModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// -----------------------------------------------------------------------------
// CUSTOMERS CRM
// -----------------------------------------------------------------------------
async function loadCustomers() {
  try {
    const search = document.getElementById('adminCustomerSearch')?.value || '';
    const params = new URLSearchParams();
    if (search) params.append('search', search);

    const res = await fetch(`/api/admin/customers?${params.toString()}`);
    const customers = await res.json();

    document.getElementById('crmTotalCustomersCount').textContent = customers.length;

    const tbody = document.getElementById('adminCustomersTableBody');
    if (customers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-slate-400">Клиенты не найдены</td></tr>';
      return;
    }

    tbody.innerHTML = customers.map(c => `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-5 py-3">
          <div class="font-bold text-slate-900">${c.name}</div>
          <div class="text-[11px] text-slate-400">В базе с ${formatDate(c.created_at)}</div>
        </td>
        <td class="px-5 py-3 font-mono text-slate-600">
          <div>${c.phone}</div>
          <div class="text-[11px] text-slate-400 font-sans">${c.email || '—'}</div>
        </td>
        <td class="px-5 py-3 text-slate-600 truncate max-w-xs" title="${c.address || ''}">${c.address || '—'}</td>
        <td class="px-5 py-3 font-bold text-slate-800">${c.total_orders}</td>
        <td class="px-5 py-3 font-black text-blue-600">${formatPrice(c.total_spent)}</td>
        <td class="px-5 py-3">${getSegmentBadge(c.segment)}</td>
        <td class="px-5 py-3 text-right">
          <button onclick="openCustomerCrm(${c.id})" class="px-3 py-1 bg-amber-50 text-amber-800 hover:bg-amber-600 hover:text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ml-auto">
            <i data-lucide="user-check" class="w-3.5 h-3.5"></i>
            <span>Карточка CRM</span>
          </button>
        </td>
      </tr>
    `).join('');

    lucide.createIcons();
  } catch (err) {
    console.error('Error loading CRM customers', err);
  }
}

async function openCustomerCrm(customerId) {
  try {
    const res = await fetch(`/api/admin/customers/${customerId}`);
    if (!res.ok) throw new Error('Клиент не найден');
    const data = await res.json();
    activeCustomer = data;

    const c = data.customer;
    document.getElementById('crmCustName').textContent = c.name;
    document.getElementById('crmCustPhone').textContent = c.phone;
    document.getElementById('crmCustEmail').textContent = c.email || '—';
    document.getElementById('crmCustAddress').textContent = c.address || '—';
    document.getElementById('crmCustSegmentBadge').innerHTML = getSegmentBadge(c.segment);

    document.getElementById('crmCustLtv').textContent = formatPrice(c.total_spent);
    document.getElementById('crmCustOrdersCount').textContent = c.total_orders;
    document.getElementById('crmCustAov').textContent = formatPrice(c.aov);

    // Orders Timeline
    const timeline = document.getElementById('crmOrdersTimeline');
    if (data.orders.length === 0) {
      timeline.innerHTML = '<div class="p-4 bg-slate-50 text-slate-400 text-center rounded-2xl">Заказов пока не было</div>';
    } else {
      timeline.innerHTML = data.orders.map(o => `
        <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-blue-600">#${o.order_number}</span>
              <span class="text-slate-400">•</span>
              <span class="text-slate-500">${formatDate(o.created_at)}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-900">${formatPrice(o.total_amount)}</span>
              ${getStatusBadge(o.status)}
            </div>
          </div>
          <div class="text-[11px] text-slate-600 space-y-1">
            ${o.items.map(it => `<div>• ${it.product_name} (${it.quantity} шт. × ${formatPrice(it.price)})</div>`).join('')}
          </div>
        </div>
      `).join('');
    }

    // CRM Notes
    renderCrmNotes(data.notes);

    const modal = document.getElementById('customerCrmModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    lucide.createIcons();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderCrmNotes(notes = []) {
  const list = document.getElementById('crmNotesList');
  if (notes.length === 0) {
    list.innerHTML = '<div class="p-3 text-slate-400 bg-slate-50 rounded-xl text-center">Заметок пока нет</div>';
    return;
  }

  list.innerHTML = notes.map(n => `
    <div class="bg-amber-50/60 p-3 rounded-xl border border-amber-200/70">
      <div class="flex items-center justify-between text-[10px] text-amber-800/80 mb-1">
        <span class="font-bold">Менеджер: ${n.author || 'danik'}</span>
        <span>${formatDate(n.created_at)}</span>
      </div>
      <p class="text-xs text-slate-800">${n.note}</p>
    </div>
  `).join('');
}

async function handleAddCrmNote(e) {
  e.preventDefault();
  if (!activeCustomer) return;

  const input = document.getElementById('newCrmNoteInput');
  const note = input.value.trim();
  if (!note) return;

  try {
    const res = await fetch(`/api/admin/customers/${activeCustomer.customer.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка добавления заметки');

    input.value = '';
    showToast('Заметка CRM сохранена', 'success');

    // Reload customer card
    openCustomerCrm(activeCustomer.customer.id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function closeCustomerCrm() {
  const modal = document.getElementById('customerCrmModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// -----------------------------------------------------------------------------
// EVENT LISTENERS & SETUP
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  checkAuth();

  // Login & Logout
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Tab switching
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });

  // Refresh
  document.getElementById('refreshDataBtn').addEventListener('click', () => {
    loadAllAdminData();
    showToast('Данные обновлены', 'info');
  });

  // Product modal
  document.getElementById('openAddProductModalBtn').addEventListener('click', openAddProductModal);
  document.getElementById('closeProductModalBtn').addEventListener('click', closeProductModal);
  document.getElementById('productModal').addEventListener('click', (e) => {
    if (e.target.id === 'productModal') closeProductModal();
  });
  document.getElementById('productForm').addEventListener('submit', handleProductFormSubmit);

  // Product filters
  document.getElementById('adminProductSearch').addEventListener('input', () => loadProducts());
  document.getElementById('adminProductCategoryFilter').addEventListener('change', () => loadProducts());

  // Orders filters
  document.querySelectorAll('.order-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.order-filter-pill').forEach(p => {
        p.className = 'order-filter-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      });
      pill.className = 'order-filter-pill active px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white';
      currentOrderStatusFilter = pill.getAttribute('data-status');
      loadOrders();
    });
  });
  document.getElementById('adminOrderSearch').addEventListener('input', () => loadOrders());

  // Order modal save status
  document.getElementById('closeOrderModalBtn').addEventListener('click', closeOrderDetail);
  document.getElementById('orderDetailModal').addEventListener('click', (e) => {
    if (e.target.id === 'orderDetailModal') closeOrderDetail();
  });
  document.getElementById('saveOrderStatusBtn').addEventListener('click', () => {
    if (activeOrder) {
      const newStatus = document.getElementById('modalStatusSelect').value;
      changeOrderStatusDirectly(activeOrder.id, newStatus);
      closeOrderDetail();
    }
  });

  // Customer CRM
  document.getElementById('adminCustomerSearch').addEventListener('input', () => loadCustomers());
  document.getElementById('closeCrmModalBtn').addEventListener('click', closeCustomerCrm);
  document.getElementById('customerCrmModal').addEventListener('click', (e) => {
    if (e.target.id === 'customerCrmModal') closeCustomerCrm();
  });
  document.getElementById('addCrmNoteForm').addEventListener('submit', handleAddCrmNote);
});
