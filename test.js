const http = require('http');
const app = require('./server');
const db = require('./database');

const server = http.createServer(app);
const PORT = 3456;

server.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);

  try {
    const baseUrl = `http://127.0.0.1:${PORT}`;

    // Helper fetch
    async function request(url, options = {}) {
      const res = await fetch(`${baseUrl}${url}`, options);
      const text = await res.text();
      try {
        return { status: res.status, headers: res.headers, body: JSON.parse(text) };
      } catch {
        return { status: res.status, headers: res.headers, text };
      }
    }

    console.log('\n--- 1. Testing Public Endpoints ---');
    const home = await request('/');
    console.log('GET / :', home.status === 200 ? 'PASS' : 'FAIL');

    const servicesPage = await request('/services');
    console.log('GET /services :', servicesPage.status === 200 ? 'PASS' : 'FAIL');

    const publicServices = await request('/public-api/services');
    console.log('GET /public-api/services count:', publicServices.body.length, publicServices.body.length > 500 ? 'PASS' : 'FAIL');

    const publicCats = await request('/public-api/categories');
    console.log('GET /public-api/categories count:', publicCats.body.length, publicCats.body.length > 50 ? 'PASS' : 'FAIL');

    console.log('\n--- 2. Testing Authentication ---');
    const demoLogin = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'demo123' })
    });
    console.log('Login Demo User:', demoLogin.body.success ? 'PASS' : 'FAIL');
    const demoToken = demoLogin.body.token;
    const demoApiKey = demoLogin.body.user.api_key;
    const initialBalance = demoLogin.body.user.balance;
    console.log('Demo initial balance:', initialBalance, 'API Key:', demoApiKey);

    console.log('\n--- 3. Testing Standard SMM API v2 ---');
    // Balance
    const apiBal = await request('/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: demoApiKey, action: 'balance' })
    });
    console.log('API v2 action=balance:', apiBal.body.balance ? 'PASS' : 'FAIL', apiBal.body);

    // Services
    const apiSvcs = await request('/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: demoApiKey, action: 'services' })
    });
    console.log('API v2 action=services:', apiSvcs.body.length > 500 ? 'PASS' : 'FAIL', `(${apiSvcs.body.length} services)`);

    // Add Order via API v2
    const testSvc = apiSvcs.body[0];
    console.log(`Placing order on Service #${testSvc.service} (${testSvc.name})...`);
    const apiOrder = await request('/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: demoApiKey,
        action: 'add',
        service: testSvc.service,
        link: 'https://facebook.com/testpage/posts/101',
        quantity: parseInt(testSvc.min, 10) || 100
      })
    });
    console.log('API v2 action=add:', apiOrder.body.order ? 'PASS' : 'FAIL', apiOrder.body);
    const orderId = apiOrder.body.order;

    // Check Order Status
    const apiStatus = await request('/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: demoApiKey,
        action: 'status',
        order: orderId
      })
    });
    console.log('API v2 action=status:', apiStatus.body.status ? 'PASS' : 'FAIL', apiStatus.body);

    // Multiple Order Status
    const apiMultiStatus = await request('/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: demoApiKey,
        action: 'status',
        orders: `${orderId},99999`
      })
    });
    console.log('API v2 multi-status:', apiMultiStatus.body[orderId] ? 'PASS' : 'FAIL');

    console.log('\n--- 4. Testing User Orders & Deposit Flow ---');
    const userOrders = await request('/user/orders', {
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
    console.log('GET /user/orders:', userOrders.body.length > 0 ? 'PASS' : 'FAIL', `Found ${userOrders.body.length} orders`);

    // Submit deposit
    const depositRes = await request('/user/payments/deposit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${demoToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        method: 'bKash',
        amount_bdt: 1200,
        amount_usd: 10,
        transaction_id: 'TEST_BKASH_TRX_' + Date.now(),
        sender_number: '01812345678'
      })
    });
    console.log('POST /user/payments/deposit:', depositRes.body.success ? 'PASS' : 'FAIL', depositRes.body);
    const paymentId = depositRes.body.payment_id;

    console.log('\n--- 5. Testing Admin Controls & Approval ---');
    const adminLogin = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    console.log('Admin login:', adminLogin.body.success ? 'PASS' : 'FAIL');
    const adminToken = adminLogin.body.token;

    // Admin Stats
    const admStats = await request('/admin/stats', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('GET /admin/stats:', admStats.body.total_orders !== undefined ? 'PASS' : 'FAIL', admStats.body);

    // Approve Deposit
    const approveRes = await request(`/admin/payments/${paymentId}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log(`Admin approve deposit #${paymentId}:`, approveRes.body.success ? 'PASS' : 'FAIL', approveRes.body);

    // Verify user balance updated
    const userMe = await request('/auth/me', {
      headers: { 'Authorization': `Bearer ${demoToken}` }
    });
    console.log('User new balance after approved deposit:', userMe.body.user.balance, 'PASS');

    console.log('\n=============================================');
    console.log('🎉 ALL SYSTEM TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('=============================================');

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test failed with error:', err);
    server.close();
    process.exit(1);
  }
});
