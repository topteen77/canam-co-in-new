import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const isStandaloneApp = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
  document.referrer.includes('android-app://');

const isIosDevice = () => {
  const ua = navigator.userAgent;
  const classic = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return (classic || iPadOs) && !(window as Window & { MSStream?: unknown }).MSStream;
};

const isInAppBrowser = () =>
  /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|GSA\/|wv\)/i.test(navigator.userAgent);

const isIosSafari = () =>
  isIosDevice() &&
  !isInAppBrowser() &&
  !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(navigator.userAgent);

const canUseIosHomeScreen = () =>
  isIosSafari() && typeof navigator.share === 'function';

const ShareIcon = () => (
  <svg className="h-4 w-4 shrink-0 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12v8h8v-8M12 4v12M8.5 7.5 12 4l3.5 3.5" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1" />
  </svg>
);

const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isStandaloneApp()) {
      setIsInstalled(true);
      return;
    }

    const iosHomeScreen = canUseIosHomeScreen();
    setIosMode(iosHomeScreen);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // iPhone/iPad only support Add to Home Screen in Safari, not Chrome install.
      if (isIosDevice()) return;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIosMode(false);
      if (!sessionStorage.getItem('pwa-prompt-dismissed')) {
        setShowInstallPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // iPhone/iPad Safari can add to Home Screen. Other browsers stay hidden
    // unless they fire beforeinstallprompt (Chrome/Edge/Android).
    if (iosHomeScreen && !sessionStorage.getItem('pwa-prompt-dismissed')) {
      const timer = window.setTimeout(() => setShowInstallPrompt(true), 800);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const dismiss = () => {
    setShowInstallPrompt(false);
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  const handleInstallClick = async () => {
    if (iosMode && canUseIosHomeScreen()) {
      try {
        await navigator.share({
          title: 'Canam CRM',
          url: `${window.location.origin}/`,
        });
      } catch {
        // User closed the share sheet.
      }
      return;
    }

    if (!deferredPrompt) {
      setShowInstallPrompt(false);
      return;
    }

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch {
      setShowInstallPrompt(false);
    }
  };

  if (isInstalled || !showInstallPrompt || (!iosMode && !deferredPrompt)) {
    return null;
  }

  const title = iosMode ? 'Add to Home Screen' : 'Install Canam CRM';
  const actionLabel = iosMode ? 'Add to Home Screen' : 'Install App';

  return (
    <div className="fixed inset-x-4 z-50 bottom-[max(1rem,env(safe-area-inset-bottom))] md:inset-x-auto md:right-4 md:max-w-sm">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <img
            src="/canam-crm-favicon.png"
            alt=""
            className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {iosMode
                ? 'Tap Add to Home Screen to open the iPhone share menu, then choose Add to Home Screen.'
                : 'Install the app for faster access from your home screen.'}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="app-icon-btn -mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {iosMode && (
          <ol className="mt-3 space-y-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 font-semibold text-slate-500">1.</span>
              <span className="flex items-center gap-1.5">
                Tap the button below to open <ShareIcon /> Share
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 font-semibold text-slate-500">2.</span>
              <span>Tap <strong>Add to Home Screen</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 font-semibold text-slate-500">3.</span>
              <span>Tap <strong>Add</strong></span>
            </li>
          </ol>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleInstallClick}
            className="min-h-[44px] w-full rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {actionLabel}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-[44px] w-full rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
