/** Shared login-location rules. GPS must not block sign-in. */

export const FAST_GPS_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 2500,
  maximumAge: 300000,
};

export function parseGpsBody(body = {}) {
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: 'Latitude and longitude are required' };
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { ok: false, error: 'Invalid coordinates' };
  }
  return { ok: true, latitude, longitude, locationSource: 'gps' };
}

export function shouldApplyLocationUpdate(existing, options = {}) {
  if (!existing || existing.status !== 'active') return false;
  if (options.onlyIfNotGps && existing.location_source === 'gps') return false;
  return true;
}

export function placeLabelFromGeocode(data) {
  if (!data || typeof data !== 'object') return '';
  const parts = [
    data.locality,
    data.localityInfo?.administrative?.[2]?.name,
    data.city,
    data.principalSubdivision,
    data.postcode,
    data.countryName,
  ].filter(Boolean);
  const unique = [];
  parts.forEach((part) => {
    const text = String(part);
    if (!unique.some((item) => item.toLowerCase() === text.toLowerCase())) unique.push(text);
  });
  return unique.join(', ');
}

export function coordLabel(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
