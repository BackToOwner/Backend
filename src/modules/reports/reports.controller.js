import { supabase } from '../../config/supabase.js';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notifyMatchOwners } from '../notifications/mobile-match-notification.helper.js';

const REPORT_TYPES = ['lost', 'found'];

const REPORT_STATUSES = [
  'open',
  'in_review',
  'matched',
  'returned',
  'closed',
];

/**
 * Convert a shared Supabase report into the dashboard format.
 */
function mapItem(row, type = row?.type || 'lost') {
  if (!row) return null;

  const location =
    [row.campus, row.area].filter(Boolean).join(' · ') ||
    row.location ||
    'Unknown Location';

  return {
    id: row.id,
    title: row.title,
    type,
    category: row.category || 'other',
    location,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: row.latitude, lng: row.longitude }
        : null,
    distanceKm: 0,
    occurredAt: row.occurred_at || null,
    reward: row.reward ?? null,
    rewardCurrency: row.reward_currency || 'LKR',
    status: row.status || 'open',
    matched: row.status === 'matched',
    matchedWithId: null,
    matchScore: null,
    reporter: null,
    finder: null,
    description: row.details || '',
    images: row.image_url ? [row.image_url] : [],
    verificationDetails: {},
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

/**
 * Retained for matches.controller.js compatibility.
 */
function serializeReport(row) {
  if (!row) return null;

  return mapItem(row, row.type || 'lost');
}

/**
 * Load a report from the shared reports table.
 */
async function loadReport(id) {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('Supabase report lookup failed:', error);
    throw new ApiError(500, 'Failed to load report');
  }

  return data;
}

/**
 * GET /api/reports
 * List reports from the shared Supabase reports table.
 */
export const listReports = asyncHandler(async (req, res) => {
  const {
    search = '',
    type = 'all',
    category = 'all',
    status = 'all',
    page = 1,
    pageSize = 20,
  } = req.query;

  if (type !== 'all' && !REPORT_TYPES.includes(type)) {
    throw new ApiError(
      400,
      `type must be one of all, ${REPORT_TYPES.join(', ')}`
    );
  }

  if (status !== 'all' && !REPORT_STATUSES.includes(status)) {
    throw new ApiError(
      400,
      `status must be one of all, ${REPORT_STATUSES.join(', ')}`
    );
  }

  const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(pageSize, 10) || 20, 1),
    100
  );

  let query = supabase
    .from('reports')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (type !== 'all') query = query.eq('type', type);
  if (category !== 'all') query = query.eq('category', category);
  if (status !== 'all') query = query.eq('status', status);

  const normalizedSearch = String(search).trim();

  if (normalizedSearch) {
    const safeSearch = normalizedSearch.replace(/[,%()]/g, ' ');
    query = query.or(
      `title.ilike.%${safeSearch}%,details.ilike.%${safeSearch}%,location.ilike.%${safeSearch}%,campus.ilike.%${safeSearch}%,area.ilike.%${safeSearch}%`
    );
  }

  const from = (currentPage - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error('Supabase reports list failed:', error);
    throw new ApiError(500, 'Failed to load reports');
  }

  const total = count || 0;

  res.json({
    success: true,
    data: (data || []).map((row) => serializeReport(row)),
    pagination: {
      page: currentPage,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
});

/**
 * GET /api/reports/:id
 */
export const getReport = asyncHandler(async (req, res) => {
  const report = await loadReport(req.params.id);

  if (!report) {
    throw new ApiError(404, 'Report not found');
  }

  res.json({
    success: true,
    data: serializeReport(report),
  });
});

/**
 * POST /api/reports
 * Create a report and its corresponding lost/found item record.
 */
export const createReport = asyncHandler(async (req, res) => {
  const b = req.body || {};

  if (!b.title || !String(b.title).trim()) {
    throw new ApiError(400, 'title is required');
  }

  if (!REPORT_TYPES.includes(b.type)) {
    throw new ApiError(
      400,
      `type must be one of ${REPORT_TYPES.join(', ')}`
    );
  }

  const status = b.status || 'open';

  if (!REPORT_STATUSES.includes(status)) {
    throw new ApiError(
      400,
      `status must be one of ${REPORT_STATUSES.join(', ')}`
    );
  }

  const now = new Date().toISOString();

  const reportPayload = {
    title: String(b.title).trim(),
    type: b.type,
    category: b.category || 'other',
    status,
    location: b.location || null,
    campus: b.campus || null,
    area: b.area || null,
    details: b.details ?? b.description ?? null,
    image_url: b.image_url ?? b.imageUrl ?? null,
    source: 'admin',
    created_at: now,
    updated_at: now,
  };

  const { data: report, error: createError } = await supabase
    .from('reports')
    .insert(reportPayload)
    .select('*')
    .single();

  if (createError) {
    console.error('Supabase report creation failed:', createError);
    throw new ApiError(500, 'Failed to create report');
  }

  const itemTable =
    report.type === 'lost' ? 'lost_items' : 'found_items';

  const itemPayload = {
    id: report.id,
    report_id: report.id,
    title: report.title,
    campus: report.campus,
    area: report.area,
    details: report.details,
    category: report.category,
    image_url: report.image_url,
    created_at: report.created_at,
    updated_at: report.updated_at,
  };

  if (report.type === 'lost') {
    itemPayload.status = report.status;
  }

  const { error: itemError } = await supabase
    .from(itemTable)
    .insert(itemPayload);

  if (itemError) {
    console.error('Supabase item creation failed:', itemError);

    // Compensate for the failed second insert.
    // This targets only the report just created.
    const { error: cleanupError } = await supabase
      .from('reports')
      .delete()
      .eq('id', report.id);

    if (cleanupError) {
      console.error('Failed to clean up incomplete report:', cleanupError);
    }

    throw new ApiError(
      500,
      'Failed to create the corresponding item record'
    );
  }

  // Create an admin notification after both report records are saved.
  const notificationTitle =
    report.type === 'lost' ? 'New Lost Report' : 'New Found Report';

  const reportLocation =
    [report.campus, report.area].filter(Boolean).join(' · ') ||
    report.location ||
    'Location not specified';

  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      id: randomUUID(),
      title: notificationTitle,
      message: `${report.title} — ${reportLocation}`,
      type: 'info',
      priority: 'normal',
      read: false,
      meta: {
        reportId: report.id,
        reportType: report.type,
        category: report.category,
      },
      created_at: new Date().toISOString(),
    });

  // Notification failure must not turn a successful report into a failed request.
  if (notificationError) {
    console.error(
      'Report was created, but its notification could not be saved:',
      notificationError
    );
  }

  res.status(201).json({
    success: true,
    data: serializeReport(report),
  });
});

/**
 * PATCH /api/reports/:id
 * Update the shared report and synchronize its item record.
 */
export const updateReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const b = req.body || {};

  if (b.status !== undefined && !REPORT_STATUSES.includes(b.status)) {
    throw new ApiError(
      400,
      `status must be one of ${REPORT_STATUSES.join(', ')}`
    );
  }

  // Matching must go through POST /api/matches/:id/approve.
  // A report status update alone must never create a matched case.
  if (b.status === 'matched') {
    throw new ApiError(
      409,
      'Reports can only be marked matched by approving a persistent match.'
    );
  }

  if (b.type !== undefined && !REPORT_TYPES.includes(b.type)) {
    throw new ApiError(
      400,
      `type must be one of ${REPORT_TYPES.join(', ')}`
    );
  }

  const existing = await loadReport(id);

  if (!existing) {
    throw new ApiError(404, 'Report not found');
  }

  if (b.type !== undefined && b.type !== existing.type) {
    throw new ApiError(400, 'Changing a report type is not supported');
  }

  const updates = {};
  const fields = [
    'title',
    'category',
    'campus',
    'area',
    'details',
    'image_url',
    'location',
    'status',
    'reward',
    'reward_currency',
    'latitude',
    'longitude',
    'occurred_at',
  ];

  for (const field of fields) {
    if (b[field] !== undefined) {
      updates[field] = b[field];
    }
  }

  if (b.description !== undefined && b.details === undefined) {
    updates.details = b.description;
  }

  if (b.imageUrl !== undefined && b.image_url === undefined) {
    updates.image_url = b.imageUrl;
  }

  if (updates.status === 'closed') {
    throw new ApiError(
      409,
      'Use the close-case endpoint; both participants must confirm the return first'
    );
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, 'No supported fields provided to update');
  }

  const now = new Date().toISOString();

  updates.updated_at = now;

  if (updates.status === 'returned') {
    updates.resolved_at = existing.resolved_at || now;
  } else if (
    updates.status !== undefined &&
    existing.status === 'returned'
  ) {
    updates.resolved_at = null;
  }

  // Find the exact approved pair before changing the selected report.
  let partnerIds = [];
  let approvedMatches = [];

  if (updates.status === 'returned') {
    const { data: matches, error: matchLookupError } = await supabase
      .from('matches')
      .select('id, lost_report_id, found_report_id')
      .eq('status', 'approved')
      .or(`lost_report_id.eq.${id},found_report_id.eq.${id}`);

    approvedMatches = matches || [];

    if (matchLookupError) {
      console.error('Failed to find the approved match for returned report:', matchLookupError);
      throw new ApiError(500, 'Could not verify the matched case; no report was changed');
    }

    partnerIds = [
      ...new Set(
        (approvedMatches || [])
          .map((match) =>
            match.lost_report_id === id
              ? match.found_report_id
              : match.lost_report_id
          )
          .filter(Boolean)
      ),
    ];

    if (existing.status === 'matched' && partnerIds.length === 0) {
      throw new ApiError(
        409,
        'This report is marked matched, but has no approved match link. Approve or repair the exact match before closing the case.'
      );
    }
  }

  const { data: report, error: updateError } = await supabase
    .from('reports')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();

  if (updateError) {
    console.error('Supabase report update failed:', updateError);
    throw new ApiError(500, 'Failed to update report');
  }

  if (!report) {
    throw new ApiError(404, 'Report not found');
  }

  // Close each exact approved partner without deleting report history.
  for (const partnerId of partnerIds) {
    const { error: partnerUpdateError } = await supabase
      .from('reports')
      .update({
        status: 'returned',
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', partnerId)
      .is('deleted_at', null);

    if (partnerUpdateError) {
      console.error('Failed to close matched partner report:', partnerUpdateError);
      throw new ApiError(500, 'Report returned, but its matched partner could not be closed');
    }
  }

  const itemTable =
    existing.type === 'lost' ? 'lost_items' : 'found_items';

  const itemUpdates = {};

  for (const field of [
    'title',
    'category',
    'campus',
    'area',
    'details',
    'image_url',
  ]) {
    if (updates[field] !== undefined) {
      itemUpdates[field] = updates[field];
    }
  }

  if (existing.type === 'lost' && updates.status !== undefined) {
    itemUpdates.status = updates.status;
  }

  if (Object.keys(itemUpdates).length > 0) {
    itemUpdates.updated_at = updates.updated_at;

    const { error: itemUpdateError } = await supabase
      .from(itemTable)
      .update(itemUpdates)
      .eq('report_id', id);

    if (itemUpdateError) {
      console.error('Supabase item synchronization failed:', itemUpdateError);
      throw new ApiError(
        500,
        'Report updated, but item synchronization failed'
      );
    }
  }

  if (updates.status === 'returned') {
    for (const partnerId of partnerIds) {
      const approvedMatch = approvedMatches.find(
        (match) =>
          (match.lost_report_id === id &&
            match.found_report_id === partnerId) ||
          (match.found_report_id === id &&
            match.lost_report_id === partnerId)
      );

      await notifyMatchOwners(
        [id, partnerId],
        'returned',
        approvedMatch?.id ?? null
      );
    }
  }

  res.json({
    success: true,
    data: serializeReport(report),
  });
});


/**
 * GET /api/reports/:id/return-confirmation
 * Admin-only progress; does not access private chat messages.
 */
export const getReturnConfirmationProgress = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const report = await loadReport(id);

  if (!report) throw new ApiError(404, 'Report not found');

  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('id, lost_report_id, found_report_id, status')
    .eq('status', 'approved')
    .or(`lost_report_id.eq.${id},found_report_id.eq.${id}`);

  if (matchError) {
    console.error('Failed to load approved match for confirmation progress:', matchError);
    throw new ApiError(500, 'Failed to load case confirmation progress');
  }

  if (!matches || matches.length === 0) {
    throw new ApiError(404, 'No approved match exists for this report');
  }

  if (matches.length !== 1) {
    throw new ApiError(409, 'Multiple approved matches exist for this report; resolve the ambiguity first');
  }

  const match = matches[0];
  const reportIds = [match.lost_report_id, match.found_report_id];

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, owner_user_id, status')
    .in('id', reportIds)
    .is('deleted_at', null);

  if (reportsError) {
    console.error('Failed to load reports for confirmation progress:', reportsError);
    throw new ApiError(500, 'Failed to verify case participants');
  }

  const lost = (reports || []).find((r) => r.id === match.lost_report_id);
  const found = (reports || []).find((r) => r.id === match.found_report_id);

  if (!lost || !found) throw new ApiError(404, 'Both matched reports must exist');

  const participantIds = [...new Set([lost.owner_user_id, found.owner_user_id].filter(Boolean))];

  const { data: confirmations, error: confirmationError } = await supabase
    .from('match_return_confirmations')
    .select('user_id')
    .eq('match_id', match.id);

  if (confirmationError) {
    console.error('Failed to load return confirmations:', confirmationError);
    throw new ApiError(500, 'Failed to load case confirmation progress');
  }

  const confirmedCount = new Set(
    (confirmations || [])
      .map((row) => row.user_id)
      .filter((userId) => participantIds.includes(userId))
  ).size;

  res.json({
    success: true,
    data: {
      reportId: id,
      matchId: match.id,
      confirmedCount,
      totalParticipants: 2,
      canClose:
        participantIds.length === 2 &&
        confirmedCount === 2 &&
        lost.status === 'returned' &&
        found.status === 'returned',
      reports: {
        lostStatus: lost.status,
        foundStatus: found.status,
      },
    },
  });
});

/**
 * POST /api/reports/:id/close-case
 * Close both linked reports only after both owners confirm the return.
 */
export const closeMatchedCase = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const report = await loadReport(id);

  if (!report) throw new ApiError(404, 'Report not found');

  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('id, lost_report_id, found_report_id, status')
    .eq('status', 'approved')
    .or(`lost_report_id.eq.${id},found_report_id.eq.${id}`);

  if (matchError) {
    console.error('Failed to load approved match for case closure:', matchError);
    throw new ApiError(500, 'Failed to verify the matched case');
  }

  if (!matches || matches.length === 0) {
    throw new ApiError(409, 'This report has no approved match to close');
  }

  if (matches.length !== 1) {
    throw new ApiError(409, 'Multiple approved matches exist; resolve the ambiguity before closing');
  }

  const match = matches[0];
  const reportIds = [match.lost_report_id, match.found_report_id];

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, owner_user_id, status')
    .in('id', reportIds)
    .is('deleted_at', null);

  if (reportsError) {
    console.error('Failed to load reports for case closure:', reportsError);
    throw new ApiError(500, 'Failed to verify case participants');
  }

  const lost = (reports || []).find((r) => r.id === match.lost_report_id);
  const found = (reports || []).find((r) => r.id === match.found_report_id);

  if (!lost || !found) throw new ApiError(404, 'Both matched reports must exist');

  const participantIds = [...new Set([lost.owner_user_id, found.owner_user_id].filter(Boolean))];

  if (participantIds.length !== 2) {
    throw new ApiError(409, 'Case closure requires two distinct report owners');
  }

  if (lost.status !== 'returned' || found.status !== 'returned') {
    throw new ApiError(409, 'Both reports must be marked returned before the case can be closed');
  }

  const { data: confirmations, error: confirmationError } = await supabase
    .from('match_return_confirmations')
    .select('user_id')
    .eq('match_id', match.id);

  if (confirmationError) {
    console.error('Failed to verify return confirmations:', confirmationError);
    throw new ApiError(500, 'Failed to verify return confirmations');
  }

  const confirmedIds = new Set(
    (confirmations || [])
      .map((row) => row.user_id)
      .filter((userId) => participantIds.includes(userId))
  );

  if (confirmedIds.size !== 2) {
    throw new ApiError(409, 'Both participants must confirm the return before the case can be closed');
  }

  const now = new Date().toISOString();

  const { data: closedReports, error: closeError } = await supabase
    .from('reports')
    .update({
      status: 'closed',
      resolved_at: now,
      updated_at: now,
    })
    .in('id', reportIds)
    .is('deleted_at', null)
    .select('id, status');

  if (closeError) {
    console.error('Failed to close matched reports:', closeError);
    throw new ApiError(500, 'Failed to close the matched case');
  }

  if (!closedReports || closedReports.length !== 2) {
    throw new ApiError(500, 'Could not confirm that both reports were closed; please check their statuses');
  }

  await notifyMatchOwners(reportIds, 'closed', match.id);

  res.json({
    success: true,
    data: {
      matchId: match.id,
      status: 'closed',
      closedReportIds: closedReports.map((r) => r.id),
      confirmedCount: 2,
      totalParticipants: 2,
    },
  });
});

/**
 * DELETE /api/reports/:id
 * Soft-delete a report to preserve related claims, matches and history.
 */
export const deleteReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();

  const { data: report, error } = await supabase
    .from('reports')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Supabase report soft-delete failed:', error);
    throw new ApiError(500, 'Failed to delete report');
  }

  if (!report) {
    throw new ApiError(404, 'Report not found');
  }

  res.json({
    success: true,
    data: { id: report.id },
  });
});

/**
 * Exports used by other controllers.
 */
export {
  mapItem,
  serializeReport,
  REPORT_STATUSES,
  REPORT_TYPES,
};
