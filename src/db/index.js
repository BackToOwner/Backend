// SQLite has been retired from the active admin backend.
// All API modules now access the shared Supabase project via src/config/supabase.js.
// Keep this file only to make the transition explicit for old local branches.
throw new Error('SQLite database module is retired. Import supabase from src/config/supabase.js instead.');
