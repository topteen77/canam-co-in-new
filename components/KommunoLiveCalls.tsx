import React, { useEffect, useState } from 'react';
import apiClient from '../services/apiClient';
import { callStatusLabel } from '../utils/callStatusLabel';
import { CallRecordingPlay } from './CallRecordingPlay';
import { PhoneIcon } from './icons/ActionIcons';

interface LiveCall {
  id: string;
  sessionId: string;
  direction?: string;
  status?: string;
  customerNumber?: string;
  pilotNumber?: string;
  leadId?: string;
  leadName?: string;
  contactName?: string;
  recordingUrl?: string;
  recordingSaved?: boolean;
  duration?: number;
  reason?: string;
  disconnectedBy?: string;
}

interface KommunoLiveCallsProps {
  userEmail: string;
  onOpenLead?: (leadId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  initiated: 'Dialing',
  ringing: 'Ringing',
  connected: 'Connected',
  completed: 'Call ended',
  missed: 'Call ended',
};

export default function KommunoLiveCalls({ userEmail, onOpenLead }: KommunoLiveCallsProps) {
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [hidden, setHidden] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userEmail) return undefined;
    let stopped = false;
    const load = async () => {
      try {
        const { data } = await apiClient.get('/kommuno/live', { params: { email: userEmail } });
        if (!stopped) setCalls(Array.isArray(data?.calls) ? data.calls : []);
      } catch {
        if (!stopped) setCalls([]);
      }
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [userEmail]);

  const visible = calls.filter((call) => hidden[call.sessionId] !== `${call.status}`);
  if (!visible.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {visible.map((call) => {
        const incoming = call.direction === 'INCOMING';
        const ended = call.status === 'completed' || call.status === 'missed';
        const dialing = !incoming && (call.status === 'initiated' || call.status === 'ringing');
        const headline = ended && call.reason ? callStatusLabel(call.reason) : (STATUS_LABEL[call.status || ''] || call.status);
        return (
          <div key={call.sessionId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                {dialing && (
                  <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true">
                    <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" />
                    <PhoneIcon className="phone-ring-icon relative h-5 w-5" />
                  </span>
                )}
                <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  {incoming ? 'Incoming' : 'Outgoing'} · {headline}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {call.contactName || call.leadName || call.customerNumber || 'Unknown number'}
                </div>
                <div className="text-xs text-slate-500">{call.customerNumber}</div>
                {call.leadName && call.contactName && (
                  <div className="text-xs text-slate-500">{call.leadName}</div>
                )}
                {call.pilotNumber && (
                  <div className="text-xs text-slate-400">Via {call.pilotNumber}</div>
                )}
                {ended && call.reason === 'answered' && call.disconnectedBy && (
                  <div className="text-xs text-slate-500">Ended by {call.disconnectedBy}</div>
                )}
                </div>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700"
                aria-label="Dismiss call"
                onClick={() => setHidden((prev) => ({ ...prev, [call.sessionId]: call.status || '' }))}
              >
                ✕
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              {call.leadId && onOpenLead && (
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                  onClick={() => onOpenLead(call.leadId!)}
                >
                  Open lead
                </button>
              )}
              {ended && (call.recordingUrl || call.recordingSaved) && (
                <CallRecordingPlay id={call.id} available={Boolean(call.recordingSaved)} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
