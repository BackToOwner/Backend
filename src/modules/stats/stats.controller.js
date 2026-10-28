import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function check(error, message) {
  if (error) {
    console.error(message, error);
    throw new ApiError(500, message);
  }
}

async function count(table, filters = []) {
  let q = supabase.from(table).select('*', {
    count: 'exact',
    head: true,
  });

  for (const [method, ...args] of filters) {
    q = q[method](...args);
  }

  const { count: n, error } = await q;

  check(error, `Failed to count ${table}`);

  return n || 0;
}

export const overview = asyncHandler(async (_req, res) => {
  const [
    itemsClosed,
    activeCases,
    totalReports,
    pendingMatches,
    registeredUsers,
    activeFinders,
    reportRows,
    recoveryRows,
  ] = await Promise.all([
    count('reports', [
      ['eq', 'status', 'closed'],
      ['is', 'deleted_at', null],
    ]),

    count('reports', [
      ['in', 'status', ['open', 'in_review']],
      ['is', 'deleted_at', null],
    ]),

    count('reports', [
      ['is', 'deleted_at', null],
    ]),

    count('matches', [
      ['eq', 'status', 'pending_admin_approval'],
    ]),

    count('profiles'),

    count('profiles', [
      ['eq', 'status', 'active'],
    ]),

    supabase
      .from('reports')
      .select('reward')
      .is('deleted_at', null),

    supabase
      .from('reports')
      .select('created_at, resolved_at')
      .eq('status', 'closed')
      .is('deleted_at', null)
      .not('resolved_at', 'is', null),
  ]);

  check(reportRows.error, 'Failed to calculate reward statistics');
  check(recoveryRows.error, 'Failed to calculate recovery time');

  const totalRewards = (reportRows.data || []).reduce(
    (sum, report) => sum + (Number(report.reward) || 0),
    0
  );

  const recoveryDurations = (recoveryRows.data || [])
    .map((report) => {
      const createdAt = new Date(report.created_at).getTime();
      const resolvedAt = new Date(report.resolved_at).getTime();

      if (
        !Number.isFinite(createdAt) ||
        !Number.isFinite(resolvedAt) ||
        resolvedAt < createdAt
      ) {
        return null;
      }

      return resolvedAt - createdAt;
    })
    .filter((duration) => duration !== null);

  const avgResolutionTime =
    recoveryDurations.length > 0
      ? Math.round(
          recoveryDurations.reduce((sum, duration) => sum + duration, 0) /
            recoveryDurations.length /
            (1000 * 60 * 60)
        )
      : null;

  res.json({
    success: true,
    data: {
      itemsClosed,
      activeCases,
      successRate: totalReports
        ? Number(((itemsClosed / totalReports) * 100).toFixed(1))
        : 0,
      pendingMatches,
      totalRewardsPaid: totalRewards,
      avgResolutionTime,
      registeredUsers,
      activeFinders,
    },
  });
});

export const breakdown = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('reports')
    .select('category,type,status,created_at,resolved_at')
    .is('deleted_at', null);

  check(error, 'Failed to load report statistics');

  const rows = data || [];
  const categoryCounts = new Map();

  for (const row of rows) {
    const category = row.category || 'unknown';
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  const totalCategorized = [...categoryCounts.values()].reduce(
    (sum, value) => sum + value,
    0
  );

  const byCategory = [...categoryCounts]
    .map(([category, count]) => ({
      category,
      count,
      percentage: totalCategorized
        ? Number(((count / totalCategorized) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const group = (key) => {
    const counts = new Map();
    for (const row of rows) {
      const value = row[key] || 'unknown';
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts].map(([value, count]) => ({ [key]: value, count }));
  };

  const byType = group('type');
  const byStatus = group('status');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - 6);

  const dailyCounts = new Map();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    dailyCounts.set(key, { day: key, lost: 0, closed: 0 });
  }

  for (const row of rows) {
    if (row.type === 'lost' && row.created_at) {
      const key = new Date(row.created_at).toISOString().slice(0, 10);
      if (dailyCounts.has(key)) dailyCounts.get(key).lost += 1;
    }

    if (row.status === 'closed' && row.resolved_at) {
      const key = new Date(row.resolved_at).toISOString().slice(0, 10);
      if (dailyCounts.has(key)) dailyCounts.get(key).closed += 1;
    }
  }

  const last7Days = [...dailyCounts.values()];
  const weeklyClosed = last7Days.reduce(
    (sum, day) => sum + day.closed,
    0
  );

  res.json({
    success: true,
    data: {
      byCategory,
      byType,
      byStatus,
      last7Days,
      weeklyClosed,
    },
  });
});

// Public, read-only aggregate stats for the mobile dashboard.
// Keep this response limited to the three KPIs used by Flutter.
export const mobileHome = asyncHandler(async (_req, res) => {
  const reportFilters = [['is', 'deleted_at', null]];

  const [itemsClosed, activeCases, totalReports] = await Promise.all([
    count('reports', [
      ['eq', 'status', 'closed'],
      ...reportFilters,
    ]),
    count('reports', [
      ['in', 'status', ['open', 'in_review']],
      ...reportFilters,
    ]),
    count('reports', reportFilters),
  ]);

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: {
      itemsClosed,
      activeCases,
      successRate: totalReports
        ? Number(((itemsClosed / totalReports) * 100).toFixed(1))
        : 0,
    },
  });
});
