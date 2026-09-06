import { db } from '../../db/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { newId } from '../../utils/id.js';
import { parseJsonSafe } from '../../utils/parseJson.js';

function serialize(row) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    radiusKm: row.radius_km,
    priority: row.priority,
    read: Boolean(row.read),
    meta: parseJsonSafe(row.meta, {}),
    createdAt: row.created_at,
  };
}

// GET /api/notifications
export const listNotifications = asyncHandler(async (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all();
  res.json({ success: true, data: rows.map(serialize) });
});

// POST /api/notifications/broadcast  (geo-broadcast alert, mirrors GeoBroadcastPayload)
export const broadcast = asyncHandler(async (req, res) => {
  const { title, message, radius = 3.0, priority = 'high' } = req.body;
  if (!title || !message) throw new ApiError(400, 'title and message are required');

  const id = newId('BROADCAST');
  db.prepare(
    "INSERT INTO notifications (id, title, message, type, radius_km, priority, meta) VALUES (?, ?, ?, 'location', ?, ?, ?)"
  ).run(id, `Geo-Alert: ${title}`, message, Number(radius), priority, JSON.stringify({ originalTitle: title }));

  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: serialize(row) });
});

// PATCH /api/notifications/:id/read
export const markRead = asyncHandler(async (req, res) => {
  const result = db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  if (result.changes === 0) throw new ApiError(404, 'Notification not found');
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: serialize(row) });
});

// DELETE /api/notifications/:id
export const deleteNotification = asyncHandler(async (req, res) => {
  const result = db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  if (result.changes === 0) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, data: { id: req.params.id } });
});
