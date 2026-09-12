import type { ActiveSessionInfo } from './authService';

function isPrivateIp(ip = ''): boolean {
  const value = String(ip || '').replace('::ffff:', '').trim();
  return !value
    || value === '127.0.0.1'
    || value === '::1'
    || value.startsWith('10.')
    || value.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
}

const COORDS_ONLY = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;

export function parseCoords(info: Pick<ActiveSessionInfo, 'latitude' | 'longitude' | 'location'>): { latitude: number; longitude: number } | null {
  const lat = Number(info.latitude);
  const lng = Number(info.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { latitude: lat, longitude: lng };
  const match = String(info.location || '').trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const parsedLat = Number(match[1]);
  const parsedLng = Number(match[2]);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  return { latitude: parsedLat, longitude: parsedLng };
}

export function formatGps(lat?: number | null, lng?: number | null): string {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return '';
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

export function mapsUrl(lat?: number | null, lng?: number | null): string | null {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    const data = await res.json();
    const parts = [
      data.locality,
      data.localityInfo?.administrative?.[2]?.name,
      data.city,
      data.principalSubdivision,
      data.postcode,
      data.countryName,
    ].filter(Boolean);
    const unique: string[] = [];
    parts.forEach((part: string) => {
      if (!unique.some((item) => item.toLowerCase() === String(part).toLowerCase())) unique.push(part);
    });
    if (unique.length) return unique.join(', ');
  } catch {
    // try OSM next
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    const data = await res.json();
    if (data?.display_name) return data.display_name;
  } catch {
    // fall through
  }
  return formatGps(lat, lng);
}

export async function lookupIpLocation(ip?: string): Promise<Pick<ActiveSessionInfo, 'location' | 'latitude' | 'longitude'>> {
  const value = String(ip || '').replace('::ffff:', '').trim();
  if (!value || isPrivateIp(value)) return { location: '' };
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(value)}`);
    const data = await res.json();
    if (!data?.success) return { location: '' };
    return {
      location: [data.city, data.region, data.country].filter(Boolean).join(', '),
      latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : null,
      longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : null,
    };
  } catch {
    return { location: '' };
  }
}

export async function withIpLocation(info: ActiveSessionInfo): Promise<ActiveSessionInfo> {
  let next = { ...info };
  let coords = parseCoords(next);
  if (!coords && next.ipAddress) {
    const geo = await lookupIpLocation(next.ipAddress);
    next = {
      ...next,
      location: next.location || geo.location,
      latitude: next.latitude ?? geo.latitude,
      longitude: next.longitude ?? geo.longitude,
    };
    coords = parseCoords(next);
  }
  if (!coords) return next;
  next.latitude = coords.latitude;
  next.longitude = coords.longitude;
  const current = String(next.location || '').trim();
  if (!current || COORDS_ONLY.test(current) || current.split(',').length < 4) {
    next.location = await reverseGeocode(coords.latitude, coords.longitude);
  }
  return next;
}
