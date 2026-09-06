import { db } from '../../db/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    avatar: row.avatar,
    itemsReported: row.items_reported,
    itemsFound: row.items_found,
    trustScore: row.trust_score,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

// GET /api/users
export const listUsers = asyncHandler(async (req, res) => {
  const { search = '', status = 'all' } = req.query;
  const clauses = [];
  const params = {};

  if (status !== 'all') {
    clauses.push('status = @status');
    params.status = status;
  }
  if (search) {
    clauses.push('(name LIKE @search OR email LIKE @search OR id LIKE @search)');
    params.search = `%${search}%`;
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM users ${where} ORDER BY joined_at DESC`).all(params);
  res.json({ success: true, data: rows.map(serialize) });
});

// GET /api/users/:id
export const getUser = asyncHandler(async (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) throw new ApiError(404, 'User not found');
  res.json({ success: true, data: serialize(row) });
});

// PATCH /api/users/:id/status
export const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended', 'banned'].includes(status)) {
    throw new ApiError(400, 'status must be one of active, suspended, banned');
  }
  const result = db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) throw new ApiError(404, 'User not found');
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: serialize(row) });
});
