
import { supabaseAuth } from '../config/supabase-auth.js';
import { ApiError } from '../utils/ApiError.js';

export async function requireMobileUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : '';

    if (!token) {
      throw new ApiError(401, 'Mobile access token is missing or expired', {
        code: 'TOKEN_EXPIRED',
      });
    }

    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data.user) {
      throw new ApiError(401, 'Invalid or expired mobile access token', {
        code: 'TOKEN_EXPIRED',
      });
    }

    req.mobileUser = data.user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }

    return next(new ApiError(401, 'Could not authenticate mobile user'));
  }
}
