import { Router } from 'express';
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

router.post('/register', mobileRegister);
router.post('/confirm-email', mobileConfirmEmail);
router.post('/login', mobileLogin);
router.get('/me', mobileMe);
router.post('/refresh', mobileRefresh);
router.post('/logout', mobileLogout);
router.post('/forgot-password', mobileForgotPassword);
router.post('/reset-password', mobileResetPassword);

export default router;
