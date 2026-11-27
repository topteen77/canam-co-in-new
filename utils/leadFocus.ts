/** Deep-link tokens for Partner Leads → Lead Details popup. */

export const LEAD_FOCUS = {
  FOLLOWUPS: 'FOLLOWUPS_TAB',
  HISTORY: 'HISTORY_TAB',
  AGENCY: 'FIELD:agencyName',
  STATUS: 'FIELD:status',
  CONTACT: 'FIELD:contact',
  PHONE: 'FIELD:phone',
  CITY: 'FIELD:city',
  REMARKS: 'FIELD:remarks',
  ONBOARD: 'FIELD:onboardingDate',
  CREATED_BY: 'FIELD:createdBy',
  CREATED_AT: 'FIELD:createdAt',
  SALES: 'FIELD:salesPerson',
  ACCOUNT_MANAGER: 'FIELD:accountManager',
  ICP: 'FIELD:icpScore',
} as const;

export type LeadFocusField =
  | 'agencyName'
  | 'status'
  | 'contact'
  | 'phone'
  | 'city'
  | 'remarks'
  | 'onboardingDate'
  | 'createdBy'
  | 'createdAt'
  | 'salesPerson'
  | 'accountManager'
  | 'icpScore';

const FIELD_PREFIX = 'FIELD:';

export function fieldFocusToken(field: LeadFocusField): string {
  return `${FIELD_PREFIX}${field}`;
}

export function parseLeadFocus(token?: string | null): {
  tab: 'details' | 'followups' | 'history' | 'recordings';
  followUpId?: string;
  field?: LeadFocusField;
} {
  const value = String(token || '').trim();
  if (!value) return { tab: 'details' };
  if (value === LEAD_FOCUS.FOLLOWUPS) return { tab: 'followups' };
  if (value === LEAD_FOCUS.HISTORY) return { tab: 'history' };
  if (value.startsWith(FIELD_PREFIX)) {
    const field = value.slice(FIELD_PREFIX.length) as LeadFocusField;
    return { tab: 'details', field };
  }
  // Concrete follow-up id
  return { tab: 'followups', followUpId: value };
}

export function leadFocusLabel(field?: LeadFocusField | null): string {
  switch (field) {
    case 'agencyName': return 'Agency';
    case 'status': return 'Status';
    case 'contact': return 'Contact';
    case 'phone': return 'Phone';
    case 'city': return 'City';
    case 'remarks': return 'Remarks';
    case 'onboardingDate': return 'Onboarding date';
    case 'createdBy': return 'Created by';
    case 'createdAt': return 'Created date';
    case 'salesPerson': return 'Sales person';
    case 'accountManager': return 'Account manager';
    case 'icpScore': return 'ICP score';
    default: return '';
  }
}
