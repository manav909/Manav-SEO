import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart3, Sparkles, LogOut, Settings, Home, Zap, Layers } from 'lucide-react';

interface Props {
  clientName?:        string;
  companyName?:       string;
  projects?:          any[];
  selectedProjectId?: string;
  onProjectChange?:   (id: string) => void;
}

export default function PortalNav({
  clientName, companyName,
  projects = [], selectedProjectId, onProjectChange,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const path = location.pathname;

 const links = [
    { href: '/dashboard',   label: 'Dashboard',  icon: BarChart3 },
    { href: '/launchpad',   label: 'Launchpad',  icon: Sparkles  },
    { href: '/audit',       label: 'Audit Tool', icon: Zap       },
    { href: '/playground',  label: 'Playground', icon: Layers    },
  ];

  return (
    <div className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">

        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <img src="/manav.jpg" alt="Manav"
            className="h-8 w-8 rounded-full object-cover ring-2 ring-primary shrink-0"
            style={{ objectPosition: 'center 20%' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="hidden sm:block">
            <div className="font-bold text-sm leading-tight">SEO Season</div>
            {(companyName || clientName) && (
              <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                {companyName || clientName}
              </div>
            )}
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = path === href;
            return (
              <button key={href} onClick={() => navigate(href)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                  active
                    ? 'bg-primary/15 text-primary border-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border-transparent'
                }`}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          {projects.length > 1 && onProjectChange && (
            <select
              value={selectedProjectId || ''}
              onChange={e => onProjectChange(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background/60 text-xs px-2 max-w-[140px] hidden md:block"
            >
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          <button onClick={() => navigate('/admin')}
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
            title="Admin Panel">
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Admin</span>
          </button>

          <button onClick={() => navigate('/')}
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
            title="Home">
            <Home className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={async () => { await signOut(); navigate('/'); }}
            className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all"
            title="Sign Out">
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
