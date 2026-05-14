/**
 * IntroAnimation — Cinematic full-screen intro for SEO Season by Manav
 *
 * 7 phases, ~14 seconds:
 *  0. Blackout + ◈ genesis
 *  1. Cosmos — particle field of search data
 *  2. Descent — fly-through of SERP data universe
 *  3. Domination — SERP board assembles, brand rises to #1
 *  4. Intelligence — Manav Brain neural network forms
 *  5. Identity — MANAV + SEO SEASON brand reveal
 *  6. Portal — CTA to enter, replay button
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

/* ─── Timing config (ms) ─── */
const T = {
  phase0: 0,
  phase1: 1400,
  phase2: 3200,
  phase3: 5800,
  phase4: 8200,
  phase5: 10000,
  phase6: 12200,
  done:   14000,
};

/* ─── Particle system ─── */
type Particle = {
  x: number; y: number; vx: number; vy: number;
  r: number; alpha: number; color: string; type: 'dot' | 'data' | 'neural';
  label?: string; life: number; maxLife: number;
};

const COLORS = ['#6366f1','#00d4ff','#10b981','#a78bfa','#f472b6','#fbbf24'];
const KEYWORDS = [
  'RANK #1','AI VISIBILITY','ORGANIC GROWTH','SERP DOMINANCE',
  'TOPICAL AUTHORITY','LLM CITATIONS','SCHEMA MARKUP','E-E-A-T SIGNALS',
  'BACKLINK VELOCITY','CORE WEB VITALS','INTENT MAPPING','CTR UPLIFT',
  'FEATURED SNIPPETS','ENTITY COVERAGE','SEARCH INTELLIGENCE',
];
const COMPETITORS = ['competitor.com','old-agency.io','generic-seo.com','mediocre-blog.net','average-site.co'];

interface Props {
  onComplete: () => void;
}

export default function IntroAnimation({ onComplete }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const startRef   = useRef<number>(0);
  const phaseRef   = useRef<number>(0);
  const [phase,    setPhase]    = useState(0);
  const [visible,  setVisible]  = useState(true);
  const particlesRef = useRef<Particle[]>([]);

  /* ─── Canvas loop ─── */
  const loop = useCallback((now: number) => {
    if (!startRef.current) startRef.current = now;
    const elapsed = now - startRef.current;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const W = c.width, H = c.height;
    const cx = W / 2, cy = H / 2;

    // Phase advancement
    const newPhase = Object.entries(T).reduce((p, [, t]) => elapsed >= t ? p + 1 : p, 0) - 1;
    if (newPhase !== phaseRef.current) {
      phaseRef.current = newPhase;
      setPhase(newPhase);
    }

    // Clear with fade trail
    const trailAlpha = elapsed < T.phase2 ? 0.12 : elapsed < T.phase3 ? 0.18 : 0.08;
    ctx.fillStyle = `rgba(3,7,18,${trailAlpha})`;
    ctx.fillRect(0, 0, W, H);

    const p = phaseRef.current;

    /* ── PHASE 0: genesis ripple ── */
    if (p === 0) {
      const t = (elapsed - T.phase0) / (T.phase1 - T.phase0);
      if (t > 0.3) {
        const rippleR = t * 200;
        const rippleA = Math.max(0, 0.6 - t * 0.6);
        ctx.beginPath();
        ctx.arc(cx, cy, rippleR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(99,102,241,${rippleA})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Inner pulse
        ctx.beginPath();
        ctx.arc(cx, cy, rippleR * 0.3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0,212,255,${rippleA * 1.5})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    /* ── PHASE 1: cosmos — particle field ── */
    if (p >= 1) {
      const t = Math.min(1, (elapsed - T.phase1) / 1200);
      // Spawn particles
      if (elapsed < T.phase2 && Math.random() < 0.35 * t) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = 50 + Math.random() * Math.max(W, H) * 0.7;
        particlesRef.current.push({
          x: cx + Math.cos(angle) * dist * 0.1,
          y: cy + Math.sin(angle) * dist * 0.1,
          vx: Math.cos(angle) * (0.4 + Math.random() * 1.2),
          vy: Math.sin(angle) * (0.4 + Math.random() * 1.2),
          r: 0.8 + Math.random() * 2,
          alpha: 0.4 + Math.random() * 0.6,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          type: Math.random() < 0.12 ? 'data' : 'dot',
          label: Math.random() < 0.12 ? KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)] : undefined,
          life: 0, maxLife: 120 + Math.random() * 180,
        });
      }
    }

    /* ── PHASE 2: descent — fly-through ── */
    if (p >= 2) {
      const t = (elapsed - T.phase2) / (T.phase3 - T.phase2);
      // Spawn speed lines
      if (elapsed < T.phase3 && Math.random() < 0.6) {
        const y = Math.random() * H;
        const len = 60 + Math.random() * 200;
        const speed = 8 + Math.random() * 16;
        const col = COLORS[Math.floor(Math.random() * COLORS.length)];
        // Draw directly (not particle)
        const x = -len + Math.random() * (W + len);
        const a = 0.2 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.strokeStyle = col.replace(')', `,${a})`).replace('rgb', 'rgba');
        ctx.lineWidth   = 0.5 + Math.random() * 1.5;
        ctx.stroke();
      }
      // Spawn keyword nodes flying past
      if (elapsed < T.phase3 && Math.random() < 0.04) {
        particlesRef.current.push({
          x: cx - 300 + Math.random() * 600,
          y: cy - 200 + Math.random() * 400,
          vx: (Math.random() - 0.5) * 0.5,
          vy: 3 + Math.random() * 5,
          r: 1, alpha: 0.9,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          type: 'data',
          label: KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)],
          life: 0, maxLife: 60,
        });
      }
    }

    /* ── PHASE 4: neural network ── */
    if (p === 4) {
      const t = Math.min(1, (elapsed - T.phase4) / 1600);
      const nodes = 12;
      const nodePositions: [number, number][] = Array.from({ length: nodes }, (_, i) => {
        const angle = (i / nodes) * Math.PI * 2 + elapsed * 0.001;
        const r2    = 80 + 60 * Math.sin(elapsed * 0.002 + i);
        return [cx + Math.cos(angle) * r2 * t, cy + Math.sin(angle) * r2 * t * 0.6];
      });
      // Draw neural connections
      nodePositions.forEach(([nx, ny], i) => {
        nodePositions.forEach(([mx, my], j) => {
          if (j <= i) return;
          const dist = Math.hypot(nx - mx, ny - my);
          if (dist > 160) return;
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(mx, my);
          ctx.strokeStyle = `rgba(99,102,241,${(0.4 - dist / 400) * t})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        });
        // Node dot
        ctx.beginPath();
        ctx.arc(nx, ny, 3 * t, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,212,255,${0.8 * t})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00d4ff';
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    /* ── Draw and age particles ── */
    particlesRef.current = particlesRef.current.filter(pt => {
      pt.life++;
      pt.x += pt.vx;
      pt.y += pt.vy;
      if (p >= 2) { pt.vx *= 0.995; pt.vy *= 0.995; }
      const lifeRatio = pt.life / pt.maxLife;
      const a = pt.alpha * (1 - lifeRatio);

      if (pt.type === 'data' && pt.label) {
        ctx.font = `700 ${9 + pt.r}px monospace`;
        ctx.fillStyle = pt.color.replace(')', `,${a * 0.85})`).replace('#', 'rgba(').replace(/([0-9a-f]{2})/gi, (m) => parseInt(m,16)+',').slice(0,-1) + ')';
        // Parse hex properly
        const hex = pt.color.replace('#','');
        const r2 = parseInt(hex.slice(0,2),16);
        const g2 = parseInt(hex.slice(2,4),16);
        const b2 = parseInt(hex.slice(4,6),16);
        ctx.fillStyle = `rgba(${r2},${g2},${b2},${a * 0.9})`;
        ctx.fillText(pt.label, pt.x, pt.y);
      } else if (pt.type === 'neural') {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        const hex = pt.color.replace('#','');
        const r2 = parseInt(hex.slice(0,2),16);
        const g2 = parseInt(hex.slice(2,4),16);
        const b2 = parseInt(hex.slice(4,6),16);
        ctx.fillStyle = `rgba(${r2},${g2},${b2},${a})`;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        const hex = pt.color.replace('#','');
        const r2 = parseInt(hex.slice(0,2),16);
        const g2 = parseInt(hex.slice(2,4),16);
        const b2 = parseInt(hex.slice(4,6),16);
        ctx.fillStyle = `rgba(${r2},${g2},${b2},${a})`;
        ctx.shadowBlur = pt.r > 1.5 ? 6 : 0;
        ctx.shadowColor = pt.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      return pt.life < pt.maxLife && pt.x > -100 && pt.x < W + 100 && pt.y > -100 && pt.y < H + 100;
    });

    /* ── Scanlines overlay ── */
    ctx.fillStyle = 'rgba(0,0,0,0.015)';
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 1);
    }

    if (elapsed < T.done) {
      rafRef.current = requestAnimationFrame(loop);
    }
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, [loop]);

  const handleSkip = () => {
    cancelAnimationFrame(rafRef.current);
    setVisible(false);
    setTimeout(onComplete, 300);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#030712', overflow: 'hidden',
      fontFamily: "'Courier New', Courier, monospace",
    }}>
      {/* Canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>

      {/* Phase 0 — genesis */}
      <Phase0 phase={phase}/>

      {/* Phase 1 — cosmos header */}
      <Phase1 phase={phase}/>

      {/* Phase 2 — descent */}
      <Phase2 phase={phase}/>

      {/* Phase 3 — domination SERP board */}
      <Phase3 phase={phase}/>

      {/* Phase 4 — intelligence */}
      <Phase4 phase={phase}/>

      {/* Phase 5 — brand identity */}
      <Phase5 phase={phase}/>

      {/* Phase 6 — portal + enter */}
      <Phase6 phase={phase} onEnter={() => { setVisible(false); setTimeout(onComplete, 600); }}/>

      {/* Skip button — always visible */}
      {phase < 6 && (
        <button onClick={handleSkip} style={{
          position: 'absolute', top: 20, right: 24, zIndex: 10,
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
          color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.1em',
          transition: 'all 0.2s',
        }} onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
           onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
          SKIP ›
        </button>
      )}

      <style>{`
        @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
        @keyframes fadeUp   { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeDown { from { opacity:0; transform:translateY(-16px) } to { opacity:1; transform:translateY(0) } }
        @keyframes scaleIn  { from { opacity:0; transform:scale(0.7) } to { opacity:1; transform:scale(1) } }
        @keyframes glitch   {
          0%,95%,100% { clip-path:none; transform:none }
          96% { clip-path:inset(20% 0 60% 0); transform:translate(-4px,0) }
          97% { clip-path:inset(70% 0 10% 0); transform:translate(4px,0) }
          98% { clip-path:inset(40% 0 30% 0); transform:translate(-2px,0) }
        }
        @keyframes scanH {
          0% { transform:translateY(0) }
          100% { transform:translateY(100vh) }
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes pulseGlow {
          0%,100%{box-shadow:0 0 20px rgba(99,102,241,0.4),0 0 60px rgba(99,102,241,0.1)}
          50%{box-shadow:0 0 40px rgba(99,102,241,0.8),0 0 100px rgba(99,102,241,0.3)}
        }
        @keyframes countUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes slideRight { from{width:0} to{width:100%} }
        @keyframes revealChar {
          from{opacity:0;transform:translateY(30px) rotateX(90deg)}
          to{opacity:1;transform:translateY(0) rotateX(0deg)}
        }
        @keyframes portalOpen {
          from{opacity:0;transform:scale(0.3) rotate(-10deg)}
          to{opacity:1;transform:scale(1) rotate(0deg)}
        }
        @keyframes orbitLeft {
          from{transform:translateX(60px) translateY(-30px) scale(0.8);opacity:0}
          60%{opacity:1}
          to{transform:translateX(-60px) translateY(30px) scale(1.1);opacity:0}
        }
        @keyframes orbitRight {
          from{transform:translateX(-60px) translateY(30px) scale(0.8);opacity:0}
          60%{opacity:1}
          to{transform:translateX(60px) translateY(-30px) scale(1.1);opacity:0}
        }
        @keyframes serpDrop {
          from{opacity:0;transform:translateX(-30px)}
          to{opacity:1;transform:translateX(0)}
        }
        @keyframes numberRise {
          from{opacity:0;transform:translateY(20px)}
          to{opacity:1;transform:translateY(0)}
        }
        @keyframes brainAssemble {
          from{opacity:0;transform:scale(0) rotate(180deg)}
          to{opacity:1;transform:scale(1) rotate(0deg)}
        }
        @keyframes textReveal {
          from{opacity:0;letter-spacing:0.5em;filter:blur(8px)}
          to{opacity:1;letter-spacing:0.05em;filter:blur(0)}
        }
        @keyframes horizScan {
          from{transform:scaleX(0);transform-origin:left}
          to{transform:scaleX(1);transform-origin:left}
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes portalPulse {
          0%,100%{box-shadow:0 0 40px rgba(99,102,241,0.5),0 0 120px rgba(99,102,241,0.2),inset 0 0 40px rgba(99,102,241,0.1)}
          50%{box-shadow:0 0 60px rgba(0,212,255,0.6),0 0 160px rgba(0,212,255,0.3),inset 0 0 60px rgba(0,212,255,0.15)}
        }
      `}</style>
    </div>
  );
}

/* ────────────────── Phase components ────────────────── */

function Phase0({ phase }: { phase: number }) {
  if (phase > 1) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
      animation: phase === 0 ? 'fadeIn 0.6s ease forwards' : 'none',
      opacity: phase === 0 ? 1 : 0, transition: 'opacity 0.5s',
    }}>
      {/* ◈ symbol */}
      <div style={{
        fontSize: 64, color: '#6366f1', lineHeight: 1,
        textShadow: '0 0 30px rgba(99,102,241,0.8), 0 0 80px rgba(99,102,241,0.4)',
        animation: 'pulse 1.2s ease-in-out infinite',
      }}>◈</div>
      <div style={{
        fontSize: 9, letterSpacing: '0.4em', color: 'rgba(99,102,241,0.6)',
        animation: 'fadeIn 0.5s 0.3s ease forwards', opacity: 0,
      }}>
        INITIATING INTELLIGENCE PROTOCOL
      </div>
    </div>
  );
}

function Phase1({ phase }: { phase: number }) {
  if (phase < 1 || phase > 2) return null;
  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      textAlign: 'center', pointerEvents: 'none',
      animation: 'scaleIn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards',
    }}>
      <div style={{
        fontSize: 11, letterSpacing: '0.6em', color: 'rgba(0,212,255,0.7)',
        marginBottom: 12, animation: 'fadeDown 0.6s 0.2s ease forwards', opacity: 0,
      }}>
        ◈ SEO INTELLIGENCE UNIVERSE ◈
      </div>
      <div style={{
        fontSize: 'clamp(2rem,5vw,4rem)', fontWeight: 900,
        background: 'linear-gradient(135deg,#6366f1,#00d4ff,#10b981)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 10,
        animation: 'glitch 6s ease-in-out infinite',
      }}>
        SEARCH ENGINE COSMOS
      </div>
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2em',
        animation: 'fadeUp 0.6s 0.4s ease forwards', opacity: 0,
      }}>
        BILLIONS OF SIGNALS · ONE POSITION MATTERS
      </div>
    </div>
  );
}

function Phase2({ phase }: { phase: number }) {
  if (phase < 2 || phase > 3) return null;
  const kws = ['ORGANIC REACH +340%','AI CITATIONS: ACTIVE','TOPICAL AUTHORITY: ESTABLISHED',
               'DOMAIN RATING: CLIMBING','INTENT SIGNALS: MAPPED','FEATURED SNIPPET: CAPTURED'];
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Center targeting reticle */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 120, height: 120,
        border: '1px solid rgba(0,212,255,0.3)', borderRadius: '50%',
        animation: 'scaleIn 0.4s ease forwards',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 60, height: 60,
          border: '1px solid rgba(99,102,241,0.5)', borderRadius: '50%',
        }}/>
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 8, height: 8, borderRadius: '50%',
          background: '#00d4ff', boxShadow: '0 0 12px #00d4ff',
          animation: 'pulse 0.8s ease-in-out infinite',
        }}/>
        {/* Crosshair lines */}
        {[0,90,180,270].map(a => (
          <div key={a} style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 40, height: 1, background: 'rgba(0,212,255,0.4)',
            transformOrigin: 'left center',
            transform: `rotate(${a}deg) translateY(-50%)`,
          }}/>
        ))}
      </div>
      {/* Floating KW chips */}
      {kws.map((kw, i) => (
        <div key={kw} style={{
          position: 'absolute',
          left: `${10 + (i % 3) * 30}%`,
          top: `${15 + Math.floor(i / 3) * 55}%`,
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 6, padding: '5px 12px',
          fontSize: 10, letterSpacing: '0.1em', color: 'rgba(165,180,252,0.8)',
          animation: `fadeUp 0.5s ${i * 0.15}s ease forwards`, opacity: 0,
          backdropFilter: 'blur(8px)',
        }}>
          {kw}
        </div>
      ))}
      {/* Scan line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg,transparent,rgba(0,212,255,0.4),transparent)',
        animation: 'scanH 2s linear infinite',
        top: 0,
      }}/>
    </div>
  );
}

function Phase3({ phase }: { phase: number }) {
  if (phase < 3 || phase > 4) return null;
  const entries = [
    { pos: 1, domain: 'seoseason.com', label: 'SEO SEASON — MANAV', yours: true },
    { pos: 2, domain: 'competitor.com',     label: 'Competitor' },
    { pos: 3, domain: 'old-agency.io',      label: 'Old Agency' },
    { pos: 4, domain: 'generic-seo.com',    label: 'Generic SEO' },
    { pos: 5, domain: 'mediocre-blog.net',  label: 'Mediocre Blog' },
  ];
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 20,
    }}>
      <div style={{
        fontSize: 10, letterSpacing: '0.5em', color: 'rgba(0,212,255,0.6)',
        animation: 'fadeDown 0.5s ease forwards',
      }}>
        ◈ SERP DOMINATION PROTOCOL ◈
      </div>

      {/* SERP board */}
      <div style={{
        width: 'min(520px, 90vw)',
        background: 'rgba(4,6,15,0.9)', border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 16, overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 0 60px rgba(99,102,241,0.15)',
      }}>
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>GOOGLE SEARCH RESULTS</span><span>LIVE RANKINGS</span>
        </div>
        {entries.map((e, i) => (
          <div key={e.pos} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '12px 16px',
            background: e.yours ? 'rgba(99,102,241,0.08)' : 'transparent',
            borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            borderLeft: e.yours ? '3px solid #6366f1' : '3px solid transparent',
            animation: `serpDrop 0.4s ${i * 0.1}s ease forwards`, opacity: 0,
            position: 'relative',
          }}>
            {/* Position number */}
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: e.yours ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: e.yours ? 13 : 11,
              fontWeight: 900,
              color: e.yours ? 'white' : 'rgba(255,255,255,0.3)',
              boxShadow: e.yours ? '0 0 16px rgba(99,102,241,0.5)' : 'none',
              flexShrink: 0,
              animation: e.yours ? 'pulseGlow 2s ease-in-out infinite' : 'none',
            }}>
              #{e.pos}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: e.yours ? 13 : 11,
                fontWeight: e.yours ? 800 : 400,
                color: e.yours ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                letterSpacing: e.yours ? '0.05em' : 0,
              }}>
                {e.label}
              </div>
              <div style={{ fontSize: 9, color: e.yours ? 'rgba(0,212,255,0.6)' : 'rgba(255,255,255,0.2)', marginTop: 2 }}>
                {e.domain}
              </div>
            </div>
            {e.yours && (
              <div style={{
                fontSize: 9, letterSpacing: '0.1em', color: '#10b981',
                background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: 4, padding: '2px 8px', animation: 'pulse 2s infinite',
              }}>
                ● DOMINANT
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex', gap: 24,
        animation: 'fadeUp 0.6s 0.6s ease forwards', opacity: 0,
      }}>
        {[
          { n: '+340%', l: 'ORGANIC GROWTH' },
          { n: '100%', l: 'AI VISIBILITY' },
          { n: '#1', l: 'MARKET POSITION' },
        ].map(({ n, l }) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 'clamp(1.2rem,2.5vw,2rem)', fontWeight: 900,
              background: 'linear-gradient(135deg,#6366f1,#00d4ff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              fontFamily: 'monospace',
            }}>{n}</div>
            <div style={{ fontSize: 8, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Phase4({ phase }: { phase: number }) {
  if (phase < 4 || phase > 5) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 24,
    }}>
      {/* Brain icon assembled */}
      <div style={{
        width: 100, height: 100, borderRadius: '50%',
        background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(0,212,255,0.1))',
        border: '1px solid rgba(99,102,241,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 40px rgba(99,102,241,0.4)',
        animation: 'brainAssemble 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards, pulseGlow 2s 0.8s ease-in-out infinite',
      }}>
        <svg width="50" height="50" viewBox="0 0 24 24" fill="none"
          stroke="url(#bGrad)" strokeWidth="1.5" strokeLinecap="round">
          <defs>
            <linearGradient id="bGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1"/>
              <stop offset="100%" stopColor="#00d4ff"/>
            </linearGradient>
          </defs>
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-3.95A3 3 0 0 1 3 12a3 3 0 0 1 2.3-2.9 2.5 2.5 0 0 1 4.2-1.1z"/>
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-3.95A3 3 0 0 0 21 12a3 3 0 0 0-2.3-2.9 2.5 2.5 0 0 0-4.2-1.1z"/>
        </svg>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 'clamp(1rem,2.5vw,1.6rem)', fontWeight: 900, letterSpacing: '0.15em',
          color: '#a5b4fc', animation: 'textReveal 0.8s 0.3s ease forwards', opacity: 0,
        }}>
          MANAV BRAIN
        </div>
        <div style={{
          fontSize: 10, letterSpacing: '0.3em', color: 'rgba(0,212,255,0.6)', marginTop: 6,
          animation: 'fadeUp 0.6s 0.6s ease forwards', opacity: 0,
        }}>
          INTELLIGENCE THAT COMPOUNDS WITH EVERY DECISION
        </div>
        {/* Capabilities */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap',
          animation: 'fadeUp 0.6s 0.9s ease forwards', opacity: 0,
        }}>
          {['AUTO-LEARNING','ALGORITHM INTEL','DEEP ENRICHMENT','TASK EXECUTION'].map(cap => (
            <div key={cap} style={{
              fontSize: 8, letterSpacing: '0.1em', color: 'rgba(165,180,252,0.7)',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 4, padding: '3px 8px',
            }}>{cap}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Phase5({ phase }: { phase: number }) {
  if (phase < 5 || phase > 5) return null;
  const letters = 'MANAV'.split('');
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column',
    }}>
      {/* M A N A V — letter by letter */}
      <div style={{ display: 'flex', gap: 'clamp(4px,1.5vw,16px)', marginBottom: 8 }}>
        {letters.map((l, i) => (
          <div key={i} style={{
            fontSize: 'clamp(3rem,10vw,7rem)', fontWeight: 900,
            lineHeight: 1, fontFamily: 'monospace',
            background: `linear-gradient(135deg,
              ${['#6366f1','#818cf8','#00d4ff','#a5b4fc','#10b981'][i]} 0%,
              white 100%)`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: `revealChar 0.5s ${0.1 + i * 0.12}s cubic-bezier(0.34,1.56,0.64,1) forwards`,
            opacity: 0,
            perspective: '400px',
          }}>{l}</div>
        ))}
      </div>

      {/* Divider line */}
      <div style={{
        width: 'min(400px, 80vw)', height: 1,
        background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.8),rgba(0,212,255,0.8),transparent)',
        animation: 'horizScan 0.6s 0.7s ease forwards', opacity: 0,
        transform: 'scaleX(0)', transformOrigin: 'left',
        animationFillMode: 'forwards',
      }}/>
      {/* Override: just use width animation */}
      <div style={{
        width: 'min(400px,80vw)', height: 1, marginTop: 1,
        background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.6),rgba(0,212,255,0.6),transparent)',
        animation: 'fadeIn 0.01s 0.7s forwards', opacity: 0,
      }}/>

      <div style={{
        fontSize: 'clamp(0.8rem,2.5vw,1.3rem)', letterSpacing: '0.5em',
        color: 'rgba(255,255,255,0.7)', marginTop: 12, fontWeight: 300,
        animation: 'textReveal 0.8s 0.9s ease forwards', opacity: 0,
      }}>
        SEO SEASON
      </div>
      <div style={{
        fontSize: 'clamp(0.5rem,1.5vw,0.75rem)', letterSpacing: '0.35em',
        color: 'rgba(99,102,241,0.7)', marginTop: 6,
        animation: 'fadeUp 0.6s 1.1s ease forwards', opacity: 0,
      }}>
        INTELLIGENCE PLATFORM · MARKET DOMINATION · RANK #1
      </div>

      {/* Glitch layer */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        fontSize: 'clamp(3rem,10vw,7rem)', fontWeight: 900,
        color: 'rgba(0,212,255,0.06)', letterSpacing: '0.05em',
        fontFamily: 'monospace', pointerEvents: 'none',
        animation: 'glitch 3s ease-in-out infinite',
        whiteSpace: 'nowrap',
      }}>
        MANAV
      </div>
    </div>
  );
}

function Phase6({ phase, onEnter }: { phase: number; onEnter: () => void }) {
  if (phase < 6) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 28,
      animation: 'portalOpen 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards',
    }}>
      {/* Orbital rings */}
      {[200, 160, 120].map((r, i) => (
        <div key={r} style={{
          position: 'absolute', width: r * 2, height: r,
          border: `1px solid rgba(${i===0?'99,102,241':i===1?'0,212,255':'16,185,129'},${0.15 + i * 0.05})`,
          borderRadius: '50%', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          animation: `pulse ${2 + i * 0.5}s ease-in-out infinite`,
        }}/>
      ))}

      {/* Brand */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.6em', color: 'rgba(0,212,255,0.6)',
          marginBottom: 8, animation: 'fadeDown 0.5s ease forwards',
        }}>◈ INTELLIGENCE PLATFORM READY ◈</div>
        <div style={{
          fontSize: 'clamp(2.5rem,7vw,5.5rem)', fontWeight: 900,
          background: 'linear-gradient(135deg,#6366f1,#a5b4fc,#00d4ff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'monospace',
          animation: 'glitch 8s ease-in-out infinite',
        }}>MANAV</div>
        <div style={{
          fontSize: 'clamp(0.7rem,2vw,1rem)', letterSpacing: '0.4em',
          color: 'rgba(255,255,255,0.5)', marginTop: 4, fontWeight: 300,
        }}>SEO SEASON</div>
      </div>

      {/* Enter portal button */}
      <button onClick={onEnter} style={{
        position: 'relative', zIndex: 1,
        background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(0,212,255,0.15))',
        border: '1px solid rgba(99,102,241,0.5)',
        borderRadius: 14, padding: 'clamp(10px,2vh,16px) clamp(24px,4vw,48px)',
        cursor: 'pointer', letterSpacing: '0.2em',
        color: '#a5b4fc', fontSize: 'clamp(11px,1.5vw,14px)', fontWeight: 700,
        fontFamily: 'monospace',
        backdropFilter: 'blur(12px)',
        animation: 'portalPulse 2s ease-in-out infinite',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'linear-gradient(135deg,rgba(99,102,241,0.4),rgba(0,212,255,0.3))';
        e.currentTarget.style.color = 'white';
        e.currentTarget.style.transform = 'scale(1.04)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(0,212,255,0.15))';
        e.currentTarget.style.color = '#a5b4fc';
        e.currentTarget.style.transform = 'scale(1)';
      }}>
        ENTER THE INTELLIGENCE
        <span style={{ marginLeft: 10, opacity: 0.7, animation: 'blink 1s step-end infinite' }}>›</span>
      </button>

      {/* Tagline */}
      <div style={{
        position: 'relative', zIndex: 1, textAlign: 'center',
        fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.2)',
        animation: 'fadeUp 0.6s 0.4s ease forwards', opacity: 0,
      }}>
        APPROVED CLIENTS ONLY · MANAGED PERSONALLY BY MANAV<br/>
        <span style={{ color: 'rgba(99,102,241,0.5)', fontSize: 9 }}>
          I DON'T DO VANITY SEO · I BUILD MARKET LEADERS
        </span>
      </div>
    </div>
  );
}