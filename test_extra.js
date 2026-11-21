const http = require('http');
const app = require('./server');

const server = http.createServer(app);
const PORT = 3458;

server.listen(PORT, async () => {
  try {
    const baseUrl = `http://127.0.0.1:${PORT}`;
    async function request(url, options = {}) {
      const res = await fetch(`${baseUrl}${url}`, options);
      const text = await res.text();
      try {
        return { status: res.status, body: JSON.parse(text) };
      } catch {
        return { status: res.status, text };
      }
    }

    console.log('--- Testing Tickets & Mass Order ---');
    // Login demo
    const demo = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'demo123' })
    });
    const token = demo.body.token;

    // Login admin
    const admin = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const adminToken = admin.body.token;

    // Open Ticket
    const ticketRes = await request('/user/tickets', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Speed Inquiry', message: 'Hello, when will Facebook post likes start?' })
    });
    console.log('Create Ticket:', ticketRes.body.success ? 'PASS' : 'FAIL', ticketRes.body);
    const ticketId = ticketRes.body.ticket_id;

    // Admin replies to Ticket
    const adminReply = await request(`/admin/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Likes begin instantly within 1 to 5 minutes!' })
    });
    console.log('Admin Reply to Ticket:', adminReply.body.success ? 'PASS' : 'FAIL');

    // User views Ticket thread
    const thread = await request(`/user/tickets/${ticketId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Ticket Thread message count:', thread.body.messages.length === 2 ? 'PASS' : 'FAIL');

    // Test Mass Order
    const massRes = await request('/user/orders/mass', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mass_data: '332|https://facebook.com/post/1|100\n332|https://facebook.com/post/2|150'
      })
    });
    console.log('Mass Order:', massRes.body.success ? 'PASS' : 'FAIL', `Created ${massRes.body.results.filter(r => r.success).length} orders`);

    console.log('\n✅ Extra tests completed successfully!');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Extra test failed:', err);
    server.close();
    process.exit(1);
  }
});
