import type { Lead } from '../types';

export function emailsMatch(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
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
