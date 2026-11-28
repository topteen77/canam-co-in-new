import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import fs from 'fs';
import https from 'https';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import Joi from 'joi';
import { createTransport } from 'nodemailer';
import { installFileLogger, expressErrorLogger } from './utils/fileLogger.js';

// --- IMPORTS FOR SERVICES ---
import db from './db.js'; // 👈 IMPORTING DB HERE
import * as attendanceService from './services/attendanceService.js';
import * as meetingService from './services/meetingService.js';
import * as leadController from './controllers/leadController.js';
import * as userService from './services/userService.js'; 
import * as activityService from './services/activityService.js'; 
import * as ctaService from './services/ctaService.js'
import * as documentService from './services/documentService.js';
import * as emailService from './services/emailService.js';
import * as leadTagService from './services/leadTagService.js';
import * as authController from './controllers/authController.js';
import { authenticateToken, requireAdmin, requireMasterUnlock } from './middleware/auth.js';
import { ensureTables as ensureSessionTables } from './services/sessionService.js';
import * as notificationService from './services/notificationService.js';
import * as passwordService from './services/passwordService.js';
import * as travelClaimsService from './services/travelClaimsService.js';
import * as callLogsService from './services/callLogsService.js';
import * as kommunoService from './services/kommunoService.js';
import * as companiesService from './services/companiesService.js';
import * as websiteSignupLeadsService from './services/websiteSignupLeadsService.js';
import * as importHistoryService from './services/importHistoryService.js';
import * as emailTemplatesService from './services/emailTemplatesService.js';
import * as emailCampaignsService from './services/emailCampaignsService.js';
import * as fieldConfigsService from './services/fieldConfigsService.js';
import * as locationMasterService from './services/locationMasterService.js';
import * as lostReasonMasterService from './services/lostReasonMasterService.js';
import * as leadsService from './services/leadsService.js';
import { SEED_STATES_BY_COUNTRY, SEED_CITY_TO_STATE } from './data/locationMasterSeed.js';
import {
  attachmentDownloadDisposition,
  inlinePreviewDisposition,
  wantsAttachmentDownload,
} from '../shared/documentAccess.js';
import { evaluateCheckInIdentity, canStartScheduledMeeting } from '../shared/meetingCheckInIdentity.js';
import { isAdminAccount } from './services/sessionService.js';

function readScheduledFollowUpIdFromNotes(notes) {
  const match = String(notes || '').match(/(?:^|\n)__followUpId:(\S+)/);
  return match?.[1] || '';
}
import * as trainingTargetsService from './services/trainingTargetsService.js';
import * as travelSessionsService from './services/travelSessionsService.js';
import * as meetingCompletionsService from './services/meetingCompletionsService.js';
import * as meetingAlertsService from './services/meetingAlertsService.js';
import {
  checkMailchimpAudience,
  loadMailchimpSettings,
  publicMailchimpStatus,
  saveMailchimpSettings,
  syncLeadToMailchimp,
  testMailchimpConnection,
} from './services/mailchimpService.js';
import * as webadminErrorService from './services/webadminErrorService.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });
installFileLogger();

const app = express();
const PORT = process.env.PORT || 5002;

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}
if (process.env.FORCE_HTTPS === '1' || process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.secure) return next();
    const host = req.get('host') || req.hostname || 'localhost';
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

const corsOrigins = [
  'https://agent-follow-up-crm.web.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3001',
  'http://10.0.0.118:3001',
  'http://10.0.0.118:3000',
  'http://43.204.23.58:3000',
  'http://43.204.23.58:5002',
  'https://canam.co.in:3000/',
  'https://canam.co.in:5002/',
  ...(process.env.PUBLIC_SITE_ORIGIN ? [process.env.PUBLIC_SITE_ORIGIN] : []),
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : []),
];

function isPrivateLanHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    if (corsOrigins.map((item) => item.replace(/\/$/, '')).includes(normalized)) {
      return callback(null, true);
    }
    try {
      if (isPrivateLanHost(new URL(origin).hostname)) return callback(null, true);
    } catch {
      // ignore
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/api/kommuno', express.text({ type: ['text/plain', 'text/html', 'application/javascript'], limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'canam-crm-api' });
});

// --- 🔎 DEBUG ROUTE (Now placed safely AFTER db import) ---
app.get('/api/leads/debug', async (req, res) => {
  try {
    const [names] = await db.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'leads' LIMIT 1"
    );
    if (!names[0]) {
      return res.status(404).json({ error: 'leads table not found', database: (await db.query('SELECT DATABASE() AS db'))[0][0].db });
    }
    const table = names[0].TABLE_NAME;
    const [rows] = await db.query('SELECT * FROM ?? LIMIT 1', [table]);
    res.json({ database: (await db.query('SELECT DATABASE() AS db'))[0][0].db, table, sample: rows[0] || null });
  } catch (error) {
    console.error("🔥 DEBUG ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- ATTENDANCE ROUTES (Consolidated and Fixed) ---

// ✅ GET ALL ATTENDANCE RECORDS
app.get('/api/attendance/all', async (req, res) => {
  try {
    console.log('📊 Fetching all attendance records...');
    const records = await attendanceService.getAllAttendanceRecords();
    console.log(`✅ Found ${records.length} attendance records`);
    res.json(records);
  } catch (error) { 
    console.error('❌ Error in /api/attendance/all:', error);
    res.status(500).json({ error: error.message }); 
  }
});

// ✅ ADD ATTENDANCE RECORD (Start Day)
app.post('/api/attendance/add', async (req, res) => {
  try {
    console.log('➕ Adding attendance record:', req.body);
    const result = await attendanceService.addAttendanceRecord(req.body);
    console.log('✅ Attendance record added:', result);
    res.json(result);
  } catch (error) { 
    console.error('❌ Error in /api/attendance/add:', error);
    res.status(500).json({ error: error.message }); 
  }
});

// ✅ UPDATE ATTENDANCE RECORD (End Day / Check Out) - FIXED ENDPOINT
app.put('/api/attendance/update/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📝 Updating attendance record ID:', id, 'with data:', req.body);
    
    const result = await attendanceService.updateAttendanceRecord(id, req.body);
    console.log('✅ Update result:', result);
    
    res.json(result);
  } catch (e) {
    console.error('❌ Error in /api/attendance/update:', e);
    res.status(500).json({ error: e.message });
  }
});

// ✅ GET SINGLE ATTENDANCE RECORD BY ID
app.get('/api/attendance/:id', async (req, res) => {
  try {
    const record = await attendanceService.getAttendanceRecordById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error) {
    console.error('❌ Error in /api/attendance/:id:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- REMOVE DUPLICATE/LEGACY ATTENDANCE ROUTES ---
// Delete these legacy routes as they conflict with the ones above
/*
export const getAllAttendance = async (req, res) => { ... } // CONFLICT
export const checkIn = async (req, res) => { ... } // CONFLICT  
export const checkOut = async (req, res) => { ... } // CONFLICT
*/

// --- MEETING ROUTES (Add missing /all endpoint) ---

// ✅ GET ALL MEETING RECORDS (This endpoint is missing but frontend expects it)
app.get('/api/meetings/all', async (req, res) => {
  try {
    console.log('📊 Fetching all meeting records...');
    let records;
    if (meetingService.getAllMeetings) {
      records = await meetingService.getAllMeetings();
    } else if (meetingService.getAllMeetingRecords) {
      records = await meetingService.getAllMeetingRecords();
    } else {
      records = [];
    }
    console.log(`✅ Found ${records.length} meeting records`);
    res.json(records);
  } catch (error) {
    console.error('❌ Error in /api/meetings/all:', error.message);
    // Return 200 with empty array so frontend does not break
    res.json([]);
  }
});

app.get('/api/meetings/user/:userId', async (req, res) => {
  try {
    const records = await meetingService.getMeetingsByUser(req.params.userId);
    res.json(records);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/meetings/add', async (req, res) => {
  try {
    await meetingService.addMeeting(req.body);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/meetings/presence', authenticateToken, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await meetingAlertsService.processMeetingPresence({
      ...body,
      email: req.user?.email || body.email,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/admin/meeting-alerts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const alerts = await meetingAlertsService.listMeetingAlerts();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/meetings/update/:id', async (req, res) => {
  try {
    await meetingService.updateMeeting(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ✅ ADD MEETING CHECK-IN — identity always comes from the auth token, never the client body
app.post('/api/meetings/check-in', authenticateToken, async (req, res) => {
  try {
    const sessionEmail = String(req.user?.email || '').trim();
    if (!sessionEmail) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Sign in again before starting a meeting.' });
    }

    const body = req.body || {};
    let accountManager = '';
    if (body.leadId) {
      try {
        const lead = await leadsService.getLeadById(body.leadId);
        accountManager = lead?.accountManager || lead?.account_manager || '';
      } catch (leadErr) {
        console.warn('Meeting check-in lead lookup failed:', leadErr.message);
      }
    }

    let users = [];
    try {
      users = await userService.getAllUsers();
    } catch (usersErr) {
      console.warn('Meeting check-in users lookup failed:', usersErr.message);
    }
    const sessionUser = (users || []).find(
      (u) => String(u?.email || '').trim().toLowerCase() === sessionEmail.toLowerCase()
    );

    // Starting a *planned* follow-up meeting is allowed only for the scheduler (createdBy).
    // Other users may still view the card; they cannot start it.
    const followUpId = String(
      body.followUpId || readScheduledFollowUpIdFromNotes(body.notes) || ''
    ).trim();
    if (followUpId && body.leadId) {
      try {
        const lead = await leadsService.getLeadById(body.leadId);
        const followUps = Array.isArray(lead?.followUps) ? lead.followUps : [];
        const planned = followUps.find((f) => String(f?.id) === followUpId);
        if (planned) {
          const ownership = canStartScheduledMeeting({
            currentUserEmail: sessionEmail,
            currentUserName: sessionUser?.name || '',
            createdBy: planned.createdBy || '',
            users,
          });
          if (!ownership.allowed) {
            return res.status(403).json({
              error: 'NOT_MEETING_OWNER',
              message: ownership.message,
              ownerEmail: ownership.ownerEmail,
              ownerLabel: ownership.ownerLabel,
              canOverride: false,
            });
          }
        }
      } catch (ownerErr) {
        console.warn('Meeting ownership pre-check failed:', ownerErr.message);
      }
    }

    const identity = evaluateCheckInIdentity({
      currentUserEmail: sessionEmail,
      currentUserName: sessionUser?.name || '',
      salesPersonName: body.salesPersonName || '',
      accountManager,
      users,
    });

    if (!identity.match) {
      if (body.confirmIdentityOverride !== true) {
        return res.status(403).json({
          error: identity.code || 'IDENTITY_MISMATCH',
          message: identity.message,
          conflictingEmail: identity.conflictingEmail,
          conflictingLabel: identity.conflictingLabel,
          canOverride: true,
          canLogout: true,
        });
      }
      console.warn(
        `⚠️ ${sessionEmail} confirmed meeting identity mismatch override (expected ${identity.conflictingEmail})`
      );
    }

    // Block a second concurrent active meeting for this user
    try {
      const existing = await meetingService.getMeetingsByUser(sessionEmail);
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const todayKey = `${y}-${m}-${d}`;
      const activeExisting = (existing || []).find((row) => {
        const status = String(row.meetingStatus || '').trim().toLowerCase();
        if (status !== 'active') return false;
        if (row.checkOutTime) return false;
        const day = String(row.date || row.checkInTime || '').slice(0, 10);
        return day === todayKey;
      });
      if (activeExisting) {
        return res.status(409).json({
          error: 'ACTIVE_MEETING_EXISTS',
          message: 'You already have a meeting in progress. End that meeting before starting another.',
          activeMeetingId: activeExisting.id || activeExisting.firebase_id || null,
          leadName: activeExisting.leadName || null,
        });
      }
    } catch (activeErr) {
      console.warn('Active meeting pre-check failed:', activeErr.message);
    }

    // Always persist a client name when leadId is known
    let leadName = String(body.leadName || '').trim();
    let leadId = String(body.leadId || '').trim();
    if (leadId && !leadName) {
      try {
        const lead = await leadsService.getLeadById(leadId);
        leadName = String(lead?.agencyName || lead?.agency_name || '').trim();
      } catch (leadNameErr) {
        console.warn('Meeting check-in leadName lookup failed:', leadNameErr.message);
      }
    }
    if (!leadId || !leadName) {
      return res.status(400).json({
        error: 'LEAD_REQUIRED',
        message: 'Select a client / lead before starting the meeting.',
      });
    }

    const payload = {
      ...body,
      leadId,
      leadName,
      username: sessionEmail,
      createdBy: sessionEmail,
    };
    delete payload.confirmIdentityOverride;

    console.log('🤝 Meeting check-in received for', sessionEmail, leadName || leadId || '');

    let result;
    if (meetingService.addMeetingCheckIn) {
      result = await meetingService.addMeetingCheckIn(payload);
    } else if (meetingService.addMeetingCheckInRecord) {
      result = await meetingService.addMeetingCheckInRecord(payload);
    } else {
      result = await meetingService.addMeeting(payload);
    }

    res.json(result || { success: true, username: sessionEmail });
  } catch (error) {
    console.error('❌ Error in /api/meetings/check-in:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- PASSWORD ROUTES ---

// 1. Set Default Password (for single user)
app.post('/api/password/set-default', async (req, res) => {
  try {
      // req.body = { userId, userData }
      const result = await passwordService.setDefaultPassword(req.body.userId, req.body.userData);
      res.json(result);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// 2. Verify Password (Login helper)
app.post('/api/password/verify', async (req, res) => {
  try {
      const result = await passwordService.verifyPassword(req.body.email, req.body.password);
      if (result.success) {
          res.json(result);
      } else {
          res.status(401).json(result);
      }
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// 3. Reset All Passwords (Admin only)
app.post('/api/password/generate-all', async (req, res) => {
  try {
      const result = await passwordService.generateAllPasswords();
      res.json(result);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// 4. Change password (user: current + new)
app.post('/api/password/change', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    const result = await passwordService.changePassword(email, currentPassword, newPassword);
    if (result.success) res.json(result);
    else res.status(400).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5. Set initial password (no current required)
app.post('/api/password/set-initial', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const result = await passwordService.setInitialPassword(email, newPassword);
    if (result.success) res.json(result);
    else res.status(400).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- USER ROUTES ---
app.get('/api/users', async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/users/by-email/:email', async (req, res) => {
  try {
    const user = await userService.getUserByEmail(req.params.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.put('/api/users/:id', async (req, res) => {
  try {
    await userService.updateUser(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});
app.post('/api/users', async (req, res) => {
  try {
    const result = await userService.createUser(req.body);
    res.status(201).json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP attempts. Try again later.' },
});

app.post('/api/auth/login', authController.login);
app.post('/api/auth/register', authController.register);
// Localhost / private-network only (returns 404 on production host)
app.get('/api/auth/dev-quick-users', authController.listDevQuickUsers);
app.post('/api/auth/dev-quick-login', authController.devQuickLogin);
app.get('/api/auth/me', authenticateToken, authController.getMe);
app.post('/api/auth/force-login/request-otp', otpLimiter, authController.requestAdminForceLoginOtp);
app.post('/api/auth/force-login', otpLimiter, authController.adminForceLogin);
app.get('/api/auth/session', authenticateToken, authController.getCurrentSession);
app.post('/api/auth/session/heartbeat', authenticateToken, authController.heartbeat);
app.post('/api/auth/session/location', authenticateToken, authController.updateLoginLocation);
app.post('/api/auth/logout', authenticateToken, authController.logoutCurrent);
app.post('/api/admin/master/unlock', otpLimiter, authenticateToken, requireAdmin, authController.unlockMaster);
app.get('/api/admin/login-intel', authenticateToken, requireAdmin, requireMasterUnlock, authController.adminLoginIntel);
app.get('/api/admin/device-summary', authenticateToken, requireAdmin, authController.adminDeviceSummary);
app.get('/api/admin/last-logins', authenticateToken, requireAdmin, authController.adminLastLogins);
app.get('/api/admin/devices', authenticateToken, requireAdmin, requireMasterUnlock, authController.adminListDevices);
app.get('/api/admin/sessions', authenticateToken, requireAdmin, requireMasterUnlock, authController.adminListSessions);
app.post('/api/admin/sessions/:id/logout', authenticateToken, requireAdmin, requireMasterUnlock, authController.adminLogoutSession);
app.post('/api/admin/devices/:deviceId/logout', authenticateToken, requireAdmin, requireMasterUnlock, authController.adminLogoutDevice);
app.post('/api/admin/devices/:deviceId/restrict', authenticateToken, requireAdmin, requireMasterUnlock, authController.adminRestrictDevice);
app.post('/api/admin/devices/:deviceId/unrestrict', authenticateToken, requireAdmin, requireMasterUnlock, authController.adminUnrestrictDevice);
app.post('/api/admin/users/:email/logout-all', authenticateToken, requireAdmin, requireMasterUnlock, authController.adminLogoutUser);

// --- ACTIVITY LOG ROUTES ---
app.get('/api/activities', async (req, res) => {
  try {
    const activities = await activityService.getAllActivities();
    res.json(activities);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- LEAD TAG ROUTES ---

// 1. Get all tags
app.get('/api/tags', async (req, res) => {
  const tags = await leadTagService.getLeadTags();
  res.json(tags);
});

// 2. Add a new tag
app.post('/api/tags', async (req, res) => {
  try {
      // Frontend sends { name: "Hot" }
      const result = await leadTagService.addLeadTag(req.body.name);
      res.json(result);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// --- CTA TRACKING ROUTES ---
app.post('/api/cta/add', async (req, res) => {
  try {
    const result = await ctaService.addCTAActivity(req.body);
    res.json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/cta/update/:id', async (req, res) => {
  try {
    await ctaService.updateCTAActivity(req.params.id, req.body);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/cta/recent', async (req, res) => {
  try {
    const activities = await ctaService.getRecentActivities();
    res.json(activities);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- DOCUMENT ROUTES ---
// Get all docs for a lead
app.get('/api/documents/lead/:leadId', async (req, res) => {
  const docs = await documentService.getDocumentsForLead(req.params.leadId);
  res.json(docs);
});

// Get specific doc type
app.get('/api/documents/type/:leadId/:type', async (req, res) => {
  const doc = await documentService.getDocumentByType(req.params.leadId, req.params.type);
  res.json(doc); // Returns null if not found, which handles the "empty string" case
});

// Delete doc
app.delete('/api/documents/:id', async (req, res) => {
  try {
      await documentService.deleteDocument(req.params.id);
      res.json({ success: true });
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// Upload doc
app.post('/api/documents/upload', async (req, res) => {
  try {
      const result = await documentService.uploadDocument(req.body);
      res.json(result);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// Get all (Admin)
app.get('/api/documents/all', async (req, res) => {
  const docs = await documentService.getAllDocuments();
  res.json(docs);
});

// --- EMAIL ROUTES ---
app.post('/api/email/send', async (req, res) => {
  try {
      const result = await emailService.sendEmail(req.body);
      if (result.success) {
          res.json(result);
      } else {
          res.status(500).json(result);
      }
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// --- NOTIFICATION PREFERENCES ROUTES ---

// 1. Get Preferences
app.get('/api/preferences/:userId', async (req, res) => {
  const prefs = await notificationService.getPreferences(req.params.userId);
  res.json(prefs);
});

// 2. Save Preferences
app.post('/api/preferences/save', async (req, res) => {
  try {
      await notificationService.savePreferences(req.body);
      res.json({ success: true });
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// --- LEADS ROUTES ---
app.get('/api/leads/all', leadController.getAllLeads);
app.get('/api/leads/:id/owner-history', leadController.getLeadOwnerHistory);
app.get('/api/leads/:id', leadController.getLeadById);
app.post('/api/leads/add', leadController.addLead);
app.put('/api/leads/update/:id', leadController.updateLead);
app.post('/api/leads/:id/followups', leadController.appendFollowUp);
app.delete('/api/leads/delete/:id', leadController.deleteLead);

app.post('/api/auth/sync-user', async (req, res) => {
  try {
    const { resolveTableNameOrFallback } = await import('./utils/tableResolver.js');
    const table = await resolveTableNameOrFallback(['users', 'Users'], 'users');
    const { id, email, name, role, status } = req.body;
    await db.query(
      `INSERT INTO ${table} (id, email, name, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE name = VALUES(name), last_active = NOW()`,
      [id, email, name, role, status]
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- TRAVEL CLAIMS ---
app.get('/api/travel-claims', async (req, res) => {
  try {
    const list = await travelClaimsService.getAllTravelClaims();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/travel-claims/user/:userEmail', async (req, res) => {
  try {
    const list = await travelClaimsService.getTravelClaimsByUser(req.params.userEmail);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/travel-claims', async (req, res) => {
  try {
    const result = await travelClaimsService.addTravelClaim(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/travel-claims/:id', async (req, res) => {
  try {
    await travelClaimsService.updateTravelClaim(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- CALL LOGS ---
app.get('/api/call-logs', async (req, res) => {
  try {
    const list = await callLogsService.getAllCallLogs({ limit: req.query.limit ? parseInt(req.query.limit, 10) : null });
    res.json(list.map((row) => ({ ...row, recording_saved: kommunoService.recordingIsStored(row.recording_url) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/call-logs/lead/:leadId', async (req, res) => {
  try {
    const list = await callLogsService.getCallLogsByLead(req.params.leadId);
    res.json(list.map((row) => ({ ...row, recording_saved: kommunoService.recordingIsStored(row.recording_url) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/call-logs', async (req, res) => {
  try {
    const result = await callLogsService.addCallLog(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Call API integration (Kommuno).
// Kommuno posts the call status to one URL: https://canam.co.in/api/kommuno/callback
// The same handler also accepts /webhook, /incoming, and /recording.
// Admin save runs a blank-number API test. Non-admin call icons stay hidden until that test succeeds.
async function handleKommunoWebhook(req, res) {
  try {
    if (!kommunoService.webhookAuthorized(req)) {
      return res.status(401).json({ status: 401, message: 'Unauthorized' });
    }
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = { raw: body }; }
    }
    const result = await kommunoService.ingest(body || {});
    res.json({ status: 200, message: 'ok', ...result });
  } catch (error) {
    console.error('Kommuno webhook failed:', error.message);
    res.status(500).json({ status: 500, message: error.message });
  }
}

app.get('/api/call-recordings/:id', async (req, res) => {
  try {
    const filePath = await kommunoService.recordingFileFor(req.params.id);
    if (!filePath) return res.status(404).json({ error: 'Recording not found' });
    res.setHeader('Content-Type', kommunoService.recordingContentType(filePath));
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
  } catch (error) {
    console.error('Call recording play failed:', error.message);
    res.status(500).json({ error: 'Could not play the recording' });
  }
});
app.post('/api/kommuno/webhook', handleKommunoWebhook);
app.post('/api/kommuno/callback', handleKommunoWebhook);
app.post('/api/kommuno/incoming', handleKommunoWebhook);
app.post('/api/kommuno/recording', handleKommunoWebhook);
app.get('/api/kommuno/status', async (_req, res) => {
  try {
    if (!kommunoService.status().configured) await kommunoService.loadKommunoSettings();
  } catch (error) {
    console.error('Kommuno settings reload failed:', error.message);
  }
  res.json(kommunoService.status());
});
app.get('/api/kommuno/live', async (req, res) => {
  try {
    const calls = await kommunoService.liveForUser(req.query.email || '');
    res.json({ calls });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/kommuno/click-to-call', async (req, res) => {
  try {
    const result = await kommunoService.clickToCall(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.get('/api/admin/call-recordings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json(await kommunoService.listStoredRecordings(req.query || {}));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not list recordings.' });
  }
});
app.put('/api/admin/call-recordings/:id/keep', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json(await kommunoService.setRecordingKeep(req.params.id, req.body?.keep));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not update the keep flag.' });
  }
});
app.post('/api/admin/call-recordings/delete', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json(await kommunoService.deleteStoredRecordings(req.body?.ids || []));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not remove recordings.' });
  }
});
app.get('/api/admin/call-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json(await kommunoService.listOldCallLogs(req.query || {}));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not list old call logs.' });
  }
});
app.post('/api/admin/call-logs/delete', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.json(await kommunoService.deleteOldCallLogs(req.body?.ids || []));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not remove call logs.' });
  }
});
app.get('/api/admin/kommuno', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    await kommunoService.loadKommunoSettings();
    res.json(kommunoService.publicKommunoSettings());
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not load Kommuno settings.' });
  }
});
app.put('/api/admin/kommuno', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const saved = await kommunoService.saveKommunoSettings(req.body || {}, req.user?.email || req.user?.name || 'admin');
    res.json(saved);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not save Kommuno settings.' });
  }
});

// --- COMPANIES (SuperAdmin / multi-tenant) ---
app.get('/api/companies', async (req, res) => {
  try {
    const list = await companiesService.getAllCompanies();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/companies/:id', async (req, res) => {
  try {
    const company = await companiesService.getCompanyById(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/companies', async (req, res) => {
  try {
    const result = await companiesService.addCompany(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/companies/:id', async (req, res) => {
  try {
    await companiesService.updateCompany(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete('/api/companies/:id', async (req, res) => {
  try {
    await companiesService.deleteCompany(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/companies/:id/users', async (req, res) => {
  try {
    const list = await companiesService.getCompanyUsers(req.params.id);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/companies/:id/users', async (req, res) => {
  try {
    const result = await companiesService.addCompanyUser({ ...req.body, companyId: req.params.id });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- FIREBASE PROJECTS (projects in MySQL) ---
app.get('/api/firebase-projects', async (req, res) => {
  try {
    const list = await companiesService.getAllFirebaseProjects();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/firebase-projects', async (req, res) => {
  try {
    const result = await companiesService.addFirebaseProject(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/firebase-projects/:id', async (req, res) => {
  try {
    await companiesService.updateFirebaseProject(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete('/api/firebase-projects/:id', async (req, res) => {
  try {
    await companiesService.deleteFirebaseProject(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- WEBSITE SIGNUP LEADS ---
app.get('/api/website-signup-leads', async (req, res) => {
  try {
    const list = await websiteSignupLeadsService.getAllWebsiteSignupLeads({ limit: req.query.limit ? parseInt(req.query.limit, 10) : null });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/website-signup-leads', async (req, res) => {
  try {
    const result = await websiteSignupLeadsService.addWebsiteSignupLead(req.body);
    let mailchimp = { ok: false, status: 'error', detail: 'Mailchimp sync did not run.' };
    try {
      mailchimp = await syncLeadToMailchimp(
        { ...req.body, form_id: 'crm_agent_lead' },
        { source: 'crm_agent_lead', leadId: result.id }
      );
    } catch (syncError) {
      mailchimp = { ok: false, status: 'error', detail: syncError.message || 'Mailchimp sync failed.' };
    }
    res.json({ ...result, mailchimp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function mailchimpLocalOnly(req, res, next) {
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  if (ip === '127.0.0.1' || ip === '::1' || ip.endsWith('127.0.0.1')) return next();
  return res.status(403).json({ ok: false, detail: 'Open this check on the server: curl http://127.0.0.1:5002/api/mailchimp/status' });
}

app.get('/api/mailchimp/status', mailchimpLocalOnly, async (_req, res) => {
  const result = await checkMailchimpAudience();
  res.json(result);
});

app.get('/api/admin/mailchimp', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    await loadMailchimpSettings();
    const ping = await checkMailchimpAudience();
    res.json(publicMailchimpStatus(undefined, ping));
  } catch (error) {
    res.status(500).json({ ok: false, detail: error.message || 'Could not load Mailchimp settings.' });
  }
});

app.put('/api/admin/mailchimp', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const saved = await saveMailchimpSettings({
      apiKey: req.body?.apiKey,
      audienceId: req.body?.audienceId,
      studentsAudienceId: req.body?.studentsAudienceId,
      updatedBy: req.user?.email || req.user?.name || 'admin',
    });
    if (!saved.configured) {
      return res.status(400).json(saved);
    }
    const ping = await checkMailchimpAudience();
    res.json(publicMailchimpStatus(undefined, ping));
  } catch (error) {
    res.status(500).json({ ok: false, detail: error.message || 'Could not save Mailchimp settings.' });
  }
});

app.post('/api/admin/mailchimp/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await testMailchimpConnection(req.body || {});
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, detail: error.message || 'Mailchimp test failed.' });
  }
});

app.get('/api/admin/webadmin-error-email', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const settings = await webadminErrorService.getWebadminErrorSettings();
    res.json({ ok: true, ...settings });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Could not load webadmin error email.' });
  }
});

app.put('/api/admin/webadmin-error-email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = await webadminErrorService.saveWebadminErrorSettings({
      email: req.body?.email,
      enabled: req.body?.enabled !== false && req.body?.enabled !== 0 && req.body?.enabled !== '0',
      updatedBy: req.user?.email || req.user?.name || 'admin',
    });
    res.json({ ok: true, ...settings });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not save webadmin error email.' });
  }
});

app.post('/api/admin/webadmin-error-email/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await webadminErrorService.sendWebadminTestEmail(req.user?.email || '');
    if (!result.sent) {
      return res.status(400).json({ ok: false, ...result, error: result.reason || 'Test email was not sent.' });
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Test email failed.' });
  }
});

const clientErrorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many error reports. Try again later.' },
});

app.post('/api/client-errors', clientErrorLimiter, authenticateToken, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await webadminErrorService.reportClientError({
      name: String(body.name || 'Error').slice(0, 120),
      message: String(body.message || 'Unknown error').slice(0, 2000),
      stack: String(body.stack || '').slice(0, 12000),
      componentStack: String(body.componentStack || '').slice(0, 8000),
      source: String(body.source || 'client').slice(0, 200),
      url: String(body.url || '').slice(0, 2000),
      time: String(body.time || new Date().toISOString()).slice(0, 80),
      report: String(body.report || '').slice(0, 20000),
      userAgent: String(body.userAgent || req.headers['user-agent'] || '').slice(0, 500),
      viewport: String(body.viewport || '').slice(0, 80),
      appVersion: String(body.appVersion || '').slice(0, 80),
      userEmail: req.user?.email || String(body.userEmail || '').slice(0, 255),
      userName: String(body.userName || '').slice(0, 255),
      userRole: req.user?.role || String(body.userRole || '').slice(0, 120),
      userId: req.user?.id || String(body.userId || '').slice(0, 255),
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Could not report error.' });
  }
});

app.post('/api/mailchimp/test', mailchimpLocalOnly, async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) {
    return res.status(400).json({ ok: false, detail: 'Send JSON { "email": "you@example.com", "full_name": "Test User", "consent": { "email": false } }.' });
  }
  const mailchimp = await syncLeadToMailchimp({
    email,
    full_name: req.body.full_name || req.body.fullName || 'Mailchimp Test',
    phone: req.body.phone || '',
    form_id: req.body.form_id || 'become_partner',
    step: req.body.step || 'account',
    consent: req.body.consent || { email: false },
  }, { source: req.body.form_id || 'become_partner', leadId: 'manual-test' });
  res.json(mailchimp);
});
app.put('/api/website-signup-leads/:id', async (req, res) => {
  try {
    await websiteSignupLeadsService.updateWebsiteSignupLead(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- IMPORT HISTORY ---
app.get('/api/import-history', async (req, res) => {
  try {
    const list = await importHistoryService.getAllImportHistory({ limit: req.query.limit ? parseInt(req.query.limit, 10) : 50 });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/import-history', async (req, res) => {
  try {
    const result = await importHistoryService.addImportHistory(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- EMAIL TEMPLATES ---
app.get('/api/email-templates', async (req, res) => {
  try {
    const list = await emailTemplatesService.getAllEmailTemplates();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/email-templates/:id', async (req, res) => {
  try {
    const template = await emailTemplatesService.getEmailTemplateById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/email-templates', async (req, res) => {
  try {
    const result = await emailTemplatesService.addEmailTemplate(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/email-templates/:id', async (req, res) => {
  try {
    await emailTemplatesService.updateEmailTemplate(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete('/api/email-templates/:id', async (req, res) => {
  try {
    await emailTemplatesService.deleteEmailTemplate(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- EMAIL CAMPAIGNS ---
app.get('/api/email-campaigns', async (req, res) => {
  try {
    const list = await emailCampaignsService.getAllEmailCampaigns();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/email-campaigns', async (req, res) => {
  try {
    const result = await emailCampaignsService.addEmailCampaign(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/email-campaigns/:id', async (req, res) => {
  try {
    await emailCampaignsService.updateEmailCampaign(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- LOCATION MASTER (City / State) ---
app.get('/api/location-master/bundle', async (_req, res) => {
  try {
    await locationMasterService.seedDefaultsIfEmpty({
      statesByCountry: SEED_STATES_BY_COUNTRY,
      cityToState: SEED_CITY_TO_STATE,
    });
    const bundle = await locationMasterService.getLocationBundle();
    res.json(bundle);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/location-master/states', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await locationMasterService.listStates({
      country: req.query.country,
      q: req.query.q,
    });
    res.json(rows);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.post('/api/location-master/states', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await locationMasterService.upsertState(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.put('/api/location-master/states/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await locationMasterService.upsertState({ ...(req.body || {}), id: req.params.id });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.delete('/api/location-master/states/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await locationMasterService.deleteState(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.get('/api/location-master/cities', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const rows = await locationMasterService.listCities({
      country: req.query.country,
      state: req.query.state,
      q: req.query.q,
    });
    res.json(rows);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.post('/api/location-master/cities', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await locationMasterService.upsertCity(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.put('/api/location-master/cities/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await locationMasterService.upsertCity({ ...(req.body || {}), id: req.params.id });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.delete('/api/location-master/cities/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await locationMasterService.deleteCity(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.post('/api/location-master/seed', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const result = await locationMasterService.seedDefaultsIfEmpty({
      statesByCountry: SEED_STATES_BY_COUNTRY,
      cityToState: SEED_CITY_TO_STATE,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LOST REASON MASTER ---
app.get('/api/lost-reason-master', authenticateToken, async (req, res) => {
  try {
    await lostReasonMasterService.seedDefaultsIfEmpty();
    const wantInactive = String(req.query.includeInactive || '') === 'true' || String(req.query.includeInactive || '') === '1';
    const { isAdminAccount } = await import('./services/sessionService.js');
    const rows = await lostReasonMasterService.listLostReasons({
      includeInactive: wantInactive && isAdminAccount(req.user || {}),
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/lost-reason-master', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await lostReasonMasterService.upsertLostReason(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.put('/api/lost-reason-master/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await lostReasonMasterService.upsertLostReason({ ...(req.body || {}), id: req.params.id });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.delete('/api/lost-reason-master/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await lostReasonMasterService.deleteLostReason(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.post('/api/lost-reason-master/ensure', authenticateToken, async (req, res) => {
  try {
    const result = await lostReasonMasterService.ensureReasonExists(req.body?.name);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// --- TRAINING / ONBOARDING / TEAM TARGETS ---
app.get('/api/training/meta', authenticateToken, async (_req, res) => {
  try {
    res.json({
      modules: trainingTargetsService.TRAINING_MODULES,
      limits: trainingTargetsService.TRAINING_LIMITS,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/training/documents', authenticateToken, async (_req, res) => {
  try {
    const rows = await trainingTargetsService.listTrainingDocuments();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/training/documents/:id/download', authenticateToken, async (req, res) => {
  try {
    const doc = await trainingTargetsService.getTrainingDocument(req.params.id, { includeData: true });
    if (!doc || !doc.fileData) return res.status(404).json({ error: 'Document not found' });
    const buffer = Buffer.isBuffer(doc.fileData) ? doc.fileData : Buffer.from(doc.fileData);
    const asAttachment = wantsAttachmentDownload(req.query);
    res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      asAttachment
        ? attachmentDownloadDisposition(doc.fileName || 'training')
        : inlinePreviewDisposition(doc.fileName || 'training')
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/training/documents', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const row = await trainingTargetsService.createTrainingDocument(req.body || {}, req.user?.email || '');
    res.status(201).json(row);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.put('/api/training/documents/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const row = await trainingTargetsService.updateTrainingDocument(req.params.id, req.body || {});
    res.json(row);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.delete('/api/training/documents/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await trainingTargetsService.deleteTrainingDocument(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.get('/api/training/targets', authenticateToken, async (req, res) => {
  try {
    const { isAdminAccount } = await import('./services/sessionService.js');
    const admin = isAdminAccount(req.user || {});
    const email = admin ? (req.query.userEmail || undefined) : req.user?.email;
    const rows = await trainingTargetsService.listTeamTargets(
      admin && !req.query.userEmail ? {} : { userEmail: email }
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/training/targets', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const row = await trainingTargetsService.upsertTeamTarget(req.body || {}, req.user?.email || '');
    res.json(row);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.put('/api/training/targets/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const row = await trainingTargetsService.upsertTeamTarget({ ...(req.body || {}), id: req.params.id }, req.user?.email || '');
    res.json(row);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});
app.delete('/api/training/targets/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await trainingTargetsService.deleteTeamTarget(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// --- FIELD CONFIGS ---
app.get('/api/field-configs', async (req, res) => {
  try {
    const list = await fieldConfigsService.getAllFieldConfigs();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/field-configs/:id', async (req, res) => {
  try {
    const config = await fieldConfigsService.getFieldConfigById(req.params.id);
    if (!config) return res.status(404).json({ error: 'Field config not found' });
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/field-configs', async (req, res) => {
  try {
    const { id, ...data } = req.body;
    const configId = id || `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await fieldConfigsService.setFieldConfig(configId, { ...data, id: configId });
    res.json({ success: true, id: configId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/field-configs/:id', async (req, res) => {
  try {
    await fieldConfigsService.updateFieldConfig(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- TRAVEL SESSIONS ---
app.get('/api/travel-sessions', async (req, res) => {
  try {
    const list = await travelSessionsService.getAllTravelSessions({ limit: req.query.limit ? parseInt(req.query.limit, 10) : null });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/travel-sessions', async (req, res) => {
  try {
    const result = await travelSessionsService.addTravelSession(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- MEETING COMPLETIONS ---
app.get('/api/meeting-completions/meeting/:meetingId', async (req, res) => {
  try {
    const list = await meetingCompletionsService.getMeetingCompletionsByMeetingId(req.params.meetingId);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/meeting-completions', async (req, res) => {
  try {
    const result = await meetingCompletionsService.addMeetingCompletion(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- DATABASE DEBUG ROUTE ---
app.get('/api/debug/attendance', async (req, res) => {
  try {
    const records = await attendanceService.getAllAttendanceRecords();
    res.json((records || []).slice(0, 10));
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- START SERVER ---
const useHttps = process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH;
const httpsPort = process.env.HTTPS_PORT ? parseInt(process.env.HTTPS_PORT, 10) : PORT;

ensureSessionTables().then(() => {
  console.log('✅ Session and device tables ready');
}).catch((err) => {
  console.error('⚠️ Could not prepare session tables:', err.message);
});

locationMasterService.ensureLocationMasterTables()
  .then(() => locationMasterService.seedDefaultsIfEmpty({
    statesByCountry: SEED_STATES_BY_COUNTRY,
    cityToState: SEED_CITY_TO_STATE,
  }))
  .then((result) => {
    console.log(result?.seeded ? '✅ Location master seeded' : '✅ Location master tables ready');
  })
  .catch((err) => {
    console.error('⚠️ Could not prepare location master:', err.message);
  });

lostReasonMasterService.ensureLostReasonMasterTables()
  .then(() => lostReasonMasterService.seedDefaultsIfEmpty())
  .then((result) => {
    console.log(result?.seeded ? '✅ Lost reason master seeded' : '✅ Lost reason master ready');
  })
  .catch((err) => {
    console.error('⚠️ Could not prepare lost reason master:', err.message);
  });

leadsService.ensureLostReasonColumn()
  .then((result) => {
    console.log(result?.created ? '✅ leads.lostReason column added' : '✅ leads.lostReason column ready');
  })
  .catch((err) => {
    console.error('⚠️ Could not ensure leads.lostReason column:', err.message);
  });

loadMailchimpSettings().then(() => {
  console.log('✅ Mailchimp settings ready');
}).catch((err) => {
  console.error('⚠️ Could not prepare Mailchimp settings:', err.message);
});

webadminErrorService.ensureWebadminErrorTables().then(() => {
  console.log('✅ Webadmin error email settings ready');
}).catch((err) => {
  console.error('⚠️ Could not prepare webadmin error email settings:', err.message);
});

kommunoService.ensureKommuno().then(() => {
  const cfg = kommunoService.status();
  console.log(`✅ Kommuno call webhook ready at ${cfg.webhookUrl}`);
  if (!cfg.configured) console.log(`⚠️ Kommuno click-to-call waiting for: ${cfg.missing.join(', ')}`);
}).catch((err) => {
  console.error('⚠️ Could not prepare Kommuno tables:', err.message);
});

app.use(expressErrorLogger);

function startListening() {
  // Always bind plain HTTP on PORT. Production nginx terminates TLS and
  // proxies to http://127.0.0.1:5002 — HTTPS-only listen here causes 502.
  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`   - Local: http://localhost:${PORT}`);
    console.log(`   - Network: http://127.0.0.1:${PORT}`);
  });
  httpServer.on('error', (err) => {
    console.error('❌ HTTP listen failed on port', PORT, err.message);
    process.exit(1);
  });

  // Optional direct HTTPS on a *different* port only (never replace nginx upstream).
  if (useHttps && httpsPort !== PORT) {
    try {
      const keyPath = path.isAbsolute(process.env.SSL_KEY_PATH)
        ? process.env.SSL_KEY_PATH
        : path.resolve(__dirname, '..', process.env.SSL_KEY_PATH);
      const certPath = path.isAbsolute(process.env.SSL_CERT_PATH)
        ? process.env.SSL_CERT_PATH
        : path.resolve(__dirname, '..', process.env.SSL_CERT_PATH);
      const key = fs.readFileSync(keyPath, 'utf8');
      const cert = fs.readFileSync(certPath, 'utf8');
      const httpsServer = https.createServer({ key, cert }, app);
      httpsServer.listen(httpsPort, '0.0.0.0', () => {
        console.log(`✅ HTTPS server also on port ${httpsPort}`);
      });
    } catch (err) {
      console.error('⚠️ Extra HTTPS listen skipped:', err.message);
    }
  }
}

startListening();