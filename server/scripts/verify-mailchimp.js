/**
 * Proves the Mailchimp sync without a live key, then reports the real .env.
 *
 *   node server/scripts/verify-mailchimp.js
 *   node server/scripts/verify-mailchimp.js --live --email you@example.com
 *
 * --live calls Mailchimp with the key in .env and prints ok or the error.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { syncLeadToMailchimp, checkMailchimpAudience } = await import('../services/mailchimpService.js');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function startMock() {
  const hits = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
    hits.push({ method: req.method, url: req.url, auth: req.headers.authorization || '', body });

    if (req.url?.includes('fail-auth')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ title: 'API Key Invalid', detail: 'Your API key may be invalid.' }));
      return;
    }
    if (req.method === 'PUT' && req.url?.includes('/members/')) {
      const status = body.status_if_new === 'subscribed' ? 'subscribed' : 'transactional';
      const forced = req.url.includes('was-unsubscribed') ? 'unsubscribed' : status;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: forced, email_address: body.email_address }));
      return;
    }
    if (req.method === 'PATCH') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: body.status }));
      return;
    }
    if (req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === 'GET' && req.url?.includes('/lists/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'aud123', name: 'Agents', stats: { member_count: 4 } }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: 'not found' }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, hits, port });
    });
  });
}

async function runMock() {
  const { server, hits, port } = await startMock();
  const prev = {
    key: process.env.MAILCHIMP_API_KEY,
    audience: process.env.MAILCHIMP_AUDIENCE_ID,
    base: process.env.MAILCHIMP_API_BASE,
    env: process.env.NODE_ENV,
  };
  process.env.NODE_ENV = 'development';
  process.env.MAILCHIMP_API_KEY = 'test-key-us21';
  process.env.MAILCHIMP_AUDIENCE_ID = 'aud123';
  process.env.MAILCHIMP_API_BASE = `http://127.0.0.1:${port}`;

  try {
    const missingEmail = await syncLeadToMailchimp({ agencyName: 'No Email Agency', contacts: [{ name: 'A' }] });
    assert(missingEmail.status === 'skipped', `expected skipped, got ${missingEmail.status}`);

    const subscribed = await syncLeadToMailchimp({
      email: 'priya@globaledu.in',
      full_name: 'Priya Sharma',
      phone: '9876543210',
      form_id: 'become_partner',
      consent: { email: true, whatsapp: true, sms: false, calls: false },
    }, { source: 'become_partner', leadId: 'lead-1' });
    assert(subscribed.ok === true && subscribed.status === 'subscribed', JSON.stringify(subscribed));
    const put = hits.find((h) => h.method === 'PUT');
    assert(put, 'expected a PUT to create or update the member');
    assert(put.body.email_address === 'priya@globaledu.in', 'email was not sent');
    assert(put.body.status_if_new === 'subscribed', 'Email consent should subscribe a new member');
    assert(put.body.merge_fields.FNAME === 'Priya', 'first name was not split');
    assert(put.body.merge_fields.PHONE === '+919876543210', '10-digit phone should be sent as +91');
    assert(put.auth.startsWith('Basic '), 'Mailchimp auth header missing');
    const tagCall = hits.find((h) => h.method === 'POST' && h.url.includes('/tags'));
    assert(tagCall, 'expected a tags call');
    const tagNames = tagCall.body.tags.map((t) => t.name);
    assert(tagNames.includes('Form: Become a Partner'), 'form tag missing');
    assert(tagNames.includes('Consent: Email') && tagNames.includes('Consent: WhatsApp'), 'consent tags missing');

    hits.length = 0;
    const quiet = await syncLeadToMailchimp({
      email: 'quiet@globaledu.in',
      full_name: 'Quiet Partner',
      phone: '+919800000000',
    });
    assert(quiet.ok === true && quiet.status === 'transactional', JSON.stringify(quiet));
    assert(quiet.audienceId === 'aud123', 'partner lead must use the Agents audience');
    assert(quiet.tags.includes('crm_agent_lead'), 'partner lead must be tagged crm_agent_lead');
    const quietPut = hits.find((h) => h.method === 'PUT');
    assert(quietPut.url.includes('/lists/aud123/'), 'partner lead must be written to the Agents list');
    assert(quietPut.body.status_if_new === 'transactional', 'no Email tick must stay transactional');

    process.env.MAILCHIMP_STUDENTS_AUDIENCE_ID = 'students1';
    hits.length = 0;
    const student = await syncLeadToMailchimp({
      email: 'student@example.com',
      full_name: 'Student One',
      form_id: 'student_enquiry',
    });
    assert(student.audienceId === 'students1', JSON.stringify(student));
    hits.length = 0;
    const agent = await syncLeadToMailchimp({
      email: 'agent@example.com',
      full_name: 'Agent Partner',
      form_id: 'crm_agent_lead',
    });
    assert(agent.audienceId === 'aud123' && agent.tags.includes('crm_agent_lead'), JSON.stringify(agent));
    const agentPut = hits.find((h) => h.method === 'PUT');
    assert(agentPut.url.includes('/lists/aud123/'), 'crm_agent_lead must not use the students list');
    delete process.env.MAILCHIMP_STUDENTS_AUDIENCE_ID;

    const savedKey = process.env.MAILCHIMP_API_KEY;
    const savedAudience = process.env.MAILCHIMP_AUDIENCE_ID;
    delete process.env.MAILCHIMP_API_KEY;
    const notConfigured = await syncLeadToMailchimp({ email: 'priya@globaledu.in', full_name: 'Priya Sharma' });
    assert(notConfigured.status === 'not_configured', JSON.stringify(notConfigured));
    process.env.MAILCHIMP_API_KEY = 'not-a-datacenter';
    process.env.MAILCHIMP_AUDIENCE_ID = savedAudience;
    const badKey = await syncLeadToMailchimp({ email: 'priya@globaledu.in', full_name: 'Priya Sharma' });
    assert(badKey.status === 'not_configured' && /datacenter/.test(badKey.detail), badKey.detail);

    process.env.MAILCHIMP_API_KEY = savedKey;
    process.env.MAILCHIMP_AUDIENCE_ID = 'fail-auth';
    const failed = await syncLeadToMailchimp({
      email: 'priya@globaledu.in',
      full_name: 'Priya Sharma',
      consent: { email: true },
    });
    assert(failed.ok === false && failed.status === 'error', JSON.stringify(failed));
    assert(/Mailchimp 401/.test(failed.detail), failed.detail);

    process.env.MAILCHIMP_AUDIENCE_ID = 'aud123';
    const ping = await checkMailchimpAudience();
    assert(ping.ok === true && ping.audienceName === 'Agents' && ping.memberCount === 4, JSON.stringify(ping));

    console.log('MOCK OK');
    console.log('- skipped when the lead has no email');
    console.log('- subscribed + tags when Email consent is ticked');
    console.log('- transactional crm_agent_lead written to the Agents list, not students');
    console.log('- not_configured when the key is missing or has no datacenter');
    console.log('- error recorded when Mailchimp returns 401:', failed.detail);
    console.log('- audience check returns name and member count');
  } finally {
    process.env.MAILCHIMP_API_KEY = prev.key;
    process.env.MAILCHIMP_AUDIENCE_ID = prev.audience;
    if (prev.base == null) delete process.env.MAILCHIMP_API_BASE;
    else process.env.MAILCHIMP_API_BASE = prev.base;
    process.env.NODE_ENV = prev.env;
    delete process.env.MAILCHIMP_STUDENTS_AUDIENCE_ID;
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runLive(email) {
  console.log('LIVE check against the key currently in .env');
  const ping = await checkMailchimpAudience();
  console.log(JSON.stringify(ping, null, 2));
  if (!email) return;
  const synced = await syncLeadToMailchimp({
    email,
    full_name: 'Mailchimp Verify',
    phone: '+919800000001',
    form_id: 'become_partner',
    consent: { email: false },
  }, { source: 'become_partner', leadId: 'manual-verify' });
  console.log(JSON.stringify(synced, null, 2));
}

const live = process.argv.includes('--live');
const emailFlag = process.argv.indexOf('--email');
const email = emailFlag >= 0 ? process.argv[emailFlag + 1] : '';

try {
  await runMock();
  if (live) await runLive(email);
} catch (error) {
  console.error('VERIFY FAILED:', error.message);
  process.exit(1);
}
