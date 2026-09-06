import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './modules/auth/auth.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import categoriesRoutes from './modules/categories/categories.routes.js';
import matchesRoutes from './modules/matches/matches.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import statsRoutes from './modules/stats/stats.routes.js';
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

app.get('/health', (req, res) => res.json({ success: true, service: 'backtoowner-admin-backend', status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/uploads', uploadsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
