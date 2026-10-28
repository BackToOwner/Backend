import { Router } from 'express';
import { requireMobileUser } from '../../middleware/requireMobileUser.js';
import {
  listMyNotifications,
  getMyUnreadNotificationCount,
  markMyNotificationRead,
  markAllMyNotificationsRead,
} from './mobile-notifications.controller.js';

const router = Router();

router.use(requireMobileUser);

router.get('/unread-count', getMyUnreadNotificationCount);
router.get('/', listMyNotifications);
router.post('/read-all', markAllMyNotificationsRead);
router.patch('/:id/read', markMyNotificationRead);

export default router;
