/**
 * Instagram Private & Web API Reverse-Engineered Client
 * Direct execution engine for user lookup, friendship creation (following), and session verification.
 */

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 297.0.0.32.110';
const IG_APP_ID = '936619743392459'; // Instagram Web App ID

/**
 * Extract clean username from Instagram URL or raw handle
 * @param {string} linkOrUser 
 * @returns {string}
 */
function extractUsername(linkOrUser) {
  if (!linkOrUser) return '';
  let str = linkOrUser.trim();
  // Remove trailing slashes and query strings
  str = str.split('?')[0].replace(/\/+$/, '');
  // Match instagram.com/username
  const match = str.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (match) return match[1];
  // Strip leading @
  return str.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');
}

/**
 * Build Cookie Header string from account object
 * @param {Object} account 
 * @returns {string}
 */
function buildCookieString(account) {
  const parts = [];
  if (account.session_id) parts.push(`sessionid=${account.session_id.trim()}`);
  if (account.ds_user_id) parts.push(`ds_user_id=${account.ds_user_id.trim()}`);
  if (account.csrftoken) parts.push(`csrftoken=${account.csrftoken.trim()}`);
  return parts.join('; ');
}

/**
 * Reverse-Engineered Profile Lookup
 * Queries Instagram to resolve username to internal numeric User ID (`pk`) and start count.
 * @param {string} username 
 * @param {Object} [sessionAccount=null] - Optional bot account for authenticated lookup
 * @returns {Promise<{ id: string, username: string, follower_count: number, is_private: boolean, full_name: string }>}
 */
async function lookupUser(username, sessionAccount = null) {
  const cleanUser = extractUsername(username);
  if (!cleanUser) throw new Error('Invalid Instagram username or profile URL');

  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    'X-IG-App-ID': IG_APP_ID,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors'
  };

  if (sessionAccount) {
    const cookies = buildCookieString(sessionAccount);
    if (cookies) headers['Cookie'] = cookies;
    if (sessionAccount.csrftoken) headers['X-CSRFToken'] = sessionAccount.csrftoken;
  }

  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanUser)}`;

  try {
    const res = await fetch(url, { headers });
    const text = await res.text();

    try {
      const json = JSON.parse(text);
      if (json.data && json.data.user) {
        const u = json.data.user;
        return {
          id: String(u.id),
          username: u.username,
          full_name: u.full_name || cleanUser,
          follower_count: u.edge_followed_by ? u.edge_followed_by.count : 0,
          is_private: Boolean(u.is_private)
        };
      }
    } catch (e) {
      // Non-JSON or challenge response
    }
  } catch (err) {
    console.warn(`[InstagramEngine] Web profile lookup network error for ${cleanUser}:`, err.message);
  }

  // Fallback: parse public html tags if direct JSON API is challenge-gated
  try {
    const publicUrl = `https://www.instagram.com/${encodeURIComponent(cleanUser)}/`;
    const pubRes = await fetch(publicUrl, { headers: { 'User-Agent': DEFAULT_USER_AGENT } });
    const pubHtml = await pubRes.text();

    const countMatch = pubHtml.match(/([0-9,KMkm.]+)\s*Followers/i);
    let count = 0;
    if (countMatch) {
      let raw = countMatch[1].replace(/,/g, '');
      if (raw.toLowerCase().endsWith('k')) count = parseFloat(raw) * 1000;
      else if (raw.toLowerCase().endsWith('m')) count = parseFloat(raw) * 1000000;
      else count = parseInt(raw, 10) || 0;
    }

    return {
      id: cleanUser,
      username: cleanUser,
      full_name: cleanUser,
      follower_count: count,
      is_private: false
    };
  } catch (pubErr) {
    return {
      id: cleanUser,
      username: cleanUser,
      full_name: cleanUser,
      follower_count: 0,
      is_private: false
    };
  }
}

/**
 * Reverse-Engineered Friendship Create (Follow Action)
 * Executes direct follow request to Instagram servers on behalf of a bot account.
 * @param {Object} botAccount - Account from bot_accounts table
 * @param {string|number} targetUserId - Target Instagram numeric ID or username
 * @returns {Promise<{ success: boolean, following: boolean, status: string, error?: string }>}
 */
async function followUser(botAccount, targetUserId) {
  if (!botAccount.session_id) {
    return { success: false, status: 'error', error: 'Missing session_id for bot account' };
  }

  const cookieStr = buildCookieString(botAccount);
  const csrf = botAccount.csrftoken || 'missing';

  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    'X-IG-App-ID': IG_APP_ID,
    'X-CSRFToken': csrf,
    'Cookie': cookieStr,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/'
  };

  const url = `https://www.instagram.com/api/v1/friendships/create/${targetUserId}/`;
  const body = new URLSearchParams({ user_id: String(targetUserId) });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: body.toString()
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (parseErr) {
      return { success: false, status: 'error', error: `Unexpected response: ${text.substring(0, 100)}` };
    }

    if (json.status === 'ok' && json.friendship_status) {
      return {
        success: true,
        following: Boolean(json.friendship_status.following || json.friendship_status.outgoing_request),
        status: json.friendship_status.following ? 'following' : 'requested'
      };
    } else if (json.message === 'checkpoint_required') {
      return { success: false, status: 'challenge', error: 'Instagram triggered verification challenge (checkpoint)' };
    } else if (json.message && json.message.includes('wait a few minutes')) {
      return { success: false, status: 'rate_limited', error: 'Rate limit: Instagram requested temporary cooldown' };
    } else {
      return { success: false, status: 'failed', error: json.message || 'Follow action rejected' };
    }
  } catch (err) {
    return { success: false, status: 'network_error', error: err.message };
  }
}

/**
 * Verify Bot Account Session Health
 * Tests if the account's session_id is active and not banned.
 * @param {Object} botAccount 
 * @returns {Promise<{ valid: boolean, username: string, follower_count: number, error?: string }>}
 */
async function testAccountSession(botAccount) {
  if (!botAccount.session_id) {
    return { valid: false, username: botAccount.username, follower_count: 0, error: 'No session_id provided' };
  }

  const cookieStr = buildCookieString(botAccount);
  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    'X-IG-App-ID': IG_APP_ID,
    'Cookie': cookieStr
  };

  try {
    const res = await fetch('https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(botAccount.username), {
      headers
    });

    const text = await res.text();
    const json = JSON.parse(text);

    if (json.data && json.data.user) {
      return {
        valid: true,
        username: json.data.user.username,
        follower_count: json.data.user.edge_followed_by ? json.data.user.edge_followed_by.count : 0
      };
    } else {
      return { valid: false, username: botAccount.username, follower_count: 0, error: 'Session expired or invalid cookies' };
    }
  } catch (err) {
    return { valid: false, username: botAccount.username, follower_count: 0, error: err.message };
  }
}

/**
 * Extract Media Shortcode or ID from Instagram URL
 * @param {string} url 
 * @returns {string}
 */
function extractMediaShortcode(url) {
  if (!url) return '';
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : '';
}

/**
 * Reverse-Engineered Like Action
 * Executes like on an Instagram post or media
 * @param {Object} botAccount - Account from bot_accounts table
 * @param {string|number} mediaId - Target Instagram media ID
 * @returns {Promise<{ success: boolean, status: string, error?: string }>}
 */
async function likeMedia(botAccount, mediaId) {
  if (!botAccount.session_id) {
    return { success: false, status: 'error', error: 'Missing session_id for bot account' };
  }

  const cookieStr = buildCookieString(botAccount);
  const csrf = botAccount.csrftoken || 'missing';

  const headers = {
    'User-Agent': DEFAULT_USER_AGENT,
    'X-IG-App-ID': IG_APP_ID,
    'X-CSRFToken': csrf,
    'Cookie': cookieStr,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/'
  };

  const url = `https://www.instagram.com/api/v1/web/likes/${mediaId}/like/`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = {}; }

    if (json.status === 'ok') {
      return { success: true, status: 'liked' };
    } else {
      return { success: false, status: 'failed', error: json.message || 'Like action rejected' };
    }
  } catch (err) {
    return { success: false, status: 'network_error', error: err.message };
  }
}

module.exports = {
  extractUsername,
  extractMediaShortcode,
  lookupUser,
  followUser,
  likeMedia,
  testAccountSession,
  buildCookieString
};
