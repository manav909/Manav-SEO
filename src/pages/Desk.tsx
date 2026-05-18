/**
 * ◈ BRAIN DESK — Everything Manav Brain has ever generated, all in one place.
 * Searchable, filterable, exportable as PDF / Markdown / JSON.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectSync } from '@/hooks/useProjectSync';
import { supabase } from '@/lib/supabase';
import PortalNav from '@/components/PortalNav';
import {
  FileText, Download, Trash2, Pin, Search, Filter,
  BarChart2, Code2, Brain, AlertCircle, ChevronDown,
  ChevronUp, Plus, X, Copy, Check, RefreshCw, BookOpen,
  Layers, ArrowLeft, Star,
} from 'lucide-react';

/* ─── Types ─── */
interface DeskItem {
  id: string;
  project_id: string;
  title: string;
  content_type: 'text' | 'report' | 'chart' | 'code' | 'analysis' | 'note' | 'audit';
  content: string;
  metadata: any;
  tags: string[];
  source: string;
  pinned: boolean;
  created_at: string;
}

/* ─── Constants ─── */
const TYPE_CFG: Record<string, { icon: any; color: string; label: string }> = {
  text:     { icon: FileText,  color: '#a5b4fc', label: 'Analysis'  },
  report:   { icon: BookOpen,  color: '#34d399', label: 'Report'    },
  chart:    { icon: BarChart2, color: '#f59e0b', label: 'Chart'     },
  code:     { icon: Code2,     color: '#06b6d4', label: 'Code'      },
  analysis: { icon: Brain,     color: '#f472b6', label: 'Analysis'  },
  note:     { icon: FileText,  color: '#94a3b8', label: 'Note'      },
  audit:    { icon: AlertCircle,color:'#fb923c', label: 'Audit'     },
};

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'pinned',   label: '⭐ Pinned' },
  { key: 'text',     label: 'Analyses' },
  { key: 'report',   label: 'Reports' },
  { key: 'chart',    label: 'Charts' },
  { key: 'code',     label: 'Code' },
  { key: 'audit',    label: 'Audits' },
  { key: 'note',     label: 'Notes' },
];

/* ─── Export helpers ─── */
async function exportPDF(item: DeskItem) {
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFillColor(3, 7, 18);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(165, 180, 252);
    doc.setFontSize(18);
    doc.text(item.title, 20, 22);
    doc.setTextColor(99, 102, 241);
    doc.setFontSize(9);
    doc.text(`${item.content_type.toUpperCase()} · ${new Date(item.created_at).toLocaleDateString()} · Source: ${item.source}`, 20, 30);
    doc.setDrawColor(99, 102, 241);
    doc.line(20, 34, 190, 34);
    doc.setTextColor(210, 210, 210);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(item.content || '', 170);
    let y = 42;
    for (const line of lines) {
      if (y > 270) { doc.addPage(); doc.setFillColor(3, 7, 18); doc.rect(0,0,210,297,'F'); y = 20; }
      doc.text(line, 20, y);
      y += 6;
    }
    if (item.tags?.length) {
      y += 4;
      doc.setTextColor(99, 102, 241);
      doc.setFontSize(8);
      doc.text(`Tags: ${item.tags.join(', ')}`, 20, y);
    }
    doc.save(`${item.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  } catch (_e) { alert('PDF export failed. Try copy instead.'); }
}

function exportMarkdown(item: DeskItem) {
  const md = [
    `# ${item.title}`,
    `> **Type:** ${item.content_type} | **Source:** ${item.source} | **Date:** ${new Date(item.created_at).toLocaleDateString()}`,
    '',
    item.content || '',
    '',
    item.tags?.length ? `**Tags:** ${item.tags.map(t=>`\`${t}\``).join(' ')}` : '',
  ].filter(l => l !== undefined).join('\n');
  const blob = new Blob([md], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${item.title.replace(/\s+/g, '-').toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(items: DeskItem[]) {
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `brain-desk-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── DeskCard ─── */
function DeskCard({ item, onPin, onDelete, onExport }: {
  item: DeskItem;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onExport: (item: DeskItem, fmt: 'pdf' | 'md') => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const cfg = TYPE_CFG[item.content_type] || TYPE_CFG.text;
  const Icon = cfg.icon;
  const preview = (item.content || '').slice(0, 220);

  const copy = () => {
    navigator.clipboard.writeText(item.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      background: item.pinned ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${item.pinned ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 12, padding: '14px', display: 'flex', flexDirection: 'column', gap: 8,
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${cfg.color}14`,
          border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} style={{ color: cfg.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.3, marginBottom: 2, wordBreak: 'break-word' }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: cfg.color,
              background: `${cfg.color}12`, borderRadius: 4, padding: '1px 5px' }}>
              {cfg.label}
            </span>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
              {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
            </span>
            {item.source && <span style={{ fontSize: 8, color: 'rgba(99,102,241,0.45)', fontFamily: 'monospace' }}>via {item.source}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={() => onPin(item.id, !item.pinned)} title="Pin"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3,
              color: item.pinned ? '#f59e0b' : 'rgba(255,255,255,0.2)' }}>
            <Star size={11} fill={item.pinned ? '#f59e0b' : 'none'} />
          </button>
          <button onClick={copy} title="Copy"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3,
              color: copied ? '#10b981' : 'rgba(255,255,255,0.2)' }}>
            {copied ? <Check size={11}/> : <Copy size={11}/>}
          </button>
          <button onClick={() => onExport(item, 'pdf')} title="Export PDF"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3,
              color: 'rgba(255,255,255,0.2)' }}>
            <Download size={11}/>
          </button>
          <button onClick={() => onExport(item, 'md')} title="Export Markdown"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3,
              color: 'rgba(255,255,255,0.2)', fontSize: 8, fontFamily: 'monospace' }}>
            .md
          </button>
          <button onClick={() => onDelete(item.id)} title="Delete"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3,
              color: 'rgba(239,68,68,0.4)' }}>
            <Trash2 size={11}/>
          </button>
        </div>
      </div>

      {/* Content preview */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {expanded ? (item.content || '') : preview}
        {(item.content || '').length > 220 && (
          <button onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1',
              fontSize: 10, fontFamily: 'monospace', padding: '2px 0', display: 'block', marginTop: 4 }}>
            {expanded ? '▲ Show less' : `▼ Show all (${(item.content||'').length} chars)`}
          </button>
        )}
      </div>

      {/* Tags */}
      {item.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
          {item.tags.slice(0, 6).map((tag, i) => (
            <span key={i} style={{ fontSize: 8, padding: '1px 6px', borderRadius: 4,
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.28)',
              fontFamily: 'monospace' }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function Desk() {
  const { projects, clients } = useAuth();
  const navigate  = useNavigate();
  const [selProj, setSelProj]   = useState(() => localStorage.getItem('seo_season_proj') || '');
  const handleProjectChange = useProjectSync(selProj, setSelProj);
  const [items,   setItems]     = useState<DeskItem[]>([]);
  const [loading, setLoading]   = useState(false);
  const [filter,  setFilter]    = useState('all');
  const [search,  setSearch]    = useState('');
  const [adding,  setAdding]    = useState(false);
  const [newTitle,setNewTitle]  = useState('');
  const [newContent,setNewContent] = useState('');
  const [newType, setNewType]   = useState<DeskItem['content_type']>('note');
  const [saving,  setSaving]    = useState(false);

  const load = useCallback(async () => {
    if (!selProj) return;
    setLoading(true);
    try {
      let q: any = supabase.from('brain_desk').select('*').eq('project_id', selProj);
      if (filter === 'pinned') q = q.eq('pinned', true);
      else if (filter !== 'all') q = q.eq('content_type', filter);
      q = q.order('pinned', { ascending: false }).order('created_at', { ascending: false });
      const { data } = await q;
      setItems(data || []);
    } catch (_e) { /* silent */ }
    setLoading(false);
  }, [selProj, filter]);

  useEffect(() => { load(); }, [load]);

  // Auto-select project
  useEffect(() => {
    if (!selProj && projects.length === 1) setSelProj(projects[0].id);
  }, [projects, selProj]);

  // Sync with localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'seo_season_proj' && e.newValue) setSelProj(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handlePin    = async (id: string, pinned: boolean) => {
    await supabase.from('brain_desk').update({ pinned }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, pinned } : i));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    await supabase.from('brain_desk').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleExport = (item: DeskItem, fmt: 'pdf'|'md') => {
    if (fmt === 'pdf') exportPDF(item);
    else               exportMarkdown(item);
  };

  const saveNote = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('brain_desk').insert({
      project_id: selProj || null, title: newTitle, content_type: newType,
      content: newContent, source: 'manual', updated_at: new Date().toISOString(),
    }).select().single();
    setSaving(false);
    if (data) { setItems(prev => [data, ...prev]); setAdding(false); setNewTitle(''); setNewContent(''); }
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.title?.toLowerCase().includes(q) || item.content?.toLowerCase().includes(q) || item.tags?.some(t => t.includes(q));
  });

  const selProject = projects.find(p => p.id === selProj);
  const selClient  = clients.find(c => c.id === selProject?.client_id);
  const pinnedCount = items.filter(i => i.pinned).length;
  const totalChars  = items.reduce((sum, i) => sum + (i.content?.length || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#030712', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      <PortalNav />
      {/* Background grid */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.03 }}>
        <svg width="100%" height="100%"><defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#a5b4fc" strokeWidth="0.5"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#grid)"/></svg>
      </div>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 40% at 50% 0%,rgba(99,102,241,0.06) 0%,transparent 70%)' }}/>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '0 24px 40px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
          <button onClick={() => navigate(-1)}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'rgba(255,255,255,0.45)',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <ArrowLeft size={12}/> Back
          </button>
          <Brain size={22} style={{ color: '#a5b4fc', filter: 'drop-shadow(0 0 8px rgba(99,102,241,0.6))' }}/>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.06em',
              color: '#e0e7ff', margin: 0 }}>◈ BRAIN DESK</h1>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginTop: 2 }}>
              {items.length} items · {pinnedCount} pinned · {(totalChars/1000).toFixed(0)}k chars stored
            </div>
          </div>

          {/* Project selector */}
          <select value={selProj} onChange={e => { setSelProj(e.target.value); localStorage.setItem('seo_season_proj', e.target.value); }}
            style={{ height: 34, padding: '0 10px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11,
              color: 'rgba(255,255,255,0.65)', outline: 'none', cursor: 'pointer' }}>
            <option value="">Select Project</option>
            {(projects||[]).filter((p:any)=>p?.id).map(p => { const cl = clients.find(c => c.id === p.client_id); return (
              <option key={p.id} value={p.id}>{cl?.company || p.name}</option>
            ); })}
          </select>

          {/* Export all */}
          <button onClick={() => exportJSON(filtered)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, padding: '7px 14px',
              color: '#a5b4fc', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
            <Download size={12}/> Export All JSON
          </button>

          {/* Add note */}
          <button onClick={() => setAdding(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              border: 'none', borderRadius: 8, padding: '7px 14px', color: 'white',
              fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
              boxShadow: '0 0 14px rgba(99,102,241,0.3)' }}>
            <Plus size={12}/> Add Note
          </button>
        </div>

        {/* ── Add Note Modal ── */}
        {adding && (
          <div style={{ background: 'rgba(10,15,30,0.97)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 14, padding: 20, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#a5b4fc', fontWeight: 700 }}>+ ADD TO DESK</span>
              <button onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)' }}><X size={14}/></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 10 }}>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                  padding: '8px 12px', fontSize: 12, color: 'white', outline: 'none' }}/>
              <select value={newType} onChange={e => setNewType(e.target.value as any)}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                  padding: '8px 10px', fontSize: 11, color: 'rgba(255,255,255,0.6)', outline: 'none', cursor: 'pointer' }}>
                {Object.entries(TYPE_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Content..." rows={5}
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'rgba(255,255,255,0.7)',
                outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}/>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setAdding(false)}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                  padding: '6px 14px', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveNote} disabled={saving || !newTitle.trim() || !newContent.trim()}
                style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', border: 'none', borderRadius: 7,
                  padding: '6px 16px', color: 'white', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
                  opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save to Desk'}
              </button>
            </div>
          </div>
        )}

        {/* ── Filters + Search ── */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ background: filter === f.key ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${filter === f.key ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 7, padding: '5px 11px', fontSize: 10, fontFamily: 'monospace',
                  color: filter === f.key ? '#a5b4fc' : 'rgba(255,255,255,0.35)', cursor: 'pointer' }}>
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '6px 10px' }}>
            <Search size={11} style={{ color: 'rgba(255,255,255,0.25)' }}/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search desk..."
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: 11,
                color: 'rgba(255,255,255,0.65)', width: 160 }}/>
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)' }}><X size={10}/></button>}
          </div>
          <button onClick={load}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7,
              padding: '5px 10px', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <RefreshCw size={10} style={loading ? { animation: 'spin 1s linear infinite' } : {}}/> Refresh
          </button>
        </div>

        {/* ── Content ── */}
        {!selProj ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Layers size={40} style={{ color: 'rgba(255,255,255,0.05)', margin: '0 auto 12px' }}/>
            <div style={{ fontSize: 14, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)' }}>SELECT A PROJECT TO VIEW YOUR DESK</div>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.4)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }}/>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>LOADING DESK...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Brain size={40} style={{ color: 'rgba(99,102,241,0.15)', margin: '0 auto 12px' }}/>
            <div style={{ fontSize: 14, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', marginBottom: 8 }}>
              {search ? 'NO RESULTS FOR YOUR SEARCH' : 'DESK IS EMPTY'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.1)', fontFamily: 'monospace' }}>
              {search ? 'Try different keywords' : 'Ask Manav Brain anything — every response has a "Save to Desk" button'}
            </div>
          </div>
        ) : (
          <div style={{ columns: '380px', gap: 16, columnFill: 'balance' }}>
            {filtered.map(item => (
              <div key={item.id} style={{ breakInside: 'avoid', marginBottom: 16, display: 'inline-block', width: '100%' }}>
                <DeskCard item={item} onPin={handlePin} onDelete={handleDelete} onExport={handleExport}/>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg);}to{transform:rotate(360deg);} }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2); }
        select option { background: #0a0f1e; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 3px; }
      `}</style>
    </div>
  );
}