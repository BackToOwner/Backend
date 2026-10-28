import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 5000),

  nodeEnv:
    process.env.NODE_ENV || 'development',

  jwtSecret:
    process.env.JWT_SECRET || 'change-me-before-production',

  jwtExpiresIn:
    process.env.JWT_EXPIRES_IN || '1d',

  adminSeed:
    process.env.ADMIN_SEED || 'true',

  corsOrigin:
    process.env.CORS_ORIGIN || '*',

  supabaseUrl:
    process.env.SUPABASE_URL,

  // Server-only key. Prefer a Supabase secret key; legacy service-role keys are also supported.
  supabaseServerKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
};