import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const resolvedDbPath = path.isAbsolute(env.dbPath)
  ? env.dbPath
  : path.resolve(process.cwd(), env.dbPath);

fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });

export const db = new DatabaseSync(resolvedDbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// node:sqlite's DatabaseSync has no built-in `.transaction()` helper (unlike
// better-sqlite3) - this is a tiny drop-in replacement used the same way:
//   const run = withTransaction(() => { ...statements... });
//   run();
export function withTransaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

export default db;
