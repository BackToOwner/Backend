import { db } from '../../db/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

// GET /api/stats/overview
export const overview = asyncHandler(async (req, res) => {
  const itemsReturned = db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'returned'").get().c;
  const activeCases = db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status IN ('open','in_review')").get().c;
  const totalReports = db.prepare('SELECT COUNT(*) AS c FROM reports').get().c;
  const pendingMatches = db.prepare("SELECT COUNT(*) AS c FROM matches WHERE status = 'pending_admin_approval'").get().c;
  const registeredUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const activeFinders = db.prepare("SELECT COUNT(*) AS c FROM users WHERE items_found > 0 AND status = 'active'").get().c;
  const totalRewards = db.prepare("SELECT COALESCE(SUM(reward), 0) AS s FROM reports WHERE reward IS NOT NULL").get().s;
  const successRate = totalReports > 0 ? Number(((itemsReturned / totalReports) * 100).toFixed(1)) : 0;

  res.json({
    success: true,
    data: {
      itemsReturned,
      activeCases,
      successRate,
      pendingMatches,
      totalRewardsPaid: totalRewards,
      registeredUsers,
      activeFinders,
    },
  });
});

// GET /api/stats/breakdown  (counts by category / type / status, for charts)
export const breakdown = asyncHandler(async (req, res) => {
  const byCategory = db.prepare('SELECT category, COUNT(*) AS count FROM reports GROUP BY category').all();
  const byType = db.prepare('SELECT type, COUNT(*) AS count FROM reports GROUP BY type').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) AS count FROM reports GROUP BY status').all();
  const last14Days = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count
       FROM reports
       WHERE created_at >= datetime('now', '-14 days')
       GROUP BY day ORDER BY day ASC`
    )
    .all();

  res.json({ success: true, data: { byCategory, byType, byStatus, last14Days } });
});
