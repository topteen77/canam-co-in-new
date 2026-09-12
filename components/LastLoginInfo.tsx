import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../services/apiClient';
import type { ActiveSessionInfo } from '../services/authService';
import { lastLoginRows } from './LastLoginPopup';
import UserAvatar from './UserAvatar';

interface LastLoginInfoProps {
  availableUsers?: Array<{ email?: string; name?: string }>;
}

function formatWhen(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const LastLoginInfo: React.FC<LastLoginInfoProps> = ({ availableUsers = [] }) => {
  const [rows, setRows] = useState<ActiveSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const nameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    availableUsers.forEach((user) => {
      if (user.email) map.set(user.email.toLowerCase(), user.name || user.email);
    });
    return map;
  }, [availableUsers]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await apiClient.get('/admin/last-logins');
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        setError('This API is running old code and does not have /api/admin/last-logins yet. Restart it with: sudo pm2 restart new-crm-api');
      } else {
        setError(err?.response?.data?.error || err?.message || 'Could not load last login info.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const name = nameByEmail.get(String(row.userEmail || '').toLowerCase()) || '';
      return [row.userEmail, name, row.deviceId, row.deviceType, row.deviceName, row.ipAddress, row.location]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, nameByEmail]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Last login info</h3>
          <p className="text-sm text-slate-500">Shown only when someone signed in with the master password and ended the previous session.</p>
        </div>
        <button type="button" onClick={load} className="px-3 py-2 text-sm bg-slate-800 text-white rounded-lg min-h-[44px]">
          Refresh
        </button>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search user, device, IP, or location"
        className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm min-h-[44px]"
      />
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading last login info…</p>
      ) : (
        <div className="grid gap-3">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600 text-center">
              No master-password logins yet. This list fills when someone uses the master password to take over a session.
            </div>
          )}
          {filtered.map((row) => {
            const email = row.userEmail || 'Unknown user';
            const name = nameByEmail.get(email.toLowerCase()) || email;
            return (
              <article key={`${email}-${row.id || row.lastSeen}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <UserAvatar name={name || email} />
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900">{name}</h4>
                    <p className="text-xs text-slate-500 break-all">{email}</p>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                  {lastLoginRows(row).map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs font-semibold text-slate-500">{item.label}</dt>
                      <dd className="text-slate-800 break-all">
                        {item.href ? (
                          <a href={item.href} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
                            {item.value}
                          </a>
                        ) : item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-slate-400">Recorded {formatWhen(row.lastSeen)}</p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LastLoginInfo;
