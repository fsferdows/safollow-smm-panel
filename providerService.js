const db = require('./database');

async function callProviderApi(apiUrl, data) {
  try {
    const params = new URLSearchParams(data);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SAFollow-Platform/3.0'
      },
      body: params.toString()
    });
    return await response.json();
  } catch (err) {
    console.error(`Provider API call failed for ${apiUrl}:`, err);
    return { error: 'Failed to communicate with upstream provider' };
  }
}

async function forwardOrder(orderId, providerId, providerServiceId, link, quantity) {
  const provider = db.prepare("SELECT * FROM providers WHERE id = ? AND status = 'active'").get(providerId);
  if (!provider) {
    console.warn(`Provider ${providerId} not found or inactive`);
    return null;
  }

  const result = await callProviderApi(provider.api_url, {
    key: provider.api_key,
    action: 'add',
    service: providerServiceId,
    link: link,
    quantity: quantity
  });

  if (result && result.order) {
    db.prepare("UPDATE orders SET provider_order_id = ?, status = 'In progress' WHERE id = ?")
      .run(result.order, orderId);
    return result.order;
  } else {
    console.warn(`Upstream order failed:`, result);
    return null;
  }
}

async function syncOrderStatus(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || !order.provider_id || !order.provider_order_id) return null;

  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(order.provider_id);
  if (!provider) return null;

  const result = await callProviderApi(provider.api_url, {
    key: provider.api_key,
    action: 'status',
    order: order.provider_order_id
  });

  if (result && !result.error && result.status) {
    db.prepare(`
      UPDATE orders 
      SET status = ?, start_count = ?, remains = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      result.status,
      parseInt(result.start_count) || order.start_count,
      parseInt(result.remains) || order.remains,
      orderId
    );
    return result;
  }
  return null;
}

module.exports = {
  callProviderApi,
  forwardOrder,
  syncOrderStatus
};
