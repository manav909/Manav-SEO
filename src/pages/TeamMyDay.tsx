/* Team → My day. One calm list of what needs a person today — replies,
   offers, orders due, payments to chase — then the good part: kind words
   from clients and the wins the team helped make. */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageSquare, FileText, Clock, Wallet, Heart, Trophy, CheckCircle2 } from 'lucide-react';
import PortalNav from '@/components/PortalNav';
import { useAuth } from '@/contexts/AuthContext';

async function engine(body: object) {
  const r = await fetch('/api/task-engine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ success: false }));
}
const usd = (c: number) => `$${(c / 100).toLocaleString('en-US')}`;
const ago = (iso: string) => {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export default function TeamMyDay() {
  const { profile, user } = useAuth();
  const [data, setData] = useState<any | null>(null);
  useEffect(() => { engine({ action: 'cps_my_day' }).then(setData); }, []);
  const first = String((profile as any)?.name || user?.email || '').split(/[\s@]/)[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const t = data?.todo;
  const count = t ? t.replies.length + t.offers.length + t.ordersDue.length + t.awaitingPayment.length : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold">{hello}{first ? `, ${first}` : ''}</h1>
          <p className="text-sm text-muted-foreground">{!data ? 'Getting your day ready…' : count ? `${count} thing${count > 1 ? 's' : ''} need${count > 1 ? '' : 's'} you today. Small steps — one at a time.` : 'Nothing waiting on you right now. Nice work.'}</p>
        </div>

        {!data && <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {data && !data.success && <div className="rounded-xl border border-border p-4 text-sm">My day couldn't load. Try again in a moment.</div>}

        {t && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card icon={MessageSquare} title="Clients waiting for a reply" to="/team/inbox" empty="No one is waiting.">
              {t.replies.map((m: any) => <Row key={m.project_id} main={m.projectName} sub={`“${String(m.body).slice(0, 80)}”`} side={ago(m.created_at)} />)}
            </Card>
            <Card icon={FileText} title="Offers to confirm" to="/team/offers" empty="No offers to check.">
              {t.offers.map((o: any) => <Row key={o.id} main={o.projectName} sub={`Asked ${ago(o.created_at)}`} side={usd(o.total_cents)} />)}
            </Card>
            <Card icon={Clock} title="Orders due in the next 3 days" to="/team/offers" empty="Nothing due soon.">
              {t.ordersDue.map((o: any) => <Row key={o.id} main={o.name} sub={`${o.projectName}${o.assignee ? ` · ${o.assignee}` : ''}`} side={o.due_date} />)}
            </Card>
            <Card icon={Wallet} title="Waiting for payment" to="/team/offers" empty="All paid up.">
              {t.awaitingPayment.map((o: any) => <Row key={o.id} main={o.name} sub={o.projectName} side="" />)}
            </Card>
          </div>
        )}

        {data?.success && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card icon={Heart} title="Kind words from clients" empty="Thank-yous from clients will show up here.">
              {data.kindWords.map((k: any, i: number) => <Row key={i} main={`“${k.text}”`} sub={`${k.projectName} · ${k.about}`} side={ago(k.at)} />)}
            </Card>
            <Card icon={Trophy} title="Wins you helped make (last 2 weeks)" empty="New wins appear here each morning.">
              {data.wins.map((w: any) => <Row key={w.id} main={w.title} sub={w.projectName} side={ago(w.happened_at)} />)}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon: Icon, title, to, empty, children }: { icon: any; title: string; to?: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-semibold text-sm"><Icon className="h-4 w-4 text-primary" />{title}{items.length > 0 && <span className="text-xs rounded-full bg-primary/15 text-primary px-2">{items.length}</span>}</div>
        {to && items.length > 0 && <Link to={to} className="text-xs text-primary hover:underline">Open</Link>}
      </div>
      {items.length ? <div className="divide-y divide-border">{items}</div>
        : <div className="text-sm text-muted-foreground flex items-center gap-2 py-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{empty}</div>}
    </section>
  );
}

function Row({ main, sub, side }: { main: string; sub?: string; side?: string }) {
  return (
    <div className="py-2 flex justify-between gap-3">
      <div className="min-w-0"><div className="text-sm truncate">{main}</div>{sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}</div>
      {side && <div className="text-xs text-muted-foreground shrink-0">{side}</div>}
    </div>
  );
}
