import { Router } from 'express';
import { overview, breakdown } from './stats.controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

router.use(requireAdminAuth);
router.get('/overview', overview);
router.get('/breakdown', breakdown);

export default router;
