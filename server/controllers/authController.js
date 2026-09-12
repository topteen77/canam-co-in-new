import crypto from 'node:crypto';
import db from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { resolveTableNameOrFallback, getColumns, pickPasswordCol } from '../utils/tableResolver.js';
import { getJwtSecret, JWT_EXPIRES_IN } from '../utils/jwtConfig.js';
import { clientIp } from '../middleware/auth.js';
import {
  getActiveSession,
  getActiveSessionsAll,
  createSession,
  revokeSession,
  revokeAllSessions,
  revokeSessionsByDevice,
  isDeviceRestricted,
  setDeviceRestricted,
  touchSession,
  getSessionById,
  listDevices,
  listSessions,
  isAdminAccount,
  isMasterPasswordConfigured,
  verifyMasterPassword,
  getLoginIntel,
  publicSession,
  normalizeDeviceType,
  normalizeEnvironment,
  deviceNameFromUa,
  ensureTables,
  getMostRecentSession,
  listLastLogins,
  recordForceLoginInfo,
} from '../services/sessionService.js';

function newId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function isPrivateIp(ip = '') {
  const value = String(ip || '').replace('::ffff:', '');
  return !value
    || value === '127.0.0.1'
    || value === '::1'
    || value.startsWith('10.')
    || value.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
}

async function lookupIpLocation(ip) {
  if (isPrivateIp(ip)) return '';
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(String(ip).replace('::ffff:', ''))}`, {
      signal: AbortSignal.timeout(2500),
    });
    const data = await res.json();
    if (!data?.success) return '';
    return [data.city, data.region, data.country].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

function devicePayload(req) {
  const userAgent = String(req.body.userAgent || req.headers['user-agent'] || '');
  const deviceType = normalizeDeviceType(req.body.deviceType, userAgent);
  const ip = clientIp(req);
  const deviceId = String(req.body.deviceId || '').trim()
    || `dev-${crypto.createHash('sha256').update(`${userAgent}|${ip}`).digest('hex').slice(0, 24)}`;
  const deviceName = String(req.body.deviceName || '').trim() || deviceNameFromUa(userAgent, deviceType);
  const environment = normalizeEnvironment(req.body.environment);
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  return {
    deviceId,
    deviceType,
    deviceName,
    userAgent,
    ip,
    environment,
    location: String(req.body.location || '').trim(),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function signToken(user, sessionId) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      jti: sessionId,
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function sanitizeUser(user, passwordCol) {
  const { [passwordCol]: _, ...userData } = user;
  const userId = user.id ?? user.firebase_id;
  return {
    ...userData,
    id: userId,
    email: userData.email ?? userData.userEmail,
  };
}

async function findUserByEmail(email) {
  const table = await resolveTableNameOrFallback(['users', 'Users'], 'users');
  const cols = await getColumns(table);
  const emailCol = cols.has('email') ? 'email' : 'userEmail';
  const passwordCol = pickPasswordCol(cols);
  if (!passwordCol) throw new Error('Users table has no password column');
  const [users] = await db.query(`SELECT * FROM ${table} WHERE \`${emailCol}\` = ?`, [email]);
  return { user: users[0] || null, passwordCol };
}

async function verifyUserPassword(email, password) {
  const { user, passwordCol } = await findUserByEmail(email);
  if (!user || !user[passwordCol]) return { user: null, passwordCol, ok: false };
  const ok = await bcrypt.compare(password, user[passwordCol]);
  return { user: ok ? user : null, passwordCol, ok };
}

async function issueLogin(user, passwordCol, device, force = false) {
  const safeUser = sanitizeUser(user, passwordCol);
  await ensureTables();
  const previous = force
    ? (
      await getActiveSession(safeUser.email, device.environment)
      || (await getActiveSessionsAll(safeUser.email))[0]
      || await getMostRecentSession(safeUser.email)
    )
    : null;
  if (!device.location) {
    device.location = await lookupIpLocation(device.ip);
  }
  let lastLogin = null;
  if (force && previous) {
    lastLogin = await recordForceLoginInfo(previous);
  }
  if (force) {
    await revokeAllSessions(safeUser.email, safeUser.email, null, device.environment);
  }
  const session = await createSession({
    userId: safeUser.id,
    email: safeUser.email,
    ...device,
  });
  const token = signToken(safeUser, session.id);
  return {
    success: true,
    token,
    user: safeUser,
    session: publicSession(session),
    lastLogin: force ? lastLogin : null,
  };
}

export const register = async (req, res) => {
  try {
    const table = await resolveTableNameOrFallback(['users', 'Users'], 'users');
    const cols = await getColumns(table);
    const emailCol = cols.has('email') ? 'email' : 'userEmail';
    const passwordCol = pickPasswordCol(cols);
    if (!passwordCol) return res.status(500).json({ error: 'Users table has no password column (expected password, password_hash, hashed_password, customPassword, or defaultPassword)' });

    const [existing] = await db.query(`SELECT * FROM ${table} WHERE \`${emailCol}\` = ?`, [String(req.body.email || '').trim().toLowerCase()]);
    if (existing.length > 0) return res.status(400).json({ error: 'User already exists' });

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const name = String(req.body.name || '').trim();
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = newId();
    const idCol = cols.has('id') ? 'id' : 'firebase_id';
    const createdCol = cols.has('created_at') ? 'created_at' : 'createdAt';
    const nameCol = cols.has('name') ? 'name' : 'Name';
    const roleCol = cols.has('role') ? 'role' : 'role';
    const statusCol = cols.has('status') ? 'status' : 'status';
    await db.query(
      `INSERT INTO ${table} (\`${idCol}\`, \`${emailCol}\`, \`${passwordCol}\`, \`${nameCol}\`, \`${roleCol}\`, \`${statusCol}\`, \`${createdCol}\`)
       VALUES (?, ?, ?, ?, 'User', 'Pending', NOW())`,
      [userId, email, hashedPassword, name || '']
    );

    res.json({ success: true, message: 'Registration successful. Awaiting approval.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  console.log('🔵 Login Request Received:', req.body.email);

  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { user, passwordCol, ok } = await verifyUserPassword(email, password);
    if (!ok || !user) return res.status(401).json({ error: 'Invalid credentials' });

    const device = devicePayload(req);
    if (await isDeviceRestricted(device.deviceId)) {
      return res.status(403).json({
        error: 'DEVICE_RESTRICTED',
        message: 'This device is restricted and cannot sign in. Ask an admin to unrestrict it.',
        deviceId: device.deviceId,
      });
    }
    const safeUser = sanitizeUser(user, passwordCol);
    const active = await getActiveSession(safeUser.email, device.environment);
    const allActive = (await getActiveSessionsAll(safeUser.email)).map(publicSession);

    if (active && active.device_id !== device.deviceId) {
      return res.status(409).json({
        error: 'SESSION_ACTIVE',
        message: `This account is already signed in on ${device.environment}. You can still have a separate session on the other environment.`,
        canForceLogin: isAdminAccount(safeUser),
        environment: device.environment,
        activeSession: publicSession(active),
        otherSessions: allActive,
      });
    }

    if (active && active.device_id === device.deviceId) {
      await revokeSession(active.id, safeUser.email);
    }

    const payload = await issueLogin(user, passwordCol, device, false);
    console.log('✅ Login Successful for user:', safeUser.email, 'device:', device.deviceId);
    res.json(payload);
  } catch (error) {
    console.error('🔴 REAL ERROR IN TERMINAL:', error);
    console.error(error.stack);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
};

export const requestAdminForceLoginOtp = async (req, res) => {
  return res.status(410).json({ error: 'OTP force-login is disabled. Use the master password.' });
};

export const adminForceLogin = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const masterPassword = String(req.body.masterPassword || req.body.otp || '').trim();
    const { user, passwordCol, ok } = await verifyUserPassword(email, password);
    if (!ok || !user) return res.status(401).json({ error: 'Invalid credentials' });
    const safeUser = sanitizeUser(user, passwordCol);
    if (!isAdminAccount(safeUser)) {
      return res.status(403).json({ error: 'Force-login is only available for admin accounts.' });
    }
    if (!isMasterPasswordConfigured()) {
      return res.status(500).json({ error: 'ADMIN_MASTER_PASSWORD is not set in the server .env file.' });
    }
    if (!verifyMasterPassword(masterPassword)) {
      return res.status(401).json({ error: 'Invalid master password.' });
    }

    const device = devicePayload(req);
    if (await isDeviceRestricted(device.deviceId)) {
      return res.status(403).json({
        error: 'DEVICE_RESTRICTED',
        message: 'This device is restricted and cannot sign in.',
        deviceId: device.deviceId,
      });
    }
    const payload = await issueLogin(user, passwordCol, device, true);
    res.json({ ...payload, message: 'Previous session ended. You are now signed in.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const unlockMaster = async (req, res) => {
  try {
    if (!isMasterPasswordConfigured()) {
      return res.status(500).json({ error: 'ADMIN_MASTER_PASSWORD is not set in the server .env file.' });
    }
    if (!verifyMasterPassword(req.body.masterPassword)) {
      return res.status(401).json({ error: 'Invalid master password.' });
    }
    const unlockToken = jwt.sign(
      { purpose: 'master', email: req.user.email, id: req.user.id },
      getJwtSecret(),
      { expiresIn: '30m' }
    );
    res.json({ success: true, unlockToken, expiresIn: 1800 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminLoginIntel = async (req, res) => {
  try {
    const intel = await getLoginIntel();
    res.json(intel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const table = await resolveTableNameOrFallback(['users', 'Users'], 'users');
    const cols = await getColumns(table);
    const idCol = cols.has('id') ? 'id' : 'firebase_id';
    const [users] = await db.query(`SELECT \`${idCol}\` as id, name, \`${cols.has('email') ? 'email' : 'userEmail'}\` as email, role, status FROM ${table} WHERE \`${idCol}\` = ?`, [req.user.id]);
    res.json(users[0] || {});
  } catch (error) {
    res.status(500).json({ error: 'getMe failed' });
  }
};

export const getCurrentSession = async (req, res) => {
  try {
    if (!req.user?.jti) {
      return res.json({ valid: true, legacy: true, session: null });
    }
    const session = await getSessionById(req.user.jti);
    if (!session || session.status !== 'active') {
      return res.status(401).json({ error: 'SESSION_REVOKED', valid: false });
    }
    res.json({ valid: true, session: publicSession(session) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const heartbeat = async (req, res) => {
  try {
    if (!req.user?.jti) {
      return res.json({ valid: true, legacy: true });
    }
    const device = devicePayload(req);
    const session = await touchSession(req.user.jti, device);
    if (!session || session.status !== 'active') {
      return res.status(401).json({ error: 'SESSION_REVOKED', valid: false });
    }
    res.json({ valid: true, session: publicSession(session) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const logoutCurrent = async (req, res) => {
  try {
    if (req.user?.jti) {
      await revokeSession(req.user.jti, req.user.email || 'self');
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminListDevices = async (req, res) => {
  try {
    const devices = await listDevices();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminLastLogins = async (req, res) => {
  try {
    const logins = await listLastLogins();
    res.json(logins);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminDeviceSummary = async (req, res) => {
  try {
    const devices = await listDevices();
    res.json(devices.map((row) => ({
      userEmail: row.userEmail,
      deviceId: row.deviceId,
      deviceType: row.deviceType,
      deviceName: row.deviceName,
      lastSeen: row.lastSeen,
      hasActiveSession: row.hasActiveSession,
      environment: row.environment,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminListSessions = async (req, res) => {
  try {
    const sessions = await listSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminLogoutSession = async (req, res) => {
  try {
    const ended = await revokeSession(req.params.id, req.user?.email || 'admin');
    res.json({ success: ended, message: ended ? 'Session ended.' : 'Session was already inactive.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminLogoutDevice = async (req, res) => {
  try {
    const count = await revokeSessionsByDevice(req.params.deviceId, req.user?.email || 'admin');
    res.json({ success: true, ended: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminRestrictDevice = async (req, res) => {
  try {
    const result = await setDeviceRestricted(req.params.deviceId, true, req.user?.email || 'admin', req.body?.reason);
    res.json({ success: true, ...result, message: 'Device restricted. It cannot sign in until unrestricted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminUnrestrictDevice = async (req, res) => {
  try {
    const result = await setDeviceRestricted(req.params.deviceId, false, req.user?.email || 'admin');
    res.json({ success: true, ...result, message: 'Device unrestricted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const adminLogoutUser = async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || '');
    await revokeAllSessions(email, req.user?.email || 'admin');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
