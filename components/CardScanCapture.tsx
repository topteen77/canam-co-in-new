import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cropVideoToCardFrame } from '../utils/scanEnhance';

interface CardScanCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export const CardScanCapture: React.FC<CardScanCaptureProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        stream.getVideoTracks().forEach((track) => {
          const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
          if (capabilities?.torch) {
            track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] }).catch(() => undefined);
          }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Camera permission is required to scan the card.');
      }
    };
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const handleCapture = async () => {
    if (!videoRef.current || !frameRef.current || capturing) return;
    setCapturing(true);
    try {
      const file = await cropVideoToCardFrame(videoRef.current, frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      onCapture(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not capture the card. Try again.');
      setCapturing(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white flex-shrink-0">
        <p className="font-semibold">Scan visiting card</p>
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-white/10 text-sm">
          Close
        </button>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
          <div
            ref={frameRef}
            className="relative w-full max-w-md aspect-[1.586/1] rounded-xl border-2 border-white"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.58)' }}
          >
            <div className="absolute -top-px -left-px w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
            <div className="absolute -top-px -right-px w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
            <div className="absolute -bottom-px -left-px w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
            <div className="absolute -bottom-px -right-px w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 px-4 py-4 text-white bg-black space-y-3">
        <p className="text-sm text-center text-white/90">
          Fill this box with the card. Keep text upright. Turn off flash. If the card is glossy, tilt it slightly so shine is not on the text.
        </p>
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-300 text-center">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 rounded-lg bg-white/10 text-sm"
            >
              Close and upload a photo instead
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={!ready || capturing}
          onClick={handleCapture}
          className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold disabled:opacity-50 min-h-[48px]"
        >
          {capturing ? 'Capturing…' : ready ? 'Capture card' : 'Starting camera…'}
        </button>
      </div>
    </div>,
    document.body
  );
};
