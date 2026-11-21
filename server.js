const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { PORT } = require('./config');
const db = require('./database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Public API endpoints for frontend
app.get('/public-api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load public settings' });
  }
});

app.get('/public-api/services', (req, res) => {
  try {
    const { category, search } = req.query;
    let query = "SELECT id, category_name, name, rate, min, max, avg_time, desc, refill FROM services WHERE status = 'active'";
    const params = [];

    if (category && category !== 'All') {
      query += ' AND category_name = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR id LIKE ? OR desc LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY category_name, id';
    const services = db.prepare(query).all(...params);

    const bdtRateSetting = db.prepare("SELECT value FROM settings WHERE key = 'bdt_rate'").get();
    const bdtRate = parseFloat(bdtRateSetting ? bdtRateSetting.value : '120.0');

    const formatted = services.map(s => ({
      ...s,
      rate_bdt: (s.rate * bdtRate).toFixed(3)
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load public services' });
  }
});

app.get('/public-api/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT DISTINCT category_name as name, COUNT(id) as count 
      FROM services 
      WHERE status = 'active' 
      GROUP BY category_name 
      ORDER BY count DESC
    `).all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// Mount Routes
const authRouter = require('./routes/auth').router;
const apiV2Router = require('./routes/api_v2');
const userRouter = require('./routes/user');
const adminRouter = require('./routes/admin');

app.use('/auth', authRouter);
app.use('/api/v2', apiV2Router);
app.use('/api', apiV2Router); // SMM panel alias
app.use('/user', userRouter);
app.use('/admin', adminRouter);

// Frontend Page Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'services.html'));
});

app.get('/api-docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'api-docs.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/faq', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'faq.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/login', (req, res) => {
  res.redirect('/dashboard#login');
});

app.get('/signup', (req, res) => {
  res.redirect('/dashboard#signup');
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  ✦ SAFollow SMM Panel Platform V3.0`);
    console.log(`  ✦ Server running at http://localhost:${PORT}`);
    console.log(`  ✦ Standard SMM API v2: http://localhost:${PORT}/api/v2`);
    console.log(`  ✦ Default Admin Login: admin / admin123`);
    console.log(`  ✦ Default Demo User: demo / demo123 (Balance: $50.00)`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
