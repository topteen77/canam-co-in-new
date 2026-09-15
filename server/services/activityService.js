import crypto from 'node:crypto';
import db from '../db.js';
import { resolveTableName, getColumns } from '../utils/tableResolver.js';

const ACTIVITY_TABLE_NAMES = ['activity_logs', 'ActivityLogs'];

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `act-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function normalizeActivityRow(row) {
  if (!row) return null;
  const userId = row.user_id ?? row.userId ?? null;
  return {
    id: row.id ?? row.firebase_id,
    user_id: userId,
    userId,
    userEmail: row.userEmail ?? row.user_email ?? userId,
    action: row.action ?? row.action_type ?? row.actionType,
    description: row.description ?? '',
    timestamp: row.timestamp ?? row.createdAt ?? row.created_at,
    device: row.device ?? row.device_type ?? row.deviceType ?? null,
    deviceId: row.device_id ?? row.deviceId ?? null,
    leadName: row.leadName ?? row.lead_name ?? null,
    leadId: row.leadId ?? row.lead_id ?? null,
    details: typeof row.details === 'string' ? (() => { try { return JSON.parse(row.details); } catch { return null; } })() : (row.details || null),
  };
}

export async function ensureActivityTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(128) DEFAULT '',
      user_email VARCHAR(255) NOT NULL,
      action VARCHAR(64) NOT NULL,
      description TEXT,
      device_id VARCHAR(128) DEFAULT '',
      device VARCHAR(64) DEFAULT '',
      lead_id VARCHAR(128) DEFAULT '',
      lead_name VARCHAR(255) DEFAULT '',
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_activity_email_time (user_email, timestamp),
      INDEX idx_activity_user_id (user_id),
      INDEX idx_activity_device (device_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

export const logActivity = async (data = {}) => {
  await ensureActivityTable();
  const id = data.id || newId();
  const details = data.details && typeof data.details === 'object' ? JSON.stringify(data.details) : (data.details || null);
  await db.execute(
    `INSERT INTO activity_logs
      (id, user_id, user_email, action, description, device_id, device, lead_id, lead_name, details, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      id,
      String(data.userId || data.user_id || ''),
      String(data.userEmail || data.user_email || '').trim().toLowerCase(),
      String(data.action || 'activity'),
      data.description || '',
      String(data.deviceId || data.device_id || ''),
      String(data.device || data.deviceType || ''),
      String(data.leadId || data.lead_id || ''),
      String(data.leadName || data.lead_name || ''),
      details,
    ]
  );
  return { success: true, id };
};

export const getAllActivities = async () => {
  try {
    await ensureActivityTable();
    const table = (await resolveTableName(ACTIVITY_TABLE_NAMES)) || '`activity_logs`';
    const cols = await getColumns(table);
    const timeCol = cols.has('timestamp') ? 'timestamp' : (cols.has('createdAt') ? 'createdAt' : (cols.has('created_at') ? 'created_at' : 'id'));
    const [rows] = await db.query(
      `SELECT * FROM ${table} ORDER BY \`${timeCol}\` DESC LIMIT 1000`
    );
    return (rows || []).map(normalizeActivityRow);
  } catch (error) {
    console.error('❌ Error getting activities:', error.message);
    return [];
  }
};
