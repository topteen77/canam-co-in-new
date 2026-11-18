/**
 * Verify In Meeting detection against real DB-shaped rows.
 * Run: node scripts/verify-meeting-active.mjs
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  try {
    const raw = readFileSync(resolve('server/.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  } catch {}
}

// Inline the production rules (keep in sync with utils/meetingActive.ts)
function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}
function extractMeetingUserEmail(value) {
  if (value == null) return '';
  if (typeof value === 'object') return cleanEmail(String(value.email || value.userEmail || value.username || ''));
  const raw = String(value).trim();
  if (!raw) return '';
  if (raw.startsWith('{')) {
    try { return extractMeetingUserEmail(JSON.parse(raw)); } catch { /* ignore */ }
  }
  return cleanEmail(raw);
}
function localDateKey(value) {
  if (!value) return '';
  if (typeof value === 'object' && !(value instanceof Date)) {
    const seconds = Number(value._seconds ?? value.seconds);
    if (Number.isFinite(seconds) && seconds > 0) return localDateKey(new Date(seconds * 1000));
  }
  const asString = String(value).trim();
  const ymd = asString.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  if (asString.startsWith('{')) {
    try { return localDateKey(JSON.parse(asString)); } catch { return ''; }
  }
  const d = new Date(asString);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayLocalDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function isActiveMeetingRecord(meeting, now = new Date()) {
  if (!meeting) return false;
  const status = String(meeting.meetingStatus || '').trim().toLowerCase();
  if (status !== 'active') return false;
  if (meeting.checkOutTime) return false;
  const today = todayLocalDateKey(now);
  const meetingDay = localDateKey(meeting.date) || localDateKey(meeting.checkInTime);
  if (!meetingDay || meetingDay !== today) return false;
  return true;
}
function meetingBelongsToUser(meeting, userEmail) {
  const email = cleanEmail(userEmail);
  if (!email || !meeting) return false;
  return [
    extractMeetingUserEmail(meeting.username),
    extractMeetingUserEmail(meeting.salesPersonEmail),
  ].includes(email);
}
function userHasActiveMeeting(meetings, userEmail, now = new Date()) {
  return (meetings || []).some((m) => meetingBelongsToUser(m, userEmail) && isActiveMeetingRecord(m, now));
}

loadEnv();

const unitNow = new Date('2026-11-18T12:00:00+05:30');
const unitCases = [
  {
    name: 'stale active from August must be false',
    row: { username: 'canamrakesh@gmail.com', date: '2026-08-14', checkInTime: '2026-08-14T11:50:38.268Z', checkOutTime: null, meetingStatus: 'active' },
    expect: false,
  },
  {
    name: 'today active must be true',
    row: { username: 'canamrakesh@gmail.com', date: '2026-11-18', checkInTime: '2026-11-18T05:00:00.000Z', checkOutTime: null, meetingStatus: 'active' },
    expect: true,
  },
  {
    name: 'today completed must be false',
    row: { username: 'canamrakesh@gmail.com', date: '2026-11-18', checkInTime: '2026-11-18T05:00:00.000Z', checkOutTime: '2026-11-18T06:00:00.000Z', meetingStatus: 'completed' },
    expect: false,
  },
  {
    name: 'missing status must be false',
    row: { username: 'canamrakesh@gmail.com', date: '2026-11-18', checkInTime: '2026-11-18T05:00:00.000Z', checkOutTime: null, meetingStatus: null },
    expect: false,
  },
];

let failed = 0;
for (const c of unitCases) {
  const got = userHasActiveMeeting([c.row], 'canamrakesh@gmail.com', unitNow);
  const ok = got === c.expect;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name} => ${got}`);
  if (!ok) failed += 1;
}

const pool = await mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'phpadmin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_nod_crm',
});

const [rows] = await pool.query(
  `SELECT id, username, salesPersonEmail, date, checkInTime, checkOutTime, meetingStatus
   FROM meetingcheckinrecords`
);
const email = 'canamrakesh@gmail.com';
const activeForUser = rows.filter((r) => meetingBelongsToUser(r, email) && isActiveMeetingRecord(r));
console.log(`DB rows: ${rows.length}`);
console.log(`Active for ${email} today: ${activeForUser.length}`);
if (activeForUser.length) {
  console.log(activeForUser.map((r) => ({ id: r.id, date: r.date, status: r.meetingStatus })));
}
const headerWouldBlink = userHasActiveMeeting(rows, email);
console.log(`Header In Meeting for ${email}: ${headerWouldBlink ? 'YES (unexpected if user not in meeting)' : 'NO (correct if idle)'}`);

await pool.end();
if (failed || headerWouldBlink) process.exit(1);
console.log('ALL CHECKS PASSED');
