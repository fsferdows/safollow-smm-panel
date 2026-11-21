/**
 * Direct Internal Social Media Fulfillment Engine
 * Fulfills Instagram orders directly using your own pool of bot accounts.
 */

const db = require('../database');
const { extractUsername, lookupUser, followUser } = require('./instagramEngine');
const { getAvailableAccounts, recordAccountUsage } = require('./accountManager');

/**
 * Fulfill an order directly via the local Bot Account Pool
 * @param {Object} order - Order row from database
 * @returns {Promise<{ success: boolean, delivered: number, remaining: number, error?: string }>}
 */
async function fulfillOrderDirect(order) {
  const username = extractUsername(order.link);
  if (!username) {
    const err = 'Invalid Instagram URL or handle';
    db.prepare("UPDATE orders SET status = 'Canceled', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(err, order.id);
    return { success: false, delivered: 0, remaining: order.quantity, error: err };
  }

  // 1. Check available bot accounts in farm
  const availableAccounts = getAvailableAccounts('instagram', order.remains || order.quantity);
  if (!availableAccounts || availableAccounts.length === 0) {
    const notice = 'Direct Bot Farm: No active accounts in pool. Add Instagram accounts in Admin -> Bot Farm.';
    db.prepare("UPDATE orders SET error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(notice, order.id);
    return { success: false, delivered: 0, remaining: order.quantity, error: notice };
  }

  // 2. Resolve target profile & start count using first available session
  let targetUser;
  try {
    targetUser = await lookupUser(username, availableAccounts[0]);
  } catch (lookupErr) {
    targetUser = { id: username, follower_count: order.start_count || 0 };
  }

  const startCount = (targetUser.follower_count > 0) ? targetUser.follower_count : order.start_count;

  // Move order to In progress
  db.prepare(`
    UPDATE orders 
    SET status = 'In progress', 
        start_count = ?, 
        error_message = '[Direct Farm Fulfillment Running]',
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(startCount, order.id);

  console.log(`[DirectFarm] Order #${order.id} started -> In progress for @${username} (Target ID: ${targetUser.id}, Start: ${startCount})`);

  let deliveredCount = 0;
  let remainingCount = order.remains || order.quantity;

  // 3. Dispatch follow requests across accounts
  for (const account of availableAccounts) {
    if (remainingCount <= 0) break;

    try {
      console.log(`[DirectFarm] Account @${account.username} following @${username} (${targetUser.id})...`);
      const res = await followUser(account, targetUser.id);
      recordAccountUsage(account.id, res);

      if (res.success) {
        deliveredCount++;
        remainingCount--;
        db.prepare(`
          UPDATE orders 
          SET remains = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(remainingCount, order.id);
      } else {
        console.warn(`[DirectFarm] Account @${account.username} follow failed:`, res.error);
      }

      // Small jitter delay between follows to mimic natural human behavior (800ms - 1500ms)
      await new Promise(r => setTimeout(r, 800 + Math.random() * 700));
    } catch (actErr) {
      console.error(`[DirectFarm] Error dispatching account @${account.username}:`, actErr.message);
    }
  }

  // 4. Update final order status
  if (remainingCount === 0) {
    db.prepare(`
      UPDATE orders 
      SET status = 'Completed', remains = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(order.id);
    console.log(`[DirectFarm] Order #${order.id} completely fulfilled by local bot farm!`);
  } else {
    // Partial fulfillment if pool had fewer accounts than total requested
    const partialStatus = deliveredCount > 0 ? 'Partial' : 'In progress';
    const note = deliveredCount > 0 
      ? `Direct Farm: Delivered ${deliveredCount} follows (${remainingCount} remains - add more accounts to complete)`
      : `Direct Farm: Waiting for additional active accounts in pool`;

    db.prepare(`
      UPDATE orders 
      SET status = ?, remains = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(partialStatus, remainingCount, note, order.id);
  }

  return {
    success: deliveredCount > 0,
    delivered: deliveredCount,
    remaining: remainingCount
  };
}

module.exports = {
  fulfillOrderDirect
};
