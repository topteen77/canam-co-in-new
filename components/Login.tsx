import React, { useEffect, useState } from 'react';
import {
  login as apiLogin,
  register,
  readSessionActiveError,
  isLocalDevQuickLoginUi,
  fetchDevQuickUsers,
  devQuickLogin,
  type ActiveSessionInfo,
  type DevQuickUser,
} from '../services/authService';
import { ForceLoginOtp } from './ForceLoginOtp';
import BrandLogo from './BrandLogo';

interface LoginProps {
  onLogin: (username: string) => boolean;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [blockedSession, setBlockedSession] = useState<ActiveSessionInfo | null>(null);
  const [needsForceLogin, setNeedsForceLogin] = useState(false);
  const [canForceLogin, setCanForceLogin] = useState(false);
  const showDevQuick = isLocalDevQuickLoginUi();
  const [devUsers, setDevUsers] = useState<DevQuickUser[]>([]);
  const [devUsersError, setDevUsersError] = useState<string | null>(null);
  const [devFilter, setDevFilter] = useState('');
  const [quickBusyEmail, setQuickBusyEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!showDevQuick) return;
    let cancelled = false;
    (async () => {
      try {
        const users = await fetchDevQuickUsers();
        if (!cancelled) {
          setDevUsers(users);
          setDevUsersError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setDevUsers([]);
          setDevUsersError(err?.response?.data?.error || err?.message || 'Could not load users');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [showDevQuick]);

  const handleEmailLogin = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) return;
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setBlockedSession(null);
      setNeedsForceLogin(false);
      setCanForceLogin(false);
      const { user } = await apiLogin(trimmedEmail, trimmedPassword, rememberMe);
      setSuccess('Login successful! Redirecting...');
      onLogin(user.email);
    } catch (err: any) {
      const blocked = readSessionActiveError(err);
      if (blocked) {
        setBlockedSession(blocked.activeSession);
        setNeedsForceLogin(true);
        setCanForceLogin(blocked.canForceLogin);
        setError(null);
      } else {
        const data = err?.response?.data;
        if (data?.error === 'DEVICE_RESTRICTED') {
          setError(data.message || 'This device is restricted and cannot sign in.');
        } else {
          const msg = data?.message || (data?.error && data.error !== 'SESSION_ACTIVE' ? data.error : null) || err?.message || 'Login failed. Check email and password.';
          setError(msg);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) return;
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      await register(trimmedEmail, trimmedPassword, (name || trimmedEmail.split('@')[0]).trim());
      setSuccess('Registration successful. Awaiting approval. You can try signing in after approval.');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Registration failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDevQuickLogin = async (userEmail: string) => {
    try {
      setQuickBusyEmail(userEmail);
      setLoading(true);
      setError(null);
      setSuccess(null);
      setBlockedSession(null);
      setNeedsForceLogin(false);
      const { user } = await devQuickLogin(userEmail, rememberMe);
      setSuccess(`Signed in as ${user.name || user.email}`);
      onLogin(user.email);
    } catch (err: any) {
      const data = err?.response?.data;
      setError(data?.message || data?.error || err?.message || 'Quick login failed');
    } finally {
      setQuickBusyEmail(null);
      setLoading(false);
    }
  };

  const filterQ = devFilter.trim().toLowerCase();
  const filteredDevUsers = filterQ
    ? devUsers.filter((u) =>
        u.name.toLowerCase().includes(filterQ)
        || u.email.toLowerCase().includes(filterQ)
        || u.role.toLowerCase().includes(filterQ))
    : devUsers;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className={`bg-white rounded-lg shadow-xl p-8 w-full ${showDevQuick ? 'max-w-lg' : 'max-w-md'}`}>
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 w-fit">
            <BrandLogo heightClass="h-14" variant="light" animate className="mx-auto" />
          </div>
          <p className="text-gray-600">Sign in to continue</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-red-600 text-sm whitespace-pre-line">{error}</div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-green-600 text-sm">{success}</div>
          </div>
        )}

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => setEmail(e.target.value.trim())}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={(e) => setPassword(e.target.value.trim())}
              className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700 focus:outline-none focus:text-blue-600"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {showRegister && (
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          )}
          {!showRegister && (
            <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Remember me
            </label>
          )}
          {showRegister ? (
            <button
              onClick={handleRegister}
              disabled={loading || !email || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Registering...' : 'Register'}
            </button>
          ) : (
            <button
              onClick={handleEmailLogin}
              disabled={loading || !email || !password}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          )}
          {!showRegister && needsForceLogin && (
            <ForceLoginOtp
              email={email.trim()}
              password={password}
              rememberMe={rememberMe}
              activeSession={blockedSession}
              canForceLogin={canForceLogin}
              onSuccess={(signedInEmail) => {
                setSuccess('Force login successful. Previous session ended.');
                onLogin(signedInEmail);
              }}
            />
          )}
        </div>

        <button
          onClick={() => { setShowRegister(!showRegister); setError(null); setSuccess(null); }}
          className="w-full text-blue-600 hover:text-blue-700 text-sm font-medium mt-4"
        >
          {showRegister ? 'Already have an account? Sign in' : 'Need an account? Register'}
        </button>

        {showDevQuick && (
          <div className="mt-6 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-amber-950">Quick login (all users)</h3>
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                localhost only
              </span>
            </div>
            <p className="mb-3 text-xs text-amber-800">
              Click Login next to a name — no password needed. Not shown on production.
            </p>
            <input
              type="search"
              placeholder="Search name or email…"
              value={devFilter}
              onChange={(e) => setDevFilter(e.target.value)}
              className="mb-3 w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {devUsersError && (
              <p className="mb-2 text-xs text-red-600">{devUsersError}</p>
            )}
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filteredDevUsers.length === 0 && !devUsersError && (
                <p className="text-xs text-amber-700">Loading users…</p>
              )}
              {filteredDevUsers.map((u) => (
                <div
                  key={u.email}
                  className="flex items-center gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-gray-900">{u.name}</div>
                    <div className="truncate text-xs text-gray-500">{u.email}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">{u.role}</div>
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDevQuickLogin(u.email)}
                    className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {quickBusyEmail === u.email ? '…' : 'Login'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Email & password login</span>
          </div>
          <div className="flex items-center gap-2 text-green-600">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Role-based access</span>
          </div>
        </div>

        <div className="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 text-center">
          Contact your admin if you need an account or forgot password.
        </div>
      </div>
    </div>
  );
};
