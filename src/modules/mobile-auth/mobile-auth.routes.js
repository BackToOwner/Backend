import { Router } from 'express';
import multer from 'multer';
import { requireMobileUser } from '../../middleware/requireMobileUser.js';
import { updateMobileProfile, uploadMobileAvatar } from './mobile-auth.controller.js';
import { changeMobilePassword } from './mobile-auth.controller.js';
import {
  mobileRegister,
  mobileConfirmEmail,
  mobileLogin,
  mobileMe,
  mobileRefresh,
  mobileLogout,
  mobileForgotPassword,
  mobileResetPassword,
} from './mobile-auth.controller.js';

const router = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error('Only JPEG, PNG, and WebP images are supported.'));
    }
    callback(null, true);
  },
});


router.post('/register', mobileRegister);
router.post('/confirm-email', mobileConfirmEmail);
router.post('/login', mobileLogin);
router.get('/me', mobileMe);

router.patch('/me', requireMobileUser, updateMobileProfile);
router.patch('/me/password', requireMobileUser, changeMobilePassword);
router.post(
  '/me/avatar',
  requireMobileUser,
  avatarUpload.single('image'),
  uploadMobileAvatar,
);
router.post('/refresh', mobileRefresh);
router.post('/logout', mobileLogout);
router.post('/forgot-password', mobileForgotPassword);
router.post('/reset-password', mobileResetPassword);

export default router;
