import { db } from '../../db/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { newId } from '../../utils/id.js';
import { parseJsonSafe } from '../../utils/parseJson.js';

const REPORT_TYPES = ['lost', 'found'];
const REPORT_STATUSES = ['open', 'in_review', 'matched', 'returned', 'closed'];

function serializeReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    category: row.category,
    status: row.status,
    location: row.location,
    coordinates: row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null,
    distanceKm: row.distance_km,
    occurredAt: row.occurred_at,
    reward: row.reward,
    matched: Boolean(row.matched),
    matchedWithId: row.matched_with_id,
    matchScore: row.match_score,
    reporter: row.reporter_name ? { name: row.reporter_name, contact: row.reporter_contact } : null,
    finder: row.finder_name ? { name: row.finder_name, contact: row.finder_contact } : null,
    description: row.description,
    images: parseJsonSafe(row.images, []),
    verificationDetails: parseJsonSafe(row.verification_details, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/reports
export const listReports = asyncHandler(async (req, res) => {
  const { search = '', type = 'all', category = 'all', status = 'all', page = 1, pageSize = 20 } = req.query;

  const clauses = [];
  const params = {};

  if (type !== 'all') {
    clauses.push('type = @type');
    params.type = type;
  }
  if (category !== 'all') {
    clauses.push('category = @category');
    params.category = category;
  }
  if (status !== 'all') {
    clauses.push('status = @status');
    params.status = status;
  }
  if (search) {
    clauses.push(
      '(title LIKE @search OR location LIKE @search OR id LIKE @search OR reporter_name LIKE @search OR finder_name LIKE @search)'
    );
    params.search = `%${search}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Number(pageSize) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) AS count FROM reports ${where}`).get(params).count;
  const rows = db
    .prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });

  res.json({
    success: true,
    data: rows.map(serializeReport),
    pagination: { page: Number(page), pageSize: limit, total, totalPages: Math.ceil(total / limit) || 1 },
  });
});

// GET /api/reports/:id
export const getReport = asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!row) throw new ApiError(404, 'Report not found');
  res.json({ success: true, data: serializeReport(row) });
});

// POST /api/reports
export const createReport = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.title) throw new ApiError(400, 'title is required');
  if (!REPORT_TYPES.includes(b.type)) throw new ApiError(400, `type must be one of ${REPORT_TYPES.join(', ')}`);

  const id = b.id || newId('REP');
  db.prepare(
    `INSERT INTO reports (
      id, title, type, category, status, location, lat, lng, distance_km, occurred_at,
      reward, reporter_name, reporter_contact, finder_name, finder_contact, description, images, verification_details
    ) VALUES (
      @id, @title, @type, @category, @status, @location, @lat, @lng, @distance_km, @occurred_at,
      @reward, @reporter_name, @reporter_contact, @finder_name, @finder_contact, @description, @images, @verification_details
    )`
  ).run({
    id,
    title: b.title,
    type: b.type,
    category: b.category || 'other',
    status: REPORT_STATUSES.includes(b.status) ? b.status : 'open',
    location: b.location || 'Unknown Location',
    lat: b.coordinates?.lat ?? null,
    lng: b.coordinates?.lng ?? null,
    distance_km: b.distanceKm ?? 0,
    occurred_at: b.occurredAt || null,
    reward: b.reward ?? null,
    reporter_name: b.reporter?.name ?? null,
    reporter_contact: b.reporter?.contact ?? null,
    finder_name: b.finder?.name ?? null,
    finder_contact: b.finder?.contact ?? null,
    description: b.description || '',
    images: JSON.stringify(Array.isArray(b.images) ? b.images : []),
    verification_details: JSON.stringify(b.verificationDetails || {}),
  });

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: serializeReport(row) });
});

// PATCH /api/reports/:id
export const updateReport = asyncHandler(async (req, res) => {
  const existing = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!existing) throw new ApiError(404, 'Report not found');

  const b = req.body;
  if (b.type && !REPORT_TYPES.includes(b.type)) throw new ApiError(400, `type must be one of ${REPORT_TYPES.join(', ')}`);
  if (b.status && !REPORT_STATUSES.includes(b.status)) throw new ApiError(400, `status must be one of ${REPORT_STATUSES.join(', ')}`);

  const next = {
    title: b.title ?? existing.title,
    type: b.type ?? existing.type,
    category: b.category ?? existing.category,
    status: b.status ?? existing.status,
    location: b.location ?? existing.location,
    lat: b.coordinates?.lat ?? existing.lat,
    lng: b.coordinates?.lng ?? existing.lng,
    distance_km: b.distanceKm ?? existing.distance_km,
    occurred_at: b.occurredAt ?? existing.occurred_at,
    reward: b.reward ?? existing.reward,
    matched: b.matched != null ? (b.matched ? 1 : 0) : existing.matched,
    matched_with_id: b.matchedWithId ?? existing.matched_with_id,
    match_score: b.matchScore ?? existing.match_score,
    reporter_name: b.reporter?.name ?? existing.reporter_name,
    reporter_contact: b.reporter?.contact ?? existing.reporter_contact,
    finder_name: b.finder?.name ?? existing.finder_name,
    finder_contact: b.finder?.contact ?? existing.finder_contact,
    description: b.description ?? existing.description,
    images: b.images ? JSON.stringify(b.images) : existing.images,
    verification_details: b.verificationDetails ? JSON.stringify(b.verificationDetails) : existing.verification_details,
    id: existing.id,
  };

  db.prepare(
    `UPDATE reports SET
      title=@title, type=@type, category=@category, status=@status, location=@location, lat=@lat, lng=@lng,
      distance_km=@distance_km, occurred_at=@occurred_at, reward=@reward, matched=@matched,
      matched_with_id=@matched_with_id, match_score=@match_score, reporter_name=@reporter_name,
      reporter_contact=@reporter_contact, finder_name=@finder_name, finder_contact=@finder_contact,
      description=@description, images=@images, verification_details=@verification_details,
      updated_at=datetime('now')
    WHERE id=@id`
  ).run(next);

  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(existing.id);
  res.json({ success: true, data: serializeReport(row) });
});

// DELETE /api/reports/:id
export const deleteReport = asyncHandler(async (req, res) => {
  const result = db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  if (result.changes === 0) throw new ApiError(404, 'Report not found');
  res.json({ success: true, data: { id: req.params.id } });
});

export { serializeReport, REPORT_STATUSES, REPORT_TYPES };
