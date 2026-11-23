/* A thin guide under the top menu (Simple and Advanced modes):
   where you are, what this tool is for, the steps, the next tool in the same workspace,
   and, for a tool that does the same job as another, a pointer to the one we keep. */
import { useState } from 'react';
import { WORKSPACES, ADVANCED_GROUPS } from '@/lib/workspaces';
import { ChevronDown, X, ArrowRight } from 'lucide-react';

const allTools = [...WORKSPACES.flatMap(w => w.tools), ...ADVANCED_GROUPS.flatMap(g => g.tools)];
const byLabel = (l: string) => allTools.find(t => t.label.toLowerCase() === l.trim().toLowerCase());

export default function ToolGuide({ path, navigate }: { path: string; navigate: (to: string) => void }) {
  const ws = WORKSPACES.find(w => w.tools.some(t => t.href === path));
  const tool = ws ? ws.tools.find(t => t.href === path) : undefined;
  const grp = !ws ? ADVANCED_GROUPS.find(g => g.tools.some(t => t.href.split('?')[0] === path)) : undefined;
  const adv = grp ? grp.tools.find(t => t.href.split('?')[0] === path) : undefined;
  const key = 'ss.guide.' + path;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === 'hide'; } catch { return false; } });
  const [open, setOpen] = useState(false);
  if (!tool && !adv) return null;

  const keep = adv?.overlaps ? byLabel(adv.overlaps.split(',')[0]) : undefined;
  const idx = ws && tool ? ws.tools.indexOf(tool) : -1;
  const next = ws && idx >= 0 ? ws.tools[idx + 1] : undefined;

  if (hidden) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-2">
        <button onClick={() => { setHidden(false); try { localStorage.removeItem(key); } catch { /* ignore */ } }}
          className="text-[11px] text-muted-foreground hover:text-primary">Show the guide for this page</button>
      </div>
    );
  }
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3">
      <div className="rounded-xl border border-border bg-card/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              <button className="hover:text-primary" onClick={() => navigate(ws ? '/start/' + ws.id : '/start')}>{ws ? ws.name : grp?.name}</button>
              <span className="mx-1.5">›</span>{(tool || adv)!.label}
            </div>
            <p className="text-sm mt-1 text-foreground">{(tool || adv)!.what}</p>
            {keep && keep.href !== path && (
              <p className="text-sm mt-2 text-amber-500">
                This does the same job as <b>{keep.label}</b>, which is the one we are keeping.{' '}
                <button onClick={() => navigate(keep.href)} className="underline font-semibold">Open {keep.label}</button>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {tool?.steps && (
              <button onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-primary px-2 py-1 rounded-md hover:bg-primary/10 inline-flex items-center gap-1">
                How to use it <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
            <button aria-label="Hide the guide" onClick={() => { setHidden(true); try { localStorage.setItem(key, 'hide'); } catch { /* ignore */ } }}
              className="p-1 rounded-md text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {open && tool?.steps && (
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {tool.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm"><span className="h-5 w-5 shrink-0 rounded-full bg-primary/15 text-primary text-[11px] font-bold grid place-items-center">{i + 1}</span><span>{s}</span></li>
            ))}
          </ol>
        )}
        {next && (
          <div className="mt-2 text-xs text-muted-foreground">
            Next in {ws!.name}:{' '}
            <button onClick={() => navigate(next.href)} className="text-primary font-semibold inline-flex items-center gap-1 hover:underline">{next.label} <ArrowRight className="h-3 w-3" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
