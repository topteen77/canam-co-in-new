import { canMutateLead } from './leadPermissions';
import { DEFAULT_CONTACT_COUNTRY } from './countriesAndCities';

export type LeadSearchFilters = {
  status: string[];
  category: string[];
  leadSource: string[];
  accountManager: string[];
  salesPerson: string[];
  createdBy: string[];
  city: string[];
  country: string[];
  countryInterest: string[];
  dateCreatedFrom: string;
  dateCreatedTo: string;
  searchTerm: string;
  tags: string[];
  icpScore: { min: string; max: string };
  followUpCount: { min: string; max: string };
};

export const DEFAULT_LEAD_SEARCH_FILTERS: LeadSearchFilters = {
  status: [],
  category: [],
  leadSource: [],
  accountManager: [],
  salesPerson: [],
  createdBy: [],
  city: [],
  country: [DEFAULT_CONTACT_COUNTRY],
  countryInterest: [],
  dateCreatedFrom: '',
  dateCreatedTo: '',
  searchTerm: '',
  tags: [],
  icpScore: { min: '', max: '' },
  followUpCount: { min: '', max: '' },
};

/** True when the user is searching via the filter panel / search box (not default own-leads view). */
export function hasCrossUserSearch(filters: LeadSearchFilters): boolean {
  const countryIsCustom =
    filters.country.length > 0 &&
    !(filters.country.length === 1 && filters.country[0] === DEFAULT_CONTACT_COUNTRY);

  return (
    filters.city.length > 0 ||
    filters.searchTerm.trim() !== '' ||
    filters.accountManager.length > 0 ||
    filters.salesPerson.length > 0 ||
    filters.createdBy.length > 0 ||
    filters.status.length > 0 ||
    filters.leadSource.length > 0 ||
    filters.countryInterest.length > 0 ||
    filters.tags.length > 0 ||
    !!filters.dateCreatedFrom ||
    !!filters.dateCreatedTo ||
    !!filters.icpScore.min ||
    !!filters.icpScore.max ||
    !!filters.followUpCount.min ||
    !!filters.followUpCount.max ||
    countryIsCustom
  );
}

export function getAssignedLeads<T extends {
  accountManager?: string;
  salesPerson?: string;
  createdBy?: string;
}>(
  leads: T[],
  opts: { isAdmin?: boolean; currentUser?: string | null }
): T[] {
  if (opts.isAdmin) return leads;
  const email = (opts.currentUser || '').toLowerCase();
  if (!email) return [];
  return leads.filter(l =>
    (l.accountManager && String(l.accountManager).toLowerCase() === email) ||
    (l.salesPerson && String(l.salesPerson).toLowerCase() === email) ||
    (l.createdBy && String(l.createdBy).toLowerCase() === email)
  );
}

export function resolveLeadSource<T>(opts: {
  isAdmin?: boolean;
  assignedLeads: T[];
  allLeads?: T[];
  filters: LeadSearchFilters;
}): { sourceLeads: T[]; isSearchingAllLeads: boolean } {
  const catalogLeads = opts.allLeads && opts.allLeads.length > 0 ? opts.allLeads : opts.assignedLeads;
  const isUserFilteredView = !opts.isAdmin;
  const isSearchingAllLeads = isUserFilteredView && hasCrossUserSearch(opts.filters);
  return {
    sourceLeads: isSearchingAllLeads ? catalogLeads : opts.assignedLeads,
    isSearchingAllLeads,
  };
}

/** Own leads first, then everyone else's — used so view-only results are visually grouped. */
export function partitionLeadsByOwnership<T extends { accountManager?: string }>(
  leads: T[],
  opts: { currentUser?: string | null; isAdmin?: boolean }
): { ownLeads: T[]; otherLeads: T[]; grouped: T[] } {
  if (opts.isAdmin || !opts.currentUser) {
    return { ownLeads: leads, otherLeads: [], grouped: leads };
  }
  const ownLeads: T[] = [];
  const otherLeads: T[] = [];
  leads.forEach((lead) => {
    if (canMutateLead(lead, opts)) ownLeads.push(lead);
    else otherLeads.push(lead);
  });
  return { ownLeads, otherLeads, grouped: [...ownLeads, ...otherLeads] };
}
