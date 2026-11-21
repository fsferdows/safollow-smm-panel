/**
 * Bot Account Farm Manager
 * Handles local SQLite storage, rotation, health states, and bulk imports for bot accounts.
 */

const db = require('../database');
const { testAccountSession } = require('./instagramEngine');

/**
 * Get active accounts for fulfillment, ordered by least recently used
 * @param {string} [platform='instagram'] 
 * @param {number} [limit=100] 
 * @returns {Array<Object>}
 */
function getAvailableAccounts(platform = 'instagram', limit = 100) {
  return db.prepare(`
    SELECT * FROM bot_accounts 
    WHERE platform = ? AND status = 'active'
    ORDER BY last_used_at ASC NULLS FIRST, id ASC
    LIMIT ?
  `).all(platform, limit);
}

/**
 * Record usage after follow attempt
 * @param {number} accountId 
 * @param {Object} result - Result from followUser 
 */
function recordAccountUsage(accountId, result) {
  if (result.success) {
    db.prepare(`
      UPDATE bot_accounts 
      SET total_followed = total_followed + 1, 
          last_used_at = CURRENT_TIMESTAMP,
          status = 'active',
          notes = NULL
      WHERE id = ?
    `).run(accountId);
  } else if (result.status === 'challenge') {
    db.prepare(`
      UPDATE bot_accounts 
      SET status = 'challenge', 
          last_used_at = CURRENT_TIMESTAMP,
          notes = ?
      WHERE id = ?
    `).run(result.error || 'Checkpoint challenge required', accountId);
  } else if (result.status === 'rate_limited') {
    db.prepare(`
      UPDATE bot_accounts 
      SET last_used_at = CURRENT_TIMESTAMP,
          notes = 'Temporary cooldown'
      WHERE id = ?
    `).run(accountId);
  }
}

/**
 * Parse and import accounts from raw text
 * Formats supported:
 * 1. username:sessionid
 * 2. username:password:sessionid
 * 3. username:password:sessionid:proxy
 * 4. Cookie string (sessionid=...; ds_user_id=...)
 * @param {string} rawText 
 * @param {string} [platform='instagram']
 * @returns {{ added: number, skipped: number, errors: Array<string> }}
 */
function importAccounts(rawText, platform = 'instagram') {
  if (!rawText || typeof rawText !== 'string') {
    return { added: 0, skipped: 0, errors: ['No text provided'] };
  }

  const lines = rawText.split('\n');
  let added = 0;
  let skipped = 0;
  const errors = [];

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO bot_accounts 
    (platform, username, password, session_id, csrftoken, ds_user_id, proxy, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    try {
      let username = '';
      let password = '';
      let sessionId = '';
      let proxy = '';
      let dsUserId = '';
      let csrfToken = '';

      // Check if line is cookie string
      if (line.includes('sessionid=')) {
        const sessMatch = line.match(/sessionid=([^;]+)/);
        const uidMatch = line.match(/ds_user_id=([^;]+)/);
        const csrfMatch = line.match(/csrftoken=([^;]+)/);

        if (sessMatch) sessionId = sessMatch[1].trim();
        if (uidMatch) dsUserId = uidMatch[1].trim();
        if (csrfMatch) csrfToken = csrfMatch[1].trim();
        username = dsUserId ? `user_${dsUserId}` : `sess_${sessionId.substring(0, 10)}`;
      } else if (line.includes(':')) {
        const parts = line.split(':');
        if (parts.length >= 2) {
          username = parts[0].trim();
          if (parts.length === 2) {
            sessionId = parts[1].trim();
          } else if (parts.length === 3) {
            password = parts[1].trim();
            sessionId = parts[2].trim();
          } else if (parts.length >= 4) {
            password = parts[1].trim();
            sessionId = parts[2].trim();
            proxy = parts.slice(3).join(':').trim();
          }
        }
      }

      if (!username || !sessionId) {
        skipped++;
        errors.push(`Line ${i + 1}: Could not extract username or session_id`);
        continue;
      }

      // If session contains ds_user_id embedded (e.g. 149204%3A...)
      if (!dsUserId && sessionId.includes('%3A')) {
        dsUserId = sessionId.split('%3A')[0];
      }

      insertStmt.run(platform, username, password, sessionId, csrfToken, dsUserId, proxy);
      added++;
    } catch (err) {
      skipped++;
      errors.push(`Line ${i + 1}: ${err.message}`);
    }
  }

  return { added, skipped, errors };
}

/**
 * Get account statistics
 * @returns {Object}
 */
function getAccountStats() {
  const total = db.prepare('SELECT count(*) as c FROM bot_accounts').get().c;
  const active = db.prepare("SELECT count(*) as c FROM bot_accounts WHERE status = 'active'").get().c;
  const challenge = db.prepare("SELECT count(*) as c FROM bot_accounts WHERE status = 'challenge'").get().c;
  const totalDelivered = db.prepare('SELECT SUM(total_followed) as s FROM bot_accounts').get().s || 0;

  return {
    total,
    active,
    challenge,
    total_delivered: totalDelivered
  };
}

module.exports = {
  getAvailableAccounts,
  recordAccountUsage,
  importAccounts,
  getAccountStats
};
