import type { FollowUp, Lead } from '../types';

export function sameLeadId(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

export function mergeLeadFields(lead: Lead, data: Partial<Lead>): Lead {
  return { ...lead, ...data };
}

export function appendLeadFollowUp(lead: Lead, followUp: FollowUp): Lead {
  const current = Array.isArray(lead.followUps) ? lead.followUps : [];
  return { ...lead, followUps: [...current, followUp] };
}
