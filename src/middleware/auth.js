import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { supabase } from '../config/supabase.js';

export async function requireAdminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Missing or invalid Authorization header');
    const payload = verifyToken(token);
    const { data: admin, error } = await supabase
      .from('admins').select('id,name,email,role').eq('id', payload.sub).maybeSingle();
    if (error) throw new ApiError(503, 'Could not verify admin account in Supabase');
    if (!admin) throw new ApiError(401, 'Admin account no longer exists');
    req.admin = admin;
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}
