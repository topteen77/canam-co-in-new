/**
 * Countries and cities for contact location dropdowns.
 * City list is shown based on selected country.
 */

export const DEFAULT_CONTACT_COUNTRY = 'India';

export const CONTACT_COUNTRY_OPTIONS: string[] = [
  'India',
  'Canada',
  'USA',
  'UK',
  'Australia',
  'Germany',
  'Ireland',
  'New Zealand',
  'UAE',
  'Singapore',
  'Netherlands',
  'France',
  'Italy',
  'Spain',
  'Malaysia',
  'Philippines',
  'Pakistan',
  'Bangladesh',
  'Sri Lanka',
  'Nepal',
  'Other'
];

export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  India: [
    'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad',
    'Chandigarh', 'Jaipur', 'Lucknow', 'Indore', 'Coimbatore', 'Kochi', 'Nagpur', 'Bhopal',
    'Ludhiana', 'Surat', 'Vadodara', 'Ghaziabad', 'Noida', 'Gurgaon', 'Faridabad', 'Mysore',
    'Thiruvananthapuram', 'Visakhapatnam', 'New Delhi', 'Jalandhar', 'Amritsar', 'Mohali',
    'Patiala', 'Ambala', 'Karnal', 'Panipat', 'Kurukshetra', 'Moga', 'Bathinda', 'Hisar', 'Other'
  ],
  Canada: [
    'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City',
    'Hamilton', 'Kitchener', 'London', 'Victoria', 'Halifax', 'Oshawa', 'Windsor', 'Saskatoon',
    'Regina', 'Sherbrooke', 'Barrie', 'Kelowna', 'Abbotsford', 'Kingston', 'Trois-Rivières',
    'Mississauga', 'Brampton', 'Surrey', 'Burnaby', 'Laval', 'Markham', 'Vaughan', 'Richmond', 'Other'
  ],
  USA: [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio',
    'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus',
    'Charlotte', 'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Boston', 'Nashville',
    'Detroit', 'Portland', 'Las Vegas', 'Miami', 'Atlanta', 'Washington DC', 'Other'
  ],
  UK: [
    'London', 'Birmingham', 'Manchester', 'Leeds', 'Glasgow', 'Liverpool', 'Bristol', 'Sheffield',
    'Edinburgh', 'Cardiff', 'Belfast', 'Newcastle', 'Nottingham', 'Southampton', 'Brighton',
    'Leicester', 'Coventry', 'Reading', 'Plymouth', 'Aberdeen', 'York', 'Oxford', 'Cambridge', 'Other'
  ],
  Australia: [
    'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Newcastle', 'Canberra',
    'Sunshine Coast', 'Wollongong', 'Hobart', 'Geelong', 'Townsville', 'Cairns', 'Darwin', 'Other'
  ],
  Germany: [
    'Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne', 'Stuttgart', 'Düsseldorf', 'Dortmund',
    'Essen', 'Leipzig', 'Bremen', 'Dresden', 'Hannover', 'Nuremberg', 'Duisburg', 'Other'
  ],
  Ireland: [
    'Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford', 'Drogheda', 'Dundalk', 'Swords',
    'Bray', 'Navan', 'Ennis', 'Tralee', 'Carlow', 'Kilkenny', 'Other'
  ],
  'New Zealand': [
    'Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga', 'Napier', 'Dunedin',
    'Palmerston North', 'Nelson', 'Rotorua', 'Whangarei', 'New Plymouth', 'Invercargill', 'Other'
  ],
  UAE: [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain', 'Other'
  ],
  Singapore: [
    'Singapore', 'Other'
  ],
  Netherlands: [
    'Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Groningen', 'Tilburg',
    'Almere', 'Breda', 'Nijmegen', 'Haarlem', 'Arnhem', 'Zaanstad', 'Other'
  ],
  France: [
    'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier',
    'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Saint-Étienne', 'Toulon', 'Grenoble', 'Other'
  ],
  Italy: [
    'Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence',
    'Venice', 'Verona', 'Catania', 'Padua', 'Trieste', 'Brescia', 'Other'
  ],
  Spain: [
    'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga', 'Murcia', 'Palma',
    'Bilbao', 'Alicante', 'Córdoba', 'Valladolid', 'Vigo', 'Gijón', 'Other'
  ],
  Malaysia: [
    'Kuala Lumpur', 'George Town', 'Ipoh', 'Petaling Jaya', 'Shah Alam', 'Johor Bahru',
    'Malacca City', 'Kuching', 'Kota Kinabalu', 'Alor Setar', 'Kota Bharu', 'Kangar', 'Other'
  ],
  Philippines: [
    'Manila', 'Quezon City', 'Davao City', 'Cebu City', 'Zamboanga City', 'Taguig', 'Antipolo',
    'Pasig', 'Cagayan de Oro', 'Valenzuela', 'Bacoor', 'Las Piñas', 'General Santos', 'Other'
  ],
  Pakistan: [
    'Karachi', 'Lahore', 'Faisalabad', 'Rawalpindi', 'Multan', 'Gujranwala', 'Peshawar',
    'Quetta', 'Islamabad', 'Sialkot', 'Sargodha', 'Bahawalpur', 'Sukkur', 'Other'
  ],
  Bangladesh: [
    'Dhaka', 'Chittagong', 'Khulna', 'Rajshahi', 'Sylhet', 'Barisal', 'Rangpur', 'Mymensingh', 'Other'
  ],
  'Sri Lanka': [
    'Colombo', 'Kandy', 'Galle', 'Jaffna', 'Negombo', 'Anuradhapura', 'Trincomalee', 'Batticaloa', 'Other'
  ],
  Nepal: [
    'Kathmandu', 'Pokhara', 'Lalitpur', 'Bharatpur', 'Biratnagar', 'Birgunj', 'Dharan', 'Other'
  ],
  Other: []
};

function countryCityList(country: string): string[] {
  const needle = (country || '').trim().toLowerCase();
  if (!needle) return [];
  const key = Object.keys(CITIES_BY_COUNTRY).find((k) => k.toLowerCase() === needle);
  return key ? CITIES_BY_COUNTRY[key] : [];
}

/** Get cities for a country; includes existing city if not in list so we don't lose custom values */
export function getCityOptionsForCountry(country: string, existingCity?: string): string[] {
  const list = countryCityList(country);
  const normalized = (existingCity || '').trim();
  if (normalized && !list.includes(normalized)) {
    return [normalized, ...list];
  }
  return list;
}

/** Blank contact country is treated as India (most agencies do not store country). */
export function contactMatchesSelectedCountries(
  contactCountry: string | undefined | null,
  selectedCountries: string[]
): boolean {
  if (!selectedCountries.length) return true;
  const stored = (contactCountry || '').trim().toLowerCase();
  return selectedCountries.some((country) => {
    const selected = (country || '').trim().toLowerCase();
    if (!selected) return false;
    if (!stored && selected === DEFAULT_CONTACT_COUNTRY.toLowerCase()) return true;
    return stored.includes(selected);
  });
}

/** Cities for one or more countries (lead filters). Extra values are kept if they belong to those countries. */
export function getCityOptionsForCountries(countries: string[], extraCities: string[] = []): string[] {
  const cities = new Set<string>();
  const extras = extraCities.map((c) => (c || '').trim()).filter(Boolean);
  if (!countries.length) {
    extras.forEach((c) => cities.add(c));
    return [...cities].sort((a, b) => a.localeCompare(b));
  }
  countries.forEach((country) => {
    countryCityList(country).forEach((city) => cities.add(city));
  });
  extras.forEach((city) => cities.add(city));
  return [...cities].sort((a, b) => a.localeCompare(b));
}
