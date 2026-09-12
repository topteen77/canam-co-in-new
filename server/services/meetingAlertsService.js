import crypto from 'node:crypto';
import db from '../db.js';
import { getAllMeetings } from './meetingService.js';

const LEAVE_METERS = 250;
const RETURN_METERS = 100;
const LEFT_COOLDOWN_MS = 15 * 60 * 1000;
let tablesReady = false;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (Number(v) * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function newId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
}

function parseLocation(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function ensureMeetingAlertTables() {
  if (tablesReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS meeting_alerts (
      id VARCHAR(64) PRIMARY KEY,
      meeting_id VARCHAR(128) NOT NULL,
      user_email VARCHAR(255) NOT NULL,
      user_name VARCHAR(255) DEFAULT '',
      lead_id VARCHAR(128) DEFAULT '',
      lead_name VARCHAR(255) DEFAULT '',
      alert_type VARCHAR(32) NOT NULL,
      distance_m INT DEFAULT 0,
      meeting_address VARCHAR(512) DEFAULT '',
      current_address VARCHAR(512) DEFAULT '',
      current_lat DECIMAL(10,7) NULL,
      current_lng DECIMAL(10,7) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_meeting_alerts_created (created_at),
      INDEX idx_meeting_alerts_meeting (meeting_id, alert_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  tablesReady = true;
}

export async function createMeetingAlert(data) {
  await ensureMeetingAlertTables();
  const id = newId();
  await db.query(
    `INSERT INTO meeting_alerts
      (id, meeting_id, user_email, user_name, lead_id, lead_name, alert_type, distance_m, meeting_address, current_address, current_lat, current_lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      String(data.meetingId || ''),
      String(data.userEmail || '').toLowerCase(),
      data.userName || '',
      data.leadId || '',
      data.leadName || '',
      data.alertType,
      Math.round(Number(data.distanceM) || 0),
      data.meetingAddress || '',
      data.currentAddress || '',
      data.currentLat ?? null,
      data.currentLng ?? null,
    ]
  );
  return { id, ...data };
}

export async function listMeetingAlerts(limit = 80) {
  await ensureMeetingAlertTables();
  const [rows] = await db.query(
    `SELECT * FROM meeting_alerts ORDER BY created_at DESC LIMIT ?`,
    [Number(limit) || 80]
  );
  return rows.map((row) => ({
    id: row.id,
    meetingId: row.meeting_id,
    userEmail: row.user_email,
    userName: row.user_name,
    leadId: row.lead_id,
    leadName: row.lead_name,
    alertType: row.alert_type,
    distanceM: row.distance_m,
    meetingAddress: row.meeting_address,
    currentAddress: row.current_address,
    currentLat: row.current_lat,
    currentLng: row.current_lng,
    createdAt: row.created_at,
  }));
}

async function recentAlert(meetingId, alertType) {
  const [rows] = await db.query(
    `SELECT * FROM meeting_alerts WHERE meeting_id = ? AND alert_type = ? ORDER BY created_at DESC LIMIT 1`,
    [meetingId, alertType]
  );
  return rows[0] || null;
}

export async function recordMeetingEnded(meeting) {
  if (!meeting?.id && !meeting?.meetingId) return null;
  const meetingId = String(meeting.id || meeting.meetingId);
  const existing = await recentAlert(meetingId, 'meeting_ended');
  if (existing) return null;
  const loc = parseLocation(meeting.location);
  return createMeetingAlert({
    meetingId,
    userEmail: meeting.username || meeting.userEmail || meeting.salesPersonEmail || '',
    userName: meeting.salesPersonName || meeting.username || '',
    leadId: meeting.leadId || meeting.lead_id || '',
    leadName: meeting.leadName || meeting.lead_name || '',
    alertType: 'meeting_ended',
    distanceM: 0,
    meetingAddress: loc?.address || '',
  });
}

export async function processMeetingPresence({ email, latitude, longitude, address }) {
  await ensureMeetingAlertTables();
  const userEmail = String(email || '').trim().toLowerCase();
  if (!userEmail) {
    return { ok: false, error: 'Location required' };
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'Location required' };
  }
  const meetings = await getAllMeetings();
  const active = meetings.find((row) => {
    const name = String(row.username || row.salesPersonEmail || '').toLowerCase();
    const status = String(row.meetingStatus || row.meeting_status || '').toLowerCase();
    const checkedOut = row.checkOutTime || row.check_out_time;
    return name === userEmail && !checkedOut && status !== 'completed' && status !== 'ended';
  });

  if (!active) return { ok: true, inMeeting: false };

  const start = parseLocation(active.location);
  const startLat = Number(start?.latitude ?? start?.lat);
  const startLng = Number(start?.longitude ?? start?.lng);
  if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
    return { ok: true, inMeeting: true, tracked: false };
  }

  const distanceM = haversineMeters(startLat, startLng, lat, lng);
  const meetingId = String(active.id);
  const payload = {
    meetingId,
    userEmail,
    userName: active.salesPersonName || active.username || userEmail,
    leadId: active.leadId || '',
    leadName: active.leadName || '',
    meetingAddress: start.address || '',
    currentAddress: address || '',
    currentLat: lat,
    currentLng: lng,
    distanceM,
  };

  if (distanceM >= LEAVE_METERS) {
    const lastLeft = await recentAlert(meetingId, 'left_place');
    const lastLeftAt = lastLeft ? new Date(lastLeft.created_at).getTime() : 0;
    const lastReturned = await recentAlert(meetingId, 'returned_place');
    const lastReturnedAt = lastReturned ? new Date(lastReturned.created_at).getTime() : 0;
    const canAlert = !lastLeft || (lastReturnedAt > lastLeftAt) || (Date.now() - lastLeftAt > LEFT_COOLDOWN_MS);
    if (canAlert) {
      await createMeetingAlert({ ...payload, alertType: 'left_place' });
      return { ok: true, inMeeting: true, leftPlace: true, distanceM, alerted: true };
    }
    return { ok: true, inMeeting: true, leftPlace: true, distanceM, alerted: false };
  }

  if (distanceM <= RETURN_METERS) {
    const lastLeft = await recentAlert(meetingId, 'left_place');
    const lastReturned = await recentAlert(meetingId, 'returned_place');
    if (lastLeft && (!lastReturned || new Date(lastLeft.created_at) > new Date(lastReturned.created_at))) {
      await createMeetingAlert({ ...payload, alertType: 'returned_place' });
    }
  }

  return { ok: true, inMeeting: true, leftPlace: false, distanceM };
}
