import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAdminAuth } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new ApiError(400, 'Only image uploads are allowed'));
    cb(null, true);
  },
});

const router = Router();

// POST /api/uploads  (multipart/form-data, field name: "image")
router.post('/', requireAdminAuth, upload.single('image'), (req, res) => {
  if (!req.file) throw new ApiError(400, 'No image uploaded');
  res.status(201).json({ success: true, data: { url: `/uploads/${req.file.filename}` } });
});

export default router;
