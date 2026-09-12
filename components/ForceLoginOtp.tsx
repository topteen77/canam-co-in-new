import React, { useState } from 'react';
import { forceLogin, type ActiveSessionInfo } from '../services/authService';

interface ForceLoginOtpProps {
  email: string;
  password: string;
  rememberMe?: boolean;
  activeSession: ActiveSessionInfo | null;
  canForceLogin?: boolean;
  onSuccess: (email: string) => void;
}

function formatWhen(value?: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export const ForceLoginOtp: React.FC<ForceLoginOtpProps> = ({
  email,
  password,
  rememberMe = true,
  activeSession,
  canForceLogin = true,
  onSuccess,
}) => {
  const [open, setOpen] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setLoading(true);
      setError(null);
      const { user } = await forceLogin(email, password, masterPassword, rememberMe);
      onSuccess(user.email);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Force login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full border border-slate-300 text-slate-800 bg-white hover:bg-slate-50 font-medium py-2 px-4 rounded-lg"
      >
        {open ? 'Hide details' : 'View details'}
      </button>
      {open && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1">
          <div><strong>Environment:</strong> {activeSession?.environment || 'unknown'}</div>
          <div><strong>Device ID:</strong> {activeSession?.deviceId || 'Unknown'}</div>
          <div><strong>Device type:</strong> {activeSession?.deviceName || activeSession?.deviceType || 'Unknown'}</div>
          <div><strong>Last seen:</strong> {formatWhen(activeSession?.lastSeen)}</div>
          {activeSession?.ipAddress ? <div><strong>IP:</strong> {activeSession.ipAddress}</div> : null}
        </div>
      )}
      {canForceLogin && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Enter the master password to end that session and sign in here.
          </p>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <input
            type="password"
            placeholder="Master password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={loading || !masterPassword.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Force login with master password'}
          </button>
        </div>
      )}
    </div>
  );
};
