/**
 * SEO SEASON — CINEMATIC UNIVERSE
 * Responsive: anchored-edge capsules, min(vw,vh) font sizes, no overflow.
 * Two capsule types: SYSTEM (cyan square) and HUMAN (gold round).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

const CYN  = '#00FFD1';
const GOLD = '#FFB800';
const VIO  = '#A78BFA';
const WHT  = '#EEF4FF';
const BG   = '#030810';

const T = { I:0, II:5000, III:10000, IV:15000, V:19000, END:23000 };
const cl  = (v:number,lo:number,hi:number) => Math.max(lo,Math.min(hi,v));
const lp  = (a:number,b:number,t:number)   => a+(b-a)*cl(t,0,1);
const eo3 = (t:number) => 1-Math.pow(1-cl(t,0,1),3);
const eo5 = (t:number) => 1-Math.pow(1-cl(t,0,1),5);
const eio = (t:number) => { const c=cl(t,0,1); return c<.5?2*c*c:1-Math.pow(-2*c+2,2)/2; };

const getLiveBase = () => {
  const n = new Date();
  return 4_200_000_000 + (n.getHours()*3600 + n.getMinutes()*60 + n.getSeconds()) * 129_629;
};

/* ═══════════════════════════════════════════════════════
   CAPSULE DEFINITIONS
   type='system' → algo/platform updates  → cyan, sharp corners
   type='human'  → emotions/behaviour     → gold/violet, rounded

   Positioning:
     side='left'   → left: value%, transform: translateY(-50%)  [no clip]
     side='right'  → right: value%, transform: translateY(-50%) [no clip]
     side='center' → left: value%, transform: translate(-50%,-50%)
   yr: vertical position as % of screen height (must stay in 0.20–0.84)
═══════════════════════════════════════════════════════ */
interface Cap {
  text: string; type: 'system'|'human'; side: 'left'|'right'|'center'; xr: number; yr: number;
}
const CAPS: Cap[] = [
  /* ── LEFT COLUMN (anchored to left edge) ── */
  { text:'Google I/O 2026 · AI Mode Global Default', type:'system', side:'left',  xr:1.2, yr:.26 },
  { text:'March 2026 Core Update · +44% content signals', type:'system', side:'left', xr:1.2, yr:.40 },
  { text:'AI Overviews: 82% of informational SERPs',  type:'system', side:'left',  xr:1.2, yr:.54 },
  { text:'Perplexity · 850M daily queries',            type:'system', side:'left',  xr:1.2, yr:.68 },
  /* ── RIGHT COLUMN (anchored to right edge) ── */
  { text:'ChatGPT Search · 1.1B daily queries',        type:'system', side:'right', xr:1.2, yr:.26 },
  { text:'LLM citations: 34% of branded queries',      type:'system', side:'right', xr:1.2, yr:.40 },
  { text:'Voice search · 1B+ queries per day',         type:'human',  side:'right', xr:1.2, yr:.54 },
  { text:'Zero-click searches · 65% of all queries',   type:'human',  side:'right', xr:1.2, yr:.68 },
  /* ── UPPER SCATTER (just below top text zone) ── */
  { text:'63% abandon if no answer in 3 seconds',      type:'human',  side:'left',  xr:1.2, yr:.22 },
  { text:'76% never scroll past page one',             type:'human',  side:'right', xr:1.2, yr:.22 },
  /* ── LOWER SCATTER ── */
  { text:'Curiosity peaks · Tuesday 2–4 pm',           type:'human',  side:'left',  xr:1.2, yr:.78 },
  { text:'Late-night emotional searches · +340%',      type:'human',  side:'right', xr:1.2, yr:.78 },
  /* ── MID-OUTER (wide screens only, positioned via left/right) ── */
  { text:'Mobile-first · 64% of all searches',         type:'human',  side:'left',  xr:1.2, yr:.33 },
  { text:'FOMO drives 23% more search clicks',         type:'human',  side:'right', xr:1.2, yr:.33 },
  { text:'7 searches per person · every day',          type:'human',  side:'left',  xr:1.2, yr:.62 },
  { text:'Attention span · 8 seconds average',         type:'human',  side:'right', xr:1.2, yr:.62 },
];

/* Build responsive position style for each capsule */
const capStyle = (cap: Cap, idx: number, _W: number, H: number): React.CSSProperties => {
  /* Vertical position — clamp to safe zone 19vh–84vh */
  const topPx = cl(cap.yr * H, H * 0.19, H * 0.84);
  /* Horizontal — edge-anchored so capsules never clip */
  const PAD = '1.8vw';  /* gap from edge */
  const base: React.CSSProperties = {
    position: 'absolute', top: topPx, pointerEvents: 'none',
    animation: `capsuleIn 0.55s ${idx * 160}ms cubic-bezier(0.34,1.56,0.64,1) forwards`,
    opacity: 0,
  };
  if (cap.side === 'left')  return { ...base, left:  PAD,  transform: 'translateY(-50%)' };
  if (cap.side === 'right') return { ...base, right: PAD,  transform: 'translateY(-50%)' };
  return { ...base, left: `${cap.xr * 100}%`, transform: 'translate(-50%,-50%)' };
};

/* ═══════════════════════════════════════════════════════
   CANVAS ENGINE
═══════════════════════════════════════════════════════ */
function CanvasEngine({ onAct }:{ onAct:(n:number)=>void }) {
  const ref  = useRef<HTMLCanvasElement>(null);
  const rafId= useRef(0);
  const t0   = useRef(0);
  const actR = useRef(-1);

  useEffect(()=>{
    const canvas = ref.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const setSize = () => {
      canvas.width  = innerWidth  * dpr;
      canvas.height = innerHeight * dpr;
      canvas.style.width  = innerWidth  + 'px';
      canvas.style.height = innerHeight + 'px';
    };
    setSize(); window.addEventListener('resize', setSize);

    const g = canvas.getContext('2d', { alpha: false })!;
    g.scale(dpr, dpr);
    const W = () => innerWidth, H = () => innerHeight;

    /* ── Signal nodes ── */
    const ND = [
      {lb:'SEARCH INTENT',  c:CYN,  r:5.5},{lb:'BACKLINK TRUST',  c:WHT, r:4.5},
      {lb:'ALGO SIGNALS',   c:CYN,  r:4.5},{lb:'CONTENT DEPTH',   c:WHT, r:4.5},
      {lb:'LLM VISIBILITY', c:GOLD, r:6.5},{lb:'E-E-A-T',         c:WHT, r:4.5},
      {lb:'COMPETITOR GAPS',c:'#FF4477',r:4.5},{lb:'CORE WEB VITALS',c:CYN,r:4.5},
      {lb:'TOPICAL AUTH',   c:GOLD, r:5.5},{lb:'SCHEMA',          c:WHT, r:3.5},
      {lb:'CTR SIGNALS',    c:CYN,  r:4.5},{lb:'BRAND AUTH',      c:GOLD,r:5.5},
    ];
    const LK = [[0,2],[0,4],[1,4],[1,6],[2,8],[3,4],[3,5],[4,7],[4,11],[5,8],[6,9],[7,10],[8,11],[9,10],[10,11],[0,1],[2,3]];
    type NV = {x:number;y:number;lb:string;c:string;r:number;ph:number};
    let nodes: NV[] = [];

    const buildN = () => {
      const cx = W()/2, cy = H()/2;
      /* Ring constrained so nodes stay in central 56% of screen width and 50% of height */
      const rm = Math.min(W()*0.24, H()*0.22, 260);
      nodes = ND.map((nd,i)=>{
        const a=(i/ND.length)*Math.PI*2-Math.PI/2;
        const r=rm*(0.65+0.35*((i%3)/2));
        return { x:cx+r*Math.cos(a), y:cy+r*Math.sin(a), ...nd, ph:Math.random()*Math.PI*2 };
      });
    };
    buildN(); window.addEventListener('resize', buildN);

    type Pt = {x:number;y:number;sx:number;sy:number;tx:number;ty:number;prog:number;spd:number;col:string};
    let parts: Pt[] = [];
    const spPt = (a:{x:number;y:number},b:{x:number;y:number},col:string) =>
      parts.push({x:a.x,y:a.y,sx:a.x,sy:a.y,tx:b.x,ty:b.y,prog:0,spd:.006+Math.random()*.007,col});

    const hx = (c:string):[number,number,number] => {
      const s=c.replace('#','');
      return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];
    };

    let rankV = 47;
    const RP = [47,38,24,13,6,2,1];

    /* ── Capsule pulse streams ── */
    const PERIOD = 4200, TRAVEL = 1000;
    const drawPulses = (el:number, cx:number, cy:number) => {
      if (el < T.III) return;
      const tA = el - T.III;
      CAPS.forEach((cap, i) => {
        /* Compute screen position matching CSS layout */
        const PAD = W() * 0.018;
        const topPx = cl(cap.yr * H(), H()*0.19, H()*0.84);
        let ax: number;
        if      (cap.side === 'left')  ax = PAD + 80;        /* approx capsule half-width */
        else if (cap.side === 'right') ax = W() - PAD - 80;
        else                           ax = cap.xr * W();
        const ay = topPx;

        const phase = (tA + i * (PERIOD / CAPS.length)) % PERIOD;
        if (phase > TRAVEL) return;
        const prog = phase / TRAVEL;
        const eased = eio(prog);

        /* Trail */
        const t0_ = Math.max(0, eased - 0.14), t1_ = eased;
        const [r,gg,b] = hx(cap.type === 'system' ? CYN : GOLD);
        const lg = g.createLinearGradient(lp(ax,cx,t0_),lp(ay,cy,t0_),lp(ax,cx,t1_),lp(ay,cy,t1_));
        lg.addColorStop(0, `rgba(${r},${gg},${b},0)`);
        lg.addColorStop(1, `rgba(${r},${gg},${b},${0.4*Math.sin(prog*Math.PI)})`);
        g.beginPath(); g.moveTo(lp(ax,cx,t0_),lp(ay,cy,t0_)); g.lineTo(lp(ax,cx,t1_),lp(ay,cy,t1_));
        g.strokeStyle=lg; g.lineWidth=0.6; g.stroke();

        /* Leading dot */
        const dotX=lp(ax,cx,eased), dotY=lp(ay,cy,eased);
        const da=0.88*Math.sin(prog*Math.PI);
        g.beginPath(); g.arc(dotX,dotY,2,0,Math.PI*2);
        g.fillStyle=`rgba(${r},${gg},${b},${da})`; g.shadowBlur=7; g.shadowColor=cap.type==='system'?CYN:GOLD; g.fill(); g.shadowBlur=0;

        /* Source glow */
        const sa=0.25*Math.pow(1-prog,3);
        if (sa>.01) {
          const sg=g.createRadialGradient(ax,ay,0,ax,ay,50);
          sg.addColorStop(0,`rgba(${r},${gg},${b},${sa})`); sg.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath(); g.arc(ax,ay,50,0,Math.PI*2); g.fillStyle=sg; g.fill();
        }

        /* Receive flash */
        const ra2=0.18*Math.pow(prog,4);
        if (ra2>.01) {
          const rg=g.createRadialGradient(cx,cy,0,cx,cy,36);
          rg.addColorStop(0,`rgba(${r},${gg},${b},${ra2})`); rg.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath(); g.arc(cx,cy,36,0,Math.PI*2); g.fillStyle=rg; g.fill();
        }
      });
    };

    /* ════════════ DRAW LOOP ════════════ */
    const draw = (now:number) => {
      if (!t0.current) t0.current = now;
      const el = now - t0.current;
      const w=W(), h=H(), cx=w/2, cy=h/2;

      const na = el<T.II?0:el<T.III?1:el<T.IV?2:el<T.V?3:4;
      if (na !== actR.current) { actR.current=na; onAct(na); }

      g.fillStyle = `rgba(3,8,16,${el<T.II?.20:.09})`; g.fillRect(0,0,w,h);

      /* ACT I: orb */
      if (el < T.II+700) {
        const tI=eo3(el/1000), fade=el>T.II?eo3(1-(el-T.II)/700):1;
        const br=.78+.22*Math.sin(el*.002), orbR=cl(Math.min(w,h)*.06,28,56)*tI*br;
        const gr=g.createRadialGradient(cx,cy,0,cx,cy,orbR*2.8);
        gr.addColorStop(0,`rgba(0,255,209,${.04*tI*fade})`); gr.addColorStop(1,'rgba(0,255,209,0)');
        g.beginPath(); g.arc(cx,cy,orbR*2.8,0,Math.PI*2); g.fillStyle=gr; g.fill();
        g.beginPath(); g.arc(cx,cy,2*tI,0,Math.PI*2);
        g.fillStyle=`rgba(0,255,209,${tI*fade})`; g.shadowBlur=10; g.shadowColor=CYN; g.fill(); g.shadowBlur=0;
        for (let i=1;i<=4;i++){
          const rr=((el*.11-i*50)%260+260)%260, ra=Math.max(0,.28-rr/260*.28)*tI*fade;
          if (ra<.003) continue;
          g.beginPath(); g.arc(cx,cy,rr,0,Math.PI*2); g.strokeStyle=`rgba(0,255,209,${ra})`; g.lineWidth=.5; g.stroke();
        }
      }

      /* ACT II+: network */
      if (el > T.II) {
        const nT=eo3((el-T.II)/1800);
        if (Math.random()<.12*nT) { const lk=LK[Math.floor(Math.random()*LK.length)]; if(nodes[lk[0]]&&nodes[lk[1]]) spPt(nodes[lk[0]],nodes[lk[1]],nodes[lk[0]].c); }
        g.lineWidth=.5;
        LK.forEach(([a,b])=>{
          if(!nodes[a]||!nodes[b]) return;
          const bt=eo3(cl((el-T.II-Math.min(a,b)*110)/420,0,1)); if(bt<.01) return;
          g.beginPath(); g.moveTo(nodes[a].x,nodes[a].y); g.lineTo(nodes[b].x,nodes[b].y);
          g.strokeStyle=`rgba(0,255,209,${.055*bt})`; g.stroke();
        });
        parts=parts.filter(p=>{
          p.prog+=p.spd;
          const px=lp(p.sx,p.tx,p.prog), py=lp(p.sy,p.ty,p.prog), pa=Math.sin(p.prog*Math.PI)*.7;
          const [r,gg,b]=hx(p.col);
          g.beginPath(); g.arc(px,py,1.2,0,Math.PI*2);
          g.fillStyle=`rgba(${r},${gg},${b},${pa})`; g.shadowBlur=3; g.shadowColor=p.col; g.fill(); g.shadowBlur=0;
          return p.prog<1;
        });
        /* Reduced label zone — only below 62% height */
        const labelFloor = h*0.62;
        nodes.forEach((n,i)=>{
          const bt=eo3(cl((el-T.II-i*130)/360,0,1)); if(bt<.01) return;
          const pulse=.6+.4*Math.sin(el*.0015+n.ph);
          const [r,gg,b]=hx(n.c);
          const aura=g.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*5);
          aura.addColorStop(0,`rgba(${r},${gg},${b},${.065*bt*pulse})`); aura.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath(); g.arc(n.x,n.y,n.r*5,0,Math.PI*2); g.fillStyle=aura; g.fill();
          g.beginPath(); g.arc(n.x,n.y,n.r+2.5*pulse,0,Math.PI*2);
          g.strokeStyle=`rgba(${r},${gg},${b},${.18*bt})`; g.lineWidth=.6; g.stroke();
          g.beginPath(); g.arc(n.x,n.y,n.r*bt,0,Math.PI*2);
          g.fillStyle=`rgba(${r},${gg},${b},${.9*bt})`; g.fill();
          if (bt>.85 && n.y>labelFloor && el<T.V) {
            const la=(bt-.85)/.15*.5;
            g.font=`500 ${cl(Math.round(w*0.006),7,9)}px "Courier New",monospace`;
            g.fillStyle=`rgba(${r},${gg},${b},${la})`; g.textAlign='center'; g.textBaseline='bottom';
            g.fillText(n.lb,n.x,n.y-n.r-8);
          }
        });
      }

      /* ACT III+: Manav + pulse streams */
      if (el > T.III) {
        const tA=cl((el-T.III)/(T.IV-T.III),0,1);
        drawPulses(el,cx,cy);

        const ORBIT=[cl(w*.07,60,88), cl(w*.10,90,140), cl(w*.14,120,200)];
        ORBIT.forEach((or,i)=>{
          const a=(el-T.III)*.001*[1.2,.75,.5][i]+i*(Math.PI*2/3);
          g.beginPath(); g.arc(cx,cy,or*eo5(tA*1.4),0,Math.PI*2);
          g.strokeStyle=`rgba(0,255,209,${(.1+i*.03)*eo3(tA)})`; g.lineWidth=.5; g.stroke();
          const dx=cx+or*eo5(tA*1.4)*Math.cos(a), dy=cy+or*eo5(tA*1.4)*Math.sin(a);
          g.beginPath(); g.arc(dx,dy,2.2,0,Math.PI*2);
          g.fillStyle=`rgba(255,184,0,${.68*eo3(tA)})`; g.shadowBlur=6; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;
        });
        const pm=.86+.14*Math.sin(el*.003), cR=cl(Math.min(w,h)*.018,10,14)*eo5(tA*1.2)*pm;
        const mg=g.createRadialGradient(cx,cy,0,cx,cy,cR*3.5);
        mg.addColorStop(0,`rgba(255,184,0,${.14*eo3(tA)})`); mg.addColorStop(.5,`rgba(0,255,209,${.04*eo3(tA)})`); mg.addColorStop(1,'rgba(0,0,0,0)');
        g.beginPath(); g.arc(cx,cy,cR*3.5,0,Math.PI*2); g.fillStyle=mg; g.fill();
        g.beginPath(); g.arc(cx,cy,cR,0,Math.PI*2);
        g.fillStyle=GOLD; g.shadowBlur=14*pm; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;

        const la=eo3(cl((el-T.III-500)/700,0,1));
        if (la>.01) {
          const fs=cl(Math.round(w*.009),9,12);
          g.font=`600 ${fs}px "Courier New",monospace`; g.fillStyle=`rgba(255,184,0,${la*.8})`; g.textAlign='center'; g.textBaseline='top';
          g.fillText('MANAV',cx,cy+cR+10);
          g.font=`400 ${cl(Math.round(w*.006),7,8)}px "Courier New",monospace`; g.fillStyle=`rgba(0,255,209,${la*.42})`;
          g.fillText('INTELLIGENCE NODE',cx,cy+cR+24);
        }
      }

      /* ACT IV: rank */
      if (el > T.IV) {
        const p=cl((el-T.IV)/(T.V-T.IV),0,1);
        const raw=p*(RP.length-1), lo=Math.floor(raw), hi=Math.min(lo+1,RP.length-1);
        rankV=lp(rankV,lp(RP[lo],RP[hi],raw-lo),.045);
        const rd=Math.round(rankV), ringR=cl(Math.min(w,h)*.07,42,72)*eo5(p*1.3);
        g.beginPath(); g.arc(cx,cy,ringR,0,Math.PI*2);
        g.strokeStyle=`rgba(0,255,209,${.11*eo3(p)})`; g.lineWidth=.7; g.stroke();
        const arcEnd=-Math.PI/2+Math.PI*2*(1-(rankV-1)/46);
        g.beginPath(); g.arc(cx,cy,ringR,-Math.PI/2,arcEnd);
        const rc=rd<=1?GOLD:CYN;
        g.strokeStyle=rc; g.lineWidth=1.5; g.shadowBlur=rd<=1?18:0; g.shadowColor=rc; g.stroke(); g.shadowBlur=0;
        const fs=Math.round(lp(0,cl(Math.min(w,h)*.04,24,34),eo3(p*1.5)));
        if (fs>3) {
          g.font=`200 ${fs}px "Courier New",monospace`;
          g.fillStyle=`rgba(${rd<=1?'255,184,0':'0,255,209'},${.95*eo3(p*1.4)})`;
          g.textAlign='center'; g.textBaseline='middle'; g.shadowBlur=rd<=1?18:0; g.shadowColor=rc;
          g.fillText(`#${rd}`,cx,cy); g.shadowBlur=0;
          g.font=`400 ${cl(Math.round(w*.006),6,8)}px "Courier New",monospace`;
          g.fillStyle=`rgba(255,255,255,${.24*eo3(p)})`;
          g.fillText('SEARCH POSITION',cx,cy+ringR+14);
        }
      }

      if (el < T.END) rafId.current = requestAnimationFrame(draw);
    };

    rafId.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafId.current); window.removeEventListener('resize',setSize); window.removeEventListener('resize',buildN); };
  }, [onAct]);

  return <canvas ref={ref} style={{ position:'absolute', inset:0 }}/>;
}

/* ═══════════════════════════════════════════════════════
   BEHAVIOR CAPSULES — React layer
   system capsules: cyan, sharp (3px radius), ◈ indicator
   human capsules:  gold/violet, rounded (8px radius), ○ indicator
═══════════════════════════════════════════════════════ */
function BehaviorCapsules({ act }:{ act:number }) {
  const [wh, setWh] = useState<[number,number]>([innerWidth, innerHeight]);
  useEffect(() => {
    const fn = () => setWh([innerWidth, innerHeight]);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  const [W, H] = wh;

  if (act < 1 || act > 3) return null;

  return (
    <>
      {CAPS.map((cap, i) => {
        const isSystem = cap.type === 'system';
        const col = isSystem ? CYN : (i % 2 === 0 ? GOLD : VIO);
        const br  = isSystem ? 3 : 7;   /* border-radius */
        const style = capStyle(cap, i, W, H);

        return (
          <div key={i} style={style}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 9px 4px 7px',
              borderRadius: br,
              border: `1px solid ${col}28`,
              /* system: slight left accent bar */
              borderLeft: isSystem ? `2px solid ${col}70` : `1px solid ${col}28`,
              background: isSystem ? `rgba(3,8,20,0.78)` : `rgba(6,6,18,0.72)`,
              backdropFilter: 'blur(8px)',
              maxWidth: 'clamp(140px, 22vw, 220px)',
            }}>
              {/* Type indicator */}
              <div style={{
                flexShrink: 0,
                fontSize: isSystem ? 7 : 8,
                color: `${col}cc`,
                lineHeight: 1,
                /* system = square ◈, human = circle ○ */
              }}>
                {isSystem ? '◈' : '○'}
              </div>
              {/* Category badge */}
              <div style={{
                flexShrink: 0,
                fontSize: 'clamp(5px, 0.48vw, 6.5px)',
                fontFamily: '"Courier New",monospace',
                letterSpacing: '0.1em',
                color: `${col}80`,
                borderRight: `1px solid ${col}25`,
                paddingRight: 5,
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}>
                {isSystem ? 'SYS' : 'HUM'}
              </div>
              {/* Text */}
              <span style={{
                fontSize: 'clamp(6.5px, 0.6vw, 8px)',
                color: `${col}bb`,
                fontFamily: '"Courier New",monospace',
                letterSpacing: '0.06em',
                lineHeight: 1.35,
                whiteSpace: 'normal',
                wordBreak: 'break-word',
              }}>
                {cap.text}
              </span>
              {/* Pulse dot */}
              <div style={{
                width: 3, height: 3, borderRadius: '50%',
                background: col, flexShrink: 0,
                boxShadow: `0 0 4px ${col}`,
                animation: `pulseDot ${1.3 + (i % 5) * 0.28}s ease-in-out infinite`,
              }}/>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   TEXT OVERLAYS
   All sizes use min(vw, vh) via clamp to prevent
   overflow on any aspect ratio.
═══════════════════════════════════════════════════════ */
const MONO: React.CSSProperties = { fontFamily: '"Courier New",Courier,monospace' };
/* Top zone: consistent across all screen sizes */
const TOP: React.CSSProperties = {
  position: 'absolute',
  top: 'clamp(50px, 7vh, 80px)',
  left: '10%', right: '10%',
  textAlign: 'center', ...MONO, pointerEvents: 'none',
};

function LiveCount(){
  const [v,setV]=useState(getLiveBase);
  useEffect(()=>{const iv=setInterval(()=>setV(c=>c+Math.round(129629/4+(Math.random()-.5)*600)),250);return()=>clearInterval(iv);},[]);
  return <>{v.toLocaleString()}</>;
}

function ActOverlay({ act }:{ act:number }) {
  const today = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  /* Font size helper: caps at both vw and vh so tall/narrow screens don't overflow */
  const headline: React.CSSProperties = {
    fontSize: 'clamp(1rem, min(2.6vw, 4.2vh), 2rem)',
    fontWeight: 200, color: WHT, lineHeight: 1.4,
  };
  const body: React.CSSProperties = {
    fontSize: 'clamp(0.65rem, min(1.15vw, 1.9vh), 0.95rem)',
    fontWeight: 200, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6,
    marginTop: 10,
  };
  return (
    <>
      {act===0 && (
        <div key="I" style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',gap:'clamp(6px,1.2vh,12px)',
          ...MONO,pointerEvents:'none', animation:'textIn 1s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          <div style={{ fontSize:'clamp(0.42rem, min(0.72vw, 1.1vh), 0.6rem)', letterSpacing:'0.55em', color:'rgba(0,255,209,0.34)' }}>
            {today} · RIGHT NOW
          </div>
          {/* Counter */}
          <div style={{ lineHeight:1.05, textAlign:'center' }}>
            <div style={{ fontSize:'clamp(1.8rem, min(5.5vw, 8vh), 4.5rem)', fontWeight:200, color:WHT, letterSpacing:'-0.02em', textShadow:'0 0 60px rgba(0,255,209,0.08)' }}>
              <LiveCount/>
            </div>
            <div style={{ fontSize:'clamp(0.5rem, min(0.9vw, 1.4vh), 0.72rem)', color:'rgba(255,255,255,0.26)', letterSpacing:'0.26em', marginTop:5 }}>
              SEARCHES SINCE MIDNIGHT
            </div>
          </div>
          <div style={{ height:1, width:'clamp(80px,10vw,120px)', background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.22),transparent)' }}/>
          <div style={{ ...headline, animation:'fadeUp 0.7s 1.2s ease forwards', opacity:0, maxWidth:'min(520px,78vw)', textAlign:'center' }}>
            The internet has a pulse.
          </div>
          <div style={{ ...headline, color:'rgba(0,255,209,0.68)', animation:'fadeUp 0.7s 2.5s ease forwards', opacity:0 }}>
            Most brands are invisible to it.
          </div>
          <div style={{ marginTop:'clamp(8px,1.4vh,16px)', padding:'5px 14px',
            border:'1px solid rgba(0,255,209,0.1)', background:'rgba(0,255,209,0.025)', borderRadius:3,
            fontSize:'clamp(0.38rem, min(0.6vw, 1vh), 0.5rem)', letterSpacing:'0.12em', color:'rgba(0,255,209,0.35)',
            animation:'fadeUp 0.6s 3.3s ease forwards', opacity:0, textAlign:'center', maxWidth:'min(480px,80vw)' }}>
            TODAY · GOOGLE I/O 2026 · AI MODE NOW GLOBAL DEFAULT · 82% OF SERPS IMPACTED
          </div>
        </div>
      )}
      {act===1 && (
        <div key="II" style={{ ...TOP, animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          <div style={{ fontSize:'clamp(0.4rem, min(0.65vw, 1vh), 0.54rem)', letterSpacing:'0.5em', color:'rgba(0,255,209,0.3)', marginBottom:8 }}>
            THE SIGNAL NETWORK
          </div>
          <div style={headline}>
            Every search is a signal.{' '}<span style={{ color:CYN }}>Every signal has a pattern.</span>
          </div>
          <div style={{ ...body, animation:'fadeUp 0.7s 1.6s ease forwards', opacity:0 }}>
            Human behaviour. Emotional intent. Platform shifts.<br/>
            Every dimension of how your audience searches.
          </div>
        </div>
      )}
      {act===2 && (
        <div key="III" style={{ ...TOP, animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          <div style={{ fontSize:'clamp(0.4rem, min(0.65vw, 1vh), 0.54rem)', letterSpacing:'0.5em', color:'rgba(255,184,0,0.4)', marginBottom:8 }}>
            THE CAPTURE
          </div>
          <div style={headline}>
            Manav reads what no one else can.
          </div>
          <div style={{ ...body, animation:'fadeUp 0.7s 1.8s ease forwards', opacity:0 }}>
            System updates absorbed. Human patterns mapped.<br/>
            Every signal applied to your brand in real time.
          </div>
        </div>
      )}
      {act===3 && (
        <div key="IV" style={{ ...TOP, animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          <div style={{ fontSize:'clamp(0.4rem, min(0.65vw, 1vh), 0.54rem)', letterSpacing:'0.5em', color:'rgba(0,255,209,0.3)', marginBottom:8 }}>
            THE RESULT
          </div>
          <div style={headline}>
            From invisible.{' '}<span style={{ color:GOLD }}>To position #1.</span>
          </div>
          <div style={{ ...body, animation:'fadeUp 0.7s 1.4s ease forwards', opacity:0 }}>
            Not luck. Intelligence applied with precision.<br/>
            While 82% of brands lose ground to AI, yours gains it.
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   ACT V — SEO SEASON REVEAL
   All font sizes use min(vw,vh) to prevent any overflow.
   titleReveal: GPU-only transform+opacity — zero jitter.
═══════════════════════════════════════════════════════ */
function ActV({ onEnter }:{ onEnter:()=>void }) {
  return (
    <div style={{ position:'absolute',inset:0,zIndex:10,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:'radial-gradient(ellipse 80% 65% at 50% 50%,rgba(3,8,22,0.97) 0%,rgba(3,8,16,0.995) 100%)',
      animation:'actVIn 0.9s cubic-bezier(0.22,1,0.36,1) forwards',...MONO }}>

      {(['tl','tr','bl','br'] as const).map((p,i) => (
        <div key={p} style={{ position:'absolute',width:30,height:30,
          ...(p==='tl'?{top:18,left:18}:p==='tr'?{top:18,right:18}:p==='bl'?{bottom:18,left:18}:{bottom:18,right:18}),
          transform:`rotate(${p==='tl'?0:p==='tr'?90:p==='bl'?-90:180}deg)`,
          animation:`bracketIn 0.4s ${i*80}ms ease forwards`,opacity:0 }}>
          <div style={{ position:'absolute',top:0,left:0,width:16,height:1,background:'rgba(0,255,209,0.36)' }}/>
          <div style={{ position:'absolute',top:0,left:0,width:1,height:16,background:'rgba(0,255,209,0.36)' }}/>
        </div>
      ))}

      {[{ top:46 },{ bottom:46 }].map((pos,i) => (
        <div key={i} style={{ position:'absolute',left:'8%',right:'8%',height:1,...pos,
          background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.2),transparent)',
          animation:'ruleExpand 0.6s 0.18s ease forwards',transform:'scaleX(0)',transformOrigin:'center' }}/>
      ))}

      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'clamp(0.4rem, min(0.72vw, 1.1vh), 0.58rem)', letterSpacing:'0.58em',
          color:'rgba(0,255,209,0.28)',marginBottom:14,
          animation:'fadeUp 0.5s 0.26s ease forwards',opacity:0 }}>
          THE INTELLIGENCE PLATFORM FOR SEARCH DOMINANCE
        </div>

        {/* Title — size capped by both vw AND vh to prevent overflow on any screen */}
        <div style={{ position:'relative', display:'inline-block' }}>
          <div style={{
            fontSize: 'clamp(2.4rem, min(8.5vw, 13vh), 7rem)',
            fontWeight: 100, letterSpacing: '0.24em', lineHeight: 1,
            color: WHT, textIndent: '0.24em',
            textShadow: '0 0 80px rgba(0,255,209,0.04)',
            /* GPU-composited only — no letter-spacing animation */
            animation: 'titleReveal 0.9s 0.4s cubic-bezier(0.22,1,0.36,1) forwards',
            opacity: 0,
          }}>
            SEO SEASON
          </div>
          <div style={{ position:'absolute',bottom:-4,left:'6%',right:'6%',height:1,
            background:`linear-gradient(90deg,transparent,${CYN},transparent)`,
            animation:'ruleExpand 0.5s 1.2s ease forwards',transform:'scaleX(0)',transformOrigin:'center' }}/>
        </div>

        <div style={{ fontSize:'clamp(0.46rem, min(0.86vw, 1.3vh), 0.66rem)', letterSpacing:'0.36em',
          color:'rgba(255,255,255,0.15)', marginTop:16,
          animation:'fadeUp 0.5s 1.26s ease forwards', opacity:0 }}>
          BY MANAV · WHERE INTELLIGENCE BECOMES DOMINANCE
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'flex',gap:'clamp(10px, 2.5vw, 28px)',marginTop:22,
        animation:'fadeUp 0.5s 1.44s ease forwards',opacity:0,flexWrap:'wrap',justifyContent:'center' }}>
        {[
          { v:'#1',   l:'SEARCH RANK',       c:GOLD },
          { v:'82%',  l:'AI SERP COVERAGE',  c:CYN  },
          { v:'34%',  l:'LLM CITATION SHARE',c:CYN  },
          { v:'LIVE', l:'ALGO ALIGNMENT',    c:GOLD },
        ].map(({v,l,c},i) => (
          <div key={i} style={{ textAlign:'center', minWidth:62 }}>
            <div style={{ fontSize:'clamp(0.9rem, min(1.8vw, 2.8vh), 1.4rem)', fontWeight:200, color:c, textShadow:`0 0 14px ${c}28` }}>{v}</div>
            <div style={{ fontSize:'clamp(0.36rem, min(0.55vw, 0.85vh), 0.46rem)', color:'rgba(255,255,255,0.17)', letterSpacing:'0.15em', marginTop:3 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={onEnter} style={{ marginTop:24, background:'transparent',
        border:'1px solid rgba(0,255,209,0.24)', borderRadius:0,
        padding:'clamp(9px, 1.4vh, 12px) clamp(32px, 4.5vw, 52px)',
        cursor:'pointer', letterSpacing:'0.4em', color:CYN,
        fontSize:'clamp(0.5rem, min(0.82vw, 1.25vh), 0.64rem)',
        fontWeight:400, fontFamily:'"Courier New",monospace', transition:'all 0.25s',
        animation:'fadeUp 0.5s 1.6s ease forwards', opacity:0 }}
        onMouseEnter={e=>{const t=e.currentTarget;t.style.background='rgba(0,255,209,0.05)';t.style.borderColor='rgba(0,255,209,0.48)';t.style.boxShadow='0 0 18px rgba(0,255,209,0.08)';t.style.letterSpacing='0.5em';}}
        onMouseLeave={e=>{const t=e.currentTarget;t.style.background='transparent';t.style.borderColor='rgba(0,255,209,0.24)';t.style.boxShadow='none';t.style.letterSpacing='0.4em';}}>
        ENTER THE INTELLIGENCE
      </button>

      <div style={{ fontSize:'clamp(0.34rem, min(0.52vw, 0.8vh), 0.44rem)', color:'rgba(255,255,255,0.1)',
        letterSpacing:'0.14em', marginTop:12,
        animation:'fadeUp 0.4s 1.76s ease forwards', opacity:0 }}>
        APPROVED CLIENTS ONLY · MANAGED PERSONALLY BY MANAV
      </div>
    </div>
  );
}

/* ROOT */
export default function IntroAnimation({ onComplete }:{ onComplete:()=>void }) {
  const [act, setAct] = useState(0);
  const [vis, setVis] = useState(true);
  const rafM = useRef(0);
  const onAct = useCallback((n:number) => setAct(n), []);
  const exit  = useCallback((d=400) => { cancelAnimationFrame(rafM.current); setVis(false); setTimeout(onComplete, d); }, [onComplete]);
  if (!vis) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, background:BG, overflow:'hidden' }}>
      <CanvasEngine onAct={onAct}/>
      <BehaviorCapsules act={act}/>
      {act < 4 && <ActOverlay act={act}/>}
      {act >= 4 && <ActV onEnter={() => exit(520)}/>}
      {act < 4 && (
        <button onClick={() => exit(160)} style={{ position:'absolute', bottom:18, right:22, zIndex:20,
          background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.13)',
          fontSize:'clamp(0.44rem, min(0.66vw, 1vh), 0.52rem)', letterSpacing:'0.18em',
          fontFamily:'"Courier New",monospace', padding:'4px 8px', transition:'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color='rgba(0,255,209,0.45)')}
          onMouseLeave={e => (e.currentTarget.style.color='rgba(255,255,255,0.13)')}>
          SKIP
        </button>
      )}
      <style>{`
        @keyframes textIn    { from{opacity:0;transform:translateY(8px);filter:blur(3px)} to{opacity:1;transform:none;filter:none} }
        @keyframes fadeUp    { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:none} }
        @keyframes actVIn    { from{opacity:0} to{opacity:1} }
        @keyframes bracketIn { from{opacity:0;transform:scale(0.72)} to{opacity:1;transform:scale(1)} }
        @keyframes ruleExpand{ from{transform:scaleX(0);opacity:0} to{transform:scaleX(1);opacity:1} }
        @keyframes titleReveal {
          from { opacity:0; transform:translateY(14px) scale(0.97); filter:blur(5px) }
          to   { opacity:1; transform:translateY(0)    scale(1);    filter:blur(0)   }
        }
        @keyframes capsuleIn { from{opacity:0;transform:translateY(-50%) scale(0.88)} to{opacity:1;transform:translateY(-50%) scale(1)} }
        @keyframes pulseDot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.6)} }
      `}</style>
    </div>
  );
}
