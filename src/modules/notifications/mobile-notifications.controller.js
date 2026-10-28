import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function check(error, message) {
  if (error) {
    console.error(message, error);
    throw new ApiError(500, message);
  }
}

function serializeMobileNotification(row) {
  const meta = row.meta || {};

  return {
    id: row.id,
    title: row.title,
    body: row.message || '',
    type: row.type || 'info',
    reportId: meta.reportId || null,
    isRead: Boolean(row.read),
    createdAt: row.created_at,
    meta,
  };
}

export const getMyUnreadNotificationCount = asyncHandler(async (req, res) => {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', req.mobileUser.id)
    .eq('read', false);

  check(error, 'Failed to count unread notifications');

  res.json({
    success: true,
    data: { count: count || 0 },
  });
});

export const listMyNotifications = asyncHandler(async (req, res) => {
  const parsedLimit = Number.parseInt(req.query.pageSize, 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 100)
    : 50;

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', req.mobileUser.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  check(error, 'Failed to load your notifications');

  res.json({
    success: true,
    data: (data || []).map(serializeMobileNotification),
  });
});

export const markMyNotificationRead = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', req.params.id)
    .eq('recipient_id', req.mobileUser.id)
    .select('*')
    .maybeSingle();

  check(error, 'Failed to mark notification as read');

  if (!data) {
    throw new ApiError(404, 'Notification not found');
  }

  res.json({
    success: true,
    data: serializeMobileNotification(data),
  });
});

export const markAllMyNotificationsRead = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', req.mobileUser.id)
    .eq('read', false)
    .select('id');

  check(error, 'Failed to mark your notifications as read');

  res.json({
    success: true,
    data: { updatedCount: (data || []).length },
  });
});
