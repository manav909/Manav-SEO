/**
 * PortalNav — Unified navigation for the entire SEO Season Empire
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth }    from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import {
  BarChart3, Crown, Sparkles, LogOut, Settings, Zap, Layers,
  Database, Activity, Brain, ChevronDown, Menu, X,
  BookOpenCheck, Rocket, MessageSquare, Users, Target,
  FileText, Search, Heart, Eye, Kanban, UserPlus,
  DollarSign, Bot, Palette, Map,
} from 'lucide-react';

interface Props {
  clientName?:        string;
  companyName?:       string;
  projects?:          any[];
  selectedProjectId?: string;
  onProjectChange?:   (id: string) => void;
}

const PRIMARY = [
  { href: '/oval',       label: 'The Oval',  icon: Crown,    desc: 'Presidential suite',   perm: 'hod_only' },
  { href: '/dashboard',  label: 'Dashboard', icon: BarChart3,desc: 'Overview & metrics',   perm: 'dashboard' },
  { href: '/playground', label: 'Canvas',    icon: Layers,   desc: 'Strategy & execution', perm: 'playground' },
  { href: '/audit',      label: 'Audit',     icon: Zap,      desc: 'SEO audit tool',       perm: 'audit_tools' },
];

const EMPIRE_SECTIONS = [
  {
    label: 'Intelligence',
    items: [
      { href: '/empire',          label: 'Empire Command',  icon: Crown,        desc: 'God view',           perm: 'dashboard' },
      { href: '/morning-brief',   label: 'Morning Brief',   icon: Sparkles,     desc: 'Daily briefing',     perm: 'morning_brief' },
      { href: '/mission-control', label: 'Mission Control', icon: Rocket,       desc: 'Pipeline overview',  perm: 'dashboard' },
      { href: '/health',          label: 'Client Health',   icon: Heart,        desc: 'Churn risk',         perm: 'dashboard' },
      { href: '/alerts',          label: 'Alert Center',    icon: Activity,     desc: 'Live monitoring',    perm: 'dashboard' },
      { href: '/ask',             label: 'Ask the Empire',  icon: Bot,          desc: 'AI intelligence',    perm: 'dashboard' },
    ]
  },
  {
    label: 'Brain & Learning',
    items: [
      { href: '/brain-command',   label: 'Brain Command',   icon: Brain,        desc: 'Learning velocity',  perm: 'brain_learning' },
      { href: '/brain-learning',  label: 'Brain Learning',  icon: BookOpenCheck,desc: 'Manage learnings',   perm: 'brain_learning' },
      { href: '/algorithm-intel', label: 'Algorithms',      icon: Search,       desc: 'Algorithm tracking', perm: 'algorithm_intel' },
      { href: '/llm-visibility',  label: 'LLM Visibility',  icon: Eye,          desc: 'AI citation',        perm: 'algorithm_intel' },
    ]
  },
  {
    label: 'Clients & Leads',
    items: [
      { href: '/client-comms',    label: 'Client Comms',    icon: MessageSquare,desc: 'Conversation',       perm: 'bde_panel' },
      { href: '/intake',          label: 'Lead Intake',     icon: Target,       desc: 'Capture leads',      perm: 'lead_intel' },
      { href: '/client-dashboard',label: 'Client Dashboard',icon: BarChart3,    desc: 'Client view',        perm: 'dashboard' },
      { href: '/reports',         label: 'Reports',         icon: FileText,     desc: 'Reports',            perm: 'data_room' },
    ]
  },
  {
    label: 'Delivery',
    items: [
      { href: '/kanban',          label: 'Kanban Board',    icon: Kanban,       desc: 'Task delivery',      perm: 'playground' },
      { href: '/pm',              label: 'Project Manager', icon: Layers,       desc: 'Plan, run & verify', perm: 'playground' },
      { href: '/brand-studio',    label: 'Brand Studio',    icon: Palette,      desc: 'Brand intelligence', perm: 'playground' },
      { href: '/content-hub',     label: 'Content Hub',     icon: FileText,     desc: 'Content briefs',     perm: 'playground' },
      { href: '/content-writer',  label: 'Content Writer',  icon: FileText,     desc: 'Writer dashboard',   perm: 'playground' },
      { href: '/launchpad',       label: 'Launchpad',       icon: Sparkles,     desc: 'Project launchpad',  perm: 'playground' },
    ]
  },
  {
    label: 'Team',
    items: [
      { href: '/staff-command',   label: 'Staff Command',   icon: Users,        desc: 'HOD panel',          perm: 'staff_command' },
      { href: '/admin?tab=staff', label: 'Staff & PM',      icon: UserPlus,     desc: 'Create PM logins',   perm: 'staff_command' },
      { href: '/bde-panel',       label: 'BDE Panel',       icon: Target,       desc: 'Fiverr tools',       perm: 'bde_panel' },
      { href: '/revenue',         label: 'Revenue BI',      icon: DollarSign,   desc: 'MRR & pipeline',     perm: 'dashboard' },
      { href: '/desk',            label: 'Brain Desk',      icon: Brain,        desc: 'Save learnings',     perm: 'brain_learning' },
    ]
  },
  {
    label: 'System',
    items: [
      { href: '/system-control',  label: 'System Control',  icon: Activity,     desc: 'System management',  perm: 'system_control' },
      { href: '/data-room',       label: 'Data Room',       icon: Database,     desc: 'Raw data',           perm: 'data_room' },
      { href: '/themes',          label: 'Themes',          icon: Palette,      desc: 'Environments',       perm: null },
      { href: '/tour',            label: 'Guided Tour',     icon: Map,          desc: 'Walkthrough',        perm: null },
    ]
  },
];

export default function PortalNav({ clientName, companyName, onProjectChange }: Props) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { staffPermissions, signOut } = useAuth();
  const { selectedProjectId, setSelectedProjectId, selectedProject, selectedClient } = useProject();
  const { projects } = useAuth();
  const safeProjects = (projects || []).filter((p: any) => p?.id);
  const path = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen,   setMoreOpen]   = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef   = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });

  // null staffPermissions = HOD/owner = sees everything
  const canAccess = (perm: string | null): boolean => {
    if (!staffPermissions) return true;           // owner
    if (perm === null) return true;               // always visible (themes, tour)
    if (perm === 'hod_only') return false;        // never visible to staff
    return staffPermissions[perm] === true;
  };

  const isActive = (href: string) => path === href || path.startsWith(href + '/');
  const activeEmpire = EMPIRE_SECTIONS.flatMap(s => s.items).find(l => isActive(l.href));
  const displayClient = selectedClient?.name || selectedClient?.company || clientName || companyName || '';

  // Calculate dropdown position from button so it always aligns correctly
  const openDropdown = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropPos({
        top:  rect.bottom + 8,
        left: Math.min(
          Math.max(rect.left + rect.width / 2 - 310, 8),
          window.innerWidth - 628
        ),
      });
    }
    setMoreOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
          && buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  return (
    <>
      <div className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 gap-4">

            {/* Brand */}
            <button onClick={() => navigate(staffPermissions ? '/bde-panel' : '/oval')}
              className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
              <div className="relative">
                <img src="/manav.jpg" alt="SEO Season"
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

            {/* Primary nav */}
            <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
              {PRIMARY.filter(item => canAccess(item.perm)).map(({ href, label, icon: Icon, desc }) => {
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

              {/* Empire dropdown trigger */}
              <button ref={buttonRef}
                onClick={() => moreOpen ? setMoreOpen(false) : openDropdown()}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 ${
                  activeEmpire || moreOpen
                    ? 'text-primary bg-primary/10 border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent'
                }`}>
                {activeEmpire
                  ? <><activeEmpire.icon className="h-3.5 w-3.5"/><span>{activeEmpire.label}</span></>
                  : <><Crown className="h-3.5 w-3.5"/><span>Empire</span></>
                }
                <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${moreOpen ? 'rotate-180' : ''}`}/>
              </button>
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-1 shrink-0">
              {safeProjects.length > 0 && (
                <div className="hidden lg:flex flex-col items-end">
                  <select
                    value={selectedProjectId}
                    onChange={e => { setSelectedProjectId(e.target.value); onProjectChange?.(e.target.value); }}
                    className="h-8 rounded-lg border border-border bg-background/60 text-xs px-2.5 max-w-[160px] outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer">
                    {safeProjects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button onClick={() => navigate('/admin')} title="Admin"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button onClick={async () => { await signOut(); navigate('/'); }} title="Sign Out"
                className="h-8 rounded-lg px-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
              <button onClick={() => setMobileOpen(o => !o)}
                className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                {mobileOpen ? <X className="h-4 w-4"/> : <Menu className="h-4 w-4"/>}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-card max-h-[85vh] overflow-y-auto">
            <div className="px-4 py-3 space-y-1">
              {safeProjects.length > 0 && (
                <select value={selectedProjectId}
                  onChange={e => { setSelectedProjectId(e.target.value); onProjectChange?.(e.target.value); }}
                  className="w-full h-9 rounded-xl border border-border bg-background/60 text-sm px-3 mb-3 outline-none">
                  {safeProjects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <div className="text-xs font-bold text-muted-foreground/40 uppercase tracking-widest px-2 pb-1">Core</div>
              {PRIMARY.filter(item => canAccess(item.perm)).map(({ href, label, icon: Icon }) => (
                <button key={href} onClick={() => { navigate(href); setMobileOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive(href) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  }`}>
                  <Icon className="h-4 w-4 shrink-0"/>{label}
                </button>
              ))}
              {EMPIRE_SECTIONS.map(section => {
                const visible = section.items.filter(item => canAccess(item.perm));
                if (!visible.length) return null;
                return (
                  <div key={section.label}>
                    <div className="text-xs font-bold text-muted-foreground/40 uppercase tracking-widest px-2 pt-3 pb-1">{section.label}</div>
                    {visible.map(({ href, label, icon: Icon }) => (
                      <button key={href} onClick={() => { navigate(href); setMobileOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                          isActive(href) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                        }`}>
                        <Icon className="h-4 w-4 shrink-0"/>{label}
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="border-t border-border/50 mt-3 pt-3">
                <button onClick={async () => { await signOut(); navigate('/'); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                  <LogOut className="h-4 w-4"/>Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Empire dropdown — rendered outside nav stacking context via portal-style fixed positioning */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setMoreOpen(false)} style={{background:'transparent'}}/>
          <div
            ref={dropdownRef}
            className="w-[620px] max-h-[72vh] overflow-y-auto rounded-2xl border border-border shadow-2xl p-3"
            style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 999,
              backgroundColor: 'hsl(var(--card))',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px hsl(var(--border))' }}>
            <div className="grid grid-cols-3 gap-2">
              {EMPIRE_SECTIONS.map(section => {
                const visible = section.items.filter(item => canAccess(item.perm));
                if (!visible.length) return null;
                return (
                  <div key={section.label}>
                    <div className="px-2 py-1 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mb-1">
                      {section.label}
                    </div>
                    {visible.map(({ href, label, icon: Icon }) => {
                      const active = isActive(href);
                      return (
                        <button key={href}
                          onClick={() => { navigate(href); setMoreOpen(false); }}
                          className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors text-xs ${
                            active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                          }`}>
                          <Icon className="h-3.5 w-3.5 shrink-0"/>
                          <span className="font-medium">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
