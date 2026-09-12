import React, { useMemo, useState } from 'react';
import type { MeetingAlert } from '../hooks/useAdminMeetingAlerts';

interface AdminMeetingAlertBannerProps {
  alerts: MeetingAlert[];
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
}

function minutesAgo(value?: string) {
  if (!value) return 'Just now';
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 60000) return 'Just now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleString();
}

function formatDistance(meters?: number) {
  const m = Number(meters) || 0;
  if (m < 1000) return `${Math.round(m)}m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

const AdminMeetingAlertBanner: React.FC<AdminMeetingAlertBannerProps> = ({
  alerts,
  dismissedIds,
  onDismiss,
}) => {
  const [open, setOpen] = useState(true);
  const visible = useMemo(() => {
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    return alerts.filter((alert) => {
      if (dismissedIds.has(alert.id)) return false;
      if (alert.alertType === 'returned_place') return false;
      const created = new Date(alert.createdAt).getTime();
      return !Number.isNaN(created) && created >= cutoff;
    });
  }, [alerts, dismissedIds]);

  if (visible.length === 0) return null;

  return (
    <div className="px-1.5 sm:px-4 pt-2">
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-amber-950">Meeting desk</p>
            <p className="text-xs text-amber-800">
              {visible.length} admin alert{visible.length === 1 ? '' : 's'} · someone left a meeting place or ended a meeting
            </p>
          </div>
          <span className="text-xs font-medium text-amber-800">{open ? 'Hide' : 'Show'}</span>
        </button>
        {open && (
          <div className="px-3 pb-3 grid gap-2 sm:grid-cols-2">
            {visible.slice(0, 6).map((alert) => {
              const left = alert.alertType === 'left_place';
              const who = alert.userName || alert.userEmail;
              const place = alert.leadName || 'a client meeting';
              const mapUrl = alert.currentLat && alert.currentLng
                ? `https://www.google.com/maps?q=${alert.currentLat},${alert.currentLng}`
                : null;
              return (
                <div
                  key={alert.id}
                  className={`rounded-xl border p-3 ${left ? 'border-rose-200 bg-rose-50' : 'border-sky-200 bg-sky-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm font-semibold ${left ? 'text-rose-900' : 'text-sky-900'}`}>
                        {left ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-600" />
                            </span>
                            Left the meeting place
                          </span>
                        ) : (
                          'Meeting ended'
                        )}
                      </p>
                      <p className="text-sm text-slate-700 mt-0.5">
                        {left
                          ? `${who} has left ${place}.`
                          : `${who} finished the meeting with ${place}.`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {minutesAgo(alert.createdAt)}
                        {left && alert.distanceM ? ` · ${formatDistance(alert.distanceM)}` : ''}
                        {alert.meetingAddress ? ` · ${alert.meetingAddress}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDismiss(alert.id)}
                      className="text-xs text-slate-500 hover:text-slate-800"
                    >
                      Dismiss
                    </button>
                  </div>
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
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMeetingAlertBanner;
