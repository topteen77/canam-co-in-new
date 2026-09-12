import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function deviceIdFromSignals(userAgent = '', ip = '') {
  const raw = `${String(userAgent || '')}|${String(ip || '')}`;
  return `dev-${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}
import db from '../db.js';
import { sendEmail } from './emailService.js';
import { resolveTableNameOrFallback, getColumns } from '../utils/tableResolver.js';

const ADMIN_EMAILS = new Set(
  ['canamrakesh@gmail.com', 'manchandapranjal01@gmail.com']
    .map((e) => e.toLowerCase())
);

let tablesReady = false;

export function isAdminAccount(user = {}) {
  const role = String(user.role || '').toLowerCase().replace(/[\s_]/g, '');
  const email = String(user.email || user.userEmail || '').trim().toLowerCase();
  return ['admin', 'superadmin'].includes(role) || ADMIN_EMAILS.has(email);
}

export function getMasterPassword() {
  return String(process.env.ADMIN_MASTER_PASSWORD || process.env.ADMIN_PASSWORD || '').trim();
}

export function isMasterPasswordConfigured() {
  return Boolean(getMasterPassword());
}

export function verifyMasterPassword(input) {
  const expected = getMasterPassword();
  if (!expected) return false;
  const provided = String(input || '');
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (providedBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export function deviceNameFromUa(userAgent = '', deviceType = 'unknown') {
  const ua = String(userAgent || '');
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac OS|Macintosh/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return deviceType || 'Unknown device';
}

export function normalizeDeviceType(deviceType, userAgent = '') {
  const raw = String(deviceType || '').toLowerCase();
  if (['mobile', 'desktop', 'tablet'].includes(raw)) return raw;
  if (/iPad|Tablet/i.test(userAgent)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(userAgent)) return 'mobile';
  if (userAgent) return 'desktop';
  return 'unknown';
}

export function resolveServerEnvironment() {
  const raw = String(process.env.SESSION_ENV || process.env.VITE_APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (['production', 'prod'].includes(raw)) return 'production';
  return 'local';
}

export function normalizeEnvironment(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (['production', 'prod'].includes(raw)) return 'production';
  if (['local', 'development', 'dev', 'test'].includes(raw)) return 'local';
  return resolveServerEnvironment();
}

export async function ensureTables() {
  if (tablesReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_devices (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(128) NOT NULL,
      user_email VARCHAR(255) NOT NULL,
      device_id VARCHAR(128) NOT NULL,
      device_type VARCHAR(32) NOT NULL DEFAULT 'unknown',
      device_name VARCHAR(255) DEFAULT '',
      user_agent TEXT,
      last_ip VARCHAR(64) DEFAULT '',
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_device (user_email, device_id),
      INDEX idx_user_devices_email (user_email),
      INDEX idx_user_devices_last_seen (last_seen)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(128) NOT NULL,
      user_email VARCHAR(255) NOT NULL,
      device_id VARCHAR(128) NOT NULL,
      device_type VARCHAR(32) DEFAULT 'unknown',
      device_name VARCHAR(255) DEFAULT '',
      user_agent TEXT,
      ip_address VARCHAR(64) DEFAULT '',
      status VARCHAR(16) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME NULL,
      revoked_by VARCHAR(255) NULL,
      INDEX idx_sessions_email_status (user_email, status),
      INDEX idx_sessions_device (device_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_login_otps (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      otp_hash VARCHAR(255) NOT NULL,
      purpose VARCHAR(32) DEFAULT 'force_login',
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_otp_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await addColumnIfMissing('user_sessions', 'environment', "ADD COLUMN environment VARCHAR(32) NOT NULL DEFAULT 'local'");
  await addColumnIfMissing('user_devices', 'environment', "ADD COLUMN environment VARCHAR(32) NOT NULL DEFAULT 'local'");
  await db.query(`
    CREATE TABLE IF NOT EXISTS restricted_devices (
      device_id VARCHAR(128) PRIMARY KEY,
      restricted TINYINT NOT NULL DEFAULT 1,
      restricted_by VARCHAR(255) NULL,
      restricted_at DATETIME NULL,
      unrestricted_at DATETIME NULL,
      reason VARCHAR(255) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tablesReady = true;
}

async function addColumnIfMissing(table, column, alterSql) {
  const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  if (!cols.length) {
    await db.query(`ALTER TABLE \`${table}\` ${alterSql}`);
  }
}

function publicSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    deviceId: row.device_id,
    deviceType: row.device_type,
    deviceName: row.device_name,
    ipAddress: row.ip_address,
    status: row.status,
    createdAt: row.created_at,
    lastSeen: row.last_seen,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    environment: row.environment || 'local',
  };
}

function publicDevice(row, currentDeviceId = null) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    deviceId: row.device_id,
    deviceType: row.device_type,
    deviceName: row.device_name,
    lastIp: row.last_ip,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    isCurrent: currentDeviceId ? row.device_id === currentDeviceId : false,
    environment: row.environment || 'local',
    restricted: Boolean(Number(row.restricted)),
  };
}

export async function getActiveSession(email, environment) {
  await ensureTables();
  const userEmail = String(email || '').trim().toLowerCase();
  const env = normalizeEnvironment(environment);
  const [rows] = await db.query(
    `SELECT * FROM user_sessions WHERE user_email = ? AND status = 'active' AND environment = ? ORDER BY last_seen DESC LIMIT 1`,
    [userEmail, env]
  );
  return rows[0] || null;
}

export async function getActiveSessionsAll(email) {
  await ensureTables();
  const [rows] = await db.query(
    `SELECT * FROM user_sessions WHERE user_email = ? AND status = 'active' ORDER BY environment ASC, last_seen DESC`,
    [String(email || '').trim().toLowerCase()]
  );
  return rows;
}

export async function getSessionById(sessionId) {
  await ensureTables();
  if (!sessionId) return null;
  const [rows] = await db.query(`SELECT * FROM user_sessions WHERE id = ? LIMIT 1`, [sessionId]);
  return rows[0] || null;
}

export async function upsertDevice({ userId, email, deviceId, deviceType, deviceName, userAgent, ip, environment }) {
  await ensureTables();
  const userEmail = String(email || '').trim().toLowerCase();
  const idValue = String(deviceId || '').trim() || deviceIdFromSignals(userAgent, ip);
  const type = normalizeDeviceType(deviceType, userAgent);
  const name = deviceName || deviceNameFromUa(userAgent, type);
  const env = normalizeEnvironment(environment);
  const rowId = newId();
  await db.query(
    `INSERT INTO user_devices (id, user_id, user_email, device_id, device_type, device_name, user_agent, last_ip, environment, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       device_type = VALUES(device_type),
       device_name = VALUES(device_name),
       user_agent = VALUES(user_agent),
       last_ip = VALUES(last_ip),
       environment = VALUES(environment),
       last_seen = NOW()`,
    [rowId, String(userId || ''), userEmail, idValue, type, name, userAgent || '', ip || '', env]
  );
  return { deviceId: idValue, deviceType: type, deviceName: name, environment: env };
}

export async function createSession({ userId, email, deviceId, deviceType, deviceName, userAgent, ip, environment }) {
  await ensureTables();
  const sessionId = newId();
  const userEmail = String(email || '').trim().toLowerCase();
  const type = normalizeDeviceType(deviceType, userAgent);
  const name = deviceName || deviceNameFromUa(userAgent, type);
  const env = normalizeEnvironment(environment);
  await upsertDevice({ userId, email: userEmail, deviceId, deviceType: type, deviceName: name, userAgent, ip, environment: env });
  await db.query(
    `INSERT INTO user_sessions
      (id, user_id, user_email, device_id, device_type, device_name, user_agent, ip_address, environment, status, created_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
    [sessionId, String(userId || ''), userEmail, deviceId, type, name, userAgent || '', ip || '', env]
  );
  return getSessionById(sessionId);
}

export async function revokeSession(sessionId, revokedBy = 'system') {
  await ensureTables();
  if (!sessionId) return false;
  const [result] = await db.query(
    `UPDATE user_sessions SET status = 'revoked', revoked_at = NOW(), revoked_by = ? WHERE id = ? AND status = 'active'`,
    [String(revokedBy || 'system'), sessionId]
  );
  return result.affectedRows > 0;
}

export async function revokeAllSessions(email, revokedBy = 'system', exceptSessionId = null, environment = null) {
  await ensureTables();
  const userEmail = String(email || '').trim().toLowerCase();
  const env = environment ? normalizeEnvironment(environment) : null;
  const envClause = env ? ' AND environment = ?' : '';
  const envParams = env ? [env] : [];
  if (exceptSessionId) {
    await db.query(
      `UPDATE user_sessions SET status = 'revoked', revoked_at = NOW(), revoked_by = ?
       WHERE user_email = ? AND status = 'active' AND id <> ?${envClause}`,
      [String(revokedBy || 'system'), userEmail, exceptSessionId, ...envParams]
    );
    return;
  }
  await db.query(
    `UPDATE user_sessions SET status = 'revoked', revoked_at = NOW(), revoked_by = ?
     WHERE user_email = ? AND status = 'active'${envClause}`,
    [String(revokedBy || 'system'), userEmail, ...envParams]
  );
}

export async function revokeSessionsByDevice(deviceId, revokedBy = 'admin') {
  await ensureTables();
  const [result] = await db.query(
    `UPDATE user_sessions SET status = 'revoked', revoked_at = NOW(), revoked_by = ?
     WHERE device_id = ? AND status = 'active'`,
    [String(revokedBy || 'admin'), String(deviceId || '')]
  );
  return result.affectedRows;
}

export async function isDeviceRestricted(deviceId) {
  await ensureTables();
  const id = String(deviceId || '').trim();
  if (!id) return false;
  const [rows] = await db.query(
    `SELECT device_id FROM restricted_devices WHERE device_id = ? AND restricted = 1 LIMIT 1`,
    [id]
  );
  return rows.length > 0;
}

export async function setDeviceRestricted(deviceId, restricted, by, reason = '') {
  await ensureTables();
  const id = String(deviceId || '').trim();
  if (!id) throw new Error('Device ID is required');
  if (restricted) {
    await db.query(
      `INSERT INTO restricted_devices (device_id, restricted, restricted_by, restricted_at, reason)
       VALUES (?, 1, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE restricted = 1, restricted_by = VALUES(restricted_by), restricted_at = NOW(), unrestricted_at = NULL, reason = VALUES(reason)`,
      [id, String(by || 'admin'), reason || '']
    );
    await revokeSessionsByDevice(id, by || 'admin');
  } else {
    await db.query(
      `INSERT INTO restricted_devices (device_id, restricted, restricted_by, unrestricted_at)
       VALUES (?, 0, ?, NOW())
       ON DUPLICATE KEY UPDATE restricted = 0, unrestricted_at = NOW()`,
      [id, String(by || 'admin')]
    );
  }
  return { deviceId: id, restricted: Boolean(restricted) };
}

export async function listRestrictedDeviceIds() {
  await ensureTables();
  const [rows] = await db.query(`SELECT device_id FROM restricted_devices WHERE restricted = 1`);
  return new Set(rows.map((row) => row.device_id));
}

export async function touchSession(sessionId, { deviceId, deviceType, deviceName, userAgent, ip } = {}) {
  await ensureTables();
  const session = await getSessionById(sessionId);
  if (!session || session.status !== 'active') return null;
  await db.query(`UPDATE user_sessions SET last_seen = NOW() WHERE id = ?`, [sessionId]);
  await upsertDevice({
    userId: session.user_id,
    email: session.user_email,
    deviceId: deviceId || session.device_id,
    deviceType: deviceType || session.device_type,
    deviceName: deviceName || session.device_name,
    userAgent: userAgent || session.user_agent,
    ip: ip || session.ip_address,
    environment: session.environment,
  });
  return getSessionById(sessionId);
}

export async function listDevices() {
  await ensureTables();
  const [devices] = await db.query(`SELECT * FROM user_devices ORDER BY last_seen DESC`);
  const [active] = await db.query(
    `SELECT user_email, device_id, environment FROM user_sessions WHERE status = 'active'`
  );
  const restrictedIds = await listRestrictedDeviceIds();
  const currentKeys = new Set(active.map((row) => `${row.user_email}|${row.environment || 'local'}|${row.device_id}`));
  return devices.map((row) => ({
    ...publicDevice(row),
    restricted: restrictedIds.has(row.device_id),
    hasActiveSession: currentKeys.has(`${row.user_email}|${row.environment || 'local'}|${row.device_id}`),
  }));
}

export async function listSessions() {
  await ensureTables();
  const [rows] = await db.query(`SELECT * FROM user_sessions ORDER BY last_seen DESC LIMIT 300`);
  return rows.map(publicSession);
}

export async function requestForceLoginOtp(email) {
  await ensureTables();
  const userEmail = String(email || '').trim().toLowerCase();
  const [recent] = await db.query(
    `SELECT COUNT(*) AS cnt FROM admin_login_otps
     WHERE email = ? AND created_at > (NOW() - INTERVAL 15 MINUTE)`,
    [userEmail]
  );
  if ((recent[0]?.cnt || 0) >= 3) {
    return { success: false, error: 'Too many OTP requests. Try again in 15 minutes.' };
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(otp, 10);
  await db.query(
    `INSERT INTO admin_login_otps (id, email, otp_hash, purpose, expires_at, created_at)
     VALUES (?, ?, ?, 'force_login', DATE_ADD(NOW(), INTERVAL 10 MINUTE), NOW())`,
    [newId(), userEmail, otpHash]
  );

  const sent = await sendEmail({
    to: userEmail,
    subject: 'CRM admin force-login OTP',
    isHtml: true,
    body: `<p>Your one-time code to take over this CRM admin session is:</p>
           <p style="font-size:28px;letter-spacing:6px;font-weight:700">${otp}</p>
           <p>This code expires in 10 minutes. If you did not request it, change your password.</p>`,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔐 Force-login OTP for ${userEmail}: ${otp}`);
  }

  if (!sent?.success && process.env.NODE_ENV === 'production') {
    return { success: false, error: sent?.error || 'Could not send OTP email. Check SMTP settings.' };
  }

  return {
    success: true,
    message: sent?.success
      ? `OTP sent to ${userEmail}`
      : `OTP created. Email was not sent (${sent?.error || 'SMTP not configured'}). Check server logs in development.`,
  };
}

export async function verifyForceLoginOtp(email, otp) {
  await ensureTables();
  const userEmail = String(email || '').trim().toLowerCase();
  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) return { success: false, error: 'Enter the 6-digit OTP.' };

  const [rows] = await db.query(
    `SELECT * FROM admin_login_otps
     WHERE email = ? AND purpose = 'force_login' AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 5`,
    [userEmail]
  );
  for (const row of rows) {
    const match = await bcrypt.compare(code, row.otp_hash);
    if (match) {
      await db.query(`UPDATE admin_login_otps SET used_at = NOW() WHERE id = ?`, [row.id]);
      return { success: true };
    }
  }
  return { success: false, error: 'Invalid or expired OTP.' };
}

function pickMostUsed(usageList = []) {
  if (!usageList.length) return null;
  const total = usageList.reduce((sum, row) => sum + Number(row.loginCount || 0), 0);
  const top = usageList[0];
  return {
    userEmail: top.userEmail,
    loginCount: Number(top.loginCount || 0),
    share: total ? Math.round((Number(top.loginCount || 0) / total) * 100) : 0,
    lastSeen: top.lastSeen,
  };
}

function pickLikelyOwner(usageList = [], currentEmail = '') {
  const most = pickMostUsed(usageList);
  if (!most) return null;
  const current = String(currentEmail || '').toLowerCase();
  if (String(most.userEmail || '').toLowerCase() !== current) return most;
  const next = usageList.find((row) => String(row.userEmail || '').toLowerCase() !== current);
  if (!next) return { ...most, note: 'This device has only been used with the admin account so far.' };
  const total = usageList.reduce((sum, row) => sum + Number(row.loginCount || 0), 0);
  return {
    userEmail: next.userEmail,
    loginCount: Number(next.loginCount || 0),
    share: total ? Math.round((Number(next.loginCount || 0) / total) * 100) : 0,
    lastSeen: next.lastSeen,
    note: 'Most logins on this device are the admin account. Next most-used login is shown as a possible owner.',
  };
}

export async function getUsageByDevice() {
  await ensureTables();
  const [rows] = await db.query(
    `SELECT device_id AS deviceId, user_email AS userEmail,
            COUNT(*) AS loginCount, MIN(created_at) AS firstSeen, MAX(last_seen) AS lastSeen
     FROM user_sessions
     GROUP BY device_id, user_email
     ORDER BY loginCount DESC, lastSeen DESC`
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.deviceId)) map.set(row.deviceId, []);
    map.get(row.deviceId).push(row);
  }
  return map;
}

async function getAdminEmailSet() {
  const emails = new Set(ADMIN_EMAILS);
  try {
    const table = await resolveTableNameOrFallback(['users', 'Users'], 'users');
    const cols = await getColumns(table);
    const emailCol = cols.has('email') ? 'email' : (cols.has('userEmail') ? 'userEmail' : null);
    const roleCol = cols.has('role') ? 'role' : null;
    if (emailCol && roleCol) {
      const [rows] = await db.query(
        `SELECT \`${emailCol}\` AS email, \`${roleCol}\` AS role FROM ${table}`
      );
      rows.forEach((row) => {
        if (isAdminAccount(row)) emails.add(String(row.email || '').trim().toLowerCase());
      });
    }
  } catch (error) {
    console.warn('Could not load admin emails from users table:', error.message);
  }
  return emails;
}

export async function getLoginIntel() {
  const [devices, sessions, usageMap, adminEmails] = await Promise.all([
    listDevices(),
    listSessions(),
    getUsageByDevice(),
    getAdminEmailSet(),
  ]);

  const attachUsage = (deviceId, currentEmail) => {
    const usage = usageMap.get(deviceId) || [];
    return {
      usage,
      mostUsedLogin: pickMostUsed(usage),
      likelyOwner: pickLikelyOwner(usage, currentEmail),
    };
  };

  const currentAdminLogins = sessions
    .filter((row) => row.status === 'active' && adminEmails.has(String(row.userEmail || '').toLowerCase()))
    .map((row) => ({
      ...row,
      ...attachUsage(row.deviceId, row.userEmail),
    }));

  return {
    currentAdminLogins,
    devices: devices.map((row) => ({
      ...row,
      ...attachUsage(row.deviceId, row.userEmail),
    })),
    sessions,
  };
}

export { publicSession, publicDevice };
