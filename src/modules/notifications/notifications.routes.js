import { Router } from 'express';
import { listNotifications, broadcast, markRead, deleteNotification } from './notifications.controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

router.use(requireAdminAuth);
router.get('/', listNotifications);
router.post('/broadcast', broadcast);
router.patch('/:id/read', markRead);
router.delete('/:id', deleteNotification);

export default router;
