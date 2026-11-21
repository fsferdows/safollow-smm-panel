/**
 * SAFollow SMM Panel API — Official Node.js SDK
 * Ultra-fast social media marketing client for SAFollow and SMM API v2 panels.
 * Zero external dependencies (uses native fetch).
 */

class SafollowClient {
  /**
   * @param {string} apiKey - Your secret SAFollow API Key
   * @param {string} [apiUrl='http://localhost:3001/api/v2'] - Endpoint URL
   */
  constructor(apiKey, apiUrl = 'http://localhost:3001/api/v2') {
    if (!apiKey) throw new Error('SAFollow API Key is required');
    this.apiKey = apiKey.trim();
    this.apiUrl = apiUrl.replace(/\/+$/, '');
  }

  /**
   * Internal request handler
   */
  async _request(action, params = {}) {
    const body = new URLSearchParams({
      key: this.apiKey,
      action,
      ...params
    });

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SAFollow-NodeSDK/1.0.0'
      },
      body: body.toString()
    });

    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (data && data.error) {
        throw new Error(`[SAFollow API Error] ${data.error}`);
      }
      return data;
    } catch (err) {
      if (err.message.startsWith('[SAFollow API Error]')) throw err;
      throw new Error(`Failed to parse response from ${this.apiUrl}: ${text.substring(0, 150)}`);
    }
  }

  /**
   * Get user balance and currency
   * @returns {Promise<{ balance: string, currency: string }>}
   */
  async getBalance() {
    return this._request('balance');
  }

  /**
   * Fetch all active services
   * @returns {Promise<Array<{ service: number, name: string, type: string, category: string, rate: string, min: string, max: string, refill: boolean, cancel: boolean }>>}
   */
  async getServices() {
    return this._request('services');
  }

  /**
   * Create a new social media order
   * @param {Object} options
   * @param {number|string} options.service - Service ID
   * @param {string} options.link - Target URL (profile, post, channel)
   * @param {number|string} options.quantity - Order quantity
   * @param {number} [options.runs] - Drip-feed runs count
   * @param {number} [options.interval] - Drip-feed interval in minutes
   * @returns {Promise<{ order: number }>}
   */
  async createOrder({ service, link, quantity, runs, interval }) {
    if (!service) throw new Error('service parameter is required');
    if (!link) throw new Error('link parameter is required');
    if (!quantity) throw new Error('quantity parameter is required');

    const params = {
      service: String(service),
      link: String(link).trim(),
      quantity: String(quantity)
    };

    if (runs) params.runs = String(runs);
    if (interval) params.interval = String(interval);

    return this._request('add', params);
  }

  /**
   * Get single order status
   * @param {number|string} orderId
   * @returns {Promise<{ charge: string, start_count: number, status: string, remains: number, currency: string }>}
   */
  async getStatus(orderId) {
    if (!orderId) throw new Error('orderId is required');
    return this._request('status', { order: String(orderId) });
  }

  /**
   * Get multiple order statuses in a single call
   * @param {Array<number|string>} orderIds - Array of order IDs (up to 100)
   * @returns {Promise<Record<string, { charge: string, start_count: number, status: string, remains: number, currency: string }>>}
   */
  async getMultipleStatuses(orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new Error('orderIds must be a non-empty array');
    }
    return this._request('status', { orders: orderIds.join(',') });
  }

  /**
   * Request refill top-up for an order
   * @param {number|string} orderId
   * @returns {Promise<{ refill: number }>}
   */
  async requestRefill(orderId) {
    if (!orderId) throw new Error('orderId is required');
    return this._request('refill', { order: String(orderId) });
  }

  /**
   * Check refill request status
   * @param {number|string} refillId
   * @returns {Promise<{ status: string }>}
   */
  async getRefillStatus(refillId) {
    if (!refillId) throw new Error('refillId is required');
    return this._request('refill_status', { refill: String(refillId) });
  }
}

module.exports = SafollowClient;
module.exports.SafollowClient = SafollowClient;
module.exports.default = SafollowClient;
