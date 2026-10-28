import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

if (!env.supabaseUrl) throw new Error('Missing SUPABASE_URL in the admin backend environment.');
if (!env.supabaseServerKey) throw new Error('Missing SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the admin backend environment.');

export const supabase = createClient(env.supabaseUrl, env.supabaseServerKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
