import { db, withTransaction } from '../../db/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { newId } from '../../utils/id.js';
import { parseJsonSafe } from '../../utils/parseJson.js';
import { serializeReport } from '../reports/reports.controller.js';

function getConfidenceLabel(score) {
  if (score >= 95) return 'Very High Confidence';
  if (score >= 85) return 'High Confidence';
  return 'Moderate Confidence';
}

function serialize(row) {
  const lostItem = db.prepare('SELECT * FROM reports WHERE id = ?').get(row.lost_item_id);
  const foundItem = db.prepare('SELECT * FROM reports WHERE id = ?').get(row.found_item_id);
  return {
    id: row.id,
    lostItem: serializeReport(lostItem),
    foundItem: serializeReport(foundItem),
    matchScore: row.match_score,
    confidenceLabel: row.confidence_label,
    matchFactors: parseJsonSafe(row.match_factors, []),
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

// GET /api/matches
export const listMatches = asyncHandler(async (req, res) => {
  const { status = 'all' } = req.query;
  const rows =
    status === 'all'
      ? db.prepare('SELECT * FROM matches ORDER BY created_at DESC').all()
      : db.prepare('SELECT * FROM matches WHERE status = ? ORDER BY created_at DESC').all(status);
  res.json({ success: true, data: rows.map(serialize) });
});

// POST /api/matches  (create a candidate match between a lost and a found report)
export const createMatch = asyncHandler(async (req, res) => {
  const { lostItemId, foundItemId, matchScore = 80, matchFactors = [] } = req.body;
  if (!lostItemId || !foundItemId) throw new ApiError(400, 'lostItemId and foundItemId are required');

  const lost = db.prepare('SELECT id FROM reports WHERE id = ? AND type = ?').get(lostItemId, 'lost');
  const found = db.prepare('SELECT id FROM reports WHERE id = ? AND type = ?').get(foundItemId, 'found');
  if (!lost) throw new ApiError(404, 'lostItemId does not reference an existing lost report');
  if (!found) throw new ApiError(404, 'foundItemId does not reference an existing found report');

  const id = newId('MATCH');
  db.prepare(
    'INSERT INTO matches (id, lost_item_id, found_item_id, match_score, confidence_label, match_factors) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, lostItemId, foundItemId, matchScore, getConfidenceLabel(matchScore), JSON.stringify(matchFactors));

  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: serialize(row) });
});

// POST /api/matches/:id/approve
export const approveMatch = asyncHandler(async (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) throw new ApiError(404, 'Match not found');

  const tx = withTransaction(() => {
    db.prepare("UPDATE matches SET status='approved', resolved_at=datetime('now') WHERE id=?").run(match.id);
    db.prepare(
      "UPDATE reports SET status='matched', matched=1, matched_with_id=?, match_score=?, updated_at=datetime('now') WHERE id=?"
    ).run(match.found_item_id, match.match_score, match.lost_item_id);
    db.prepare(
      "UPDATE reports SET status='matched', matched=1, matched_with_id=?, match_score=?, updated_at=datetime('now') WHERE id=?"
    ).run(match.lost_item_id, match.match_score, match.found_item_id);
  });
  tx();

  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
  res.json({ success: true, data: serialize(row) });
});

// POST /api/matches/:id/reject
export const rejectMatch = asyncHandler(async (req, res) => {
  const result = db
    .prepare("UPDATE matches SET status='rejected', resolved_at=datetime('now') WHERE id=?")
    .run(req.params.id);
  if (result.changes === 0) throw new ApiError(404, 'Match not found');

  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: serialize(row) });
});
