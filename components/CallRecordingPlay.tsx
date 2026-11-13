import React, { useState } from 'react';
import apiClient from '../services/apiClient';

export function CallRecordingPlay({ id }: { id: string }) {
  const [playing, setPlaying] = useState(false);
  const src = `${String(apiClient.defaults.baseURL || '').replace(/\/$/, '')}/call-recordings/${encodeURIComponent(id)}`;
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
