import { Router } from 'express';
import {
  listReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  getReturnConfirmationProgress,
  closeMatchedCase,
} from './reports.controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

router.use(requireAdminAuth);
router.get('/', listReports);
router.get('/:id/return-confirmation', getReturnConfirmationProgress);
router.post('/:id/close-case', closeMatchedCase);
router.get('/:id', getReport);
router.post('/', createReport);
router.patch('/:id', updateReport);
router.delete('/:id', deleteReport);

export default router;
