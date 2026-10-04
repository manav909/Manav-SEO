import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

/* Shown to someone who is signed in but isn't on the SEO Season team
   (or lacks the page a link sent them to). Friendly, with a way out. */
export default function NoAccess({ reason = 'team' }: { reason?: 'team' | 'page' }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">
          {reason === 'team' ? "You're signed in, but not on the team yet" : "This page isn't switched on for you"}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {reason === 'team'
            ? <>The account <b>{user?.email}</b> doesn't have team access. Ask your SEO Season admin to add you, then sign in again.</>
            : <>Ask your SEO Season admin to switch this page on for your account.</>}
        </p>
        <div className="flex justify-center gap-2">
          {reason === 'page' && <Button variant="outline" onClick={() => { window.location.href = '/'; }}>Go home</Button>}
          <Button onClick={async () => { await signOut(); window.location.href = '/'; }}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
