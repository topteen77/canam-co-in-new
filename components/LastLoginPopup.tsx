import React from 'react';
import type { ActiveSessionInfo } from '../services/authService';
import UserAvatar from './UserAvatar';

interface LastLoginPopupProps {
  info: ActiveSessionInfo;
  onClose: () => void;
}

function formatWhen(value?: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function lastLoginRows(info: ActiveSessionInfo) {
  const mapUrl = info.latitude && info.longitude
    ? `https://www.google.com/maps?q=${info.latitude},${info.longitude}`
    : info.location && /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(info.location)
      ? `https://www.google.com/maps?q=${info.location}`
      : null;
  return [
    { label: 'Device ID', value: info.deviceId || 'Unknown' },
    { label: 'Device type', value: info.deviceName || info.deviceType || 'Unknown' },
    { label: 'Last seen', value: formatWhen(info.lastSeen) },
    { label: 'IP', value: info.ipAddress || 'Unknown' },
    { label: 'Location', value: info.location || 'Unknown', href: mapUrl },
  ];
}

const LastLoginPopup: React.FC<LastLoginPopupProps> = ({ info, onClose }) => {
  const rows = lastLoginRows(info);
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <UserAvatar name={info.userEmail} size="lg" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Last login info</h3>
            <p className="text-sm text-slate-500 mt-0.5">Previous session ended with the master password.</p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
              <span className="font-medium text-slate-500">{row.label}</span>
              {row.href ? (
                <a href={row.href} target="_blank" rel="noreferrer" className="text-right text-indigo-700 hover:underline break-all">
                  {row.value}
                </a>
              ) : (
                <span className="text-right text-slate-900 break-all">{row.value}</span>
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
          >
            Okay
          </button>
        </div>
      </div>
    </div>
  );
};

export default LastLoginPopup;
