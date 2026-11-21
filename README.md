# SAFollow V3.0 – Bangladesh SMM Reseller Platform

A full-stack, production-grade **Social Media Marketing (SMM) Reseller Panel** reverse-engineered and reconstructed using the **REA (Reverse Engineer Anything)** methodology to match and provide the exact services offered by [https://www.safollow.com/](https://www.safollow.com/).

---

## 🌟 Key Features

### 1. Public High-Converting Web Application
- **Modern Responsive Design**: Built with clean CSS variables, glassmorphism, responsive cards, and automated theme switcher (🌙 Dark / ☀️ Light mode).
- **Multi-Currency Support**: Instant 1-click toggle between **$ USD** and **৳ BDT** (Bangladeshi Taka) across all prices, calculators, and catalogs.
- **Interactive Price Calculator**: Live hero widget where users select a social platform, pick a service, input quantity, and get real-time price estimation.
- **Live Catalog Explorer (`/services`)**: Full searchable list of **1,034+ real SAFollow services** with instant filtering, min/max limits, average delivery times, and modal descriptions.
- **Floating Live Support**: Integrated floating WhatsApp and Telegram quick-contact widgets matching SAFollow's 24/7 customer service setup.
- **Dedicated Legal & Help Pages**: Complete **API Documentation (`/api-docs`)**, **Terms & Refund Policy (`/terms`)**, and **FAQ (`/faq`)**.

### 2. User Dashboard
- **Authentication**: Secure JWT-based authentication with bcrypt password hashing, session cookies, and registration.
- **Single Order Placement**: Dynamic category and service selection with live cost computation and automatic balance deduction.
- **Mass Order System**: Multi-line bulk ordering in format `service_id|link|quantity` with syntax validation and instant summary report.
- **Order Tracking & Refills**: Real-time order progress tracking (`Pending`, `Processing`, `In progress`, `Completed`, `Partial`, `Canceled`) with **30-Day Free Refill** trigger button.
- **Add Funds / Local Bangladeshi Deposits**:
  - **bKash** (Personal Send Money + Transaction ID verification)
  - **Nagad** (Personal Send Money + TrxID verification)
  - **Rocket** (Personal Send Money + TrxID verification)
  - **Binance Pay / Crypto** (USDT BEP20 / TRC20 Pay ID)
  - **Credit / Debit Cards** (Stripe integration)
- **24/7 Support Ticket System**: Open tickets with category subjects and reference IDs; threaded conversation with admin support.
- **API Key Manager**: Generate, view, copy, and regenerate personal API keys.

### 3. Industry-Standard SMM Reseller API v2 (`/api/v2` and `/api`)
Compatible with all third-party reseller tools, child panels, and standard SMM scripts (RentalPanel, Perfect Panel, SmartStore):

| Action | Parameters | Description |
| :--- | :--- | :--- |
| `services` | `key`, `action: "services"` | Returns all active services, rates, min, max, refill flag. |
| `add` | `key`, `action: "add"`, `service`, `link`, `quantity` | Deducts balance and places an order. Returns `{"order": id}`. |
| `status` | `key`, `action: "status"`, `order` or `orders` | Returns charge, start_count, status, remains, currency. |
| `refill` | `key`, `action: "refill"`, `order` | Requests automated refill for supported order. |
| `refill_status` | `key`, `action: "refill_status"`, `refill` | Queries current refill status. |
| `balance` | `key`, `action: "balance"` | Returns available user balance and currency in USD. |

### 4. Admin Management Center
- **Executive Analytics**: Total revenue, order counters, pending orders, user counts, and pending payment verifications.
- **Order Management**: Change order status, update start count/remains, or issue 1-click full refunds to user balance.
- **Service Management**: Create new services, edit rates/limits, delete, or run **Bulk Price Markups** (e.g. increase all prices by 10%).
- **User Control**: View users, add or deduct wallet balance manually, activate or suspend accounts.
- **Payment Verification**: Review pending bKash/Nagad/Binance deposits and click **Approve** (automatically credits user balance) or **Reject**.
- **Ticket Desk**: Reply to user support requests in real-time.
- **Upstream Provider Engine**: Connect any upstream SMM API (URL + API Key), check real-time provider balance, and automatically forward user orders!
- **System Settings**: Update site name, BDT exchange rate, WhatsApp/Telegram numbers, deposit phone numbers, and announcement banner text.

---

## 🛠️ Technology Stack

- **Runtime**: Node.js (v18+)
- **Backend Framework**: Express.js
- **Database**: SQLite (via `better-sqlite3` with WAL mode enabled for high-concurrency read/write operations)
- **Security**: `bcryptjs` password hashing, `jsonwebtoken`, `cookie-parser`, CORS
- **Frontend**: Clean Vanilla JavaScript (no heavy bundlers needed), Modern CSS3, Font Awesome 6, responsive typography

---

## 🚀 Quick Start Guide

### 1. Installation
Clone the repository and install dependencies:
```bash
cd /Users/user/Desktop/safollow
npm install
```

### 2. Start the Server
```bash
npm start
```
The server will start on port `3000` (or `process.env.PORT`):
- **Website Homepage**: [http://localhost:3000](http://localhost:3000)
- **User & Admin Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **Services Catalog**: [http://localhost:3000/services](http://localhost:3000/services)
- **Reseller API v2**: `http://localhost:3000/api/v2`

---

## 🔑 Default Accounts

| Role | Username | Password | Initial Balance | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin123` | **$999.00** | Full access to Admin Tools, Settings, Order Approvals |
| **Demo User** | `demo` | `demo123` | **$50.00** | Ready to place test orders, check API, submit deposits |

---

## 🧪 Automated Test Suite

Run the full end-to-end integration test suite verifying public endpoints, authentication, database seeding, standard SMM API v2, user order flow, and deposit approval:
```bash
npm test
```
Or run individual tests:
```bash
node test.js
node test_extra.js
```

---

## 📡 SMM Reseller API Integration Example

### Python Example
```python
import requests

API_URL = "http://localhost:3000/api/v2"
API_KEY = "YOUR_API_KEY_HERE"

# 1. Check User Balance
res = requests.post(API_URL, data={"key": API_KEY, "action": "balance"}).json()
print("Balance:", res["balance"])

# 2. Add Order
order = requests.post(API_URL, data={
    "key": API_KEY,
    "action": "add",
    "service": 2374, # Facebook Post Like
    "link": "https://facebook.com/example/posts/101",
    "quantity": 1000
}).json()
print("Order ID:", order.get("order"))

# 3. Check Order Status
if "order" in order:
    status = requests.post(API_URL, data={
        "key": API_KEY,
        "action": "status",
        "order": order["order"]
    }).json()
    print("Status:", status["status"])
```

### cURL Example
```bash
# Get Services List
curl -X POST http://localhost:3000/api/v2 \
  -d "key=YOUR_API_KEY&action=services"

# Check Balance
curl -X POST http://localhost:3000/api/v2 \
  -d "key=YOUR_API_KEY&action=balance"

# Place an Order
curl -X POST http://localhost:3000/api/v2 \
  -d "key=YOUR_API_KEY&action=add&service=2374&link=https://fb.com/p/1&quantity=500"
```

---

## 📂 Project Structure

```
safollow/
├── package.json               # Node.js dependencies and scripts
├── server.js                  # Express application, routes, middleware
├── database.js                # SQLite schema & automatic seeding
├── config.js                  # Environment & default settings
├── providerService.js         # Upstream provider API dispatcher
├── safollow_services.json     # 1,034 authentic SAFollow services
├── test.js                    # Automated integration test suite
├── test_extra.js              # Additional ticket & mass-order test suite
├── routes/
│   ├── api_v2.js              # Standard SMM Reseller API v2
│   ├── auth.js                # Authentication, register, login, profile
│   ├── user.js                # Orders, mass orders, deposits, tickets
│   └── admin.js               # Admin controls, order management, markups
└── public/
    ├── index.html             # High-converting Landing Page
    ├── services.html          # Public Services Catalog Explorer
    ├── api-docs.html          # Interactive API Documentation
    ├── terms.html             # Terms of Service & Refund Policy
    ├── faq.html               # Support FAQ & WhatsApp Chat Notice
    ├── dashboard.html         # Unified User & Admin Dashboard
    ├── css/
    │   └── style.css          # Theme styles, CSS variables, dark/light
    └── js/
        ├── app.js             # Public scripts, calculator, theme, auth modal
        └── dashboard.js       # Dashboard SPA controller logic
```

---

## 🛡️ License
ISC License. Built for scalable SMM reseller panel operations.
