import { FAST_GPS_OPTIONS } from '../shared/loginLocation.js';

/**
 * Read a fast location fix. Uses a cached or network position so login
 * does not wait on a high-accuracy GPS lock.
 */
export function requestLoginGps(geolocation, overrides = {}) {
  const options = { ...FAST_GPS_OPTIONS, ...overrides };
  return new Promise((resolve) => {
    if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), Number(options.timeout) + 500);
    try {
      geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          const latitude = Number(pos?.coords?.latitude);
          const longitude = Number(pos?.coords?.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            finish(null);
            return;
          }
          if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            finish(null);
            return;
          }
          finish({ latitude, longitude, locationSource: 'gps' });
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        {
          enableHighAccuracy: false,
          timeout: options.timeout,
          maximumAge: options.maximumAge,
        }
      );
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}
