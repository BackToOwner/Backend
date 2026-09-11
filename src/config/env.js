import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 5000),

  nodeEnv:
    process.env.NODE_ENV || 'development',

  dbPath:
    process.env.DB_PATH || './data/admin.sqlite',

  jwtSecret:
    process.env.JWT_SECRET || 'change-me',

  jwtExpiresIn:
    process.env.JWT_EXPIRES_IN || '1d',

  adminSeed:
    process.env.ADMIN_SEED || 'true',

  corsOrigin:
    process.env.CORS_ORIGIN || '*',

  supabaseUrl:
    process.env.SUPABASE_URL,

  supabasePublishableKey:
   process.env.SUPABASE_PUBLISHABLE_KEY,
};