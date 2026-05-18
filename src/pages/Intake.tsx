import React, { useState } from "react";
import PortalNav from "@/components/PortalNav";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a, ...b }) })
    .then(r => r.json()).catch(() => ({}));

export default function Intake() {
  const [url, setUrl]     = useState("");
  const [email, setEmail] = useState("");
  const [name, setName]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [step, setStep] = useState<"url"|"email"|"done">("url");

  const analyse = async () => {
    if (!url) return;
    setLoading(true);
    const r = await post("instant_audit_showcase", { url });
    setResult(r);
    setStep("email");
    setLoading(false);
  };

  const submit = async () => {
    if (!email) return;
    setLoading(true);
    await post("capture_lead", { url, email, name, source: "intake", auditResult: result });
    setStep("done");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PortalNav />
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="text-4xl mb-4">🎯</div>
          <h1 className="text-3xl font-bold mb-3">Is your website invisible to AI?</h1>
          <p className="text-muted-foreground leading-relaxed">
            Free instant audit — see exactly how ChatGPT, Perplexity and Claude find (or miss) your business.
          </p>
        </div>
        {step === "url" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <label className="text-sm font-medium block mb-2">Your website URL</label>
            <div className="flex gap-3">
              <input value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && analyse()}
                placeholder="yourdomain.com"
                className="flex-1 h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:ring-1 focus:ring-primary/50" />
              <button onClick={analyse} disabled={loading || !url}
                className="px-6 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90">
                {loading ? "Analysing..." : "Analyse →"}
              </button>
            </div>
          </div>
        )}
        {step === "email" && result && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="text-xs font-bold text-primary uppercase tracking-widest mb-3">Quick Audit Results</div>
              {result.score !== undefined && (
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-3xl font-bold font-mono text-primary">{result.score}</div>
                  <div className="text-sm text-muted-foreground">/ 100 AI Visibility Score</div>
                </div>
              )}
              {result.issues?.slice(0, 3).map((issue: string, i: number) => (
                <div key={i} className="text-sm text-muted-foreground flex gap-2 mb-1">
                  <span className="text-red-400">•</span>{issue}
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-sm font-semibold mb-4">Get your full report — free</div>
              <div className="space-y-3">
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:ring-1 focus:ring-primary/50" />
                <input value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" type="email"
                  className="w-full h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none focus:ring-1 focus:ring-primary/50" />
                <button onClick={submit} disabled={loading || !email}
                  className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:opacity-90">
                  {loading ? "Sending..." : "Get Full Report →"}
                </button>
              </div>
            </div>
          </div>
        )}
        {step === "done" && (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-10 text-center">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-xl font-bold mb-2">Report sent!</div>
            <p className="text-muted-foreground text-sm">Check your inbox. Our team will follow up with a personalised strategy.</p>
          </div>
        )}
      </div>
    </div>
  );
}
