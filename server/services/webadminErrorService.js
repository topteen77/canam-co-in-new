import crypto from 'node:crypto';
import db from '../db.js';
import { sendEmail } from './emailService.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const recentFingerprints = new Map(); // fingerprint -> timestamp
const DEDUPE_MS = 15 * 60 * 1000;

let tableReady = null;

export async function ensureWebadminErrorTables() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS webadmin_error_settings (
        id TINYINT PRIMARY KEY,
        error_email VARCHAR(255) NOT NULL DEFAULT '',
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        updated_at DATETIME NULL,
        updated_by VARCHAR(255) NULL
      )
    `);
    const [rows] = await db.query('SELECT id FROM webadmin_error_settings WHERE id = 1');
    if (!rows.length) {
      const envEmail = String(process.env.ADMIN_EMAIL || process.env.WEBADMIN_ERROR_EMAIL || '').trim();
      await db.query(
        `INSERT INTO webadmin_error_settings (id, error_email, enabled, updated_at, updated_by)
         VALUES (1, ?, 1, NOW(), 'system')`,
        [envEmail]
      );
    }
  })();
  return tableReady;
}

export async function getWebadminErrorSettings() {
  await ensureWebadminErrorTables();
  const [rows] = await db.query(
    'SELECT error_email, enabled, updated_at, updated_by FROM webadmin_error_settings WHERE id = 1'
  );
  const row = rows[0] || {};
  const email = String(row.error_email || '').trim();
  return {
    email,
    enabled: Number(row.enabled) !== 0,
    configured: Boolean(email),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    smtpConfigured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
  };
}

export async function saveWebadminErrorSettings({ email, enabled = true, updatedBy = '' } = {}) {
  await ensureWebadminErrorTables();
  const normalized = String(email || '').trim().toLowerCase();
  if (normalized && !EMAIL_RE.test(normalized)) {
    const err = new Error('Enter a valid email address.');
    err.status = 400;
    throw err;
  }
  await db.query(
    `INSERT INTO webadmin_error_settings (id, error_email, enabled, updated_at, updated_by)
     VALUES (1, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       error_email = VALUES(error_email),
       enabled = VALUES(enabled),
       updated_at = VALUES(updated_at),
       updated_by = VALUES(updated_by)`,
    [normalized, enabled ? 1 : 0, String(updatedBy || '').trim() || null]
  );
  return getWebadminErrorSettings();
}

function pruneFingerprints(now = Date.now()) {
  for (const [key, ts] of recentFingerprints.entries()) {
    if (now - ts > DEDUPE_MS) recentFingerprints.delete(key);
  }
}

function fingerprintFor(payload = {}) {
  const raw = [
    payload.message || '',
    payload.name || '',
    payload.url || '',
    payload.userEmail || '',
    payload.source || '',
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildErrorEmailHtml(payload = {}) {
  const rows = [
    ['Time', payload.time || new Date().toISOString()],
    ['URL', payload.url || ''],
    ['Source', payload.source || ''],
    ['Error', `${payload.name || 'Error'}: ${payload.message || ''}`],
    ['User email', payload.userEmail || ''],
    ['User name', payload.userName || ''],
    ['User role', payload.userRole || ''],
    ['User id', payload.userId || ''],
    ['Browser', payload.userAgent || ''],
    ['Viewport', payload.viewport || ''],
    ['App version', payload.appVersion || ''],
  ];

  const meta = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:600;width:140px">${escapeHtml(label)}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;word-break:break-word">${escapeHtml(value || '—')}</td>
      </tr>`)
    .join('');

  return `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;line-height:1.45">
      <h2 style="margin:0 0 8px;color:#be123c">CRM frontend crash</h2>
      <p style="margin:0 0 16px;color:#475569">Automatic error report from Canam CRM. Use this to track and fix the issue.</p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;font-size:14px">${meta}</table>
      <h3 style="margin:20px 0 8px">Stack trace</h3>
      <pre style="background:#020617;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:12px;white-space:pre-wrap">${escapeHtml(payload.stack || '(none)')}</pre>
      <h3 style="margin:20px 0 8px">React component stack</h3>
      <pre style="background:#020617;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:12px;white-space:pre-wrap">${escapeHtml(payload.componentStack || '(none)')}</pre>
      <h3 style="margin:20px 0 8px">Full report</h3>
      <pre style="background:#f1f5f9;color:#0f172a;padding:12px;border-radius:8px;overflow:auto;font-size:12px;white-space:pre-wrap">${escapeHtml(payload.report || '')}</pre>
    </div>
  `;
}

export async function reportClientError(payload = {}, options = {}) {
  await ensureWebadminErrorTables();
  const settings = await getWebadminErrorSettings();
  if (!settings.enabled) {
    return { sent: false, reason: 'disabled' };
  }
  if (!settings.email) {
    return { sent: false, reason: 'not_configured' };
  }
  if (!settings.smtpConfigured) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const now = Date.now();
  pruneFingerprints(now);
  const fingerprint = fingerprintFor(payload);
  if (!options.force && recentFingerprints.has(fingerprint)) {
    return { sent: false, reason: 'duplicate', fingerprint };
  }
  recentFingerprints.set(fingerprint, now);

  const subject = `[CRM Error] ${String(payload.name || 'Error')}: ${String(payload.message || 'Unknown').slice(0, 120)}`;
  const html = buildErrorEmailHtml(payload);
  const text = [
    'CRM frontend crash',
    `Time: ${payload.time || new Date().toISOString()}`,
    `URL: ${payload.url || ''}`,
    `Source: ${payload.source || ''}`,
    `Error: ${payload.name || 'Error'}: ${payload.message || ''}`,
    `User: ${payload.userName || ''} <${payload.userEmail || ''}> (${payload.userRole || ''})`,
    '',
    'Stack:',
    payload.stack || '(none)',
    '',
    'Component stack:',
    payload.componentStack || '(none)',
    '',
    payload.report || '',
  ].join('\n');

  const result = await sendEmail({
    to: settings.email,
    subject,
    body: html,
    isHtml: true,
  });

  if (!result?.success) {
    // Also try plain text if HTML path somehow fails oddly — still return failure reason.
    const fallback = await sendEmail({
      to: settings.email,
      subject,
      body: text,
      isHtml: false,
    });
    if (!fallback?.success) {
      return { sent: false, reason: result?.error || fallback?.error || 'send_failed', email: settings.email };
    }
  }

  return { sent: true, email: settings.email, fingerprint };
}

export async function sendWebadminTestEmail(updatedBy = '') {
  return reportClientError({
    name: 'TestError',
    message: 'Webadmin error email test from Admin Panel',
    source: 'admin-test',
    url: 'admin://webadmin-error-settings',
    time: new Date().toISOString(),
    userEmail: updatedBy || '',
    userName: updatedBy || 'Admin',
    userRole: 'Admin',
    stack: 'This is a test email. No real crash occurred.',
    componentStack: '',
    report: 'Test report from Webadmin Error Email settings.',
    userAgent: 'admin-panel',
  }, { force: true });
}
