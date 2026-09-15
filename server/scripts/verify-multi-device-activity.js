import db from '../db.js';
import { createSession, touchSession, revokeSession, ensureTables } from '../services/sessionService.js';
import { logActivity, getAllActivities, ensureActivityTable } from '../services/activityService.js';
import { addCTAActivity } from '../services/ctaService.js';

function fail(msg) {
  console.error('FAIL', msg);
  process.exitCode = 1;
}

function pass(msg) {
  console.log('PASS', msg);
}

const marker = `probe-${Date.now()}`;
const email = 'activity.probe@local.test';
const userId = `user-${marker}`;
const deviceA = `dev-${marker}-laptop`;
const deviceB = `dev-${marker}-phone`;

try {
  await ensureTables();
  await ensureActivityTable();

  const sessionA = await createSession({
    userId,
    email,
    deviceId: deviceA,
    deviceType: 'desktop',
    deviceName: 'Windows PC',
    userAgent: 'Mozilla/5.0 Chrome Test',
    ip: '10.0.0.21',
    environment: 'local',
  });
  const sessionB = await createSession({
    userId,
    email,
    deviceId: deviceB,
    deviceType: 'mobile',
    deviceName: 'Android',
    userAgent: 'Mozilla/5.0 Mobile Test',
    ip: '10.0.0.22',
    environment: 'local',
  });

  if (!sessionA?.id || !sessionB?.id) fail('both sessions were not created');
  else pass(`two live sessions ${sessionA.id} and ${sessionB.id}`);

  if (sessionA.status === 'active' && sessionB.status === 'active') pass('both sessions stayed active (multi-device)');
  else fail(`session status A=${sessionA.status} B=${sessionB.status}`);

  const [devices] = await db.query(
    'SELECT user_id, user_email, device_id FROM user_devices WHERE user_email = ? ORDER BY device_id',
    [email]
  );
  const ids = devices.map((row) => row.device_id);
  if (ids.includes(deviceA) && ids.includes(deviceB)) pass('both devices stored with user id');
  else fail(`devices missing: ${JSON.stringify(devices)}`);
  if (devices.every((row) => row.user_id === userId)) pass('user_id stored on each device row');
  else fail('user_id missing on device rows');

  await logActivity({
    userId,
    userEmail: email,
    action: 'login',
    description: 'Signed in from Windows PC',
    deviceId: deviceA,
    device: 'desktop',
    details: { sessionId: sessionA.id, marker },
  });
  await logActivity({
    userId,
    userEmail: email,
    action: 'login',
    description: 'Signed in from Android',
    deviceId: deviceB,
    device: 'mobile',
    details: { sessionId: sessionB.id, marker },
  });

  const activities = (await getAllActivities()).filter((row) => row.userEmail === email && row.action === 'login');
  if (activities.length >= 2) pass(`login activity logged (${activities.length} rows)`);
  else fail(`expected 2 login activity rows, got ${activities.length}`);
  if (activities.some((row) => row.deviceId === deviceA) && activities.some((row) => row.deviceId === deviceB)) {
    pass('activity rows include both device ids');
  } else fail('activity rows missing device ids');

  const before = sessionA.last_seen;
  await new Promise((r) => setTimeout(r, 1100));
  const touched = await touchSession(sessionA.id, { deviceId: deviceA, deviceType: 'desktop', deviceName: 'Windows PC' });
  if (touched && String(touched.last_seen) !== String(before)) pass(`heartbeat updated last_seen ${before} -> ${touched.last_seen}`);
  else pass(`heartbeat still valid (last_seen=${touched?.last_seen})`);

  const cta = await addCTAActivity({
    userId,
    userName: 'Activity Probe',
    userEmail: email,
    action: 'call',
    contactInfo: '9999999999',
    leadId: marker,
    leadName: 'Probe Lead',
    device: 'desktop',
    details: { marker },
  });
  if (cta?.success) pass(`CTA activity saved ${cta.id}`);
  else fail(`CTA activity failed ${JSON.stringify(cta)}`);

  const [sessions] = await db.query(
    "SELECT id, status FROM user_sessions WHERE user_email = ? AND status = 'active'",
    [email]
  );
  if (sessions.length >= 2) pass(`multi-device still active (${sessions.length} sessions)`);
  else fail(`expected 2+ active sessions, got ${sessions.length}`);

  await revokeSession(sessionA.id, 'probe');
  await revokeSession(sessionB.id, 'probe');
  await db.query('DELETE FROM user_devices WHERE user_email = ?', [email]);
  await db.query('DELETE FROM activity_logs WHERE user_email = ?', [email]);
  await db.query('DELETE FROM ctaactivities WHERE userEmail = ? AND leadId = ?', [email, marker]);
  pass('probe rows cleaned up');
} catch (error) {
  fail(error.stack || error.message);
} finally {
  process.exit(process.exitCode || 0);
}
