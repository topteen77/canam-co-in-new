import { canMutateLead } from '../utils/leadPermissions';
import { contactMatchesSelectedCountries } from '../utils/countriesAndCities';
import {
  DEFAULT_LEAD_SEARCH_FILTERS,
  getAssignedLeads,
  hasCrossUserSearch,
  partitionLeadsByOwnership,
  resolveLeadSource,
  type LeadSearchFilters,
} from '../utils/leadVisibility';

type TestLead = {
  id: string;
  accountManager?: string;
  salesPerson?: string;
  createdBy?: string;
  status?: string;
  contacts?: Array<{ city?: string; country?: string }>;
};

const AM = 'am.moga@canam.test';
const OTHER_AM = 'other.am@canam.test';

const leads: TestLead[] = [
  { id: 'own-moga', accountManager: AM, contacts: [{ city: 'Moga', country: 'India' }] },
  { id: 'own-jalandhar', accountManager: AM, contacts: [{ city: 'Jalandhar', country: 'India' }] },
  { id: 'other-moga', accountManager: OTHER_AM, contacts: [{ city: 'moga', country: 'India' }] },
  { id: 'other-amritsar', accountManager: OTHER_AM, contacts: [{ city: 'Amritsar', country: 'India' }] },
  { id: 'other-moga-blank-country', accountManager: OTHER_AM, contacts: [{ city: 'Moga', country: '' }] },
  { id: 'other-toronto', accountManager: OTHER_AM, contacts: [{ city: 'Toronto', country: 'Canada' }] },
  { id: 'sales-own', salesPerson: AM, contacts: [{ city: 'Ludhiana', country: 'India' }] },
];

let passed = 0;
let failed = 0;

function assert(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error('      expected:', expected);
    console.error('      actual:  ', actual);
  }
}

function assertTrue(name: string, value: unknown) {
  assert(name, Boolean(value), true);
}

function withFilters(overrides: Partial<LeadSearchFilters> = {}): LeadSearchFilters {
  return {
    ...DEFAULT_LEAD_SEARCH_FILTERS,
    icpScore: { ...DEFAULT_LEAD_SEARCH_FILTERS.icpScore },
    followUpCount: { ...DEFAULT_LEAD_SEARCH_FILTERS.followUpCount },
    ...overrides,
  };
}

/** Mirrors Partner Leads city + country matching in ItineraryForm. */
function matchesCityAndCountry(lead: TestLead, filters: LeadSearchFilters): boolean {
  const safeContacts = Array.isArray(lead.contacts) ? lead.contacts : [];
  if (filters.city.length > 0 && !safeContacts.some(contact =>
    contact.city && filters.city.some(city => (contact.city || '').toLowerCase().includes((city || '').toLowerCase()))
  )) return false;
  if (filters.country.length > 0) {
    const contactCountries = safeContacts.length ? safeContacts.map(c => c.country) : [''];
    if (!contactCountries.some(country => contactMatchesSelectedCountries(country, filters.country))) {
      return false;
    }
  }
  return true;
}

function visibleLeads(opts: {
  isAdmin?: boolean;
  currentUser: string;
  filters?: LeadSearchFilters;
}) {
  const assignedLeads = getAssignedLeads(leads, { isAdmin: opts.isAdmin, currentUser: opts.currentUser });
  const filters = opts.filters ?? withFilters();
  const { sourceLeads, isSearchingAllLeads } = resolveLeadSource({
    isAdmin: opts.isAdmin,
    assignedLeads,
    allLeads: leads,
    filters,
  });
  return {
    assignedIds: assignedLeads.map(l => l.id).sort(),
    visibleIds: sourceLeads.filter(l => matchesCityAndCountry(l, filters)).map(l => l.id).sort(),
    isSearchingAllLeads,
    sourceCount: sourceLeads.length,
  };
}

function canEdit(leadId: string, currentUser: string, isAdmin = false) {
  const lead = leads.find(l => l.id === leadId);
  return canMutateLead(lead, { currentUser, isAdmin });
}

// --- Default view ---
assert('default AM view does not treat India-only as a search', hasCrossUserSearch(withFilters()), false);
assert('city filter is a cross-user search', hasCrossUserSearch(withFilters({ city: ['Moga'] })), true);
assert('text search is a cross-user search', hasCrossUserSearch(withFilters({ searchTerm: 'agency' })), true);
assert('Gold category alone is NOT a cross-user search', hasCrossUserSearch(withFilters({ category: ['Gold'] })), false);
assert('custom country is a cross-user search', hasCrossUserSearch(withFilters({ country: ['Canada'] })), true);

const defaultView = visibleLeads({ currentUser: AM });
assert('default AM sees only own/sales/created leads', defaultView.visibleIds, ['own-jalandhar', 'own-moga', 'sales-own']);
assert('default AM is not in all-leads search mode', defaultView.isSearchingAllLeads, false);
assertTrue('default AM does not see other AM Moga lead', !defaultView.visibleIds.includes('other-moga'));

// --- City = Moga ---
const mogaView = visibleLeads({ currentUser: AM, filters: withFilters({ city: ['Moga'] }) });
assert('Moga search expands to all matching leads', mogaView.visibleIds, ['other-moga', 'other-moga-blank-country', 'own-moga']);
assert('Moga search is in all-leads mode', mogaView.isSearchingAllLeads, true);
assertTrue('Moga search hides other cities', !mogaView.visibleIds.includes('other-amritsar') && !mogaView.visibleIds.includes('own-jalandhar'));

// --- Case-insensitive city ---
const mogaLower = visibleLeads({ currentUser: AM, filters: withFilters({ city: ['moga'] }) });
assert('city match is case-insensitive', mogaLower.visibleIds, mogaView.visibleIds);

// --- Clear filters ---
const cleared = visibleLeads({ currentUser: AM, filters: withFilters() });
assert('clearing filters returns to own leads', cleared.visibleIds, defaultView.visibleIds);

// --- Edit / assign rights ---
assert('AM can edit own Moga lead', canEdit('own-moga', AM), true);
assert('AM cannot edit other AM Moga lead', canEdit('other-moga', AM), false);
assert('AM cannot edit sales-only lead they do not manage', canEdit('sales-own', AM), false);
assert('other AM can edit their Moga lead', canEdit('other-moga', OTHER_AM), true);
assert('admin can edit other AM lead', canEdit('other-moga', AM, true), true);

const simulatedUpdate = (leadId: string, currentUser: string, isAdmin = false) => {
  const existing = leads.find(l => l.id === leadId);
  if (existing && !canMutateLead(existing, { currentUser, isAdmin })) return 'blocked';
  return 'updated';
};
assert('update handler blocks non-AM edit', simulatedUpdate('other-moga', AM), 'blocked');
assert('update handler allows own edit', simulatedUpdate('own-moga', AM), 'updated');
assert('update handler allows admin edit', simulatedUpdate('other-moga', AM, true), 'updated');

// --- Admin ---
const adminView = visibleLeads({ currentUser: AM, isAdmin: true });
assert('admin default still applies India country filter', adminView.visibleIds, [
  'other-amritsar',
  'other-moga',
  'other-moga-blank-country',
  'own-jalandhar',
  'own-moga',
  'sales-own',
]);
assertTrue('admin default does not include Canada until country is changed', !adminView.visibleIds.includes('other-toronto'));
assert('admin city filter still sees matching others', visibleLeads({
  currentUser: AM,
  isAdmin: true,
  filters: withFilters({ city: ['Moga'] }),
}).visibleIds, ['other-moga', 'other-moga-blank-country', 'own-moga']);

// --- Pipeline-style city search ---
const pipelineLeads = leads.filter(l => ['own-moga', 'other-moga', 'own-jalandhar'].includes(l.id));
const assignedPipeline = getAssignedLeads(pipelineLeads, { currentUser: AM });
const pipelineSearch = resolveLeadSource({
  assignedLeads: assignedPipeline,
  allLeads: pipelineLeads,
  filters: withFilters({ city: ['Moga'] }),
});
assert('pipeline city search uses full pipeline catalog', pipelineSearch.sourceLeads.map(l => l.id).sort(), ['other-moga', 'own-jalandhar', 'own-moga']);

const groupedMoga = partitionLeadsByOwnership(
  mogaView.visibleIds.map(id => leads.find(l => l.id === id)!),
  { currentUser: AM, isAdmin: false }
);
assert('grouped list puts own leads first', groupedMoga.grouped.map(l => l.id), ['own-moga', 'other-moga', 'other-moga-blank-country']);
assert('own group count for Moga search', groupedMoga.ownLeads.length, 1);
assert('other group count for Moga search', groupedMoga.otherLeads.length, 2);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
