import React, { useEffect, useState } from 'react';
import apiClient from '../services/apiClient';

type MailchimpStatus = {
  ok?: boolean;
  configured?: boolean;
  source?: string;
  keySet?: boolean;
  keyHint?: string;
  audienceId?: string;
  datacenter?: string;
  detail?: string;
  audienceName?: string | null;
  memberCount?: number | null;
};

const MailchimpSettings: React.FC = () => {
  const [audienceId, setAudienceId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [status, setStatus] = useState<MailchimpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const applyStatus = (data: MailchimpStatus) => {
    setStatus(data);
    setAudienceId(data.audienceId || '');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/admin/mailchimp');
        if (!cancelled) applyStatus(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || e?.response?.data?.error || 'Could not load Mailchimp settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const payload = () => ({
    apiKey: apiKey.trim(),
    audienceId: audienceId.trim(),
  });

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { data } = await apiClient.put('/admin/mailchimp', payload());
      applyStatus(data);
      setApiKey('');
      setShowApiKey(false);
      setNotice(data.detail || 'Saved.');
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.response?.data?.error || 'Could not save Mailchimp settings.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setError('');
    setNotice('');
    try {
      const { data } = await apiClient.post('/admin/mailchimp/test', payload());
      setStatus((prev) => ({ ...prev, ...data }));
      setNotice(data.detail || 'Connected.');
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.detail) setStatus((prev) => ({ ...prev, ...data }));
      setError(data?.detail || data?.error || 'Mailchimp connection failed.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading Mailchimp settings…</p>;
  }

  return (
    <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Mailchimp</h3>
        <p className="text-sm text-slate-500 mt-1">
          Admin only. Partner leads are stored in the Agents audience as transactional contacts. Saving here does not send email.
        </p>
      </div>

      <div className={`rounded-lg px-3 py-2 text-sm ${status?.configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {status?.configured ? 'Configured' : 'Not configured'}
        {status?.source === 'admin' ? ' from this screen' : status?.source === 'env' ? ' from the server environment' : ''}
        {status?.keyHint ? ` · key ${status.keyHint}` : ''}
        {status?.audienceName ? ` · ${status.audienceName}` : ''}
      </div>

      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">API key</span>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={status?.keySet ? `Leave blank to keep ${status.keyHint}` : 'Paste the Mailchimp API key'}
            className="w-full px-3 py-2 pr-11 border border-slate-300 rounded-md"
          />
          <button
            type="button"
            onClick={() => setShowApiKey((open) => !open)}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            title={showApiKey ? 'Hide API key' : 'Show API key'}
          >
            {showApiKey ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58M9.88 5.09A10.94 10.94 0 0112 5c5.52 0 9.27 4.39 10.5 6.5a11.6 11.6 0 01-4.1 4.37M6.11 6.11A11.6 11.6 0 001.5 11.5C2.73 13.61 6.48 18 12 18c1.2 0 2.33-.18 3.37-.5" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
                <circle cx="12" cy="12" r="3" strokeWidth={2} />
              </svg>
            )}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-slate-700 mb-1">Agents audience ID</span>
        <input
          type="text"
          value={audienceId}
          onChange={(e) => setAudienceId(e.target.value)}
          placeholder="Audience ID for partner leads"
          className="w-full px-3 py-2 border border-slate-300 rounded-md"
        />
      </label>

      {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || testing}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={testConnection}
          disabled={saving || testing}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
    </div>
  );
};

export default MailchimpSettings;
