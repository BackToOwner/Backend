import { Router } from 'express';
import { listMatches, createMatch, approveMatch, rejectMatch } from './matches.controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

router.use(requireAdminAuth);
router.get('/', listMatches);
router.post('/', createMatch);
router.post('/:id/approve', approveMatch);
router.post('/:id/reject', rejectMatch);

export default router;
