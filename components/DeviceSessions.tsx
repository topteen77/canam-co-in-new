import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../services/apiClient';
import { getDeviceFingerprint } from '../services/deviceFingerprint';
import { clearMasterUnlockToken, getMasterUnlockToken, masterUnlockHeaders, unlockMaster } from '../services/authService';

interface UsageRow {
  userEmail: string;
  loginCount: number;
  lastSeen?: string;
}

interface MostUsed {
  userEmail: string;
  loginCount: number;
  share: number;
  lastSeen?: string;
  note?: string;
}

interface DeviceRow {
  id: string;
  userEmail: string;
  deviceId: string;
  deviceType: string;
  deviceName: string;
  lastIp: string;
  firstSeen: string;
  lastSeen: string;
  isCurrent: boolean;
  hasActiveSession: boolean;
  environment?: string;
  restricted?: boolean;
  mostUsedLogin?: MostUsed | null;
  likelyOwner?: MostUsed | null;
  usage?: UsageRow[];
}

interface SessionRow {
  id: string;
  userEmail: string;
  deviceId: string;
  deviceType: string;
  deviceName: string;
  ipAddress: string;
  status: string;
  createdAt: string;
  lastSeen: string;
  environment?: string;
  mostUsedLogin?: MostUsed | null;
  likelyOwner?: MostUsed | null;
  usage?: UsageRow[];
}

function formatWhen(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const DeviceSessions: React.FC = () => {
  const [unlocked, setUnlocked] = useState(() => Boolean(getMasterUnlockToken()));
  const [masterPassword, setMasterPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [adminLogins, setAdminLogins] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const thisDeviceId = getDeviceFingerprint().deviceId;

  const lockAgain = () => {
    clearMasterUnlockToken();
    setUnlocked(false);
    setDevices([]);
    setSessions([]);
    setAdminLogins([]);
  };

  const load = async () => {
    if (!getMasterUnlockToken()) {
      setUnlocked(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const headers = masterUnlockHeaders();
      const intelRes = await apiClient.get('/admin/login-intel', { headers });
      const intel = intelRes.data || {};
      setAdminLogins(Array.isArray(intel.currentAdminLogins) ? intel.currentAdminLogins : []);
      setDevices(Array.isArray(intel.devices) ? intel.devices : []);
      setSessions(Array.isArray(intel.sessions) ? intel.sessions : []);
    } catch (err: any) {
      if (err?.response?.data?.error === 'MASTER_UNLOCK_REQUIRED' || err?.response?.status === 401) {
        lockAgain();
        setError('Enter the master password to open this admin view.');
        return;
      }
      setError(err?.response?.data?.error || err?.message || 'Could not load devices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!unlocked) return;
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [unlocked]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUnlocking(true);
      setError(null);
      await unlockMaster(masterPassword);
      setMasterPassword('');
      setUnlocked(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Invalid master password.');
    } finally {
      setUnlocking(false);
    }
  };

  const filteredDevices = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((row) =>
      [row.userEmail, row.deviceId, row.deviceType, row.deviceName, row.lastIp, row.mostUsedLogin?.userEmail, row.likelyOwner?.userEmail]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [devices, filter]);

  const withMaster = { headers: masterUnlockHeaders() };

  const logoutSession = async (sessionId: string) => {
    if (!confirm('End this live session now?')) return;
    await apiClient.post(`/admin/sessions/${sessionId}/logout`, {}, withMaster);
    await load();
  };

  const logoutDevice = async (deviceId: string) => {
    if (!confirm('End every live session on this device ID?')) return;
    await apiClient.post(`/admin/devices/${encodeURIComponent(deviceId)}/logout`, {}, withMaster);
    await load();
  };

  const logoutUser = async (email: string) => {
    if (!confirm(`Sign out all devices for ${email}?`)) return;
    await apiClient.post(`/admin/users/${encodeURIComponent(email)}/logout-all`, {}, withMaster);
    await load();
  };

  const restrictDevice = async (deviceId: string, restricted: boolean) => {
    const action = restricted ? 'restrict' : 'unrestrict';
    if (!confirm(restricted
      ? 'Block this device ID from signing in? Any live session on it will be ended.'
      : 'Allow this device ID to sign in again?')) return;
    await apiClient.post(`/admin/devices/${encodeURIComponent(deviceId)}/${action}`, {}, withMaster);
    await load();
  };

  const activeSessions = sessions.filter((row) => row.status === 'active');

  if (!unlocked) {
    return (
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Admin device intelligence</h3>
        <p className="text-sm text-slate-600">
          This view is only for admin. Enter the master password from the server <code>.env</code> file
          (<code>ADMIN_MASTER_PASSWORD</code>) to see the current admin device and which login uses it most.
        </p>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <form onSubmit={handleUnlock} className="space-y-3">
          <input
            type="password"
            placeholder="Master password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
          <button
            type="submit"
            disabled={unlocking || !masterPassword.trim()}
            className="w-full px-3 py-2 text-sm bg-slate-900 text-white rounded-md disabled:opacity-50"
          >
            {unlocking ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    );
  }

  if (loading && devices.length === 0) return <div className="p-4 text-sm text-slate-500">Loading device registry…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-slate-900">Admin device intelligence</h3>
          <p className="text-xs sm:text-sm text-slate-500">
            See the device on the current admin login, then match it to the account that uses that Device ID most often.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded-md">
            Refresh
          </button>
          <button type="button" onClick={lockAgain} className="px-3 py-1.5 text-sm bg-slate-200 text-slate-800 rounded-md">
            Lock
          </button>
        </div>
      </div>

      {error && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">{error}</div>}

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
        <h4 className="text-sm font-semibold text-amber-950">Current admin login</h4>
        {adminLogins.length === 0 ? (
          <p className="text-sm text-amber-900">No live admin session is recorded yet. Sign in again after this update.</p>
        ) : (
          adminLogins.map((row) => (
            <div key={row.id} className="rounded-lg bg-white border border-amber-100 p-3 text-sm space-y-1">
              <div><strong>Admin account:</strong> {row.userEmail}</div>
              <div><strong>Environment:</strong> {row.environment || 'unknown'}</div>
              <div><strong>Device ID:</strong> <span className="font-mono text-xs break-all">{row.deviceId}</span></div>
              <div><strong>Device:</strong> {row.deviceName || row.deviceType} · last seen {formatWhen(row.lastSeen)}</div>
              <div>
                <strong>Most used login on this device:</strong>{' '}
                {row.mostUsedLogin
                  ? `${row.mostUsedLogin.userEmail} (${row.mostUsedLogin.loginCount} logins, ${row.mostUsedLogin.share}%)`
                  : 'Not enough history yet'}
              </div>
              {row.likelyOwner && (
                <div className="text-amber-900">
                  <strong>Likely device owner:</strong> {row.likelyOwner.userEmail}
                  {row.likelyOwner.note ? <div className="text-xs mt-1">{row.likelyOwner.note}</div> : null}
                </div>
              )}
              {row.usage && row.usage.length > 1 && (
                <div className="text-xs text-slate-600 pt-1">
                  Other logins on this device:{' '}
                  {row.usage.map((u) => `${u.userEmail} (${u.loginCount})`).join(', ')}
                </div>
              )}
              <button type="button" onClick={() => logoutSession(row.id)} className="text-red-600 hover:underline text-sm mt-1">
                Logout this admin session
              </button>
            </div>
          ))
        )}
      </div>

      <input
        type="search"
        placeholder="Filter by email, device ID, type, or most-used login"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
      />

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Recorded as</th>
              <th className="px-3 py-2">Env</th>
              <th className="px-3 py-2">Device ID</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Most used login</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2">Current?</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.length === 0 && (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={9}>No devices recorded yet. Users must sign in again after this update.</td></tr>
            )}
            {filteredDevices.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.userEmail}</td>
                <td className="px-3 py-2">{row.environment || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs break-all">
                  {row.deviceId}
                  {row.deviceId === thisDeviceId ? <div className="text-blue-600">This browser</div> : null}
                </td>
                <td className="px-3 py-2">{row.deviceName || row.deviceType}</td>
                <td className="px-3 py-2">
                  {row.mostUsedLogin
                    ? `${row.mostUsedLogin.userEmail} (${row.mostUsedLogin.share}%)`
                    : '—'}
                </td>
                <td className="px-3 py-2">{formatWhen(row.lastSeen)}</td>
                <td className="px-3 py-2">
                  {row.hasActiveSession ? (
                    <span className="text-green-700 font-medium">Live now</span>
                  ) : (
                    <span className="text-slate-400">Offline</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.restricted ? (
                    <span className="text-red-700 font-medium">Restricted</span>
                  ) : (
                    <span className="text-slate-500">Allowed</span>
                  )}
                </td>
                <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                  {row.hasActiveSession && (
                    <button type="button" onClick={() => logoutDevice(row.deviceId)} className="text-red-600 hover:underline">
                      Logout device
                    </button>
                  )}
                  {row.restricted ? (
                    <button type="button" onClick={() => restrictDevice(row.deviceId, false)} className="text-green-700 hover:underline">
                      Unrestrict
                    </button>
                  ) : (
                    <button type="button" onClick={() => restrictDevice(row.deviceId, true)} className="text-amber-700 hover:underline">
                      Restrict
                    </button>
                  )}
                  <button type="button" onClick={() => logoutUser(row.userEmail)} className="text-slate-600 hover:underline">
                    Logout all
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <h4 className="px-3 py-2 text-sm font-semibold text-slate-800">Live sessions ({activeSessions.length})</h4>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Env</th>
              <th className="px-3 py-2">Device ID</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {activeSessions.length === 0 && (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={7}>No live sessions.</td></tr>
            )}
            {activeSessions.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{row.userEmail}</td>
                <td className="px-3 py-2">{row.environment || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs break-all">{row.deviceId}</td>
                <td className="px-3 py-2">{row.deviceName || row.deviceType}</td>
                <td className="px-3 py-2">{formatWhen(row.createdAt)}</td>
                <td className="px-3 py-2">{formatWhen(row.lastSeen)}</td>
                <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                  <button type="button" onClick={() => logoutSession(row.id)} className="text-red-600 hover:underline">
                    Logout session
                  </button>
                  <button type="button" onClick={() => logoutDevice(row.deviceId)} className="text-red-600 hover:underline">
                    Logout device
                  </button>
                  <button type="button" onClick={() => restrictDevice(row.deviceId, true)} className="text-amber-700 hover:underline">
                    Restrict
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DeviceSessions;
