import crypto from 'node:crypto';
import db from '../db.js';

let ensured = false;

export const DEFAULT_LOST_REASONS = [
  'Delay in commission',
  'Low commission',
  'Compliance',
  'Poor quality of service',
  'Delay in response time',
];

function newId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `lost-reason-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export async function ensureLostReasonMasterTables() {
  if (ensured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_lost_reasons (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      is_system TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_crm_lost_reasons_name (name),
      INDEX idx_crm_lost_reasons_active (is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

export async function seedDefaultsIfEmpty() {
  await ensureLostReasonMasterTables();
  const [rows] = await db.query(`SELECT COUNT(*) AS cnt FROM crm_lost_reasons`);
  if (Number(rows[0]?.cnt || 0) > 0) return { seeded: false };

  let order = 1;
  for (const name of DEFAULT_LOST_REASONS) {
    await db.execute(
      `INSERT INTO crm_lost_reasons (id, name, sort_order, is_active, is_system)
       VALUES (?, ?, ?, 1, 1)`,
      [newId(), name, order]
    );
    order += 1;
  }
  return { seeded: true, count: DEFAULT_LOST_REASONS.length };
}

export async function listLostReasons({ includeInactive = false } = {}) {
  await ensureLostReasonMasterTables();
  const where = includeInactive ? '1=1' : 'is_active = 1';
  const [rows] = await db.query(
    `SELECT id, name, sort_order AS sortOrder, is_active AS isActive, is_system AS isSystem,
            created_at AS createdAt, updated_at AS updatedAt
     FROM crm_lost_reasons
     WHERE ${where}
     ORDER BY sort_order ASC, name ASC`
  );
  return rows || [];
}

export async function upsertLostReason({ id, name, sortOrder, isActive = true }) {
  await ensureLostReasonMasterTables();
  const reasonName = clean(name);
  if (!reasonName) {
    throw Object.assign(new Error('Reason name is required'), { statusCode: 400 });
  }
  if (reasonName.toLowerCase() === 'other') {
    throw Object.assign(new Error('"Other" is reserved for free-text entry'), { statusCode: 400 });
  }

  const rowId = clean(id) || newId();
  const [existing] = await db.query(
    `SELECT id, is_system AS isSystem FROM crm_lost_reasons
     WHERE id = ? OR LOWER(name) = LOWER(?)
     LIMIT 1`,
    [rowId, reasonName]
  );

  const order =
    sortOrder == null || Number.isNaN(Number(sortOrder))
      ? null
      : Number(sortOrder);

  if (existing.length) {
    const existingId = existing[0].id;
    if (order == null) {
      await db.execute(
        `UPDATE crm_lost_reasons
         SET name = ?, is_active = ?, updated_at = NOW()
         WHERE id = ?`,
        [reasonName, isActive ? 1 : 0, existingId]
      );
    } else {
      await db.execute(
        `UPDATE crm_lost_reasons
         SET name = ?, sort_order = ?, is_active = ?, updated_at = NOW()
         WHERE id = ?`,
        [reasonName, order, isActive ? 1 : 0, existingId]
      );
    }
    return { success: true, id: existingId, created: false };
  }

  let nextOrder = order;
  if (nextOrder == null) {
    const [maxRows] = await db.query(`SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM crm_lost_reasons`);
    nextOrder = Number(maxRows[0]?.maxOrder || 0) + 1;
  }

  await db.execute(
    `INSERT INTO crm_lost_reasons (id, name, sort_order, is_active, is_system)
     VALUES (?, ?, ?, ?, 0)`,
    [rowId, reasonName, nextOrder, isActive ? 1 : 0]
  );
  return { success: true, id: rowId, created: true };
}

/** Ensure a user-entered custom reason exists in the master for next time. */
export async function ensureReasonExists(name) {
  const reasonName = clean(name);
  if (!reasonName || reasonName.toLowerCase() === 'other') {
    return { success: false, skipped: true };
  }
  return upsertLostReason({ name: reasonName, isActive: true });
}

export async function deleteLostReason(id) {
  await ensureLostReasonMasterTables();
  const rowId = clean(id);
  if (!rowId) throw Object.assign(new Error('Reason id is required'), { statusCode: 400 });
  await db.execute(
    `UPDATE crm_lost_reasons SET is_active = 0, updated_at = NOW() WHERE id = ?`,
    [rowId]
  );
  return { success: true, deleted: 1 };
}
