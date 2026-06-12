/* Build 12.53 — HoD Console: reporting on the Deal Workspace operation.
   KPIs, conversion funnel, earnings, by-industry / by-country, time-to-convert,
   hanging leads, API usage, and the captured learnings. Project-independent. */
import { useState, useEffect } from "react";
import PortalNav from "@/components/PortalNav";

async function post(action: string, body: any = {}) {
  const r = await fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  return r.json().catch(() => ({}));
}

const money = (n: number) => "$" + Number(n || 0).toLocaleString();

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Bars({ rows, color = "#6366f1", fmt }: { rows: Array<{ label: string; n: number; meta?: string }>; color?: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return (
    <div className="space-y-1.5">
      {rows.length === 0 && <p className="text-xs text-muted-foreground">No data yet.</p>}
      {rows.map((r, i) => (
        <div key={i} className="text-xs">
          <div className="flex justify-between mb-0.5"><span className="text-foreground truncate">{r.label}</span><span className="text-muted-foreground">{fmt ? fmt(r.n) : r.n}{r.meta ? ` · ${r.meta}` : ""}</span></div>
          <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.round((r.n / max) * 100)}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function Hod() {
  const [r, setR] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => { setLoading(true); setError(""); const res: any = await post("bd_hod_report", {}); setLoading(false); if (!res?.success) { setError(res?.error || "Could not load the report (is the bd_hod_learning migration run?)."); return; } setR(res.report); };
  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">HoD Console</h1>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/30">Refresh</button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Everything happening across your leads — what is converting, what is hanging, what made and lost money, and what the system is learning.</p>

        {error && <div className="rounded-xl border p-3 text-xs mb-4" style={{ color: "#ef4444", borderColor: "#ef444455", background: "#ef444411" }}>{error}</div>}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {r && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Kpi label="Total leads" value={String(r.total)} />
              <Kpi label="Active" value={String(r.active)} />
              <Kpi label="Win rate" value={`${r.winRate}%`} sub={`${r.won} won · ${r.lost} lost`} />
              <Kpi label="Earnings" value={money(r.earnings)} sub={`lost: ${money(r.lostValue)}`} />
              <Kpi label="Avg time to win" value={`${r.avgConvDays}d`} />
              <Kpi label="API calls" value={String(r.totalApi)} sub={`~${r.avgApi}/lead`} />
            </div>

            {/* win-rate meter */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Conversion health</div>
              <div className="h-3 rounded-full bg-muted overflow-hidden mb-1"><div className="h-full" style={{ width: `${r.winRate}%`, background: "linear-gradient(90deg,#6366f1,#10b981)" }} /></div>
              <div className="text-xs text-muted-foreground">{r.winRate}% of decided deals won · {money(r.earnings)} earned · {money(r.lostValue)} lost</div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pipeline funnel</div>
                <Bars rows={(r.funnel || []).map((f: any) => ({ label: f.stage, n: f.count }))} />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">By industry</div>
                <Bars rows={(r.byIndustry || []).map((x: any) => ({ label: x.key, n: x.count, meta: x.value ? money(x.value) : "" }))} color="#8b5cf6" />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Earnings by country (won)</div>
                <Bars rows={(r.byCountry || []).map((x: any) => ({ label: x.key, n: x.value || x.count, meta: `${x.count} deal(s)` }))} color="#10b981" fmt={money} />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Hanging leads (no activity 4+ days)</div>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {(r.hanging || []).length === 0 && <p className="text-xs text-muted-foreground">Nothing hanging — pipeline is fresh.</p>}
                  {(r.hanging || []).map((h: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs border-b border-border pb-1"><span className="text-foreground truncate">{h.client_name || "Untitled"}</span><span className="text-muted-foreground">{h.status} · {h.days}d</span></div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">What the system is learning</div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {(r.learnings || []).length === 0 && <p className="text-xs text-muted-foreground">No learnings yet — mark deals as won or lost to start building the system's DNA.</p>}
                {(r.learnings || []).map((l: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border p-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: l.outcome === "won" ? "#10b981" : "#ef4444", background: (l.outcome === "won" ? "#10b981" : "#ef4444") + "11", border: `1px solid ${(l.outcome === "won" ? "#10b981" : "#ef4444")}55` }}>{l.outcome}</span>
                      <span className="text-foreground font-semibold">{l.client_name || "—"}</span>
                      {l.industry && <span className="text-muted-foreground">· {l.industry}</span>}
                      {l.project_type && <span className="text-muted-foreground">· {l.project_type}</span>}
                      {l.deal_value ? <span className="text-muted-foreground">· {money(l.deal_value)}</span> : null}
                    </div>
                    {l.what_worked && <p className="text-muted-foreground"><span className="text-foreground">Worked:</span> {l.what_worked}</p>}
                    {l.what_failed && <p className="text-muted-foreground"><span className="text-foreground">Missed:</span> {l.what_failed}</p>}
                    {l.why && <p className="text-muted-foreground"><span className="text-foreground">Why:</span> {l.why}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
