import { Router } from 'express';
import multer from 'multer';
import {
  listMobileReports,
  listMyMobileReports,
  createMobileReport,
  uploadMobileReportImage,
  deleteMobileReport,
} from './mobile-reports.controller.js';
import { requireMobileUser } from '../../middleware/requireMobileUser.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new ApiError(400, 'Only JPG, PNG and WebP images are allowed'));
    }
    cb(null, true);
  },
});

router.get('/', listMobileReports);
router.get('/me', requireMobileUser, listMyMobileReports);
router.post('/', requireMobileUser, createMobileReport);
router.post(
  '/:id/images',
  requireMobileUser,
  imageUpload.single('images'),
  uploadMobileReportImage
);

router.delete('/:id', requireMobileUser, deleteMobileReport);

export default router;
