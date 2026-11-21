const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('./auth');
const { callProviderApi, cleanUrl } = require('../providerService');

// Protect all admin endpoints
router.use(requireAdmin);

// Dashboard overview stats
router.get('/stats', (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT count(*) as c FROM users').get().c;
    const totalOrders = db.prepare('SELECT count(*) as c FROM orders').get().c;
    const pendingOrders = db.prepare("SELECT count(*) as c FROM orders WHERE status = 'Pending'").get().c;
    const totalRevenue = db.prepare("SELECT SUM(charge) as s FROM orders WHERE status != 'Canceled'").get().s || 0;
    const pendingPayments = db.prepare("SELECT count(*) as c FROM payments WHERE status = 'pending'").get().c;
    const openTickets = db.prepare("SELECT count(*) as c FROM tickets WHERE status = 'open'").get().c;

    res.json({
      total_users: totalUsers,
      total_orders: totalOrders,
      pending_orders: pendingOrders,
      total_revenue: totalRevenue.toFixed(2),
      pending_payments: pendingPayments,
      open_tickets: openTickets
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// Orders Management
router.get('/orders', (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT o.*, u.username 
      FROM orders o 
      JOIN users u ON u.id = o.user_id 
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND LOWER(o.status) = LOWER(?)';
      params.push(status);
    }

    if (search) {
      query += ' AND (o.id LIKE ? OR u.username LIKE ? OR o.service_name LIKE ? OR o.link LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const orders = db.prepare(query).all(...params);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin orders' });
  }
});

// Update Order Status
router.patch('/orders/:id', (req, res) => {
  const { status, start_count, remains } = req.body;
  const orderId = req.params.id;

  try {
    const updates = [];
    const params = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (start_count !== undefined) {
      updates.push('start_count = ?');
      params.push(parseInt(start_count));
    }
    if (remains !== undefined) {
      updates.push('remains = ?');
      params.push(parseInt(remains));
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(orderId);

    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true, message: 'Order updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Refund Order
router.post('/orders/:id/refund', (req, res) => {
  const orderId = req.params.id;
  const { reason } = req.body;

  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'Canceled') return res.status(400).json({ error: 'Order is already canceled/refunded' });

    const refundTx = db.transaction(() => {
      db.prepare('UPDATE users SET balance = balance + ?, spent = spent - ? WHERE id = ?')
        .run(order.charge, order.charge, order.user_id);

      db.prepare("UPDATE orders SET status = 'Canceled', remains = quantity, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(orderId);
    });

    refundTx();
    res.json({ success: true, message: `Refunded $${order.charge.toFixed(4)} to user balance` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// Services Management
router.get('/services', (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM services ORDER BY category_name, id').all();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin services' });
  }
});

router.post('/services', (req, res) => {
  const { name, category_name, rate, min, max, desc, refill, provider_id, provider_service_id } = req.body;
  if (!name || !category_name || rate === undefined) {
    return res.status(400).json({ error: 'Name, category and rate are required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO services 
      (name, category_name, rate, min, max, desc, refill, provider_id, provider_service_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      name,
      category_name,
      parseFloat(rate),
      parseInt(min) || 100,
      parseInt(max) || 10000,
      desc || '',
      refill ? 1 : 0,
      provider_id || null,
      provider_service_id || null
    );

    res.json({ success: true, message: 'Service created', service_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create service' });
  }
});

router.put('/services/:id', (req, res) => {
  const { name, category_name, rate, min, max, desc, refill, status } = req.body;
  try {
    db.prepare(`
      UPDATE services 
      SET name = ?, category_name = ?, rate = ?, min = ?, max = ?, desc = ?, refill = ?, status = ?
      WHERE id = ?
    `).run(
      name,
      category_name,
      parseFloat(rate),
      parseInt(min),
      parseInt(max),
      desc || '',
      refill ? 1 : 0,
      status || 'active',
      req.params.id
    );

    res.json({ success: true, message: 'Service updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update service' });
  }
});

router.delete('/services/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Service deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// Bulk Price Markup
router.post('/services/bulk-markup', (req, res) => {
  const { percentage, category } = req.body;
  const pct = parseFloat(percentage);

  if (isNaN(pct)) return res.status(400).json({ error: 'Valid percentage is required' });

  try {
    const factor = 1 + (pct / 100);
    if (category && category !== 'all') {
      db.prepare('UPDATE services SET rate = ROUND(rate * ?, 4) WHERE category_name = ?').run(factor, category);
    } else {
      db.prepare('UPDATE services SET rate = ROUND(rate * ?, 4)').run(factor);
    }

    res.json({ success: true, message: `Prices adjusted by ${pct}% successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to adjust markup' });
  }
});

// Users Management
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, email, role, balance, spent, api_key, status, created_at 
      FROM users ORDER BY id DESC
    `).all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch('/users/:id/balance', (req, res) => {
  const { amount, action } = req.body;
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Valid amount required' });

  try {
    if (action === 'add') {
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, req.params.id);
    } else if (action === 'deduct') {
      db.prepare('UPDATE users SET balance = MAX(0, balance - ?) WHERE id = ?').run(amt, req.params.id);
    } else {
      return res.status(400).json({ error: 'Action must be add or deduct' });
    }

    const updated = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.params.id);
    res.json({ success: true, balance: updated.balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to adjust user balance' });
  }
});

router.patch('/users/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended', 'banned'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: `User status changed to ${status}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change user status' });
  }
});

// Payments & Deposits Management
router.get('/payments', (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT p.*, u.username, u.email 
      FROM payments p 
      JOIN users u ON u.id = p.user_id 
      ORDER BY p.id DESC
    `).all();
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

router.post('/payments/:id/approve', (req, res) => {
  try {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.status !== 'pending') return res.status(400).json({ error: `Payment is already ${payment.status}` });

    const approveTx = db.transaction(() => {
      db.prepare("UPDATE payments SET status = 'completed' WHERE id = ?").run(payment.id);
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(payment.amount_usd, payment.user_id);
    });

    approveTx();
    res.json({ success: true, message: `Approved! Credited $${payment.amount_usd.toFixed(2)} to user` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve payment' });
  }
});

router.post('/payments/:id/reject', (req, res) => {
  try {
    db.prepare("UPDATE payments SET status = 'rejected' WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: 'Payment rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject payment' });
  }
});

// Tickets Management
router.get('/tickets', (req, res) => {
  try {
    const tickets = db.prepare(`
      SELECT t.*, u.username 
      FROM tickets t 
      JOIN users u ON u.id = t.user_id 
      ORDER BY t.updated_at DESC
    `).all();
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/tickets/:id', (req, res) => {
  try {
    const ticket = db.prepare(`
      SELECT t.*, u.username 
      FROM tickets t 
      JOIN users u ON u.id = t.user_id 
      WHERE t.id = ?
    `).get(req.params.id);

    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const messages = db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC')
      .all(ticket.id);

    res.json({ ticket, messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ticket thread' });
  }
});

router.post('/tickets/:id/reply', (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, message)
      VALUES (?, ?, 'admin', ?)
    `).run(req.params.id, req.user.id, message.trim());

    db.prepare("UPDATE tickets SET status = 'answered', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(req.params.id);

    res.json({ success: true, message: 'Admin reply posted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to post reply' });
  }
});

router.patch('/tickets/:id/status', (req, res) => {
  const { status } = req.body;
  try {
    db.prepare('UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, req.params.id);
    res.json({ success: true, message: 'Ticket status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

// Providers Management
router.get('/providers', (req, res) => {
  try {
    const providers = db.prepare(`
      SELECT p.*, 
        (SELECT count(*) FROM services s WHERE s.provider_id = p.id) as linked_services
      FROM providers p 
      ORDER BY p.id
    `).all();
    res.json(providers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

router.post('/providers', (req, res) => {
  let { name, api_url, api_key } = req.body;
  if (!name || !api_url) {
    return res.status(400).json({ error: 'Name and API URL are required' });
  }

  api_url = cleanUrl(api_url);
  api_key = (api_key || '').trim();

  try {
    const resId = db.prepare('INSERT INTO providers (name, api_url, api_key) VALUES (?, ?, ?)')
      .run(name.trim(), api_url, api_key);
    res.json({ success: true, message: 'Provider added successfully', id: resId.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add provider' });
  }
});

router.put('/providers/:id', (req, res) => {
  let { name, api_url, api_key, status } = req.body;
  const providerId = req.params.id;

  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  const updates = [];
  const params = [];

  if (name) { updates.push('name = ?'); params.push(name.trim()); }
  if (api_url) { updates.push('api_url = ?'); params.push(cleanUrl(api_url)); }
  if (api_key !== undefined) { updates.push('api_key = ?'); params.push(api_key.trim()); }
  if (status) { updates.push('status = ?'); params.push(status); }

  if (updates.length === 0) return res.json({ success: true, message: 'No changes made' });

  params.push(providerId);
  try {
    db.prepare(`UPDATE providers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true, message: 'Provider updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

router.delete('/providers/:id', (req, res) => {
  const providerId = req.params.id;
  try {
    db.prepare('UPDATE services SET provider_id = NULL, provider_service_id = NULL WHERE provider_id = ?').run(providerId);
    db.prepare('DELETE FROM providers WHERE id = ?').run(providerId);
    res.json({ success: true, message: 'Provider deleted and services unlinked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

router.post('/providers/:id/test', async (req, res) => {
  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  if (!provider.api_key || provider.api_key.trim().length < 5) {
    return res.status(400).json({ 
      success: false, 
      error: 'API key is missing or empty. Please enter your API key from your provider account (e.g. safollow.com/account).' 
    });
  }

  const result = await callProviderApi(provider.api_url, {
    key: provider.api_key.trim(),
    action: 'balance'
  });

  if (result && result.balance !== undefined) {
    const balance = parseFloat(result.balance) || 0;
    const currency = result.currency || 'USD';
    db.prepare('UPDATE providers SET balance = ?, currency = ? WHERE id = ?')
      .run(balance, currency, provider.id);
    res.json({ success: true, balance, currency });
  } else {
    const err = (result && result.error) ? result.error : 'Connection failed. Check API URL and Key.';
    res.status(400).json({ success: false, error: err });
  }
});

// Bind all services to a provider for live order dispatch
router.post('/providers/:id/bind-all', (req, res) => {
  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  try {
    db.prepare('UPDATE services SET provider_id = ?, provider_service_id = id').run(provider.id);
    res.json({ 
      success: true, 
      message: `Successfully linked all 1,034 services to "${provider.name}"! Real orders will now be forwarded to their API.` 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bind services to provider' });
  }
});

// Fulfillment status check
router.get('/fulfillment-status', (req, res) => {
  try {
    const modeSetting = db.prepare("SELECT value FROM settings WHERE key = 'fulfillment_mode'").get();
    const providers = db.prepare(`
      SELECT p.id, p.name, p.api_url, p.balance, p.currency, p.status,
        (SELECT count(*) FROM services s WHERE s.provider_id = p.id) as linked_services,
        (CASE WHEN length(p.api_key) > 5 THEN 1 ELSE 0 END) as has_key
      FROM providers p
    `).all();

    const totalServices = db.prepare('SELECT count(*) as c FROM services').get().c;
    const linkedServices = db.prepare('SELECT count(*) as c FROM services WHERE provider_id IS NOT NULL').get().c;

    res.json({
      fulfillment_mode: modeSetting ? modeSetting.value : 'live',
      providers,
      total_services: totalServices,
      linked_services: linkedServices
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check fulfillment status' });
  }
});

router.post('/fulfillment-mode', (req, res) => {
  const { mode } = req.body;
  if (!['smart', 'live', 'simulation'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode. Must be "smart", "live", or "simulation"' });
  }

  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('fulfillment_mode', ?)").run(mode);
    res.json({ success: true, message: `Fulfillment mode set to ${mode}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update fulfillment mode' });
  }
});

// System Settings
router.get('/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.post('/settings', (req, res) => {
  const settings = req.body;
  try {
    const updateSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const updateTx = db.transaction((obj) => {
      for (const [k, v] of Object.entries(obj)) {
        updateSetting.run(k, String(v));
      }
    });
    updateTx(settings);
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ==========================================
// BOT ACCOUNT FARM (Direct Internal Engine)
// ==========================================
const { getAccountStats, importAccounts } = require('../engine/accountManager');
const { testAccountSession } = require('../engine/instagramEngine');

router.get('/bot-accounts', (req, res) => {
  try {
    const { platform = 'instagram' } = req.query;
    const accounts = db.prepare('SELECT id, platform, username, status, total_followed, last_used_at, notes, created_at, proxy FROM bot_accounts WHERE platform = ? ORDER BY id DESC').all(platform);
    const stats = getAccountStats();
    res.json({ accounts, stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bot accounts' });
  }
});

router.post('/bot-accounts/import', (req, res) => {
  const { text, platform = 'instagram' } = req.body;
  if (!text) return res.status(400).json({ error: 'Account text input is required' });

  try {
    const result = importAccounts(text, platform);
    res.json({
      success: true,
      message: `Imported ${result.added} accounts (${result.skipped} skipped)`,
      result
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import accounts' });
  }
});

router.post('/bot-accounts', (req, res) => {
  const { username, session_id, password, proxy, platform = 'instagram', ds_user_id, csrftoken } = req.body;
  if (!username || !session_id) {
    return res.status(400).json({ error: 'Username and Session ID are required' });
  }

  try {
    const resId = db.prepare(`
      INSERT OR REPLACE INTO bot_accounts 
      (platform, username, password, session_id, csrftoken, ds_user_id, proxy, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(platform, username.trim(), password || '', session_id.trim(), csrftoken || '', ds_user_id || '', proxy || '');

    res.json({ success: true, message: `Account @${username} added to farm`, id: resId.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add bot account' });
  }
});

router.post('/bot-accounts/:id/test', async (req, res) => {
  const account = db.prepare('SELECT * FROM bot_accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const result = await testAccountSession(account);
  if (result.valid) {
    db.prepare("UPDATE bot_accounts SET status = 'active', notes = NULL WHERE id = ?").run(account.id);
  } else {
    db.prepare("UPDATE bot_accounts SET status = 'challenge', notes = ? WHERE id = ?").run(result.error || 'Challenge or expired', account.id);
  }

  res.json(result);
});

router.delete('/bot-accounts/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM bot_accounts WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Account removed from farm' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
