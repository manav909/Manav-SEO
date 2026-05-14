/**
 * SEO SEASON — CINEMATIC UNIVERSE
 *
 * The internet is alive. 8.5 billion signals per day.
 * Manav reads every one.
 *
 * Five acts. One universe.
 *
 * ACT I   · THE VOID         — The internet as it really is
 * ACT II  · THE NETWORK      — Every search a signal, every link a trust
 * ACT III · THE INTELLIGENCE — Manav enters the signal space
 * ACT IV  · THE DOMINANCE    — What happens when intelligence meets your brand
 * ACT V   · SEO SEASON       — The universe converges
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

/* ─── Colour system ─── */
const CYN  = '#00FFD1';   // electric cyan — the signal
const RED  = '#FF3062';   // power / authority
const WHT  = '#F0F8FF';   // pure signal
const GOLD = '#FFB800';   // Manav / achievement
const BG   = '#03060F';   // the void

/* ─── Act timing (ms) ─── */
const ACT = { I:0, II:2800, III:6000, IV:9200, V:12000, END:15000 };

/* ═══════════════════════════════════════════════════════════
   SIGNAL ENGINE — Canvas renderer, all acts
═══════════════════════════════════════════════════════════ */
function SignalEngine({ onActChange }: { onActChange:(a:number)=>void }) {
  const ref  = useRef<HTMLCanvasElement>(null);
  const raf  = useRef(0);
  const t0   = useRef(0);
  const actR = useRef(0);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const resize = () => { c.width = innerWidth; c.height = innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    /* ── Node system ── */
    type Node = { id:number; x:number; y:number; label:string; color:string;
                  r:number; born:number; links:number[]; pulse:number; role:string; };
    type Particle = { x:number; y:number; tx:number; ty:number;
                      progress:number; speed:number; color:string; };

    const nodeData = [
      { label:'SEARCH INTENT',   color:CYN,   r:6,  role:'signal'  },
      { label:'BACKLINK TRUST',  color:WHT,   r:5,  role:'signal'  },
      { label:'ALGO SIGNALS',    color:CYN,   r:5,  role:'signal'  },
      { label:'CONTENT DEPTH',   color:WHT,   r:5,  role:'signal'  },
      { label:'LLM VISIBILITY',  color:GOLD,  r:7,  role:'power'   },
      { label:'E-E-A-T',         color:WHT,   r:5,  role:'signal'  },
      { label:'COMPETITOR GAPS', color:RED,   r:5,  role:'threat'  },
      { label:'CORE WEB VITALS', color:CYN,   r:5,  role:'signal'  },
      { label:'TOPICAL AUTH',    color:GOLD,  r:6,  role:'power'   },
      { label:'SCHEMA MARKUP',   color:WHT,   r:4,  role:'signal'  },
      { label:'CTR SIGNALS',     color:CYN,   r:5,  role:'signal'  },
      { label:'BRAND AUTHORITY', color:GOLD,  r:6,  role:'power'   },
    ];
    const linkMap = [[0,2],[0,4],[1,4],[1,6],[2,8],[3,4],[3,5],[4,7],[4,11],
                     [5,8],[6,9],[7,10],[8,11],[9,10],[10,11],[0,1],[2,3],[6,7]];

    let nodes: Node[] = [];
    let particles: Particle[] = [];
    let manav = { x:0, y:0, r:14, angle:0, orbitR:[80,130,190] as number[] };
    let traffic = 0;
    let rankNum = 47;
    let rankTimer = 0;
    const rankSteps = [47,32,18,9,4,1];
    let rankIdx = 0;

    const place = (W:number, H:number) => {
      const cx = W/2, cy = H/2;
      const spread = Math.min(W,H) * 0.36;
      nodes = nodeData.map((nd,i) => {
        const angle = (i/nodeData.length)*Math.PI*2 - Math.PI/2;
        const r2    = spread * (0.55 + 0.45*((i%3)/2));
        return {
          id:i, x:cx+r2*Math.cos(angle), y:cy+r2*Math.sin(angle),
          label:nd.label, color:nd.color, r:nd.r,
          born:0, links:[], pulse:Math.random()*Math.PI*2,
          role:nd.role,
        };
      });
      manav = { ...manav, x:cx, y:cy };
    };

    const spawnParticle = (fromIdx:number, toIdx:number) => {
      if (!nodes[fromIdx] || !nodes[toIdx]) return;
      particles.push({
        x:nodes[fromIdx].x, y:nodes[fromIdx].y,
        tx:nodes[toIdx].x,  ty:nodes[toIdx].y,
        progress:0, speed:0.008+Math.random()*0.006,
        color:nodes[fromIdx].color,
      });
    };

    place(c.width, c.height);

    const draw = (now:number) => {
      if (!t0.current) t0.current = now;
      const el  = now - t0.current;
      const W = c.width, H = c.height;
      const cx = W/2, cy = H/2;

      /* Advance act */
      const newAct = el < ACT.II ? 0 : el < ACT.III ? 1 : el < ACT.IV ? 2 : el < ACT.V ? 3 : 4;
      if (newAct !== actR.current) { actR.current = newAct; onActChange(newAct); }

      /* Update manav */
      manav.angle += 0.006;
      manav.x = cx + Math.sin(el*0.0003)*8;
      manav.y = cy + Math.cos(el*0.0004)*6;

      /* Update rank counter */
      if (el > ACT.IV + 500) {
        rankTimer += 16;
        if (rankTimer > 450 && rankIdx < rankSteps.length-1) {
          rankIdx++; rankNum = rankSteps[rankIdx]; rankTimer=0;
        }
      }
      if (el > ACT.IV) traffic = Math.min(34847, Math.round((el-ACT.IV)/3000*34847));

      /* ── DRAW ── */
      /* Persistent dark background with very slight fade trail */
      const fadeA = el < ACT.II ? 0.25 : 0.12;
      ctx(c, ctx2 => {
        ctx2.fillStyle = `rgba(3,6,15,${fadeA})`;
        ctx2.fillRect(0,0,W,H);
      });

      const g = c.getContext('2d')!;

      /* ═══ ACT I: The Void ═══ */
      if (el < ACT.II + 500) {
        const t = Math.min(1, el/1200);
        /* Breathing orb */
        const breathe = 0.7 + 0.3*Math.sin(el*0.003);
        const orbR    = 60 * t * breathe;
        const grad    = g.createRadialGradient(cx,cy,0,cx,cy,orbR*2);
        grad.addColorStop(0, `rgba(0,255,209,${0.06*t})`);
        grad.addColorStop(1, 'rgba(0,255,209,0)');
        g.beginPath(); g.arc(cx,cy,orbR*2,0,Math.PI*2);
        g.fillStyle = grad; g.fill();
        /* Central dot */
        g.beginPath(); g.arc(cx,cy,3*t,0,Math.PI*2);
        g.fillStyle = `rgba(0,255,209,${t})`; g.shadowBlur=20; g.shadowColor=CYN; g.fill();
        g.shadowBlur=0;
        /* Scan rings */
        [1,2,3].forEach(i => {
          const r2  = (el/1200*200 - i*60) % 320;
          const a2  = Math.max(0, 0.4-r2/320*0.4)*t;
          if (r2 > 0) {
            g.beginPath(); g.arc(cx,cy,r2,0,Math.PI*2);
            g.strokeStyle = `rgba(0,255,209,${a2})`; g.lineWidth=0.8; g.stroke();
          }
        });
      }

      /* ═══ ACT II+: Network ═══ */
      if (el > ACT.II) {
        const netT = Math.min(1,(el-ACT.II)/2000);

        /* Spawn particles on links */
        if (Math.random()<0.15) {
          const lnk = linkMap[Math.floor(Math.random()*linkMap.length)];
          spawnParticle(lnk[0],lnk[1]);
        }

        /* Draw link lines */
        linkMap.forEach(([a,b]) => {
          if (!nodes[a]||!nodes[b]) return;
          const na = nodes[a], nb = nodes[b];
          const bornT = Math.min(1,Math.max(0,(el-ACT.II-Math.min(a,b)*120)/600));
          if (bornT <= 0) return;
          g.beginPath(); g.moveTo(na.x,na.y); g.lineTo(nb.x,nb.y);
          g.strokeStyle = `rgba(0,255,209,${0.08*bornT})`;
          g.lineWidth = 0.5+0.3*bornT; g.stroke();
        });

        /* Update & draw particles */
        particles = particles.filter(p => {
          p.progress += p.speed;
          const x = p.x + (p.tx-p.x)*p.progress;
          const y = p.y + (p.ty-p.y)*p.progress;
          const a = Math.sin(p.progress*Math.PI)*0.9;
          g.beginPath(); g.arc(x,y,1.5,0,Math.PI*2);
          const hexC = p.color.slice(1);
          const r2=parseInt(hexC.slice(0,2),16), g2=parseInt(hexC.slice(2,4),16), b2=parseInt(hexC.slice(4,6),16);
          g.fillStyle = `rgba(${r2},${g2},${b2},${a})`;
          g.shadowBlur=6; g.shadowColor=p.color; g.fill(); g.shadowBlur=0;
          return p.progress < 1;
        });

        /* Draw nodes */
        nodes.forEach((n,i) => {
          const bornT = Math.min(1,Math.max(0,(el-ACT.II-i*150)/400));
          if (bornT <= 0) return;
          const pulse = 0.5+0.5*Math.sin(el*0.002+n.pulse);
          /* Aura */
          const aura = g.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*4);
          const hexC = n.color.slice(1);
          const r2=parseInt(hexC.slice(0,2),16), gc=parseInt(hexC.slice(2,4),16), b2=parseInt(hexC.slice(4,6),16);
          aura.addColorStop(0, `rgba(${r2},${gc},${b2},${0.1*bornT*pulse})`);
          aura.addColorStop(1, `rgba(${r2},${gc},${b2},0)`);
          g.beginPath(); g.arc(n.x,n.y,n.r*4,0,Math.PI*2); g.fillStyle=aura; g.fill();
          /* Outer ring */
          g.beginPath(); g.arc(n.x,n.y,n.r+4*pulse,0,Math.PI*2);
          g.strokeStyle=`rgba(${r2},${gc},${b2},${0.25*bornT})`; g.lineWidth=0.8; g.stroke();
          /* Core */
          g.beginPath(); g.arc(n.x,n.y,n.r*bornT,0,Math.PI*2);
          g.fillStyle=`rgba(${r2},${gc},${b2},${0.85*bornT})`;
          g.shadowBlur=12*pulse; g.shadowColor=n.color; g.fill(); g.shadowBlur=0;
          /* Label — appears after node */
          if (bornT > 0.7 && el < ACT.V) {
            g.font=`500 9px "Courier New",monospace`;
            g.fillStyle=`rgba(${r2},${gc},${b2},${(bornT-0.7)/0.3*0.7})`;
            g.textAlign='center'; g.textBaseline='bottom';
            g.fillText(n.label, n.x, n.y - n.r - 7);
          }
        });
      }

      /* ═══ ACT III+: Manav ═══ */
      if (el > ACT.III) {
        const t = Math.min(1,(el-ACT.III)/1500);
        const mx = manav.x, my = manav.y;

        /* Orbital rings */
        manav.orbitR.forEach((or, i) => {
          const speed = [0.012,0.008,0.005][i];
          const a     = manav.angle * speed * 60 + i*(Math.PI*2/3);
          const alpha = Math.min(t, 0.15 + i*0.04);
          g.beginPath(); g.arc(mx,my,or*t,0,Math.PI*2);
          g.strokeStyle=`rgba(0,255,209,${alpha})`; g.lineWidth=0.6; g.stroke();
          /* Orbital dot */
          const dx = mx + or*t*Math.cos(a), dy = my + or*t*Math.sin(a);
          g.beginPath(); g.arc(dx,dy,2.5,0,Math.PI*2);
          g.fillStyle=`rgba(255,184,0,${0.8*t})`;
          g.shadowBlur=10; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;
        });

        /* Manav core */
        const pulseM = 0.85+0.15*Math.sin(el*0.004);
        const coreR  = manav.r * t * pulseM;
        const mGrad  = g.createRadialGradient(mx,my,0,mx,my,coreR*3);
        mGrad.addColorStop(0, `rgba(255,184,0,${0.2*t})`);
        mGrad.addColorStop(0.4,`rgba(0,255,209,${0.06*t})`);
        mGrad.addColorStop(1, 'rgba(0,0,0,0)');
        g.beginPath(); g.arc(mx,my,coreR*3,0,Math.PI*2); g.fillStyle=mGrad; g.fill();
        g.beginPath(); g.arc(mx,my,coreR,0,Math.PI*2);
        g.fillStyle=GOLD; g.shadowBlur=24*pulseM; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;
        g.beginPath(); g.arc(mx,my,coreR+5*pulseM,0,Math.PI*2);
        g.strokeStyle=`rgba(255,184,0,0.4)`; g.lineWidth=1; g.stroke();

        /* MANAV label */
        if (t > 0.5) {
          const la = (t-0.5)/0.5;
          g.font=`600 11px "Courier New",monospace`;
          g.fillStyle=`rgba(255,184,0,${la*0.85})`;
          g.textAlign='center'; g.textBaseline='top';
          g.fillText('MANAV', mx, my + coreR + 12);
          g.font=`400 8px "Courier New",monospace`;
          g.fillStyle=`rgba(0,255,209,${la*0.5})`;
          g.fillText('INTELLIGENCE NODE', mx, my + coreR + 26);
        }

        /* Lines from Manav to powered nodes */
        if (t > 0.3) {
          [4,8,11].forEach(ni => {
            if (!nodes[ni]) return;
            const lineA = (t-0.3)/0.7*0.35;
            g.beginPath(); g.moveTo(mx,my); g.lineTo(nodes[ni].x,nodes[ni].y);
            const lgd = g.createLinearGradient(mx,my,nodes[ni].x,nodes[ni].y);
            lgd.addColorStop(0,`rgba(255,184,0,${lineA})`);
            lgd.addColorStop(1,`rgba(0,255,209,0)`);
            g.strokeStyle=lgd; g.lineWidth=1; g.stroke();
          });
        }
      }

      /* ═══ ACT IV: HUD data ═══ */
      if (el > ACT.IV) {
        const t = Math.min(1,(el-ACT.IV)/1800);
        /* Floating rank ring — bottom-left quadrant */
        const rx = W*0.22, ry = H*0.55;
        const ringR = 55*t;
        g.beginPath(); g.arc(rx,ry,ringR,0,Math.PI*2);
        g.strokeStyle=`rgba(0,255,209,${0.15*t})`; g.lineWidth=1; g.stroke();
        /* Rank number */
        const fs = Math.round(28*t);
        g.font=`300 ${fs}px "Courier New",monospace`;
        const rankColor = rankNum === 1 ? GOLD : CYN;
        g.fillStyle=`rgba(${rankNum===1?'255,184,0':'0,255,209'},${0.9*t})`;
        g.shadowBlur=rankNum===1?20:0; g.shadowColor=rankNum===1?GOLD:CYN;
        g.textAlign='center'; g.textBaseline='middle';
        g.fillText(`#${rankNum}`,rx,ry); g.shadowBlur=0;
        g.font=`400 7px "Courier New",monospace`;
        g.fillStyle=`rgba(255,255,255,${0.3*t})`;
        g.fillText('SEARCH RANK',rx,ry+ringR+14);

        /* Traffic counter — bottom-right */
        const tx2 = W*0.78, ty2 = H*0.55;
        g.font=`300 ${Math.round(20*t)}px "Courier New",monospace`;
        g.fillStyle=`rgba(0,255,209,${0.85*t})`;
        g.textAlign='center'; g.textBaseline='middle';
        g.fillText(traffic.toLocaleString(), tx2, ty2);
        g.font=`400 7px "Courier New",monospace`;
        g.fillStyle=`rgba(255,255,255,${0.3*t})`;
        g.fillText('ORGANIC SESSIONS/MO', tx2, ty2+28);

        /* Mini bars */
        const bx = tx2-40, by = ty2-55;
        const bars = [0.4,0.55,0.62,0.75,0.82,0.90,0.96,1.0];
        bars.forEach((h,i) => {
          const bh = 28*h*t, bw = 6;
          g.beginPath(); g.rect(bx+i*(bw+3), by+28-bh, bw, bh);
          g.fillStyle=`rgba(0,255,209,${(0.3+h*0.5)*t})`; g.fill();
        });
      }

      if (el < ACT.END) raf.current = requestAnimationFrame(draw);
    };

    raf.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener('resize', resize); };
  }, [onActChange]);

  return (
    <canvas ref={ref} style={{
      position:'absolute', inset:0, width:'100%', height:'100%',
    }}/>
  );
}

/* Helper to run ctx ops */
function ctx(c:HTMLCanvasElement, fn:(ctx:CanvasRenderingContext2D)=>void){
  const g=c.getContext('2d'); if(g) fn(g);
}

/* ═══════════════════════════════════════════════════════════
   WIREFRAME HUD ELEMENTS
═══════════════════════════════════════════════════════════ */
function CornerBracket({ pos }: { pos: 'tl'|'tr'|'bl'|'br' }) {
  const s = { position:'absolute' as const, width:36, height:36 };
  const p: Record<string,object> = {
    tl:{ top:18, left:18 }, tr:{ top:18, right:18 },
    bl:{ bottom:18, left:18 }, br:{ bottom:18, right:18 },
  };
  const r: Record<string,string> = { tl:'0', tr:'90deg', bl:'-90deg', br:'180deg' };
  return (
    <div style={{ ...s, ...p[pos], transform:`rotate(${r[pos]})` }}>
      <div style={{ position:'absolute', top:0, left:0, width:20, height:1, background:`rgba(0,255,209,0.5)` }}/>
      <div style={{ position:'absolute', top:0, left:0, width:1, height:20, background:`rgba(0,255,209,0.5)` }}/>
    </div>
  );
}

function ScanLine({ visible }: { visible:boolean }) {
  return visible ? (
    <div style={{
      position:'absolute', left:0, right:0, height:1,
      background:`linear-gradient(90deg,transparent,${CYN}30,transparent)`,
      animation:'scan 3.5s linear infinite',
      pointerEvents:'none',
    }}/>
  ) : null;
}

/* ═══════════════════════════════════════════════════════════
   TEXT OVERLAYS per act
═══════════════════════════════════════════════════════════ */
const MONO: React.CSSProperties = {
  fontFamily:'"Courier New",Courier,monospace',
};

function ActText({ act }: { act:number }) {
  return (
    <>
      {/* ACT I */}
      {act === 0 && (
        <div key="a0" style={{
          position:'absolute', bottom:'clamp(80px,15vh,140px)', left:0, right:0,
          display:'flex', flexDirection:'column', alignItems:'center', gap:12,
          animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards',
          ...MONO,
        }}>
          <div style={{ fontSize:'clamp(0.6rem,1vw,0.7rem)', letterSpacing:'0.5em',
            color:`rgba(0,255,209,0.5)`, textTransform:'uppercase' }}>
            RIGHT NOW, ACROSS THE PLANET
          </div>
          <div style={{ textAlign:'center' }}>
            <span style={{
              fontSize:'clamp(2.2rem,5.5vw,4.5rem)', fontWeight:200,
              color:WHT, letterSpacing:'-0.01em', lineHeight:1,
              textShadow:`0 0 60px rgba(0,255,209,0.15)`,
            }}>
              8,547,392,847
            </span>
            <span style={{ display:'block', fontSize:'clamp(0.65rem,1.2vw,0.9rem)',
              color:'rgba(255,255,255,0.35)', letterSpacing:'0.25em', marginTop:6 }}>
              SEARCHES HAPPENING AS YOU READ THIS
            </span>
          </div>
          <div style={{ fontSize:'clamp(0.55rem,1vw,0.7rem)', color:`rgba(0,255,209,0.3)`,
            letterSpacing:'0.3em' }}>
            EVERY ONE IS AN OPPORTUNITY ∙ MOST BRANDS MISS ALL OF THEM
          </div>
        </div>
      )}

      {/* ACT II */}
      {act === 1 && (
        <div key="a1" style={{
          position:'absolute', top:'clamp(64px,10vh,96px)', left:0, right:0,
          textAlign:'center',
          animation:'textIn 0.7s cubic-bezier(0.22,1,0.36,1) forwards',
          ...MONO,
        }}>
          <div style={{ fontSize:'clamp(0.55rem,0.9vw,0.65rem)', letterSpacing:'0.5em',
            color:`rgba(0,255,209,0.45)`, marginBottom:10 }}>
            THE SIGNAL NETWORK
          </div>
          <div style={{ fontSize:'clamp(1.2rem,3vw,2.2rem)', fontWeight:300,
            color:WHT, lineHeight:1.2 }}>
            Every search has a story.<br/>
            <span style={{ color:CYN }}>Every signal has a pattern.</span>
          </div>
          <div style={{ fontSize:'clamp(0.55rem,0.9vw,0.65rem)', color:'rgba(255,255,255,0.25)',
            letterSpacing:'0.2em', marginTop:10 }}>
            ALGORITHM UPDATES ∙ INTENT SIGNALS ∙ COMPETITOR MOVES ∙ TRUST NETWORKS
          </div>
        </div>
      )}

      {/* ACT III */}
      {act === 2 && (
        <div key="a2" style={{
          position:'absolute', top:'clamp(64px,10vh,96px)', left:0, right:0,
          textAlign:'center',
          animation:'textIn 0.7s cubic-bezier(0.22,1,0.36,1) forwards',
          ...MONO,
        }}>
          <div style={{ fontSize:'clamp(0.55rem,0.9vw,0.65rem)', letterSpacing:'0.5em',
            color:`rgba(255,184,0,0.6)`, marginBottom:10 }}>
            ONE INTELLIGENCE ∙ TRAINED ON EVERY SIGNAL
          </div>
          <div style={{ fontSize:'clamp(1.2rem,3vw,2.2rem)', fontWeight:300,
            color:WHT, lineHeight:1.2 }}>
            Manav doesn't just read the network.<br/>
            <span style={{ color:GOLD }}>He shapes what it says about you.</span>
          </div>
          <div style={{ display:'flex', justifyContent:'center', gap:24, marginTop:20, flexWrap:'wrap' }}>
            {['AUTO-LEARNING','DEEP ENRICHMENT','ALGO ALIGNMENT','GEO INTELLIGENCE'].map((cap,i) => (
              <div key={i} style={{
                fontSize:'clamp(0.5rem,0.8vw,0.6rem)', letterSpacing:'0.2em',
                color:`rgba(255,184,0,0.5)`, display:'flex', alignItems:'center', gap:6,
                animation:`fadeUp 0.4s ${i*100}ms ease forwards`, opacity:0,
              }}>
                <div style={{ width:4, height:4, borderRadius:'50%', background:GOLD,
                  boxShadow:`0 0 6px ${GOLD}` }}/>
                {cap}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACT IV */}
      {act === 3 && (
        <div key="a3" style={{
          position:'absolute', top:'clamp(64px,10vh,96px)', left:0, right:0,
          textAlign:'center',
          animation:'textIn 0.7s cubic-bezier(0.22,1,0.36,1) forwards',
          ...MONO,
        }}>
          <div style={{ fontSize:'clamp(0.55rem,0.9vw,0.65rem)', letterSpacing:'0.5em',
            color:`rgba(0,255,209,0.4)`, marginBottom:10 }}>
            WHAT INTELLIGENCE DOES FOR YOUR BRAND
          </div>
          <div style={{ fontSize:'clamp(1.2rem,3vw,2.2rem)', fontWeight:300,
            color:WHT, lineHeight:1.2 }}>
            From invisible to inevitable.<br/>
            <span style={{ color:CYN }}>Position #1. Every time.</span>
          </div>
        </div>
      )}

      {/* Bottom capability strip — acts II–IV */}
      {act >= 1 && act <= 3 && (
        <div style={{
          position:'absolute', bottom:0, left:0, right:0,
          borderTop:`1px solid rgba(0,255,209,0.08)`,
          background:'rgba(3,6,15,0.7)',
          padding:'10px 32px',
          display:'flex', justifyContent:'center', gap:'clamp(16px,3vw,40px)',
          flexWrap:'wrap',
          animation:'slideUp 0.6s ease forwards', backdropFilter:'blur(8px)',
          ...MONO,
        }}>
          {[
            ['🔍','INTENT MAPPING'],['🧠','LLM CITATIONS'],['📈','RANK VELOCITY'],
            ['🌐','GLOBAL REACH'],['⚡','ALGO ALIGNMENT'],['🎯','CONVERSION SIGNALS'],
          ].map(([icon,label],i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:6,
              fontSize:'clamp(0.5rem,0.8vw,0.65rem)',
              color:'rgba(255,255,255,0.3)', letterSpacing:'0.15em',
              animation:`fadeIn 0.4s ${i*80+200}ms ease forwards`, opacity:0,
            }}>
              <span style={{ fontSize:'clamp(0.7rem,1.2vw,0.9rem)' }}>{icon}</span>
              {label}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACT V — SEO SEASON REVEAL
═══════════════════════════════════════════════════════════ */
function ActV({ onEnter }: { onEnter:()=>void }) {
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:10,
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      background:`radial-gradient(ellipse 80% 60% at 50% 50%, rgba(3,8,20,0.95) 0%, rgba(3,6,15,0.98) 100%)`,
      animation:'actVIn 0.9s cubic-bezier(0.22,1,0.36,1) forwards',
      ...MONO,
    }}>
      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map(p => (
        <div key={p} style={{ animation:`bracketIn 0.5s ${p==='tl'?0:p==='tr'?100:p==='bl'?150:200}ms ease forwards`, opacity:0 }}>
          <CornerBracket pos={p}/>
        </div>
      ))}

      {/* Top rule */}
      <div style={{
        position:'absolute', top:54, left:'10%', right:'10%', height:1,
        background:`linear-gradient(90deg,transparent,rgba(0,255,209,0.3),transparent)`,
        animation:'ruleExpand 0.8s 0.3s ease forwards', transform:'scaleX(0)',
        transformOrigin:'center',
      }}/>

      {/* Main identity */}
      <div style={{ textAlign:'center', position:'relative' }}>
        {/* Sub-heading */}
        <div style={{
          fontSize:'clamp(0.5rem,0.9vw,0.65rem)', letterSpacing:'0.6em',
          color:`rgba(0,255,209,0.4)`, marginBottom:16,
          animation:'fadeUp 0.6s 0.4s ease forwards', opacity:0,
        }}>
          THE INTELLIGENCE PLATFORM FOR SEARCH DOMINANCE
        </div>

        {/* SEASON underline element */}
        <div style={{ position:'relative', display:'inline-block' }}>
          <div style={{
            fontSize:'clamp(3rem,8.5vw,7rem)', fontWeight:100,
            letterSpacing:'0.22em', lineHeight:1,
            color:WHT, textIndent:'0.22em',
            textShadow:`0 0 80px rgba(0,255,209,0.08)`,
            animation:'titleReveal 1s 0.5s cubic-bezier(0.22,1,0.36,1) forwards',
            opacity:0, display:'block',
          }}>
            SEO SEASON
          </div>
          {/* Underline */}
          <div style={{
            position:'absolute', bottom:-4, left:'10%', right:'10%', height:1,
            background:`linear-gradient(90deg,transparent,${CYN},transparent)`,
            animation:'ruleExpand 0.6s 1.3s ease forwards', transform:'scaleX(0)',
            transformOrigin:'center',
          }}/>
        </div>

        {/* Descriptor */}
        <div style={{
          fontSize:'clamp(0.6rem,1.1vw,0.8rem)', letterSpacing:'0.4em',
          color:'rgba(255,255,255,0.2)', marginTop:20,
          animation:'fadeUp 0.6s 1.4s ease forwards', opacity:0,
        }}>
          BY MANAV · WHERE INTELLIGENCE BECOMES DOMINANCE
        </div>
      </div>

      {/* Capability line */}
      <div style={{
        display:'flex', gap:'clamp(12px,2.5vw,28px)', marginTop:36,
        flexWrap:'wrap', justifyContent:'center',
        animation:'fadeUp 0.6s 1.6s ease forwards', opacity:0,
      }}>
        {[
          { v:'#1',      l:'SEARCH RANK',      c:GOLD },
          { v:'94/100',  l:'LLM VISIBILITY',   c:CYN  },
          { v:'+340%',   l:'TRAFFIC GROWTH',   c:CYN  },
          { v:'ACTIVE',  l:'ALGO ALIGNMENT',   c:GOLD },
        ].map(({ v,l,c },i) => (
          <div key={i} style={{ textAlign:'center', minWidth:70 }}>
            <div style={{ fontSize:'clamp(1.1rem,2.2vw,1.6rem)', fontWeight:200,
              color:c, letterSpacing:'0.05em',
              textShadow:`0 0 20px ${c}40` }}>{v}</div>
            <div style={{ fontSize:'clamp(0.45rem,0.7vw,0.55rem)', color:'rgba(255,255,255,0.25)',
              letterSpacing:'0.2em', marginTop:4 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={onEnter} style={{
        marginTop:40,
        background:'transparent',
        border:`1px solid rgba(0,255,209,0.35)`,
        borderRadius:0, padding:'clamp(10px,2vh,14px) clamp(40px,6vw,64px)',
        cursor:'pointer', letterSpacing:'0.4em',
        color:CYN, fontSize:'clamp(0.6rem,1vw,0.75rem)', fontWeight:400,
        fontFamily:'"Courier New",monospace',
        transition:'all 0.3s', position:'relative', overflow:'hidden',
        animation:'fadeUp 0.6s 1.8s ease forwards', opacity:0,
      }}
      onMouseEnter={e=>{
        const el = e.currentTarget;
        el.style.background=`rgba(0,255,209,0.06)`;
        el.style.borderColor=`rgba(0,255,209,0.7)`;
        el.style.boxShadow=`0 0 30px rgba(0,255,209,0.15), inset 0 0 30px rgba(0,255,209,0.04)`;
        el.style.letterSpacing='0.5em';
      }}
      onMouseLeave={e=>{
        const el=e.currentTarget;
        el.style.background='transparent';
        el.style.borderColor='rgba(0,255,209,0.35)';
        el.style.boxShadow='none';
        el.style.letterSpacing='0.4em';
      }}>
        ENTER THE INTELLIGENCE
      </button>

      {/* Bottom rule */}
      <div style={{
        position:'absolute', bottom:54, left:'10%', right:'10%', height:1,
        background:`linear-gradient(90deg,transparent,rgba(0,255,209,0.3),transparent)`,
        animation:'ruleExpand 0.8s 0.3s ease forwards', transform:'scaleX(0)',
        transformOrigin:'center',
      }}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROOT COMPONENT
═══════════════════════════════════════════════════════════ */
export default function IntroAnimation({ onComplete }: { onComplete:()=>void }) {
  const [act,      setAct]      = useState(0);
  const [elapsed,  setElapsed]  = useState(0);
  const [visible,  setVisible]  = useState(true);
  const [showHUD,  setShowHUD]  = useState(false);
  const startMs = useRef(0);
  const rafM    = useRef(0);

  useEffect(() => {
    startMs.current = performance.now();
    const tick = (now:number) => {
      const el = now - startMs.current;
      setElapsed(el);
      if (el > ACT.II) setShowHUD(true);
      if (el < ACT.END) rafM.current = requestAnimationFrame(tick);
    };
    rafM.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafM.current);
  }, []);

  const handleActChange = useCallback((a:number) => setAct(a), []);

  const exit = useCallback((delay=400) => {
    cancelAnimationFrame(rafM.current);
    setVisible(false);
    setTimeout(onComplete, delay);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:99999,
      background:BG, overflow:'hidden',
    }}>
      {/* Signal engine — all canvas work */}
      <SignalEngine onActChange={handleActChange}/>

      {/* HUD overlay chrome */}
      {showHUD && act < 4 && (
        <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
          {(['tl','tr','bl','br'] as const).map(p => (
            <CornerBracket key={p} pos={p}/>
          ))}
          <ScanLine visible={act >= 1 && act <= 3}/>
          {/* Top status */}
          <div style={{
            position:'absolute', top:18, left:'50%', transform:'translateX(-50%)',
            display:'flex', gap:20, alignItems:'center',
            fontFamily:'"Courier New",monospace',
            animation:'fadeIn 0.6s ease forwards',
          }}>
            {[
              { c:CYN,  l:'SIG NETWORK ACTIVE' },
              { c:GOLD, l:'MANAV BRAIN ONLINE'  },
              { c:CYN,  l:'TRACKING 8.5B/DAY'  },
            ].map(({c,l},i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:5,
                fontSize:'clamp(0.45rem,0.7vw,0.6rem)', color:'rgba(255,255,255,0.3)',
                letterSpacing:'0.12em' }}>
                <div style={{ width:4, height:4, borderRadius:'50%', background:c,
                  boxShadow:`0 0 5px ${c}`, animation:`blink ${1+i*0.3}s ease-in-out infinite` }}/>
                {l}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Act text overlays */}
      {act < 4 && <ActText act={act}/>}

      {/* Act V full takeover */}
      {act >= 4 && <ActV onEnter={() => exit(600)}/>}

      {/* Skip */}
      {act < 4 && (
        <button onClick={() => exit(200)} style={{
          position:'absolute', top:18, right:24, zIndex:20,
          background:'none', border:'none', cursor:'pointer',
          color:'rgba(255,255,255,0.2)', fontSize:'clamp(0.55rem,0.9vw,0.65rem)',
          letterSpacing:'0.2em', fontFamily:'"Courier New",monospace',
          padding:'6px 12px', transition:'color 0.2s',
        }}
        onMouseEnter={e=>(e.currentTarget.style.color='rgba(0,255,209,0.7)')}
        onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.2)')}>
          SKIP
        </button>
      )}

      <style>{`
        @keyframes textIn {
          from { opacity:0; transform:translateY(10px); filter:blur(4px) }
          to   { opacity:1; transform:translateY(0);    filter:blur(0)   }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(8px)  }
          to   { opacity:1; transform:translateY(0)    }
        }
        @keyframes fadeIn {
          from { opacity:0 } to { opacity:1 }
        }
        @keyframes slideUp {
          from { opacity:0; transform:translateY(20px) }
          to   { opacity:1; transform:translateY(0)    }
        }
        @keyframes scan {
          from { top:0 } to { top:100vh }
        }
        @keyframes blink {
          0%,100% { opacity:1 } 50% { opacity:0.3 }
        }
        @keyframes actVIn {
          from { opacity:0 } to { opacity:1 }
        }
        @keyframes bracketIn {
          from { opacity:0; transform:scale(0.7) }
          to   { opacity:1; transform:scale(1)   }
        }
        @keyframes ruleExpand {
          from { transform:scaleX(0); opacity:0 }
          to   { transform:scaleX(1); opacity:1 }
        }
        @keyframes titleReveal {
          from { opacity:0; letter-spacing:0.6em; filter:blur(10px) }
          to   { opacity:1; filter:blur(0) }
        }
      `}</style>
    </div>
  );
}
