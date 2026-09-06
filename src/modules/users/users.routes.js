import { Router } from 'express';
import { listUsers, getUser, updateUserStatus } from './users.controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

router.use(requireAdminAuth);
router.get('/', listUsers);
router.get('/:id', getUser);
router.patch('/:id/status', updateUserStatus);

export default router;
