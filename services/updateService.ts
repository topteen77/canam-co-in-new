const RELOAD_FLAG = 'crm_reloading_for_update';
const KNOWN_BUILD = 'crmKnownBuild';

class UpdateService {
  private static instance: UpdateService;
  private currentBuild = '';
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private isUpdateInProgress = false;
  private justReloaded = false;

  private constructor() {
    this.justReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
    if (this.justReloaded) {
      sessionStorage.removeItem(RELOAD_FLAG);
      setTimeout(() => {
        this.justReloaded = false;
      }, 15000);
    }
    this.currentBuild = localStorage.getItem(KNOWN_BUILD) || '';
    this.initializeServiceWorker();
    this.startPeriodicUpdateCheck();
    this.bindVisibilityCheck();
  }

  public static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  private bindVisibilityCheck(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.checkForUpdates();
    });
    window.addEventListener('focus', () => this.checkForUpdates());
  }

  private async initializeServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.watchRegistration(registration);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.justReloaded) return;
        this.reloadOnce();
      });
      await this.checkForUpdates();
    } catch (error) {
      console.warn('Service worker update setup failed:', error);
    }
  }

  private watchRegistration(registration: ServiceWorkerRegistration): void {
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
          this.isUpdateInProgress = true;
        }
      });
    };
    track(registration.installing);
    registration.addEventListener('updatefound', () => track(registration.installing));
  }

  private startPeriodicUpdateCheck(): void {
    if (this.updateTimer) clearInterval(this.updateTimer);
    this.updateTimer = setInterval(() => this.checkForUpdates(), 60 * 1000);
  }

  private async checkForUpdates(): Promise<void> {
    if (this.isUpdateInProgress || this.justReloaded) return;
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
        const waiting = registration?.waiting;
        if (waiting) {
          waiting.postMessage({ type: 'SKIP_WAITING' });
          this.isUpdateInProgress = true;
        }
      }

      const remoteBuild = await this.getRemoteBuild();
      if (!remoteBuild) return;
      if (!this.currentBuild) {
        this.currentBuild = remoteBuild;
        localStorage.setItem(KNOWN_BUILD, remoteBuild);
        return;
      }
      if (remoteBuild !== this.currentBuild) {
        this.currentBuild = remoteBuild;
        localStorage.setItem(KNOWN_BUILD, remoteBuild);
        await this.applyUpdate();
      }
    } catch (error) {
      console.warn('Update check failed:', error);
    }
  }

  private async getRemoteBuild(): Promise<string | null> {
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) return null;
      const info = await response.json();
      return String(info.buildNumber || info.buildTime || info.version || '');
    } catch {
      return null;
    }
  }

  public async applyUpdate(): Promise<void> {
    if (this.isUpdateInProgress && sessionStorage.getItem(RELOAD_FLAG) === '1') return;
    this.isUpdateInProgress = true;
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }
      this.reloadOnce();
    } catch (error) {
      console.error('Update failed:', error);
      this.isUpdateInProgress = false;
    }
  }

  private reloadOnce(): void {
    if (sessionStorage.getItem(RELOAD_FLAG) === '1') return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    window.location.reload();
  }

  public async checkForUpdatesOnLogin(): Promise<void> {
    await this.checkForUpdates();
  }

  public async handleLogout(): Promise<void> {
    await this.checkForUpdates();
  }

  public stopUpdateChecks(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  public getCurrentVersion(): string {
    return this.currentBuild;
  }
}

if (typeof window !== 'undefined') {
  (window as any).updateService = UpdateService.getInstance();
}

export default UpdateService;
