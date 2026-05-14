/**
 * ErrorBoundary — outer app safety net
 *
 * FIX: "Reload App" previously did window.location.href = '/'
 * which navigated to the root URL and destroyed session state.
 * Now resets error state in-place — React re-renders from current route.
 * Only falls back to window.location.reload() if React state reset fails.
 */
import React from 'react';

interface Props { children: React.ReactNode }
interface State { hasError: boolean; error: string }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary] App crash:', error, info);
  }

  handleReset = () => {
    // Reset in-place — preserves React tree and session state
    this.setState({ hasError: false, error: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md text-center rounded-2xl border border-border bg-card/60 p-10">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-6 font-mono break-all">
            {this.state.error}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary/40"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
