# SAFollow Official SMM Panel API SDK (v2)

Official multi-language client libraries for **SAFollow** — Bangladesh's premier SMM Panel platform. Provides high-performance, automated integration for social media growth services across Instagram, TikTok, Facebook, YouTube, Telegram, and 1,000+ wholesale services.

Supports **Node.js / TypeScript**, **Python**, and **PHP** with zero external dependencies.

---

## Supported Languages

| Language | Directory | Zero Dependencies | Status |
| :--- | :--- | :--- | :--- |
| **Node.js** | [`sdk/node/`](node/) | Yes (Native Fetch) | Ready |
| **Python** | [`sdk/python/`](python/) | Yes (Standard Library `urllib`) | Ready |
| **PHP** | [`sdk/php/`](php/) | Yes (Native cURL) | Ready |

---

## 🚀 Node.js Quickstart

### 1. Installation / Import
```javascript
const SafollowClient = require('./sdk/node');
const client = new SafollowClient('YOUR_API_KEY', 'http://localhost:3001/api/v2');
```

### 2. Check Balance
```javascript
const balance = await client.getBalance();
console.log(`Balance: $${balance.balance} ${balance.currency}`);
```

### 3. Fetch Services Catalog
```javascript
const services = await client.getServices();
console.log(`Available Services: ${services.length}`);
```

### 4. Create an Order
```javascript
const order = await client.createOrder({
  service: 1925,
  link: 'https://www.instagram.com/fsferdows/',
  quantity: 1000
});
console.log(`Order ID: #${order.order}`);
```

### 5. Check Order Status
```javascript
const status = await client.getStatus(order.order);
console.log(`Status: ${status.status}, Remains: ${status.remains}`);
```

---

## 🐍 Python Quickstart

```python
from safollow_smm import SafollowClient

client = SafollowClient("YOUR_API_KEY", "http://localhost:3001/api/v2")

# Check balance
balance = client.get_balance()
print(f"Balance: ${balance['balance']}")

# Place order
order = client.create_order(service=1925, link="https://www.instagram.com/fsferdows/", quantity=1000)
print(f"Order Created: #{order['order']}")

# Check status
status = client.get_status(order["order"])
print(f"Status: {status['status']}")
```

---

## 🐘 PHP Quickstart

```php
require_once __DIR__ . '/sdk/php/Safollow.php';

use Safollow\SafollowClient;

$client = new SafollowClient('YOUR_API_KEY', 'http://localhost:3001/api/v2');

// Check balance
$balance = $client->getBalance();

// Create order
$order = $client->createOrder(1925, 'https://www.instagram.com/fsferdows/', 1000);

// Check status
$status = $client->getStatus($order['order']);
```

---

## API Action Reference

| Action | HTTP Method | SDK Method | Description |
| :--- | :--- | :--- | :--- |
| `balance` | `POST` | `getBalance()` | Get user balance in USD/BDT |
| `services` | `POST` | `getServices()` | List all active services, rates, min & max |
| `add` | `POST` | `createOrder(...)` | Create a new single or drip-feed order |
| `status` | `POST` | `getStatus(id)` | Query live status, start count & remains |
| `status` | `POST` | `getMultipleStatuses([ids])` | Query batch order statuses (up to 100) |
| `refill` | `POST` | `requestRefill(id)` | Request free warranty refill |
| `refill_status` | `POST` | `getRefillStatus(id)` | Check status of warranty refill |

---

## License
MIT License. Open for resellers, developers, and agency automation.
