import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Download, FileDown, Loader2, Sparkles, Wrench, FileText, Megaphone, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { DELIVERABLES, LOADING_STEPS, type DeliverableType } from '@/lib/seoGenerator';
import jsPDF from 'jspdf';

const ICONS: Record<DeliverableType, typeof Wrench> = {
  Technical: Wrench,
  'On-Page': FileText,
  'Off-Page': Megaphone,
  GEO: Bot,
};

export const SeoEngine = () => {
  const [url, setUrl] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<DeliverableType>('Technical');
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [output, setOutput] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rendered' | 'markdown'>('rendered');
  const [copied, setCopied] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const pdfHiddenRef = useRef<HTMLDivElement>(null);

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, keyword, deliverableType: selected }),
      });
      if (!res.ok || !res.body) throw new Error('Request failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seo-${selected}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: 'Download started', description: 'Markdown file saved.' });
  };

  const handleDownloadPdf = async () => {
    if (!output) return;
    setExportingPdf(true);
    toast({ title: 'Generating PDF...', description: 'Please wait a moment.' });

    try {
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      // Helper: add new page if needed
      const checkNewPage = (neededHeight: number) => {
        if (y + neededHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      // Helper: wrap and write text
      const writeText = (
        text: string,
        fontSize: number,
        isBold: boolean,
        color: [number, number, number],
        topPad = 0,
        bottomPad = 2
      ) => {
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(text, maxWidth);
        const lineHeight = fontSize * 0.45;
        const blockHeight = lines.length * lineHeight + topPad + bottomPad;
        checkNewPage(blockHeight);
        y += topPad;
        pdf.text(lines, margin, y);
        y += lines.length * lineHeight + bottomPad;
      };

      // Parse markdown lines into PDF
      const lines = output.split('\n');
      let inTable = false;
      let tableRows: string[][] = [];

      const flushTable = () => {
        if (tableRows.length < 2) { tableRows = []; inTable = false; return; }
        const colCount = tableRows[0].length;
        const colWidth = maxWidth / colCount;
        const rowHeight = 7;

        tableRows.forEach((row, ri) => {
          if (ri === 1) return; // skip separator row
          checkNewPage(rowHeight + 2);
          const isHeader = ri === 0;
          pdf.setFontSize(8);
          pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
          pdf.setTextColor(isHeader ? 30 : 80, isHeader ? 30 : 80, isHeader ? 30 : 80);
          if (isHeader) {
            pdf.setFillColor(240, 240, 240);
            pdf.rect(margin, y - 4, maxWidth, rowHeight, 'F');
          }
          row.forEach((cell, ci) => {
            const cellLines = pdf.splitTextToSize(cell.trim(), colWidth - 2);
            pdf.text(cellLines, margin + ci * colWidth + 1, y);
          });
          // Row border
          pdf.setDrawColor(200, 200, 200);
          pdf.line(margin, y + 2, margin + maxWidth, y + 2);
          y += rowHeight;
        });

        // Table outer border
        pdf.setDrawColor(180, 180, 180);
        y += 4;
        tableRows = [];
        inTable = false;
      };

      for (const line of lines) {
        // Table rows
        if (line.trim().startsWith('|')) {
          inTable = true;
          const cells = line.split('|').filter((c) => c.trim() !== '');
          tableRows.push(cells);
          continue;
        } else if (inTable) {
          flushTable();
        }

        // Headings
        if (line.startsWith('# ')) {
          writeText(line.slice(2), 18, true, [99, 102, 241], 6, 4);
        } else if (line.startsWith('## ')) {
          writeText(line.slice(3), 14, true, [30, 30, 30], 5, 3);
        } else if (line.startsWith('### ')) {
          writeText(line.slice(4), 11, true, [99, 102, 241], 4, 2);
        } else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          // Bullet points
          const text = line.trim().replace(/^[-*]\s/, '');
          const clean = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(60, 60, 60);
          const wrapped = pdf.splitTextToSize('• ' + clean, maxWidth - 4);
          const blockH = wrapped.length * 4 + 1;
          checkNewPage(blockH);
          pdf.text(wrapped, margin + 3, y);
          y += blockH;
        } else if (/^\d+\.\s/.test(line.trim())) {
          // Numbered list
          const clean = line.trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(60, 60, 60);
          const wrapped = pdf.splitTextToSize(clean, maxWidth - 4);
          const blockH = wrapped.length * 4 + 1;
          checkNewPage(blockH);
          pdf.text(wrapped, margin + 3, y);
          y += blockH;
        } else if (line.trim() === '---') {
          // Divider
          checkNewPage(6);
          pdf.setDrawColor(200, 200, 200);
          pdf.line(margin, y, margin + maxWidth, y);
          y += 6;
        } else if (line.trim() === '') {
          y += 3;
        } else {
          // Normal paragraph
          const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
          writeText(clean, 9, false, [60, 60, 60], 0, 1);
        }
      }

      // Flush any remaining table
      if (inTable) flushTable();

      // Footer on every page
      const totalPages = (pdf.internal as any).getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          `SEO Report — ${currentDeliverable.title} — Page ${i} of ${totalPages}`,
          margin,
          pageHeight - 8
        );
      }

      pdf.save(`seo-${selected}-${Date.now()}.pdf`);
      toast({ title: 'PDF downloaded!', description: 'Full report saved successfully.' });

    } catch (err) {
      console.error('PDF error:', err);
      toast({
        title: 'PDF failed',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const currentDeliverable = DELIVERABLES.find((d) => d.id === selected)!;

  return (
    <section className="relative w-full max-w-4xl mx-auto px-4 sm:px-6">

      {/* ── Hidden full-height div used ONLY for PDF capture ── */}
      {output && (
        <div
          ref={pdfHiddenRef}
          style={{
            position: 'fixed',
            left: '-9999px',
            top: 0,
            visibility: 'hidden',
            width: '900px',
            backgroundColor: '#0f1117',
            padding: '40px',
            color: '#ffffff',
            fontFamily: 'sans-serif',
          }}
        >
          <RenderedMarkdown source={output} />
        </div>
      )}

      <form
        onSubmit={handleGenerate}
        className="relative rounded-2xl bg-card/60 backdrop-blur-xl border border-border shadow-card p-6 sm:p-10 animate-fade-up"
        style={{ animationDelay: '0.2s' }}
      >
        <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

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
              id="keyword" type="text" placeholder="e.g. project management software"
              value={keyword} onChange={(e) => setKeyword(e.target.value)} disabled={loading}
              className="h-12 text-base bg-background/60 border-border focus-visible:ring-primary focus-visible:ring-offset-0"
            />
          </div>
        </div>

        <div className="mb-8">
          <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
            Choose Your Deliverable
          </Label>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {DELIVERABLES.map((d) => {
              const Icon = ICONS[d.id];
              const active = selected === d.id;
              return (
                <button
                  key={d.id} type="button" onClick={() => setSelected(d.id)} disabled={loading}
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
                  {active && <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary animate-pulse-glow" />}
                </button>
              );
            })}
          </div>
        </div>

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

      {output && (
        <div ref={outputRef} className="mt-12 animate-fade-up">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
            <div>
              <div className="text-xs font-mono text-primary uppercase tracking-widest mb-1">✓ Deliverable ready</div>
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
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                  : <><FileDown className="h-4 w-4 mr-2" />PDF</>}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl shadow-card overflow-hidden">
            <div className="flex border-b border-border bg-secondary/30">
              {(['rendered', 'markdown'] as const).map((tab) => (
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
            {/* Scrollable display — NOT used for PDF */}
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

const RenderedMarkdown = ({ source }: { source: string }) => {
  const lines = source.split('\n');
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
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
    const rows = tableBuffer.map((r) => r.split('|').map((c) => c.trim()).filter(Boolean));
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
    } else { flushTable(`t-${idx}`); }

    if (/^[-*]\s/.test(line)) {
      elements.push(null);
      listBuffer.push(line.replace(/^[-*]\s/, ''));
      return;
    } else if (/^\d+\.\s/.test(line)) {
      listBuffer.push(line.replace(/^\d+\.\s/, ''));
      return;
    } else { flushList(`l-${idx}`); }

    if (line.startsWith('# ')) {
      elements.push(<h1 key={key} className="text-3xl font-bold mt-2 mb-4 text-gradient-primary">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={key} className="text-xl font-bold mt-8 mb-3 text-foreground">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={key} className="text-base font-semibold mt-5 mb-2 text-primary">{line.slice(4)}</h3>);
    } else if (line.trim() === '---') {
      elements.push(<hr key={key} className="my-6 border-border" />);
    } else if (line.trim() === '') {
      elements.push(<div key={key} className="h-2" />);
    } else {
      elements.push(
        <p key={key} className="text-foreground/85 leading-relaxed my-2"
          dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
      );
    }
  });
  flushList('l-end');
  flushTable('t-end');
  return <div>{elements}</div>;
};

const inlineFormat = (text: string) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/`(.+?)`/g, '<code class="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-primary">$1</code>')
    .replace(/✓/g, '<span class="text-primary">✓</span>');
