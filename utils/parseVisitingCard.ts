import type { ExtractedLeadData } from '../services/ocrService';
import { inferLocationFromCity, normalizeCountryName } from './locationSuggest';

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;]+|(?:\b[a-z0-9-]+\.(?:com|net|org|in|co\.in|io|edu|gov|co|us|uk|info)\b)/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const DESIGNATION_RE =
  /\b(?:Managing Director|General Manager|Sales Manager|Business Development Manager|Marketing Manager|Branch Manager|Senior Counsellor|Senior Counselor|Counsellor|Counselor|Director|Manager|CEO|CTO|CFO|President|Owner|Proprietor|Partner|Consultant|Executive|Officer|Coordinator|Representative)\b/i;
const CONSUMER_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'proton.me'
]);
const NOISE = /^(ph|tel|mobile|email|e-mail|web|www|address|city|state|country|logo|phone|fax|contact)$/i;

export const ASSIGNABLE_FIELDS: Array<{ key: keyof ExtractedLeadData; label: string }> = [
  { key: 'agencyName', label: 'Agency / Partner Name' },
  { key: 'contactName', label: 'Contact Name' },
  { key: 'phone', label: 'Primary Mobile' },
  { key: 'email', label: 'Email' },
  { key: 'pocDesignation', label: 'Designation' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'alternateMobile', label: 'Alternate Mobile' },
  { key: 'websiteLink', label: 'Website' },
  { key: 'remarks', label: 'Remarks' }
];

export const buildOcrFieldOptions = (
  field: keyof ExtractedLeadData,
  extraction: { text: string; fields: ExtractedLeadData }
): Array<{ value: string; label: string }> => {
  const suggested = String(extraction.fields[field] || '').trim();
  const tokens = tokenizeExtractedText(extraction.text, extraction.fields);
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];

  const push = (raw: string, labelPrefix?: string) => {
    const value = formatSnippetForField(field, raw);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    options.push({
      value,
      label: labelPrefix ? `${labelPrefix}: ${value}` : value
    });
  };

  if (suggested) push(suggested, 'Suggested');

  const relevant = tokens.filter((token) => {
    if (field === 'email') return token.includes('@');
    if (field === 'phone' || field === 'alternateMobile') return (token.replace(/\D/g, '').length >= 8);
    if (field === 'websiteLink') return /https?:|www\.|\.(com|in|net|org|io)\b/i.test(token);
    return true;
  });

  relevant.forEach((token) => push(token));
  if (options.length <= 1) {
    tokens.forEach((token) => push(token));
  }

  return options.slice(0, 20);
};

export const normalizePhoneDigits = (value: string): string => {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

const unique = (items: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  items.forEach((item) => {
    const trimmed = item.replace(/\s+/g, ' ').trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || NOISE.test(trimmed) || seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  });
  return out;
};

const titleCaseDomain = (domain: string): string =>
  domain
    .replace(/\.(com|net|org|in|co\.in|io|co|us|uk)$/i, '')
    .split(/[.-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const STRONG_COMPANY_RE =
  /\b(Pvt\.?|Ltd\.?|Limited|Inc\.?|LLC|Corp\.?|Corporation|Agency|Travels|Travel|Solutions|Services|Group|Company|Consultancy|Consulting|Enterprises|International|Global)\b/i;

const agencyNameFromDomain = (website?: string, email?: string): string | undefined => {
  const hostFromWebsite = (() => {
    if (!website) return '';
    try {
      return new URL(website).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
    }
  })();
  const hostFromEmail = (email || '').split('@')[1]?.toLowerCase() || '';
  const host = (hostFromWebsite && !CONSUMER_DOMAINS.has(hostFromWebsite) ? hostFromWebsite : '') ||
    (hostFromEmail && !CONSUMER_DOMAINS.has(hostFromEmail) ? hostFromEmail : '');
  if (!host) return undefined;
  const name = titleCaseDomain(host);
  return name.length > 1 ? name : undefined;
};

const isPlausibleAgencyName = (value?: string): boolean => {
  const trimmed = (value || '').replace(/\s+/g, ' ').trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (/^[)\(|\[\{\]\/\\,.;:'"]+/.test(trimmed)) return false;
  if (/[)(|]/.test(trimmed)) return false;
  if (/\b(www|http|https)\b/i.test(trimmed)) return false;
  if (/\b(com|net|org)\b/i.test(trimmed) && !STRONG_COMPANY_RE.test(trimmed)) return false;
  if (/(^|\s)[a-z]{8,}(\s|$)/.test(trimmed)) return false;
  if (/^[^A-Za-z0-9]+/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  return true;
};

const looksLikePersonName = (value: string): boolean => {
  const words = value.trim().split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (DESIGNATION_RE.test(value) || /@|\d/.test(value)) return false;
  return words.every((word) => /^[A-Z][a-zA-Z'.-]+$/.test(word));
};

const parseUsStyleAddress = (text: string): { address?: string; city?: string; state?: string; country?: string } => {
  const match = text.match(
    /(\d{1,6}\s+[A-Za-z0-9][^,\n]{2,60}?),\s*([A-Za-z][A-Za-z .'-]{1,40}),\s*([A-Z]{2}|[A-Za-z][A-Za-z .'-]{1,30})\s+(\d{4,6})/i
  );
  if (!match) return {};
  return {
    address: match[0].replace(/\s+/g, ' ').trim(),
    city: match[2].trim(),
    state: match[3].trim(),
    country: match[3].trim().length === 2 ? 'USA' : undefined
  };
};

const phonesFromText = (text: string): string[] => {
  const matches = text.match(PHONE_RE) || [];
  const normalized = unique(
    matches
      .map((match) => normalizePhoneDigits(match))
      .filter((digits) => digits.length >= 8 && digits.length <= 10)
  );
  return normalized;
};

const websitesFromText = (text: string, email?: string): string | undefined => {
  const matches = text.match(URL_RE) || [];
  for (const raw of matches) {
    let url = raw.replace(/[),.;]+$/, '');
    if (email && url.toLowerCase() === email.toLowerCase()) continue;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (/really|greatsite|company|agency|[a-z0-9-]+\.(com|in|net|org)/i.test(url)) return url;
    return url;
  }
  if (email) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && !CONSUMER_DOMAINS.has(domain)) return `https://${domain}`;
  }
  return undefined;
};

export const tokenizeExtractedText = (text: string, fields: ExtractedLeadData = {}): string[] => {
  const tokens: string[] = [];
  const emails = text.match(EMAIL_RE) || [];
  const phones = text.match(PHONE_RE) || [];
  const urls = text.match(URL_RE) || [];
  tokens.push(...emails, ...phones, ...urls);

  text.split(/\n+/).forEach((line) => {
    const cleaned = line.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 2) tokens.push(cleaned);
    cleaned.split(/[,;|]/).forEach((part) => {
      const piece = part.trim();
      if (piece.length > 2) tokens.push(piece);
    });
  });

  Object.values(fields).forEach((value) => {
    if (value) tokens.push(value);
  });

  const nameMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g) || [];
  tokens.push(...nameMatch);

  const designation = text.match(DESIGNATION_RE);
  if (designation) tokens.push(designation[0]);

  const address = parseUsStyleAddress(text);
  if (address.address) tokens.push(address.address);
  if (address.city) tokens.push(address.city);
  if (address.state) tokens.push(address.state);

  return unique(tokens).slice(0, 24);
};

export const parseLeadDataFromText = (text: string): ExtractedLeadData => {
  const data: ExtractedLeadData = {};
  const cleanText = text.replace(/[^\S\n]+/g, ' ').trim();
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const emailMatch = cleanText.match(EMAIL_RE);
  if (emailMatch) data.email = emailMatch[0].toLowerCase();

  const phones = phonesFromText(cleanText);
  if (phones[0]) data.phone = phones[0];
  if (phones[1] && phones[1] !== phones[0]) data.alternateMobile = phones[1];

  data.websiteLink = websitesFromText(cleanText, data.email);

  const designationMatch = cleanText.match(DESIGNATION_RE);
  if (designationMatch) {
    data.pocDesignation = designationMatch[0];
    const before = cleanText.slice(0, designationMatch.index || 0).trim();
    const nameCandidate = before.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s*$/);
    if (nameCandidate && looksLikePersonName(nameCandidate[1])) {
      data.contactName = nameCandidate[1];
    }
  }

  if (!data.contactName) {
    for (const line of lines.slice(0, 6)) {
      const stripped = line.replace(DESIGNATION_RE, '').replace(/[-+|]/g, ' ').trim();
      if (looksLikePersonName(stripped)) {
        data.contactName = stripped;
        break;
      }
      const words = stripped.split(/\s+/);
      const maybeName = words.slice(0, 3).join(' ');
      if (looksLikePersonName(maybeName)) {
        data.contactName = maybeName;
        break;
      }
    }
  }

  const addressBits = parseUsStyleAddress(cleanText);
  if (addressBits.address) data.address = addressBits.address;
  if (addressBits.city) data.city = addressBits.city;
  if (addressBits.state) data.state = addressBits.state;
  if (addressBits.country) data.country = addressBits.country;

  if (!data.address) {
    const lineAddress = lines.find((line) =>
      /\d/.test(line) &&
      /(street|st\.?|road|rd\.?|avenue|ave\.?|lane|sector|floor|nagar|colony|anywhere)/i.test(line) &&
      !line.includes('@')
    );
    if (lineAddress) data.address = lineAddress;
  }

  if (!data.city) {
    const cityFromAddress = (data.address || cleanText).match(/,\s*([A-Za-z][A-Za-z .']+?),\s*[A-Z]{2}\b/);
    if (cityFromAddress) data.city = cityFromAddress[1].trim();
  }

  const countryMatch = cleanText.match(/\b(India|Canada|USA|United States|UK|United Kingdom|Australia|UAE|Singapore|Germany|Ireland|New Zealand)\b/i);
  if (countryMatch) {
    data.country = normalizeCountryName(countryMatch[0]);
  }

  const domainAgency = agencyNameFromDomain(data.websiteLink, data.email);
  const companyLine = lines.find((line) =>
    STRONG_COMPANY_RE.test(line) &&
    !looksLikePersonName(line) &&
    !line.includes('@') &&
    !/(?:\+?\d[\d\s().-]{7,}\d)/.test(line)
  );
  if (companyLine) {
    const cleanedCompany = companyLine
      .replace(DESIGNATION_RE, ' ')
      .replace(EMAIL_RE, ' ')
      .replace(PHONE_RE, ' ')
      .replace(/\b(Logo|www)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (isPlausibleAgencyName(cleanedCompany) && !looksLikePersonName(cleanedCompany)) {
      data.agencyName = cleanedCompany;
    }
  }

  if (!isPlausibleAgencyName(data.agencyName) && domainAgency) {
    data.agencyName = domainAgency;
  }

  return normalizeExtractedFields(data);
};

export const normalizeExtractedFields = (fields: ExtractedLeadData): ExtractedLeadData => {
  const next: ExtractedLeadData = { ...fields };

  if (next.phone) next.phone = normalizePhoneDigits(next.phone) || next.phone;
  if (next.alternateMobile) next.alternateMobile = normalizePhoneDigits(next.alternateMobile) || next.alternateMobile;
  if (next.phone && next.alternateMobile && next.phone === next.alternateMobile) delete next.alternateMobile;
  if (next.email) next.email = next.email.trim().toLowerCase();
  if (next.websiteLink && !/^https?:\/\//i.test(next.websiteLink)) {
    next.websiteLink = `https://${next.websiteLink}`;
  }
  if (next.country) next.country = normalizeCountryName(next.country);

  if (next.pocDesignation && next.contactName && next.pocDesignation.toLowerCase().includes(next.contactName.toLowerCase())) {
    next.pocDesignation = next.pocDesignation.replace(next.contactName, '').replace(/\s+/g, ' ').trim();
  }

  if (next.pocDesignation && !next.contactName) {
    const designationMatch = next.pocDesignation.match(DESIGNATION_RE);
    if (designationMatch) {
      const maybeName = next.pocDesignation.replace(DESIGNATION_RE, '').replace(/\s+/g, ' ').trim();
      if (looksLikePersonName(maybeName)) {
        next.contactName = maybeName;
        next.pocDesignation = designationMatch[0];
      }
    }
  }

  if (next.city) {
    const inferred = inferLocationFromCity(next.city);
    if (!next.country && inferred.country) next.country = inferred.country;
    if (!next.state && inferred.state) next.state = inferred.state;
  }

  if (next.agencyName && next.contactName) {
    next.agencyName = next.agencyName.replace(new RegExp(next.contactName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').replace(/\s+/g, ' ').trim();
  }
  if (next.agencyName && next.pocDesignation) {
    next.agencyName = next.agencyName.replace(new RegExp(next.pocDesignation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').replace(/\s+/g, ' ').trim();
  }
  if (!isPlausibleAgencyName(next.agencyName)) {
    next.agencyName = agencyNameFromDomain(next.websiteLink, next.email);
  }
  if (next.agencyName && looksLikePersonName(next.agencyName)) {
    next.agencyName = agencyNameFromDomain(next.websiteLink, next.email);
  }

  if (next.address && (!next.city || !next.state)) {
    const bits = parseUsStyleAddress(next.address);
    if (!next.city && bits.city) next.city = bits.city;
    if (!next.state && bits.state) next.state = bits.state;
    if (!next.country && bits.country) next.country = bits.country;
  }

  return next;
};

export const formatSnippetForField = (field: keyof ExtractedLeadData, value: string): string => {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (field === 'phone' || field === 'alternateMobile') return normalizePhoneDigits(trimmed) || trimmed.replace(/\D/g, '').slice(-10);
  if (field === 'email') return trimmed.toLowerCase();
  if (field === 'websiteLink') return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^www\./i, '')}`;
  if (field === 'country') return normalizeCountryName(trimmed) || trimmed;
  return trimmed;
};
