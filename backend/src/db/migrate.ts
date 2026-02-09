import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query, closePool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('[Migrate] Running migrations...');

  const sql = readFileSync(join(__dirname, 'migrations', '001_initial.sql'), 'utf-8');
  await query(sql);

  console.log('[Migrate] Done.');
  await closePool();
}

migrate().catch((err) => {
  console.error('[Migrate] Failed:', err.message);
  process.exit(1);
});
