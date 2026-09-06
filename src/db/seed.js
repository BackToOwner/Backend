import bcrypt from 'bcryptjs';
import { db } from './index.js';
import { env } from '../config/env.js';
import { newId } from '../utils/id.js';

const DEFAULT_CATEGORIES = [
  { id: 'electronics', label: 'Electronics & Phones', icon: 'Smartphone', color: '#0284C7' },
  { id: 'wallets', label: 'Wallets & IDs', icon: 'Wallet', color: '#8B5CF6' },
  { id: 'pets', label: 'Lost Pets', icon: 'Dog', color: '#F59E0B' },
  { id: 'keys', label: 'Keys & Keyfobs', icon: 'Key', color: '#10B981' },
  { id: 'bags', label: 'Bags & Luggage', icon: 'Briefcase', color: '#EC4899' },
  { id: 'documents', label: 'Passports & Cards', icon: 'FileText', color: '#6366F1' },
  { id: 'jewelry', label: 'Jewelry & Watches', icon: 'Watch', color: '#F43F5E' },
  { id: 'clothing', label: 'Apparel & Wearables', icon: 'Shirt', color: '#14B8A6' },
  { id: 'other', label: 'Other', icon: 'Package', color: '#64748B' },
];

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(env.adminSeed.email);
  if (existing) {
    console.log(`[seed] Admin already exists: ${env.adminSeed.email}`);
    return;
  }
  const passwordHash = bcrypt.hashSync(env.adminSeed.password, 10);
  db.prepare(
    'INSERT INTO admins (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(newId('ADM'), env.adminSeed.name, env.adminSeed.email, passwordHash, 'super_admin');
  console.log(`[seed] Created admin ${env.adminSeed.email} / ${env.adminSeed.password}`);
}

function seedCategories() {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO categories (id, label, icon, color) VALUES (?, ?, ?, ?)'
  );
  for (const c of DEFAULT_CATEGORIES) insert.run(c.id, c.label, c.icon, c.color);
  console.log(`[seed] Ensured ${DEFAULT_CATEGORIES.length} default categories`);
}

seedAdmin();
seedCategories();
console.log('[seed] Done.');
