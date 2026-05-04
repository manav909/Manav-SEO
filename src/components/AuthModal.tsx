import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { X, Sparkles, Lock, Mail, Phone, User, ArrowRight, CheckCircle } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'pending';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: () => void;
}

export const AuthModal = ({ onClose, onAuthenticated }: AuthModalProps) => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      toast({ title: 'Missing fields', description: 'Please enter your email and password.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      // Step 1 — Sign in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (!signInData.user) throw new Error('No user returned');

      // Step 2 — Check approval with user id directly
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', signInData.user.id)
        .maybeSingle();

      // If profile doesn't exist yet, treat as pending
      if (profileError) {
        console.error('Profile error:', profileError);
        setMode('pending');
        setLoading(false);
        return;
      }

      if (profile?.approved === true) {
        toast({ title: '✅ Welcome back!', description: 'Access granted.' });
        onAuthenticated();
        onClose();
      } else {
        // Not approved yet — show pending screen
        setMode('pending');
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      toast({
        title: 'Sign in failed',
        description: err?.message ?? 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password || !phone || !name) {
      toast({ title: 'Missing fields', description: 'Please fill in all fields.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { phone, name }
        }
      });
      if (error) throw error;
      setMode('pending');
    } catch (err: any) {
      toast({ title: 'Sign up failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden">

        {/* Top gradient line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-sm">SEO Seasons</div>
              <div className="text-xs text-muted-foreground">by Manav</div>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-6">

          {/* PENDING STATE */}
          {mode === 'pending' && (
            <div className="text-center py-6">
              <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">Request Received!</h2>
              <p className="text-muted-foreground text-sm mb-4 leading-relaxed">
                Your access request has been submitted. Manav reviews all requests personally and will approve your account within <span className="text-primary font-semibold">24 hours</span>.
              </p>
              <div className="rounded-xl border border-border bg-secondary/30 p-4 text-left mb-4">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">What happens next</div>
                {[
                  'You\'ll receive an email when approved',
                  'Sign in with your credentials',
                  'Full access to all 4 SEO agents',
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
              <Button onClick={onClose} variant="outline" className="w-full border-border">
                Got it, I'll wait
              </Button>
            </div>
          )}

          {/* SIGN IN */}
          {mode === 'signin' && (
            <>
              <div className="mb-5">
                <h2 className="text-xl font-bold mb-1">Welcome back</h2>
                <p className="text-sm text-muted-foreground">Sign in to access your SEO audit tool</p>
              </div>

              <div className="space-y-3 mb-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-9 h-11 bg-background/60 border-border"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSignIn()}
                      className="pl-9 h-11 bg-background/60 border-border"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSignIn}
                disabled={loading}
                className="w-full h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold mb-4"
              >
                {loading ? 'Signing in...' : (
                  <span className="flex items-center gap-2">
                    Sign In <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Need access?{' '}
                <button onClick={() => setMode('signup')} className="text-primary hover:underline font-medium">
                  Request it here
                </button>
              </p>
            </>
          )}

          {/* SIGN UP / REQUEST ACCESS */}
          {mode === 'signup' && (
            <>
              <div className="mb-5">
                <h2 className="text-xl font-bold mb-1">Request Access</h2>
                <p className="text-sm text-muted-foreground">Submit your details — Manav approves all requests personally</p>
              </div>

              <div className="space-y-3 mb-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Your name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="pl-9 h-11 bg-background/60 border-border"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-9 h-11 bg-background/60 border-border"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone / WhatsApp</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="pl-9 h-11 bg-background/60 border-border"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Create a password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-9 h-11 bg-background/60 border-border"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSignUp}
                disabled={loading}
                className="w-full h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold mb-4"
              >
                {loading ? 'Submitting...' : (
                  <span className="flex items-center gap-2">
                    Request Access <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have access?{' '}
                <button onClick={() => setMode('signin')} className="text-primary hover:underline font-medium">
                  Sign in
                </button>
              </p>
            </>
          )}

        </div>
      </div>
    </div>
  );
};
