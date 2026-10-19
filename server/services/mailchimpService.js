import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

export function mailchimpConfig() {
  const key = String(process.env.MAILCHIMP_API_KEY || '').trim();
  const audienceId = String(process.env.MAILCHIMP_AUDIENCE_ID || '').trim();
  const studentsAudienceId = String(process.env.MAILCHIMP_STUDENTS_AUDIENCE_ID || '').trim();
  if (!key) {
    return {
      configured: false,
      detail: 'Set MAILCHIMP_API_KEY in .env. In Mailchimp open Profile → Extras → API keys. The key must end with the datacenter, for example -us21.',
    };
  }
  const datacenter = key.slice(key.lastIndexOf('-') + 1);
  if (!/^[a-z]{2}\d+$/.test(datacenter)) {
    return {
      configured: false,
      detail: 'MAILCHIMP_API_KEY must end with a datacenter such as -us21. Copy the whole key from Mailchimp.',
    };
  }
  if (!audienceId) {
    return {
      configured: false,
      detail: 'Set MAILCHIMP_AUDIENCE_ID in .env. The Agents audience id in the partner spec is 2e5bc4f3ca.',
    };
  }
  const baseOverride = process.env.NODE_ENV !== 'production'
    ? String(process.env.MAILCHIMP_API_BASE || '').trim().replace(/\/$/, '')
    : '';
  return {
    configured: true,
    key,
    audienceId,
    studentsAudienceId,
    datacenter,
    base: baseOverride || `https://${datacenter}.api.mailchimp.com/3.0`,
  };
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
    const member = await mc(
      config,
      `/lists/${audience.id}/members/${hash}?skip_merge_validation=true`,
      'PUT',
      {
        email_address: input.email,
        status_if_new: input.consent.email ? 'subscribed' : 'transactional',
        merge_fields: {
          FNAME: first || input.fullName || 'Partner',
          LNAME: rest.join(' '),
          PHONE: input.phone,
        },
      }
    );

    let status = member.status;
    if (input.consent.email && status === 'transactional') {
      const patched = await mc(config, `/lists/${audience.id}/members/${hash}`, 'PATCH', { status: 'subscribed' });
      status = patched.status || 'subscribed';
    } else if (input.consent.email && status === 'unsubscribed') {
      const patched = await mc(config, `/lists/${audience.id}/members/${hash}`, 'PATCH', { status: 'pending' });
      status = patched.status || 'pending';
    }

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
      detail: `Mailchimp updated this email as ${status} in audience ${audience.id}.`,
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
