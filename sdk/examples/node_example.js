/**
 * SAFollow Official Node.js SDK Example
 * Run: node sdk/examples/node_example.js
 */

const SafollowClient = require('../node/index.js');

// Using Demo API key from our local database
const API_KEY = process.env.SAFOLLOW_API_KEY || 'saf_demo_81ec54680f0f703d451edd38285617b4';
const API_URL = process.env.SAFOLLOW_API_URL || 'http://localhost:3001/api/v2';

async function main() {
  console.log('🚀 Initializing SAFollow Node.js SDK...');
  const client = new SafollowClient(API_KEY, API_URL);

  try {
    // 1. Check Account Balance
    console.log('\n1. Fetching Account Balance:');
    const balance = await client.getBalance();
    console.log(`   Balance: $${balance.balance} ${balance.currency}`);

    // 2. Fetch Services Catalog
    console.log('\n2. Fetching Services Catalog:');
    const services = await client.getServices();
    console.log(`   Total Services Available: ${services.length}`);
    const sample = services.find(s => s.service === 1925) || services[0];
    console.log(`   Sample Service #${sample.service}: "${sample.name}" - Rate: $${sample.rate}/1K`);

    // 3. Create a Social Media Order
    console.log('\n3. Placing an Order for Instagram Followers:');
    const orderRes = await client.createOrder({
      service: 1925,
      link: 'https://www.instagram.com/fsferdows/',
      quantity: 100
    });
    console.log(`   ✅ Order Created Successfully! Order ID: #${orderRes.order}`);

    // 4. Check Order Status
    console.log('\n4. Checking Order Status:');
    const status = await client.getStatus(orderRes.order);
    console.log(`   Status: [${status.status}] | Remains: ${status.remains} | Charge: $${status.charge} ${status.currency}`);

    // 5. Batch Status Check
    console.log('\n5. Batch Status Check:');
    const batch = await client.getMultipleStatuses([orderRes.order, 56]);
    console.log('   Batch Result:', batch);

    console.log('\n✨ All SAFollow SDK calls executed successfully with 0 errors!');
  } catch (err) {
    console.error('❌ SDK Error:', err.message);
  }
}

main();
