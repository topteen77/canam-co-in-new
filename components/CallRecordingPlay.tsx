import React, { useState } from 'react';
import apiClient from '../services/apiClient';

export function CallRecordingPlay({ id, available = false }: { id: string; available?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const src = `${String(apiClient.defaults.baseURL || '').replace(/\/$/, '')}/call-recordings/${encodeURIComponent(id)}`;
  if (!available) {
    return (
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400"
      >
        Play recording
      </button>
    );
  }
  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
      >
        Play recording
      </button>
    );
  }
  return <audio className="h-8 w-full max-w-xs" controls autoPlay preload="none" src={src} />;
}
