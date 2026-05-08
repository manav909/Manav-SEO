import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Check, Copy, Download, FileDown,
  Loader2, Sparkles, Wrench, FileText, Megaphone, Bot,
  Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { DELIVERABLES, LOADING_STEPS, type DeliverableType } from '@/lib/seoGenerator';
import jsPDF from 'jspdf';

const ICONS: Record<DeliverableType, typeof Wrench> = {
  Technical:  Wrench,
  'On-Page':  FileText,
  'Off-Page': Megaphone,
  GEO:        Bot,
};

interface SeoEngineProps {
  projectId?:      string;
  defaultUrl?:     string;
  defaultKeyword?: string;
  allKeywords?:    string[];
}

export const SeoEngine = ({
  projectId,
  defaultUrl     = '',
  defaultKeyword = '',
  allKeywords    = [],
}: SeoEngineProps = {}) => {
  const [url,          setUrl]          = useState(defaultUrl);
  const [keyword,      setKeyword]      = useState(defaultKeyword);
  const [selected,     setSelected]     = useState<DeliverableType>('Technical');
  const [loading,      setLoading]      = useState(false);
  const [stepIdx,      setStepIdx]      = useState(0);
  const [output,       setOutput]       = useState<string | null>(null);
  const [activeTab,    setActiveTab]    = useState<'rendered' | 'markdown'>('rendered');
  const [copied,       setCopied]       = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  /* Sync when project changes */
  useEffect(() => { if (defaultUrl)     setUrl(defaultUrl);         }, [defaultUrl]);
  useEffect(() => { if (defaultKeyword) setKeyword(defaultKeyword); }, [defaultKeyword]);

  /* Loading step ticker */
  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx(i => i >= LOADING_STEPS.length - 1 ? i : i + 1), 700);
    return () => clearInterval(t);
  }, [loading]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !keyword.trim()) {
      toast({ title: 'Missing fields', description: 'Please add a URL and a keyword.', variant: 'destructive' });
      return;
    }
    setOutput(null);
    setLoading(true);
    try {
      const res = await fetch('/api/seo-agent', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          keyword,
          deliverableType: selected,
          ...(projectId ? { projectId } : {}),
        }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('[STREAM_ERROR]')) {
          toast({ title: 'Error', description: chunk, variant: 'destructive' });
          break;
        }
        acc += chunk;
        setOutput(acc);
      }

      setLoading(false);
      setActiveTab('rendered');

      if (projectId) {
        toast({
          title: 'Audit saved to project',
          description: 'This report informs your dashboard scores, launchpad, and future audits.',
        });
      }

      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to generate report.', variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    toast({ title: 'Copied!' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    if (!output) return;
    const blob = new Blob([output], { type: 'text/markdown' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `seo-${selected}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDownloadPdf = async () => {
    if (!output) return;
    setExportingPdf(true);
    try {
      const pdf        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin     = 15;
      const maxWidth   = pageWidth - margin * 2;
      let y = margin;

      const checkPage = (h: number) => {
        if (y + h > pageHeight - margin) { pdf.addPage(); y = margin; }
      };

      const cl = (t: string) =>
        t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1')
         .replace(/[–—]/g, '-').replace(/[""]/g, '"').replace(/['']/g, "'")
         .replace(/…/g, '...').replace(/•/g, '-').replace(/[^\x00-\x7F]/g, '?');

      const wt = (t: string, fs: number, b: boolean, c: [number, number, number], tp = 0, bp = 2) => {
        pdf.setFontSize(fs); pdf.setFont('helvetica', b ? 'bold' : 'normal'); pdf.setTextColor(...c);
        const ls = pdf.splitTextToSize(cl(t), maxWidth);
        const bh = ls.length * fs * 0.45 + tp + bp;
        checkPage(bh); y += tp; pdf.text(ls, margin, y); y += ls.length * fs * 0.45 + bp;
      };

      let inT = false, tRows: string[][] = [], inC = false, cLines: string[] = [];

      const flushT = () => {
        if (tRows.length < 2) { tRows = []; inT = false; return; }
        const cols = Math.max(...tRows.map(r => r.length));
        const cw   = maxWidth / cols;
        tRows.forEach((row, ri) => {
          if (ri === 1) return;
          checkPage(9);
          const isH = ri === 0;
          pdf.setFontSize(8); pdf.setFont('helvetica', isH ? 'bold' : 'normal');
          pdf.setTextColor(isH ? 30 : 60, isH ? 30 : 60, isH ? 30 : 60);
          if (isH) { pdf.setFillColor(235, 235, 245); pdf.rect(margin, y - 5, maxWidth, 7, 'F'); }
          row.forEach((cell, ci) => pdf.text(pdf.splitTextToSize(cl(cell.trim()), cw - 2), margin + ci * cw + 1, y));
          pdf.setDrawColor(210, 210, 220); pdf.line(margin, y + 2.5, margin + maxWidth, y + 2.5);
          y += 7;
        });
        y += 4; tRows = []; inT = false;
      };

      const flushC = () => {
        if (!cLines.length) { cLines = []; inC = false; return; }
        const ct = cLines.join('\n');
        pdf.setFontSize(7.5); pdf.setFont('courier', 'normal'); pdf.setTextColor(40, 40, 40);
        const wl = pdf.splitTextToSize(ct, maxWidth - 6);
        const bh = wl.length * 3.8 + 6;
        checkPage(bh + 4);
        pdf.setFillColor(242, 242, 248); pdf.setDrawColor(200, 200, 215);
        pdf.roundedRect(margin, y - 3, maxWidth, bh, 2, 2, 'FD');
        pdf.text(wl, margin + 3, y + 1);
        y += bh + 4; cLines = []; inC = false;
      };

      for (const line of output.split('\n')) {
        if (line.trim().startsWith('```')) {
          if (inC) flushC(); else { if (inT) flushT(); inC = true; }
          continue;
        }
        if (inC) { cLines.push(line); continue; }
        if (line.trim().startsWith('|')) {
          inT = true;
          tRows.push(line.split('|').filter((_, i, a) => i > 0 && i < a.length - 1));
          continue;
        } else if (inT) flushT();

        if      (line.startsWith('# '))    wt(line.slice(2),  18,   true,  [79, 70, 229], 6, 4);
        else if (line.startsWith('## '))   wt(line.slice(3),  13,   true,  [30, 30, 40],  5, 3);
        else if (line.startsWith('### '))  wt(line.slice(4),  10.5, true,  [79, 70, 229], 4, 2);
        else if (line.startsWith('#### ')) wt(line.slice(5),  9.5,  true,  [60, 60, 80],  3, 2);
        else if (/^[-*]\s/.test(line.trim())) {
          const t = cl(line.trim().replace(/^[-*]\s/, ''));
          pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(50, 50, 60);
          const w = pdf.splitTextToSize('  •  ' + t, maxWidth - 5);
          const h = w.length * 4.2 + 1; checkPage(h);
          pdf.text(w, margin + 2, y); y += h;
        } else if (/^\d+\.\s/.test(line.trim())) {
          pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(50, 50, 60);
          const w = pdf.splitTextToSize(cl(line.trim()), maxWidth - 5);
          const h = w.length * 4.2 + 1; checkPage(h);
          pdf.text(w, margin + 4, y); y += h;
        } else if (line.trim() === '---') {
          checkPage(6);
          pdf.setDrawColor(200, 200, 220);
          pdf.line(margin, y, margin + maxWidth, y);
          y += 6;
        } else if (line.trim() === '') {
          y += 2.5;
        } else {
          wt(line, 9, false, [50, 50, 60], 0, 1.5);
        }
      }
      if (inT) flushT();
      if (inC) flushC();

      const total = (pdf.internal as any).getNumberOfPages();
      const del   = DELIVERABLES.find(d => d.id === selected)!;
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(160, 160, 180);
        pdf.text(`SEO Report  |  ${del.title}  |  Page ${i} of ${total}`, margin, pageHeight - 8);
        pdf.line(margin, pageHeight - 11, margin + maxWidth, pageHeight - 11);
      }

      pdf.save(`seo-${selected}-${Date.now()}.pdf`);
      toast({ title: 'PDF downloaded!' });
    } catch (err) {
      toast({ title: 'PDF failed', description: String(err), variant: 'destructive' });
    } finally {
      setExportingPdf(false);
    }
  };

  const currentDeliverable = DELIVERABLES.find(d => d.id === selected)!;

  return (
    <section className="relative w-full max-w-4xl mx-auto px-4 sm:px-6">

      <form
        onSubmit={handleGenerate}
        className="relative rounded-2xl bg-card/60 backdrop-blur-xl border border-border shadow-card p-6 sm:p-10 animate-fade-up"
        style={{ animationDelay: '0.2s' }}
      >
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {/* Project context badge */}
        {projectId && (
          <div className="flex items-center gap-2 text-xs font-mono text-primary bg-primary/5 border border-primary/15 rounded-xl px-3 py-2.5 mb-6">
            <Database className="h-3.5 w-3.5 shrink-0" />
            <span>
              Project context active — this audit uses all tracked keywords, competitor data, live health scores,
              and previous reports. Results auto-save and feed your dashboard &amp; launchpad.
            </span>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-5 mb-8">

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url" className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Target Website URL
            </Label>
            <Input
              id="url" type="text" placeholder="yourdomain.com"
              value={url} onChange={e => setUrl(e.target.value)} disabled={loading}
              className="h-12 text-base bg-background/60 border-border focus-visible:ring-primary focus-visible:ring-offset-0"
            />
          </div>

          {/* Keyword + chips */}
          <div className="space-y-2">
            <Label htmlFor="keyword" className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Primary Keyword or Topic
            </Label>
            <Input
              id="keyword" type="text" placeholder="e.g. project management software"
              value={keyword} onChange={e => setKeyword(e.target.value)} disabled={loading}
              className="h-12 text-base bg-background/60 border-border focus-visible:ring-primary focus-visible:ring-offset-0"
            />
            {/* Clickable keyword chips from project */}
            {allKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allKeywords.map((kw, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setKeyword(kw)}
                    disabled={loading}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      keyword === kw
                        ? 'border-primary bg-primary/10 text-primary shadow-[0_0_8px_hsl(var(--primary)/0.3)]'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {kw}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Deliverable selector */}
        <div className="mb-8">
          <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
            Choose Your Deliverable
          </Label>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {DELIVERABLES.map(d => {
              const Icon   = ICONS[d.id];
              const active = selected === d.id;
              return (
                <button
                  key={d.id} type="button"
                  onClick={() => setSelected(d.id)} disabled={loading}
                  className={`group relative text-left rounded-xl border p-4 transition-all duration-300 ${
                    active
                      ? 'border-primary bg-primary/10 shadow-[0_0_30px_-8px_hsl(var(--primary)/0.6)]'
                      : 'border-border bg-secondary/40 hover:border-primary/40 hover:bg-secondary/70'
                  }`}
                >
                  <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                    active ? 'bg-primary text-primary-foreground' : 'bg-background/60 text-primary'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-semibold mb-1 leading-tight">{d.title}</div>
                  <div className="text-xs text-muted-foreground leading-snug">{d.description}</div>
                  {active && (
                    <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate button */}
        <Button
          type="submit" disabled={loading}
          className="w-full h-14 text-base font-semibold bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 transition-all hover:scale-[1.01] shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.6)] disabled:opacity-100"
        >
          {loading ? (
            <span className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-mono text-sm">{LOADING_STEPS[stepIdx]}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {projectId ? 'Run Project Audit' : 'Generate Strategy'}
              <ArrowRight className="h-5 w-5" />
            </span>
          )}
        </Button>

        {/* Progress bar */}
        {loading && (
          <div className="mt-4 h-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-500"
              style={{ width: `${((stepIdx + 1) / LOADING_STEPS.length) * 100}%` }}
            />
          </div>
        )}
      </form>

      {/* Output */}
      {output && (
        <div ref={outputRef} className="mt-12 animate-fade-up">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
            <div>
              <div className="text-xs font-mono text-primary uppercase tracking-widest mb-1">
                ✓ Report ready{projectId ? ' · saved to project' : ''}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold">{currentDeliverable.title}</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleCopy}
                className="border-border hover:border-primary hover:text-primary bg-card/60">
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="outline" onClick={handleDownloadMd}
                className="border-border hover:border-primary hover:text-primary bg-card/60">
                <Download className="h-4 w-4 mr-2" />Markdown
              </Button>
              <Button onClick={handleDownloadPdf} disabled={exportingPdf}
                className="bg-primary text-primary-foreground hover:bg-primary/90">
                {exportingPdf
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                  : <><FileDown className="h-4 w-4 mr-2" />PDF</>}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl shadow-card overflow-hidden">
            <div className="flex border-b border-border bg-secondary/30">
              {(['rendered', 'markdown'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`relative px-6 py-3.5 text-sm font-medium transition-colors ${
                    activeTab === tab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}>
                  {tab === 'rendered' ? 'Formatted' : 'Markdown'}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-4 right-4 h-px bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
                  )}
                </button>
              ))}
            </div>
            <div className="p-6 sm:p-10 max-h-[70vh] overflow-y-auto">
              {activeTab === 'rendered'
                ? <RenderedMarkdown source={output} />
                : <pre className="font-mono text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{output}</pre>
              }
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

/* ─── Markdown renderer ─── */
const RenderedMarkdown = ({ source }: { source: string }) => {
  const lines    = source.split('\n');
  const elements: React.ReactNode[] = [];
  let tBuf: string[] = [];
  let lBuf: string[] = [];

  const flushL = (k: string) => {
    if (!lBuf.length) return;
    elements.push(
      <ul key={k} className="space-y-2 my-4 ml-2">
        {lBuf.map((item, i) => (
          <li key={i} className="flex gap-3 text-foreground/90 leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
          </li>
        ))}
      </ul>
    );
    lBuf = [];
  };

  const flushT = (k: string) => {
    if (tBuf.length < 2) { tBuf = []; return; }
    const rows                = tBuf.map(r => r.split('|').map(c => c.trim()).filter(Boolean));
    const [header, , ...body] = rows;
    elements.push(
      <div key={k} className="my-5 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60">
            <tr>
              {header.map((h, i) => (
                <th key={i} className="text-left px-4 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className="border-t border-border">
                {row.map((c, ci) => (
                  <td key={ci} className="px-4 py-2.5 text-foreground/80"
                    dangerouslySetInnerHTML={{ __html: inlineFormat(c) }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tBuf = [];
  };

  lines.forEach((line, idx) => {
    const key = `el-${idx}`;

    if (line.trim().startsWith('|')) {
      flushL(`l-${idx}`); tBuf.push(line); return;
    } else {
      flushT(`t-${idx}`);
    }

    if (/^[-*]\s/.test(line)) {
      elements.push(null);
      lBuf.push(line.replace(/^[-*]\s/, ''));
      return;
    } else if (/^\d+\.\s/.test(line)) {
      lBuf.push(line.replace(/^\d+\.\s/, ''));
      return;
    } else {
      flushL(`l-${idx}`);
    }

    if      (line.startsWith('# '))    elements.push(<h1 key={key} className="text-3xl font-bold mt-2 mb-4 text-gradient-primary">{line.slice(2)}</h1>);
    else if (line.startsWith('## '))   elements.push(<h2 key={key} className="text-xl font-bold mt-8 mb-3 text-foreground">{line.slice(3)}</h2>);
    else if (line.startsWith('### '))  elements.push(<h3 key={key} className="text-base font-semibold mt-5 mb-2 text-primary">{line.slice(4)}</h3>);
    else if (line.startsWith('#### ')) elements.push(<h4 key={key} className="text-sm font-semibold mt-4 mb-1 text-muted-foreground">{line.slice(5)}</h4>);
    else if (line.trim() === '---')    elements.push(<hr key={key} className="my-6 border-border" />);
    else if (line.trim() === '')       elements.push(<div key={key} className="h-2" />);
    else elements.push(
      <p key={key} className="text-foreground/85 leading-relaxed my-2"
        dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
    );
  });

  flushL('l-end');
  flushT('t-end');
  return <div>{elements}</div>;
};

const inlineFormat = (text: string) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/`(.+?)`/g,       '<code class="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary">$1</code>')
    .replace(/✓/g,             '<span class="text-primary">✓</span>');
