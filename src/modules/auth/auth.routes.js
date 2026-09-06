import { Router } from 'express';
import { login, register, me } from './auth.controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', requireAdminAuth, me);

export default router;
