import type { Lead } from '../types';

export function emailsMatch(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

type UserLike = { email?: string; name?: string; role?: string };

/** Resolve lead.accountManager (email or display name) to a user email for dropdowns. */
export function resolveAccountManagerEmail(
  accountManager?: string | null,
  users: UserLike[] = []
): string {
  const raw = String(accountManager || '').trim();
  if (!raw) return '';
  const norm = raw.toLowerCase().replace(/\s+/g, ' ');
  const list = Array.isArray(users) ? users : [];

  const byEmail = list.find((u) => String(u?.email || '').trim().toLowerCase() === norm);
  if (byEmail?.email) return String(byEmail.email).trim();

  const byExactName = list.find((u) => String(u?.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === norm);
  if (byExactName?.email) return String(byExactName.email).trim();

  // Partial / first-last match (e.g. "Nakul" → "Nakul Kathota")
  const byPartialName = list.find((u) => {
    const name = String(u?.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!name) return false;
    return name === norm || name.startsWith(`${norm} `) || name.includes(` ${norm}`) || norm.includes(name);
  });
  if (byPartialName?.email) return String(byPartialName.email).trim();

  return raw.includes('@') ? raw : raw;
}

export function isLeadAccountManager(
  lead: Pick<Lead, 'accountManager'> | null | undefined,
  userEmail?: string | null
): boolean {
  if (!lead || !userEmail) return false;
  return emailsMatch(lead.accountManager, userEmail);
}

/** Admin can always edit/assign. Everyone else only if they are the current account manager. */
export function canMutateLead(
  lead: Pick<Lead, 'accountManager'> | null | undefined,
  opts: { currentUser?: string | null; isAdmin?: boolean }
): boolean {
  if (opts.isAdmin) return true;
  return isLeadAccountManager(lead, opts.currentUser);
}

export function isLeadCreator(
  lead: Pick<Lead, 'createdBy'> | null | undefined,
  userEmail?: string | null
): boolean {
  if (!lead || !userEmail) return false;
  return emailsMatch(lead.createdBy, userEmail);
}

/** True when a meeting/follow-up has no usable created timestamp. */
export function isBlankCreatedAt(value?: string | null): boolean {
  const raw = String(value || '').trim();
  if (!raw || raw === '—' || raw === '-') return true;
  const time = new Date(raw).getTime();
  return Number.isNaN(time);
}

/**
 * Lead creator or admin may fill blank Meeting created / Scheduled by.
 * Only allowed while createdAt is still empty.
 */
export function canFixBlankMeetingMeta(
  lead: Pick<Lead, 'createdBy'> | null | undefined,
  opts: { currentUser?: string | null; isAdmin?: boolean; createdAt?: string | null }
): boolean {
  if (!isBlankCreatedAt(opts.createdAt)) return false;
  if (opts.isAdmin) return true;
  return isLeadCreator(lead, opts.currentUser);
}
