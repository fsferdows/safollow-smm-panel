const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');
const { JWT_SECRET } = require('../config');

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Middleware to check Admin role
function requireAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Access denied: Admin privileges required' });
    }
  });
}

// Register
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required' });
  }

  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const apiKey = 'saf_' + crypto.randomBytes(16).toString('hex');
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, balance, api_key)
      VALUES (?, ?, ?, 'user', 0.00, ?)
    `).run(username, email, hash, apiKey);

    const user = { id: result.lastInsertRowid, username, email, role: 'user' };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, message: 'Account registered successfully', user, token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login
router.post('/login', (req, res) => {
  const { username, password, remember_me } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is suspended or deactivated' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const payload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const expiresIn = remember_me ? '30d' : '7d';
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn });

    res.cookie('token', token, { httpOnly: true, maxAge: (remember_me ? 30 : 7) * 24 * 60 * 60 * 1000 });
    res.json({
      success: true,
      message: 'Logged in successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        spent: user.spent,
        api_key: user.api_key
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get Current User Profile
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, email, role, balance, spent, api_key, status, created_at 
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// Regenerate API Key
router.post('/api-key/regenerate', authenticateToken, (req, res) => {
  try {
    const newApiKey = 'saf_' + crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(newApiKey, req.user.id);
    res.json({ success: true, api_key: newApiKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = {
  router,
  authenticateToken,
  requireAdmin
};
