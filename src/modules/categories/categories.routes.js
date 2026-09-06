import { Router } from 'express';
import { listCategories, createCategory, updateCategory, deleteCategory } from './categories.controller.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

router.use(requireAdminAuth);
router.get('/', listCategories);
router.post('/', createCategory);
router.patch('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;
