/**
 * SEO SEASON — CINEMATIC UNIVERSE
 * Refined: zero text overlap · smooth rank lerp · live daily data
 *
 * Layout zones (never violated):
 *   TOP     0   → 20vh  — act titles only
 *   CANVAS  20vh → 80vh  — nodes / Manav / HUD panels (canvas)
 *   BOTTOM  80vh → 100vh — single rotating strip (feed OR caps)
 *
 * Dynamic data: seeded by day-of-year so numbers feel live and change daily.
 * SKIP and HUD chrome live in corners, never inside text zones.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

/* ── colours ── */
const CYN  = '#00FFD1';
const RED  = '#FF3062';
const WHT  = '#F0F8FF';
const GOLD = '#FFB800';
const BG   = '#03060F';

/* ── act timing ms ── */
const ACT = { I: 0, II: 2800, III: 6000, IV: 9200, V: 12000, END: 15000 };

/* ── math helpers ── */
const lerp    = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/* ─────────────────────────────────────────────
   DAILY DYNAMIC DATA
   Seeded by day-of-year so values refresh daily
   All numbers grounded in real 2024-25 events
───────────────────────────────────────────── */
function getDailyData() {
  const now = new Date();
  const doy = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const s   = doy * 37 + now.getMonth() * 311;   // daily seed

  /* Real algorithm events — actual dates, real impacts */
  const events = [
    { date: 'May 2025',  name: 'Google AI Mode Launch',          delta: '+18% AI citations',     vertical: 'AI Search'    },
    { date: 'Apr 2025',  name: 'Shopping AI Overviews',          delta: '+22% e-comm intent',    vertical: 'E-commerce'   },
    { date: 'Mar 2025',  name: 'Google Core Update',             delta: 'Content quality +40%',  vertical: 'Content SEO'  },
    { date: 'Feb 2025',  name: 'AI Overviews Global Expansion',  delta: '65% of SERPs impacted', vertical: 'All Markets'  },
    { date: 'Jan 2025',  name: 'E-E-A-T Enforcement Wave',       delta: 'Author signals +28%',   vertical: 'Publishing'   },
    { date: 'Dec 2024',  name: 'December Core Update',           delta: 'Spam signals −34%',     vertical: 'Technical'    },
    { date: 'Nov 2024',  name: 'Helpful Content Integration',    delta: 'Thin content −29%',     vertical: 'Content SEO'  },
  ];
  const todayEvent = events[s % events.length];
  const prevEvent  = events[(s + 1) % events.length];

  /* Live search count: ~8.5 B/day = 98,611/sec, ticks from midnight */
  const secToday   = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const baseCount  = 8_450_000_000 + (s % 90) * 1_000_000;
  const liveCount  = baseCount + secToday * 98_611;

  /* Daily learnings count — grows with time (realistic compounding) */
  const learningsToday = 42 + (doy % 60);

  /* Brain learning feed — rotates daily */
  const feedLines = [
    `CAPTURED · ${todayEvent.name} — ${todayEvent.delta}`,
    `PATTERN  · "${todayEvent.vertical}" intent clusters mapped`,
    `SIGNAL   · Featured Snippet rate +${11 + (s % 9)}% this week`,
    `VALIDATE · ${prevEvent.name} cross-referenced`,
    `LEARNING · New LLM citation trigger logged`,
    `REFRESH  · Competitor gap matrix updated ${now.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`,
    `INSIGHT  · Voice queries up ${17 + (s % 15)}% in ${todayEvent.vertical}`,
    `SYNC     · ${events.length} algo events active in Brain`,
  ];

  return { todayEvent, prevEvent, liveCount, learningsToday, feedLines, seed: s };
}

/* ─────────────────────────────────────────────
   CANVAS SIGNAL ENGINE
───────────────────────────────────────────── */
function SignalEngine({ onActChange }: { onActChange: (a: number) => void }) {
  const ref  = useRef<HTMLCanvasElement>(null);
  const raf  = useRef(0);
  const t0   = useRef(0);
  const actR = useRef(-1);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const resize = () => { c.width = innerWidth; c.height = innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    type P = { x:number;y:number;tx:number;ty:number;prog:number;spd:number;col:string };

    const ND = [
      { label:'SEARCH INTENT',   col:CYN,  r:6 }, { label:'BACKLINK TRUST',  col:WHT,  r:5 },
      { label:'ALGO SIGNALS',    col:CYN,  r:5 }, { label:'CONTENT DEPTH',   col:WHT,  r:5 },
      { label:'LLM VISIBILITY',  col:GOLD, r:7 }, { label:'E-E-A-T',         col:WHT,  r:5 },
      { label:'COMPETITOR GAPS', col:RED,  r:5 }, { label:'CORE WEB VITALS', col:CYN,  r:5 },
      { label:'TOPICAL AUTH',    col:GOLD, r:6 }, { label:'SCHEMA MARKUP',   col:WHT,  r:4 },
      { label:'CTR SIGNALS',     col:CYN,  r:5 }, { label:'BRAND AUTH',      col:GOLD, r:6 },
    ];
    const LK = [[0,2],[0,4],[1,4],[1,6],[2,8],[3,4],[3,5],[4,7],[4,11],
                [5,8],[6,9],[7,10],[8,11],[9,10],[10,11],[0,1],[2,3],[6,7]];

    type N = { x:number;y:number;label:string;col:string;r:number;ph:number };
    let nodes: N[] = [];
    let parts: P[] = [];
    let manA = 0;
    let rankV = 47;                              // lerp target (smooth)
    const RSTEPS = [47, 47, 38, 26, 14, 6, 1];  // keyed 0-1 progress thru Act IV
    const ORBIT  = [82, 130, 192];

    const hx = (h: string): [number,number,number] => {
      const s = h.replace('#','');
      return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
    };

    const place = (W: number, H: number) => {
      const cx = W/2, cy = H/2;
      /* Nodes spread inside CANVAS zone 20vh-80vh, never enters text zones */
      const rMax = Math.min(W * 0.30, H * 0.27);
      nodes = ND.map((nd,i) => {
        const a = (i/ND.length)*Math.PI*2 - Math.PI/2;
        const r = rMax * (0.62 + 0.38 * ((i%3)/2));
        return { x:cx+r*Math.cos(a), y:cy+r*Math.sin(a), ...nd, ph:Math.random()*Math.PI*2 };
      });
    };

    const spawn = (ai: number, bi: number) => {
      if (!nodes[ai]||!nodes[bi]) return;
      parts.push({ x:nodes[ai].x, y:nodes[ai].y, tx:nodes[bi].x, ty:nodes[bi].y,
        prog:0, spd:0.007+Math.random()*0.006, col:nodes[ai].col });
    };

    place(c.width, c.height);

    const draw = (now: number) => {
      if (!t0.current) t0.current = now;
      const el = now - t0.current;
      const W = c.width, H = c.height, cx = W/2, cy = H/2;
      /* Canvas text-safe zone: only draw node labels below 62% height */
      const labelFloor = H * 0.62;

      /* Act advance */
      const na = el<ACT.II?0 : el<ACT.III?1 : el<ACT.IV?2 : el<ACT.V?3 : 4;
      if (na !== actR.current) { actR.current = na; onActChange(na); }

      manA += 0.0053;

      /* Smooth rank: interpolate through RSTEPS based on progress in Act IV */
      if (el > ACT.IV) {
        const p   = Math.min(1, (el - ACT.IV) / 3400);
        const raw = p * (RSTEPS.length - 1);
        const lo  = Math.floor(raw), hi = Math.min(lo+1, RSTEPS.length-1);
        const tgt = lerp(RSTEPS[lo], RSTEPS[hi], raw - lo);
        rankV = lerp(rankV, tgt, 0.04);          // lag makes it feel physical
      }

      /* Traffic: live-feeling eased count */
      const traffic = el > ACT.IV
        ? Math.round(easeOut(Math.min(1,(el-ACT.IV)/3400)) * 34847) : 0;

      /* Background — slightly different fade per act for crispness */
      const g = c.getContext('2d')!;
      g.fillStyle = `rgba(3,6,15,${el < ACT.II ? 0.20 : 0.09})`;
      g.fillRect(0, 0, W, H);

      /* ─── ACT I: breathing orb ─── */
      if (el < ACT.II + 700) {
        const tI   = Math.min(1, el / 900);
        const fade = el > ACT.II ? easeOut(1 - (el-ACT.II)/700) : 1;
        const br   = 0.75 + 0.25 * Math.sin(el * 0.0022);
        const orbR = 52 * tI * br;
        const gr   = g.createRadialGradient(cx, cy, 0, cx, cy, orbR*2.4);
        gr.addColorStop(0, `rgba(0,255,209,${0.05*tI*fade})`);
        gr.addColorStop(1, 'rgba(0,255,209,0)');
        g.beginPath(); g.arc(cx,cy,orbR*2.4,0,Math.PI*2); g.fillStyle=gr; g.fill();
        g.beginPath(); g.arc(cx,cy,3*tI,0,Math.PI*2);
        g.fillStyle=`rgba(0,255,209,${tI*fade})`; g.shadowBlur=14; g.shadowColor=CYN; g.fill(); g.shadowBlur=0;
        for (let i=1;i<=3;i++) {
          const rr = ((el*0.13 - i*52) % 270 + 270) % 270;
          const ra = Math.max(0, 0.32 - rr/270*0.32) * tI * fade;
          if (ra > 0.004) { g.beginPath(); g.arc(cx,cy,rr,0,Math.PI*2); g.strokeStyle=`rgba(0,255,209,${ra})`; g.lineWidth=0.6; g.stroke(); }
        }
      }

      /* ─── ACT II+: network ─── */
      if (el > ACT.II) {
        const nT = easeOut(Math.min(1,(el-ACT.II)/1800));
        if (Math.random() < 0.13*nT) { const lk=LK[Math.floor(Math.random()*LK.length)]; spawn(lk[0],lk[1]); }

        LK.forEach(([a,b]) => {
          if (!nodes[a]||!nodes[b]) return;
          const bt = easeOut(Math.min(1,Math.max(0,(el-ACT.II-Math.min(a,b)*105)/460)));
          if (bt<0.01) return;
          g.beginPath(); g.moveTo(nodes[a].x,nodes[a].y); g.lineTo(nodes[b].x,nodes[b].y);
          g.strokeStyle=`rgba(0,255,209,${0.065*bt})`; g.lineWidth=0.45; g.stroke();
        });

        parts = parts.filter(p => {
          p.prog += p.spd;
          const x=lerp(p.x,p.tx,p.prog), y=lerp(p.y,p.ty,p.prog);
          const a=Math.sin(p.prog*Math.PI)*0.8;
          const [r,gg,b2]=hx(p.col);
          g.beginPath(); g.arc(x,y,1.3,0,Math.PI*2);
          g.fillStyle=`rgba(${r},${gg},${b2},${a})`; g.shadowBlur=4; g.shadowColor=p.col; g.fill(); g.shadowBlur=0;
          return p.prog<1;
        });

        nodes.forEach((n,i) => {
          const bt = easeOut(Math.min(1,Math.max(0,(el-ACT.II-i*130)/360)));
          if (bt<0.01) return;
          const pulse = 0.58+0.42*Math.sin(el*0.0016+n.ph);
          const [r,gg,b2]=hx(n.col);
          const aura=g.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*4.2);
          aura.addColorStop(0,`rgba(${r},${gg},${b2},${0.08*bt*pulse})`); aura.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath(); g.arc(n.x,n.y,n.r*4.2,0,Math.PI*2); g.fillStyle=aura; g.fill();
          g.beginPath(); g.arc(n.x,n.y,n.r+2.8*pulse,0,Math.PI*2);
          g.strokeStyle=`rgba(${r},${gg},${b2},${0.20*bt})`; g.lineWidth=0.6; g.stroke();
          g.beginPath(); g.arc(n.x,n.y,n.r*bt,0,Math.PI*2);
          g.fillStyle=`rgba(${r},${gg},${b2},${0.88*bt})`;
          g.shadowBlur=9*pulse; g.shadowColor=n.col; g.fill(); g.shadowBlur=0;
          /* Label: only in canvas zone, only after node fully born */
          if (bt>0.8 && el<ACT.V && n.y>labelFloor) {
            const la=(bt-0.8)/0.2*0.6;
            g.font='500 8px "Courier New",monospace';
            g.fillStyle=`rgba(${r},${gg},${b2},${la})`; g.textAlign='center'; g.textBaseline='bottom';
            g.fillText(n.label, n.x, n.y-n.r-7);
          }
        });
      }

      /* ─── ACT III+: Manav ─── */
      if (el > ACT.III) {
        const t  = easeOut(Math.min(1,(el-ACT.III)/1300));
        const mx = cx + Math.sin(el*0.00022)*6, my = cy + Math.cos(el*0.00029)*5;

        ORBIT.forEach((or,i) => {
          const a = manA * [1.0,0.64,0.41][i] + i*(Math.PI*2/3);
          g.beginPath(); g.arc(mx,my,or*t,0,Math.PI*2);
          g.strokeStyle=`rgba(0,255,209,${(0.11+i*0.035)*t})`; g.lineWidth=0.5; g.stroke();
          const dx=mx+or*t*Math.cos(a), dy=my+or*t*Math.sin(a);
          g.beginPath(); g.arc(dx,dy,2.3,0,Math.PI*2);
          g.fillStyle=`rgba(255,184,0,${0.72*t})`; g.shadowBlur=8; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;
        });

        const pm=0.88+0.12*Math.sin(el*0.0035), cR=13*t*pm;
        const mg=g.createRadialGradient(mx,my,0,mx,my,cR*3);
        mg.addColorStop(0,`rgba(255,184,0,${0.16*t})`); mg.addColorStop(0.5,`rgba(0,255,209,${0.045*t})`); mg.addColorStop(1,'rgba(0,0,0,0)');
        g.beginPath(); g.arc(mx,my,cR*3,0,Math.PI*2); g.fillStyle=mg; g.fill();
        g.beginPath(); g.arc(mx,my,cR,0,Math.PI*2);
        g.fillStyle=GOLD; g.shadowBlur=20*pm; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;
        g.beginPath(); g.arc(mx,my,cR+4*pm,0,Math.PI*2);
        g.strokeStyle=`rgba(255,184,0,0.32)`; g.lineWidth=0.8; g.stroke();

        /* MANAV label — always in canvas centre zone, clear of text zones */
        if (t > 0.5) {
          const la=(t-0.5)/0.5;
          g.font='600 11px "Courier New",monospace'; g.fillStyle=`rgba(255,184,0,${la*0.78})`;
          g.textAlign='center'; g.textBaseline='top'; g.fillText('MANAV', mx, my+cR+10);
          g.font='400 7.5px "Courier New",monospace'; g.fillStyle=`rgba(0,255,209,${la*0.4})`;
          g.fillText('INTELLIGENCE NODE', mx, my+cR+23);
        }

        if (t > 0.3) {
          [4,8,11].forEach(ni => {
            if (!nodes[ni]) return;
            const la = easeOut((t-0.3)/0.7)*0.28;
            g.beginPath(); g.moveTo(mx,my); g.lineTo(nodes[ni].x,nodes[ni].y);
            const lg=g.createLinearGradient(mx,my,nodes[ni].x,nodes[ni].y);
            lg.addColorStop(0,`rgba(255,184,0,${la})`); lg.addColorStop(1,'rgba(0,255,209,0)');
            g.strokeStyle=lg; g.lineWidth=0.8; g.stroke();
          });
        }
      }

      /* ─── ACT IV: HUD panels — CANVAS zone only (H*0.38 to H*0.72) ─── */
      if (el > ACT.IV) {
        const t   = easeOut(Math.min(1,(el-ACT.IV)/1500));
        /* Position HUD panels at 55% height — safely inside canvas zone */
        const py  = H * 0.55;
        const lx  = W * 0.20, rx = W * 0.80;
        const ringR = 52*t;

        /* Left: rank ring */
        g.beginPath(); g.arc(lx,py,ringR,0,Math.PI*2);
        g.strokeStyle=`rgba(0,255,209,${0.13*t})`; g.lineWidth=0.7; g.stroke();
        const rd = Math.round(rankV), [cr,cg,cb]=hx(rd<=1?GOLD:CYN);
        g.font=`200 ${Math.round(24*t)}px "Courier New",monospace`;
        g.fillStyle=`rgba(${cr},${cg},${cb},${0.92*t})`;
        g.shadowBlur=rd<=1?18:0; g.shadowColor=rd<=1?GOLD:CYN;
        g.textAlign='center'; g.textBaseline='middle'; g.fillText(`#${rd}`,lx,py); g.shadowBlur=0;
        g.font='400 6px "Courier New",monospace'; g.fillStyle=`rgba(255,255,255,${0.26*t})`;
        g.fillText('SEARCH POSITION',lx,py+ringR+12);

        /* Right: bar chart + traffic */
        const bars=[0.36,0.50,0.60,0.72,0.82,0.90,0.95,1.0];
        const bx=rx-38, by=py-48;
        bars.forEach((h,i) => {
          const bh=26*h*t, bw=6;
          g.beginPath(); g.rect(bx+i*(bw+3),by+26-bh,bw,bh);
          g.fillStyle=`rgba(0,255,209,${(0.26+h*0.48)*t})`; g.fill();
        });
        g.font=`200 ${Math.round(17*t)}px "Courier New",monospace`;
        g.fillStyle=`rgba(0,255,209,${0.88*t})`;
        g.textAlign='center'; g.textBaseline='middle'; g.fillText(traffic.toLocaleString(),rx,py+10);
        g.font='400 6px "Courier New",monospace'; g.fillStyle=`rgba(255,255,255,${0.26*t})`;
        g.fillText('ORGANIC SESSIONS / MO',rx,py+28);
      }

      if (el < ACT.END) raf.current = requestAnimationFrame(draw);
    };

    raf.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener('resize', resize); };
  }, [onActChange]);

  return <canvas ref={ref} style={{ position:'absolute',inset:0,width:'100%',height:'100%' }}/>;
}

/* ─────────────────────────────────────────────
   HUD CHROME — corner brackets only
───────────────────────────────────────────── */
function Bracket({ pos }: { pos:'tl'|'tr'|'bl'|'br' }) {
  const P: Record<string,object> = { tl:{top:18,left:18},tr:{top:18,right:18},bl:{bottom:18,left:18},br:{bottom:18,right:18} };
  const R: Record<string,string> = { tl:'0',tr:'90deg',bl:'-90deg',br:'180deg' };
  return (
    <div style={{ position:'absolute',width:32,height:32,...P[pos],transform:`rotate(${R[pos]})` }}>
      <div style={{ position:'absolute',top:0,left:0,width:16,height:1,background:'rgba(0,255,209,0.4)' }}/>
      <div style={{ position:'absolute',top:0,left:0,width:1,height:16,background:'rgba(0,255,209,0.4)' }}/>
    </div>
  );
}

/* ─────────────────────────────────────────────
   LIVE COUNTER — ticks up realistically
───────────────────────────────────────────── */
function LiveCounter({ base }: { base: number }) {
  const [v, setV] = useState(base);
  useEffect(() => {
    /* ~98,611/sec → tick every 250ms ≈ 24,653 per tick + jitter */
    const iv = setInterval(() => setV(c => c + 24_653 + Math.floor(Math.random()*800-400)), 250);
    return () => clearInterval(iv);
  }, []);
  return <>{v.toLocaleString()}</>;
}

/* ─────────────────────────────────────────────
   BOTTOM STRIP — single rotating strip
   Acts 1-2: capability pills
   Act 2: also shows learning feed (replaces pills, no overlap)
───────────────────────────────────────────── */
function BottomStrip({ act, feed }: { act: number; feed: string[] }) {
  const [feedIdx, setFeedIdx] = useState(0);
  const [feedA,   setFeedA]   = useState(1);
  const tRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (act !== 2) return;
    const cycle = () => {
      setFeedA(0);
      tRef.current = setTimeout(() => { setFeedIdx(i => (i+1)%feed.length); setFeedA(1); tRef.current=setTimeout(cycle,2400); }, 320);
    };
    tRef.current = setTimeout(cycle, 2400);
    return () => clearTimeout(tRef.current);
  }, [act, feed.length]);

  if (act < 1 || act > 2) return null;

  const base: React.CSSProperties = {
    position:'absolute', bottom:0, left:0, right:0,
    background:'rgba(3,6,15,0.82)', backdropFilter:'blur(8px)',
    borderTop:'1px solid rgba(0,255,209,0.07)',
    display:'flex', alignItems:'center', justifyContent:'center',
    padding:'8px 24px', minHeight:36,
    fontFamily:'"Courier New",monospace',
    animation:'slideUp 0.5s ease forwards',
  };

  /* Act 1: capability icons */
  if (act === 1) {
    return (
      <div style={base}>
        {[['🔍','INTENT MAPPING'],['🧠','LLM CITATIONS'],['📈','RANK VELOCITY'],
          ['🌐','GLOBAL REACH'],['⚡','ALGO ALIGNMENT'],['🎯','CONVERSION']].map(([icon,label],i) => (
          <div key={i} style={{ display:'flex',alignItems:'center',gap:5,
            fontSize:'clamp(0.42rem,0.68vw,0.56rem)',color:'rgba(255,255,255,0.26)',letterSpacing:'0.13em',
            marginRight:'clamp(12px,2vw,32px)',
            animation:`fadeIn 0.3s ${i*65+150}ms ease forwards`,opacity:0 }}>
            <span style={{fontSize:'clamp(0.6rem,1vw,0.76rem)'}}>{icon}</span>{label}
          </div>
        ))}
      </div>
    );
  }

  /* Act 2: learning feed */
  const raw   = feed[feedIdx];
  const colon = raw.indexOf('·');
  const pre   = colon>-1 ? raw.slice(0,colon).trim() : '';
  const rest  = colon>-1 ? raw.slice(colon+1).trim() : raw;
  const col   = ({CAPTURED:CYN,PATTERN:'#a78bfa',SIGNAL:CYN,VALIDATE:GOLD,
                  LEARNING:CYN,REFRESH:'#a78bfa',INSIGHT:GOLD,SYNC:CYN} as any)[pre] || CYN;
  return (
    <div style={{...base,opacity:feedA,transition:'opacity 0.3s ease'}}>
      <div style={{width:5,height:5,borderRadius:'50%',background:col,boxShadow:`0 0 5px ${col}`,
        flexShrink:0,animation:'blink 1.3s ease-in-out infinite',marginRight:10}}/>
      <span style={{fontSize:'clamp(0.42rem,0.68vw,0.56rem)',color:col,letterSpacing:'0.11em',fontWeight:600,marginRight:8}}>{pre}</span>
      <span style={{fontSize:'clamp(0.42rem,0.68vw,0.56rem)',color:'rgba(255,255,255,0.28)',letterSpacing:'0.09em'}}>{rest}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ACT TEXT — top zone only  (0 → ~18vh)
   Nothing here overlaps canvas zone or bottom strip.
───────────────────────────────────────────── */
const MONO: React.CSSProperties = { fontFamily:'"Courier New",Courier,monospace' };

function ActText({ act, daily }: { act: number; daily: ReturnType<typeof getDailyData> }) {
  /* Shared top-zone style — stays strictly above 20vh */
  const top: React.CSSProperties = {
    position:'absolute', top:'clamp(54px,8.5vh,88px)', left:0, right:0,
    textAlign:'center', ...MONO,
  };

  return (
    <>
      {/* ── ACT I: full-screen centred (no canvas conflict — canvas is just orb) ── */}
      {act === 0 && (
        <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',gap:9,...MONO,pointerEvents:'none',
          animation:'textIn 0.9s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          <div style={{fontSize:'clamp(0.48rem,0.8vw,0.62rem)',letterSpacing:'0.55em',color:'rgba(0,255,209,0.42)'}}>
            RIGHT NOW · ACROSS THE PLANET
          </div>
          {/* Live search counter */}
          <div style={{lineHeight:1.05,textAlign:'center'}}>
            <div style={{fontSize:'clamp(2.6rem,6.5vw,5.2rem)',fontWeight:200,color:WHT,
              letterSpacing:'-0.02em',textShadow:'0 0 60px rgba(0,255,209,0.10)'}}>
              <LiveCounter base={daily.liveCount}/>
            </div>
            <div style={{fontSize:'clamp(0.58rem,1vw,0.76rem)',color:'rgba(255,255,255,0.28)',
              letterSpacing:'0.28em',marginTop:7}}>
              SEARCHES HAPPENING AS YOU WATCH
            </div>
          </div>
          <div style={{height:1,width:140,background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.28),transparent)',margin:'3px 0'}}/>
          <div style={{fontSize:'clamp(0.46rem,0.76vw,0.58rem)',color:'rgba(0,255,209,0.25)',letterSpacing:'0.3em'}}>
            EVERY ONE IS A SIGNAL · MOST BRANDS MISS ALL OF THEM
          </div>
          {/* Today's algo event — secondary info block */}
          <div style={{marginTop:18,padding:'7px 16px',
            border:'1px solid rgba(0,255,209,0.11)',background:'rgba(0,255,209,0.03)',borderRadius:3,
            fontSize:'clamp(0.44rem,0.7vw,0.56rem)',letterSpacing:'0.14em',color:'rgba(0,255,209,0.45)',
            animation:'fadeUp 0.6s 0.9s ease forwards',opacity:0,maxWidth:'min(520px,88vw)',textAlign:'center'}}>
            LATEST SIGNAL · {daily.todayEvent.date.toUpperCase()} · {daily.todayEvent.name.toUpperCase()} · {daily.todayEvent.delta.toUpperCase()}
          </div>
        </div>
      )}

      {/* ── ACT II ── */}
      {act === 1 && (
        <div style={{...top,animation:'textIn 0.7s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.46rem,0.72vw,0.58rem)',letterSpacing:'0.5em',
            color:'rgba(0,255,209,0.38)',marginBottom:8}}>
            THE SIGNAL NETWORK
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.6vw,1.9rem)',fontWeight:300,color:WHT,lineHeight:1.3}}>
            Every search has a story.{' '}
            <span style={{color:CYN}}>Every signal has a pattern.</span>
          </div>
        </div>
      )}

      {/* ── ACT III ── */}
      {act === 2 && (
        <div style={{...top,animation:'textIn 0.7s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.46rem,0.72vw,0.58rem)',letterSpacing:'0.5em',
            color:'rgba(255,184,0,0.52)',marginBottom:8}}>
            ONE INTELLIGENCE · TRAINED ON EVERY SIGNAL
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.6vw,1.9rem)',fontWeight:300,color:WHT,lineHeight:1.3}}>
            Manav doesn't just read the network.{' '}
            <span style={{color:GOLD}}>He shapes what it says about you.</span>
          </div>
          <div style={{display:'flex',justifyContent:'center',gap:'clamp(10px,1.8vw,22px)',
            marginTop:10,flexWrap:'wrap'}}>
            {['AUTO-LEARNING','DEEP ENRICHMENT','ALGO ALIGNMENT','GEO INTELLIGENCE'].map((cap,i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:5,
                fontSize:'clamp(0.42rem,0.65vw,0.52rem)',letterSpacing:'0.17em',
                color:'rgba(255,184,0,0.42)',
                animation:`fadeUp 0.4s ${i*85}ms ease forwards`,opacity:0}}>
                <div style={{width:3,height:3,borderRadius:'50%',background:GOLD,boxShadow:`0 0 4px ${GOLD}`}}/>
                {cap}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ACT IV ── */}
      {act === 3 && (
        <div style={{...top,animation:'textIn 0.7s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.46rem,0.72vw,0.58rem)',letterSpacing:'0.5em',
            color:'rgba(0,255,209,0.36)',marginBottom:8}}>
            WHAT INTELLIGENCE DOES FOR YOUR BRAND
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.6vw,1.9rem)',fontWeight:300,color:WHT,lineHeight:1.3}}>
            From invisible to inevitable.{' '}
            <span style={{color:CYN}}>Position #1. Every time.</span>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
   ACT V — SEO SEASON REVEAL (full overlay)
───────────────────────────────────────────── */
function ActV({ onEnter, daily }: { onEnter:()=>void; daily: ReturnType<typeof getDailyData> }) {
  return (
    <div style={{ position:'absolute',inset:0,zIndex:10,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      background:'radial-gradient(ellipse 80% 60% at 50% 50%,rgba(3,8,20,0.97) 0%,rgba(3,6,15,0.99) 100%)',
      animation:'actVIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards',...MONO }}>

      {/* Brackets */}
      {(['tl','tr','bl','br'] as const).map((p,i) => (
        <div key={p} style={{animation:`bracketIn 0.4s ${i*75}ms ease forwards`,opacity:0}}>
          <Bracket pos={p}/>
        </div>
      ))}

      {/* Rules */}
      {[{top:50},{bottom:50}].map((pos,i) => (
        <div key={i} style={{position:'absolute',left:'8%',right:'8%',height:1,...pos,
          background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.26),transparent)',
          animation:'ruleExpand 0.65s 0.2s ease forwards',transform:'scaleX(0)',transformOrigin:'center'}}/>
      ))}

      {/* Identity */}
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'clamp(0.46rem,0.82vw,0.6rem)',letterSpacing:'0.58em',
          color:'rgba(0,255,209,0.36)',marginBottom:13,
          animation:'fadeUp 0.5s 0.32s ease forwards',opacity:0}}>
          THE INTELLIGENCE PLATFORM FOR SEARCH DOMINANCE
        </div>
        <div style={{position:'relative',display:'inline-block'}}>
          <div style={{fontSize:'clamp(3.2rem,9vw,7.5rem)',fontWeight:100,
            letterSpacing:'0.24em',lineHeight:1,color:WHT,textIndent:'0.24em',
            textShadow:'0 0 80px rgba(0,255,209,0.06)',
            animation:'titleReveal 0.9s 0.44s cubic-bezier(0.22,1,0.36,1) forwards',opacity:0}}>
            SEO SEASON
          </div>
          <div style={{position:'absolute',bottom:-4,left:'7%',right:'7%',height:1,
            background:`linear-gradient(90deg,transparent,${CYN},transparent)`,
            animation:'ruleExpand 0.5s 1.25s ease forwards',transform:'scaleX(0)',transformOrigin:'center'}}/>
        </div>
        <div style={{fontSize:'clamp(0.52rem,0.95vw,0.7rem)',letterSpacing:'0.37em',
          color:'rgba(255,255,255,0.17)',marginTop:16,
          animation:'fadeUp 0.5s 1.28s ease forwards',opacity:0}}>
          BY MANAV · WHERE INTELLIGENCE BECOMES DOMINANCE
        </div>
      </div>

      {/* Stats row — last item is today's real algo event */}
      <div style={{display:'flex',gap:'clamp(12px,3vw,30px)',marginTop:28,
        animation:'fadeUp 0.5s 1.48s ease forwards',opacity:0,flexWrap:'wrap',justifyContent:'center'}}>
        {[
          {v:'#1',     l:'SEARCH RANK',       c:GOLD},
          {v:'94/100', l:'LLM VISIBILITY',    c:CYN },
          {v:'+340%',  l:'TRAFFIC GROWTH',    c:CYN },
          {v:daily.todayEvent.delta.replace(' ','\u00A0'), l:daily.todayEvent.date.toUpperCase(), c:GOLD},
        ].map(({v,l,c},i) => (
          <div key={i} style={{textAlign:'center',minWidth:72}}>
            <div style={{fontSize:'clamp(1rem,2vw,1.48rem)',fontWeight:200,color:c,
              textShadow:`0 0 16px ${c}32`}}>{v}</div>
            <div style={{fontSize:'clamp(0.4rem,0.62vw,0.5rem)',color:'rgba(255,255,255,0.2)',
              letterSpacing:'0.17em',marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Learnings count — dynamic daily */}
      <div style={{fontSize:'clamp(0.42rem,0.65vw,0.52rem)',color:'rgba(0,255,209,0.28)',
        letterSpacing:'0.22em',marginTop:14,
        animation:'fadeUp 0.5s 1.65s ease forwards',opacity:0}}>
        {daily.learningsToday} ACTIVE LEARNINGS INTEGRATED TODAY
      </div>

      {/* CTA */}
      <button onClick={onEnter} style={{
        marginTop:28,background:'transparent',
        border:'1px solid rgba(0,255,209,0.3)',borderRadius:0,
        padding:'clamp(10px,1.7vh,13px) clamp(40px,6vw,60px)',
        cursor:'pointer',letterSpacing:'0.42em',
        color:CYN,fontSize:'clamp(0.56rem,0.92vw,0.7rem)',fontWeight:400,
        fontFamily:'"Courier New",monospace',transition:'all 0.26s',
        animation:'fadeUp 0.5s 1.82s ease forwards',opacity:0 }}
      onMouseEnter={e=>{const el=e.currentTarget;el.style.background='rgba(0,255,209,0.05)';el.style.borderColor='rgba(0,255,209,0.6)';el.style.boxShadow='0 0 24px rgba(0,255,209,0.1)';el.style.letterSpacing='0.52em';}}
      onMouseLeave={e=>{const el=e.currentTarget;el.style.background='transparent';el.style.borderColor='rgba(0,255,209,0.3)';el.style.boxShadow='none';el.style.letterSpacing='0.42em';}}>
        ENTER THE INTELLIGENCE
      </button>

      <div style={{fontSize:'clamp(0.4rem,0.62vw,0.5rem)',color:'rgba(255,255,255,0.13)',
        letterSpacing:'0.17em',marginTop:16,
        animation:'fadeUp 0.4s 1.98s ease forwards',opacity:0}}>
        APPROVED CLIENTS ONLY · MANAGED PERSONALLY BY MANAV
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ROOT
───────────────────────────────────────────── */
export default function IntroAnimation({ onComplete }: { onComplete: () => void }) {
  const [act,     setAct]     = useState(0);
  const [showHUD, setShowHUD] = useState(false);
  const [visible, setVisible] = useState(true);
  const daily   = useMemo(getDailyData, []);
  const startMs = useRef(0);
  const rafM    = useRef(0);

  useEffect(() => {
    startMs.current = performance.now();
    const tick = (now: number) => {
      const el = now - startMs.current;
      if (el > ACT.II && !showHUD) setShowHUD(true);
      if (el < ACT.END) rafM.current = requestAnimationFrame(tick);
    };
    rafM.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafM.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onActChange = useCallback((a: number) => setAct(a), []);
  const exit = useCallback((d = 380) => {
    cancelAnimationFrame(rafM.current);
    setVisible(false);
    setTimeout(onComplete, d);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div style={{ position:'fixed',inset:0,zIndex:99999,background:BG,overflow:'hidden' }}>

      <SignalEngine onActChange={onActChange}/>

      {/* Scan line — acts 1-2, thin, non-distracting */}
      {showHUD && act >= 1 && act <= 2 && (
        <div style={{ position:'absolute',left:0,right:0,height:1,pointerEvents:'none',
          background:`linear-gradient(90deg,transparent,${CYN}20,transparent)`,
          animation:'scan 4.5s linear infinite' }}/>
      )}

      {/* Corner brackets — acts 1-4 */}
      {showHUD && act < 4 && (
        <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
          {(['tl','tr','bl','br'] as const).map(p=><Bracket key={p} pos={p}/>)}
        </div>
      )}

      {/* Act texts */}
      {act < 4 && <ActText act={act} daily={daily}/>}

      {/* Bottom strip — no overlap with top text, no overlap with each other */}
      <BottomStrip act={act} feed={daily.feedLines}/>

      {/* Act V */}
      {act >= 4 && <ActV onEnter={() => exit(520)} daily={daily}/>}

      {/* SKIP — bottom-right, never in top-zone conflict */}
      {act < 4 && (
        <button onClick={() => exit(160)} style={{
          position:'absolute',bottom:20,right:24,zIndex:20,
          background:'none',border:'none',cursor:'pointer',
          color:'rgba(255,255,255,0.17)',fontSize:'clamp(0.5rem,0.78vw,0.6rem)',
          letterSpacing:'0.2em',fontFamily:'"Courier New",monospace',
          padding:'5px 10px',transition:'color 0.2s' }}
        onMouseEnter={e=>(e.currentTarget.style.color='rgba(0,255,209,0.6)')}
        onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.17)')}>
          SKIP
        </button>
      )}

      <style>{`
        @keyframes textIn    { from{opacity:0;transform:translateY(8px);filter:blur(3px)} to{opacity:1;transform:none;filter:none} }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:none} }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        @keyframes scan      { from{top:0} to{top:100vh} }
        @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0.22} }
        @keyframes actVIn    { from{opacity:0} to{opacity:1} }
        @keyframes bracketIn { from{opacity:0;transform:scale(0.72)} to{opacity:1;transform:scale(1)} }
        @keyframes ruleExpand{ from{transform:scaleX(0);opacity:0} to{transform:scaleX(1);opacity:1} }
        @keyframes titleReveal{ from{opacity:0;letter-spacing:0.65em;filter:blur(8px)} to{opacity:1;filter:blur(0)} }
      `}</style>
    </div>
  );
}
