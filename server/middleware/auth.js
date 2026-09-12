import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/jwtConfig.js';
import { getSessionById, isAdminAccount } from '../services/sessionService.js';

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, getJwtSecret(), async (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    if (!user?.jti) return next();
    try {
      const session = await getSessionById(user.jti);
      if (!session || session.status !== 'active') {
        return res.status(401).json({
          error: 'SESSION_REVOKED',
          message: 'This session was ended. Sign in again.',
        });
      }
      req.session = session;
      next();
    } catch (error) {
      console.error('Session check failed:', error.message);
      return res.status(500).json({ error: 'Session check failed' });
    }
  });
}

export function requireAdmin(req, res, next) {
  if (!isAdminAccount(req.user || {})) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function requireMasterUnlock(req, res, next) {
  const token = req.headers['x-master-unlock'] || req.body?.unlockToken;
  if (!token) {
    return res.status(401).json({ error: 'MASTER_UNLOCK_REQUIRED', message: 'Enter the master password to view this.' });
  }
  jwt.verify(token, getJwtSecret(), (err, payload) => {
    if (err || payload?.purpose !== 'master') {
      return res.status(401).json({ error: 'MASTER_UNLOCK_REQUIRED', message: 'Master password session expired. Enter it again.' });
    }
    req.masterUnlock = payload;
    next();
  });
}
