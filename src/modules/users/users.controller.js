import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function serialize(profile = {}, authUser = {}, counts = {}) {
  const metadata = authUser.user_metadata || {};
  const metadataName =
    metadata.full_name ||
    metadata.name ||
    [metadata.first_name, metadata.last_name].filter(Boolean).join(' ');

  const banned =
    authUser.banned_until &&
    new Date(authUser.banned_until).getTime() > Date.now();

  return {
    id: authUser.id || profile.id,
    name:
      profile.display_name ||
      [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
      metadataName ||
      authUser.email ||
      'Unnamed user',
    email: authUser.email || '',
    phone: profile.phone || authUser.phone || '',
    role: profile.role || 'user',
    avatar: profile.avatar_url || metadata.avatar_url || metadata.picture || null,
    itemsReported: counts.itemsReported ?? 0,
    itemsFound: counts.itemsFound ?? 0,
    status: profile.status || (banned ? 'banned' : 'active'),
    joinedAt: authUser.created_at || profile.created_at || null,
  };
}

function check(error, message) {
  if (error) {
    console.error(message, error);
    throw new ApiError(500, message);
  }
}

async function getAuthUsers() {
  const users = [];
  let page = 1;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    check(error, 'Failed to load authentication users');

    const batch = data?.users || [];
    users.push(...batch);

    if (batch.length < 1000) break;
    page++;
  }

  return users;
}

async function getReportCounts() {
  const countsByUser = new Map();
  let start = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('reports')
      .select('owner_user_id, type')
      .range(start, start + 999);

    check(error, 'Failed to load report counts');

    const batch = data || [];

    for (const report of batch) {
      if (!report.owner_user_id) continue;

      const counts = countsByUser.get(report.owner_user_id) || {
        itemsReported: 0,
        itemsFound: 0,
      };

      if (report.type === 'lost') counts.itemsReported++;
      if (report.type === 'found') counts.itemsFound++;

      countsByUser.set(report.owner_user_id, counts);
    }

    if (batch.length < 1000) break;
    start += 1000;
  }

  return countsByUser;
}

export const listUsers = asyncHandler(async (req, res) => {
  const { search = '', status = 'all' } = req.query;

  const [{ data: profiles, error }, authUsers, reportCounts] = await Promise.all([
    supabase.from('profiles').select('*'),
    getAuthUsers(),
    getReportCounts(),
  ]);

  check(error, 'Failed to load profiles');

  const profilesById = new Map(
    (profiles || []).map((profile) => [profile.id, profile])
  );

  let rows = authUsers.map((authUser) =>
    serialize(
      profilesById.get(authUser.id) || {},
      authUser,
      reportCounts.get(authUser.id)
    )
  );

  if (status !== 'all') {
    rows = rows.filter((user) => user.status === status);
  }

  const term = String(search).trim().toLowerCase();

  if (term) {
    rows = rows.filter((user) =>
      [user.name, user.email, user.id, user.role].some((value) =>
        String(value || '').toLowerCase().includes(term)
      )
    );
  }

  rows.sort(
    (a, b) =>
      new Date(b.joinedAt || 0).getTime() -
      new Date(a.joinedAt || 0).getTime()
  );

  res.json({ success: true, data: rows });
});

export const getUser = asyncHandler(async (req, res) => {
  const { data: authData, error: authError } =
    await supabase.auth.admin.getUserById(req.params.id);

  check(authError, 'Failed to load user account');

  if (!authData?.user) {
    throw new ApiError(404, 'User not found');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  check(error, 'Failed to load profile');

  res.json({
    success: true,
    data: serialize(profile || {}, authData.user),
  });
});

export const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!['active', 'suspended', 'banned'].includes(status)) {
    throw new ApiError(
      400,
      'status must be one of active, suspended, banned'
    );
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('*')
    .maybeSingle();

  check(error, 'Failed to update user status');

  if (!profile) {
    throw new ApiError(
      404,
      'User profile not found; status cannot be saved without a profile'
    );
  }

  const { data: authData, error: authError } =
    await supabase.auth.admin.getUserById(profile.id);

  check(authError, 'Failed to load user account');

  res.json({
    success: true,
    data: serialize(profile, authData.user || {}),
  });
});
