
import { supabase } from '../../config/supabase.js';
import { supabaseAuth } from '../../config/supabase-auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const REPORT_TYPES = ['lost', 'found'];
const REPORT_STATUSES = ['open', 'in_review', 'matched', 'returned', 'closed'];

function serializeReport(row, userId = null) {
  const location = [row.campus, row.area]
    .filter(Boolean)
    .join(' · ') || row.location || 'Unknown Location';

  return {
    id: row.id,
    title: row.title,
    type: row.type,
    category: row.category || 'other',
    location,
    campus: row.campus || '',
    area: row.area || '',
    itemColor: row.item_color || null,
    additionalDetails: row.additional_details ||
      (row.details
        ? row.details.includes('\n\n')
          ? row.details.split('\n\n').slice(1).join('\n\n') || null
          : row.details
        : null),
    description: row.details || '',
    status: row.status || 'open',
    matched: row.status === 'matched',
    reward: row.reward == null ? null : Number(row.reward),
    rewardCurrency: row.reward_currency || 'LKR',
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: row.latitude, lng: row.longitude }
        : null,
    distanceKm: null,
    images: row.image_url ? [row.image_url] : [],
    primaryImage: row.image_url || null,
    owner: row.owner_user_id
      ? {
          id: row.owner_user_id,
          name: row.owner_name || 'BackToOwner user',
        }
      : null,
    isMine: Boolean(userId && row.owner_user_id === userId),
    viewCount: 0,
    commentCount: 0,
    claimCount: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

async function getProfileName(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('first_name,last_name,display_name')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return (
    data.display_name ||
    [data.first_name, data.last_name].filter(Boolean).join(' ') ||
    null
  );
}

async function attachOwnerNames(rows) {
  const ownerIds = [...new Set(rows.map((row) => row.owner_user_id).filter(Boolean))];

  if (!ownerIds.length) return rows;

  const { data } = await supabase
    .from('profiles')
    .select('id,first_name,last_name,display_name')
    .in('id', ownerIds);

  const names = new Map(
    (data || []).map((profile) => [
      profile.id,
      profile.display_name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
        'BackToOwner user',
    ])
  );

  return rows.map((row) => ({
    ...row,
    owner_name: names.get(row.owner_user_id) || 'BackToOwner user',
  }));
}

export const listMobileReports = asyncHandler(async (req, res) => {
  // Identify the signed-in user when a valid bearer token is supplied.
  // Public report browsing still works without authentication.
  let userId = null;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (token) {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (!error && data.user) userId = data.user.id;
  }

  const pageSize = Math.min(
    Math.max(Number.parseInt(req.query.pageSize, 10) || 50, 1),
    100
  );

  let query = supabase
    .from('reports')
    .select('*')
    .is('deleted_at', null)
    .in('status', ['open', 'in_review', 'matched'])
    .order('created_at', { ascending: false })
    .limit(pageSize);

  if (req.query.type && REPORT_TYPES.includes(req.query.type)) {
    query = query.eq('type', req.query.type);
  }

  const { data, error } = await query;

  if (error) {
    throw new ApiError(500, `Could not load reports: ${error.message}`);
  }

  const rows = await attachOwnerNames(data || []);

  res.json({
    success: true,
    data: rows.map((row) => serializeReport(row, userId)),
  });
});

export const listMyMobileReports = asyncHandler(async (req, res) => {
  const pageSize = Math.min(
    Math.max(Number.parseInt(req.query.pageSize, 10) || 50, 1),
    100
  );

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('owner_user_id', req.mobileUser.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(pageSize);

  if (error) {
    throw new ApiError(500, `Could not load your reports: ${error.message}`);
  }

  const rows = await attachOwnerNames(data || []);

  res.json({
    success: true,
    data: rows.map((row) => serializeReport(row, req.mobileUser.id)),
  });
});

export const createMobileReport = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const type = body.type;
  const category =
    typeof body.category === 'string' ? body.category.trim() : '';

  if (!title) throw new ApiError(400, 'Report title is required');
  if (!REPORT_TYPES.includes(type)) {
    throw new ApiError(400, 'Report type must be lost or found');
  }
  if (!category) throw new ApiError(400, 'Report category is required');

  const campus = typeof body.campus === 'string' ? body.campus.trim() : '';
  const area = typeof body.area === 'string' ? body.area.trim() : '';
  const location =
    typeof body.location === 'string' ? body.location.trim() : '';

  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const additionalDetails =
    typeof body.additionalDetails === 'string'
      ? body.additionalDetails.trim()
      : '';

  const reward =
    body.reward == null || body.reward === ''
      ? null
      : Number(body.reward);

  console.log('[REWARD TRACE backend received]', {
    rawReward: body.reward,
    rawType: typeof body.reward,
    parsedReward: reward,
    contentType: req.headers['content-type'],
  });

  if (reward !== null && (!Number.isFinite(reward) || reward < 0)) {
    throw new ApiError(400, 'Reward must be a valid non-negative amount');
  }

  const latitude = body.lat == null ? null : Number(body.lat);
  const longitude = body.lng == null ? null : Number(body.lng);

  if (
    (latitude !== null && !Number.isFinite(latitude)) ||
    (longitude !== null && !Number.isFinite(longitude)) ||
    (latitude !== null && (latitude < -90 || latitude > 90)) ||
    (longitude !== null && (longitude < -180 || longitude > 180))
  ) {
    throw new ApiError(400, 'Invalid report coordinates');
  }

  const now = new Date().toISOString();

  const reportInsert = {
    owner_user_id: req.mobileUser.id,
    title,
    type,
    category,
    status: 'open',
    campus: campus || null,
    area: area || null,
    location: location || [campus, area].filter(Boolean).join(' · ') || null,
    details: [description, additionalDetails].filter(Boolean).join('\n\n') || null,
    item_color:
      typeof body.itemColor === 'string' ? body.itemColor.trim() || null : null,
    reward,
    reward_currency: 'LKR',
    latitude,
    longitude,
    occurred_at:
      typeof body.occurredAt === 'string' ? body.occurredAt : null,
    source: 'mobile',
    created_at: now,
    updated_at: now,
  };

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .insert(reportInsert)
    .select('*')
    .single();

  if (reportError) {
    throw new ApiError(500, `Could not create report: ${reportError.message}`);
  }

  const itemTable = type === 'lost' ? 'lost_items' : 'found_items';

  const itemInsert = {
    id: report.id,
    report_id: report.id,
    title,
    campus: campus || null,
    area: area || null,
    details: [description, additionalDetails].filter(Boolean).join('\n\n') || null,
    category,
    image_url: null,
    created_at: now,
    updated_at: now,
    ...(type === 'lost' ? { status: 'active' } : {}),
  };

  const { error: itemError } = await supabase
    .from(itemTable)
    .insert(itemInsert);

  if (itemError) {
    // Avoid leaving a report that has no linked AI item row.
    await supabase
      .from('reports')
      .delete()
      .eq('id', report.id)
      .eq('owner_user_id', req.mobileUser.id);

    throw new ApiError(
      500,
      `Report could not be linked to the AI item table: ${itemError.message}`
    );
  }

  const ownerName = await getProfileName(req.mobileUser.id);

  res.status(201).json({
    success: true,
    data: serializeReport(
      { ...report, owner_name: ownerName },
      req.mobileUser.id
    ),
  });
});

export const uploadMobileReportImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Please select an image to upload');
  }

  const { id } = req.params;
  const userId = req.mobileUser.id;

  const allowedTypes = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  const extension = allowedTypes[req.file.mimetype];

  if (!extension) {
    throw new ApiError(400, 'Only JPG, PNG and WebP images are allowed');
  }

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (reportError) {
    throw new ApiError(500, `Could not load report: ${reportError.message}`);
  }

  if (!report) {
    throw new ApiError(404, 'Report not found or you do not own it');
  }

  const bucket = report.type === 'lost' ? 'lost-items' : 'found-items';
  const objectPath =
    `${report.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const uploadedAt = new Date().toISOString();

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (uploadError) {
    throw new ApiError(500, `Image upload failed: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(objectPath);

  const imageUrl = publicUrlData.publicUrl;

  // Keep the existing single-image fields compatible with the current app.
  const { data: updatedReport, error: updateReportError } = await supabase
    .from('reports')
    .update({
      image_url: imageUrl,
      updated_at: uploadedAt,
    })
    .eq('id', report.id)
    .eq('owner_user_id', userId)
    .select('*')
    .single();

  if (updateReportError) {
    await supabase.storage.from(bucket).remove([objectPath]);
    throw new ApiError(500, `Could not save report image URL: ${updateReportError.message}`);
  }

  const itemTable = report.type === 'lost' ? 'lost_items' : 'found_items';

  const { error: itemError } = await supabase
    .from(itemTable)
    .update({
      image_url: imageUrl,
      updated_at: uploadedAt,
    })
    .eq('report_id', report.id);

  if (itemError) {
    await supabase.from('reports')
      .update({
        image_url: report.image_url,
        updated_at: report.updated_at,
      })
      .eq('id', report.id)
      .eq('owner_user_id', userId);

    await supabase.storage.from(bucket).remove([objectPath]);
    throw new ApiError(500, `Could not update linked AI item image: ${itemError.message}`);
  }

  // Insert the image record only after the existing image URL fields are updated.
  const { error: imageRecordError } = await supabase
    .from('report_images')
    .insert({
      report_id: report.id,
      image_url: imageUrl,
      storage_key: `${bucket}/${objectPath}`,
      is_primary: true,
      sort_order: 0,
      uploaded_by: userId,
    });

  if (imageRecordError) {
    // Roll back the URL changes and storage object if the image record cannot be saved.
    await supabase.from(itemTable)
      .update({
        image_url: null,
        updated_at: uploadedAt,
      })
      .eq('report_id', report.id)
      .eq('image_url', imageUrl);

    await supabase.from('reports')
      .update({
        image_url: report.image_url,
        updated_at: report.updated_at,
      })
      .eq('id', report.id)
      .eq('owner_user_id', userId);

    await supabase.storage.from(bucket).remove([objectPath]);

    throw new ApiError(500, `Could not save report_images record: ${imageRecordError.message}`);
  }

  // Generate embeddings for the existing linked AI item.
  // Do not call /lost-items or /found-items here: those endpoints insert rows.
  let aiEmbeddingsGenerated = false;

  try {
    const aiServiceUrl = (
      process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000'
    ).replace(/\/+$/, '');

    const aiResponse = await fetch(
      `${aiServiceUrl}/embeddings/${report.type}/${report.id}`,
      { method: 'POST', signal: AbortSignal.timeout(45000) }
    );

    const aiResult = await aiResponse.json().catch(() => ({}));

    if (!aiResponse.ok) {
      throw new Error(aiResult.detail || `AI service returned ${aiResponse.status}`);
    }

    aiEmbeddingsGenerated = true;
  } catch (error) {
    // Keep the successfully uploaded report; log the AI failure for diagnosis.
    console.error(
      `AI embedding generation failed for report ${report.id}:`,
      error.message
    );
  }

  const ownerName = await getProfileName(userId);

  res.status(200).json({
    success: true,
    aiEmbeddingsGenerated,
    data: serializeReport(
      { ...updatedReport, owner_name: ownerName },
      userId
    ),
  });
});

export const deleteMobileReport = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.mobileUser.id;

  const { data: report, error: findError } = await supabase
    .from('reports')
    .select('id, type, owner_user_id')
    .eq('id', id)
    .eq('owner_user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (findError) {
    throw new ApiError(500, `Could not find report: ${findError.message}`);
  }

  if (!report) {
    throw new ApiError(404, 'Report not found or you do not own it');
  }

  // Remove saved matches associated with this report.
  const { error: matchesError } = await supabase
    .from('matches')
    .delete()
    .or(`lost_report_id.eq.${id},found_report_id.eq.${id}`);

  if (matchesError) {
    throw new ApiError(500, `Could not remove report matches: ${matchesError.message}`);
  }

  // Remove the corresponding AI item so it cannot be matched again.
  const itemTable = report.type === 'lost' ? 'lost_items' : 'found_items';
  const { error: itemError } = await supabase
    .from(itemTable)
    .delete()
    .eq('report_id', id);

  if (itemError) {
    throw new ApiError(500, `Could not remove linked AI item: ${itemError.message}`);
  }

  // Keep the report row to preserve references from other database records.
  const { error: updateError } = await supabase
    .from('reports')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('owner_user_id', userId);

  if (updateError) {
    throw new ApiError(500, `Could not delete report: ${updateError.message}`);
  }

  return res.status(200).json({
    success: true,
    data: { id, deleted: true },
    message: 'Report deleted successfully',
  });
});
