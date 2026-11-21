const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'safollow.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance concurrent reads and writes
db.pragma('journal_mode = WAL');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      balance REAL DEFAULT 0.0,
      spent REAL DEFAULT 0.0,
      api_key TEXT UNIQUE,
      custom_rates TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT 'fas fa-cubes',
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY,
      category_id INTEGER,
      category_name TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'Default',
      rate REAL NOT NULL,
      min INTEGER DEFAULT 100,
      max INTEGER DEFAULT 10000,
      avg_time TEXT,
      desc TEXT,
      refill INTEGER DEFAULT 0,
      cancel INTEGER DEFAULT 0,
      provider_id INTEGER DEFAULT NULL,
      provider_service_id INTEGER DEFAULT NULL,
      provider_rate REAL DEFAULT NULL,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      service_name TEXT NOT NULL,
      category_name TEXT,
      link TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      charge REAL NOT NULL,
      start_count INTEGER DEFAULT 0,
      remains INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Pending',
      refill_status TEXT DEFAULT 'None',
      provider_id INTEGER DEFAULT NULL,
      provider_order_id INTEGER DEFAULT NULL,
      error_message TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      method TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      amount_bdt REAL,
      transaction_id TEXT,
      sender_number TEXT,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      reference_id TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      api_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      balance REAL DEFAULT 0.0,
      currency TEXT DEFAULT 'USD'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration checks
  try {
    db.prepare('ALTER TABLE orders ADD COLUMN error_message TEXT DEFAULT NULL').run();
  } catch (e) {}

  // Default Settings
  const defaultSettings = {
    site_name: 'SAFollow',
    site_tagline: 'Bangladesh SMM Panel | Affordable SMM Services for Resellers',
    bdt_rate: '120.0',
    fulfillment_mode: 'live',
    whatsapp_number: '+8801864614704',
    telegram_channel: 'https://t.me/safollow_official',
    bkash_number: '01864614704 (Personal / Send Money)',
    nagad_number: '01864614704 (Personal / Send Money)',
    rocket_number: '01864614704 (Personal / Send Money)',
    binance_pay_id: '84729104 (USDT BEP20 / TRC20)',
    announcement: '🔥 Welcome to SAFollow V3! Facebook followers and Post Reactions are running ultra-fast with 0% drop rate! Add funds via bKash, Nagad & Crypto instantly.'
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  // Seed Admin & Demo User
  const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (userCount === 0) {
    const adminPassHash = bcrypt.hashSync('admin123', 10);
    const adminApiKey = 'saf_admin_' + crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, balance, api_key)
      VALUES (?, ?, ?, 'admin', 999.00, ?)
    `).run('admin', 'admin@safollow.com', adminPassHash, adminApiKey);

    const demoPassHash = bcrypt.hashSync('demo123', 10);
    const demoApiKey = 'saf_demo_' + crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, balance, api_key)
      VALUES (?, ?, ?, 'user', 50.00, ?)
    `).run('demo', 'demo@safollow.com', demoPassHash, demoApiKey);
  }

  // Seed Services from safollow_services.json
  const serviceCount = db.prepare('SELECT count(*) as count FROM services').get().count;
  if (serviceCount === 0) {
    const jsonPath = path.join(__dirname, 'safollow_services.json');
    if (fs.existsSync(jsonPath)) {
      const rawData = fs.readFileSync(jsonPath, 'utf8');
      try {
        const services = JSON.parse(rawData);
        console.log(`Seeding ${services.length} services into database...`);

        // Seed Categories first
        const categoryMap = new Map();
        const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)');
        const getCategory = db.prepare('SELECT id FROM categories WHERE name = ?');

        // Helper to pick icon
        function getIconForCat(name) {
          const l = name.toLowerCase();
          if (l.includes('facebook')) return 'fab fa-facebook text-primary';
          if (l.includes('instagram')) return 'fab fa-instagram text-danger';
          if (l.includes('youtube')) return 'fab fa-youtube text-danger';
          if (l.includes('tiktok')) return 'fab fa-tiktok text-dark';
          if (l.includes('telegram')) return 'fab fa-telegram text-info';
          if (l.includes('twitter') || l.includes('x-')) return 'fab fa-twitter text-info';
          if (l.includes('whatsapp')) return 'fab fa-whatsapp text-success';
          if (l.includes('linkedin')) return 'fab fa-linkedin text-primary';
          if (l.includes('spotify')) return 'fab fa-spotify text-success';
          return 'fas fa-rocket text-primary';
        }

        const insertService = db.prepare(`
          INSERT OR REPLACE INTO services 
          (id, category_id, category_name, name, type, rate, min, max, avg_time, desc, refill, cancel)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const seedTx = db.transaction((items) => {
          for (const s of items) {
            let catId = categoryMap.get(s.category);
            if (!catId) {
              insertCategory.run(s.category, getIconForCat(s.category));
              const row = getCategory.get(s.category);
              catId = row ? row.id : 1;
              categoryMap.set(s.category, catId);
            }

            insertService.run(
              s.service,
              catId,
              s.category,
              s.name,
              'Default',
              s.rate,
              s.min,
              s.max,
              s.avg_time || '',
              s.desc || '',
              s.refill ? 1 : 0,
              s.cancel ? 1 : 0
            );
          }
        });

        seedTx(services);
        console.log(`Successfully seeded ${services.length} services.`);
      } catch (err) {
        console.error('Error seeding services:', err);
      }
    }
  }
}

initDb();

module.exports = db;
