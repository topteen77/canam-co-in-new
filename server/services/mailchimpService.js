import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '../logs');

const FORMS = {
  become_partner: 'Become a Partner',
  contact_us: 'Contact',
  demo_request: 'Demo',
  event_registration: 'Event',
  newsletter: 'Newsletter',
  student_enquiry: 'Student',
  crm_agent_lead: 'CRM Agent Lead',
  crm_lead: 'CRM Agent Lead',
  website_signup: 'CRM Agent Lead',
};

const STEPS = ['account', 'verify', 'details', 'welcome'];

function logMailchimp(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  console.log('[mailchimp]', line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `mailchimp-${new Date().toISOString().slice(0, 10)}.log`);
    fs.appendFileSync(file, `${line}\n`);
  } catch {
    // logging must not block the lead save
  }
}

let savedSettings = null;

function buildConfig({ key, audienceId, studentsAudienceId, source }) {
  const cleanKey = String(key || '').trim();
  const cleanAudience = String(audienceId || '').trim();
  const cleanStudents = String(studentsAudienceId || '').trim();
  const fromAdmin = source === 'admin';
  if (!cleanKey) {
    return {
      configured: false,
      source,
      detail: fromAdmin
        ? 'Enter a Mailchimp API key. In Mailchimp open Profile → Extras → API keys. The key must end with the datacenter, for example -us21.'
        : 'Set MAILCHIMP_API_KEY in .env, or save it from Admin Panel → Mailchimp. The key must end with the datacenter, for example -us21.',
    };
  }
  const datacenter = cleanKey.slice(cleanKey.lastIndexOf('-') + 1);
  if (!/^[a-z]{2}\d+$/.test(datacenter)) {
    return {
      configured: false,
      source,
      detail: 'The API key must end with a datacenter such as -us21. Copy the whole key from Mailchimp.',
    };
  }
  if (!cleanAudience) {
    return {
      configured: false,
      source,
      key: cleanKey,
      datacenter,
      detail: fromAdmin
        ? 'Enter the Agents audience id. In Mailchimp open the audience and copy the Audience ID.'
        : 'Set MAILCHIMP_AUDIENCE_ID in .env, or save the Agents audience id from Admin Panel → Mailchimp.',
    };
  }
  const baseOverride = process.env.NODE_ENV !== 'production'
    ? String(process.env.MAILCHIMP_API_BASE || '').trim().replace(/\/$/, '')
    : '';
  return {
    configured: true,
    source,
    key: cleanKey,
    audienceId: cleanAudience,
    studentsAudienceId: cleanStudents,
    datacenter,
    base: baseOverride || `https://${datacenter}.api.mailchimp.com/3.0`,
  };
}

export function mailchimpConfig() {
  const savedKey = String(savedSettings?.api_key || '').trim();
  const savedAudience = String(savedSettings?.audience_id || '').trim();
  if (savedKey || savedAudience) {
    return buildConfig({
      key: savedKey,
      audienceId: savedAudience,
      studentsAudienceId: savedSettings?.students_audience_id,
      source: 'admin',
    });
  }
  return buildConfig({
    key: process.env.MAILCHIMP_API_KEY,
    audienceId: process.env.MAILCHIMP_AUDIENCE_ID,
    studentsAudienceId: process.env.MAILCHIMP_STUDENTS_AUDIENCE_ID,
    source: 'env',
  });
}

export function publicMailchimpStatus(config = mailchimpConfig(), extra = {}) {
  const key = String(config.key || '');
  return {
    ok: extra.ok ?? config.configured === true,
    configured: config.configured === true,
    source: config.source || 'env',
    keySet: Boolean(key),
    keyHint: key ? `••••${key.slice(-4)}` : '',
    audienceId: config.audienceId || '',
    studentsAudienceId: config.studentsAudienceId || '',
    datacenter: config.datacenter || '',
    detail: extra.detail || config.detail || (config.configured ? 'Mailchimp is configured.' : ''),
    audienceName: extra.audienceName || null,
    memberCount: extra.memberCount ?? null,
  };
}

export async function loadMailchimpSettings() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mailchimp_settings (
      id TINYINT NOT NULL PRIMARY KEY,
      api_key VARCHAR(255) NOT NULL DEFAULT '',
      audience_id VARCHAR(64) NOT NULL DEFAULT '',
      students_audience_id VARCHAR(64) NOT NULL DEFAULT '',
      updated_at DATETIME NULL,
      updated_by VARCHAR(255) NULL
    )
  `);
  const [rows] = await db.query(
    'SELECT api_key, audience_id, students_audience_id, updated_at, updated_by FROM mailchimp_settings WHERE id = 1'
  );
  savedSettings = rows[0] || { api_key: '', audience_id: '', students_audience_id: '' };
  return savedSettings;
}

export async function saveMailchimpSettings({ apiKey, audienceId, studentsAudienceId, updatedBy } = {}) {
  if (!savedSettings) await loadMailchimpSettings();
  const current = mailchimpConfig();
  const nextKey = String(apiKey || '').trim() || String(savedSettings?.api_key || '').trim() || String(current.key || '').trim();
  const nextStudents = String(studentsAudienceId || '').trim()
    || String(savedSettings?.students_audience_id || current.studentsAudienceId || '').trim();
  const next = buildConfig({
    key: nextKey,
    audienceId,
    studentsAudienceId: nextStudents,
    source: 'admin',
  });
  if (!next.configured) return publicMailchimpStatus(next, { ok: false });
  await db.query(
    `INSERT INTO mailchimp_settings (id, api_key, audience_id, students_audience_id, updated_at, updated_by)
     VALUES (1, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       api_key = VALUES(api_key),
       audience_id = VALUES(audience_id),
       students_audience_id = VALUES(students_audience_id),
       updated_at = VALUES(updated_at),
       updated_by = VALUES(updated_by)`,
    [next.key, next.audienceId, next.studentsAudienceId || '', String(updatedBy || 'admin').slice(0, 255)]
  );
  savedSettings = {
    api_key: next.key,
    audience_id: next.audienceId,
    students_audience_id: next.studentsAudienceId || '',
  };
  return publicMailchimpStatus(mailchimpConfig(), { ok: true, detail: 'Mailchimp settings saved. New leads use this audience. No email is sent.' });
}

export async function testMailchimpConnection(body = {}) {
  const current = mailchimpConfig();
  const typedKey = String(body.apiKey || '').trim();
  const config = buildConfig({
    key: typedKey || current.key,
    audienceId: body.audienceId != null && String(body.audienceId).trim() !== '' ? body.audienceId : current.audienceId,
    studentsAudienceId: body.studentsAudienceId != null ? body.studentsAudienceId : current.studentsAudienceId,
    source: typedKey ? 'admin' : (current.source || 'env'),
  });
  if (!config.configured) return publicMailchimpStatus(config, { ok: false });
  try {
    const list = await mc(config, `/lists/${config.audienceId}?fields=id,name,stats.member_count`, 'GET');
    return publicMailchimpStatus(config, {
      ok: true,
      detail: `Connected to audience "${list.name || config.audienceId}". No contact was added and no email was sent.`,
      audienceName: list.name || null,
      memberCount: list.stats?.member_count ?? null,
    });
  } catch (error) {
    return publicMailchimpStatus(config, {
      ok: false,
      detail: error?.message || 'Mailchimp request failed.',
    });
  }
}

function resolveFormId(lead, source) {
  const requested = String(lead?.form_id || source || 'crm_agent_lead');
  if (requested === 'student_enquiry') return 'student_enquiry';
  if (requested === 'crm_lead' || requested === 'website_signup' || requested === 'crm_agent_lead') {
    return 'crm_agent_lead';
  }
  return FORMS[requested] ? requested : 'crm_agent_lead';
}

function audienceFor(formId, config) {
  if (formId === 'student_enquiry') {
    if (!config.studentsAudienceId) {
      return { error: 'Student enquiries need MAILCHIMP_STUDENTS_AUDIENCE_ID so they are not added to the Agents list.' };
    }
    return { id: config.studentsAudienceId };
  }
  return { id: config.audienceId };
}

async function mc(config, apiPath, method = 'GET', body) {
  const res = await fetch(`${config.base}${apiPath}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`crm:${config.key}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const out = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = out.detail || out.title || out.error || 'error';
    throw new Error(`Mailchimp ${res.status}: ${detail}`);
  }
  return out;
}

function readConsent(lead) {
  const c = lead?.consent && typeof lead.consent === 'object' ? lead.consent : {};
  return {
    whatsapp: c.whatsapp === true,
    email: c.email === true || lead?.consentEmail === true,
    sms: c.sms === true,
    calls: c.calls === true,
    text_version: String(c.text_version || 'partner-consent-v1'),
    page_url: String(c.page_url || '').slice(0, 500),
    submitted_at: new Date().toISOString(),
    ip: String(c.ip || ''),
  };
}

export function leadToMailchimpInput(lead, source = 'crm_agent_lead') {
  const contacts = Array.isArray(lead?.contacts) ? lead.contacts : [];
  const primary = contacts.find((c) => c?.email) || contacts[0] || {};
  const email = String(lead?.email || primary.email || '').trim().toLowerCase();
  const fullName = String(
    lead?.full_name || lead?.fullName || lead?.name || primary.name || lead?.agencyName || ''
  ).trim();
  let phone = String(lead?.phone || primary.phone || '').replace(/[\s()-]/g, '');
  if (/^\d{10}$/.test(phone)) phone = `+91${phone}`;
  else if (phone && !phone.startsWith('+') && /^\d{8,15}$/.test(phone)) phone = `+${phone}`;
  const formId = resolveFormId(lead, source);
  const step = STEPS.includes(lead?.step) ? lead.step : 'account';
  return { email, fullName, phone, formId, step, consent: readConsent(lead) };
}

function stepLabel(step) {
  return `${step[0].toUpperCase()}${step.slice(1)}`;
}

export async function syncLeadToMailchimp(lead, meta = {}) {
  const input = leadToMailchimpInput(lead, meta.source || 'crm_agent_lead');
  const baseLog = {
    email: input.email || null,
    leadId: meta.leadId || null,
    source: meta.source || input.formId,
  };

  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email)) {
    const result = {
      ok: false,
      status: 'skipped',
      detail: 'Lead has no valid email, so nothing was sent to Mailchimp.',
      email: input.email || null,
    };
    logMailchimp({ ...baseLog, ...result });
    return result;
  }

  const config = mailchimpConfig();
  if (!config.configured) {
    const result = { ok: false, status: 'not_configured', detail: config.detail, email: input.email };
    logMailchimp({ ...baseLog, ...result });
    return result;
  }

  const audience = audienceFor(input.formId, config);
  if (audience.error) {
    const result = { ok: false, status: 'not_configured', detail: audience.error, email: input.email };
    logMailchimp({ ...baseLog, ...result });
    return result;
  }

  try {
    const hash = crypto.createHash('md5').update(input.email).digest('hex');
    const [first, ...rest] = input.fullName.split(/\s+/).filter(Boolean);
    // Store the person in the audience only. transactional does not receive campaigns
    // and does not trigger Mailchimp's confirmation email. Sending is a later step.
    const member = await mc(
      config,
      `/lists/${audience.id}/members/${hash}?skip_merge_validation=true`,
      'PUT',
      {
        email_address: input.email,
        status_if_new: 'transactional',
        merge_fields: {
          FNAME: first || input.fullName || 'Partner',
          LNAME: rest.join(' '),
          PHONE: input.phone,
        },
      }
    );
    const status = member.status;

    const channels = ['email', 'whatsapp', 'sms', 'calls'].filter((ch) => input.consent[ch]);
    const label = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS', calls: 'Calls' };
    const formLabel = FORMS[input.formId] || input.formId;
    const tags = [
      'iApply Partner Lead',
      'Source: iapply.io',
      `Form: ${formLabel}`,
      ...(input.formId === 'crm_agent_lead' ? ['crm_agent_lead'] : []),
      `Step: ${stepLabel(input.step)}`,
      ...(channels.length ? channels.map((ch) => `Consent: ${label[ch]}`) : ['Consent: None']),
    ];
    await mc(config, `/lists/${audience.id}/members/${hash}/tags`, 'POST', {
      tags: tags.map((name) => ({ name, status: 'active' })),
    });
    await mc(config, `/lists/${audience.id}/members/${hash}/notes`, 'POST', {
      note: `Consent ${input.consent.text_version} at ${input.consent.submitted_at}`
        + `${input.consent.page_url ? ` on ${input.consent.page_url}` : ''}: `
        + `${channels.join(', ') || 'none'}`,
    });

    const result = {
      ok: true,
      status,
      detail: `Saved in the Mailchimp audience as ${status}. No email was sent.`,
      email: input.email,
      audienceId: audience.id,
      tags,
    };
    logMailchimp({ ...baseLog, ...result });
    return result;
  } catch (error) {
    const result = {
      ok: false,
      status: 'error',
      detail: error?.message || 'Mailchimp request failed.',
      email: input.email,
      audienceId: audience.id,
    };
    logMailchimp({ ...baseLog, ...result });
    return result;
  }
}

export async function checkMailchimpAudience() {
  const config = mailchimpConfig();
  if (!config.configured) {
    return {
      ok: false,
      configured: false,
      detail: config.detail,
    };
  }
  try {
    const list = await mc(
      config,
      `/lists/${config.audienceId}?fields=id,name,stats.member_count`,
      'GET'
    );
    return {
      ok: true,
      configured: true,
      detail: `Connected to Mailchimp audience "${list.name || config.audienceId}".`,
      datacenter: config.datacenter,
      audienceId: list.id || config.audienceId,
      audienceName: list.name || null,
      memberCount: list.stats?.member_count ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      detail: error?.message || 'Mailchimp request failed.',
      datacenter: config.datacenter,
      audienceId: config.audienceId,
    };
  }
}
