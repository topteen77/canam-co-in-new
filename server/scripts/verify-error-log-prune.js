import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { KEEP_DAYS, pruneOldErrorLogs, LOG_DIR } from '../utils/fileLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const today = new Date().toISOString().slice(0, 10);
const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const keep = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

fs.mkdirSync(LOG_DIR, { recursive: true });
const oldFile = path.join(LOG_DIR, `error-${old}.log`);
const keepFile = path.join(LOG_DIR, `error-${keep}.log`);
fs.writeFileSync(oldFile, 'old\n');
fs.writeFileSync(keepFile, 'keep\n');
pruneOldErrorLogs();

if (fs.existsSync(oldFile)) {
  console.error('FAIL old log still present');
  process.exit(1);
}
if (!fs.existsSync(keepFile)) {
  console.error('FAIL recent log was deleted');
  process.exit(1);
}
fs.unlinkSync(keepFile);
console.log(`PASS prune keeps ${KEEP_DAYS} days, removed error-${old}.log, kept error-${keep}.log`);
console.log(`PASS today file would be ${path.join(LOG_DIR, `error-${today}.log`)}`);
