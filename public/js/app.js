// SAFollow V3.0 - Frontend Interactive Script

let currentCurrency = localStorage.getItem('saf_currency') || 'USD';
let currentTheme = localStorage.getItem('saf_theme') || 'light';
let bdtRate = 120.0;
let servicesCache = [];
let categoriesCache = [];

// Apply Initial Theme
document.documentElement.setAttribute('data-theme', currentTheme);

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  initCurrencyToggle();
  await loadPublicSettings();
  await loadServicesForCalculator();
  initFaqAccordion();
});

// Settings & Rates
async function loadPublicSettings() {
  try {
    const res = await fetch('/public-api/settings');
    const data = await res.json();
    if (data.bdt_rate) {
      bdtRate = parseFloat(data.bdt_rate);
    }
    if (data.announcement) {
      const banner = document.getElementById('announcementText');
      if (banner) banner.textContent = data.announcement;
    }
    if (data.whatsapp_number) {
      const waLink = document.getElementById('whatsappFloatLink');
      if (waLink) waLink.href = `https://wa.me/${data.whatsapp_number.replace(/[^0-9]/g, '')}`;
    }
    if (data.telegram_channel) {
      const tgLink = document.getElementById('telegramFloatLink');
      if (tgLink) tgLink.href = data.telegram_channel;
    }
  } catch (err) {
    console.error('Settings load error:', err);
  }
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

// Currency Toggle
function initCurrencyToggle() {
  const btn = document.getElementById('currencyToggleBtn');
  if (!btn) return;
  btn.textContent = currentCurrency === 'USD' ? '$ USD' : '৳ BDT';

  btn.addEventListener('click', () => {
    currentCurrency = currentCurrency === 'USD' ? 'BDT' : 'USD';
    localStorage.setItem('saf_currency', currentCurrency);
    btn.textContent = currentCurrency === 'USD' ? '$ USD' : '৳ BDT';
    updateAllPrices();
  });
}

// Format Price Helper
function formatPrice(usdPrice) {
  const p = parseFloat(usdPrice);
  if (currentCurrency === 'BDT') {
    return `৳ ${(p * bdtRate).toFixed(2)}`;
  }
  return `$ ${p.toFixed(4)}`;
}

// Update all prices on page
function updateAllPrices() {
  document.querySelectorAll('[data-usd-rate]').forEach(el => {
    const rate = parseFloat(el.getAttribute('data-usd-rate'));
    el.textContent = formatPrice(rate);
  });

  // Update calculator
  calculateHeroCost();
}

// Calculator Logic on Hero
async function loadServicesForCalculator() {
  const catSelect = document.getElementById('calcCategorySelect');
  const svcSelect = document.getElementById('calcServiceSelect');
  if (!catSelect || !svcSelect) return;

  try {
    const res = await fetch('/public-api/services');
    servicesCache = await res.json();

    // Group categories
    const cats = [...new Set(servicesCache.map(s => s.category_name))];
    catSelect.innerHTML = '<option value="">-- Choose Social Platform / Category --</option>';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      catSelect.appendChild(opt);
    });

    catSelect.addEventListener('change', () => {
      const selectedCat = catSelect.value;
      svcSelect.innerHTML = '<option value="">-- Select Specific Service --</option>';
      if (!selectedCat) {
        svcSelect.disabled = true;
        return;
      }

      const filtered = servicesCache.filter(s => s.category_name === selectedCat);
      filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `ID ${s.id}: ${s.name} (${formatPrice(s.rate)} / 1K)`;
        opt.dataset.rate = s.rate;
        opt.dataset.min = s.min;
        opt.dataset.max = s.max;
        svcSelect.appendChild(opt);
      });
      svcSelect.disabled = false;
      calculateHeroCost();
    });

    svcSelect.addEventListener('change', calculateHeroCost);

    const qtyInput = document.getElementById('calcQuantityInput');
    if (qtyInput) {
      qtyInput.addEventListener('input', calculateHeroCost);
    }
  } catch (err) {
    console.error('Failed to load services for calculator:', err);
  }
}

function calculateHeroCost() {
  const svcSelect = document.getElementById('calcServiceSelect');
  const qtyInput = document.getElementById('calcQuantityInput');
  const costDisplay = document.getElementById('calcCostDisplay');
  const minMaxDisplay = document.getElementById('calcMinMaxDisplay');

  if (!svcSelect || !qtyInput || !costDisplay) return;

  const opt = svcSelect.selectedOptions[0];
  if (!opt || !opt.dataset.rate) {
    costDisplay.textContent = formatPrice(0);
    if (minMaxDisplay) minMaxDisplay.textContent = 'Min: 0 | Max: 0';
    return;
  }

  const rate = parseFloat(opt.dataset.rate);
  const min = parseInt(opt.dataset.min, 10);
  const max = parseInt(opt.dataset.max, 10);
  const qty = parseInt(qtyInput.value, 10) || 0;

  if (minMaxDisplay) {
    minMaxDisplay.textContent = `Min: ${min.toLocaleString()} | Max: ${max.toLocaleString()}`;
  }

  const total = (rate / 1000) * qty;
  costDisplay.textContent = formatPrice(total);
}

// FAQ Accordion
function initFaqAccordion() {
  document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
      const parent = q.parentElement;
      const isOpen = parent.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(item => item.classList.remove('active'));
      if (!isOpen) {
        parent.classList.add('active');
      }
    });
  });
}

// Auth Modal
function openAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  const title = document.getElementById('authModalTitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const emailGroup = document.getElementById('authEmailGroup');
  const switchText = document.getElementById('authSwitchText');

  if (!modal) return;
  modal.classList.add('active');

  if (mode === 'signup') {
    title.textContent = 'Create Free Account';
    submitBtn.textContent = 'Register Now';
    emailGroup.style.display = 'block';
    switchText.innerHTML = 'Already have an account? <a href="javascript:void(0)" onclick="openAuthModal(\'login\')">Sign In</a>';
    modal.dataset.mode = 'signup';
  } else {
    title.textContent = 'Welcome Back 👋';
    submitBtn.textContent = 'Sign In to Dashboard';
    emailGroup.style.display = 'none';
    switchText.innerHTML = 'Don\'t have an account? <a href="javascript:void(0)" onclick="openAuthModal(\'signup\')">Register Free</a>';
    modal.dataset.mode = 'login';
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('active');
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const modal = document.getElementById('authModal');
  const mode = modal.dataset.mode || 'login';
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const email = document.getElementById('authEmail') ? document.getElementById('authEmail').value.trim() : '';
  const errorEl = document.getElementById('authErrorMsg');

  errorEl.style.display = 'none';

  const endpoint = mode === 'signup' ? '/auth/register' : '/auth/login';
  const body = mode === 'signup' ? { username, email, password } : { username, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Authentication failed';
      errorEl.style.display = 'block';
      return;
    }

    // Success -> redirect to dashboard
    window.location.href = '/dashboard';
  } catch (err) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.style.display = 'block';
  }
}
