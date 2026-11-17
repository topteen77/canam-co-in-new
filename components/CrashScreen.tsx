import React, { useMemo, useState } from 'react';

export type CrashDetails = {
  title?: string;
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  url?: string;
  time?: string;
};

type CrashScreenProps = {
  details: CrashDetails;
  compact?: boolean;
  onRetry?: () => void;
  onBack?: () => void;
};

export function formatCrashReport(details: CrashDetails): string {
  const lines = [
    `CRM crash report`,
    `Time: ${details.time || new Date().toISOString()}`,
    `URL: ${details.url || (typeof window !== 'undefined' ? window.location.href : '')}`,
    `Source: ${details.source || 'unknown'}`,
    `Error: ${details.name || 'Error'}: ${details.message}`,
    '',
    'Stack:',
    details.stack || '(none)',
    '',
    'Component stack:',
    details.componentStack || '(none)',
  ];
  return lines.join('\n');
}

export function CrashScreen({ details, compact = false, onRetry, onBack }: CrashScreenProps) {
  const [copied, setCopied] = useState(false);
  const report = useMemo(() => formatCrashReport(details), [details]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers / insecure contexts
      const area = document.createElement('textarea');
      area.value = report;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`${compact ? 'p-4 sm:p-6' : 'min-h-[60vh] p-4 sm:p-8'} flex items-start justify-center bg-slate-50`}
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-3xl rounded-xl border border-rose-200 bg-white shadow-lg overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-rose-100 bg-rose-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
            {details.title || 'Application error'}
          </p>
          <h2 className="mt-1 text-lg sm:text-xl font-semibold text-slate-900 break-words">
            {details.name ? `${details.name}: ` : ''}
            {details.message || 'Unknown error'}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            The page stayed usable so you can copy this report, retry, or switch screens. Share the
            details below with the developer to fix it.
          </p>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-3 text-sm text-slate-700">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <div className="text-xs font-semibold text-slate-500">URL</div>
              <div className="break-all">{details.url || '—'}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <div className="text-xs font-semibold text-slate-500">When</div>
              <div>{details.time || '—'}</div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 sm:col-span-2">
              <div className="text-xs font-semibold text-slate-500">Source</div>
              <div className="break-all">{details.source || 'React render'}</div>
            </div>
          </div>

          <details open className="rounded-lg border border-slate-200 bg-slate-950 text-slate-100">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Stack trace
            </summary>
            <pre className="px-3 pb-3 text-xs overflow-auto max-h-56 whitespace-pre-wrap break-words">
              {details.stack || '(no stack available)'}
            </pre>
          </details>

          {details.componentStack ? (
            <details className="rounded-lg border border-slate-200 bg-slate-950 text-slate-100">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                React component stack
              </summary>
              <pre className="px-3 pb-3 text-xs overflow-auto max-h-40 whitespace-pre-wrap break-words">
                {details.componentStack}
              </pre>
            </details>
          ) : null}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-slate-200 flex flex-wrap gap-2 bg-white">
          <button
            type="button"
            onClick={copyReport}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            {copied ? 'Copied' : 'Copy error report'}
          </button>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            >
              Try again
            </button>
          ) : null}
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 rounded-lg bg-white text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-50"
            >
              Back to Leads
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-white text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-50"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}

export default CrashScreen;
