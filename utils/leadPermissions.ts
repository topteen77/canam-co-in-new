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
