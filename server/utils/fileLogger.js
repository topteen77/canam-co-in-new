import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../logs');
const KEEP_DAYS = 3;
const MAX_ENTRY_CHARS = 8000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function errorLogPath(date = new Date()) {
  return path.join(LOG_DIR, `error-${dayStamp(date)}.log`);
}

function cutoffStamp() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
  return dayStamp(cutoff);
}

export function pruneOldErrorLogs() {
  try {
    ensureLogDir();
    const cutoff = cutoffStamp();
    for (const name of fs.readdirSync(LOG_DIR)) {
      const match = name.match(/^(error|app)-(\d{4}-\d{2}-\d{2})\.log$/);
      if (!match) continue;
      if (match[1] === 'app' || match[2] < cutoff) {
        fs.unlinkSync(path.join(LOG_DIR, name));
      }
    }
  } catch {
    // never throw from logger
  }
}

function serializeArg(arg) {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
  }
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function writeErrorLine(level, args) {
  try {
    ensureLogDir();
    const file = errorLogPath();
    if (fs.existsSync(file) && fs.statSync(file).size >= MAX_FILE_BYTES) {
      return;
    }
    const body = args.map(serializeArg).join(' ');
    const clipped = body.length > MAX_ENTRY_CHARS ? `${body.slice(0, MAX_ENTRY_CHARS)}\n…[truncated]` : body;
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${level} ${clipped}\n`);
  } catch {
    // never throw from logger
  }
}

export function logError(...args) {
  writeErrorLine('ERROR', args);
}

export function logWarn(...args) {
  writeErrorLine('WARN', args);
}

export function installFileLogger() {
  ensureLogDir();
  pruneOldErrorLogs();
  setInterval(pruneOldErrorLogs, 60 * 60 * 1000).unref();

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args) => {
    logError(...args);
    origError(...args);
  };
  console.warn = (...args) => {
    logWarn(...args);
    origWarn(...args);
  };

  process.on('uncaughtException', (err) => {
    logError('uncaughtException', err);
    origError('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    logError('unhandledRejection', reason);
    origError('unhandledRejection', reason);
  });

  origError(`error logs: ${LOG_DIR}/error-YYYY-MM-DD.log (keep ${KEEP_DAYS} days)`);
  return LOG_DIR;
}

export function expressErrorLogger(err, req, res, next) {
  logError('express', req?.method, req?.originalUrl, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err?.message || 'Internal server error' });
}

export { LOG_DIR, KEEP_DAYS };
