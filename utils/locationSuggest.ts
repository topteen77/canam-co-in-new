import {
  CONTACT_COUNTRY_OPTIONS,
  CITIES_BY_COUNTRY,
  DEFAULT_CONTACT_COUNTRY,
  contactMatchesSelectedCountries,
  getCityOptionsForCountries
} from './countriesAndCities';

export type LocationSuggestion = {
  id: string;
  label: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
};

export const COMMON_DESIGNATIONS = [
  'Director',
  'Managing Director',
  'CEO',
  'Owner',
  'Proprietor',
  'Partner',
  'Branch Manager',
  'Business Development Manager',
  'Sales Manager',
  'Counsellor',
  'Counselor',
  'Senior Counsellor',
  'Operations Manager',
  'Consultant',
  'POC'
];

export const STATES_BY_COUNTRY: Record<string, string[]> = {
  India: [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
    'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
    'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
    'Lakshadweep', 'Puducherry'
  ],
  Canada: [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
    'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan',
    'Northwest Territories', 'Nunavut', 'Yukon'
  ],
  USA: [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
    'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
    'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
    'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
    'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
    'Washington DC', 'West Virginia', 'Wisconsin', 'Wyoming'
  ],
  UK: ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  Australia: [
    'New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia',
    'Tasmania', 'Australian Capital Territory', 'Northern Territory'
  ],
  UAE: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain']
};

const INDIA_CITY_STATE: Record<string, string> = {
  Mumbai: 'Maharashtra', Pune: 'Maharashtra', Nagpur: 'Maharashtra', Nashik: 'Maharashtra',
  Thane: 'Maharashtra', Aurangabad: 'Maharashtra', 'Navi Mumbai': 'Maharashtra',
  Delhi: 'Delhi', 'New Delhi': 'Delhi',
  Bangalore: 'Karnataka', Bengaluru: 'Karnataka', Mysore: 'Karnataka', Mangalore: 'Karnataka', Hubli: 'Karnataka',
  Hyderabad: 'Telangana', Warangal: 'Telangana',
  Chennai: 'Tamil Nadu', Coimbatore: 'Tamil Nadu', Madurai: 'Tamil Nadu', Tiruchirappalli: 'Tamil Nadu',
  Kolkata: 'West Bengal', Howrah: 'West Bengal', Durgapur: 'West Bengal', Siliguri: 'West Bengal',
  Ahmedabad: 'Gujarat', Surat: 'Gujarat', Vadodara: 'Gujarat', Rajkot: 'Gujarat',
  Chandigarh: 'Chandigarh',
  Panchkula: 'Haryana', Zirakpur: 'Punjab', Lalru: 'Punjab', 'Raman Mandi': 'Punjab',
  Jaipur: 'Rajasthan', Jodhpur: 'Rajasthan', Udaipur: 'Rajasthan', Kota: 'Rajasthan',
  Lucknow: 'Uttar Pradesh', Noida: 'Uttar Pradesh', Ghaziabad: 'Uttar Pradesh', Kanpur: 'Uttar Pradesh',
  Varanasi: 'Uttar Pradesh', Agra: 'Uttar Pradesh', Prayagraj: 'Uttar Pradesh', Meerut: 'Uttar Pradesh',
  Indore: 'Madhya Pradesh', Bhopal: 'Madhya Pradesh', Gwalior: 'Madhya Pradesh', Jabalpur: 'Madhya Pradesh',
  Kochi: 'Kerala', Thiruvananthapuram: 'Kerala', Kozhikode: 'Kerala', Thrissur: 'Kerala',
  Visakhapatnam: 'Andhra Pradesh', Vijayawada: 'Andhra Pradesh', Guntur: 'Andhra Pradesh', Tirupati: 'Andhra Pradesh',
  Ludhiana: 'Punjab', Jalandhar: 'Punjab', Amritsar: 'Punjab', Mohali: 'Punjab',
  Patiala: 'Punjab', Moga: 'Punjab', Bathinda: 'Punjab',
  Gurgaon: 'Haryana', Gurugram: 'Haryana', Faridabad: 'Haryana', Ambala: 'Haryana',
  Karnal: 'Haryana', Panipat: 'Haryana', Kurukshetra: 'Haryana', Hisar: 'Haryana',
  Patna: 'Bihar', Gaya: 'Bihar', Muzaffarpur: 'Bihar',
  Bhubaneswar: 'Odisha', Cuttack: 'Odisha',
  Ranchi: 'Jharkhand', Jamshedpur: 'Jharkhand', Dhanbad: 'Jharkhand',
  Raipur: 'Chhattisgarh', Bhilai: 'Chhattisgarh',
  Dehradun: 'Uttarakhand', Haridwar: 'Uttarakhand',
  Shimla: 'Himachal Pradesh', Dharamshala: 'Himachal Pradesh',
  Guwahati: 'Assam', Dibrugarh: 'Assam',
  Panaji: 'Goa', Margao: 'Goa', Vasco: 'Goa',
  Imphal: 'Manipur', Shillong: 'Meghalaya', Aizawl: 'Mizoram', Kohima: 'Nagaland',
  Agartala: 'Tripura', Itanagar: 'Arunachal Pradesh', Gangtok: 'Sikkim',
  Srinagar: 'Jammu and Kashmir', Jammu: 'Jammu and Kashmir', Leh: 'Ladakh',
  Puducherry: 'Puducherry', 'Port Blair': 'Andaman and Nicobar Islands',
  Kavaratti: 'Lakshadweep', Silvassa: 'Dadra and Nagar Haveli and Daman and Diu',
  Daman: 'Dadra and Nagar Haveli and Daman and Diu'
};

const BASE_CITY_TO_STATE: Record<string, string> = {
  ...INDIA_CITY_STATE,
  Toronto: 'Ontario', Mississauga: 'Ontario', Brampton: 'Ontario', Markham: 'Ontario',
  Vaughan: 'Ontario', Hamilton: 'Ontario', Kitchener: 'Ontario', London: 'Ontario',
  Ottawa: 'Ontario', Oshawa: 'Ontario', Windsor: 'Ontario', Barrie: 'Ontario', Kingston: 'Ontario',
  Vancouver: 'British Columbia', Victoria: 'British Columbia', Kelowna: 'British Columbia',
  Abbotsford: 'British Columbia', Surrey: 'British Columbia', Burnaby: 'British Columbia',
  Richmond: 'British Columbia', Calgary: 'Alberta', Edmonton: 'Alberta', Winnipeg: 'Manitoba',
  Montreal: 'Quebec', Laval: 'Quebec', 'Quebec City': 'Quebec', Sherbrooke: 'Quebec',
  'Trois-Rivières': 'Quebec', Halifax: 'Nova Scotia', Saskatoon: 'Saskatchewan', Regina: 'Saskatchewan',
  'New York': 'New York', 'Los Angeles': 'California', Chicago: 'Illinois', Houston: 'Texas',
  Phoenix: 'Arizona', Philadelphia: 'Pennsylvania', 'San Antonio': 'Texas', 'San Diego': 'California',
  Dallas: 'Texas', 'San Jose': 'California', Austin: 'Texas', Jacksonville: 'Florida',
  'Fort Worth': 'Texas', Columbus: 'Ohio', Charlotte: 'North Carolina', 'San Francisco': 'California',
  Indianapolis: 'Indiana', Seattle: 'Washington', Denver: 'Colorado', Boston: 'Massachusetts',
  Nashville: 'Tennessee', Detroit: 'Michigan', Portland: 'Oregon', 'Las Vegas': 'Nevada',
  Miami: 'Florida', Atlanta: 'Georgia', 'Washington DC': 'Washington DC',
  Birmingham: 'England', Manchester: 'England', Leeds: 'England', Liverpool: 'England',
  Bristol: 'England', Sheffield: 'England', Newcastle: 'England', Nottingham: 'England',
  Southampton: 'England', Brighton: 'England', Leicester: 'England', Coventry: 'England',
  Reading: 'England', Plymouth: 'England', York: 'England', Oxford: 'England', Cambridge: 'England',
  Glasgow: 'Scotland', Edinburgh: 'Scotland', Aberdeen: 'Scotland', Cardiff: 'Wales', Belfast: 'Northern Ireland',
  Sydney: 'New South Wales', Wollongong: 'New South Wales',
  Melbourne: 'Victoria', Geelong: 'Victoria', Brisbane: 'Queensland', 'Gold Coast': 'Queensland',
  'Sunshine Coast': 'Queensland', Townsville: 'Queensland', Cairns: 'Queensland', Perth: 'Western Australia',
  Adelaide: 'South Australia', Hobart: 'Tasmania', Canberra: 'Australian Capital Territory',
  Darwin: 'Northern Territory',
  Dubai: 'Dubai', 'Abu Dhabi': 'Abu Dhabi', Sharjah: 'Sharjah', Ajman: 'Ajman',
  'Ras Al Khaimah': 'Ras Al Khaimah', Fujairah: 'Fujairah', 'Umm Al Quwain': 'Umm Al Quwain'
};

let runtimeStatesByCountry: Record<string, string[]> | null = null;
let runtimeCityToState: Record<string, string> | null = null;

/** Apply admin location-master overrides (DB). Empty payload clears overrides. */
export function setLocationMasterOverrides(payload?: {
  statesByCountry?: Record<string, string[]>;
  cityToState?: Record<string, string>;
} | null): void {
  if (!payload) {
    runtimeStatesByCountry = null;
    runtimeCityToState = null;
    return;
  }
  runtimeStatesByCountry = payload.statesByCountry && Object.keys(payload.statesByCountry).length
    ? payload.statesByCountry
    : null;
  runtimeCityToState = payload.cityToState && Object.keys(payload.cityToState).length
    ? payload.cityToState
    : null;
}

function activeStatesByCountry(): Record<string, string[]> {
  return runtimeStatesByCountry || STATES_BY_COUNTRY;
}

function CITY_TO_STATE(): Record<string, string> {
  return runtimeCityToState
    ? { ...BASE_CITY_TO_STATE, ...runtimeCityToState }
    : BASE_CITY_TO_STATE;
}

const COUNTRY_ALIASES: Record<string, string> = {
  india: 'India',
  canada: 'Canada',
  usa: 'USA',
  us: 'USA',
  'united states': 'USA',
  'united states of america': 'USA',
  uk: 'UK',
  'united kingdom': 'UK',
  britain: 'UK',
  england: 'UK',
  australia: 'Australia',
  germany: 'Germany',
  ireland: 'Ireland',
  'new zealand': 'New Zealand',
  uae: 'UAE',
  'united arab emirates': 'UAE',
  singapore: 'Singapore',
  netherlands: 'Netherlands',
  france: 'France',
  italy: 'Italy',
  spain: 'Spain',
  malaysia: 'Malaysia',
  philippines: 'Philippines',
  pakistan: 'Pakistan',
  bangladesh: 'Bangladesh',
  'sri lanka': 'Sri Lanka',
  nepal: 'Nepal'
};

const filterStartsOrIncludes = (items: string[], query: string, limit = 8): string[] => {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);
  const starts = items.filter((item) => item.toLowerCase().startsWith(q));
  const includes = items.filter(
    (item) => !starts.includes(item) && item.toLowerCase().includes(q)
  );
  return [...starts, ...includes].slice(0, limit);
};

export const normalizeCountryName = (value?: string): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const alias = COUNTRY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  const match = CONTACT_COUNTRY_OPTIONS.find((c) => c.toLowerCase() === raw.toLowerCase());
  return match || raw;
};

const knownStateLists = (): string[] => Object.values(activeStatesByCountry()).flat();

export const canonicalStateName = (value?: string): string => {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const first = raw.split(',')[0].trim();
  const needle = first.toLowerCase();
  const match = knownStateLists().find((state) => state.toLowerCase() === needle);
  return match || first;
};

export const uniqueStateNames = (states: string[]): string[] => {
  const seen = new Map<string, string>();
  states.forEach((value) => {
    const name = canonicalStateName(value);
    if (!name) return;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};

const cityStateFromMap = (city: string): string | undefined => {
  const needle = (city || '').trim().toLowerCase();
  if (!needle) return undefined;
  const map = CITY_TO_STATE();
  const key = Object.keys(map).find((name) => name.toLowerCase() === needle);
  return key ? map[key] : undefined;
};

export const inferLocationFromCity = (city: string): { country?: string; state?: string } => {
  const needle = (city || '').trim().toLowerCase();
  if (!needle) return {};
  const mappedState = cityStateFromMap(city);
  const map = CITY_TO_STATE();
  for (const [country, cities] of Object.entries(CITIES_BY_COUNTRY)) {
    const match = cities.find((c) => c.toLowerCase() === needle);
    if (match) {
      return {
        country,
        state: mappedState || map[match]
      };
    }
  }
  return mappedState ? { country: DEFAULT_CONTACT_COUNTRY, state: mappedState } : {};
};

export const stateMatchesSelection = (storedState: string | undefined, selectedStates: string[]): boolean => {
  if (!selectedStates.length) return true;
  const stored = canonicalStateName(storedState);
  if (!stored) return false;
  return selectedStates.some((state) => canonicalStateName(state).toLowerCase() === stored.toLowerCase());
};

export const cityBelongsToSelectedStates = (
  city: string | undefined,
  storedState: string | undefined,
  selectedStates: string[]
): boolean => {
  if (!selectedStates.length) return true;
  // Catalog / master mapping wins over a bad contact.state value.
  const inferred = cityStateFromMap(city || '') || storedState || inferLocationFromCity(city || '').state || '';
  return stateMatchesSelection(inferred, selectedStates);
};

export const suggestCountries = (query: string): LocationSuggestion[] =>
  filterStartsOrIncludes(CONTACT_COUNTRY_OPTIONS, query).map((country) => ({
    id: `country-${country}`,
    label: country,
    country
  }));

export const suggestStates = (query: string, country?: string): LocationSuggestion[] => {
  const key = normalizeCountryName(country);
  const catalog = activeStatesByCountry();
  const list = (key && catalog[key]) || Object.values(catalog).flat();
  const unique = Array.from(new Set(list));
  return filterStartsOrIncludes(unique, query).map((state) => ({
    id: `state-${state}`,
    label: state,
    description: key || undefined,
    state,
    country: key || undefined
  }));
};

function builtInCountryForState(state: string): string | undefined {
  const needle = canonicalStateName(state).toLowerCase();
  if (!needle) return undefined;
  return Object.keys(STATES_BY_COUNTRY).find((country) =>
    (STATES_BY_COUNTRY[country] || []).some((item) => item.toLowerCase() === needle)
  );
}

/**
 * Resolve which country a state belongs to.
 * Built-in map wins so mis-tagged DB rows (e.g. Alberta under India) cannot leak.
 */
export function countryForState(state: string): string | undefined {
  const builtIn = builtInCountryForState(state);
  if (builtIn) return builtIn;
  const needle = canonicalStateName(state).toLowerCase();
  if (!needle) return undefined;
  const catalog = activeStatesByCountry();
  return Object.keys(catalog).find((country) =>
    (catalog[country] || []).some((item) => item.toLowerCase() === needle)
  );
}

function stateBelongsToSelectedCountries(state: string, countryKeys: string[]): boolean {
  if (!countryKeys.length) return true;
  const owner = countryForState(state);
  if (!owner) return true; // custom / unknown CRM state
  return countryKeys.some((key) => key.toLowerCase() === owner.toLowerCase());
}

/** States for one or more countries (lead filters). Extra stored values are kept only when they belong to the selected country (or are unknown). */
export function getStateOptionsForCountries(countries: string[], extraStates: string[] = []): string[] {
  const extras = extraStates.map((s) => canonicalStateName(s)).filter(Boolean);
  const keys = countries.map((c) => normalizeCountryName(c)).filter(Boolean);
  const catalog = activeStatesByCountry();
  // Never list a state under the wrong country, even if DB overrides mis-tagged it (e.g. Alberta → India).
  const fromCatalog = keys.length
    ? keys.flatMap((key) =>
        (catalog[key] || []).filter((state) => {
          const builtInOwner = builtInCountryForState(state);
          return !builtInOwner || builtInOwner.toLowerCase() === key.toLowerCase();
        })
      )
    : knownStateLists();

  const scopedExtras = keys.length
    ? extras.filter((state) => stateBelongsToSelectedCountries(state, keys))
    : extras;

  return uniqueStateNames([...fromCatalog, ...scopedExtras]);
};

function citiesForState(state: string): string[] {
  const needle = canonicalStateName(state).toLowerCase();
  if (!needle) return [];
  return Object.entries(CITY_TO_STATE())
    .filter(([, mapped]) => canonicalStateName(mapped).toLowerCase() === needle)
    .map(([city]) => city);
}

/** Cities for selected states. Falls back to country cities when no state is chosen. */
export function getCityOptionsForStates(
  states: string[],
  extraLocations: Array<{ city?: string; state?: string; country?: string }> = [],
  countries: string[] = []
): string[] {
  const addUnique = (map: Map<string, string>, city?: string) => {
    const name = String(city || '').trim();
    if (!name || name.toLowerCase() === 'other') return;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
  };

  if (!states.length) {
    const extras = extraLocations.map((loc) => loc.city || '').filter(Boolean);
    const list = getCityOptionsForCountries(countries, extras);
    const unique = new Map<string, string>();
    list.forEach((city) => addUnique(unique, city));
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
  }

  const cities = new Map<string, string>();
  const countryOk = (country?: string) =>
    !countries.length || contactMatchesSelectedCountries(country || '', countries);

  states.forEach((state) => {
    const stateCountry = countryForState(state);
    if (stateCountry && !countryOk(stateCountry)) return;
    citiesForState(state).forEach((city) => addUnique(cities, city));
  });

  extraLocations.forEach((loc) => {
    if (!countryOk(loc.country)) return;
    if (cityBelongsToSelectedStates(loc.city, loc.state, states)) addUnique(cities, loc.city);
  });

  return [...cities.values()].sort((a, b) => a.localeCompare(b));
};

export const suggestCities = (query: string, country?: string): LocationSuggestion[] => {
  const key = normalizeCountryName(country);
  const list = key && CITIES_BY_COUNTRY[key]
    ? CITIES_BY_COUNTRY[key]
    : Object.values(CITIES_BY_COUNTRY).flat();
  const unique = Array.from(new Set(list.filter((c) => c && c !== 'Other')));
  return filterStartsOrIncludes(unique, query, 10).map((city) => {
    const inferred = inferLocationFromCity(city);
    return {
      id: `city-${city}`,
      label: city,
      description: [inferred.state, inferred.country || key].filter(Boolean).join(', ') || undefined,
      city,
      state: inferred.state,
      country: inferred.country || key
    };
  });
};

export const suggestDesignations = (query: string): LocationSuggestion[] =>
  filterStartsOrIncludes(COMMON_DESIGNATIONS, query, 8).map((label) => ({
    id: `desig-${label}`,
    label
  }));

const PHOTON_COUNTRY_MAP: Record<string, string> = {
  'United States': 'USA',
  'United States of America': 'USA',
  'United Kingdom': 'UK',
  'Great Britain': 'UK',
  'United Arab Emirates': 'UAE'
};

type PhotonFeature = {
  properties?: {
    osm_id?: number | string;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    locality?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
};

const mapPhotonFeatures = (features: PhotonFeature[]): LocationSuggestion[] =>
  features.map((feature, index) => {
    const p = feature.properties || {};
    const country = normalizeCountryName(PHOTON_COUNTRY_MAP[p.country || ''] || p.country);
    const city = p.city || p.locality || p.district || '';
    const state = p.state || p.county || '';
    const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
    const label = [street || p.name, city, state, country].filter(Boolean).join(', ');
    return {
      id: `addr-${p.osm_id || index}-${label}`,
      label,
      description: [city, state, country].filter(Boolean).join(', '),
      address: label,
      city,
      state,
      country
    };
  }).filter((item) => item.label);

type NominatimHit = {
  place_id?: number;
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
};

const mapNominatimHits = (hits: NominatimHit[]): LocationSuggestion[] =>
  hits.map((hit, index) => {
    const a = hit.address || {};
    const country = normalizeCountryName(PHOTON_COUNTRY_MAP[a.country || ''] || a.country);
    const city = a.city || a.town || a.village || a.suburb || '';
    const state = a.state || '';
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const label = hit.display_name || [street, city, state, country].filter(Boolean).join(', ');
    return {
      id: `nom-${hit.place_id || index}-${label}`,
      label,
      description: [city, state, country].filter(Boolean).join(', '),
      address: label,
      city,
      state,
      country
    };
  }).filter((item) => item.label);

async function fetchJson(url: string, timeoutMs = 5000): Promise<any | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function suggestAddresses(query: string): Promise<LocationSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const photon = await fetchJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`);
  const photonItems = mapPhotonFeatures(Array.isArray(photon?.features) ? photon.features : []);
  if (photonItems.length) return photonItems;

  const nominatim = await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`
  );
  const nominatimItems = mapNominatimHits(Array.isArray(nominatim) ? nominatim : []);
  if (nominatimItems.length) return nominatimItems;

  return suggestCities(q).map((item) => ({
    ...item,
    id: `local-addr-${item.label}`,
    label: [item.city, item.state, item.country].filter(Boolean).join(', '),
    address: [item.city, item.state, item.country].filter(Boolean).join(', ')
  }));
}
