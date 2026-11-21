const express = require('express');
const router = express.Router();
const db = require('../database');
const { forwardOrder } = require('../providerService');

router.post('/', async (req, res) => {
  const { key, action } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'apiKey is not specified. action is not specified.' });
  }

  const user = db.prepare("SELECT * FROM users WHERE api_key = ? AND status = 'active'").get(key);
  if (!user) {
    return res.status(400).json({ error: 'incorrect API key or user disabled' });
  }

  if (!action) {
    return res.status(400).json({ error: 'action is not specified' });
  }

  switch (action) {
    case 'services': {
      try {
        const services = db.prepare(`
          SELECT id as service, name, type, category_name as category, 
                 rate, min, max, refill, cancel
          FROM services 
          WHERE status = 'active'
          ORDER BY category_name, id
        `).all();

        const formatted = services.map(s => ({
          service: s.service,
          name: s.name,
          type: s.type || 'Default',
          category: s.category,
          rate: (s.rate || 0).toFixed(4),
          min: String(s.min),
          max: String(s.max),
          refill: Boolean(s.refill),
          cancel: Boolean(s.cancel)
        }));

        return res.json(formatted);
      } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve services' });
      }
    }

    case 'add': {
      const { service: serviceId, link, quantity } = req.body;

      if (!serviceId || !link || !quantity) {
        return res.status(400).json({ error: 'Missing required parameters: service, link, quantity' });
      }

      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }

      const s = db.prepare("SELECT * FROM services WHERE id = ? AND status = 'active'").get(serviceId);
      if (!s) {
        return res.status(400).json({ error: 'Service not found or inactive' });
      }

      if (qty < s.min) {
        return res.status(400).json({ error: `Quantity must be at least ${s.min}` });
      }
      if (qty > s.max) {
        return res.status(400).json({ error: `Quantity cannot exceed ${s.max}` });
      }

      const charge = parseFloat(((s.rate / 1000) * qty).toFixed(6));

      if (user.balance < charge) {
        return res.status(400).json({ error: 'Not enough funds on balance' });
      }

      // Execute order transaction
      const placeTx = db.transaction(() => {
        db.prepare('UPDATE users SET balance = balance - ?, spent = spent + ? WHERE id = ?')
          .run(charge, charge, user.id);

        const orderResult = db.prepare(`
          INSERT INTO orders 
          (user_id, service_id, service_name, category_name, link, quantity, charge, remains, status, provider_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
        `).run(user.id, s.id, s.name, s.category_name, link.trim(), qty, charge, qty, s.provider_id);

        return orderResult.lastInsertRowid;
      });

      const orderId = placeTx();

      // If tied to an upstream provider, forward asynchronously
      if (s.provider_id && s.provider_service_id) {
        forwardOrder(orderId, s.provider_id, s.provider_service_id, link.trim(), qty).catch(err => {
          console.error('Async forward order error:', err);
        });
      }

      return res.json({ order: orderId });
    }

    case 'status': {
      const { order, orders } = req.body;

      // Multiple orders status
      if (orders) {
        const orderIds = String(orders).split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        if (orderIds.length === 0) {
          return res.status(400).json({ error: 'Incorrect request: valid orders list required' });
        }

        const placeholders = orderIds.map(() => '?').join(',');
        const rows = db.prepare(`
          SELECT id, charge, start_count, status, remains 
          FROM orders 
          WHERE user_id = ? AND id IN (${placeholders})
        `).all(user.id, ...orderIds);

        const result = {};
        for (const r of rows) {
          result[r.id] = {
            charge: r.charge.toFixed(4),
            start_count: String(r.start_count),
            status: r.status,
            remains: String(r.remains),
            currency: 'USD'
          };
        }

        // Fill in missing orders as error
        for (const id of orderIds) {
          if (!result[id]) {
            result[id] = { error: 'Incorrect order ID' };
          }
        }

        return res.json(result);
      }

      // Single order status
      if (!order) {
        return res.status(400).json({ error: 'Missing parameter: order' });
      }

      const ord = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(order, user.id);
      if (!ord) {
        return res.status(400).json({ error: 'Incorrect order ID' });
      }

      return res.json({
        charge: ord.charge.toFixed(4),
        start_count: String(ord.start_count),
        status: ord.status,
        remains: String(ord.remains),
        currency: 'USD'
      });
    }

    case 'refill': {
      const { order } = req.body;
      if (!order) return res.status(400).json({ error: 'Missing parameter: order' });

      const ord = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(order, user.id);
      if (!ord) return res.status(400).json({ error: 'Incorrect order ID' });

      db.prepare("UPDATE orders SET refill_status = 'Requested' WHERE id = ?").run(order);
      return res.json({ refill: ord.id });
    }

    case 'refill_status': {
      const { refill } = req.body;
      if (!refill) return res.status(400).json({ error: 'Missing parameter: refill' });

      const ord = db.prepare('SELECT refill_status FROM orders WHERE id = ? AND user_id = ?').get(refill, user.id);
      if (!ord) return res.status(400).json({ error: 'Incorrect refill ID' });

      return res.json({ status: ord.refill_status });
    }

    case 'balance': {
      return res.json({
        balance: user.balance.toFixed(4),
        currency: 'USD'
      });
    }

    default:
      return res.status(400).json({ error: 'Incorrect request' });
  }
});

module.exports = router;
