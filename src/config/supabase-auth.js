import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

if (!env.supabaseUrl) {
  throw new Error('Missing SUPABASE_URL.');
}

if (!env.supabaseServerKey) {
  throw new Error('Missing Supabase server key.');
}

export const supabaseAuth = createClient(
  env.supabaseUrl,
  env.supabaseServerKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
