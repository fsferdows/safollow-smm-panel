const db = require('./database');
const { syncOrderStatus } = require('./providerService');

let isRunning = false;

async function processOrders() {
  if (isRunning) return;
  isRunning = true;

  try {
    // 1. Process active orders
    const activeOrders = db.prepare(`
      SELECT * FROM orders 
      WHERE status IN ('Pending', 'Processing', 'In progress')
      ORDER BY id ASC
    `).all();

    for (const order of activeOrders) {
      // If linked to an upstream provider, poll provider status
      if (order.provider_id && order.provider_order_id) {
        try {
          await syncOrderStatus(order.id);
        } catch (e) {
          console.error(`Sync provider error for order #${order.id}:`, e);
        }
        continue;
      }

      // Standalone / Local Automated Fulfillment
      const now = Date.now();
      const createdAt = new Date(order.created_at).getTime();
      const ageSeconds = (now - createdAt) / 1000;

      if (order.status === 'Pending') {
        // Move to 'In progress' after 5 seconds
        if (ageSeconds >= 5) {
          const fakeStart = Math.floor(Math.random() * 2500) + 100;
          db.prepare(`
            UPDATE orders 
            SET status = 'In progress', start_count = ?, remains = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(fakeStart, order.quantity, order.id);
          console.log(`[OrderWorker] Order #${order.id} started -> In progress (Start Count: ${fakeStart})`);
        }
      } else if (order.status === 'In progress') {
        // Incrementally deliver 25% to 50% of total quantity per 5s cycle
        const deliveryBatch = Math.max(10, Math.ceil(order.quantity * (0.25 + Math.random() * 0.25)));
        const newRemains = Math.max(0, order.remains - deliveryBatch);

        if (newRemains === 0) {
          db.prepare(`
            UPDATE orders 
            SET status = 'Completed', remains = 0, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(order.id);
          console.log(`[OrderWorker] Order #${order.id} fulfilled -> Completed!`);
        } else {
          db.prepare(`
            UPDATE orders 
            SET remains = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(newRemains, order.id);
          console.log(`[OrderWorker] Order #${order.id} delivering... remains: ${newRemains}`);
        }
      }
    }

    // 2. Process Refill requests
    const refillOrders = db.prepare(`
      SELECT id, refill_status FROM orders WHERE refill_status IN ('Requested', 'Refilling')
    `).all();

    for (const ord of refillOrders) {
      if (ord.refill_status === 'Requested') {
        db.prepare("UPDATE orders SET refill_status = 'Refilling' WHERE id = ?").run(ord.id);
        console.log(`[OrderWorker] Refill #${ord.id} accepted -> Refilling`);
      } else if (ord.refill_status === 'Refilling') {
        db.prepare("UPDATE orders SET refill_status = 'Completed' WHERE id = ?").run(ord.id);
        console.log(`[OrderWorker] Refill #${ord.id} top-up -> Completed`);
      }
    }

  } catch (err) {
    console.error('OrderWorker loop error:', err);
  } finally {
    isRunning = false;
  }
}

// Start Background Worker (runs every 5 seconds)
function startOrderWorker() {
  console.log('⚡ Order Fulfillment Engine started (5s cycle)');
  setInterval(processOrders, 5000);
}

module.exports = {
  processOrders,
  startOrderWorker
};
