import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart3, Sparkles, LogOut, Settings } from 'lucide-react';

export default function PortalNav({ company }: { company?: string }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { signOut, user } = useAuth();
  const path = location.pathname;

  const links = [
    { href: '/dashboard', label: 'Dashboard',  icon: BarChart3 },
    { href: '/launchpad',  label: 'Launchpad',  icon: Sparkles },
  ];

  return (
    <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <img src="/manav.jpg" alt="Manav"
            className="h-8 w-8 rounded-full object-cover ring-2 ring-primary shrink-0"
            style={{ objectPosition: 'center 20%' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div>
            <div className="font-bold text-sm">SEO Season</div>
            {company && <div className="text-xs text-muted-foreground">{company}</div>}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = path === href;
            return (
              <button key={href} onClick={() => navigate(href)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary/15 text-primary border border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
                }`}>
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {user?.email?.includes('manav') && (
            <button onClick={() => navigate('/admin')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all border border-transparent">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}
          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all border border-transparent">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
