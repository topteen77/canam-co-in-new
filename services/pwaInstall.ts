interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<Listener>();

const notify = () => {
  listeners.forEach((listener) => listener());
};

export const isStandaloneApp = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.includes('android-app://')
  );
};

const isIosDevice = () => {
  const ua = navigator.userAgent;
  const classic = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return (classic || iPadOs) && !(window as Window & { MSStream?: unknown }).MSStream;
};

const isInAppBrowser = () =>
  /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|GSA\/|wv\)/i.test(navigator.userAgent);

const canUseIosHomeScreen = () =>
  isIosDevice() &&
  !isInAppBrowser() &&
  !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(navigator.userAgent) &&
  typeof navigator.share === 'function';

const manualInstallHint = () => {
  const ua = navigator.userAgent;
  if (isIosDevice() && isInAppBrowser()) {
    return 'Open this page in Safari, tap Share, then tap Add to Home Screen.';
  }
  if (isIosDevice()) {
    return 'Tap Share, then tap Add to Home Screen, then tap Add.';
  }
  if (/Android/i.test(ua)) {
    return 'Open the browser menu and tap Install app or Add to Home screen.';
  }
  return 'In Chrome or Edge, use the install icon in the address bar, or open the browser menu and choose Install Canam CRM.';
};

export const initPwaInstall = () => {
  if (started || typeof window === 'undefined') return;
  started = true;
  installed = isStandaloneApp();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (isIosDevice()) return;
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
};

export const subscribePwaInstall = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isAppInstalled = () => installed || isStandaloneApp();

export const startPwaInstall = async (): Promise<{ ok: boolean; message?: string }> => {
  if (isAppInstalled()) {
    installed = true;
    notify();
    return { ok: true, message: 'Canam CRM is already installed on this device.' };
  }

  if (canUseIosHomeScreen()) {
    try {
      await navigator.share({
        title: 'Canam CRM',
        url: `${window.location.origin}/`,
      });
      return { ok: true, message: 'In the share menu, tap Add to Home Screen, then tap Add.' };
    } catch {
      return { ok: false, message: 'Tap Share, then tap Add to Home Screen, then tap Add.' };
    }
  }

  if (deferredPrompt) {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice.outcome === 'accepted') {
        installed = true;
        notify();
        return { ok: true, message: 'Canam CRM is installing.' };
      }
      notify();
      return { ok: false };
    } catch {
      deferredPrompt = null;
      notify();
      return { ok: false, message: manualInstallHint() };
    }
  }

  return { ok: false, message: manualInstallHint() };
};

if (typeof window !== 'undefined') {
  initPwaInstall();
}
