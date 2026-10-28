import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Public, read-only categories for the mobile report form.
router.get('/', asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from('categories')
    .select('id, label, icon, color, description, active')
    .eq('active', true)
    .order('label', { ascending: true });

  if (error) {
    console.error('Failed to load mobile categories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load categories',
    });
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: (data || []).map((category) => ({
      id: category.id,
      label: category.label,
      icon: category.icon || 'Package',
      color: category.color || '#00D2B4',
      description: category.description || '',
    })),
  });
}));

export default router;
