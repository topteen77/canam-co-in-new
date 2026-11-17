import React, { useEffect, useState } from 'react';
import apiClient from '../services/apiClient';

type Settings = {
  ok?: boolean;
  email?: string;
  enabled?: boolean;
  configured?: boolean;
  smtpConfigured?: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
  error?: string;
};

const WebadminErrorSettings: React.FC = () => {
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const apply = (data: Settings) => {
    setSettings(data);
    setEmail(data.email || '');
    setEnabled(data.enabled !== false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/admin/webadmin-error-email');
        if (!cancelled) apply(data);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.response?.data?.error || 'Could not load webadmin error email settings.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await apiClient.put('/admin/webadmin-error-email', {
        email: email.trim(),
        enabled,
      });
      apply(data);
      setNotice(data.email
        ? `Saved. Crash emails will go to ${data.email}.`
        : 'Saved. Error email cleared — automatic crash emails are off until an address is set.');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not save webadmin error email.');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setError('');
    setNotice('');
    try {
      // Save first so the test uses the form value.
      await apiClient.put('/admin/webadmin-error-email', {
        email: email.trim(),
        enabled,
      });
      const { data } = await apiClient.post('/admin/webadmin-error-email/test');
      setNotice(data.sent
        ? `Test email sent to ${data.email || email}.`
        : `Test not sent (${data.reason || data.error || 'unknown'}).`);
      const refreshed = await apiClient.get('/admin/webadmin-error-email');
      apply(refreshed.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.reason || 'Test email failed.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading webadmin error email settings…</p>;
  }

  return (
    <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Webadmin error email</h3>
        <p className="text-sm text-slate-500 mt-1">
          Admin only. When the CRM crashes, a report with full error details and the signed-in user
          is emailed automatically so you can fix it quickly.
        </p>
      </div>

      <div className={`rounded-lg px-3 py-2 text-sm ${settings?.configured && settings?.enabled && settings?.smtpConfigured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
        <p className="font-semibold">
          {settings?.configured && settings?.enabled && settings?.smtpConfigured
            ? 'Automatic error emails are on'
            : 'Automatic error emails need setup'}
        </p>
        <p className="mt-0.5">
          {settings?.configured ? `Recipient: ${settings.email}.` : 'No recipient email saved yet.'}
          {' '}
          {settings?.smtpConfigured ? 'SMTP is configured on the server.' : 'SMTP_USER / SMTP_PASS are missing on the server.'}
          {settings?.updatedBy ? ` Last updated by ${settings.updatedBy}.` : ''}
        </p>
      </div>

      {notice ? (
        <div className="rounded-lg px-3 py-2 text-sm bg-emerald-50 text-emerald-800">{notice}</div>
      ) : null}
      {error ? (
        <div className="rounded-lg px-3 py-2 text-sm bg-rose-50 text-rose-800">{error}</div>
      ) : null}

      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">Webadmin email</span>
        <input
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="webadmin@example.com"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-slate-300"
        />
        Send crash emails automatically
      </label>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={sendTest}
          disabled={testing || !email.trim()}
          className="px-4 py-2 rounded-lg bg-white text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {testing ? 'Sending test…' : 'Send test email'}
        </button>
      </div>
    </div>
  );
};

export default WebadminErrorSettings;
