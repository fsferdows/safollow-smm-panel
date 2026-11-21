const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('./auth');
const { forwardOrder } = require('../providerService');

// All routes here require authentication
router.use(authenticateToken);

// User stats summary
router.get('/stats', (req, res) => {
  try {
    const user = db.prepare('SELECT balance, spent FROM users WHERE id = ?').get(req.user.id);
    const orderStats = db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'Processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'In progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'Partial' THEN 1 ELSE 0 END) as partial,
        SUM(CASE WHEN status = 'Canceled' THEN 1 ELSE 0 END) as canceled
      FROM orders WHERE user_id = ?
    `).get(req.user.id);

    const bdtRateSetting = db.prepare("SELECT value FROM settings WHERE key = 'bdt_rate'").get();
    const bdtRate = parseFloat(bdtRateSetting ? bdtRateSetting.value : '120.0');

    res.json({
      balance: user.balance,
      balance_bdt: (user.balance * bdtRate).toFixed(2),
      spent: user.spent,
      spent_bdt: (user.spent * bdtRate).toFixed(2),
      bdt_rate: bdtRate,
      orders: orderStats
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// Categories list
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT DISTINCT c.id, c.name, c.icon, COUNT(s.id) as service_count
      FROM categories c
      JOIN services s ON s.category_name = c.name
      WHERE s.status = 'active'
      GROUP BY c.id, c.name
      ORDER BY c.sort_order, c.name
    `).all();

    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Services list
router.get('/services', (req, res) => {
  try {
    const { category, search } = req.query;
    let query = "SELECT * FROM services WHERE status = 'active'";
    const params = [];

    if (category) {
      query += ' AND category_name = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR id LIKE ? OR desc LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY category_name, id';
    const services = db.prepare(query).all(...params);

    const bdtRateSetting = db.prepare("SELECT value FROM settings WHERE key = 'bdt_rate'").get();
    const bdtRate = parseFloat(bdtRateSetting ? bdtRateSetting.value : '120.0');

    const formatted = services.map(s => ({
      ...s,
      rate_bdt: (s.rate * bdtRate).toFixed(3)
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Place New Order
router.post('/orders/new', (req, res) => {
  const { service_id, link, quantity } = req.body;

  if (!service_id || !link || !quantity) {
    return res.status(400).json({ error: 'Service ID, link, and quantity are required' });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const s = db.prepare("SELECT * FROM services WHERE id = ? AND status = 'active'").get(service_id);

  if (!s) return res.status(404).json({ error: 'Service not found or inactive' });
  if (qty < s.min) return res.status(400).json({ error: `Quantity must be at least ${s.min}` });
  if (qty > s.max) return res.status(400).json({ error: `Quantity cannot exceed ${s.max}` });

  const charge = parseFloat(((s.rate / 1000) * qty).toFixed(6));
  if (user.balance < charge) {
    return res.status(400).json({ error: `Insufficient balance ($${user.balance.toFixed(4)} available, $${charge.toFixed(4)} needed)` });
  }

  try {
    let assignedProviderId = s.provider_id;
    let assignedProvSvcId = s.provider_service_id || s.id;

    if (!assignedProviderId) {
      const defProv = db.prepare("SELECT id FROM providers WHERE status = 'active' AND length(api_key) > 5 ORDER BY id ASC LIMIT 1").get();
      if (defProv) assignedProviderId = defProv.id;
    }

    const placeTx = db.transaction(() => {
      db.prepare('UPDATE users SET balance = balance - ?, spent = spent + ? WHERE id = ?')
        .run(charge, charge, user.id);

      const res = db.prepare(`
        INSERT INTO orders 
        (user_id, service_id, service_name, category_name, link, quantity, charge, remains, status, provider_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
      `).run(user.id, s.id, s.name, s.category_name, link.trim(), qty, charge, qty, assignedProviderId);

      return res.lastInsertRowid;
    });

    const orderId = placeTx();

    // Async forward if linked to provider
    if (assignedProviderId) {
      forwardOrder(orderId, assignedProviderId, assignedProvSvcId, link.trim(), qty).catch(err => {
        console.error('Async provider forward error:', err);
      });
    }

    res.json({
      success: true,
      message: 'Order placed successfully',
      order_id: orderId,
      charge: charge.toFixed(4),
      remaining_balance: (user.balance - charge).toFixed(4)
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// Mass Order
router.post('/orders/mass', (req, res) => {
  const { mass_data } = req.body;
  if (!mass_data || typeof mass_data !== 'string') {
    return res.status(400).json({ error: 'Mass data input is required' });
  }

  const lines = mass_data.trim().split('\n');
  const results = [];
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3) {
      results.push({ line, error: 'Invalid format. Use service_id|link|quantity' });
      continue;
    }

    const [sidStr, link, qtyStr] = parts;
    const serviceId = parseInt(sidStr, 10);
    const qty = parseInt(qtyStr, 10);

    if (isNaN(serviceId) || !link || isNaN(qty) || qty <= 0) {
      results.push({ line, error: 'Invalid service ID or quantity' });
      continue;
    }

    const s = db.prepare("SELECT * FROM services WHERE id = ? AND status = 'active'").get(serviceId);
    if (!s) {
      results.push({ line, error: 'Service not found or inactive' });
      continue;
    }

    if (qty < s.min || qty > s.max) {
      results.push({ line, error: `Quantity must be between ${s.min} and ${s.max}` });
      continue;
    }

    const charge = parseFloat(((s.rate / 1000) * qty).toFixed(6));
    if (user.balance < charge) {
      results.push({ line, error: 'Insufficient funds for this order' });
      continue;
    }

    try {
      const placeTx = db.transaction(() => {
        db.prepare('UPDATE users SET balance = balance - ?, spent = spent + ? WHERE id = ?')
          .run(charge, charge, user.id);

        const res = db.prepare(`
          INSERT INTO orders 
          (user_id, service_id, service_name, category_name, link, quantity, charge, remains, status, provider_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
        `).run(user.id, s.id, s.name, s.category_name, link, qty, charge, qty, s.provider_id);

        return res.lastInsertRowid;
      });

      const orderId = placeTx();
      user.balance -= charge;

      if (s.provider_id && s.provider_service_id) {
        forwardOrder(orderId, s.provider_id, s.provider_service_id, link, qty).catch(console.error);
      }

      results.push({ line, success: true, order_id: orderId, charge });
    } catch (e) {
      results.push({ line, error: e.message });
    }
  }

  res.json({ success: true, results, updated_balance: user.balance.toFixed(4) });
});

// Order History
router.get('/orders', (req, res) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT o.*, p.name as provider_name 
      FROM orders o 
      LEFT JOIN providers p ON p.id = o.provider_id 
      WHERE o.user_id = ?
    `;
    const params = [req.user.id];

    if (status && status !== 'all') {
      query += ' AND LOWER(o.status) = LOWER(?)';
      params.push(status);
    }

    if (search) {
      query += ' AND (o.id LIKE ? OR o.service_name LIKE ? OR o.link LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const orders = db.prepare(query).all(...params);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Request Refill
router.post('/orders/:id/refill', (req, res) => {
  const orderId = req.params.id;
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, req.user.id);

  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'Completed' && order.status !== 'Partial') {
    return res.status(400).json({ error: 'Refill can only be requested for Completed or Partial orders' });
  }

  db.prepare("UPDATE orders SET refill_status = 'Requested' WHERE id = ?").run(orderId);
  res.json({ success: true, message: 'Refill request submitted successfully' });
});

// Submit Deposit (bKash / Nagad / Rocket / Binance)
router.post('/payments/deposit', (req, res) => {
  const { method, amount_bdt, amount_usd, transaction_id, sender_number, notes } = req.body;

  if (!method || !transaction_id) {
    return res.status(400).json({ error: 'Payment method and Transaction ID are required' });
  }

  const bdtRateSetting = db.prepare("SELECT value FROM settings WHERE key = 'bdt_rate'").get();
  const bdtRate = parseFloat(bdtRateSetting ? bdtRateSetting.value : '120.0');

  let usd = parseFloat(amount_usd);
  let bdt = parseFloat(amount_bdt);

  if (isNaN(usd) && !isNaN(bdt)) {
    usd = bdt / bdtRate;
  } else if (!isNaN(usd) && isNaN(bdt)) {
    bdt = usd * bdtRate;
  }

  if (isNaN(usd) || usd <= 0) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  try {
    const existing = db.prepare('SELECT id FROM payments WHERE transaction_id = ?').get(transaction_id.trim());
    if (existing) {
      return res.status(400).json({ error: 'This Transaction ID has already been submitted' });
    }

    const result = db.prepare(`
      INSERT INTO payments 
      (user_id, method, amount_usd, amount_bdt, transaction_id, sender_number, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      req.user.id,
      method,
      parseFloat(usd.toFixed(4)),
      parseFloat(bdt.toFixed(2)),
      transaction_id.trim(),
      sender_number ? sender_number.trim() : '',
      notes ? notes.trim() : ''
    );

    res.json({
      success: true,
      message: 'Deposit submitted successfully! Admin will verify and credit your balance shortly.',
      payment_id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Deposit submission error:', err);
    res.status(500).json({ error: 'Failed to submit deposit' });
  }
});

// Payment History
router.get('/payments', (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 50
    `).all(req.user.id);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Support Tickets List
router.get('/tickets', (req, res) => {
  try {
    const tickets = db.prepare(`
      SELECT * FROM tickets WHERE user_id = ? ORDER BY updated_at DESC
    `).all(req.user.id);
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Create Ticket
router.post('/tickets', (req, res) => {
  const { subject, reference_id, message } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  try {
    const ticketTx = db.transaction(() => {
      const tRes = db.prepare(`
        INSERT INTO tickets (user_id, subject, reference_id, status)
        VALUES (?, ?, ?, 'open')
      `).run(req.user.id, subject, reference_id || '');

      db.prepare(`
        INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, message)
        VALUES (?, ?, 'user', ?)
      `).run(tRes.lastInsertRowid, req.user.id, message.trim());

      return tRes.lastInsertRowid;
    });

    const ticketId = ticketTx();
    res.json({ success: true, message: 'Ticket opened successfully', ticket_id: ticketId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// View Ticket Thread
router.get('/tickets/:id', (req, res) => {
  try {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const messages = db.prepare(`
      SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC
    `).all(ticket.id);

    res.json({ ticket, messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ticket messages' });
  }
});

// Reply to Ticket
router.post('/tickets/:id/reply', (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  try {
    db.prepare(`
      INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, message)
      VALUES (?, ?, 'user', ?)
    `).run(ticket.id, req.user.id, message.trim());

    db.prepare("UPDATE tickets SET status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(ticket.id);

    res.json({ success: true, message: 'Reply submitted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit reply' });
  }
});

module.exports = router;
