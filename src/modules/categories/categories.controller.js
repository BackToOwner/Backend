import { db } from '../../db/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function slugify(label) {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 32) || `cat_${Date.now()}`
  );
}

function serialize(row) {
  return {
    id: row.id,
    label: row.label,
    icon: row.icon,
    color: row.color,
    description: row.description,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

// GET /api/categories
export const listCategories = asyncHandler(async (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY label ASC').all();
  res.json({ success: true, data: rows.map(serialize) });
});

// POST /api/categories
export const createCategory = asyncHandler(async (req, res) => {
  const { label, icon, color, description } = req.body;
  if (!label || label.trim().length < 2) throw new ApiError(400, 'label must be at least 2 characters');

  const id = req.body.id ? slugify(req.body.id) : slugify(label);
  const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (existing) throw new ApiError(409, `Category "${id}" already exists`);

  db.prepare(
    'INSERT INTO categories (id, label, icon, color, description, active) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(id, label.trim(), icon || 'Package', color || '#00D2B4', description || '');

  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: serialize(row) });
});

// PATCH /api/categories/:id
export const updateCategory = asyncHandler(async (req, res) => {
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) throw new ApiError(404, 'Category not found');

  const b = req.body;
  const next = {
    label: b.label ?? existing.label,
    icon: b.icon ?? existing.icon,
    color: b.color ?? existing.color,
    description: b.description ?? existing.description,
    active: b.active != null ? (b.active ? 1 : 0) : existing.active,
    id: existing.id,
  };

  db.prepare('UPDATE categories SET label=@label, icon=@icon, color=@color, description=@description, active=@active WHERE id=@id').run(next);
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(existing.id);
  res.json({ success: true, data: serialize(row) });
});

// DELETE /api/categories/:id
export const deleteCategory = asyncHandler(async (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) AS count FROM reports WHERE category = ?').get(req.params.id).count;
  if (inUse > 0) throw new ApiError(409, `Cannot delete category: ${inUse} report(s) still use it`);

  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (result.changes === 0) throw new ApiError(404, 'Category not found');
  res.json({ success: true, data: { id: req.params.id } });
});
