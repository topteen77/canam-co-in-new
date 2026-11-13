// Call API integration (Kommuno).
// Outgoing calls: POST {KOMMUNO_BASE_URL}/v1/kcrm/clickToCallWithLiveStatus with header apikey.
// Kommuno's host returns nginx 404 for /kcrm/... without the /v1 prefix.
// Incoming, outgoing, and recording events: POST /api/kommuno/webhook (also /callback, /incoming, /recording).
// Kommuno calls those URLs from the internet, so they always use the production origin
// https://canam.co.in. A localhost PUBLIC_BACKEND_URL is only the local API bind address.
import db from '../db.js';
import { resolveTableNameOrFallback, getColumns, invalidateColumns } from '../utils/tableResolver.js';
import * as userService from './userService.js';
import * as callLogsService from './callLogsService.js';

const PRODUCTION_API_ORIGIN = 'https://canam.co.in';

const TABLE = 'kommuno_calls';
const EVENT_RANK = { initiated: 0, ringing: 1, connected: 2, missed: 3, completed: 3, failed: 3 };
let usersCache = { at: 0, rows: [] };
let warnedOpenWebhook = false;
let savedSettings = null;

export function last10(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= 10 ? digits : digits.slice(-10);
}

export function toE164(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  const raw = String(value).trim();
  if (!raw) return new Date().toISOString();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const parsed = new Date(`${normalized}+05:30`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function asObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function pickAgent(source) {
  if (!source || typeof source !== 'object') return {};
  const raw = source.agent_details || source.agent_detials || source.agentDetails || null;
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const first = raw[0] || {};
    return first.agent_details || first.agent_detials || first;
  }
  return raw;
}

function newSessionId() {
  const extra = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${Date.now()}${extra}`.slice(-16);
}

export function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 2) return '••••';
  const edge = text.length >= 12 ? 4 : 2;
  if (edge * 2 >= text.length) return `${text.slice(0, 1)}••••${text.slice(-1)}`;
  return `${text.slice(0, edge)}••••${text.slice(-edge)}`;
}

function envConfig() {
  const baseUrl = String(process.env.KOMMUNO_BASE_URL || '').trim().replace(/\/$/, '');
  const apiKey = String(process.env.KOMMUNO_API_KEY || '').trim();
  const smeId = String(process.env.KOMMUNO_SME_ID || '').trim();
  const pilots = String(process.env.KOMMUNO_PILOT_NUMBERS || process.env.KOMMUNO_PILOT_NUMBER || '')
    .split(',')
    .map((item) => toE164(item))
    .filter(Boolean);
  let agentMap = {};
  const rawMap = String(process.env.KOMMUNO_AGENT_MAP || '').trim();
  if (rawMap) {
    try {
      const parsed = JSON.parse(rawMap);
      agentMap = Object.fromEntries(
        Object.entries(parsed || {}).map(([email, phone]) => [String(email).trim().toLowerCase(), toE164(phone)])
      );
    } catch (error) {
      console.error('KOMMUNO_AGENT_MAP is not valid JSON:', error.message);
    }
  }
  const recordingFlag = String(process.env.KOMMUNO_RECORDING ?? '1').trim() === '0' ? 0 : 1;
  const webhookToken = String(process.env.KOMMUNO_WEBHOOK_TOKEN || '').trim();
  const publicBase = webhookOrigin(process.env.KOMMUNO_PUBLIC_URL || process.env.PUBLIC_BACKEND_URL);
  return { baseUrl, apiKey, smeId, pilots, agentMap, recordingFlag, webhookToken, publicBase };
}

function isLoopbackOrigin(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  } catch {
    return true;
  }
}

// Kommuno tech team: POST {domain}/v1/kcrm/clickToCallWithLiveStatus
function clickToCallUrl(baseUrl) {
  let base = String(baseUrl || '').trim().replace(/\/$/, '');
  base = base.replace(/\/v1\/kcrm\/clickToCallWithLiveStatus$/i, '');
  base = base.replace(/\/kcrm\/clickToCallWithLiveStatus$/i, '');
  base = base.replace(/\/v1$/i, '');
  return `${base}/v1/kcrm/clickToCallWithLiveStatus`;
}

// Keep a real public origin. Drop localhost and a trailing /api so the webhook path is not doubled.
function webhookOrigin(value) {
  let cleaned = String(value || '').trim().replace(/\/$/, '');
  if (cleaned.endsWith('/api')) cleaned = cleaned.slice(0, -4);
  if (!cleaned || isLoopbackOrigin(cleaned)) return PRODUCTION_API_ORIGIN;
  return cleaned;
}

function pickSaved(saved, fallback) {
  const value = String(saved || '').trim();
  return value || fallback;
}

export function getConfig() {
  const env = envConfig();
  const saved = savedSettings;
  const baseUrl = pickSaved(saved?.base_url, env.baseUrl).replace(/\/$/, '');
  const apiKey = pickSaved(saved?.api_key, env.apiKey);
  const smeId = pickSaved(saved?.sme_id, env.smeId);
  const pilots = pickSaved(saved?.pilot_numbers, env.pilots.join(','))
    .split(',')
    .map((item) => toE164(item))
    .filter(Boolean);
  const webhookToken = pickSaved(saved?.webhook_token, env.webhookToken);
  const publicBase = webhookOrigin(pickSaved(saved?.public_base_url, env.publicBase));
  const recordingFlag = saved ? (Number(saved.recording_flag) === 0 ? 0 : 1) : env.recordingFlag;
  return {
    baseUrl,
    apiKey,
    smeId,
    pilots,
    agentMap: env.agentMap,
    recordingFlag,
    webhookToken,
    publicBase,
    source: saved ? 'admin' : 'env',
    ready: Boolean(baseUrl && apiKey && smeId && pilots.length),
    webhookUrl: `${publicBase}/api/kommuno/webhook`,
    missing: [
      !baseUrl ? 'KOMMUNO_BASE_URL' : null,
      !apiKey ? 'KOMMUNO_API_KEY' : null,
      !smeId ? 'KOMMUNO_SME_ID' : null,
      !pilots.length ? 'KOMMUNO_PILOT_NUMBERS' : null,
    ].filter(Boolean),
  };
}

function resolveSetting(incoming, current) {
  const next = String(incoming ?? '').trim();
  const stored = String(current || '').trim();
  if (!next || next.includes('•') || (stored && next === maskSecret(stored))) return stored;
  return next;
}

export function publicKommunoSettings() {
  const cfg = getConfig();
  return {
    configured: cfg.ready,
    source: cfg.source,
    missing: cfg.missing,
    baseUrl: maskSecret(cfg.baseUrl),
    apiKey: maskSecret(cfg.apiKey),
    smeId: maskSecret(cfg.smeId),
    pilotNumbers: maskSecret(cfg.pilots.join(',')),
    webhookToken: maskSecret(cfg.webhookToken),
    publicBaseUrl: maskSecret(cfg.publicBase),
    recording: cfg.recordingFlag === 1,
    webhookUrl: cfg.webhookUrl,
    callbackUrl: `${cfg.webhookUrl.replace(/\/webhook$/, '')}/callback`,
    incomingUrl: `${cfg.webhookUrl.replace(/\/webhook$/, '')}/incoming`,
    recordingUrl: `${cfg.webhookUrl.replace(/\/webhook$/, '')}/recording`,
    callReady: cfg.ready && Number(savedSettings?.last_test_ok) === 1,
    test: savedSettings?.last_test_message ? {
      ok: Number(savedSettings.last_test_ok) === 1,
      message: savedSettings.last_test_message || '',
      log: parseTestLog(savedSettings.last_test_log),
    } : null,
  };
}

function parseTestLog(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return { raw: String(value) }; }
}

function redactSecret(value, secret) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!secret || !text) return text;
  return text.split(secret).join(maskSecret(secret));
}

export async function testKommunoApi() {
  const cfg = getConfig();
  const at = new Date().toISOString();
  if (!cfg.ready) {
    return {
      ok: false,
      message: 'Kommuno API test failed. Required settings are still empty.',
      log: { at, note: 'No customer was dialed.', missing: cfg.missing },
    };
  }
  const url = clickToCallUrl(cfg.baseUrl);
  const body = {
    smeId: String(cfg.smeId),
    sessionId: '0000000000000001',
    customerNumber: '',
    agentNumber: '',
    recordingFlag: 0,
    pilotNumber: cfg.pilots[0] || '',
  };
  const log = {
    at,
    note: 'Settings test only. Customer and agent numbers were left blank so this does not dial a call.',
    request: {
      method: 'POST',
      url,
      headers: { apikey: maskSecret(cfg.apiKey), 'Content-Type': 'application/json' },
      body,
    },
    response: null,
    error: null,
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { apikey: cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = text; }
    let safeBody = parsed;
    try { safeBody = JSON.parse(redactSecret(parsed, cfg.apiKey)); } catch { safeBody = redactSecret(parsed, cfg.apiKey); }
    log.response = { status: response.status, body: safeBody };
    const bodyMessage = typeof parsed === 'object' && parsed ? String(parsed.message || parsed.error || '') : '';
    const authFailed = response.status === 401 || response.status === 403;
    const missingRoute = response.status === 404;
    const serverError = response.status >= 500;
    const blankNumberCheck = response.status === 400 && /number|\+91/i.test(bodyMessage);
    const ok = !authFailed && !missingRoute && !serverError && ((response.status >= 200 && response.status < 300) || blankNumberCheck);
    return {
      ok,
      message: ok
        ? (blankNumberCheck
          ? 'Kommuno accepted the account. No call was placed because the test numbers were left blank.'
          : 'Kommuno API test succeeded.')
        : `Kommuno API test failed (${response.status}).`,
      log,
    };
  } catch (error) {
    log.error = error?.name === 'TimeoutError' ? 'The Kommuno API did not answer within 15 seconds.' : (error?.message || 'Network error');
    return { ok: false, message: 'Kommuno API test failed. The server could not reach Kommuno.', log };
  }
}

export async function loadKommunoSettings() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS kommuno_settings (
      id TINYINT NOT NULL PRIMARY KEY,
      base_url VARCHAR(255) NOT NULL DEFAULT '',
      api_key VARCHAR(255) NOT NULL DEFAULT '',
      sme_id VARCHAR(32) NOT NULL DEFAULT '',
      pilot_numbers VARCHAR(500) NOT NULL DEFAULT '',
      webhook_token VARCHAR(255) NOT NULL DEFAULT '',
      public_base_url VARCHAR(255) NOT NULL DEFAULT '',
      recording_flag TINYINT NOT NULL DEFAULT 1,
      last_test_ok TINYINT NULL,
      last_test_message VARCHAR(500) NULL,
      last_test_log MEDIUMTEXT NULL,
      updated_at DATETIME NULL,
      updated_by VARCHAR(255) NULL
    )
  `);
  const [columns] = await db.query('SHOW COLUMNS FROM kommuno_settings');
  const have = new Set((columns || []).map((column) => column.Field));
  const alters = [];
  if (!have.has('last_test_ok')) alters.push('ADD COLUMN last_test_ok TINYINT NULL');
  if (!have.has('last_test_message')) alters.push('ADD COLUMN last_test_message VARCHAR(500) NULL');
  if (!have.has('last_test_log')) alters.push('ADD COLUMN last_test_log MEDIUMTEXT NULL');
  if (alters.length) await db.query(`ALTER TABLE kommuno_settings ${alters.join(', ')}`);
  const [rows] = await db.query(
    `SELECT base_url, api_key, sme_id, pilot_numbers, webhook_token, public_base_url, recording_flag,
            last_test_ok, last_test_message, last_test_log
     FROM kommuno_settings WHERE id = 1`
  );
  savedSettings = rows[0] || null;
  return savedSettings;
}

export async function saveKommunoSettings(input = {}, updatedBy = 'admin') {
  if (!savedSettings) await loadKommunoSettings();
  const current = getConfig();
  const next = {
    base_url: resolveSetting(input.baseUrl, current.baseUrl),
    api_key: resolveSetting(input.apiKey, current.apiKey),
    sme_id: resolveSetting(input.smeId, current.smeId),
    pilot_numbers: resolveSetting(input.pilotNumbers, current.pilots.join(',')),
    webhook_token: resolveSetting(input.webhookToken, current.webhookToken),
    public_base_url: resolveSetting(input.publicBaseUrl, current.publicBase),
    recording_flag: input.recording === false || input.recording === 0 || input.recording === '0' ? 0 : 1,
  };
  await db.execute(
    `INSERT INTO kommuno_settings
      (id, base_url, api_key, sme_id, pilot_numbers, webhook_token, public_base_url, recording_flag, updated_at, updated_by)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       base_url = VALUES(base_url),
       api_key = VALUES(api_key),
       sme_id = VALUES(sme_id),
       pilot_numbers = VALUES(pilot_numbers),
       webhook_token = VALUES(webhook_token),
       public_base_url = VALUES(public_base_url),
       recording_flag = VALUES(recording_flag),
       updated_at = VALUES(updated_at),
       updated_by = VALUES(updated_by)`,
    [
      next.base_url,
      next.api_key,
      next.sme_id,
      next.pilot_numbers,
      next.webhook_token,
      next.public_base_url,
      next.recording_flag,
      String(updatedBy || 'admin').slice(0, 255),
    ]
  );
  savedSettings = next;
  const test = await testKommunoApi();
  const logText = JSON.stringify(test.log || {}).slice(0, 20000);
  await db.execute(
    `UPDATE kommuno_settings
     SET last_test_ok = ?, last_test_message = ?, last_test_log = ?
     WHERE id = 1`,
    [test.ok ? 1 : 0, String(test.message || '').slice(0, 500), logText]
  );
  savedSettings = { ...next, last_test_ok: test.ok ? 1 : 0, last_test_message: test.message, last_test_log: logText };
  return publicKommunoSettings();
}

export function webhookAuthorized(req) {
  const token = getConfig().webhookToken;
  if (!token) {
    if (!warnedOpenWebhook) {
      warnedOpenWebhook = true;
      console.warn('Kommuno webhook is open. Set KOMMUNO_WEBHOOK_TOKEN to require a shared secret.');
    }
    return true;
  }
  const provided = String(req.headers['x-kommuno-token'] || req.query?.token || '').trim();
  return provided === token;
}

export function status() {
  const cfg = getConfig();
  return {
    configured: cfg.ready,
    callReady: cfg.ready && Number(savedSettings?.last_test_ok) === 1,
    missing: cfg.missing,
    pilotNumbers: cfg.pilots.map((number) => maskSecret(number)),
    recording: cfg.recordingFlag === 1,
    webhookUrl: cfg.webhookUrl,
    callbackUrl: `${cfg.webhookUrl.replace(/\/webhook$/, '')}/callback`,
    incomingUrl: `${cfg.webhookUrl.replace(/\/webhook$/, '')}/incoming`,
    recordingUrl: `${cfg.webhookUrl.replace(/\/webhook$/, '')}/recording`,
  };
}

export function normalizeKommunoPayload(body) {
  const root = asObject(body);
  const details = asObject(root.call_details || root);
  const customer = asObject(root.customer_details);
  const recording = asObject(root.recording_details);
  const agent = { ...pickAgent(root), ...pickAgent(details) };
  const liveEvent = String(details.live_event || root.live_event || '').trim();
  const direction = String(details.call_direction || root.call_direction || customer.call_direction || '').trim().toUpperCase();
  const sessionId = String(details.session_id || root.session_id || recording.session_id || '').trim();
  const fromNumber = String(details.from || root.from || '').trim();
  const toNumber = String(details.to || root.to || '').trim();
  const customerNumber = String(
    details.customer_number || customer.customer_number || root.customer_number || fromNumber || ''
  ).trim();
  const longcode = String(details.longcode || root.longcode || '').trim();
  const pilotNumber = longcode ? toE164(longcode) : toE164(toNumber);
  const overall = String(details.overall_call_status || customer.call_status || root.overall_call_status || '').trim();
  const recordingUrl = String(recording.recording_path || details.recording_path || root.recording_path || '').trim();
  let status = 'updated';
  const eventKey = liveEvent.toLowerCase();
  if (eventKey.includes('completed') || recordingUrl || details.end_date_time) {
    const outcome = overall.toLowerCase();
    status = !outcome || outcome === 'patched' || outcome === 'answered' || outcome === 'connected' ? 'completed' : 'missed';
  } else if (eventKey.includes('ring')) {
    status = 'ringing';
  } else if (eventKey.includes('popup')) {
    status = 'connected';
  }
  return {
    smeId: String(details.sme_id || root.sme_id || customer.sme_id || ''),
    sessionId,
    direction: direction === 'INCOMING' || direction === 'OUTGOING' ? direction : '',
    liveEvent,
    status,
    fromNumber: toE164(fromNumber),
    toNumber: toE164(toNumber),
    customerNumber: toE164(customerNumber),
    pilotNumber,
    agentNumber: toE164(agent.agent_number || agent.agentNumber || ''),
    agentName: String(agent.agent_name || agent.agentName || '').trim(),
    agentEmail: String(agent.agent_email || agent.agentEmail || '').trim().toLowerCase(),
    agentRef: String(agent.agent_id || agent.agentId || ''),
    duration: Number(details.duration || customer.duration || recording.duration || 0) || 0,
    connectedDuration: Number(details.connected_duration || customer.connected_duration || 0) || 0,
    ringingDuration: Number(details.ringing_duration || customer.ringing_duration || 0) || 0,
    overallCallStatus: overall,
    disconnectedBy: String(details.disconnected_by || '').trim(),
    recordingUrl,
    contactName: String(customer.customer_name || details.customer_name || '').trim(),
    startedAt: toIso(details.start_date_time || details.date_time || root.date_time || agent.start_date || null),
    endedAt: details.end_date_time ? toIso(details.end_date_time) : null,
  };
}

async function ensureTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id VARCHAR(64) PRIMARY KEY,
      session_id VARCHAR(160) NOT NULL,
      direction VARCHAR(16) NULL,
      live_event VARCHAR(64) NULL,
      status VARCHAR(32) NULL,
      sme_id VARCHAR(32) NULL,
      from_number VARCHAR(32) NULL,
      to_number VARCHAR(32) NULL,
      customer_number VARCHAR(32) NULL,
      pilot_number VARCHAR(32) NULL,
      agent_number VARCHAR(32) NULL,
      agent_name VARCHAR(191) NULL,
      agent_email VARCHAR(191) NULL,
      agent_ref VARCHAR(64) NULL,
      lead_id VARCHAR(64) NULL,
      lead_name VARCHAR(255) NULL,
      contact_name VARCHAR(255) NULL,
      user_email VARCHAR(191) NULL,
      user_name VARCHAR(191) NULL,
      duration INT NULL,
      connected_duration INT NULL,
      ringing_duration INT NULL,
      overall_call_status VARCHAR(64) NULL,
      disconnected_by VARCHAR(64) NULL,
      recording_url TEXT NULL,
      call_log_id VARCHAR(64) NULL,
      started_at VARCHAR(40) NULL,
      ended_at VARCHAR(40) NULL,
      raw_payload LONGTEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_kommuno_session (session_id)
    )
  `);
}

async function ensureCallLogColumns() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id VARCHAR(128) PRIMARY KEY,
        phone_number VARCHAR(64) NOT NULL,
        lead_id VARCHAR(128) NULL,
        lead_name VARCHAR(255) NULL,
        contact_name VARCHAR(255) NULL,
        call_type VARCHAR(32) DEFAULT 'lead',
        timestamp VARCHAR(64) NULL,
        duration INT DEFAULT 0,
        notes TEXT NULL,
        outcome VARCHAR(32) NULL,
        user_id VARCHAR(255) NULL,
        user_email VARCHAR(255) NULL,
        user_name VARCHAR(255) NULL,
        direction VARCHAR(16) NULL,
        recording_url TEXT NULL,
        session_id VARCHAR(160) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_call_logs_lead (lead_id),
        INDEX idx_call_logs_user (user_email),
        INDEX idx_call_logs_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const table = await resolveTableNameOrFallback(['call_logs', 'CallLogs'], 'call_logs');
    const raw = table.replace(/`/g, '');
    const [rows] = await db.query('SHOW COLUMNS FROM ??', [raw]);
    const cols = new Set((rows || []).map((row) => row.Field));
    const alters = [];
    if (!cols.has('direction')) alters.push('ADD COLUMN direction VARCHAR(16) NULL');
    if (!cols.has('recording_url')) alters.push('ADD COLUMN recording_url TEXT NULL');
    if (!cols.has('session_id')) alters.push('ADD COLUMN session_id VARCHAR(160) NULL');
    if (alters.length) {
      await db.query(`ALTER TABLE \`${raw}\` ${alters.join(', ')}`);
      invalidateColumns(raw);
    }
  } catch (error) {
    console.warn('Call log extra columns skipped:', error.message);
  }
}

export async function ensureKommuno() {
  await ensureTable();
  await ensureCallLogColumns();
  await loadKommunoSettings();
}

async function getUsers() {
  if (Date.now() - usersCache.at < 15000 && usersCache.rows.length) return usersCache.rows;
  const rows = await userService.getAllUsers();
  usersCache = { at: Date.now(), rows: rows || [] };
  return usersCache.rows;
}

async function findUser({ email, number, name }) {
  const users = await getUsers();
  const emailKey = String(email || '').trim().toLowerCase();
  const phoneKey = last10(number);
  const nameKey = String(name || '').trim().toLowerCase();
  if (emailKey) {
    const match = users.find((user) => String(user.email || '').trim().toLowerCase() === emailKey);
    if (match) return match;
  }
  if (phoneKey.length >= 10) {
    const match = users.find((user) => last10(user.phone || user.Phone) === phoneKey);
    if (match) return match;
  }
  if (nameKey) {
    const match = users.find((user) => String(user.name || '').trim().toLowerCase() === nameKey);
    if (match) return match;
  }
  return null;
}

async function findLeadByPhone(phone) {
  const key = last10(phone);
  if (key.length < 7) return null;
  try {
    const table = await resolveTableNameOrFallback(['leads', 'Leads'], 'leads');
    const cols = await getColumns(table);
    const idCol = cols.has('id') ? 'id' : (cols.has('firebase_id') ? 'firebase_id' : 'id');
    const nameCol = cols.has('agencyName') ? 'agencyName' : (cols.has('agency_name') ? 'agency_name' : null);
    const contactsCol = cols.has('contacts') ? 'contacts' : null;
    if (!contactsCol) return null;
    const [rows] = await db.query(
      `SELECT \`${idCol}\` AS id, ${nameCol ? `\`${nameCol}\`` : "''"} AS agencyName, \`${contactsCol}\` AS contacts
       FROM ${table} WHERE \`${contactsCol}\` LIKE ? LIMIT 40`,
      [`%${key}%`]
    );
    for (const row of rows || []) {
      let contacts = row.contacts;
      if (typeof contacts === 'string') {
        try { contacts = JSON.parse(contacts); } catch { contacts = []; }
      }
      if (!Array.isArray(contacts)) continue;
      for (const contact of contacts) {
        const phones = [contact?.phone, contact?.mobile, contact?.alternateMobile, contact?.alternate_mobile];
        if (phones.some((item) => last10(item) === key)) {
          return {
            id: row.id == null ? '' : String(row.id),
            leadName: row.agencyName || '',
            contactName: contact?.name || '',
          };
        }
      }
    }
  } catch (error) {
    console.warn('Lead match skipped:', error.message);
  }
  return null;
}

function outcomeFrom(event) {
  const value = String(event.overallCallStatus || event.status || '').toLowerCase();
  if (value === 'patched' || value === 'answered' || value === 'connected' || value === 'completed') return 'answered';
  if (value.includes('busy')) return 'busy';
  if (value.includes('voice')) return 'voicemail';
  if (event.status === 'missed' || value.includes('miss') || value.includes('cancel') || value.includes('no')) return 'no-answer';
  return 'other';
}

async function writeCompletedCallLog(row, event) {
  if (row.call_log_id) return row.call_log_id;
  const talkSeconds = event.connectedDuration || event.duration || row.connected_duration || row.duration || 0;
  const direction = event.direction || row.direction || 'CALL';
  const notes = [
    `Kommuno ${direction}`,
    event.overallCallStatus || row.overall_call_status || event.status,
    `session ${event.sessionId || row.session_id}`,
    event.recordingUrl ? `Recording: ${event.recordingUrl}` : '',
  ].filter(Boolean).join(' | ');
  const saved = await callLogsService.addCallLog({
    phoneNumber: event.customerNumber || row.customer_number || '',
    leadId: event.leadId || row.lead_id || null,
    leadName: event.leadName || row.lead_name || '',
    contactName: event.contactName || row.contact_name || '',
    callType: (event.leadId || row.lead_id) ? 'lead' : 'non-lead',
    timestamp: event.startedAt || row.started_at || new Date().toISOString(),
    duration: talkSeconds,
    notes,
    outcome: outcomeFrom(event),
    userId: event.userEmail || row.user_email || event.agentEmail || '',
    userEmail: event.userEmail || row.user_email || event.agentEmail || '',
    userName: event.userName || row.user_name || event.agentName || 'Kommuno',
    direction,
    recordingUrl: event.recordingUrl || '',
    sessionId: event.sessionId || row.session_id || '',
  });
  return saved?.id || null;
}

function fill(current, incoming) {
  if (incoming === undefined || incoming === null || incoming === '') {
    return current === undefined ? null : current;
  }
  return incoming;
}

async function upsertEvent(event, raw) {
  await ensureTable();
  const [existingRows] = await db.query(`SELECT * FROM ${TABLE} WHERE session_id = ? LIMIT 1`, [event.sessionId]);
  let existing = existingRows?.[0] || null;
  if (!existing && event.direction === 'OUTGOING' && event.customerNumber) {
    const [openRows] = await db.query(
      `SELECT * FROM ${TABLE}
       WHERE direction = 'OUTGOING'
         AND status IN ('initiated', 'ringing', 'connected')
         AND created_at >= DATE_SUB(NOW(), INTERVAL 20 MINUTE)
       ORDER BY created_at DESC LIMIT 20`
    );
    existing = (openRows || []).find((row) => {
      if (last10(row.customer_number) !== last10(event.customerNumber)) return false;
      if (event.agentNumber && row.agent_number && last10(row.agent_number) !== last10(event.agentNumber)) return false;
      return true;
    }) || null;
  }

  const lead = event.customerNumber ? await findLeadByPhone(event.customerNumber) : null;
  const user = await findUser({ email: event.agentEmail, number: event.agentNumber, name: event.agentName });
  event.leadId = lead?.id || event.leadId || existing?.lead_id || '';
  event.leadName = lead?.leadName || event.leadName || existing?.lead_name || '';
  event.contactName = event.contactName || lead?.contactName || existing?.contact_name || '';
  event.userEmail = user?.email || event.userEmail || existing?.user_email || event.agentEmail || '';
  event.userName = user?.name || event.userName || existing?.user_name || event.agentName || '';

  const previousRank = EVENT_RANK[existing?.status] ?? -1;
  const nextRank = EVENT_RANK[event.status] ?? 1;
  const keepStatus = existing && previousRank > nextRank;
  const status = keepStatus ? existing.status : event.status;
  const liveEvent = keepStatus ? existing.live_event : (event.liveEvent || existing?.live_event || '');
  let callLogId = existing?.call_log_id || null;
  if ((status === 'completed' || status === 'missed') && !callLogId) {
    try {
      callLogId = await writeCompletedCallLog(existing || {}, { ...event, status });
    } catch (error) {
      console.error('Kommuno call log write failed:', error.message);
    }
  }

  const record = {
    session_id: event.sessionId,
    direction: fill(existing?.direction, event.direction),
    live_event: liveEvent,
    status,
    sme_id: fill(existing?.sme_id, event.smeId),
    from_number: fill(existing?.from_number, event.fromNumber),
    to_number: fill(existing?.to_number, event.toNumber),
    customer_number: fill(existing?.customer_number, event.customerNumber),
    pilot_number: fill(existing?.pilot_number, event.pilotNumber),
    agent_number: fill(existing?.agent_number, event.agentNumber),
    agent_name: fill(existing?.agent_name, event.agentName),
    agent_email: fill(existing?.agent_email, event.agentEmail),
    agent_ref: fill(existing?.agent_ref, event.agentRef),
    lead_id: fill(existing?.lead_id, event.leadId),
    lead_name: fill(existing?.lead_name, event.leadName),
    contact_name: fill(existing?.contact_name, event.contactName),
    user_email: fill(existing?.user_email, event.userEmail),
    user_name: fill(existing?.user_name, event.userName),
    duration: event.duration || existing?.duration || 0,
    connected_duration: event.connectedDuration || existing?.connected_duration || 0,
    ringing_duration: event.ringingDuration || existing?.ringing_duration || 0,
    overall_call_status: fill(existing?.overall_call_status, event.overallCallStatus),
    disconnected_by: fill(existing?.disconnected_by, event.disconnectedBy),
    recording_url: fill(existing?.recording_url, event.recordingUrl),
    call_log_id: callLogId,
    started_at: existing?.started_at || event.startedAt,
    ended_at: event.endedAt || existing?.ended_at || null,
    raw_payload: JSON.stringify(raw).slice(0, 65000),
  };

  if (existing) {
    const assignments = Object.keys(record).map((key) => `\`${key}\` = ?`).join(', ');
    const values = Object.values(record).map((value) => (value === undefined ? null : value));
    await db.execute(`UPDATE ${TABLE} SET ${assignments} WHERE id = ?`, [...values, existing.id]);
    return { id: existing.id, sessionId: record.session_id, status, matchedLead: Boolean(record.lead_id) };
  }

  const id = `km_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const columns = ['id', ...Object.keys(record)];
    const values = Object.values(record).map((value) => (value === undefined ? null : value));
    await db.execute(
    `INSERT INTO ${TABLE} (\`${columns.join('`, `')}\`) VALUES (${columns.map(() => '?').join(', ')})`,
    [id, ...values]
  );
  return { id, sessionId: record.session_id, status, matchedLead: Boolean(record.lead_id) };
}

export async function ingest(body) {
  const payloads = Array.isArray(body) ? body : [body];
  const results = [];
  for (const payload of payloads) {
    const event = normalizeKommunoPayload(payload);
    if (!event.sessionId && !event.customerNumber && !event.liveEvent) {
      results.push({ ignored: true });
      continue;
    }
    if (!event.sessionId) event.sessionId = newSessionId();
    results.push(await upsertEvent(event, payload));
  }
  return { received: results.length, results };
}

async function resolveAgentNumber(input) {
  const cfg = getConfig();
  const email = String(input.userEmail || '').trim().toLowerCase();
  if (email && cfg.agentMap[email]) return cfg.agentMap[email];
  if (input.agentNumber) return toE164(input.agentNumber);
  if (!email) return '';
  const user = await findUser({ email, number: '', name: '' });
  return toE164(user?.phone || user?.Phone || '');
}

export async function clickToCall(input) {
  const cfg = getConfig();
  if (!cfg.ready) return { configured: false, fallback: 'tel' };
  const customerNumber = toE164(input.customerNumber || input.phone || input.phoneNumber);
  if (!customerNumber) {
    const error = new Error('Customer number is required');
    error.statusCode = 400;
    throw error;
  }
  const agentNumber = await resolveAgentNumber(input);
  if (!agentNumber) {
    const error = new Error('Your CRM profile has no phone. Save the mobile number registered on Kommuno, then call again.');
    error.statusCode = 400;
    throw error;
  }
  const pilotNumber = toE164(input.pilotNumber) || cfg.pilots[0];
  const sessionId = newSessionId();
  const payload = {
    smeId: String(cfg.smeId),
    sessionId,
    customerNumber,
    agentNumber,
    recordingFlag: cfg.recordingFlag,
    pilotNumber,
  };
  const response = await fetch(clickToCallUrl(cfg.baseUrl), {
    method: 'POST',
    headers: {
      apikey: cfg.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok || (data.status && Number(data.status) >= 400)) {
    const error = new Error(data.message || data.error || `Kommuno rejected the call (${response.status})`);
    error.statusCode = 502;
    throw error;
  }
  const user = await findUser({ email: input.userEmail, number: agentNumber, name: '' });
  const lead = input.leadId
    ? { id: String(input.leadId), leadName: input.leadName || '', contactName: input.contactName || '' }
    : await findLeadByPhone(customerNumber);
  await upsertEvent({
    smeId: cfg.smeId,
    sessionId,
    direction: 'OUTGOING',
    liveEvent: 'crm_click_to_call',
    status: 'initiated',
    fromNumber: agentNumber,
    toNumber: pilotNumber,
    customerNumber,
    pilotNumber,
    agentNumber,
    agentName: user?.name || '',
    agentEmail: String(user?.email || input.userEmail || '').toLowerCase(),
    agentRef: '',
    duration: 0,
    connectedDuration: 0,
    ringingDuration: 0,
    overallCallStatus: 'initiated',
    disconnectedBy: '',
    recordingUrl: '',
    contactName: input.contactName || lead?.contactName || '',
    startedAt: new Date().toISOString(),
    endedAt: null,
    leadId: lead?.id || '',
    leadName: input.leadName || lead?.leadName || '',
    userEmail: user?.email || input.userEmail || '',
    userName: user?.name || '',
  }, { request: payload, response: data });
  return {
    configured: true,
    fallback: null,
    sessionId,
    message: data.message || 'call initiated done',
    pilotNumber,
    agentNumber,
  };
}

function rowAgeMs(row) {
  const raw = row.updated_at || row.created_at || row.started_at;
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const text = String(raw).trim();
  let parsed;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) parsed = new Date(text);
  else if (text.includes('T')) parsed = new Date(text);
  else parsed = new Date(`${text.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return Number.MAX_SAFE_INTEGER;
  return Date.now() - parsed.getTime();
}

export async function liveForUser(email) {
  await ensureTable();
  const user = await findUser({ email, number: '', name: '' });
  const [rows] = await db.query(
    `SELECT * FROM ${TABLE} WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) ORDER BY updated_at DESC LIMIT 40`
  );
  const emailKey = String(email || user?.email || '').trim().toLowerCase();
  const phoneKey = last10(user?.phone || user?.Phone);
  const calls = (rows || []).filter((row) => {
    const mine = (emailKey && String(row.user_email || row.agent_email || '').toLowerCase() === emailKey)
      || (phoneKey.length >= 10 && last10(row.agent_number) === phoneKey);
    if (!mine) return false;
    const age = rowAgeMs(row);
    // Dialing with no ring is only a request. Drop it after 60s so the card does not stay up.
    if (row.status === 'initiated') return age < 60 * 1000;
    if (row.status === 'ringing' || row.status === 'connected') return age < 30 * 60 * 1000;
    if (row.status === 'completed' || row.status === 'missed') return age < 2 * 60 * 1000;
    return false;
  }).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    direction: row.direction,
    status: row.status,
    customerNumber: row.customer_number,
    pilotNumber: row.pilot_number,
    agentNumber: row.agent_number,
    agentName: row.agent_name,
    leadId: row.lead_id,
    leadName: row.lead_name,
    contactName: row.contact_name,
    duration: row.connected_duration || row.duration || 0,
    recordingUrl: row.recording_url,
    startedAt: row.started_at,
  }));
  return calls;
}
