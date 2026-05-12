/**
 * BrainErrorBoundary — React class component that catches render errors
 * and dispatches them to Manav Brain for self-healing.
 *
 * Shows a Hollywood-grade "MANAV BRAIN HEALING" screen instead of a crash.
 * Auto-retries after the brain resolves the issue.
 */
import React from 'react';

interface Props {
  children:   React.ReactNode;
  routeName?: string; // optional label for better error context
}

interface State {
  hasError:   boolean;
  error:      Error | null;
  retryCount: number;
}

export class BrainErrorBoundary extends React.Component<Props, State> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  state: State = { hasError: false, error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Dispatch to Manav Brain via CustomEvent — picked up by ManavBrainAssistant
    window.dispatchEvent(new CustomEvent('manav-brain-error', {
      detail: {
        type:       'react_error',
        message:    `React render crash: ${error.message}`,
        stack:      error.stack?.slice(0, 800),
        url:        window.location.pathname,
        component:  info.componentStack?.split('\n').find(l => l.includes('at '))?.trim()?.slice(0, 80),
        route:      this.props.routeName || window.location.pathname,
      },
    }));

    // Log to console for debugging (not overridden at class component level)
    console.warn('[BrainErrorBoundary] Caught React error:', error.message);
    console.warn('[BrainErrorBoundary] Component stack:', info.componentStack?.slice(0, 300));
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  handleRetry = () => {
    this.setState(s => ({ hasError: false, error: null, retryCount: s.retryCount + 1 }));
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const err     = this.state.error;
    const errMsg  = err?.message || 'An unexpected error occurred';
    const route   = this.props.routeName || window.location.pathname;

    return (
      <div style={{
        minHeight:   '100vh',
        background:  '#030712',
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'center',
        padding:     24,
        fontFamily:  'monospace',
        color:       '#f1f5f9',
        position:    'relative',
        overflow:    'hidden',
      }}>
        {/* Background grid */}
        <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0.05,pointerEvents:'none'}}>
          <defs><pattern id="errGrid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#ef4444" strokeWidth="0.5"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#errGrid)"/>
        </svg>

        {/* Scan overlay */}
        <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.08) 2px,rgba(0,0,0,0.08) 4px)'}}/>

        {/* Radial glow */}
        <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(239,68,68,0.07) 0%, transparent 70%)',pointerEvents:'none'}}/>

        <div style={{
          position:  'relative',
          maxWidth:  540,
          width:     '100%',
          textAlign: 'center',
          zIndex:    1,
        }}>
          {/* Animated brain icon */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg,#450a0a,#1f0505)',
            border: '1px solid rgba(239,68,68,0.4)',
            boxShadow: '0 0 40px rgba(239,68,68,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            animation: 'errPulse 1.5s ease-in-out infinite',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="1.5" strokeLinecap="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-3.95A3 3 0 0 1 3 12a3 3 0 0 1 2.3-2.9 2.5 2.5 0 0 1 4.2-1.1z"/>
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-3.95A3 3 0 0 0 21 12a3 3 0 0 0-2.3-2.9 2.5 2.5 0 0 0-4.2-1.1z"/>
            </svg>
          </div>

          {/* Status line */}
          <div style={{fontSize:9,color:'rgba(239,68,68,0.7)',letterSpacing:'0.3em',marginBottom:12,textTransform:'uppercase'}}>
            ◈ MANAV BRAIN — ANOMALY DETECTED ◈
          </div>

          {/* Main title */}
          <h1 style={{
            fontSize: 26, fontWeight: 900, margin: '0 0 8px',
            background: 'linear-gradient(135deg,#ef4444,#fca5a5)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.01em', lineHeight: 1.1,
          }}>
            RENDER FAILURE
          </h1>

          <div style={{fontSize:11,color:'rgba(255,255,255,0.3)',marginBottom:24,letterSpacing:'0.1em'}}>
            ROUTE: {route.toUpperCase()}
          </div>

          {/* Error card */}
          <div style={{
            background: 'rgba(239,68,68,0.05)',
            border:     '1px solid rgba(239,68,68,0.18)',
            borderRadius: 12,
            padding:    '14px 18px',
            marginBottom: 20,
            textAlign:  'left',
          }}>
            <div style={{fontSize:9,color:'rgba(239,68,68,0.6)',marginBottom:6,letterSpacing:'0.1em'}}>ERROR SIGNATURE</div>
            <p style={{fontSize:11,color:'rgba(255,255,255,0.55)',lineHeight:1.6,margin:0,wordBreak:'break-word'}}>
              {errMsg.slice(0, 180)}{errMsg.length > 180 ? '...' : ''}
            </p>
          </div>

          {/* Healing status */}
          <div style={{
            background:   'rgba(6,182,212,0.06)',
            border:       '1px solid rgba(6,182,212,0.15)',
            borderRadius: 10,
            padding:      '10px 14px',
            marginBottom: 24,
            display:      'flex',
            alignItems:   'center',
            gap:          10,
          }}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'#06b6d4',boxShadow:'0 0 8px rgba(6,182,212,0.6)',flexShrink:0,animation:'errPulse 1.5s ease-in-out infinite'}}/>
            <div style={{textAlign:'left'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#67e8f9',marginBottom:2}}>MANAV BRAIN IS ANALYZING THIS ERROR</div>
              <div style={{fontSize:9,color:'rgba(255,255,255,0.25)'}}>Error dispatched to Brain Assistant — check the floating widget for diagnosis and fix</div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
            <button onClick={this.handleRetry} style={{
              background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(79,70,229,0.15))',
              border:     '1px solid rgba(99,102,241,0.35)',
              borderRadius:10, padding:'9px 20px', cursor:'pointer',
              color:'#a5b4fc', fontSize:10, fontWeight:700, letterSpacing:'0.08em',
            }}>
              ↺ RETRY PAGE
            </button>
            <button onClick={this.handleGoHome} style={{
              background: 'rgba(255,255,255,0.04)',
              border:     '1px solid rgba(255,255,255,0.1)',
              borderRadius:10, padding:'9px 20px', cursor:'pointer',
              color:'rgba(255,255,255,0.4)', fontSize:10, fontWeight:700, letterSpacing:'0.08em',
            }}>
              ⌂ RETURN TO DASHBOARD
            </button>
          </div>

          {this.state.retryCount > 0 && (
            <div style={{marginTop:14,fontSize:9,color:'rgba(239,68,68,0.5)'}}>
              {this.state.retryCount} retry attempt{this.state.retryCount > 1 ? 's' : ''} — check the Brain widget for the root cause
            </div>
          )}
        </div>

        <style>{`
          @keyframes errPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(0.96); } }
        `}</style>
      </div>
    );
  }
}

export default BrainErrorBoundary;
