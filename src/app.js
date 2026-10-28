import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { supabase } from './config/supabase.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

import mobileAuthRoutes from './modules/mobile-auth/mobile-auth.routes.js';
import mobileReportsRoutes from './modules/mobile-reports/mobile-reports.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import categoriesRoutes from './modules/categories/categories.routes.js';
import matchesRoutes from './modules/matches/matches.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import mobileNotificationsRoutes from './modules/notifications/mobile-notifications.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import statsRoutes from './modules/stats/stats.routes.js';
import mobileStatsRoutes from './modules/stats/mobile-stats.routes.js';
import mobileCategoriesRoutes from './modules/categories/mobile-categories.routes.js';
import uploadsRoutes from './modules/uploads.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(
  cors({
    origin: env.corsOrigin.includes('*') ? true : env.corsOrigin,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));


app.get('/api/health/status', async (req, res) => {
  const checkedAt = new Date().toISOString();

  const [databaseResult, aiResult] = await Promise.allSettled([
    supabase.from('lost_items').select('id').limit(1),
    fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/health`, {
      signal: AbortSignal.timeout(4000),
    }),
  ]);

  const databaseOnline =
    databaseResult.status === 'fulfilled' && !databaseResult.value.error;

  let aiOnline = false;
  let aiDetails = null;

  if (aiResult.status === 'fulfilled' && aiResult.value.ok) {
    try {
      aiDetails = await aiResult.value.json();
      aiOnline = aiDetails.status === 'healthy';
    } catch {
      aiOnline = false;
    }
  }

  const services = {
    backend: { status: 'online', message: 'API responding' },
    database: {
      status: databaseOnline ? 'online' : 'offline',
      message: databaseOnline ? 'Supabase query successful' : 'Supabase query failed',
    },
    ai: {
      status: aiOnline ? 'online' : 'offline',
      message: aiOnline ? 'AI health check successful' : 'AI service unavailable',
      model: aiOnline ? aiDetails.model : null,
    },
  };

  const overall = Object.values(services).every(
    (service) => service.status === 'online'
  ) ? 'online' : 'degraded';

  res.set('Cache-Control', 'no-store');
  res.status(200).json({ status: overall, checkedAt, services });
});

app.get('/health', (req, res) => res.json({ success: true, service: 'backtoowner-admin-backend', status: 'ok' }));

app.use('/api/v1/auth', mobileAuthRoutes);
app.use('/api/v1/reports', mobileReportsRoutes);
app.use('/api/v1/me/reports', mobileReportsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/notifications', mobileNotificationsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/v1/stats', mobileStatsRoutes);
app.use('/api/v1/categories', mobileCategoriesRoutes);
app.use('/api/uploads', uploadsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
