<div align="center">

# ⚡ SAFollow Enterprise SMM Panel Platform & Universal API Hub

### *High-Performance, Self-Hosted Social Media Marketing (SMM) Reseller Platform & Direct Delivery Engine*

[![GitHub Stars](https://img.shields.io/github/stars/fsferdows/safollow-smm-panel?style=for-the-badge&color=ffd700)](https://github.com/fsferdows/safollow-smm-panel/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/fsferdows/safollow-smm-panel?style=for-the-badge&color=60a5fa)](https://github.com/fsferdows/safollow-smm-panel/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.x%20LTS-green.svg?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg?style=for-the-badge&logo=docker)](https://www.docker.com/)
[![Built with Love in Bangladesh](https://img.shields.io/badge/Made%20in-Bangladesh%20🇧🇩-006a4e?style=for-the-badge)](https://github.com/fsferdows)

**Created & Maintained with passion by [FS Ferdows](https://github.com/fsferdows) / [LateBright](https://github.com/fsferdows)**

[Live Demo](http://localhost:3001) • [API Documentation](#-universal-smm-reseller-api-v2) • [SDKs](#-official-multi-language-sdk-suite) • [Installation](#-quick-start-in-60-seconds) • [Developer Spotlight](#-about-the-developer)

</div>

---

## 📖 Overview

**SAFollow V3.0** is an open-source, full-stack **Social Media Marketing (SMM) Reseller Platform and API Gateway**. Reconstructed using advanced **Reverse Engineering (REA)** principles, it delivers a turnkey solution to run your own wholesale SMM reseller business or private social growth agency.

Whether you want to connect to global wholesale SMM providers (Ezkify, JustAnotherPanel, Peakerr, SAFollow) or deliver orders directly via internal bot pools, this platform is production-ready out of the box.

---

## 🚀 Key Highlights & Architecture

```
                                  ┌────────────────────────────────────────────────────────┐
                                  │           Your Customers & API Clients                 │
                                  │      (Web Dashboard, Child Panels, PHP/Python SDK)     │
                                  └──────────────────────────┬─────────────────────────────┘
                                                             │
                                                             ▼
                                  ┌────────────────────────────────────────────────────────┐
                                  │       ⚡ SAFollow Core Gateway & Universal API v2       │
                                  │           (Node.js + SQLite WAL + Express.js)          │
                                  └──────────┬─────────────────────────────────┬───────────┘
                                             │                                 │
                 ┌───────────────────────────┴──────────┐   ┌──────────────────┴───────────┐
                 │                                      │   │                              │
                 ▼                                      ▼   ▼                              ▼
┌─────────────────────────────────┐   ┌───────────────────────────────────┐  ┌─────────────────────────────────┐
│  🤖 Reverse-Engineered Engine   │   │  🌐 Multi-Provider Failover Router│  │  💳 Native Payment Gateways     │
│  - Instagram Private Web Client │   │  - Auto-Priority Dispatch (1..N)  │  │  - bKash (Personal/Send Money) │
│  - Dynamic Profile Lookup (PK)  │   │  - Wholesale SMM v2 Gateway       │  │  - Nagad & Rocket Instant       │
│  - Friendships Create & Likes   │   │  - Balance Sync & Auto-Refunds    │  │  - Binance Pay / Crypto (USDT)  │
└─────────────────────────────────┘   └───────────────────────────────────┘  └─────────────────────────────────┘
```

### 💎 What's Inside:
* **Universal SMM API v2**: 100% compatible with SmartPanel, PerfectPanel, and RentalPanel child panels (`/api/v2`, `/api/v1`, `/api`).
* **🤖 Reverse-Engineered Private Instagram Client**: Live lookup of internal User IDs (`pk`) and start counts, friendship creation (`/api/v1/friendships/create/`), and media likes (`/api/v1/web/likes/`).
* **🛡️ Smart Multi-Provider Failover**: Routes orders dynamically across priority wholesale APIs with automated retries and auto-refunds.
* **📦 1,034 Pre-Configured Services**: Complete pre-loaded service catalog spanning Instagram, Facebook, TikTok, YouTube, Telegram, Twitter (X), and LinkedIn.
* **🇧🇩 Local Bangladeshi + Global Payments**: Automated transaction tracking for **bKash**, **Nagad**, **Rocket**, and **Binance Pay (USDT TRC20/BEP20)**.
* **🛠️ Tri-Language Official SDK Suite**: Zero-dependency clients for **PHP**, **Node.js**, and **Python**.
* **🐳 Complete Production Suite**: Pre-configured `Dockerfile`, `docker-compose.yml`, `nginx.conf` (SSL/rate-limiting), and `ecosystem.config.js` (PM2 cluster).

---

## ⚡ Quick Start (in 60 Seconds)

### Prerequisites
* [Node.js](https://nodejs.org/) v18+ or v20+
* Git

### 1. Clone & Install
```bash
git clone https://github.com/fsferdows/safollow-smm-panel.git
cd safollow-smm-panel
npm install
```

### 2. Start the Server
```bash
npm start
```
The server will start listening at **`http://localhost:3001`**.

### 3. Default Credentials
| Portal | URL | Username | Password | Role |
|---|---|---|---|---|
| **Admin Panel** | `http://localhost:3001/dashboard` | `admin` | `admin123` | Full Superadmin |
| **Demo User** | `http://localhost:3001/dashboard` | `demo` | `demo123` | Customer (Preloaded Balance) |

---

## 🌐 Universal SMM Reseller API v2

The built-in API allows child panels, agencies, and scripts to place orders, check balances, and fetch live service lists.

### Endpoints
* `POST /api/v2`
* `GET  /api/v2` (Query strings supported)

### API Actions Reference

| Action | Parameters | Description |
|---|---|---|
| `services` | `key` | Returns 1,034 services with IDs, rates, min/max limits, refill & cancel flags |
| `balance` | `key` | Returns user account balance and currency (`USD`) |
| `add` | `key`, `service`, `link`, `quantity` | Places single order, drip-feed (`runs`/`interval`), or custom comments |
| `status` | `key`, `order` | Returns status, start count, remains, and charge for 1 order |
| `status` | `key`, `orders=1,2,3` | Batch order status lookup for up to 100 orders |
| `refill` | `key`, `order` or `orders` | Triggers automated 30-day refill |
| `refill_status` | `key`, `refill` or `refills` | Queries live status of refill requests |
| `cancel` | `key`, `orders=1,2,3` | Cancels pending orders and refunds wallet balance automatically |

---

## 📦 Official Multi-Language SDK Suite

All official SDKs are located in the [`sdk/`](./sdk/) directory:

### 1. PHP SDK ([`sdk/php/Api.php`](./sdk/php/Api.php) & [`sdk/php/Safollow.php`](./sdk/php/Safollow.php))
Compatible with legacy PHP SMM scripts and modern PSR-4 applications:
```php
require_once 'sdk/php/Api.php';

$api = new Api('YOUR_API_KEY', 'http://localhost:3001/api/v2');

// Check Balance
$balance = $api->balance();

// Place Social Media Order
$order = $api->order([
    'service'  => 1925,
    'link'     => 'https://www.instagram.com/fsferdows/',
    'quantity' => 100
]);

// Track Status
$status = $api->status($order->order);
```

### 2. Node.js SDK ([`sdk/node/index.js`](./sdk/node/index.js))
Zero external dependencies (uses native `fetch`):
```javascript
const SafollowClient = require('./sdk/node');

const client = new SafollowClient('YOUR_API_KEY', 'http://localhost:3001/api/v2');

async function run() {
  const balance = await client.getBalance();
  const order = await client.createOrder({
    service: 1925,
    link: 'https://www.instagram.com/fsferdows/',
    quantity: 100
  });
  console.log(`Order Placed: #${order.order}`);
}
run();
```

### 3. Python SDK ([`sdk/python/safollow_smm.py`](./sdk/python/safollow_smm.py))
Zero external dependencies (uses native `urllib`):
```python
from sdk.python.safollow_smm import SafollowClient

client = SafollowClient("YOUR_API_KEY", "http://localhost:3001/api/v2")
order = client.create_order(service=1925, link="https://www.instagram.com/fsferdows/", quantity=100)
print(f"Order Created: #{order['order']}")
```

---

## 🐳 Production Deployment

### Docker Compose
```bash
docker-compose up -d --build
```

### PM2 Process Manager
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

### Nginx Reverse Proxy
A sample production configuration with Gzip compression and SSL rate limiting is provided in [`nginx.conf`](./nginx.conf).

---

## 👨‍💻 About the Developer

<div align="center">

### **FS Ferdows**
*Software Engineer • Full-Stack Developer • Founder at LateBright*

📍 **Dhaka, Bangladesh 🇧🇩**

[![GitHub](https://img.shields.io/badge/GitHub-@fsferdows-181717?style=for-the-badge&logo=github)](https://github.com/fsferdows)
[![YouTube](https://img.shields.io/badge/YouTube-FS%20Ferdows%20Official-FF0000?style=for-the-badge&logo=youtube)](https://youtube.com/@fsferdowsyt?si=03HdUXfd3jfuD0AZ)
[![Instagram](https://img.shields.io/badge/Instagram-@fsferdows-E4405F?style=for-the-badge&logo=instagram)](https://www.instagram.com/fsferdows/)
[![Email](https://img.shields.io/badge/Email-ferdowsurrahman1@gmail.com-D14836?style=for-the-badge&logo=gmail)](mailto:ferdowsurrahman1@gmail.com)

</div>

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>⭐ If you find this project useful, give it a star on GitHub! It helps more developers discover open-source tools.</sub>
</div>
