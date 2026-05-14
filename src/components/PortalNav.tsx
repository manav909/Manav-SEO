/**
 * PortalNav — App navigation bar
 *
 * Project selection is now global via ProjectContext.
 * All pages share the same selected project — navigating between pages
 * never resets project selection.
 *
 * Legacy props (selectedProjectId, onProjectChange, projects) are accepted
 * for backwards compatibility but ProjectContext takes precedence.
 */
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth }    from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import {
  BarChart3, Sparkles, LogOut, Settings, Zap, Layers,
  Database, Activity, Brain, ChevronDown, Menu, X,
  BookOpenCheck, Rocket,
} from 'lucide-react';

/* Legacy prop interface — accepted but ProjectContext overrides */
interface Props {
  clientName?:        string;
  companyName?:       string;
  projects?:          any[];          /* ignored — ProjectContext provides this */
  selectedProjectId?: string;         /* ignored — ProjectContext provides this */
  onProjectChange?:   (id: string) => void; /* called for backwards compat only */
}

const PRIMARY = [
  { href: '/dashboard',  label: 'Dashboard', icon: BarChart3, desc: 'Overview & metrics'    },
  { href: '/playground', label: 'Canvas',     icon: Layers,   desc: 'Strategy & execution'  },
  { href: '/data-room',  label: 'Data Room',  icon: Database, desc: 'Client knowledge base' },
  { href: '/audit',      label: 'Audit',      icon: Zap,      desc: 'SEO audit tool'        },
];

const SECONDARY = [
  { href: '/mission-control', label: 'Mission Control', icon: Rocket,        desc: 'Project intelligence cockpit'  },
  { href: '/launchpad',       label: 'Launchpad',       icon: Sparkles,      desc: 'Project setup wizard'         },
  { href: '/algorithm-intel', label: 'Algorithms',      icon: Brain,         desc: 'Algorithm intelligence'       },
  { href: '/brain-learning',  label: 'Brain Learning',  icon: BookOpenCheck, desc: 'Manav Brain skill & memory'   },
  { href: '/desk',            label: 'Brain Desk',      icon: BookOpenCheck, desc: 'Saved by Manav Brain'         },
  { href: '/brain-command',   label: 'Brain Command',   icon: BookOpenCheck, desc: 'Automation mission control'   },
  { href: '/system-control',  label: 'Control',         icon: Activity,      desc: 'System control & tasks'      },
];

export default function PortalNav({
  clientName, companyName, onProjectChange,
}: Props) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { signOut } = useAuth();

  /* ProjectContext is the global source of truth */
  const { selectedProjectId, setSelectedProjectId, selectedProject, selectedClient } = useProject();
  const { projects } = useAuth();
  const safeProjects = (projects || []).filter((p: any) => p != null && p.id != null);

  const path = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen,   setMoreOpen]   = useState(false);

  const isActive = (href: string) => path === href;
  const activeSecondary = SECONDARY.find(l => isActive(l.href));

  /* Display name: prefer project → selectedClient → props */
  const displayClient = selectedClient?.name || selectedClient?.company
    || clientName || companyName || '';
  const displayProject = selectedProject?.name || '';

  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id);
    onProjectChange?.(id);   /* call legacy handler if provided */
  };

  return (
    <>
      <div className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 gap-4">

            {/* Brand */}
            <button onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
              <div className="relative">
                <img src="/manav.jpg" alt="Manav"
                  className="h-8 w-8 rounded-full object-cover ring-2 ring-primary/60 shrink-0"
                  style={{ objectPosition: 'center 20%' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-card"/>
              </div>
              <div className="hidden sm:block text-left">
                <div className="font-bold text-sm leading-tight tracking-tight">SEO Season</div>
                {displayClient && (
                  <div className="text-xs text-muted-foreground truncate max-w-[140px] leading-tight">
                    {displayClient}
                  </div>
                )}
              </div>
            </button>

            {/* Primary nav — desktop */}
            <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
              {PRIMARY.map(({ href, label, icon: Icon, desc }) => {
                const active = isActive(href);
                return (
                  <button key={href} onClick={() => navigate(href)} title={desc}
                    className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    }`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}

              <div className="w-px h-5 bg-border mx-2 shrink-0"/>

              {/* More dropdown */}
              <div className="relative">
                <button onClick={() => setMoreOpen(o => !o)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    activeSecondary || moreOpen
                      ? 'text-primary bg-primary/10 border border-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent'
                  }`}>
                  {activeSecondary ? (
                    <>
                      <activeSecondary.icon className="h-3.5 w-3.5"/>
                      <span>{activeSecondary.label}</span>
                    </>
                  ) : (
                    <span>More</span>
                  )}
                  <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${moreOpen ? 'rotate-180' : ''}`}/>
                </button>

                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)}/>
                    <div className="absolute top-full left-0 mt-2 w-60 rounded-2xl border border-border bg-card shadow-xl shadow-black/10 overflow-hidden z-20 py-1.5">
                      <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground/50 uppercase tracking-wider">Tools</div>
                      {SECONDARY.map(({ href, label, icon: Icon, desc }) => {
                        const active = isActive(href);
                        const isMC = href === '/mission-control';
                        return (
                          <button key={href}
                            onClick={() => { navigate(href); setMoreOpen(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                              active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                            }`}>
                            <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                              active ? 'bg-primary/20' : isMC ? 'bg-amber-500/10' : 'bg-secondary/60'
                            }`}>
                              <Icon className={`h-3.5 w-3.5 ${isMC && !active ? 'text-amber-500/70' : ''}`}/>
                            </div>
                            <div className="min-w-0">
                              <div className={`text-xs font-medium leading-tight ${isMC && !active ? 'text-amber-500/80' : ''}`}>{label}</div>
                              <div className="text-xs text-muted-foreground/50 leading-tight truncate">{desc}</div>
                            </div>
                            {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shrink-0"/>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Global project selector — always visible if multiple projects */}
              {safeProjects.length > 0 && (
                <div className="hidden lg:flex flex-col items-end">
                  <select
                    value={selectedProjectId}
                    onChange={e => handleProjectChange(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background/60 text-xs px-2.5 max-w-[160px] outline-none focus:border-primary/50 cursor-pointer"
                  >
                    {safeProjects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {displayProject && (
                    <div className="text-[9px] text-muted-foreground/40 leading-tight px-1 mt-0.5 truncate max-w-[160px]">
                      active project
                    </div>
                  )}
                </div>
              )}

              {/* Mission Control shortcut */}
              <button onClick={() => navigate('/mission-control')} title="Mission Control"
                className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                  isActive('/mission-control')
                    ? 'text-amber-500 bg-amber-500/10'
                    : 'text-muted-foreground hover:text-amber-500/70 hover:bg-amber-500/10'
                }`}>
                <Rocket className="h-3.5 w-3.5" />
              </button>

              <button onClick={() => navigate('/admin')} title="Admin"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
                <Settings className="h-3.5 w-3.5" />
              </button>

              <button onClick={async () => { await signOut(); navigate('/'); }} title="Sign Out"
                className="h-8 rounded-lg px-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/20 transition-all">
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Sign out</span>
              </button>

              {/* Mobile toggle */}
              <button onClick={() => setMobileOpen(o => !o)}
                className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
                {mobileOpen ? <X className="h-4 w-4"/> : <Menu className="h-4 w-4"/>}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-card/95 backdrop-blur-md">
            <div className="px-4 py-3 space-y-1">
              {/* Mobile project selector */}
              {safeProjects.length > 0 && (
                <select
                  value={selectedProjectId}
                  onChange={e => handleProjectChange(e.target.value)}
                  className="w-full h-9 rounded-xl border border-border bg-background/60 text-sm px-3 mb-2 outline-none"
                >
                  {safeProjects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <div className="text-xs font-semibold text-muted-foreground/40 uppercase tracking-wider px-2 pb-1">Core</div>
              {PRIMARY.map(({ href, label, icon: Icon }) => (
                <button key={href} onClick={() => { navigate(href); setMobileOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive(href) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}>
                  <Icon className="h-4 w-4 shrink-0"/>{label}
                </button>
              ))}
              <div className="text-xs font-semibold text-muted-foreground/40 uppercase tracking-wider px-2 pt-3 pb-1">Tools</div>
              {SECONDARY.map(({ href, label, icon: Icon }) => (
                <button key={href} onClick={() => { navigate(href); setMobileOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive(href) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}>
                  <Icon className="h-4 w-4 shrink-0"/>{label}
                </button>
              ))}
              <div className="border-t border-border/50 mt-2 pt-2 space-y-1">
                <button onClick={() => { navigate('/admin'); setMobileOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50">
                  <Settings className="h-4 w-4"/>Admin
                </button>
                <button onClick={async () => { await signOut(); navigate('/'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-400/10">
                  <LogOut className="h-4 w-4"/>Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
