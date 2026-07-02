import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import PortalNav from "@/components/PortalNav";

/* ────────────────────────────────────────────────────────────────
   Cost Control — live LLM spend from the usage ledger.
   Reads activity_log rows written by logLlmUsage (source "llm_usage"),
   aggregates real cost / tokens / latency by purpose, and runs the
   what-if savings levers on the ACTUAL usage rather than placeholders.
──────────────────────────────────────────────────────────────── */

interface LedgerTech {
  purpose?: string | null;
  model?: string;
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  total_input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  latency_ms?: number | null;
  from_cache?: boolean;
}
interface Row { created_at: string; project_id: string | null; technical: LedgerTech; }

// USD per 1M tokens — mirrors api/lib/llm-usage.ts
const RATE = {
  sonnet: { in: 3, out: 15, cacheIn: 0.30 },
  haiku:  { in: 1, out: 5,  cacheIn: 0.10 },
};
const isHaiku = (m?: string) => /haiku/i.test(m || "");

const money = (n: number) =>
  n >= 1000 ? "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  : n >= 1 ? "$" + n.toFixed(2)
  : "$" + n.toFixed(n >= 0.01 ? 3 : 4);
const compact = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : "" + Math.round(n);

export default function CostControl() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [haiku, setHaiku] = useState(40);  // % of Sonnet calls safe to downgrade
  const [cache, setCache] = useState(50);  // % of input tokens served from cache
  const [dedup, setDedup] = useState(20);  // % of calls that repeat and can be cached

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - days * 864e5).toISOString();
      const { data, error } = await supabase
        .from("activity_log")
        .select("created_at, project_id, technical")
        .eq("source", "llm_usage")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(8000);
      if (!alive) return;
      if (error) { setRows([]); setLoading(false); return; }
      setRows((data || []) as Row[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [days]);

  const agg = useMemo(() => {
    let cost = 0, calls = 0, inTok = 0, outTok = 0, latSum = 0, latN = 0;
    let sIn = 0, sOut = 0, hIn = 0, hOut = 0;                 // by model, for what-if
    const byPurpose: Record<string, { cost: number; calls: number; lat: number; latN: number }> = {};
    const byDay: Record<string, number> = {};
    for (const r of rows) {
      const t = r.technical || {};
      const c = Number(t.cost_usd || 0);
      const ti = Number(t.total_input_tokens ?? t.input_tokens ?? 0);
      const to = Number(t.output_tokens || 0);
      cost += c; calls += 1; inTok += ti; outTok += to;
      if (t.latency_ms != null) { latSum += Number(t.latency_ms); latN += 1; }
      const p = t.purpose || "unknown";
      (byPurpose[p] ||= { cost: 0, calls: 0, lat: 0, latN: 0 });
      byPurpose[p].cost += c; byPurpose[p].calls += 1;
      if (t.latency_ms != null) { byPurpose[p].lat += Number(t.latency_ms); byPurpose[p].latN += 1; }
      const day = (r.created_at || "").slice(0, 10);
      byDay[day] = (byDay[day] || 0) + c;
      if (isHaiku(t.model)) { hIn += ti; hOut += to; } else { sIn += ti; sOut += to; }
    }
    const purposes = Object.entries(byPurpose)
      .map(([k, v]) => ({ purpose: k, ...v, avgLat: v.latN ? v.lat / v.latN : 0 }))
      .sort((a, b) => b.cost - a.cost);
    const daySeries = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
    return { cost, calls, inTok, outTok, avgLat: latN ? latSum / latN : 0, sIn, sOut, hIn, hOut, purposes, daySeries };
  }, [rows]);

  // what-if on REAL token sums
  const whatif = useMemo(() => {
    const h = haiku / 100, c = cache / 100, d = dedup / 100;
    const inFactor = (rate: { in: number; cacheIn: number }) => ((1 - c) * rate.in + c * rate.cacheIn) / 1e6;
    const optimized = (1 - d) * (
      agg.sIn * (1 - h) * inFactor(RATE.sonnet) + agg.sOut * (1 - h) * RATE.sonnet.out / 1e6 +   // sonnet kept
      agg.sIn * h * inFactor(RATE.haiku) + agg.sOut * h * RATE.haiku.out / 1e6 +                  // sonnet -> haiku
      agg.hIn * inFactor(RATE.haiku) + agg.hOut * RATE.haiku.out / 1e6                            // already haiku
    );
    const current = agg.cost;
    const perDayCur = current / days, perDayOpt = optimized / days;
    return {
      current, optimized,
      saved: current - optimized,
      pct: current > 0 ? (current - optimized) / current * 100 : 0,
      monthCur: perDayCur * 30, monthOpt: perDayOpt * 30, monthSaved: (perDayCur - perDayOpt) * 30,
    };
  }, [agg, haiku, cache, dedup, days]);

  const maxDay = Math.max(1, ...agg.daySeries.map(([, v]) => v));
  const maxPurpose = Math.max(1, ...agg.purposes.map(p => p.cost));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav companyName="Cost Control — LLM Spend" />
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">LLM Spend &amp; Efficiency</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live from the usage ledger. Every metered call logs cost, tokens, latency and purpose.
            </p>
          </div>
          <div className="flex gap-1.5">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition ${days === d ? "bg-indigo-500/15 border-indigo-500/50 text-indigo-300" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-muted-foreground text-sm py-20 text-center">Loading ledger…</div>
        ) : agg.calls === 0 ? (
          <div className="border border-border rounded-xl p-8 text-center">
            <div className="text-lg font-semibold mb-2">No usage logged yet in this window</div>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Spend appears here as metered calls run. Metering currently covers the season chat, vault,
              bd-strategist, workspace steps, prospect audit, discovery, reports and cluster-map. As more
              engines are wired to the ledger, they appear automatically.
            </p>
          </div>
        ) : (
          <>
            {/* headline */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { k: `Spend · last ${days}d`, v: money(agg.cost), u: `${compact(agg.calls)} calls` },
                { k: "Avg cost / call", v: money(agg.calls ? agg.cost / agg.calls : 0), u: `${compact(agg.inTok)} in · ${compact(agg.outTok)} out` },
                { k: "Avg latency", v: `${(agg.avgLat / 1000).toFixed(1)}s`, u: "per call" },
                { k: "Projected / month", v: money(agg.cost / days * 30), u: "at this run-rate" },
              ].map((s, i) => (
                <div key={i} className="border border-border rounded-xl p-4 bg-card">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
                  <div className="text-2xl font-bold mt-1 font-mono">{s.v}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono">{s.u}</div>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* spend by purpose */}
              <div className="border border-border rounded-xl p-5 bg-card">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Spend by purpose</div>
                <div className="space-y-2.5">
                  {agg.purposes.slice(0, 12).map(p => (
                    <div key={p.purpose}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-mono truncate mr-2">{p.purpose}</span>
                        <span className="font-mono text-muted-foreground whitespace-nowrap">
                          {money(p.cost)} · {p.calls} · {(p.avgLat / 1000).toFixed(1)}s
                        </span>
                      </div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-indigo-500/70 rounded" style={{ width: `${p.cost / maxPurpose * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* daily trend */}
              <div className="border border-border rounded-xl p-5 bg-card">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Daily spend</div>
                <div className="flex items-end gap-1 h-40">
                  {agg.daySeries.map(([day, v]) => (
                    <div key={day} className="flex-1 flex flex-col items-center justify-end group relative" title={`${day}: ${money(v)}`}>
                      <div className="w-full bg-indigo-500/60 group-hover:bg-indigo-400 rounded-t transition" style={{ height: `${v / maxDay * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-2 font-mono">
                  <span>{agg.daySeries[0]?.[0]}</span>
                  <span>{agg.daySeries[agg.daySeries.length - 1]?.[0]}</span>
                </div>
              </div>
            </div>

            {/* what-if */}
            <div className="border border-border rounded-xl p-5 bg-card">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">What-if · savings on your real usage</div>
              <p className="text-xs text-muted-foreground mb-4">Levers applied to the actual tokens above, extrapolated to a month.</p>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {[
                    { label: "Simple calls → Haiku", val: haiku, set: setHaiku, hint: "classify / extract / route calls, safe to downgrade" },
                    { label: "Prompt-cache hit on input", val: cache, set: setCache, hint: "input served from cache at 0.1x" },
                    { label: "Response-cache / dedup", val: dedup, set: setDedup, hint: "duplicate calls eliminated" },
                  ].map((s, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{s.label}</span><span className="font-mono text-indigo-300">{s.val}%</span>
                      </div>
                      <input type="range" min={0} max={100} value={s.val}
                        onChange={e => s.set(+e.target.value)} className="w-full accent-indigo-500" />
                      <div className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 content-start">
                  <div className="border border-border rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current / mo</div>
                    <div className="text-xl font-bold font-mono text-red-400 mt-1">{money(whatif.monthCur)}</div>
                  </div>
                  <div className="border border-border rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Optimised / mo</div>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{money(whatif.monthOpt)}</div>
                  </div>
                  <div className="border border-border rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Saved</div>
                    <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{whatif.pct.toFixed(0)}%</div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{money(whatif.monthSaved)}/mo</div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Rates: Sonnet $3/$15, Haiku $1/$5 per 1M tokens, cache read 0.1x — matches api/lib/llm-usage.ts.
              Percentages are exact; dollar totals reflect only metered engines.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
