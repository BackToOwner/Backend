import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function serialize(r) { return { id: r.id, title: r.title, message: r.message, type: r.type, radiusKm: r.radius_km, priority: r.priority, read: Boolean(r.read), meta: r.meta || {}, createdAt: r.created_at }; }
function check(error, message) { if (error) { console.error(message, error); throw new ApiError(500, message); } }
export const listNotifications = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
  check(error, 'Failed to load notifications'); res.json({ success: true, data: (data || []).map(serialize) });
});
export const broadcast = asyncHandler(async (req, res) => {
  const { title, message, radius = 3, priority = 'high' } = req.body;
  if (!title || !message) throw new ApiError(400, 'title and message are required');
  const { data, error } = await supabase.from('notifications').insert({ title: `Geo-Alert: ${title}`, message, type: 'location', radius_km: Number(radius), priority, meta: { originalTitle: title } }).select('*').single();
  check(error, 'Failed to create broadcast'); res.status(201).json({ success: true, data: serialize(data) });
});
export const markRead = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('notifications').update({ read: true }).eq('id', req.params.id).select('*').maybeSingle();
  check(error, 'Failed to update notification'); if (!data) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, data: serialize(data) });
});
export const deleteNotification = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('notifications').delete().eq('id', req.params.id).select('id').maybeSingle();
  check(error, 'Failed to delete notification'); if (!data) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, data: { id: data.id } });
});
