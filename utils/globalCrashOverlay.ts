/**
 * Show a visible crash panel for errors that never reach React
 * (window.onerror / unhandledrejection), so admins never see a blank page.
 */

type CrashPayload = {
  name: string;
  message: string;
  stack?: string;
  source: string;
};

const OVERLAY_ID = 'crm-global-crash-overlay';

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReport(payload: CrashPayload): string {
  return [
    'CRM crash report',
    `Time: ${new Date().toISOString()}`,
    `URL: ${typeof location !== 'undefined' ? location.href : ''}`,
    `Source: ${payload.source}`,
    `Error: ${payload.name}: ${payload.message}`,
    '',
    'Stack:',
    payload.stack || '(none)',
  ].join('\n');
}

function hideAppSplash(): void {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('is-done');
  try { splash.remove(); } catch { /* ignore */ }
}

export function showGlobalCrashOverlay(payload: CrashPayload): void {
  if (typeof document === 'undefined') return;
  hideAppSplash();

  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const report = buildReport(payload);
  try {
    sessionStorage.setItem('crm_last_crash', JSON.stringify({
      ...payload,
      url: location.href,
      time: new Date().toISOString(),
      report,
    }));
  } catch {
    // ignore
  }

  const root = document.createElement('div');
  root.id = OVERLAY_ID;
  root.setAttribute('role', 'alert');
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'background:rgba(15,23,42,0.55)',
    'display:flex',
    'align-items:flex-start',
    'justify-content:center',
    'padding:24px',
    'overflow:auto',
    'font-family:Inter,system-ui,sans-serif',
  ].join(';');

  root.innerHTML = `
    <div style="width:min(720px,100%);margin-top:6vh;background:#fff;border-radius:14px;border:1px solid #fecdd3;box-shadow:0 20px 50px rgba(0,0,0,.25);overflow:hidden">
      <div style="padding:16px 20px;background:#fff1f2;border-bottom:1px solid #fecdd3">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#be123c">Application error</div>
        <div style="margin-top:6px;font-size:18px;font-weight:700;color:#0f172a;word-break:break-word">${escapeHtml(payload.name)}: ${escapeHtml(payload.message)}</div>
        <div style="margin-top:8px;font-size:13px;color:#475569">This overlay keeps the UI visible so you can copy the error and reload. Source: ${escapeHtml(payload.source)}</div>
      </div>
      <div style="padding:16px 20px">
        <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px">URL</div>
        <div style="font-size:13px;color:#0f172a;word-break:break-all;margin-bottom:12px">${escapeHtml(location.href)}</div>
        <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px">Stack</div>
        <pre style="margin:0;padding:12px;background:#020617;color:#e2e8f0;border-radius:10px;font-size:12px;max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word">${escapeHtml(payload.stack || '(no stack available)')}</pre>
      </div>
      <div style="padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:8px">
        <button type="button" data-crash-copy style="padding:8px 14px;border-radius:8px;background:#0f172a;color:#fff;border:0;font-weight:600;cursor:pointer">Copy error report</button>
        <button type="button" data-crash-reload style="padding:8px 14px;border-radius:8px;background:#4f46e5;color:#fff;border:0;font-weight:600;cursor:pointer">Reload page</button>
        <button type="button" data-crash-dismiss style="padding:8px 14px;border-radius:8px;background:#fff;color:#0f172a;border:1px solid #cbd5e1;font-weight:600;cursor:pointer">Dismiss</button>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  root.querySelector('[data-crash-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const area = document.createElement('textarea');
      area.value = report;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    const btn = root.querySelector('[data-crash-copy]');
    if (btn) btn.textContent = 'Copied';
  });
  root.querySelector('[data-crash-reload]')?.addEventListener('click', () => location.reload());
  root.querySelector('[data-crash-dismiss]')?.addEventListener('click', () => root.remove());

  // Auto-email webadmin (same path as React crash screen).
  void import('../services/crashReporter')
    .then(({ reportCrashToWebadmin }) => reportCrashToWebadmin({
      name: payload.name,
      message: payload.message,
      stack: payload.stack || '',
      source: payload.source,
      url: location.href,
      time: new Date().toISOString(),
    }))
    .then((result) => {
      const status = document.createElement('div');
      status.style.cssText = 'padding:0 20px 12px;font-size:13px;color:#9f1239;font-weight:600';
      if (result?.sent) status.textContent = `Error report emailed to ${result.email || 'webadmin'}.`;
      else if (result?.reason === 'not_configured') status.textContent = 'No webadmin email configured yet.';
      else if (result?.reason === 'duplicate') status.textContent = 'Same error was already reported recently.';
      else status.textContent = result?.error || `Report not sent (${result?.reason || 'unknown'}).`;
      root.firstElementChild?.insertBefore(status, root.firstElementChild.lastElementChild);
    })
    .catch(() => undefined);
}

export function installGlobalCrashHandlers(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __crmCrashHandlersInstalled?: boolean };
  if (w.__crmCrashHandlersInstalled) return;
  w.__crmCrashHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    // Ignore ResizeObserver noise and script load failures that browsers already surface.
    const message = event.error?.message || event.message || 'Unknown error';
    if (/ResizeObserver loop/i.test(message)) return;
    showGlobalCrashOverlay({
      name: event.error?.name || 'Error',
      message,
      stack: event.error?.stack || `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`,
      source: 'window.onerror',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason?.message || String(reason || 'Unhandled promise rejection');
    showGlobalCrashOverlay({
      name: reason?.name || 'UnhandledRejection',
      message,
      stack: reason?.stack || '',
      source: 'unhandledrejection',
    });
  });
}
