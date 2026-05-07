import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import { SeoEngine } from '@/components/SeoEngine';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Star, TrendingUp, Brain, ShieldCheck,
  CheckCircle, Globe, BarChart3, Zap, ArrowRight,
  Lock, LogOut
} from 'lucide-react';

export default function Index() {
  const navigate = useNavigate();
  const { user, isApproved, authChecked, loading, signOut } = useAuth();
  const [showModal, setShowModal] = useState(false);

  /* Redirect approved users straight to dashboard */
  useEffect(() => {
    if (authChecked && !loading && user && isApproved) {
      navigate('/dashboard');
    }
  }, [authChecked, loading, user, isApproved, navigate]);

  const handleSignInClick = () => {
    if (user && isApproved) { navigate('/dashboard'); return; }
    setShowModal(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">

      {showModal && <AuthModal onClose={() => setShowModal(false)} />}

      {/* NAV */}
      <nav className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav"
              className="h-9 w-9 rounded-full object-cover ring-2 ring-primary"
              style={{ objectPosition: 'center 20%' }} />
            <div>
              <div className="font-bold text-sm">SEO Season</div>
              <div className="text-xs text-muted-foreground">by Manav</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && isApproved ? (
              <>
                <Button size="sm" onClick={() => navigate('/dashboard')}
                  className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-xs">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" />My Dashboard
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/launchpad')}
                  className="border-border text-xs">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />Launchpad
                </Button>
                <Button size="sm" variant="ghost"
                  onClick={async () => { await signOut(); }}
                  className="text-xs text-muted-foreground">
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handleSignInClick}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-xs">
                Client Portal
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 py-20 sm:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              AI-Native SEO · Fiverr Top Rated · 500+ Brands Grown
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              I'm Manav. I architect the{' '}
              <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                end-to-end digital growth
              </span>{' '}
              for brands that can't afford to fail.
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Strategy is expensive. Guessing is even costlier.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg"
                onClick={handleSignInClick}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold h-12 px-8">
                {user && isApproved ? 'Go to Dashboard' : 'Access Client Portal'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="border-y border-border bg-card/40 py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
            {[
              { icon: Star,        text: 'Fiverr Top Rated Seller' },
              { icon: CheckCircle, text: '500+ SEO Audits Delivered' },
              { icon: Brain,       text: 'AI-Native SEO Methodology' },
              { icon: Globe,       text: 'Clients Across 30+ Countries' },
              { icon: ShieldCheck, text: 'Validation-First Approach' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BRAND IMAGE STRIP */}
      <section className="relative overflow-hidden">
        <div className="relative h-64 sm:h-80">
          <img src="/manavseo.png" alt="Manav SEO"
            className="w-full h-full object-cover object-center opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-background/20" />
          <div className="absolute inset-0 flex items-center px-8 sm:px-16">
            <div className="max-w-lg">
              <p className="text-2xl sm:text-3xl font-bold leading-snug text-foreground mb-3">
                "I don't do vanity SEO. I build search authority that compounds."
              </p>
              <p className="text-muted-foreground text-sm">— Manav, SEO Season</p>
            </div>
          </div>
        </div>
      </section>

      {/* SEO TOOL */}
      <section className="py-16 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 mb-4">
              <Zap className="h-3 w-3" />Free SEO Audit Tool
            </div>
            <h2 className="text-3xl font-bold mb-3">See Where You Stand in 60 Seconds</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Get a professional SEO audit powered by the same AI framework I use for every client.
              No fluff. Just the truth about your search visibility.
            </p>
          </div>

          {/* Lock overlay for non-approved users */}
          <div className="relative">
            <SeoEngine />
            {(!user || !isApproved) && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10">
                <div className="text-center p-8">
                  <div className="h-14 w-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                    <Lock className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Client Portal Access Required</h3>
                  <p className="text-muted-foreground text-sm mb-5 max-w-xs mx-auto">
                    The full audit tool is available to active clients. Sign in or request portal access below.
                  </p>
                  <Button onClick={handleSignInClick}
                    className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
                    <ArrowRight className="h-4 w-4 mr-2" />Access Portal
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* WHY MANAV */}
      <section className="py-16 border-t border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-xs font-mono text-primary uppercase tracking-wider mb-3">Why SEO Season</div>
              <h2 className="text-3xl font-bold mb-4">
                Most SEO agencies sell you reports. I sell you results.
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                The SEO industry is broken. Agencies charge thousands for dashboards full of vanity metrics while your competitors quietly steal your market share. I built SEO Season to be different — every strategy is validated before we scale it, every rupee is protected before we invest it.
              </p>
              <div className="space-y-3">
                {[
                  { icon: Brain,       text: 'AI-first methodology built for the era of ChatGPT, Perplexity, and Google AI Overviews' },
                  { icon: ShieldCheck, text: 'Validation before execution — we test before we spend' },
                  { icon: TrendingUp,  text: 'Transparent dashboards that show real data, not agency spin' },
                  { icon: Star,        text: 'Fiverr Top Rated with 500+ five-star audits delivered' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-3">
                    <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Brands Grown',       value: '500+',   color: 'text-primary' },
                { label: 'Avg Ranking Lift',    value: '↑ 40%',  color: 'text-green-400' },
                { label: 'AI Citations Added',  value: '10x',    color: 'text-purple-400' },
                { label: 'Client Retention',    value: '94%',    color: 'text-yellow-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-2xl border border-border bg-card/60 p-5 text-center">
                  <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 border-t border-border">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Stop Guessing?</h2>
          <p className="text-muted-foreground mb-8">
            Join brands that are winning in AI-native search. Your growth dashboard is waiting.
          </p>
          <Button size="lg" onClick={handleSignInClick}
            className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold h-12 px-10">
            {user && isApproved ? 'Go to My Dashboard' : 'Request Client Portal Access'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/manav.jpg" alt="Manav"
              className="h-8 w-8 rounded-full object-cover ring-2 ring-primary"
              style={{ objectPosition: 'center 20%' }} />
            <div>
              <div className="font-bold text-sm">SEO Season by Manav</div>
              <div className="text-xs text-muted-foreground">I Don't Do Vanity SEO</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Star className="h-3 w-3 text-primary" />Fiverr Top Rated</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-primary" />All data private</span>
            <span className="flex items-center gap-1.5"><Globe className="h-3 w-3 text-primary" />AI-Native SEO</span>
          </div>
          <div className="text-xs text-muted-foreground">© 2026 SEO Season</div>
        </div>
      </footer>

    </div>
  );
}
