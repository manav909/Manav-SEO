import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Download, FileDown, Loader2, Sparkles, Wrench, FileText, Megaphone, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { DELIVERABLES, LOADING_STEPS, type DeliverableType } from '@/lib/seoGenerator';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
  const pdfContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    const interval = setInterval(() => {
      setStepIdx((i) => {
        if (i >= LOADING_STEPS.length - 1) return i;
        return i + 1;
      });
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
      let accumulatedOutput = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('[STREAM_ERROR]')) {
          toast({ title: 'Error', description: chunk, variant: 'destructive' });
          break;
        }
        accumulatedOutput += chunk;
        setOutput(accumulatedOutput);
      }
      setLoading(false);
      setActiveTab('rendered');
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to generate deliverable.', variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    toast({ title: 'Copied to clipboard', description: 'Markdown deliverable ready to paste.' });
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
    toast({ title: 'Download started', description: 'Open the .md file in any editor.' });
  };

  const handleDownloadPdf = async () => {
    if (!output || !pdfContentRef.current) return;
    setExportingPdf(true);
    toast({ title: 'Generating PDF...', description: 'Please wait a moment.' });

    try {
      // Switch to rendered tab so the formatted content is visible
      setActiveTab('rendered');
      await new Promise((r) => setTimeout(r, 300));

      const element = pdfContentRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,           // High resolution
        useCORS: true,
        backgroundColor: '#0f1117',
        logging: false,
        windowWidth: 900,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if content is long
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`seo-${selected}-${Date.now()}.pdf`);
      toast({ title: 'PDF downloaded!', description: 'Your report has been saved.' });
    } catch (err) {
      console.error(err);
      toast({ title: 'PDF failed', description: 'Could not generate PDF. Try the Markdown download instead.', variant: 'destructive' });
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

        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          <div className="space-y-2">
            <Label htmlFor="url" className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Target Website URL
            </Label>
            <Input
              id="url"
              type="text"
              placeholder="yourdomain.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              className="h-12 text-base bg-background/60 border-border focus-visible:ring-primary focus-visible:ring-offset-0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keyword" className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Main Keyword or Topic
            </Label>
            <Input
              id="keyword"
              type="text"
              placeholder="e.g. project management software"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              disabled={loading}
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
                  key={d.id}
                  type="button"
                  onClick={() => setSelected(d.id)}
                  disabled={loading}
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

        <Button
          type="submit"
          disabled={loading}
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
              <div className="text-xs font-mono text-primary uppercase tracking-widest mb-1">
                ✓ Deliverable ready
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold">{currentDeliverable.title}</h2>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={handleCopy}
                className="border-border hover:border-primary hover:text-primary bg-card/60"
              >
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>

              <Button
                variant="outline"
                onClick={handleDownloadMd}
                className="border-border hover:border-primary hover:text-primary bg-card/60"
              >
                <Download className="h-4 w-4 mr-2" />
                Markdown
              </Button>

              <Button
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {exportingPdf ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                {exportingPdf ? 'Generating...' : 'PDF'}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl shadow-card overflow-hidden">
            <div className="flex border-b border-border bg-secondary/30">
              {(['rendered', 'markdown'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-6 py-3.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'rendered' ? 'Formatted' : 'Markdown'}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-4 right-4 h-px bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
                  )}
                </button>
              ))}
            </div>

            {/* This div is what gets captured for PDF */}
            <div ref={pdfContentRef} className="p-6 sm:p-10 max-h-[70vh] overflow-y-auto">
              {activeTab === 'rendered' ? (
                <RenderedMarkdown source={output} />
              ) : (
                <pre className="font-mono text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {output}
                </pre>
              )}
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
                  <td key={ci} className="px-4 py-2.5 text-foreground/80" dangerouslySetInnerHTML={{ __html: inlineFormat(c) }} />
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
        <p key={key} className="text-foreground/85 leading-relaxed my-2" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
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
