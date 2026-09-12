import React, { useEffect, useState } from 'react';
import type { ActiveSessionInfo } from '../services/authService';
import { formatGps, mapsUrl, parseCoords, withIpLocation } from '../services/ipLocation';
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
  return [
    { label: 'Device ID', value: info.deviceId || 'Unknown' },
    { label: 'Device type', value: info.deviceName || info.deviceType || 'Unknown' },
    { label: 'Last seen', value: formatWhen(info.lastSeen) },
    { label: 'IP', value: info.ipAddress || 'Unknown' },
  ];
}

export function LastLoginLocation({ info }: { info: ActiveSessionInfo }) {
  const coords = parseCoords(info);
  const gps = coords ? formatGps(coords.latitude, coords.longitude) : '';
  const mapUrl = coords ? mapsUrl(coords.latitude, coords.longitude) : null;
  const isGps = info.locationSource === 'gps';
  const address = info.location && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(info.location)
    ? info.location
    : (gps || (info.ipAddress ? 'Looking up…' : 'Unknown'));
  return (
    <div className="text-sm">
      <p className="text-xs font-semibold text-slate-500">{isGps ? 'GPS' : 'IP location'}</p>
      <p className="text-slate-800 break-words mt-0.5">{address}</p>
      {gps && <p className="text-xs text-slate-500 mt-1">{gps}</p>}
      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-2 text-xs font-medium text-indigo-700 hover:underline"
        >
          Open current location
        </a>
      )}
    </div>
  );
}

const LastLoginPopup: React.FC<LastLoginPopupProps> = ({ info, onClose }) => {
  const [resolved, setResolved] = useState(info);
  useEffect(() => {
    let active = true;
    setResolved(info);
    withIpLocation(info).then((next) => {
      if (active) setResolved(next);
    });
    return () => {
      active = false;
    };
  }, [info]);
  const rows = lastLoginRows(resolved);
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
              <span className="text-right text-slate-900 break-all">{row.value}</span>
            </div>
          ))}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Location</p>
            <LastLoginLocation info={resolved} />
          </div>
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
