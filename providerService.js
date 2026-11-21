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

async function forwardOrder(orderId, providerId, providerServiceId, link, quantity) {
  const provider = db.prepare("SELECT * FROM providers WHERE id = ? AND status = 'active'").get(providerId);
  if (!provider) {
    console.warn(`Provider ${providerId} not found or inactive`);
    return null;
  }

  if (!provider.api_key || provider.api_key.trim().length < 5) {
    const errText = `Provider "${provider.name}" has no valid API key configured.`;
    console.warn(`[Provider] Order #${orderId} aborted: ${errText}`);
    db.prepare("UPDATE orders SET error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(errText, orderId);
    return null;
  }

  const result = await callProviderApi(provider.api_url, {
    key: provider.api_key.trim(),
    action: 'add',
    service: providerServiceId,
    link: link.trim(),
    quantity: quantity
  });

  if (result && result.order) {
    db.prepare(`
      UPDATE orders 
      SET provider_order_id = ?, status = 'In progress', error_message = NULL, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(result.order, orderId);
    console.log(`[Provider] Order #${orderId} forwarded to ${provider.name} (Upstream #${result.order})`);
    return result.order;
  } else {
    const errorMsg = (result && result.error) ? result.error : 'Upstream order rejected or failed';
    console.warn(`[Provider] Upstream order #${orderId} failed:`, errorMsg);

    // Cancel order and refund user balance automatically so funds are never lost
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (order && order.status !== 'Canceled') {
      const cancelTx = db.transaction(() => {
        db.prepare(`
          UPDATE orders 
          SET status = 'Canceled', error_message = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(`Provider rejected: ${errorMsg}`, orderId);

        db.prepare(`
          UPDATE users 
          SET balance = balance + ?, spent = spent - ? 
          WHERE id = ?
        `).run(order.charge, order.charge, order.user_id);
      });
      cancelTx();
      console.log(`[Provider] Order #${orderId} canceled and $${order.charge.toFixed(4)} refunded to user #${order.user_id}`);
    }
    return null;
  }
}

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
  syncOrderStatus
};
