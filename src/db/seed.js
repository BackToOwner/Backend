import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import 'dotenv/config';

const email = process.env.ADMIN_SEED_EMAIL;
const password = process.env.ADMIN_SEED_PASSWORD;
const name = process.env.ADMIN_SEED_NAME || 'BackToOwner Admin';
if (!email || !password) {
  console.error('Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in .env before running npm run seed.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('ADMIN_SEED_PASSWORD must be at least 12 characters.');
  process.exit(1);
}
const normalizedEmail = email.toLowerCase().trim();
const { data: existing, error: lookupError } = await supabase.from('admins').select('id').eq('email', normalizedEmail).maybeSingle();
if (lookupError) throw lookupError;
if (existing) {
  console.log(`Admin ${normalizedEmail} already exists; no changes made.`);
  process.exit(0);
}
const { error } = await supabase.from('admins').insert({
  id: `ADM${Date.now().toString(36).toUpperCase()}`,
  name,
  email: normalizedEmail,
  password_hash: await bcrypt.hash(password, 12),
  role: 'admin',
});
if (error) throw error;
console.log(`Created admin account for ${normalizedEmail}.`);
