/**
 * Production Multi-Provider Integration & Automated Failover Engine
 * Dispatches orders across upstream providers with automatic priority failover and balance syncing.
 */

const db = require('./database');

function cleanUrl(url) {
  if (!url) return '';
  let cleaned = url.trim();
  // Strip accidental trailing parentheses, brackets, quotes or slashes
  cleaned = cleaned.replace(/[)\]"'>]+$/, '').replace(/^[([<"']/, '').trim();
  return cleaned;
}

async function callProviderApi(apiUrl, data) {
  try {
    const url = cleanUrl(apiUrl);
    const params = new URLSearchParams(data);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: params.toString()
    });

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      console.error(`Provider API returned non-JSON from ${url}:`, text.substring(0, 200));
      return { error: `Invalid response from provider (HTTP ${response.status})` };
    }
  } catch (err) {
    console.error(`Provider API call failed for ${apiUrl}:`, err.message);
    return { error: `Failed to communicate with provider: ${err.message}` };
  }
}

/**
 * Forward order with automatic multi-provider failover
 * If the primary provider fails (e.g. out of funds or offline), automatically retries with secondary providers.
 * @param {number} orderId 
 * @param {number} serviceId 
 * @param {string} link 
 * @param {number} quantity 
 * @param {number} [preferredProviderId=null]
 * @returns {Promise<number|null>} - Returns upstream order ID if any provider succeeded
 */
async function forwardOrderWithFailover(orderId, serviceId, link, quantity, preferredProviderId = null) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;

  // Retrieve active providers ordered by priority (1 = Highest Priority)
  const providers = db.prepare(`
    SELECT * FROM providers 
    WHERE status = 'active' AND length(api_key) > 5
    ORDER BY priority ASC, id ASC
  `).all();

  if (providers.length === 0) {
    console.warn(`[Failover] Order #${orderId} cannot be fulfilled: No active providers with valid API keys`);
    return null;
  }

  // If a preferred provider was requested, prioritize it first
  let targetQueue = [...providers];
  if (preferredProviderId) {
    const preferred = providers.find(p => p.id === preferredProviderId);
    if (preferred) {
      targetQueue = [preferred, ...providers.filter(p => p.id !== preferredProviderId)];
    }
  }

  let lastError = 'No response';
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);

  for (const provider of targetQueue) {
    const provSvcId = (service && service.provider_service_id) ? service.provider_service_id : serviceId;

    console.log(`[Failover] Attempting dispatch for Order #${orderId} via Provider #${provider.id} (${provider.name})...`);

    const result = await callProviderApi(provider.api_url, {
      key: provider.api_key.trim(),
      action: 'add',
      service: provSvcId,
      link: link.trim(),
      quantity: quantity
    });

    if (result && result.order) {
      db.prepare(`
        UPDATE orders 
        SET provider_id = ?, provider_order_id = ?, status = 'In progress', error_message = NULL, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(provider.id, result.order, orderId);

      console.log(`[Failover] ✅ Order #${orderId} successfully accepted by Provider #${provider.id} (${provider.name}) -> Upstream Order #${result.order}`);
      return result.order;
    } else {
      lastError = (result && result.error) ? result.error : 'Rejected or connection error';
      console.warn(`[Failover] ⚠️ Provider #${provider.id} (${provider.name}) failed: ${lastError}. Trying next available provider...`);
    }
  }

  // If all providers in the queue failed, cancel order and refund user
  console.error(`[Failover] ❌ All ${targetQueue.length} providers failed for Order #${orderId}. Last error: ${lastError}`);

  if (order.status !== 'Canceled') {
    const cancelTx = db.transaction(() => {
      db.prepare(`
        UPDATE orders 
        SET status = 'Canceled', error_message = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(`All providers failed: ${lastError}`, orderId);

      db.prepare(`
        UPDATE users 
        SET balance = balance + ?, spent = spent - ? 
        WHERE id = ?
      `).run(order.charge, order.charge, order.user_id);
    });
    cancelTx();
    console.log(`[Failover] Order #${orderId} canceled and $${order.charge.toFixed(4)} refunded to user #${order.user_id}`);
  }

  return null;
}

/**
 * Standard single provider forward (delegates to failover engine)
 */
async function forwardOrder(orderId, providerId, providerServiceId, link, quantity) {
  const service = db.prepare('SELECT service_id FROM orders WHERE id = ?').get(orderId);
  const svcId = service ? service.service_id : providerServiceId;
  return forwardOrderWithFailover(orderId, svcId, link, quantity, providerId);
}

/**
 * Sync order status from upstream provider
 */
async function syncOrderStatus(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || !order.provider_id || !order.provider_order_id) return null;

  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(order.provider_id);
  if (!provider) return null;

  const result = await callProviderApi(provider.api_url, {
    key: provider.api_key.trim(),
    action: 'status',
    order: order.provider_order_id
  });

  if (result && !result.error && result.status) {
    let newStatus = result.status;
    const lower = newStatus.toLowerCase();
    if (lower === 'in progress') newStatus = 'In progress';
    else if (lower === 'completed') newStatus = 'Completed';
    else if (lower === 'pending') newStatus = 'Pending';
    else if (lower === 'processing') newStatus = 'Processing';
    else if (lower === 'partial') newStatus = 'Partial';
    else if (lower === 'canceled') newStatus = 'Canceled';

    const startCount = parseInt(result.start_count, 10);
    const remains = parseInt(result.remains, 10);

    db.prepare(`
      UPDATE orders 
      SET status = ?, 
          start_count = CASE WHEN ? IS NOT NULL AND ? >= 0 THEN ? ELSE start_count END,
          remains = CASE WHEN ? IS NOT NULL AND ? >= 0 THEN ? ELSE remains END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      newStatus,
      isNaN(startCount) ? null : startCount,
      isNaN(startCount) ? null : startCount,
      isNaN(startCount) ? null : startCount,
      isNaN(remains) ? null : remains,
      isNaN(remains) ? null : remains,
      isNaN(remains) ? null : remains,
      orderId
    );

    // If upstream canceled, refund user
    if (newStatus === 'Canceled' && order.status !== 'Canceled') {
      db.prepare('UPDATE users SET balance = balance + ?, spent = spent - ? WHERE id = ?')
        .run(order.charge, order.charge, order.user_id);
      console.log(`[Provider] Upstream canceled order #${orderId}, $${order.charge.toFixed(4)} refunded.`);
    }

    return result;
  }
  return null;
}

module.exports = {
  cleanUrl,
  callProviderApi,
  forwardOrder,
  forwardOrderWithFailover,
  syncOrderStatus
};
