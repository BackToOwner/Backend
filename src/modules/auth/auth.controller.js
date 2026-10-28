import bcrypt from 'bcryptjs';
import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { signToken } from '../../utils/jwt.js';
import { newId } from '../../utils/id.js';

const toPublicAdmin = (a) => ({ id: a.id, name: a.name, email: a.email, role: a.role });

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'email and password are required');
  const { data: admin, error } = await supabase.from('admins').select('*').eq('email', String(email).toLowerCase().trim()).maybeSingle();
  if (error) throw new ApiError(503, 'Could not access admin accounts in Supabase');
  if (!admin || !(await bcrypt.compare(String(password), admin.password_hash))) throw new ApiError(401, 'Invalid email or password');
  const token = signToken({ sub: admin.id, role: admin.role });
  res.json({ success: true, data: { token, admin: toPublicAdmin(admin) } });
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) throw new ApiError(400, 'name, email and password are required');
  if (String(password).length < 8) throw new ApiError(400, 'password must be at least 8 characters');
  const normalizedEmail = String(email).toLowerCase().trim();
  const { data: existing, error: lookupError } = await supabase.from('admins').select('id').eq('email', normalizedEmail).maybeSingle();
  if (lookupError) throw new ApiError(503, 'Could not access admin accounts in Supabase');
  if (existing) throw new ApiError(409, 'An admin with this email already exists');
  const adminInput = { id: newId('ADM'), name: String(name).trim(), email: normalizedEmail, password_hash: await bcrypt.hash(String(password), 10), role: role || 'admin' };
  const { data: admin, error } = await supabase.from('admins').insert(adminInput).select('*').single();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'An admin with this email already exists');
    throw new ApiError(500, 'Failed to create admin account');
  }
  const token = signToken({ sub: admin.id, role: admin.role });
  res.status(201).json({ success: true, data: { token, admin: toPublicAdmin(admin) } });
});

export const me = asyncHandler(async (req, res) => res.json({ success: true, data: req.admin }));
