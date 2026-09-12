const DEVICE_KEY = 'crmDeviceId';

export interface DeviceFingerprint {
  deviceId: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'unknown';
  deviceName: string;
  userAgent: string;
}

function fnv1a(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hardwareSignature(): string {
  if (typeof navigator === 'undefined' || typeof screen === 'undefined') return 'unknown';
  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  })();
  return [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    (navigator.languages || []).join(','),
    String(screen.width || 0),
    String(screen.height || 0),
    String(screen.colorDepth || 0),
    String(screen.pixelDepth || 0),
    String(window.devicePixelRatio || 1),
    timezone,
    String(navigator.hardwareConcurrency || 0),
    String((navigator as any).deviceMemory || 0),
    String(navigator.maxTouchPoints || 0),
    String((navigator as any).vendor || ''),
  ].join('|');
}

/** Stable device id from browser/hardware signals. No random UUID. */
export function getActualDeviceId(): string {
  const signature = hardwareSignature();
  return `dev-${fnv1a(signature)}-${fnv1a(signature.split('').reverse().join(''))}`;
}

function detectDeviceType(ua: string): DeviceFingerprint['deviceType'] {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectDeviceName(ua: string, deviceType: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac OS|Macintosh/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return deviceType || 'Unknown device';
}

export function getSessionEnvironment(): 'local' | 'production' {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname || '';
    if (/canam\.co\.in$/i.test(host) && host !== 'localhost') return 'production';
    if (host === '127.0.0.1' || host === 'localhost' || host.startsWith('10.') || host.startsWith('192.168.')) {
      return 'local';
    }
  }
  const viteEnv = String((typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_ENV) || (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE) || '').toLowerCase();
  if (viteEnv === 'production') return 'production';
  return 'local';
}

export function getDeviceFingerprint(): DeviceFingerprint {
  if (typeof window === 'undefined') {
    return { deviceId: 'server', deviceType: 'unknown', deviceName: 'Unknown', userAgent: '' };
  }
  const deviceId = getActualDeviceId();
  try {
    localStorage.setItem(DEVICE_KEY, deviceId);
  } catch {
    // ignore
  }
  const userAgent = navigator.userAgent || '';
  const deviceType = detectDeviceType(userAgent);
  return {
    deviceId,
    deviceType,
    deviceName: detectDeviceName(userAgent, deviceType),
    userAgent,
  };
}
