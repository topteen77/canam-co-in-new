import {
  CONTACT_COUNTRY_OPTIONS,
  CITIES_BY_COUNTRY,
  DEFAULT_CONTACT_COUNTRY
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
  Mumbai: 'Maharashtra', Delhi: 'Delhi', 'New Delhi': 'Delhi', Bangalore: 'Karnataka',
  Bengaluru: 'Karnataka', Hyderabad: 'Telangana', Chennai: 'Tamil Nadu', Kolkata: 'West Bengal',
  Pune: 'Maharashtra', Ahmedabad: 'Gujarat', Chandigarh: 'Chandigarh', Jaipur: 'Rajasthan',
  Lucknow: 'Uttar Pradesh', Indore: 'Madhya Pradesh', Coimbatore: 'Tamil Nadu', Kochi: 'Kerala',
  Nagpur: 'Maharashtra', Bhopal: 'Madhya Pradesh', Ludhiana: 'Punjab', Surat: 'Gujarat',
  Vadodara: 'Gujarat', Ghaziabad: 'Uttar Pradesh', Noida: 'Uttar Pradesh', Gurgaon: 'Haryana',
  Gurugram: 'Haryana', Faridabad: 'Haryana', Mysore: 'Karnataka', Thiruvananthapuram: 'Kerala',
  Visakhapatnam: 'Andhra Pradesh', Jalandhar: 'Punjab', Amritsar: 'Punjab', Mohali: 'Punjab',
  Patiala: 'Punjab', Ambala: 'Haryana', Karnal: 'Haryana', Panipat: 'Haryana',
  Kurukshetra: 'Haryana', Moga: 'Punjab', Bathinda: 'Punjab', Hisar: 'Haryana'
};

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

export const inferLocationFromCity = (city: string): { country?: string; state?: string } => {
  const needle = (city || '').trim().toLowerCase();
  if (!needle) return {};
  for (const [country, cities] of Object.entries(CITIES_BY_COUNTRY)) {
    const match = cities.find((c) => c.toLowerCase() === needle);
    if (match) {
      return {
        country,
        state: INDIA_CITY_STATE[match] || INDIA_CITY_STATE[city]
      };
    }
  }
  const state = INDIA_CITY_STATE[Object.keys(INDIA_CITY_STATE).find((k) => k.toLowerCase() === needle) || ''];
  return state ? { country: DEFAULT_CONTACT_COUNTRY, state } : {};
};

export const suggestCountries = (query: string): LocationSuggestion[] =>
  filterStartsOrIncludes(CONTACT_COUNTRY_OPTIONS, query).map((country) => ({
    id: `country-${country}`,
    label: country,
    country
  }));

export const suggestStates = (query: string, country?: string): LocationSuggestion[] => {
  const key = normalizeCountryName(country);
  const list = (key && STATES_BY_COUNTRY[key]) || Object.values(STATES_BY_COUNTRY).flat();
  const unique = Array.from(new Set(list));
  return filterStartsOrIncludes(unique, query).map((state) => ({
    id: `state-${state}`,
    label: state,
    description: key || undefined,
    state,
    country: key || undefined
  }));
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
