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

export const ForceLoginOtp: React.FC<ForceLoginOtpProps> = ({
  email,
  password,
  rememberMe = true,
  activeSession = null,
  canForceLogin = true,
  onSuccess,
}) => {
  const [masterPassword, setMasterPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      setLoading(true);
      setError(null);
      const { user } = await forceLogin(email, password, masterPassword, rememberMe, activeSession);
      onSuccess(user.email);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Force login failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!canForceLogin) {
    return (
      <p className="mt-4 text-sm text-slate-600">
        This account is already signed in on another device. Ask an admin to help you sign in here.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-slate-600">
        This account is already signed in on another device. Enter the master password to end that session and sign in here.
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
  );
};
