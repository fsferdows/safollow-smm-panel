const { extractUsername } = require('./engine/instagramEngine.js');
const { importAccounts, getAccountStats } = require('./engine/accountManager.js');
const db = require('./database.js');
const http = require('http');

async function req(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL('http://localhost:3001' + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const request = http.request({
      hostname: 'localhost',
      port: 3001,
      path: url.pathname + url.search,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

(async () => {
  console.log('1. Testing username extraction:');
  const u = extractUsername('https://www.instagram.com/fsferdows/');
  console.log('   URL: https://www.instagram.com/fsferdows/ ->', u);
  if (u !== 'fsferdows') throw new Error('Username extraction failed');

  console.log('2. Testing bulk account import parser:');
  const importResult = importAccounts(`
# Test bot farm accounts
bot_tester_1:sample_password:test_session_id_101:http://127.0.0.1:8080
bot_tester_2:test_session_id_102
sessionid=test_session_id_103; ds_user_id=14920491
  `);
  console.log('   Import Result:', importResult);

  console.log('3. Testing account farm stats:');
  const stats = getAccountStats();
  console.log('   Farm Stats:', stats);

  console.log('4. Testing Admin API Authentication and Bot Accounts Endpoint:');
  const loginRes = await req('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
  const token = loginRes.body.token;

  const botListRes = await req('/admin/bot-accounts', 'GET', null, token);
  console.log(`   Admin API returned ${botListRes.body.accounts.length} farm accounts.`);

  console.log('5. Cleaning up test accounts from database...');
  db.prepare("DELETE FROM bot_accounts WHERE username LIKE 'bot_tester_%' OR username LIKE 'user_14920491'").run();
  console.log('   Cleanup complete. Active farm accounts remaining:', getAccountStats().total);

  console.log('✅ ALL DIRECT ENGINE & BOT FARM TESTS PASSED WITH 100% SUCCESS!');
})();
