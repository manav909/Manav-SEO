import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Check, Copy, Download, FileDown,
  Loader2, Sparkles, Wrench, FileText, Megaphone, Bot, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Label }  from '@/components/ui/label';
import { toast }  from '@/hooks/use-toast';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
export type DeliverableType = 'Technical' | 'On-Page' | 'Off-Page' | 'GEO';

export interface ProjectContext {
  project_id?:             string;
  url?:                    string;
  all_keywords?:           string[];
  competitors?:            string[];
  client_company?:         string;
  industry?:               string;
  previous_audit_summary?: string;
  current_metrics?:        Record<string, number>;
}

interface SeoEngineProps {
  projectContext?:  ProjectContext;
  onTabComplete?:   (deliverableType: DeliverableType, content: string) => void;
  initialUrl?:      string;
  initialKeyword?:  string;
}

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────
const DELIVERABLES: { id: DeliverableType; title: string; description: string }[] = [
  { id: 'Technical', title: 'Technical SEO',    description: 'Site architecture, crawlability, Core Web Vitals, schema' },
  { id: 'On-Page',   title: 'On-Page SEO',      description: 'Content gaps, keyword usage, titles, E-E-A-T signals' },
  { id: 'Off-Page',  title: 'Off-Page SEO',     description: 'Link building, digital PR, authority strategy' },
  { id: 'GEO',       title: 'GEO Audit',        description: 'ChatGPT, Perplexity & Google AI Overview optimisation' },
];

const LOADING_STEPS = [
  'Fetching live website content…',
  'Crawling competitor pages…',
  'Loading project context…',
  'Analysing SEO signals…',
  'Cross-referencing previous audit…',
  'Generating comprehensive report…',
  'Finalising recommendations…',
];

const ICONS: Record<DeliverableType, typeof Wrench> = {
  Technical: Wrench,
  'On-Page':  FileText,
  'Off-Page': Megaphone,
  GEO:        Bot,
};

// ─────────────────────────────────────────────────────────
// Inline markdown formatter
// ─────────────────────────────────────────────────────────
const inlineFormat = (text: string) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/`(.+?)`/g,       '<code class="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary">$1</code>')
    .replace(/✓/g,              '<span class="text-primary">✓</span>');

// ─────────────────────────────────────────────────────────
// RenderedMarkdown
// ─────────────────────────────────────────────────────────
const RenderedMarkdown = ({ source }: { source: string }) => {
  const lines    = source.split('\n');
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let listBuffer:  string[] = [];

  const flushList = (key: string) => {
    if (!listBuffer.length) return;
    elements.push(
      <ul key={key} className="space-y-2 my-4 ml-2">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex gap-3 text-foreground/90 leading-relaxed">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const flushTable = (key: string) => {
    if (tableBuffer.length < 2) { tableBuffer = []; return; }
    const rows            = tableBuffer.map((r) => r.split('|').map((c) => c.trim()).filter(Boolean));
    const [header, , ...body] = rows;
    elements.push(
      <div key={key} className="my-5 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60">
            <tr>{header.map((h, i) => <th key={i} className="text-left px-4 py-2.5 font-semibold">{h}</th>)}</tr>
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
    tableBuffer = [];
  };

  lines.forEach((line, idx) => {
    const key = `el-${idx}`;
    if (line.trim().startsWith('|')) {
      flushList(`l-${idx}`);
      tableBuffer.push(line);
      return;
    } else {
      flushTable(`t-${idx}`);
    }

    if (/^[-*]\s/.test(line)) {
      elements.push(null);
      listBuffer.push(line.replace(/^[-*]\s/, ''));
      return;
    } else if (/^\d+\.\s/.test(line)) {
      listBuffer.push(line.replace(/^\d+\.\s/, ''));
      return;
    } else {
      flushList(`l-${idx}`);
    }

    if      (line.startsWith('# '))    elements.push(<h1 key={key} className="text-3xl font-bold mt-2 mb-4 bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">{line.slice(2)}</h1>);
    else if (line.startsWith('## '))   elements.push(<h2 key={key} className="text-xl font-bold mt-8 mb-3 text-foreground">{line.slice(3)}</h2>);
    else if (line.startsWith('### '))  elements.push(<h3 key={key} className="text-base font-semibold mt-5 mb-2 text-primary">{line.slice(4)}</h3>);
    else if (line.trim() === '---')    elements.push(<hr key={key} className="my-6 border-border" />);
    else if (line.trim() === '')       elements.push(<div key={key} className="h-2" />);
    else elements.push(
      <p key={key} className="text-foreground/85 leading-relaxed my-2"
        dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
    );
  });
  flushList('l-end');
  flushTable('t-end');
  return <div>{elements}</div>;
};

// ─────────────────────────────────────────────────────────
// Main SeoEngine component
// ─────────────────────────────────────────────────────────
export const SeoEngine = ({
  projectContext,
  onTabComplete,
  initialUrl     = '',
  initialKeyword = '',
}: SeoEngineProps) => {
  const [url,          setUrl]          = useState(initialUrl);
  const [keyword,      setKeyword]      = useState(initialKeyword);
  const [selected,     setSelected]     = useState<DeliverableType>('Technical');
  const [loading,      setLoading]      = useState(false);
  const [stepIdx,      setStepIdx]      = useState(0);
  const [output,       setOutput]       = useState<string | null>(null);
  const [activeTab,    setActiveTab]    = useState<'rendered' | 'markdown'>('rendered');
  const [copied,       setCopied]       = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Sync when project changes
  useEffect(() => { setUrl(initialUrl);         }, [initialUrl]);
  useEffect(() => { setKeyword(initialKeyword); }, [initialKeyword]);

  // Loading step ticker
  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    const interval = setInterval(() => {
      setStepIdx((i) => (i >= LOADING_STEPS.length - 1 ? i : i + 1));
    }, 700);
    return () => clearInterval(interval);
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
          // Project enrichment — only sent when available
          ...(projectContext?.all_keywords?.length    && { all_keywords:           projectContext.all_keywords }),
          ...(projectContext?.competitors?.length     && { competitors:            projectContext.competitors }),
          ...(projectContext?.client_company          && { client_company:         projectContext.client_company }),
          ...(projectContext?.industry                && { industry:               projectContext.industry }),
          ...(projectContext?.previous_audit_summary  && { previous_audit_summary: projectContext.previous_audit_summary }),
          ...(projectContext?.current_metrics         && { current_metrics:        projectContext.current_metrics }),
        }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader    = res.body.getReader();
      const decoder   = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('[STREAM_ERROR]')) {
          toast({ title: 'Error', description: chunk, variant: 'destructive' });
          break;
        }
        accumulated += chunk;
        setOutput(accumulated);
      }

      setLoading(false);
      setActiveTab('rendered');
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

      // Notify Audit page so it can save the section
      if (accumulated && onTabComplete) {
        onTabComplete(selected, accumulated);
      }

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to generate deliverable.', variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    toast({ title: 'Copied!', description: 'Markdown copied to clipboard.' });
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
    toast({ title: 'Download started', description: 'Markdown file saved.' });
  };

  const handleDownloadPdf = async () => {
    if (!output) return;
    setExportingPdf(true);
    toast({ title: 'Generating PDF…', description: 'Please wait.' });
    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin     = 15;
      const maxWidth   = pageWidth - margin * 2;
      let y            = margin;

      const checkPage = (h: number) => {
        if (y + h > pageHeight - margin) { pdf.addPage(); y = margin; }
      };

      const clean = (t: string) =>
        t.replace(/\*\*(.+?)\*\*/g, '$1')
         .replace(/`(.+?)`/g,       '$1')
         .replace(/[""]/g, '"').replace(/['']/g, "'")
         .replace(/–/g, '-').replace(/—/g, '--').replace(/…/g, '...')
         .replace(/✓/g, '[OK]').replace(/✗/g, '[X]').replace(/→/g, '->')
         .replace(/[^\x00-\x7F]/g, '?');

      const write = (text: string, fs: number, bold: boolean, color: [number,number,number], tp = 0, bp = 2) => {
        pdf.setFontSize(fs);
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(clean(text), maxWidth);
        const lh    = fs * 0.45;
        checkPage(lines.length * lh + tp + bp);
        y += tp;
        pdf.text(lines, margin, y);
        y += lines.length * lh + bp;
      };

      let inTable = false, inCode = false;
      let tableRows: string[][] = [], codeLines: string[] = [];

      const flushTable = () => {
        if (tableRows.length < 2) { tableRows = []; inTable = false; return; }
        const colW = maxWidth / Math.max(...tableRows.map((r) => r.length));
        const rh   = 7;
        tableRows.forEach((row, ri) => {
          if (ri === 1) return;
          checkPage(rh + 2);
          const isHeader = ri === 0;
          pdf.setFontSize(8); pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
          pdf.setTextColor(isHeader ? 30 : 60, isHeader ? 30 : 60, isHeader ? 30 : 60);
          if (isHeader) { pdf.setFillColor(235,235,245); pdf.rect(margin, y-5, maxWidth, rh, 'F'); }
          row.forEach((cell, ci) => {
            const t = pdf.splitTextToSize(clean(cell.trim()), colW - 2);
            pdf.text(t, margin + ci * colW + 1, y);
          });
          pdf.setDrawColor(210,210,220);
          pdf.line(margin, y + 2.5, margin + maxWidth, y + 2.5);
          y += rh;
        });
        y += 4; tableRows = []; inTable = false;
      };

      const flushCode = () => {
        if (!codeLines.length) { codeLines = []; inCode = false; return; }
        pdf.setFontSize(7.5); pdf.setFont('courier', 'normal'); pdf.setTextColor(40,40,40);
        const wl = pdf.splitTextToSize(codeLines.join('\n'), maxWidth - 6);
        const bh = wl.length * 3.8 + 6;
        checkPage(bh + 4);
        pdf.setFillColor(242,242,248); pdf.setDrawColor(200,200,215);
        pdf.roundedRect(margin, y-3, maxWidth, bh, 2, 2, 'FD');
        pdf.text(wl, margin + 3, y + 1);
        y += bh + 4; codeLines = []; inCode = false;
      };

      for (const line of output.split('\n')) {
        if (line.trim().startsWith('```')) { if (inCode) flushCode(); else { if (inTable) flushTable(); inCode = true; } continue; }
        if (inCode) { codeLines.push(line); continue; }
        if (line.trim().startsWith('|')) { inTable = true; tableRows.push(line.split('|').filter((_, i, a) => i > 0 && i < a.length - 1)); continue; }
        else if (inTable) flushTable();

        if      (line.startsWith('# '))   write(line.slice(2),  18, true,  [79,70,229],  6, 4);
        else if (line.startsWith('## '))  write(line.slice(3),  13, true,  [30,30,40],   5, 3);
        else if (line.startsWith('### ')) write(line.slice(4),  10.5,true, [79,70,229],  4, 2);
        else if (line.startsWith('#### '))write(line.slice(5),  9.5, true, [60,60,80],   3, 2);
        else if (/^[-*]\s/.test(line)) {
          const t  = clean(line.trim().replace(/^[-*]\s/, ''));
          pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(50,50,60);
          const wl = pdf.splitTextToSize('  •  ' + t, maxWidth - 5);
          checkPage(wl.length * 4.2 + 1); pdf.text(wl, margin + 2, y); y += wl.length * 4.2 + 1;
        } else if (/^\d+\.\s/.test(line.trim())) {
          pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(50,50,60);
          const wl = pdf.splitTextToSize(clean(line.trim()), maxWidth - 5);
          checkPage(wl.length * 4.2 + 1); pdf.text(wl, margin + 4, y); y += wl.length * 4.2 + 1;
        } else if (line.trim().startsWith('>')) {
          pdf.setFontSize(9); pdf.setFont('helvetica','italic'); pdf.setTextColor(90,90,110);
          const wl = pdf.splitTextToSize(clean(line.trim().replace(/^>\s?/,'')), maxWidth - 8);
          checkPage(wl.length * 4.2 + 4);
          pdf.setFillColor(245,245,252); pdf.rect(margin, y-3, 2, wl.length*4.2+4, 'F');
          pdf.text(wl, margin + 5, y); y += wl.length * 4.2 + 4;
        } else if (line.trim() === '---') { checkPage(6); pdf.setDrawColor(200,200,220); pdf.line(margin,y,margin+maxWidth,y); y+=6; }
        else if (line.trim() === '') { y += 2.5; }
        else { write(line, 9, false, [50,50,60], 0, 1.5); }
      }
      if (inTable) flushTable();
      if (inCode)  flushCode();

      const totalPages = (pdf.internal as any).getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(160,160,180);
        pdf.text(`SEO Report  |  ${selected}  |  Page ${i} of ${totalPages}`, margin, pageHeight - 8);
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

  const currentDeliverable = DELIVERABLES.find((d) => d.id === selected)!;

  return (
    <section className="relative w-full max-w-4xl mx-auto px-4 sm:px-6">
      <form
        onSubmit={handleGenerate}
        className="relative rounded-2xl bg-card/60 backdrop-blur-xl border border-border shadow-card p-6 sm:p-10 animate-fade-up"
        style={{ animationDelay: '0.2s' }}
      >
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        {/* ── Project context badge ── */}
        {(projectContext?.client_company || (projectContext?.all_keywords?.length ?? 0) > 0) && (
          <div className="flex flex-wrap items-center gap-2 mb-6 px-3 py-2.5 rounded-xl border border-primary/20 bg-primary/5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
            {projectContext?.client_company && (
              <span className="font-semibold text-foreground">{projectContext.client_company}</span>
            )}
            {(projectContext?.all_keywords?.length ?? 0) > 0 && (
              <span className="bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                {projectContext!.all_keywords!.length} keywords tracked
              </span>
            )}
            {(projectContext?.competitors?.length ?? 0) > 0 && (
              <span className="bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 rounded-full px-2 py-0.5">
                competitor crawled
              </span>
            )}
            {projectContext?.current_metrics && (
              <span className="bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2 py-0.5">
                dashboard metrics: live
              </span>
            )}
            {projectContext?.previous_audit_summary && (
              <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded-full px-2 py-0.5">
                previous audit: loaded
              </span>
            )}
          </div>
        )}

        {/* ── URL + Keyword ── */}
        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          <div className="space-y-2">
            <Label htmlFor="url" className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Target Website URL
            </Label>
            <Input
              id="url" type="text" placeholder="yourdomain.com"
              value={url} onChange={(e) => setUrl(e.target.value)} disabled={loading}
              className="h-12 text-base bg-background/60 border-border focus-visible:ring-primary focus-visible:ring-offset-0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keyword" className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Main Keyword or Topic
            </Label>
            <Input
              id="keyword" type="text" placeholder="e.g. event rental dubai"
              value={keyword} onChange={(e) => setKeyword(e.target.value)} disabled={loading}
              className="h-12 text-base bg-background/60 border-border focus-visible:ring-primary focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* ── Deliverable cards ── */}
        <div className="mb-8">
          <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
            Choose Your Deliverable
          </Label>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {DELIVERABLES.map((d) => {
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
                  {active && <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary animate-pulse" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Generate button ── */}
        <Button
          type="submit" disabled={loading}
          className="w-full h-14 text-base font-semibold bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:opacity-90 transition-all hover:scale-[1.01] disabled:opacity-100"
        >
          {loading ? (
            <span className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-mono text-sm">{LOADING_STEPS[stepIdx]}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Generate Strategy
              <ArrowRight className="h-5 w-5" />
            </span>
          )}
        </Button>

        {loading && (
          <div className="mt-4 h-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-500"
              style={{ width: `${((stepIdx + 1) / LOADING_STEPS.length) * 100}%` }}
            />
          </div>
        )}
      </form>

      {/* ── Output ── */}
      {output && (
        <div ref={outputRef} className="mt-12 animate-fade-up">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
            <div>
              <div className="text-xs font-mono text-primary uppercase tracking-widest mb-1">✓ Deliverable ready</div>
              <h2 className="text-2xl sm:text-3xl font-bold">{currentDeliverable.title}</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleCopy} className="border-border hover:border-primary bg-card/60">
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="outline" onClick={handleDownloadMd} className="border-border hover:border-primary bg-card/60">
                <Download className="h-4 w-4 mr-2" />Markdown
              </Button>
              <Button onClick={handleDownloadPdf} disabled={exportingPdf} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                {exportingPdf ? 'Generating…' : 'PDF'}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl overflow-hidden">
            <div className="flex border-b border-border bg-secondary/30">
              {(['rendered', 'markdown'] as const).map((tab) => (
                <button
                  key={tab} onClick={() => setActiveTab(tab)}
                  className={`relative px-6 py-3.5 text-sm font-medium transition-colors ${
                    activeTab === tab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
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
