export const APP_VIEWS = [
  'leads',
  'pipeline',
  'meetings',
  'followups',
  'notifications',
  'travel-claims',
  'reports',
  'calls-report',
  'bulk-email',
  'live-tracking',
  'admin-users',
  'usage-report',
  'database-admin',
  'data-export',
  'meeting-photos',
  'website-control',
] as const;

export type AppView = (typeof APP_VIEWS)[number];
export const DEFAULT_APP_VIEW: AppView = 'leads';

const VIEW_SET = new Set<string>(APP_VIEWS);

export function parseViewFromHash(hash = typeof window !== 'undefined' ? window.location.hash : ''): AppView {
  const raw = hash.replace(/^#\/?/, '').split('?')[0].split('/')[0].trim();
  return VIEW_SET.has(raw) ? (raw as AppView) : DEFAULT_APP_VIEW;
}

export function viewToHash(view: string): string {
  const safe = VIEW_SET.has(view) ? view : DEFAULT_APP_VIEW;
  return `#/${safe}`;
}

export function syncViewHash(view: string): void {
  if (typeof window === 'undefined') return;
  const next = viewToHash(view);
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`);
  }
}
