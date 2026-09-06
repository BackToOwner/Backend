import bcrypt from 'bcryptjs';
import { db } from '../../db/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { signToken } from '../../utils/jwt.js';
import { newId } from '../../utils/id.js';

function toPublicAdmin(admin) {
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
}

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'email and password are required');

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!admin) throw new ApiError(401, 'Invalid email or password');

  const ok = bcrypt.compareSync(password, admin.password_hash);
  if (!ok) throw new ApiError(401, 'Invalid email or password');

  const token = signToken({ sub: admin.id, role: admin.role });
  res.json({ success: true, data: { token, admin: toPublicAdmin(admin) } });
});

// POST /api/auth/register  (only meant for bootstrapping additional admins; protect in production)
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) throw new ApiError(400, 'name, email and password are required');
  if (String(password).length < 8) throw new ApiError(400, 'password must be at least 8 characters');

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(normalizedEmail);
  if (existing) throw new ApiError(409, 'An admin with this email already exists');

  const id = newId('ADM');
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO admins (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, normalizedEmail, passwordHash, role || 'admin');

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  const token = signToken({ sub: admin.id, role: admin.role });
  res.status(201).json({ success: true, data: { token, admin: toPublicAdmin(admin) } });
});

// GET /api/auth/me
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.admin });
});
