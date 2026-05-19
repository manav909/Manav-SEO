import { useState } from "react";
import { useNavigate } from "react-router-dom";

const post = (a: string, b: any = {}) =>
  fetch("/api/task-engine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: a, ...b }),
  }).then(r => r.json()).catch(() => ({}));

export default function Intake() {
  const [url,     setUrl]     = useState("");
  const [email,   setEmail]   = useState("");
  const [name,    setName]    = useState("");
  const [result,  setResult]  = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [step,    setStep]    = useState<"url"|"email"|"done">("url");
  const [error,   setError]   = useState("");
  const navigate = useNavigate();

  const runAudit = async () => {
    if (!url.trim()) return;
    setLoading(true); setError("");
    const r = await post("instant_audit_showcase", { url: url.trim() });
    setResult(r.auditResult || r.result || r);
    setLoading(false);
    setStep("email");
  };

  const submit = async () => {
    if (!email.trim()) { setError("Email is required"); return; }
    setLoading(true);
    await post("capture_lead", {
      url, email: email.trim(), name: name.trim(),
      source: "intake", auditResult: result,
    });
    setLoading(false);
    setStep("done");
  };

  const issues: string[] = result?.issues || result?.missingBasics || result?.instant_audit?.missingBasics || [];
  const score: number | null = result?.score ?? result?.instant_audit?.lead_score ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🎯</div>
          <h1 className="text-2xl font-bold mb-2">Free Instant SEO Audit</h1>
          <p className="text-sm text-muted-foreground">
            See exactly how ChatGPT, Perplexity, and Google find your business.
          </p>
        </div>

        {step === "url" && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Your website URL</label>
              <input
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary transition-colors"
                placeholder="yourwebsite.com"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runAudit()}
                autoFocus
              />
            </div>
            <button
              onClick={runAudit}
              disabled={loading || !url.trim()}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Analysing your site…" : "Run Free Audit →"}
            </button>
          </div>
        )}

        {step === "email" && (
          <div className="space-y-4">
            {/* Audit results */}
            {(score !== null || issues.length > 0) && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Audit: {url}</span>
                  {score !== null && (
                    <span className={`text-sm font-bold ${score >= 70 ? "text-red-400" : score >= 50 ? "text-yellow-400" : "text-green-400"}`}>
                      {score}/100 issues found
                    </span>
                  )}
                </div>
                {issues.length > 0 && (
                  <ul className="space-y-1.5">
                    {issues.slice(0, 5).map((issue: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="text-red-400 mt-0.5 shrink-0">●</span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
                {issues.length === 0 && (
                  <p className="text-xs text-green-400">No major issues detected — enter your email for the full competitive analysis.</p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Your name (optional)</label>
              <input
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary transition-colors"
                placeholder="John Smith"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Email — we'll send your full report here</label>
              <input
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary transition-colors"
                placeholder="you@yourcompany.com"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={submit}
              disabled={loading || !email.trim()}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "Sending your report…" : "Get Full Report →"}
            </button>
            <button onClick={() => setStep("url")} className="w-full text-xs text-muted-foreground hover:text-foreground py-1">
              ← Try a different URL
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="text-center space-y-4">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-bold">Report on its way!</h2>
            <p className="text-sm text-muted-foreground">
              Check <strong>{email}</strong> — your full SEO audit and personalised recommendations will arrive shortly.
            </p>
            <button onClick={() => { setStep("url"); setUrl(""); setEmail(""); setName(""); setResult(null); }}
              className="text-xs text-muted-foreground hover:text-foreground">
              Submit another site →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
