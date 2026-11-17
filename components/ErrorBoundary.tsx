import React, { ErrorInfo, ReactNode } from 'react';
import { CrashScreen, type CrashDetails, formatCrashReport } from './CrashScreen';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback. Prefer letting CrashScreen render for admin debugging. */
  fallback?: ReactNode;
  onBack?: () => void;
  /** Soft label shown above the error (e.g. "Leads view"). */
  label?: string;
  /** When true, keep a smaller in-page panel instead of a tall full-area screen. */
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  time: string;
}

function persistCrash(details: CrashDetails) {
  try {
    sessionStorage.setItem('crm_last_crash', JSON.stringify({
      ...details,
      report: formatCrashReport(details),
    }));
  } catch {
    // ignore quota / private mode
  }
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    componentStack: '',
    time: '',
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      time: new Date().toISOString(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    try {
      const splash = document.getElementById('app-splash');
      if (splash) {
        splash.classList.add('is-done');
        splash.remove();
      }
    } catch {
      // ignore
    }
    const componentStack = errorInfo?.componentStack || '';
    this.setState({ componentStack });
    const details: CrashDetails = {
      title: this.props.label ? `${this.props.label} crashed` : 'Application error',
      name: error?.name || 'Error',
      message: error?.message || String(error),
      stack: error?.stack || '',
      componentStack,
      source: this.props.label || 'React ErrorBoundary',
      url: typeof window !== 'undefined' ? window.location.href : '',
      time: this.state.time || new Date().toISOString(),
    };
    persistCrash(details);
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  private reset = () => {
    this.setState({ hasError: false, error: null, componentStack: '', time: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const details: CrashDetails = {
        title: this.props.label ? `${this.props.label} crashed` : 'Application error',
        name: this.state.error?.name || 'Error',
        message: this.state.error?.message || 'Unknown error',
        stack: this.state.error?.stack || '',
        componentStack: this.state.componentStack,
        source: this.props.label || 'React ErrorBoundary',
        url: typeof window !== 'undefined' ? window.location.href : '',
        time: this.state.time || new Date().toISOString(),
      };

      return (
        <CrashScreen
          details={details}
          compact={this.props.compact}
          onRetry={this.reset}
          onBack={this.props.onBack
            ? () => {
                this.reset();
                this.props.onBack?.();
              }
            : undefined}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
