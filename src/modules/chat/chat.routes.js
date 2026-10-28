import { Router } from 'express';
import { requireMobileUser } from '../../middleware/requireMobileUser.js';
import {
  listMatchMessages,
  sendMatchMessage,
  resolveApprovedMatchForReport,
  markMatchConversationRead,
  getMyChatUnreadSummary,
  getReturnConfirmation,
  confirmReturnForMatch,
} from './chat.controller.js';

const router = Router();

router.use(requireMobileUser);
router.get('/unread-summary', getMyChatUnreadSummary);
router.get('/reports/:reportId/approved-match', resolveApprovedMatchForReport);
router.post('/matches/:matchId/read', markMatchConversationRead);
router.get('/matches/:matchId/return-confirmation', getReturnConfirmation);
router.post('/matches/:matchId/return-confirmation', confirmReturnForMatch);
router.get('/matches/:matchId/messages', listMatchMessages);
router.post('/matches/:matchId/messages', sendMatchMessage);

export default router;
