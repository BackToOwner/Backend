import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { serializeReport } from '../reports/reports.controller.js';
import { notifyMatchOwners } from '../notifications/mobile-match-notification.helper.js';

const confidence = (score) => score >= 95 ? 'Very High Confidence' : score >= 85 ? 'High Confidence' : 'Moderate Confidence';
function check(error, message) { if (error) { console.error(message, error); throw new ApiError(500, message); } }
async function serialize(row) {
  const [{ data: lost, error: le }, { data: found, error: fe }] = await Promise.all([
    supabase.from('reports').select('*').eq('id', row.lost_report_id).maybeSingle(),
    supabase.from('reports').select('*').eq('id', row.found_report_id).maybeSingle(),
  ]);
  check(le || fe, 'Failed to load reports for match');
  return { id: row.id, lostItem: serializeReport(lost), foundItem: serializeReport(found), matchScore: row.match_score, confidenceLabel: row.confidence_label, matchFactors: row.match_factors || [], status: row.status, createdAt: row.created_at, resolvedAt: row.resolved_at };
}
export const listMatches = asyncHandler(async (req, res) => {
  const status = req.query.status || 'all';
  let q = supabase.from('matches').select('*').order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q; check(error, 'Failed to load matches');
  res.json({ success: true, data: await Promise.all((data || []).map(serialize)) });
});
export const createMatch = asyncHandler(async (req, res) => {
  const { lostItemId, foundItemId, matchScore = 80, matchFactors = [] } = req.body;
  if (!lostItemId || !foundItemId) throw new ApiError(400, 'lostItemId and foundItemId are required');
  const score = Number(matchScore);
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new ApiError(400, 'matchScore must be between 0 and 100');
  const [{ data: lost, error: le }, { data: found, error: fe }] = await Promise.all([
    supabase.from('reports').select('id,type').eq('id', lostItemId).maybeSingle(),
    supabase.from('reports').select('id,type').eq('id', foundItemId).maybeSingle(),
  ]);
  check(le || fe, 'Failed to validate match reports');
  if (!lost || lost.type !== 'lost') throw new ApiError(404, 'lostItemId does not reference an existing lost report');
  if (!found || found.type !== 'found') throw new ApiError(404, 'foundItemId does not reference an existing found report');
  const { data, error } = await supabase.from('matches').insert({ lost_report_id: lostItemId, found_report_id: foundItemId, match_score: score, confidence_label: confidence(score), match_factors: matchFactors, status: 'pending_admin_approval' }).select('*').single();
  if (error?.code === '23505') throw new ApiError(409, 'A match already exists for these reports');
  check(error, 'Failed to create match'); res.status(201).json({ success: true, data: await serialize(data) });
});
export const approveMatch = asyncHandler(async (req, res) => {
  const { data: match, error: lookupError } = await supabase.from('matches').select('*').eq('id', req.params.id).maybeSingle();
  check(lookupError, 'Failed to load match'); if (!match) throw new ApiError(404, 'Match not found');
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase.from('matches').update({ status: 'approved', resolved_at: now }).eq('id', match.id).select('*').single();
  check(error, 'Failed to approve match');
  const [{ error: lostError }, { error: foundError }] = await Promise.all([
    supabase.from('reports').update({ status: 'matched', updated_at: now }).eq('id', match.lost_report_id),
    supabase.from('reports').update({ status: 'matched', updated_at: now }).eq('id', match.found_report_id),
  ]);
  check(lostError || foundError, 'Match approved, but one or more report statuses could not be updated');
  await notifyMatchOwners(
    [match.lost_report_id, match.found_report_id],
    'approved',
    match.id
  );
  res.json({ success: true, data: await serialize(updated) });
});
export const rejectMatch = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('matches').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', req.params.id).select('*').maybeSingle();
  check(error, 'Failed to reject match'); if (!data) throw new ApiError(404, 'Match not found');
  res.json({ success: true, data: await serialize(data) });
});
