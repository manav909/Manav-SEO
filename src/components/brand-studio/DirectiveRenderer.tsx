/* ════════════════════════════════════════════════════════════════
   src/components/brand-studio/DirectiveRenderer.tsx
   Brand Studio — Renders each directive type as a styled React block.

   Used as a child renderer by DocumentViewer. Each directive name maps
   to a function component. Unknown directives render as a fallback
   metadata card so authors can preview what they intended.

   Phase 1A — base renderers without chart/image/data fetch wired
   (those come in Phase 1B/1C/1D). The structure is here so later
   phases just swap implementations.
═══════════════════════════════════════════════════════════════ */

import { useMemo, type ReactNode, type ReactElement } from 'react';
import {
  Info, AlertTriangle, CheckCircle2, AlertOctagon, MessageSquare,
  TrendingUp, TrendingDown, Minus, Image as ImageIcon, BarChart3,
  Table as TableIcon, FileSignature, Quote as QuoteIcon, FileText,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { DirectiveAttrs } from './document-directives';

interface RendererProps {
  attrs:       DirectiveAttrs;
  body?:       ReactNode;   /* rendered children for container directives */
  rawBody?:    string;      /* raw text body (for chart inline data, etc.) */
  brandColor:  string;
  /** Optional data context for live references (Data Room values, attachments).
   *  Phase 1B/1C/1D populate this. Phase 1A passes empty. */
  dataContext?: {
    fields?:      Record<string, any>;
    attachments?: Array<{ id: string; signedUrl: string; alt?: string; caption?: string }>;
  };
}

/* ─── 1. Cover page ─────────────────────────────────────────────── */

export function CoverPage({ attrs, brandColor, dataContext }: RendererProps) {
  const title    = String(attrs.title    || '');
  const subtitle = String(attrs.subtitle || '');
  const date     = String(attrs.date     || '');
  const author   = String(attrs.author   || '');
  const recipient= String(attrs.recipient|| '');

  /* logo=auto pulls from dataContext.fields['brand.primary_logo_url'].
     Explicit URL passes through. */
  let logoSrc: string | null = null;
  if (attrs.logo === 'auto' || attrs.logo == null) {
    const url = dataContext?.fields?.['brand.primary_logo_url'];
    logoSrc = typeof url === 'string' && url ? url : null;
  } else {
    logoSrc = String(attrs.logo);
  }

  return (
    <div
      className="ds-cover-page my-6 rounded-2xl border p-8 print:border-0 print:rounded-none print:p-0 print:my-0 print:min-h-screen print:flex print:flex-col print:justify-between break-after-page"
      style={{
        borderColor:     `${brandColor}30`,
        background:      `linear-gradient(135deg, ${brandColor}10 0%, transparent 70%)`,
      }}
    >
      <div className="print:pt-24">
        {logoSrc && (
          <img src={logoSrc} alt="Logo" className="h-12 mb-8 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
        )}
        {title && (
          <h1 className="text-3xl md:text-4xl print:text-5xl font-bold mb-3 leading-tight" style={{ color: brandColor }}>
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-lg md:text-xl print:text-xl text-foreground/70 leading-snug">{subtitle}</p>
        )}
      </div>
      <div className="mt-8 print:mt-auto print:mb-16 grid grid-cols-2 gap-4 text-xs print:text-sm">
        {recipient && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Prepared for</div>
            <div className="font-semibold">{recipient}</div>
          </div>
        )}
        {author && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Prepared by</div>
            <div className="font-semibold">{author}</div>
          </div>
        )}
        {date && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">Date</div>
            <div className="font-semibold">{date}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 2. KPI tile ───────────────────────────────────────────────── */

export function Kpi({ attrs, brandColor, dataContext }: RendererProps) {
  /* Resolve value: inline OR pulled from Data Room via attrs.from */
  const liveValue = useMemo(() => {
    if (attrs.from && dataContext?.fields) {
      const key = String(attrs.from);
      return dataContext.fields[key];
    }
    return undefined;
  }, [attrs.from, dataContext]);

  const value = liveValue != null ? String(liveValue) : String(attrs.value ?? '—');
  const label = String(attrs.label || '');
  const sub   = attrs.sublabel ? String(attrs.sublabel) : (attrs.from ? `${attrs.from}` : '');
  const trendRaw = attrs.trend != null ? String(attrs.trend) : '';
  const trendNum = parseFloat(trendRaw.replace(/[%+]/g, ''));
  const trendDir = isNaN(trendNum) ? null : (trendNum > 0 ? 'up' : trendNum < 0 ? 'down' : 'flat');

  return (
    <div
      className="ds-kpi inline-block min-w-[180px] rounded-xl border bg-card/60 p-4 my-2 mr-3 align-top print:rounded-none print:bg-transparent print:border-2"
      style={{ borderColor: `${brandColor}33` }}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl print:text-3xl font-bold" style={{ color: brandColor }}>{value}</div>
        {trendDir && (
          <div className={`text-xs font-bold flex items-center gap-0.5 ${
            trendDir === 'up' ? 'text-green-500' : trendDir === 'down' ? 'text-red-500' : 'text-muted-foreground'
          }`}>
            {trendDir === 'up'   ? <TrendingUp   className="h-3 w-3" /> :
             trendDir === 'down' ? <TrendingDown className="h-3 w-3" /> :
             <Minus className="h-3 w-3" />}
            {trendRaw}
          </div>
        )}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1 font-mono">{sub}</div>}
    </div>
  );
}

/* ─── 3. Callout ────────────────────────────────────────────────── */

export function Callout({ attrs, body, brandColor }: RendererProps) {
  const tone = String(attrs.tone || 'info');
  const config: Record<string, { color: string; bg: string; border: string; Icon: any }> = {
    info:     { color: '#3b82f6', bg: '#3b82f608', border: '#3b82f640', Icon: Info },
    success:  { color: '#22c55e', bg: '#22c55e08', border: '#22c55e40', Icon: CheckCircle2 },
    warning:  { color: '#f59e0b', bg: '#f59e0b08', border: '#f59e0b40', Icon: AlertTriangle },
    critical: { color: '#ef4444', bg: '#ef444408', border: '#ef444440', Icon: AlertOctagon },
    neutral:  { color: brandColor, bg: `${brandColor}08`, border: `${brandColor}40`, Icon: MessageSquare },
  };
  const cfg = config[tone] || config.info;
  const title = attrs.title ? String(attrs.title) : null;

  return (
    <div
      className="ds-callout my-4 rounded-xl border p-4 print:rounded-none print:bg-transparent break-inside-avoid"
      style={{ borderColor: cfg.border, backgroundColor: cfg.bg, borderLeftWidth: '4px', borderLeftColor: cfg.color }}
    >
      <div className="flex items-start gap-2">
        <cfg.Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: cfg.color }} />
        <div className="min-w-0 flex-1">
          {title && (
            <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: cfg.color }}>{title}</div>
          )}
          <div className="text-sm text-foreground/90 leading-relaxed">{body}</div>
        </div>
      </div>
    </div>
  );
}

/* ─── 4. Quote / testimonial ────────────────────────────────────── */

export function Quote({ attrs, body, brandColor }: RendererProps) {
  const author = attrs.author ? String(attrs.author) : '';
  const role   = attrs.role   ? String(attrs.role)   : '';
  const source = attrs.source ? String(attrs.source) : '';
  const attribution = [author, role].filter(Boolean).join(', ');

  return (
    <figure className="ds-quote my-5 rounded-2xl border p-5 bg-card/40 relative print:rounded-none print:bg-transparent print:border-2 break-inside-avoid"
      style={{ borderColor: `${brandColor}30` }}>
      <QuoteIcon className="absolute top-3 right-3 h-6 w-6 opacity-20" style={{ color: brandColor }} />
      <blockquote className="text-base md:text-lg italic font-serif leading-relaxed text-foreground/95 mb-2">
        {body}
      </blockquote>
      {attribution && (
        <figcaption className="text-xs text-muted-foreground not-italic">
          <strong className="text-foreground">— {author}</strong>
          {role && <span>, {role}</span>}
          {source && <span className="block text-[10px] mt-0.5">{source}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/* ─── 5. Image ──────────────────────────────────────────────────── */

export function ImageBlock({ attrs, brandColor, dataContext }: RendererProps) {
  const srcRaw = String(attrs.src || '');
  let src     = srcRaw;
  let resolvedAlt     = attrs.alt     ? String(attrs.alt)     : '';
  let resolvedCaption = attrs.caption ? String(attrs.caption) : '';

  /* Resolve document://attachment-id via dataContext.attachments */
  if (srcRaw.startsWith('document://') && dataContext?.attachments) {
    const id = srcRaw.replace('document://', '');
    const attachment = dataContext.attachments.find((a) => a.id === id);
    if (attachment) {
      src = attachment.signedUrl;
      if (!resolvedAlt     && attachment.alt)     resolvedAlt     = attachment.alt;
      if (!resolvedCaption && attachment.caption) resolvedCaption = attachment.caption;
    } else {
      src = '';   /* triggers placeholder below */
    }
  }

  /* Resolve brand:logo via dataContext.fields (set by DocumentViewer
     when it has brand assets loaded) */
  if (srcRaw === 'brand:logo' || srcRaw === 'brand:logo_url') {
    const brandLogoUrl = dataContext?.fields?.['brand.primary_logo_url'];
    if (typeof brandLogoUrl === 'string' && brandLogoUrl) {
      src = brandLogoUrl;
    } else {
      src = '';
    }
  }

  const width = String(attrs.width || 'full');
  const widthClass =
    width === 'half'  ? 'max-w-[50%]'  :
    width === 'third' ? 'max-w-[33%]' :
    'max-w-full';

  if (!src) {
    return (
      <div className="my-4 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        <ImageIcon className="h-6 w-6 mx-auto mb-1 opacity-40" />
        <div>Image source not resolved</div>
        <code className="text-[10px] font-mono mt-1 block opacity-70">{srcRaw || '(empty)'}</code>
        {srcRaw.startsWith('document://') && (
          <div className="text-[10px] mt-1">
            This attachment ID isn't in the document's attachments list. Open <strong>Manage attachments</strong> to upload it.
          </div>
        )}
        {srcRaw.startsWith('brand:') && (
          <div className="text-[10px] mt-1">
            No brand logo set. Configure it in Brand Studio → Brand tab.
          </div>
        )}
      </div>
    );
  }

  return (
    <figure className={`ds-image my-4 ${widthClass} mx-auto break-inside-avoid`}>
      <img
        src={src}
        alt={resolvedAlt}
        className="w-full rounded-lg border border-border print:rounded-none print:border-2"
        style={{ borderColor: `${brandColor}20` }}
        onError={(e) => (e.currentTarget.style.opacity = '0.3')}
      />
      {resolvedCaption && (
        <figcaption className="text-[10px] text-muted-foreground text-center italic mt-1">
          {resolvedCaption}
        </figcaption>
      )}
    </figure>
  );
}

/* ─── 6. Chart (Phase 1B: real Recharts rendering) ────────────── */

/** Generate a palette of colors from a brand seed for multi-series charts. */
function palette(brand: string, count: number): string[] {
  const base = [brand, '#06b6d4', '#f59e0b', '#22c55e', '#ec4899', '#a855f7', '#3b82f6', '#ef4444'];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(base[i % base.length]);
  return out;
}

/** Parse chart data from one of three sources:
 *  - attrs.data (JSON string)
 *  - rawBody (JSON code block inside the container)
 *  - Future: dataContext fields (Phase 1D)
 *  Returns the array or null if unparseable. */
function parseChartData(attrs: DirectiveAttrs, rawBody?: string): any[] | null {
  /* Try attrs.data first */
  if (typeof attrs.data === 'string' && attrs.data.trim()) {
    try { const parsed = JSON.parse(attrs.data as string); return Array.isArray(parsed) ? parsed : null; } catch { /* fall through */ }
  }
  /* Try rawBody */
  if (rawBody && rawBody.trim()) {
    try { const parsed = JSON.parse(rawBody); return Array.isArray(parsed) ? parsed : null; } catch {}
  }
  return null;
}

export function Chart({ attrs, rawBody, brandColor }: RendererProps) {
  const type   = String(attrs.type  || 'line');
  const title  = attrs.title ? String(attrs.title) : '';
  const data   = parseChartData(attrs, rawBody);
  const xKey   = attrs.xKey ? String(attrs.xKey) : (data && data[0] ? Object.keys(data[0])[0] : 'x');
  const yKeysAttr = attrs.yKeys ? String(attrs.yKeys) :
                   attrs.yKey  ? String(attrs.yKey)  : '';
  /* If no yKeys/yKey specified, infer from data — first non-x key, or all non-x keys for multi-series */
  let yKeys: string[];
  if (yKeysAttr) {
    yKeys = yKeysAttr.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (data && data[0]) {
    yKeys = Object.keys(data[0]).filter((k) => k !== xKey);
    if (type === 'line' || type === 'bar' || type === 'area') {
      yKeys = yKeys.slice(0, 1);  /* default to single-series */
    }
  } else {
    yKeys = [];
  }

  const nameKey  = String(attrs.nameKey  || (data?.[0] ? Object.keys(data[0])[0] : 'name'));
  const valueKey = String(attrs.valueKey || (data?.[0] ? Object.keys(data[0])[1] || 'value' : 'value'));
  const colors   = palette(brandColor, Math.max(yKeys.length, data?.length || 0, 1));

  /* Empty / unparseable data — fall back to friendly placeholder */
  if (!data || data.length === 0) {
    if (attrs.from) {
      /* Has a Data Room reference but no resolved data yet — Phase 1D will populate */
      return (
        <div className="ds-chart-placeholder my-4 rounded-xl border-2 border-dashed p-6 text-center bg-card/40 break-inside-avoid"
          style={{ borderColor: `${brandColor}30` }}>
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" style={{ color: brandColor }} />
          <div className="text-sm font-bold" style={{ color: brandColor }}>{title || `${type} chart`}</div>
          <div className="text-[10px] text-muted-foreground mt-1 font-mono">{String(attrs.from)}{attrs.field ? `.${attrs.field}` : ''}</div>
          <div className="text-[10px] text-muted-foreground mt-2 italic">Live data wiring ships in Phase 1D</div>
        </div>
      );
    }
    return (
      <div className="ds-chart-empty my-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-3 text-xs text-amber-500">
        Chart "{title || type}" has no parseable data. Provide JSON in a fenced code block inside the directive, or set `data="..."` in attrs.
      </div>
    );
  }

  /* Common axis + grid styling */
  const gridColor = `${brandColor}15`;
  const axisColor = '#888';

  return (
    <figure className="ds-chart my-4 break-inside-avoid">
      {title && (
        <figcaption className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: brandColor }}>
          {title}
        </figcaption>
      )}
      <div className="rounded-xl border bg-card/40 p-3 print:rounded-none print:bg-transparent print:border-2" style={{ borderColor: `${brandColor}20` }}>
        <div style={{ width: '100%', height: 280 }} className="print:!h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(type, data, xKey, yKeys, nameKey, valueKey, colors, gridColor, axisColor)}
          </ResponsiveContainer>
        </div>
        {attrs.footnote && (
          <div className="text-[10px] text-muted-foreground italic mt-2">{String(attrs.footnote)}</div>
        )}
      </div>
    </figure>
  );
}

/** Switch over chart type → return the right Recharts element. Returns ReactElement
 *  (Recharts requires a single element child for ResponsiveContainer). */
function renderChart(
  type: string,
  data: any[],
  xKey: string,
  yKeys: string[],
  nameKey: string,
  valueKey: string,
  colors: string[],
  gridColor: string,
  axisColor: string,
): ReactElement {
  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
      <XAxis dataKey={xKey} tick={{ fill: axisColor, fontSize: 11 }} axisLine={{ stroke: gridColor }} tickLine={{ stroke: gridColor }} />
      <YAxis tick={{ fill: axisColor, fontSize: 11 }} axisLine={{ stroke: gridColor }} tickLine={{ stroke: gridColor }} />
      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
      {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
    </>
  );

  switch (type) {
    case 'line':
      return (
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {commonAxes}
          {yKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={colors[i]} strokeWidth={2} dot={{ fill: colors[i], r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      );

    case 'area':
      return (
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {commonAxes}
          {yKeys.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k} stroke={colors[i]} fill={`${colors[i]}40`} strokeWidth={2} />
          ))}
        </AreaChart>
      );

    case 'bar':
      return (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {commonAxes}
          {yKeys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={colors[i]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      );

    case 'stackedBar':
    case 'stacked-bar':
      return (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {commonAxes}
          {yKeys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={colors[i]} stackId="a" />
          ))}
        </BarChart>
      );

    case 'pie': {
      /* Pie expects [{ nameKey: ..., valueKey: ... }, ...] */
      return (
        <PieChart>
          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            outerRadius={90}
            label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
          </Pie>
        </PieChart>
      );
    }

    case 'scatter':
      return (
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {commonAxes}
          {yKeys.map((k, i) => (
            <Scatter key={k} name={k} dataKey={k} fill={colors[i]} />
          ))}
        </ScatterChart>
      );

    case 'milestone': {
      /* Custom timeline: render as horizontal scatter with status-colored dots.
         Expects data of shape [{ date, label, status }] where status ∈ done|in-progress|upcoming. */
      const statusColor = (s: any) => s === 'done' ? '#22c55e' : s === 'in-progress' ? '#f59e0b' : '#94a3b8';
      const mapped = data.map((d, i) => ({ ...d, _y: 1, _i: i }));
      return (
        <ScatterChart margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
          <XAxis dataKey={xKey} type="category" tick={{ fill: axisColor, fontSize: 11 }} axisLine={{ stroke: gridColor }} tickLine={{ stroke: gridColor }} />
          <YAxis type="number" dataKey="_y" hide domain={[0, 2]} />
          <Tooltip
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
            formatter={(_v: any, _name: any, item: any) => [item?.payload?.label || '—', item?.payload?.status || '']}
          />
          <ReferenceLine y={1} stroke={gridColor} strokeWidth={2} />
          <Scatter
            data={mapped}
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              const color = statusColor(payload?.status);
              return (
                <g>
                  <circle cx={cx} cy={cy} r={8} fill={color} stroke="white" strokeWidth={2} />
                  <text x={cx} y={cy - 14} fontSize={10} fill="hsl(var(--foreground))" textAnchor="middle" fontWeight="600">
                    {payload?.label || ''}
                  </text>
                </g>
              );
            }}
          />
        </ScatterChart>
      );
    }

    default:
      /* Unknown type — render as line by default */
      return (
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {commonAxes}
          {yKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={colors[i]} strokeWidth={2} />
          ))}
        </LineChart>
      );
  }
}

/* ─── 7. Data table (Phase 1A: placeholder; Phase 1D will wire live data) ── */

export function DataTable({ attrs, brandColor }: RendererProps) {
  const title = attrs.title ? String(attrs.title) : '';
  const from  = String(attrs.from || '');
  const cols  = attrs.columns ? String(attrs.columns).split(',').map((s) => s.trim()) : [];

  return (
    <div className="ds-data-table-placeholder my-4 rounded-xl border-2 border-dashed p-4 bg-card/40 break-inside-avoid"
      style={{ borderColor: `${brandColor}30` }}>
      <div className="flex items-center gap-2">
        <TableIcon className="h-4 w-4" style={{ color: brandColor }} />
        <div className="text-sm font-bold" style={{ color: brandColor }}>{title || 'Live data table'}</div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-2 font-mono">
        from: {from}
        {cols.length > 0 && <div>columns: {cols.join(', ')}</div>}
      </div>
      <div className="text-[10px] text-muted-foreground mt-2 italic">
        Live data table ships in Phase 1D
      </div>
    </div>
  );
}

/* ─── 8. Page break ─────────────────────────────────────────────── */

export function PageBreak(_props: RendererProps) {
  return (
    <div className="ds-page-break print:break-after-page my-6">
      <div className="print:hidden border-t-2 border-dashed border-border my-4 relative">
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider bg-background px-2 text-muted-foreground font-bold">
          Page break
        </div>
      </div>
    </div>
  );
}

/* ─── 9. Signature ──────────────────────────────────────────────── */

export function Signature({ attrs, brandColor }: RendererProps) {
  const name  = String(attrs.name  || '');
  const title = attrs.title ? String(attrs.title) : '';
  const date  = attrs.date  ? String(attrs.date)  : '';

  return (
    <div className="ds-signature my-6 break-inside-avoid">
      <div className="border-t border-foreground/30 pt-2 max-w-xs">
        <div className="flex items-center gap-1">
          <FileSignature className="h-3 w-3 opacity-50" style={{ color: brandColor }} />
          <div className="text-sm font-bold">{name}</div>
        </div>
        {title && <div className="text-[10px] text-muted-foreground">{title}</div>}
        {date && <div className="text-[10px] text-muted-foreground italic mt-0.5">{date}</div>}
      </div>
    </div>
  );
}

/* ─── 10. Footer meta (configures the print footer text) ────────── */

export function FooterMeta({ attrs }: RendererProps) {
  /* Leaf directive — doesn't render visible content on screen.
     The DocumentViewer reads its attrs separately to populate the print footer. */
  const text = attrs.text ? String(attrs.text) : '';
  return (
    <div className="ds-footer-meta hidden" data-footer-text={text} data-show-page-number={attrs.showPageNumber === true ? '1' : '0'} />
  );
}

/* ─── Unknown directive fallback ────────────────────────────────── */

export function UnknownDirective({ attrs, body, rawBody }: RendererProps & { name?: string }) {
  return (
    <div className="ds-unknown my-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3">
      <div className="text-[10px] uppercase tracking-wider text-amber-500 font-bold mb-1 flex items-center gap-1">
        <FileText className="h-3 w-3" />
        Unknown directive
      </div>
      <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre-wrap">
        {JSON.stringify(attrs, null, 2)}
      </pre>
      {(body || rawBody) && (
        <div className="mt-1 text-[11px] text-foreground/80 italic">{body}</div>
      )}
    </div>
  );
}

/* ─── Main dispatcher ───────────────────────────────────────────── */

export const DIRECTIVE_COMPONENTS = {
  'cover-page':  CoverPage,
  'kpi':         Kpi,
  'callout':     Callout,
  'quote':       Quote,
  'image':       ImageBlock,
  'chart':       Chart,
  'data-table':  DataTable,
  'page-break':  PageBreak,
  'signature':   Signature,
  'footer-meta': FooterMeta,
} as const;

interface DispatcherProps {
  name:        string;
  attrs:       DirectiveAttrs;
  body?:       ReactNode;
  rawBody?:    string;
  brandColor:  string;
  dataContext?: RendererProps['dataContext'];
}

export default function DirectiveDispatcher(props: DispatcherProps) {
  const Component = (DIRECTIVE_COMPONENTS as any)[props.name];
  if (!Component) return <UnknownDirective {...props} />;
  return <Component attrs={props.attrs} body={props.body} rawBody={props.rawBody} brandColor={props.brandColor} dataContext={props.dataContext} />;
}
