import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Mail, Lock, User, Phone, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type Mode = 'signin' | 'signup' | 'pending';

interface Props {
  onClose: () => void;
}

export default function AuthModal({ onClose }: Props) {
  const [mode,        setMode]        = useState<Mode>('signin');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [name,        setName]        = useState('');
  const [phone,       setPhone]       = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [errorMsg,    setErrorMsg]    = useState('');

  const clearError = () => setErrorMsg('');

  const handleSignIn = async () => {
    if (!email || !password) { setErrorMsg('Please enter your email and password.'); return; }
    setLoading(true);
    clearError();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (!data.user) throw new Error('Sign in failed — no user returned.');

      /* Check profile approval */
      const { data: prof } = await supabase
        .from('profiles').select('approved').eq('id', data.user.id).single();

      if (!prof?.approved) {
        setMode('pending');
        setLoading(false);
        return;
      }

      toast({ title: 'Welcome back!' });
      onClose();
      /* Auth state change in AuthContext handles the rest */
    } catch (err: any) {
      const msg = err.message || 'Sign in failed.';
      if (msg.includes('Invalid login credentials')) {
        setErrorMsg('Incorrect email or password. Please try again.');
      } else if (msg.includes('Email not confirmed')) {
        setErrorMsg('Please confirm your email before signing in.');
      } else {
        setErrorMsg(msg);
      }
    }
    setLoading(false);
  };

  const handleSignUp = async () => {
    if (!email || !password || !name) { setErrorMsg('Please fill in all required fields.'); return; }
    if (password.length < 6) { setErrorMsg('Password must be at least 6 characters.'); return; }
    setLoading(true);
    clearError();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name } },
      });
      if (error) throw error;
      if (!data.user) throw new Error('Sign up failed.');

      /* Create profile */
      await supabase.from('profiles').upsert({
        id:       data.user.id,
        email:    email.trim(),
        name,
        phone:    phone || null,
        approved: false,
      }, { onConflict: 'id' });

      setMode('pending');
    } catch (err: any) {
      const msg = err.message || 'Sign up failed.';
      if (msg.includes('already registered') || msg.includes('already exists')) {
        setErrorMsg('This email is already registered. Please sign in instead.');
      } else {
        setErrorMsg(msg);
      }
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      mode === 'signin' ? handleSignIn() : handleSignUp();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-border">
          <img src="/manav.jpg" alt="Manav"
            className="h-10 w-10 rounded-full object-cover ring-2 ring-primary shrink-0"
            style={{ objectPosition: 'center 20%' }} />
          <div>
            <div className="font-bold text-sm">SEO Season</div>
            <div className="text-xs text-muted-foreground">
              {mode === 'signup' ? 'Request Portal Access' : 'Client Portal Login'}
            </div>
          </div>
          <button onClick={onClose}
            className="ml-auto h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-secondary/50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Pending state */}
        {mode === 'pending' && (
          <div className="px-6 py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="h-7 w-7 text-yellow-400 animate-spin" />
            </div>
            <h3 className="font-bold text-lg mb-2">Access Pending</h3>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Your request has been submitted. Manav will review and activate your portal access shortly.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              You will receive access once approved. If you have already been approved, please sign in again.
            </p>
            <div className="space-y-2">
              <Button variant="outline" className="w-full border-border"
                onClick={() => { setMode('signin'); clearError(); }}>
                Back to Sign In
              </Button>
              <Button variant="ghost" className="w-full" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Sign In */}
        {mode === 'signin' && (
          <div className="px-6 py-6 space-y-4" onKeyDown={handleKeyDown}>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearError(); }}
                  className="pl-9 h-11 bg-background/60 border-border"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearError(); }}
                  className="pl-9 pr-10 h-11 bg-background/60 border-border"
                  autoComplete="current-password"
                />
                <button onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2.5">
                <p className="text-xs text-red-400 leading-relaxed">{errorMsg}</p>
              </div>
            )}

            <Button onClick={handleSignIn} disabled={loading} className="w-full h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In to Portal'}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              Don't have access?{' '}
              <button onClick={() => { setMode('signup'); clearError(); }}
                className="text-primary hover:underline font-medium">
                Request Access
              </button>
            </div>
          </div>
        )}

        {/* Sign Up */}
        {mode === 'signup' && (
          <div className="px-6 py-6 space-y-4" onKeyDown={handleKeyDown}>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Full Name *
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="John Smith" value={name}
                  onChange={e => { setName(e.target.value); clearError(); }}
                  className="pl-9 h-11 bg-background/60 border-border" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email *
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="email" placeholder="your@email.com" value={email}
                  onChange={e => { setEmail(e.target.value); clearError(); }}
                  className="pl-9 h-11 bg-background/60 border-border"
                  autoComplete="email" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Phone (optional)
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="+1 234 567 8900" value={phone}
                  onChange={e => { setPhone(e.target.value); clearError(); }}
                  className="pl-9 h-11 bg-background/60 border-border" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Password *
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type={showPass ? 'text' : 'password'}
                  placeholder="Min. 6 characters" value={password}
                  onChange={e => { setPassword(e.target.value); clearError(); }}
                  className="pl-9 pr-10 h-11 bg-background/60 border-border"
                  autoComplete="new-password" />
                <button onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2.5">
                <p className="text-xs text-red-400 leading-relaxed">{errorMsg}</p>
              </div>
            )}

            <Button onClick={handleSignUp} disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Request Portal Access'}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              Already have access?{' '}
              <button onClick={() => { setMode('signin'); clearError(); }}
                className="text-primary hover:underline font-medium">
                Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
