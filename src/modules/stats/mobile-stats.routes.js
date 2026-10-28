import { Router } from 'express';
import { mobileHome } from './stats.controller.js';

const router = Router();

// This endpoint exposes aggregate public KPIs only; no admin auth required.
router.get('/home', mobileHome);

export default router;
