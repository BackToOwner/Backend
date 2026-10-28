import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function slugify(label) { return String(label).toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || `cat_${Date.now()}`; }
function serialize(r) { return { id: r.id, label: r.label, icon: r.icon, color: r.color, description: r.description, active: Boolean(r.active), createdAt: r.created_at }; }
function fail(error, message) { if (!error) return; console.error(message, error); throw new ApiError(500, message); }

export const listCategories = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from('categories').select('*').order('label', { ascending: true });
  fail(error, 'Failed to load categories'); res.json({ success: true, data: (data || []).map(serialize) });
});
export const createCategory = asyncHandler(async (req, res) => {
  const { label, icon, color, description } = req.body;
  if (!label || String(label).trim().length < 2) throw new ApiError(400, 'label must be at least 2 characters');
  const id = slugify(req.body.id || label);
  const input = { id, label: String(label).trim(), icon: icon || 'Package', color: color || '#00D2B4', description: description || '', active: true };
  const { data, error } = await supabase.from('categories').insert(input).select('*').single();
  if (error?.code === '23505') throw new ApiError(409, `Category "${id}" already exists`);
  fail(error, 'Failed to create category'); res.status(201).json({ success: true, data: serialize(data) });
});
export const updateCategory = asyncHandler(async (req, res) => {
  const allowed = ['label', 'icon', 'color', 'description', 'active'];
  const patch = Object.fromEntries(allowed.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
  if (!Object.keys(patch).length) throw new ApiError(400, 'At least one category field is required');
  const { data, error } = await supabase.from('categories').update(patch).eq('id', req.params.id).select('*').maybeSingle();
  fail(error, 'Failed to update category'); if (!data) throw new ApiError(404, 'Category not found');
  res.json({ success: true, data: serialize(data) });
});
export const deleteCategory = asyncHandler(async (req, res) => {
  const { count, error: countError } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('category', req.params.id).is('deleted_at', null);
  fail(countError, 'Failed to check category usage'); if (count > 0) throw new ApiError(409, `Cannot delete category: ${count} report(s) still use it`);
  const { data, error } = await supabase.from('categories').delete().eq('id', req.params.id).select('id').maybeSingle();
  fail(error, 'Failed to delete category'); if (!data) throw new ApiError(404, 'Category not found');
  res.json({ success: true, data: { id: data.id } });
});
