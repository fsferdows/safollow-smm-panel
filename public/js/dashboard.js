// SAFollow V3.0 - Dashboard Logic

let currentUser = null;
let currentCurrency = localStorage.getItem('saf_currency') || 'USD';
let currentTheme = localStorage.getItem('saf_theme') || 'light';
let bdtRate = 120.0;
let userCategories = [];
let userServices = [];
let activeTicketId = null;
let systemSettings = {};

// Initialize
document.documentElement.setAttribute('data-theme', currentTheme);

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initCurrencyToggle();
  const ok = await checkAuth();
  if (ok) {
    initNavigation();
    await loadInitialData();
  }
});

// Auth Check
async function checkAuth() {
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) {
      window.location.href = '/?auth=required';
      return false;
    }
    const data = await res.json();
    currentUser = data.user;

    document.getElementById('usernameDisplay').textContent = currentUser.username;
    document.getElementById('userRoleBadge').textContent = currentUser.role.toUpperCase();
    if (currentUser.role === 'admin') {
      document.getElementById('userRoleBadge').style.background = '#8b5cf6';
      document.getElementById('adminNavSection').style.display = 'block';
    }

    updateUserBalanceDisplay(currentUser.balance);
    return true;
  } catch (err) {
    window.location.href = '/?auth=error';
    return false;
  }
}

// Balance Display
function updateUserBalanceDisplay(balance) {
  const b = parseFloat(balance) || 0;
  document.getElementById('userBalanceDisplay').textContent = `$ ${b.toFixed(4)}`;
  document.getElementById('userBalanceBdtDisplay').textContent = `(৳ ${(b * bdtRate).toFixed(2)})`;
}

// Navigation & View Switching
function initNavigation() {
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      const viewName = link.getAttribute('data-view');
      switchView(viewName);
    });
  });

  // Check URL hash for direct view
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    switchView(hash);
  }
}

function switchView(viewName) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  const activeLink = document.querySelector(`.sidebar-link[data-view="${viewName}"]`);
  if (activeLink) activeLink.classList.add('active');

  document.querySelectorAll('.dash-view').forEach(v => v.style.display = 'none');
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.style.display = 'block';
    window.location.hash = viewName;
    handleViewActivation(viewName);
  }
}

let activePollInterval = null;

function handleViewActivation(viewName) {
  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }

  switch (viewName) {
    case 'new-order':
      break;
    case 'orders':
      loadUserOrders();
      activePollInterval = setInterval(() => loadUserOrders(true), 4000);
      break;
    case 'services':
      loadDashboardServices();
      break;
    case 'add-funds':
      loadDepositHistory();
      updatePaymentInstructions();
      break;
    case 'tickets':
      loadUserTickets();
      break;
    case 'api':
      loadApiKeyView();
      break;
    case 'admin-overview':
      loadAdminOverview();
      break;
    case 'admin-orders':
      loadAdminOrders();
      break;
    case 'admin-services':
      loadAdminServices();
      break;
    case 'admin-users':
      loadAdminUsers();
      break;
    case 'admin-payments':
      loadAdminPayments();
      break;
    case 'admin-tickets':
      loadAdminTickets();
      break;
    case 'admin-providers':
      loadAdminProviders();
      break;
    case 'admin-settings':
      loadAdminSettings();
      break;
  }
}

// Initial Data Load
async function loadInitialData() {
  try {
    const [setRes, catRes, svcRes] = await Promise.all([
      fetch('/public-api/settings'),
      fetch('/user/categories'),
      fetch('/user/services')
    ]);

    systemSettings = await setRes.json();
    if (systemSettings.bdt_rate) bdtRate = parseFloat(systemSettings.bdt_rate);
    updateUserBalanceDisplay(currentUser.balance);

    userCategories = await catRes.json();
    userServices = await svcRes.json();

    populateNewOrderCategories();
  } catch (err) {
    console.error('Initial data load error:', err);
  }
}

// Format Price
function formatPrice(usdPrice) {
  const p = parseFloat(usdPrice);
  if (currentCurrency === 'BDT') {
    return `৳ ${(p * bdtRate).toFixed(2)}`;
  }
  return `$ ${p.toFixed(4)}`;
}

// -------------------------------------------------------------
// NEW ORDER LOGIC
// -------------------------------------------------------------
function populateNewOrderCategories() {
  const catSelect = document.getElementById('orderCategorySelect');
  const svcSelect = document.getElementById('orderServiceSelect');
  if (!catSelect || !svcSelect) return;

  catSelect.innerHTML = '<option value="">-- Choose Category --</option>';
  userCategories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.name} (${c.service_count})`;
    catSelect.appendChild(opt);
  });

  catSelect.addEventListener('change', () => {
    const selectedCat = catSelect.value;
    svcSelect.innerHTML = '<option value="">-- Choose Service --</option>';
    if (!selectedCat) {
      svcSelect.disabled = true;
      resetNewOrderInfo();
      return;
    }

    const filtered = userServices.filter(s => s.category_name === selectedCat);
    filtered.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.id} - ${s.name} (${formatPrice(s.rate)} / 1K)`;
      svcSelect.appendChild(opt);
    });

    svcSelect.disabled = false;
    resetNewOrderInfo();
  });

  svcSelect.addEventListener('change', () => {
    const serviceId = parseInt(svcSelect.value, 10);
    const s = userServices.find(item => item.id === serviceId);
    if (!s) {
      resetNewOrderInfo();
      return;
    }

    document.getElementById('infoServiceName').textContent = s.name;
    document.getElementById('infoServiceRate').textContent = `${formatPrice(s.rate)} / 1,000`;
    document.getElementById('infoServiceMinMax').textContent = `Min: ${s.min.toLocaleString()} | Max: ${s.max.toLocaleString()}`;
    document.getElementById('infoServiceAvg').textContent = s.avg_time || 'Instant (0-15m)';
    document.getElementById('infoServiceRefill').innerHTML = s.refill 
      ? '<span class="badge-refill">30-Day Refill</span>' 
      : '<span class="badge-norefill">No Refill</span>';
    document.getElementById('infoServiceDesc').textContent = s.desc || 'Standard high-speed delivery. Keep account/post public.';

    document.getElementById('orderMinMaxBadge').textContent = `Min: ${s.min.toLocaleString()} | Max: ${s.max.toLocaleString()}`;
    document.getElementById('orderQuantityInput').min = s.min;
    document.getElementById('orderQuantityInput').max = s.max;
    if (parseInt(document.getElementById('orderQuantityInput').value, 10) < s.min) {
      document.getElementById('orderQuantityInput').value = s.min;
    }

    calculateOrderCost();
  });

  document.getElementById('orderQuantityInput').addEventListener('input', calculateOrderCost);
}

function resetNewOrderInfo() {
  document.getElementById('infoServiceName').textContent = 'Select a service';
  document.getElementById('infoServiceRate').textContent = '$ 0.0000';
  document.getElementById('infoServiceMinMax').textContent = '0 / 0';
  document.getElementById('infoServiceAvg').textContent = 'Instant';
  document.getElementById('infoServiceRefill').innerHTML = '<span class="badge-norefill">No Refill</span>';
  document.getElementById('infoServiceDesc').textContent = 'Select a service to view requirements.';
  document.getElementById('orderCostDisplay').textContent = '$ 0.0000';
  document.getElementById('orderCostBdtDisplay').textContent = '≈ ৳ 0.00 BDT';
}

function calculateOrderCost() {
  const svcSelect = document.getElementById('orderServiceSelect');
  const qtyInput = document.getElementById('orderQuantityInput');
  const serviceId = parseInt(svcSelect.value, 10);
  const s = userServices.find(item => item.id === serviceId);

  if (!s) {
    document.getElementById('orderCostDisplay').textContent = '$ 0.0000';
    document.getElementById('orderCostBdtDisplay').textContent = '≈ ৳ 0.00 BDT';
    return;
  }

  const qty = parseInt(qtyInput.value, 10) || 0;
  const chargeUsd = (s.rate / 1000) * qty;
  const chargeBdt = chargeUsd * bdtRate;

  document.getElementById('orderCostDisplay').textContent = `$ ${chargeUsd.toFixed(4)}`;
  document.getElementById('orderCostBdtDisplay').textContent = `≈ ৳ ${chargeBdt.toFixed(2)} BDT`;
}

async function placeSingleOrder() {
  const serviceId = parseInt(document.getElementById('orderServiceSelect').value, 10);
  const link = document.getElementById('orderLinkInput').value.trim();
  const quantity = parseInt(document.getElementById('orderQuantityInput').value, 10);
  const alertEl = document.getElementById('orderAlertMsg');
  const btn = document.getElementById('btnSubmitOrder');

  alertEl.style.display = 'none';

  if (!serviceId) {
    showAlert(alertEl, 'Please select a service', 'danger');
    return;
  }
  if (!link) {
    showAlert(alertEl, 'Please provide target URL link', 'danger');
    return;
  }
  if (isNaN(quantity) || quantity <= 0) {
    showAlert(alertEl, 'Please enter a valid quantity', 'danger');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing Order...';

  try {
    const res = await fetch('/user/orders/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: serviceId, link, quantity })
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert(alertEl, data.error || 'Failed to place order', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Order';
      return;
    }

    showAlert(alertEl, `✅ Order #${data.order_id} placed successfully! Charge: $${data.charge}`, 'success');
    currentUser.balance = parseFloat(data.remaining_balance);
    updateUserBalanceDisplay(currentUser.balance);

    document.getElementById('orderLinkInput').value = '';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Order';
  } catch (err) {
    showAlert(alertEl, 'Network error. Please try again.', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Order';
  }
}

function showAlert(el, msg, type = 'danger') {
  el.style.display = 'block';
  el.textContent = msg;
  if (type === 'danger') {
    el.style.background = '#fee2e2';
    el.style.color = '#991b1b';
    el.style.border = '1px solid #f87171';
  } else {
    el.style.background = '#dcfce7';
    el.style.color = '#166534';
    el.style.border = '1px solid #86efac';
  }
}

// -------------------------------------------------------------
// MASS ORDER LOGIC
// -------------------------------------------------------------
async function submitMassOrder() {
  const data = document.getElementById('massOrderInput').value.trim();
  const resultsBox = document.getElementById('massOrderResults');
  if (!data) {
    alert('Please enter mass order data in format: service_id|link|quantity');
    return;
  }

  try {
    const res = await fetch('/user/orders/mass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mass_data: data })
    });
    const json = await res.json();

    if (!res.ok) {
      alert(json.error || 'Mass order submission failed');
      return;
    }

    if (json.updated_balance) {
      currentUser.balance = parseFloat(json.updated_balance);
      updateUserBalanceDisplay(currentUser.balance);
    }

    resultsBox.style.display = 'block';
    let html = '<h4>Mass Order Results:</h4><div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">';
    json.results.forEach(r => {
      if (r.success) {
        html += `<div style="background:#dcfce7; color:#166534; padding:8px 12px; border-radius:6px; font-size:0.85rem;">
          ✅ Order #${r.order_id} Created (${r.line}) - Charge: $${r.charge.toFixed(4)}
        </div>`;
      } else {
        html += `<div style="background:#fee2e2; color:#991b1b; padding:8px 12px; border-radius:6px; font-size:0.85rem;">
          ❌ Failed (${r.line}): ${r.error}
        </div>`;
      }
    });
    html += '</div>';
    resultsBox.innerHTML = html;
  } catch (err) {
    alert('Failed to process mass order');
  }
}

// -------------------------------------------------------------
// ORDER HISTORY
// -------------------------------------------------------------
let orderFilterStatus = 'all';

async function loadUserOrders(silent = false) {
  const tbody = document.getElementById('userOrdersTableBody');
  const search = document.getElementById('orderSearchInput') ? document.getElementById('orderSearchInput').value.trim() : '';
  if (!silent) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px;">Loading orders...</td></tr>';
  }

  // Setup tab clicks once
  document.querySelectorAll('#orderStatusTabs .tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#orderStatusTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      orderFilterStatus = btn.dataset.status;
      loadUserOrders();
    };
  });

  try {
    let url = `/user/orders?status=${orderFilterStatus}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    const orders = await res.json();

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);">No orders found.</td></tr>';
      return;
    }

    let html = '';
    orders.forEach(o => {
      const dateStr = new Date(o.created_at).toLocaleString();
      const statusClass = `status-${o.status.replace(/\s+/g, '')}`;
      const canRefill = (o.status === 'Completed' || o.status === 'Partial') && o.refill_status !== 'Requested';

      html += `
        <tr>
          <td><strong>${o.id}</strong></td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
          <td>
            <div style="font-weight: 600; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${o.service_name}">
              ${o.service_name}
            </div>
          </td>
          <td>
            <a href="${o.link}" target="_blank" style="color:var(--primary); text-decoration:none; font-size:0.85rem;" title="${o.link}">
              <i class="fas fa-external-link-alt"></i> Link
            </a>
          </td>
          <td>${o.quantity.toLocaleString()}</td>
          <td style="font-weight: 600;">$ ${o.charge.toFixed(4)}</td>
          <td>${o.start_count}</td>
          <td>${o.remains}</td>
          <td><span class="status-badge ${statusClass}">${o.status}</span></td>
          <td>
            ${canRefill ? `<button class="btn btn-outline btn-sm" onclick="requestRefill(${o.id})">Refill</button>` : (o.refill_status !== 'None' ? `<span style="font-size:0.75rem; color:var(--text-muted);">${o.refill_status}</span>` : '-')}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--danger);">Failed to load orders.</td></tr>';
  }
}

async function requestRefill(orderId) {
  if (!confirm(`Request free refill top-up for Order #${orderId}?`)) return;

  try {
    const res = await fetch(`/user/orders/${orderId}/refill`, { method: 'POST' });
    const json = await res.json();
    if (res.ok) {
      alert('Refill requested successfully!');
      loadUserOrders();
    } else {
      alert(json.error || 'Failed to request refill');
    }
  } catch (e) {
    alert('Network error');
  }
}

// -------------------------------------------------------------
// DASHBOARD SERVICES CATALOG
// -------------------------------------------------------------
function loadDashboardServices() {
  const tbody = document.getElementById('dashServicesTableBody');
  const catFilter = document.getElementById('dashServiceCategoryFilter');
  const searchInput = document.getElementById('dashServiceSearch');

  // Populate category filter once
  if (catFilter.options.length <= 1) {
    userCategories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      catFilter.appendChild(opt);
    });

    catFilter.onchange = renderDashServices;
    searchInput.oninput = renderDashServices;
  }

  renderDashServices();
}

function renderDashServices() {
  const tbody = document.getElementById('dashServicesTableBody');
  const search = document.getElementById('dashServiceSearch').value.toLowerCase().trim();
  const cat = document.getElementById('dashServiceCategoryFilter').value;

  let filtered = userServices;
  if (cat !== 'All') {
    filtered = filtered.filter(s => s.category_name === cat);
  }
  if (search) {
    filtered = filtered.filter(s => 
      s.name.toLowerCase().includes(search) || 
      String(s.id).includes(search)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px;">No services found.</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach(s => {
    html += `
      <tr>
        <td><strong>${s.id}</strong></td>
        <td><div style="font-weight:600;">${s.name}</div></td>
        <td>$ ${s.rate.toFixed(4)}</td>
        <td>${s.min.toLocaleString()}</td>
        <td>${s.max.toLocaleString()}</td>
        <td>${s.avg_time || 'Instant'}</td>
        <td>${s.refill ? '<span class="badge-refill">Refill</span>' : '<span class="badge-norefill">No Refill</span>'}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="selectServiceForOrder(${s.id}, '${s.category_name.replace(/'/g, "\\'")}')">
            Order
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function selectServiceForOrder(serviceId, categoryName) {
  switchView('new-order');
  const catSelect = document.getElementById('orderCategorySelect');
  catSelect.value = categoryName;
  catSelect.dispatchEvent(new Event('change'));

  setTimeout(() => {
    const svcSelect = document.getElementById('orderServiceSelect');
    svcSelect.value = serviceId;
    svcSelect.dispatchEvent(new Event('change'));
  }, 100);
}

// -------------------------------------------------------------
// ADD FUNDS / DEPOSITS
// -------------------------------------------------------------
function updatePaymentInstructions() {
  const method = document.getElementById('depositMethodSelect').value;
  const title = document.getElementById('instructionsTitle');
  const body = document.getElementById('instructionsBody');
  const label = document.getElementById('depositAmountLabel');

  const bkashNum = systemSettings.bkash_number || '01864614704 (Personal)';
  const nagadNum = systemSettings.nagad_number || '01864614704 (Personal)';
  const rocketNum = systemSettings.rocket_number || '01864614704 (Personal)';
  const binancePay = systemSettings.binance_pay_id || '84729104 (USDT)';

  if (method === 'bKash') {
    title.innerHTML = '<span style="color:#e2136e;">bKash Send Money</span> Instructions';
    body.innerHTML = `
      <ol style="padding-left:18px; display:flex; flex-direction:column; gap:8px;">
        <li>Go to your bKash Mobile App or dial *247#.</li>
        <li>Choose <strong>Send Money</strong> option.</li>
        <li>Enter Personal Number: <strong style="color:var(--primary); font-size:1.05rem;">${bkashNum}</strong></li>
        <li>Enter amount in BDT (Minimum ৳ 50 BDT).</li>
        <li>Complete payment and copy the <strong>TrxID</strong> (Transaction ID).</li>
        <li>Enter the amount, TrxID and your sender phone number below and submit.</li>
      </ol>
    `;
    label.textContent = 'Amount in BDT (৳)';
  } else if (method === 'Nagad') {
    title.innerHTML = '<span style="color:#f7941d;">Nagad Send Money</span> Instructions';
    body.innerHTML = `
      <ol style="padding-left:18px; display:flex; flex-direction:column; gap:8px;">
        <li>Open your Nagad App or dial *167#.</li>
        <li>Select <strong>Send Money</strong>.</li>
        <li>Recipient Number: <strong style="color:var(--primary); font-size:1.05rem;">${nagadNum}</strong></li>
        <li>Enter amount in BDT and confirm PIN.</li>
        <li>Copy your Nagad <strong>TrxID</strong> and submit below.</li>
      </ol>
    `;
    label.textContent = 'Amount in BDT (৳)';
  } else if (method === 'Rocket') {
    title.innerHTML = '<span style="color:#8b5cf6;">Rocket Send Money</span> Instructions';
    body.innerHTML = `
      <ol style="padding-left:18px; display:flex; flex-direction:column; gap:8px;">
        <li>Open Rocket App or dial *322#.</li>
        <li>Send Money to: <strong style="color:var(--primary); font-size:1.05rem;">${rocketNum}</strong></li>
        <li>Enter amount, complete transaction, and submit your TrxID below.</li>
      </ol>
    `;
    label.textContent = 'Amount in BDT (৳)';
  } else if (method === 'Binance') {
    title.innerHTML = '<span style="color:#f59e0b;">Binance Pay & Crypto (USDT)</span>';
    body.innerHTML = `
      <ol style="padding-left:18px; display:flex; flex-direction:column; gap:8px;">
        <li>Open Binance App -> Pay -> Send.</li>
        <li>Binance Pay ID: <strong style="color:var(--primary); font-size:1.05rem;">${binancePay}</strong></li>
        <li>Or USDT (BEP20 / TRC20) address available upon support request.</li>
        <li>Minimum deposit: $ 1.00 USD.</li>
        <li>Enter your Order ID / Payment Transaction Hash below.</li>
      </ol>
    `;
    label.textContent = 'Amount in USD ($)';
  } else {
    title.textContent = 'Card / Stripe Payment';
    body.innerHTML = `
      <p>Card payments are processed securely via Stripe. Instant automated crediting upon submission.</p>
    `;
    label.textContent = 'Amount in USD ($)';
  }

  // Live currency calculation
  document.getElementById('depositAmountInput').oninput = () => {
    const amt = parseFloat(document.getElementById('depositAmountInput').value) || 0;
    const equiv = document.getElementById('depositUsdEquivalent');
    if (method === 'Binance' || method === 'Card') {
      equiv.textContent = `≈ ৳ ${(amt * bdtRate).toFixed(2)} BDT (Exchange Rate: $1 = ${bdtRate} BDT)`;
    } else {
      equiv.textContent = `≈ $ ${(amt / bdtRate).toFixed(2)} USD (Exchange Rate: $1 = ${bdtRate} BDT)`;
    }
  };
}

async function submitDeposit() {
  const method = document.getElementById('depositMethodSelect').value;
  const amount = parseFloat(document.getElementById('depositAmountInput').value);
  const trx = document.getElementById('depositTrxInput').value.trim();
  const sender = document.getElementById('depositSenderInput').value.trim();
  const alertEl = document.getElementById('depositAlertMsg');

  alertEl.style.display = 'none';

  if (isNaN(amount) || amount <= 0) {
    showAlert(alertEl, 'Please enter a valid deposit amount', 'danger');
    return;
  }
  if (!trx) {
    showAlert(alertEl, 'Please enter the Transaction ID (TrxID)', 'danger');
    return;
  }

  const isUsd = (method === 'Binance' || method === 'Card');
  const payload = {
    method,
    amount_usd: isUsd ? amount : (amount / bdtRate),
    amount_bdt: isUsd ? (amount * bdtRate) : amount,
    transaction_id: trx,
    sender_number: sender
  };

  try {
    const res = await fetch('/user/payments/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert(alertEl, data.error || 'Failed to submit deposit', 'danger');
      return;
    }

    showAlert(alertEl, `✅ ${data.message}`, 'success');
    document.getElementById('depositTrxInput').value = '';
    document.getElementById('depositSenderInput').value = '';
    loadDepositHistory();
  } catch (err) {
    showAlert(alertEl, 'Network error. Please try again.', 'danger');
  }
}

async function loadDepositHistory() {
  const tbody = document.getElementById('paymentHistoryTableBody');
  try {
    const res = await fetch('/user/payments');
    const payments = await res.json();

    if (payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No deposit history found.</td></tr>';
      return;
    }

    let html = '';
    payments.forEach(p => {
      const dateStr = new Date(p.created_at).toLocaleString();
      let statusBadge = '<span class="status-badge status-Pending">Pending</span>';
      if (p.status === 'completed') statusBadge = '<span class="status-badge status-Completed">Approved</span>';
      if (p.status === 'rejected') statusBadge = '<span class="status-badge status-Canceled">Rejected</span>';

      html += `
        <tr>
          <td><strong>#${p.id}</strong></td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
          <td><strong>${p.method}</strong></td>
          <td>$ ${p.amount_usd.toFixed(2)}</td>
          <td>৳ ${p.amount_bdt ? p.amount_bdt.toFixed(2) : '-'}</td>
          <td><code>${p.transaction_id}</code></td>
          <td>${statusBadge}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--danger);">Failed to load history.</td></tr>';
  }
}

// -------------------------------------------------------------
// SUPPORT TICKETS
// -------------------------------------------------------------
async function loadUserTickets() {
  const tbody = document.getElementById('userTicketsTableBody');
  try {
    const res = await fetch('/user/tickets');
    const tickets = await res.json();

    if (tickets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">No support tickets opened yet.</td></tr>';
      return;
    }

    let html = '';
    tickets.forEach(t => {
      const dateStr = new Date(t.updated_at).toLocaleString();
      let badge = '<span class="status-badge status-Pending">Open</span>';
      if (t.status === 'answered') badge = '<span class="status-badge status-Completed">Answered</span>';
      if (t.status === 'closed') badge = '<span class="status-badge status-Canceled">Closed</span>';

      html += `
        <tr>
          <td><strong>#${t.id}</strong></td>
          <td><strong>${t.subject}</strong></td>
          <td>${t.reference_id || '-'}</td>
          <td>${badge}</td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="openTicketThreadModal(${t.id})">
              <i class="fas fa-comment-dots"></i> View Chat
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--danger);">Failed to load tickets.</td></tr>';
  }
}

function openNewTicketModal() {
  document.getElementById('newTicketModal').classList.add('active');
}
function closeNewTicketModal() {
  document.getElementById('newTicketModal').classList.remove('active');
}

async function submitNewTicket(e) {
  e.preventDefault();
  const subject = document.getElementById('newTicketSubject').value;
  const ref = document.getElementById('newTicketRef').value.trim();
  const msg = document.getElementById('newTicketMsg').value.trim();

  try {
    const res = await fetch('/user/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, reference_id: ref, message: msg })
    });
    const data = await res.json();

    if (res.ok) {
      closeNewTicketModal();
      document.getElementById('newTicketMsg').value = '';
      loadUserTickets();
      openTicketThreadModal(data.ticket_id);
    } else {
      alert(data.error || 'Failed to open ticket');
    }
  } catch (err) {
    alert('Network error');
  }
}

async function openTicketThreadModal(ticketId) {
  activeTicketId = ticketId;
  const modal = document.getElementById('ticketThreadModal');
  const title = document.getElementById('ticketModalTitle');
  const subject = document.getElementById('ticketModalSubject');
  const container = document.getElementById('ticketMessagesContainer');

  container.innerHTML = '<div>Loading conversation...</div>';
  modal.classList.add('active');

  try {
    const res = await fetch(`/user/tickets/${ticketId}`);
    const data = await res.json();

    title.textContent = `Ticket #${data.ticket.id}: ${data.ticket.subject}`;
    subject.textContent = `Status: ${data.ticket.status.toUpperCase()} | Ref: ${data.ticket.reference_id || 'None'}`;

    let html = '';
    data.messages.forEach(m => {
      const isAdmin = m.sender_role === 'admin';
      const bg = isAdmin ? '#eff6ff' : 'var(--body-bg)';
      const border = isAdmin ? '#3b82f6' : 'var(--border-color)';
      const senderName = isAdmin ? 'Support Team (Admin)' : 'You';
      const dateStr = new Date(m.created_at).toLocaleTimeString();

      html += `
        <div style="background:${bg}; border-left:4px solid ${border}; padding:10px 14px; border-radius:6px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.8rem; font-weight:700;">
            <span style="color:${isAdmin ? 'var(--primary)' : 'inherit'};">${senderName}</span>
            <span style="color:var(--text-muted);">${dateStr}</span>
          </div>
          <div style="font-size:0.9rem; line-height:1.5; white-space:pre-wrap;">${m.message}</div>
        </div>
      `;
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  } catch (err) {
    container.innerHTML = '<div style="color:var(--danger);">Failed to load messages.</div>';
  }
}

function closeTicketThreadModal() {
  document.getElementById('ticketThreadModal').classList.remove('active');
  activeTicketId = null;
}

async function sendTicketReply() {
  if (!activeTicketId) return;
  const input = document.getElementById('ticketReplyInput');
  const msg = input.value.trim();
  if (!msg) return;

  try {
    const res = await fetch(`/user/tickets/${activeTicketId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    if (res.ok) {
      input.value = '';
      openTicketThreadModal(activeTicketId);
    }
  } catch (err) {
    alert('Failed to send reply');
  }
}

// -------------------------------------------------------------
// API KEY VIEW
// -------------------------------------------------------------
function loadApiKeyView() {
  const display = document.getElementById('apiKeyDisplay');
  if (display && currentUser) {
    display.value = currentUser.api_key || 'No API key generated';
  }
}

function toggleApiKeyVisibility() {
  const display = document.getElementById('apiKeyDisplay');
  const btn = document.getElementById('btnToggleApiKey');
  if (display.type === 'password') {
    display.type = 'text';
    btn.textContent = 'Hide';
  } else {
    display.type = 'password';
    btn.textContent = 'Show';
  }
}

function copyApiKey() {
  const display = document.getElementById('apiKeyDisplay');
  navigator.clipboard.writeText(display.value);
  alert('API Key copied to clipboard!');
}

async function regenerateApiKey() {
  if (!confirm('Regenerate your API Key? Any existing apps connected with your old key will stop working until updated.')) return;

  try {
    const res = await fetch('/auth/api-key/regenerate', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      currentUser.api_key = data.api_key;
      document.getElementById('apiKeyDisplay').value = data.api_key;
      alert('New API Key generated successfully!');
    }
  } catch (err) {
    alert('Failed to regenerate key');
  }
}

// -------------------------------------------------------------
// ADMIN MANAGEMENT LOGIC
// -------------------------------------------------------------
async function loadAdminOverview() {
  try {
    const res = await fetch('/admin/stats');
    const data = await res.json();
    document.getElementById('admStatRevenue').textContent = `$ ${data.total_revenue}`;
    document.getElementById('admStatOrders').textContent = data.total_orders.toLocaleString();
    document.getElementById('admStatPendingOrders').textContent = data.pending_orders.toLocaleString();
    document.getElementById('admStatUsers').textContent = data.total_users.toLocaleString();
    document.getElementById('admStatPendingPayments').textContent = data.pending_payments.toLocaleString();
  } catch (err) {
    console.error('Failed to load admin overview:', err);
  }
}

async function loadAdminOrders() {
  const tbody = document.getElementById('admOrdersTableBody');
  try {
    const res = await fetch('/admin/orders');
    const orders = await res.json();

    let html = '';
    orders.forEach(o => {
      html += `
        <tr>
          <td><strong>#${o.id}</strong></td>
          <td><strong>${o.username}</strong></td>
          <td><div style="font-weight:600; max-width:200px; overflow:hidden; text-overflow:ellipsis;">${o.service_name}</div></td>
          <td><a href="${o.link}" target="_blank" style="color:var(--primary); font-size:0.8rem;"><i class="fas fa-link"></i></a></td>
          <td>${o.quantity}</td>
          <td>$ ${o.charge.toFixed(4)}</td>
          <td>${o.start_count} / ${o.remains}</td>
          <td>
            <select class="form-control" style="padding:4px 8px; font-size:0.8rem;" onchange="updateAdminOrderStatus(${o.id}, this.value)">
              <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
              <option value="In progress" ${o.status === 'In progress' ? 'selected' : ''}>In progress</option>
              <option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>Completed</option>
              <option value="Partial" ${o.status === 'Partial' ? 'selected' : ''}>Partial</option>
              <option value="Canceled" ${o.status === 'Canceled' ? 'selected' : ''}>Canceled</option>
            </select>
          </td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="refundAdminOrder(${o.id})" title="Cancel & Refund">
              <i class="fas fa-undo"></i> Refund
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--danger);">Failed to load admin orders.</td></tr>';
  }
}

async function updateAdminOrderStatus(orderId, newStatus) {
  try {
    await fetch(`/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
  } catch (e) {
    alert('Failed to update status');
  }
}

async function refundAdminOrder(orderId) {
  if (!confirm(`Cancel order #${orderId} and refund the full charge to user balance?`)) return;
  try {
    const res = await fetch(`/admin/orders/${orderId}/refund`, { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'Refund processed');
    loadAdminOrders();
  } catch (e) {
    alert('Failed to process refund');
  }
}

async function loadAdminServices() {
  const tbody = document.getElementById('admServicesTableBody');
  try {
    const res = await fetch('/admin/services');
    const services = await res.json();

    let html = '';
    services.slice(0, 100).forEach(s => {
      html += `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td><div style="font-weight:600; max-width:280px; overflow:hidden; text-overflow:ellipsis;">${s.name}</div></td>
          <td>${s.category_name}</td>
          <td>$ ${s.rate.toFixed(4)}</td>
          <td>${s.min} / ${s.max}</td>
          <td>${s.refill ? 'Yes' : 'No'}</td>
          <td><span class="status-badge status-${s.status === 'active' ? 'Completed' : 'Canceled'}">${s.status}</span></td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteAdminService(${s.id})" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8">Failed to load admin services</td></tr>';
  }
}

async function deleteAdminService(serviceId) {
  if (!confirm(`Delete service #${serviceId}?`)) return;
  try {
    await fetch(`/admin/services/${serviceId}`, { method: 'DELETE' });
    loadAdminServices();
  } catch (e) {
    alert('Failed to delete service');
  }
}

function openBulkMarkupModal() {
  const pct = prompt('Enter percentage price markup to apply to all services (e.g. 10 for +10%, -5 for -5%):', '10');
  if (pct !== null) {
    fetch('/admin/services/bulk-markup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percentage: pct })
    }).then(r => r.json()).then(data => {
      alert(data.message || 'Prices updated');
      loadAdminServices();
    });
  }
}

async function loadAdminUsers() {
  const tbody = document.getElementById('admUsersTableBody');
  try {
    const res = await fetch('/admin/users');
    const users = await res.json();

    let html = '';
    users.forEach(u => {
      html += `
        <tr>
          <td><strong>#${u.id}</strong></td>
          <td><strong>${u.username}</strong></td>
          <td>${u.email}</td>
          <td><span class="brand-badge">${u.role}</span></td>
          <td style="font-weight:700; color:var(--success);">$ ${u.balance.toFixed(4)}</td>
          <td>$ ${u.spent.toFixed(2)}</td>
          <td><span class="status-badge status-${u.status === 'active' ? 'Completed' : 'Canceled'}">${u.status}</span></td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-outline btn-sm" onclick="adjustUserBalance(${u.id}, '${u.username}')" title="Adjust Funds">
                <i class="fas fa-dollar-sign"></i> Funds
              </button>
              <button class="btn btn-danger btn-sm" onclick="toggleUserStatus(${u.id}, '${u.status}')">
                ${u.status === 'active' ? 'Suspend' : 'Activate'}
              </button>
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="8">Failed to load users</td></tr>';
  }
}

function adjustUserBalance(userId, username) {
  const action = prompt(`Add or deduct balance for ${username}? Type "add" or "deduct":`, 'add');
  if (!action || (action !== 'add' && action !== 'deduct')) return;
  const amt = prompt(`Enter amount in USD to ${action}:`, '10.00');
  if (!amt || isNaN(amt)) return;

  fetch(`/admin/users/${userId}/balance`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, amount: amt })
  }).then(r => r.json()).then(data => {
    alert(`Success! Updated balance: $${data.balance}`);
    loadAdminUsers();
  });
}

function toggleUserStatus(userId, currentStatus) {
  const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
  fetch(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: nextStatus })
  }).then(() => loadAdminUsers());
}

async function loadAdminPayments() {
  const tbody = document.getElementById('admPaymentsTableBody');
  try {
    const res = await fetch('/admin/payments');
    const payments = await res.json();

    let html = '';
    payments.forEach(p => {
      const isPending = p.status === 'pending';
      html += `
        <tr>
          <td><strong>#${p.id}</strong></td>
          <td><strong>${p.username}</strong></td>
          <td>${p.method}</td>
          <td><strong>$ ${p.amount_usd.toFixed(2)}</strong></td>
          <td>৳ ${p.amount_bdt ? p.amount_bdt.toFixed(2) : '-'}</td>
          <td><code>${p.transaction_id}</code></td>
          <td>${p.sender_number || '-'}</td>
          <td><span class="status-badge status-${p.status === 'completed' ? 'Completed' : (p.status === 'pending' ? 'Pending' : 'Canceled')}">${p.status}</span></td>
          <td>
            ${isPending ? `
              <div style="display:flex; gap:6px;">
                <button class="btn btn-success btn-sm" onclick="approvePayment(${p.id})">Approve</button>
                <button class="btn btn-danger btn-sm" onclick="rejectPayment(${p.id})">Reject</button>
              </div>
            ` : '-'}
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="9">Failed to load payments</td></tr>';
  }
}

async function approvePayment(paymentId) {
  if (!confirm(`Approve deposit #${paymentId} and credit user balance?`)) return;
  const res = await fetch(`/admin/payments/${paymentId}/approve`, { method: 'POST' });
  const data = await res.json();
  alert(data.message || 'Payment approved');
  loadAdminPayments();
}

async function rejectPayment(paymentId) {
  if (!confirm(`Reject deposit #${paymentId}?`)) return;
  await fetch(`/admin/payments/${paymentId}/reject`, { method: 'POST' });
  loadAdminPayments();
}

async function loadAdminTickets() {
  const tbody = document.getElementById('admTicketsTableBody');
  try {
    const res = await fetch('/admin/tickets');
    const tickets = await res.json();

    let html = '';
    tickets.forEach(t => {
      html += `
        <tr>
          <td><strong>#${t.id}</strong></td>
          <td>${t.username}</td>
          <td><strong>${t.subject}</strong></td>
          <td>${t.reference_id || '-'}</td>
          <td><span class="status-badge status-${t.status === 'open' ? 'Pending' : (t.status === 'answered' ? 'Completed' : 'Canceled')}">${t.status}</span></td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${new Date(t.updated_at).toLocaleString()}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="openTicketThreadModal(${t.id})">
              Reply
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="7">Failed to load admin tickets</td></tr>';
  }
}

async function loadAdminProviders() {
  const tbody = document.getElementById('admProvidersTableBody');
  try {
    const res = await fetch('/admin/providers');
    const providers = await res.json();

    if (providers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No upstream providers configured yet.</td></tr>';
      return;
    }

    let html = '';
    providers.forEach(p => {
      html += `
        <tr>
          <td><strong>#${p.id}</strong></td>
          <td><strong>${p.name}</strong></td>
          <td><code>${p.api_url}</code></td>
          <td><strong>$ ${p.balance.toFixed(2)} ${p.currency}</strong></td>
          <td><span class="status-badge status-Completed">${p.status}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="testProviderConnection(${p.id})">
              <i class="fas fa-plug"></i> Test Balance
            </button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6">Failed to load providers</td></tr>';
  }
}

async function testProviderConnection(providerId) {
  try {
    const res = await fetch(`/admin/providers/${providerId}/test`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(`Provider connection verified! Available balance: $${data.balance} ${data.currency}`);
      loadAdminProviders();
    } else {
      alert(`Connection failed: ${data.error}`);
    }
  } catch (e) {
    alert('Connection test failed');
  }
}

function openAddProviderModal() {
  const name = prompt('Enter Provider Name (e.g. SAFollow Upstream / JustAnotherPanel):');
  if (!name) return;
  const url = prompt('Enter Provider API URL (e.g. https://www.safollow.com/api/v2):');
  if (!url) return;
  const key = prompt('Enter Provider API Key:');
  if (!key) return;

  fetch('/admin/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, api_url: url, api_key: key })
  }).then(r => r.json()).then(data => {
    alert(data.message || 'Provider added');
    loadAdminProviders();
  });
}

async function loadAdminSettings() {
  try {
    const res = await fetch('/admin/settings');
    const settings = await res.json();

    document.getElementById('setSiteName').value = settings.site_name || 'SAFollow';
    document.getElementById('setBdtRate').value = settings.bdt_rate || '120.0';
    document.getElementById('setWhatsapp').value = settings.whatsapp_number || '';
    document.getElementById('setTelegram').value = settings.telegram_channel || '';
    document.getElementById('setBkash').value = settings.bkash_number || '';
    document.getElementById('setNagad').value = settings.nagad_number || '';
    document.getElementById('setRocket').value = settings.rocket_number || '';
    document.getElementById('setBinance').value = settings.binance_pay_id || '';
    document.getElementById('setAnnouncement').value = settings.announcement || '';
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

async function saveAdminSettings(e) {
  e.preventDefault();
  const payload = {
    site_name: document.getElementById('setSiteName').value.trim(),
    bdt_rate: document.getElementById('setBdtRate').value.trim(),
    whatsapp_number: document.getElementById('setWhatsapp').value.trim(),
    telegram_channel: document.getElementById('setTelegram').value.trim(),
    bkash_number: document.getElementById('setBkash').value.trim(),
    nagad_number: document.getElementById('setNagad').value.trim(),
    rocket_number: document.getElementById('setRocket').value.trim(),
    binance_pay_id: document.getElementById('setBinance').value.trim(),
    announcement: document.getElementById('setAnnouncement').value.trim()
  };

  try {
    const res = await fetch('/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message || 'Settings saved successfully');
    bdtRate = parseFloat(payload.bdt_rate);
    updateUserBalanceDisplay(currentUser.balance);
  } catch (err) {
    alert('Failed to save settings');
  }
}

// Logout
async function logoutUser() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

// Currency Toggle in Dashboard
function initCurrencyToggle() {
  const btn = document.getElementById('currencyToggleBtn');
  if (!btn) return;
  btn.textContent = currentCurrency === 'USD' ? '$ USD' : '৳ BDT';

  btn.addEventListener('click', () => {
    currentCurrency = currentCurrency === 'USD' ? 'BDT' : 'USD';
    localStorage.setItem('saf_currency', currentCurrency);
    btn.textContent = currentCurrency === 'USD' ? '$ USD' : '৳ BDT';
    if (currentUser) updateUserBalanceDisplay(currentUser.balance);
    calculateOrderCost();
  });
}

// Theme Toggle
function initThemeToggle() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  updateThemeIcon(btn);

  btn.addEventListener('click', () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('saf_theme', currentTheme);
    updateThemeIcon(btn);
  });
}

function updateThemeIcon(btn) {
  btn.innerHTML = currentTheme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
}
