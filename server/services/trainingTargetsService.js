import crypto from 'node:crypto';
import db from '../db.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DOCS = 10;
const ALLOWED_EXT = new Set(['pdf', 'doc', 'docx']);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const TRAINING_MODULES = [
  'System How-to',
  'B2B',
  'SRP Test Prep Marketing',
  'Speak Easy - Sales',
  'Marketing',
  'Prime Products',
  'VAS',
  'Onboarding',
  'Other',
];

let ensured = false;

function newId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tt-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function stripDataUrl(data) {
  const raw = String(data || '');
  const idx = raw.indexOf('base64,');
  return idx >= 0 ? raw.slice(idx + 7) : raw;
}

function extFromName(fileName) {
  const parts = String(fileName || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function mapDoc(row, includeData = false) {
  if (!row) return null;
  const out = {
    id: row.id,
    module: row.module,
    title: row.title,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    toolUrl: row.tool_url || '',
    sortOrder: Number(row.sort_order || 0),
    uploadedBy: row.uploaded_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeData) out.fileData = row.file_data;
  return out;
}

function mapTarget(row) {
  if (!row) return null;
  return {
    id: row.id,
    userEmail: row.user_email,
    userName: row.user_name || '',
    periodLabel: row.period_label,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    leadsTarget: Number(row.leads_target || 0),
    meetingsTarget: Number(row.meetings_target || 0),
    onboardingsTarget: Number(row.onboardings_target || 0),
    notes: row.notes || '',
    updatedBy: row.updated_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureTrainingTables() {
  if (ensured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_training_documents (
      id VARCHAR(64) PRIMARY KEY,
      module VARCHAR(128) NOT NULL DEFAULT 'Other',
      title VARCHAR(255) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_type VARCHAR(128) NOT NULL DEFAULT '',
      file_size INT NOT NULL DEFAULT 0,
      file_data LONGBLOB NULL,
      tool_url TEXT,
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      uploaded_by VARCHAR(255) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_crm_training_docs_module (module),
      INDEX idx_crm_training_docs_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_team_targets (
      id VARCHAR(64) PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      user_name VARCHAR(255) DEFAULT '',
      period_label VARCHAR(64) NOT NULL,
      period_start DATE NULL,
      period_end DATE NULL,
      leads_target INT NOT NULL DEFAULT 0,
      meetings_target INT NOT NULL DEFAULT 0,
      onboardings_target INT NOT NULL DEFAULT 0,
      notes TEXT,
      updated_by VARCHAR(255) DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_crm_team_targets_user_period (user_email, period_label),
      INDEX idx_crm_team_targets_email (user_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

export async function listTrainingDocuments() {
  await ensureTrainingTables();
  const [rows] = await db.query(
    `SELECT id, module, title, file_name, file_type, file_size, tool_url, sort_order,
            uploaded_by, created_at, updated_at
     FROM crm_training_documents
     WHERE is_active = 1
     ORDER BY sort_order ASC, created_at DESC`
  );
  return (rows || []).map((row) => mapDoc(row, false));
}

export async function getTrainingDocument(id, { includeData = false } = {}) {
  await ensureTrainingTables();
  const cols = includeData
    ? 'id, module, title, file_name, file_type, file_size, file_data, tool_url, sort_order, uploaded_by, created_at, updated_at'
    : 'id, module, title, file_name, file_type, file_size, tool_url, sort_order, uploaded_by, created_at, updated_at';
  const [rows] = await db.query(
    `SELECT ${cols} FROM crm_training_documents WHERE id = ? AND is_active = 1 LIMIT 1`,
    [clean(id)]
  );
  return rows?.[0] ? mapDoc(rows[0], includeData) : null;
}

export async function createTrainingDocument(payload, uploadedBy = '') {
  await ensureTrainingTables();
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM crm_training_documents WHERE is_active = 1`
  );
  if (Number(countRows[0]?.cnt || 0) >= MAX_DOCS) {
    const err = new Error(`Maximum ${MAX_DOCS} training documents allowed. Remove one before uploading.`);
    err.statusCode = 400;
    throw err;
  }

  const title = clean(payload.title);
  const module = clean(payload.module) || 'Other';
  const fileName = clean(payload.fileName || payload.file_name);
  const fileType = clean(payload.fileType || payload.file_type);
  const toolUrl = clean(payload.toolUrl || payload.tool_url);
  const ext = extFromName(fileName);
  if (!title || !fileName) {
    const err = new Error('Title and file are required');
    err.statusCode = 400;
    throw err;
  }
  if (!ALLOWED_EXT.has(ext)) {
    const err = new Error('Only Word (.doc, .docx) and PDF files are allowed');
    err.statusCode = 400;
    throw err;
  }
  if (fileType && !ALLOWED_MIME.has(fileType) && !fileType.includes('pdf') && !fileType.includes('word') && !fileType.includes('msword') && !fileType.includes('officedocument')) {
    const err = new Error('Invalid file type. Upload Word or PDF only.');
    err.statusCode = 400;
    throw err;
  }

  const base64 = stripDataUrl(payload.fileData || payload.file_data);
  if (!base64) {
    const err = new Error('File data is required');
    err.statusCode = 400;
    throw err;
  }
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    const err = new Error('Invalid file data');
    err.statusCode = 400;
    throw err;
  }
  if (!buffer.length) {
    const err = new Error('Empty file');
    err.statusCode = 400;
    throw err;
  }
  if (buffer.length > MAX_FILE_BYTES) {
    const err = new Error('File size must be 5 MB or less');
    err.statusCode = 400;
    throw err;
  }

  const id = newId();
  const sortOrder = Number(payload.sortOrder ?? payload.sort_order ?? Date.now() % 100000);
  await db.execute(
    `INSERT INTO crm_training_documents
      (id, module, title, file_name, file_type, file_size, file_data, tool_url, sort_order, is_active, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, module, title, fileName, fileType || ext, buffer.length, buffer, toolUrl, sortOrder, clean(uploadedBy)]
  );
  return getTrainingDocument(id);
}

export async function updateTrainingDocument(id, payload) {
  await ensureTrainingTables();
  const existing = await getTrainingDocument(id, { includeData: false });
  if (!existing) {
    const err = new Error('Document not found');
    err.statusCode = 404;
    throw err;
  }

  const title = clean(payload.title) || existing.title;
  const module = clean(payload.module) || existing.module;
  const toolUrl = payload.toolUrl !== undefined || payload.tool_url !== undefined
    ? clean(payload.toolUrl ?? payload.tool_url)
    : existing.toolUrl;
  const sortOrder = payload.sortOrder ?? payload.sort_order ?? existing.sortOrder;

  let fileName = existing.fileName;
  let fileType = existing.fileType;
  let fileSize = existing.fileSize;
  let fileBuffer = null;

  const nextData = payload.fileData || payload.file_data;
  if (nextData) {
    fileName = clean(payload.fileName || payload.file_name) || fileName;
    fileType = clean(payload.fileType || payload.file_type) || fileType;
    const ext = extFromName(fileName);
    if (!ALLOWED_EXT.has(ext)) {
      const err = new Error('Only Word (.doc, .docx) and PDF files are allowed');
      err.statusCode = 400;
      throw err;
    }
    const base64 = stripDataUrl(nextData);
    fileBuffer = Buffer.from(base64, 'base64');
    if (!fileBuffer.length) {
      const err = new Error('Empty file');
      err.statusCode = 400;
      throw err;
    }
    if (fileBuffer.length > MAX_FILE_BYTES) {
      const err = new Error('File size must be 5 MB or less');
      err.statusCode = 400;
      throw err;
    }
    fileSize = fileBuffer.length;
  }

  if (fileBuffer) {
    await db.execute(
      `UPDATE crm_training_documents
       SET module = ?, title = ?, tool_url = ?, sort_order = ?, file_name = ?, file_type = ?, file_size = ?, file_data = ?, updated_at = NOW()
       WHERE id = ?`,
      [module, title, toolUrl, Number(sortOrder) || 0, fileName, fileType, fileSize, fileBuffer, id]
    );
  } else {
    await db.execute(
      `UPDATE crm_training_documents
       SET module = ?, title = ?, tool_url = ?, sort_order = ?, updated_at = NOW()
       WHERE id = ?`,
      [module, title, toolUrl, Number(sortOrder) || 0, id]
    );
  }
  return getTrainingDocument(id);
}

export async function deleteTrainingDocument(id) {
  await ensureTrainingTables();
  const [result] = await db.execute(
    `UPDATE crm_training_documents SET is_active = 0, updated_at = NOW() WHERE id = ?`,
    [clean(id)]
  );
  return { success: true, deleted: result?.affectedRows || 0 };
}

export async function listTeamTargets({ userEmail } = {}) {
  await ensureTrainingTables();
  if (userEmail) {
    const [rows] = await db.query(
      `SELECT * FROM crm_team_targets WHERE user_email = ? ORDER BY period_start DESC, updated_at DESC`,
      [clean(userEmail).toLowerCase()]
    );
    return (rows || []).map(mapTarget);
  }
  const [rows] = await db.query(
    `SELECT * FROM crm_team_targets ORDER BY period_start DESC, user_name ASC, user_email ASC`
  );
  return (rows || []).map(mapTarget);
}

export async function upsertTeamTarget(payload, updatedBy = '') {
  await ensureTrainingTables();
  const userEmail = clean(payload.userEmail || payload.user_email).toLowerCase();
  const periodLabel = clean(payload.periodLabel || payload.period_label);
  if (!userEmail || !periodLabel) {
    const err = new Error('User and period are required');
    err.statusCode = 400;
    throw err;
  }
  const userName = clean(payload.userName || payload.user_name);
  const periodStart = payload.periodStart || payload.period_start || null;
  const periodEnd = payload.periodEnd || payload.period_end || null;
  const leadsTarget = Math.max(0, Number(payload.leadsTarget ?? payload.leads_target ?? 0) || 0);
  const meetingsTarget = Math.max(0, Number(payload.meetingsTarget ?? payload.meetings_target ?? 0) || 0);
  const onboardingsTarget = Math.max(0, Number(payload.onboardingsTarget ?? payload.onboardings_target ?? 0) || 0);
  const notes = clean(payload.notes);

  const [existing] = await db.query(
    `SELECT id FROM crm_team_targets WHERE user_email = ? AND period_label = ? LIMIT 1`,
    [userEmail, periodLabel]
  );
  if (existing.length) {
    const id = existing[0].id;
    await db.execute(
      `UPDATE crm_team_targets
       SET user_name = ?, period_start = ?, period_end = ?, leads_target = ?, meetings_target = ?,
           onboardings_target = ?, notes = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [userName, periodStart, periodEnd, leadsTarget, meetingsTarget, onboardingsTarget, notes, clean(updatedBy), id]
    );
    const [rows] = await db.query(`SELECT * FROM crm_team_targets WHERE id = ?`, [id]);
    return mapTarget(rows[0]);
  }

  const id = newId();
  await db.execute(
    `INSERT INTO crm_team_targets
      (id, user_email, user_name, period_label, period_start, period_end, leads_target, meetings_target, onboardings_target, notes, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userEmail, userName, periodLabel, periodStart, periodEnd, leadsTarget, meetingsTarget, onboardingsTarget, notes, clean(updatedBy)]
  );
  const [rows] = await db.query(`SELECT * FROM crm_team_targets WHERE id = ?`, [id]);
  return mapTarget(rows[0]);
}

export async function deleteTeamTarget(id) {
  await ensureTrainingTables();
  const [result] = await db.execute(`DELETE FROM crm_team_targets WHERE id = ?`, [clean(id)]);
  return { success: true, deleted: result?.affectedRows || 0 };
}

export const TRAINING_LIMITS = {
  maxFileBytes: MAX_FILE_BYTES,
  maxDocuments: MAX_DOCS,
  allowedExt: [...ALLOWED_EXT],
};
