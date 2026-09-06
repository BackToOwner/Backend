import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { db } from '../db/index.js';

export function requireAdminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Missing or invalid Authorization header');

    const payload = verifyToken(token);
    const admin = db.prepare('SELECT id, name, email, role FROM admins WHERE id = ?').get(payload.sub);
    if (!admin) throw new ApiError(401, 'Admin account no longer exists');

    req.admin = admin;
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'Invalid or expired token'));
  }
}
