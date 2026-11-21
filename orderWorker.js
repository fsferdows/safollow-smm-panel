const db = require('./database');
const { forwardOrder, syncOrderStatus } = require('./providerService');

let isRunning = false;

async function processOrders() {
  if (isRunning) return;
  isRunning = true;

  try {
    const activeOrders = db.prepare(`
      SELECT * FROM orders 
      WHERE status IN ('Pending', 'Processing', 'In progress')
      ORDER BY id ASC
    `).all();

    // Check fulfillment mode setting ('live' vs 'simulation')
    const modeSetting = db.prepare("SELECT value FROM settings WHERE key = 'fulfillment_mode'").get();
    const fulfillmentMode = modeSetting ? modeSetting.value : 'live';

    // Find any default active provider configured with an API key
    const defaultProvider = db.prepare("SELECT * FROM providers WHERE status = 'active' AND length(api_key) > 5 ORDER BY id ASC LIMIT 1").get();

    for (const order of activeOrders) {
      // 1. Order already linked to provider and has provider_order_id -> Poll live status
      if (order.provider_id && order.provider_order_id) {
        try {
          await syncOrderStatus(order.id);
        } catch (e) {
          console.error(`Sync provider error for order #${order.id}:`, e.message);
        }
        continue;
      }

      // 2. Order has provider_id BUT not yet forwarded (no provider_order_id)
      if (order.provider_id && !order.provider_order_id) {
        try {
          const service = db.prepare('SELECT provider_service_id FROM services WHERE id = ?').get(order.service_id);
          const provSvcId = (service && service.provider_service_id) ? service.provider_service_id : order.service_id;
          await forwardOrder(order.id, order.provider_id, provSvcId, order.link, order.quantity);
        } catch (e) {
          console.error(`Forward provider error for order #${order.id}:`, e.message);
        }
        continue;
      }

      // 3. Order has NO provider_id set:
      // If there IS an active provider configured, automatically attach it and forward!
      if (!order.provider_id && defaultProvider) {
        try {
          const service = db.prepare('SELECT provider_service_id FROM services WHERE id = ?').get(order.service_id);
          const provSvcId = (service && service.provider_service_id) ? service.provider_service_id : order.service_id;
          db.prepare('UPDATE orders SET provider_id = ? WHERE id = ?').run(defaultProvider.id, order.id);
          await forwardOrder(order.id, defaultProvider.id, provSvcId, order.link, order.quantity);
        } catch (e) {
          console.error(`Auto-bind provider error for order #${order.id}:`, e.message);
        }
        continue;
      }

      // 4. No provider exists at all:
      if (fulfillmentMode === 'live') {
        // Do NOT pretend to deliver followers! Keep pending and inform the admin/user
        if (order.status === 'Pending' && !order.error_message) {
          db.prepare("UPDATE orders SET error_message = 'Awaiting Upstream Provider API connection (Admin -> Upstream Providers)' WHERE id = ?")
            .run(order.id);
        }
        continue;
      }

      // 5. Explicit Simulation Mode (Only when admin switches fulfillment_mode to 'simulation')
      const now = Date.now();
      const createdAt = new Date(order.created_at).getTime();
      const ageSeconds = (now - createdAt) / 1000;

      if (order.status === 'Pending') {
        if (ageSeconds >= 5) {
          const fakeStart = Math.floor(Math.random() * 2500) + 100;
          db.prepare(`
            UPDATE orders 
            SET status = 'In progress', start_count = ?, remains = ?, error_message = '[Sandbox Simulation - Connect Provider for Real Delivery]', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(fakeStart, order.quantity, order.id);
          console.log(`[OrderWorker] Order #${order.id} started -> In progress (Simulation)`);
        }
      } else if (order.status === 'In progress') {
        const deliveryBatch = Math.max(10, Math.ceil(order.quantity * (0.25 + Math.random() * 0.25)));
        const newRemains = Math.max(0, order.remains - deliveryBatch);

        if (newRemains === 0) {
          db.prepare(`
            UPDATE orders 
            SET status = 'Completed', remains = 0, error_message = '[Sandbox Simulation - Connect Provider for Real Delivery]', updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(order.id);
          console.log(`[OrderWorker] Order #${order.id} fulfilled -> Completed (Simulation)`);
        } else {
          db.prepare(`
            UPDATE orders 
            SET remains = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(newRemains, order.id);
        }
      }
    }

    // Refill processing
    const refillOrders = db.prepare(`
      SELECT id, refill_status FROM orders WHERE refill_status IN ('Requested', 'Refilling')
    `).all();

    for (const ord of refillOrders) {
      if (ord.refill_status === 'Requested') {
        db.prepare("UPDATE orders SET refill_status = 'Refilling' WHERE id = ?").run(ord.id);
      } else if (ord.refill_status === 'Refilling') {
        db.prepare("UPDATE orders SET refill_status = 'Completed' WHERE id = ?").run(ord.id);
      }
    }
  } catch (err) {
    console.error('OrderWorker loop error:', err.message);
  } finally {
    isRunning = false;
  }
}

function startOrderWorker() {
  console.log('⚡ Order Fulfillment Engine started (5s cycle)');
  setInterval(processOrders, 5000);
}

module.exports = {
  processOrders,
  startOrderWorker
};
