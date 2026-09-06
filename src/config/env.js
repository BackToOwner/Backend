import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/admin.sqlite',
  jwtSecret: process.env.JWT_SECRET || 'dev_only_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminSeed: {
    name: process.env.ADMIN_SEED_NAME || 'Super Admin',
    email: process.env.ADMIN_SEED_EMAIL || 'admin@backtoowner.com',
    password: process.env.ADMIN_SEED_PASSWORD || 'Admin@12345',
  },
  corsOrigin: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
