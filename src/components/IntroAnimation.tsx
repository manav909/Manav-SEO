/**
 * SEO SEASON — CINEMATIC UNIVERSE
 * May 14 2026
 *
 * Acts:
 *  I   0s  → 5s   THE SIGNAL   — orb, live count, today's pulse
 *  II  5s  → 10s  THE NETWORK  — signal nodes + behavior capsules spread
 *  III 10s → 15s  THE CAPTURE  — capsules pulse streams into Manav
 *  IV  15s → 19s  THE ASCENT   — rank climbs to #1
 *  V   19s → 23s  SEO SEASON   — reveal
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

/* Live counter: May 14 2026 — total AI+traditional 11.2B/day = 129,629/sec */
const getLiveBase=()=>{const n=new Date();return 4_200_000_000+(n.getHours()*3600+n.getMinutes()*60+n.getSeconds())*129_629;};

/* ═══════════════════════════════════════════════════════
   BEHAVIOR CAPSULE DATA
   Facts about how humans browse/search in 2026.
   Positioned to fill screen outside the central node ring
   and outside the top text zone (0-18vh).
   Categories: behavior(CYN), emotion(GOLD), pattern(VIO), signal(#FF88AA)
═══════════════════════════════════════════════════════ */
const CAPS = [
  /* LEFT COLUMN — x: 2-22% */
  { text:'63% leave if no answer in 3s',          cat:'behavior', xr:.035, yr:.28, w:148 },
  { text:'Curiosity peaks Tue 2–4 pm',             cat:'emotion',  xr:.04,  yr:.42, w:140 },
  { text:'Voice search · 1B+ queries/day',         cat:'pattern',  xr:.03,  yr:.56, w:148 },
  { text:'64% of all searches · mobile',           cat:'signal',   xr:.04,  yr:.70, w:140 },
  /* RIGHT COLUMN — x: 78-97% */
  { text:'76% never scroll past page 1',           cat:'behavior', xr:.96,  yr:.30, w:148 },
  { text:'FOMO drives +23% more clicks',           cat:'emotion',  xr:.96,  yr:.44, w:140 },
  { text:'Zero-click · 65% of all queries',        cat:'pattern',  xr:.96,  yr:.58, w:148 },
  { text:'Late-night emotional searches +340%',    cat:'emotion',  xr:.955, yr:.72, w:160 },
  /* TOP SCATTER — y: 20-26%, avoid x center 35-65% */
  { text:'7 searches per person · per day',        cat:'behavior', xr:.19,  yr:.22, w:148 },
  { text:'AI replaces 3.2 searches/day/user',      cat:'pattern',  xr:.80,  yr:.22, w:156 },
  /* BOTTOM SCATTER — y: 78-84% */
  { text:'26 tabs open · average session',         cat:'behavior', xr:.20,  yr:.82, w:148 },
  { text:'Desktop converts 3.5× better',           cat:'signal',   xr:.79,  yr:.82, w:140 },
  /* MID SCATTER — away from center ring */
  { text:'40% rephrase within 10 seconds',         cat:'behavior', xr:.10,  yr:.35, w:148 },
  { text:'Purchase intent · 67% starts with search',cat:'signal', xr:.88,  yr:.36, w:168 },
  { text:'52% now trust AI results over organic',  cat:'pattern',  xr:.88,  yr:.64, w:172 },
  { text:'Attention span · 8 seconds average',     cat:'emotion',  xr:.10,  yr:.63, w:148 },
];

const CAT_COL: Record<string,string> = {
  behavior: CYN, emotion: GOLD, pattern: VIO, signal: '#FF88AA',
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
    const dpr = window.devicePixelRatio||1;

    const setSize=()=>{
      canvas.width =innerWidth *dpr; canvas.height=innerHeight*dpr;
      canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px';
    };
    setSize(); window.addEventListener('resize',setSize);

    const g=canvas.getContext('2d',{alpha:false})!;
    g.scale(dpr,dpr);
    const W=()=>innerWidth, H=()=>innerHeight;

    /* signal nodes */
    const ND=[
      {lb:'SEARCH INTENT',  c:CYN,  r:5.5},{lb:'BACKLINK TRUST',  c:WHT,  r:4.5},
      {lb:'ALGO SIGNALS',   c:CYN,  r:4.5},{lb:'CONTENT DEPTH',   c:WHT,  r:4.5},
      {lb:'LLM VISIBILITY', c:GOLD, r:6.5},{lb:'E-E-A-T',         c:WHT,  r:4.5},
      {lb:'COMPETITOR GAPS',c:'#FF4477',r:4.5},{lb:'CORE WEB VITALS',c:CYN,r:4.5},
      {lb:'TOPICAL AUTH',   c:GOLD, r:5.5},{lb:'SCHEMA',          c:WHT,  r:3.5},
      {lb:'CTR SIGNALS',    c:CYN,  r:4.5},{lb:'BRAND AUTH',      c:GOLD, r:5.5},
    ];
    const LK=[[0,2],[0,4],[1,4],[1,6],[2,8],[3,4],[3,5],[4,7],[4,11],[5,8],[6,9],[7,10],[8,11],[9,10],[10,11],[0,1],[2,3]];
    type NV={x:number;y:number;lb:string;c:string;r:number;ph:number};
    let nodes:NV[]=[];
    const buildN=()=>{
      const cx=W()/2,cy=H()/2,rm=Math.min(W()*.30,H()*.26);
      nodes=ND.map((nd,i)=>{const a=(i/ND.length)*Math.PI*2-Math.PI/2,r=rm*(.62+.38*((i%3)/2));return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a),...nd,ph:Math.random()*Math.PI*2};});
    };
    buildN(); window.addEventListener('resize',buildN);

    type Pt={x:number;y:number;sx:number;sy:number;tx:number;ty:number;prog:number;spd:number;col:string};
    let parts:Pt[]=[];
    const spPt=(a:{x:number;y:number},b:{x:number;y:number},col:string)=>
      parts.push({x:a.x,y:a.y,sx:a.x,sy:a.y,tx:b.x,ty:b.y,prog:0,spd:.006+Math.random()*.007,col});

    const hx=(c:string)=>{const s=c.replace('#','');return[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)] as [number,number,number];};

    /* rank */
    let rankV=47;
    const RP=[47,38,24,13,6,2,1];

    /* ── CAPSULE PULSE RENDERING ──
       Each capsule fires a pulse stream toward Manav center.
       Period: every 4.5s per capsule, staggered by index.
       The pulse is a bright moving dot along the path — not a filled line.
       Capsule briefly glows when firing. */
    const PERIOD  = 4500;   /* ms between pulses per capsule */
    const TRAVEL  = 1100;   /* ms for dot to travel to Manav */

    const drawCapsulePulses=(el:number,cx:number,cy:number)=>{
      if (el<T.III) return;
      const tA=el-T.III;

      CAPS.forEach((cap,i)=>{
        const col=CAT_COL[cap.cat];
        const ax=cap.xr*W(), ay=cap.yr*H();
        /* Stagger: capsule i fires when (tA + i*PERIOD/CAPS.length) % PERIOD < TRAVEL */
        const offset=tA+i*(PERIOD/CAPS.length);
        const phase=offset%PERIOD;
        if (phase>TRAVEL) return;  /* not firing */

        const progress=phase/TRAVEL;  /* 0→1 as dot travels */
        const eased=eio(progress);

        /* Dot position along straight line from cap to Manav */
        const dotX=lp(ax,cx,eased), dotY=lp(ay,cy,eased);

        /* Faint trail behind dot */
        const trailLen=0.12;
        const t0_=Math.max(0,eased-trailLen), t1_=eased;
        g.beginPath();
        g.moveTo(lp(ax,cx,t0_),lp(ay,cy,t0_));
        g.lineTo(lp(ax,cx,t1_),lp(ay,cy,t1_));
        const [r,gg,b]=hx(col);
        const lineGrad=g.createLinearGradient(lp(ax,cx,t0_),lp(ay,cy,t0_),dotX,dotY);
        lineGrad.addColorStop(0,`rgba(${r},${gg},${b},0)`);
        lineGrad.addColorStop(1,`rgba(${r},${gg},${b},${0.45*Math.sin(progress*Math.PI)})`);
        g.strokeStyle=lineGrad; g.lineWidth=0.6; g.stroke();

        /* Bright leading dot */
        const dotA=0.9*Math.sin(progress*Math.PI);
        g.beginPath(); g.arc(dotX,dotY,2.2,0,Math.PI*2);
        g.fillStyle=`rgba(${r},${gg},${b},${dotA})`;
        g.shadowBlur=8; g.shadowColor=col; g.fill(); g.shadowBlur=0;

        /* Source capsule flash */
        const flashA=0.3*Math.pow(1-progress,3);
        if (flashA>0.01){
          const cGrad=g.createRadialGradient(ax,ay,0,ax,ay,cap.w*0.6);
          cGrad.addColorStop(0,`rgba(${r},${gg},${b},${flashA})`);
          cGrad.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath(); g.arc(ax,ay,cap.w*0.6,0,Math.PI*2); g.fillStyle=cGrad; g.fill();
        }

        /* Manav receive flash */
        const receiveA=0.2*Math.pow(progress,4);
        if (receiveA>0.01){
          const rGrad=g.createRadialGradient(cx,cy,0,cx,cy,40);
          rGrad.addColorStop(0,`rgba(${r},${gg},${b},${receiveA})`);
          rGrad.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath(); g.arc(cx,cy,40,0,Math.PI*2); g.fillStyle=rGrad; g.fill();
        }
      });
    };

    /* ════════════ MAIN DRAW LOOP ════════════ */
    const draw=(now:number)=>{
      if (!t0.current) t0.current=now;
      const el=now-t0.current;
      const w=W(),h=H(),cx=w/2,cy=h/2;

      const na=el<T.II?0:el<T.III?1:el<T.IV?2:el<T.V?3:4;
      if (na!==actR.current){actR.current=na;onAct(na);}

      /* trail */
      g.fillStyle=`rgba(3,8,16,${el<T.II?.20:.09})`; g.fillRect(0,0,w,h);

      /* ── ACT I: orb ── */
      if (el<T.II+700){
        const tI=eo3(el/1000),fade=el>T.II?eo3(1-(el-T.II)/700):1;
        const br=.78+.22*Math.sin(el*.002),orbR=46*tI*br;
        const gr=g.createRadialGradient(cx,cy,0,cx,cy,orbR*2.8);
        gr.addColorStop(0,`rgba(0,255,209,${.04*tI*fade})`); gr.addColorStop(1,'rgba(0,255,209,0)');
        g.beginPath();g.arc(cx,cy,orbR*2.8,0,Math.PI*2);g.fillStyle=gr;g.fill();
        g.beginPath();g.arc(cx,cy,2*tI,0,Math.PI*2);
        g.fillStyle=`rgba(0,255,209,${tI*fade})`;g.shadowBlur=10;g.shadowColor=CYN;g.fill();g.shadowBlur=0;
        for(let i=1;i<=4;i++){
          const rr=((el*.11-i*50)%260+260)%260,ra=Math.max(0,.28-rr/260*.28)*tI*fade;
          if(ra<.003) continue;
          g.beginPath();g.arc(cx,cy,rr,0,Math.PI*2);g.strokeStyle=`rgba(0,255,209,${ra})`;g.lineWidth=.5;g.stroke();
        }
      }

      /* ── ACT II+: signal network ── */
      if (el>T.II){
        const nT=eo3((el-T.II)/1800);
        if(Math.random()<.12*nT){const lk=LK[Math.floor(Math.random()*LK.length)];if(nodes[lk[0]]&&nodes[lk[1]])spPt(nodes[lk[0]],nodes[lk[1]],nodes[lk[0]].c);}
        g.lineWidth=.5;
        LK.forEach(([a,b])=>{
          if(!nodes[a]||!nodes[b])return;
          const bt=eo3(cl((el-T.II-Math.min(a,b)*110)/420,0,1));if(bt<.01)return;
          g.beginPath();g.moveTo(nodes[a].x,nodes[a].y);g.lineTo(nodes[b].x,nodes[b].y);
          g.strokeStyle=`rgba(0,255,209,${.055*bt})`;g.stroke();
        });
        parts=parts.filter(p=>{
          p.prog+=p.spd;
          const px=lp(p.sx,p.tx,p.prog),py=lp(p.sy,p.ty,p.prog),pa=Math.sin(p.prog*Math.PI)*.7;
          const [r,gg,b]=hx(p.col);
          g.beginPath();g.arc(px,py,1.2,0,Math.PI*2);
          g.fillStyle=`rgba(${r},${gg},${b},${pa})`;g.shadowBlur=3;g.shadowColor=p.col;g.fill();g.shadowBlur=0;
          return p.prog<1;
        });
        nodes.forEach((n,i)=>{
          const bt=eo3(cl((el-T.II-i*130)/360,0,1));if(bt<.01)return;
          const pulse=.6+.4*Math.sin(el*.0015+n.ph);
          const [r,gg,b]=hx(n.c);
          const aura=g.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*5);
          aura.addColorStop(0,`rgba(${r},${gg},${b},${.065*bt*pulse})`); aura.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath();g.arc(n.x,n.y,n.r*5,0,Math.PI*2);g.fillStyle=aura;g.fill();
          g.beginPath();g.arc(n.x,n.y,n.r+2.5*pulse,0,Math.PI*2);
          g.strokeStyle=`rgba(${r},${gg},${b},${.18*bt})`;g.lineWidth=.6;g.stroke();
          g.beginPath();g.arc(n.x,n.y,n.r*bt,0,Math.PI*2);
          g.fillStyle=`rgba(${r},${gg},${b},${.9*bt})`;g.fill();
          if(bt>.85&&n.y>h*.58&&el<T.V){
            const la=(bt-.85)/.15*.5;
            g.font='500 8px "Courier New",monospace';
            g.fillStyle=`rgba(${r},${gg},${b},${la})`;g.textAlign='center';g.textBaseline='bottom';
            g.fillText(n.lb,n.x,n.y-n.r-8);
          }
        });
      }

      /* ── ACT III+: Manav + capsule pulse streams ── */
      if (el>T.III){
        const tA=cl((el-T.III)/(T.IV-T.III),0,1);

        /* Capsule pulse streams drawn BEFORE Manav core so core renders on top */
        drawCapsulePulses(el,cx,cy);

        /* Orbital rings */
        const ORBIT=[88,140,205];
        ORBIT.forEach((or,i)=>{
          const a=(el-T.III)*.001*[1.2,.75,.5][i]+i*(Math.PI*2/3);
          g.beginPath();g.arc(cx,cy,or*eo5(tA*1.4),0,Math.PI*2);
          g.strokeStyle=`rgba(0,255,209,${(.1+i*.03)*eo3(tA)})`;g.lineWidth=.5;g.stroke();
          const dx=cx+or*eo5(tA*1.4)*Math.cos(a),dy=cy+or*eo5(tA*1.4)*Math.sin(a);
          g.beginPath();g.arc(dx,dy,2.2,0,Math.PI*2);
          g.fillStyle=`rgba(255,184,0,${.68*eo3(tA)})`;g.shadowBlur=6;g.shadowColor=GOLD;g.fill();g.shadowBlur=0;
        });

        /* Manav core */
        const pm=.86+.14*Math.sin(el*.003),cR=12*eo5(tA*1.2)*pm;
        const mg=g.createRadialGradient(cx,cy,0,cx,cy,cR*3.5);
        mg.addColorStop(0,`rgba(255,184,0,${.14*eo3(tA)})`);mg.addColorStop(.5,`rgba(0,255,209,${.04*eo3(tA)})`);mg.addColorStop(1,'rgba(0,0,0,0)');
        g.beginPath();g.arc(cx,cy,cR*3.5,0,Math.PI*2);g.fillStyle=mg;g.fill();
        g.beginPath();g.arc(cx,cy,cR,0,Math.PI*2);
        g.fillStyle=GOLD;g.shadowBlur=14*pm;g.shadowColor=GOLD;g.fill();g.shadowBlur=0;

        /* MANAV label */
        const la=eo3(cl((el-T.III-500)/700,0,1));
        if(la>.01){
          g.font='600 11px "Courier New",monospace';g.fillStyle=`rgba(255,184,0,${la*.8})`;g.textAlign='center';g.textBaseline='top';g.fillText('MANAV',cx,cy+cR+10);
          g.font='400 7px "Courier New",monospace';g.fillStyle=`rgba(0,255,209,${la*.42})`;g.fillText('INTELLIGENCE NODE',cx,cy+cR+23);
        }
      }

      /* ── ACT IV: rank ascent ── */
      if(el>T.IV){
        const p=cl((el-T.IV)/(T.V-T.IV),0,1);
        const raw=p*(RP.length-1),lo=Math.floor(raw),hi=Math.min(lo+1,RP.length-1);
        rankV=lp(rankV,lp(RP[lo],RP[hi],raw-lo),.045);
        const rd=Math.round(rankV),ringR=60*eo5(p*1.3);
        g.beginPath();g.arc(cx,cy,ringR,0,Math.PI*2);
        g.strokeStyle=`rgba(0,255,209,${.11*eo3(p)})`;g.lineWidth=.7;g.stroke();
        const arcEnd=-Math.PI/2+Math.PI*2*(1-(rankV-1)/46);
        g.beginPath();g.arc(cx,cy,ringR,-Math.PI/2,arcEnd);
        const rc=rd<=1?GOLD:CYN;
        g.strokeStyle=rc;g.lineWidth=1.5;g.shadowBlur=rd<=1?18:0;g.shadowColor=rc;g.stroke();g.shadowBlur=0;
        const fs=Math.round(lp(0,30,eo3(p*1.5)));
        if(fs>3){
          g.font=`200 ${fs}px "Courier New",monospace`;
          g.fillStyle=`rgba(${rd<=1?'255,184,0':'0,255,209'},${.95*eo3(p*1.4)})`;
          g.textAlign='center';g.textBaseline='middle';g.shadowBlur=rd<=1?18:0;g.shadowColor=rc;
          g.fillText(`#${rd}`,cx,cy);g.shadowBlur=0;
          g.font='400 7px "Courier New",monospace';g.fillStyle=`rgba(255,255,255,${.24*eo3(p)})`;
          g.fillText('SEARCH POSITION',cx,cy+ringR+14);
        }
      }

      if(el<T.END) rafId.current=requestAnimationFrame(draw);
    };

    rafId.current=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(rafId.current);window.removeEventListener('resize',setSize);window.removeEventListener('resize',buildN);};
  },[onAct]);

  return <canvas ref={ref} style={{position:'absolute',inset:0}}/>;
}

/* ═══════════════════════════════════════════════════════
   BEHAVIOR CAPSULES — React overlay layer
   Appear in Act II, stay through Act III.
   Positioned to fill screen without entering text zones.
   Colors signal their emotional category.
═══════════════════════════════════════════════════════ */
function BehaviorCapsules({ act }:{ act:number }) {
  if (act < 1 || act > 3) return null;
  return (
    <>
      {CAPS.map((cap, i) => {
        const col = CAT_COL[cap.cat];
        /* Stagger entrance: every 180ms */
        const delay = i * 180;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: `${cap.xr * 100}%`,
            top:  `${cap.yr * 100}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            animation: `capsuleIn 0.55s ${delay}ms cubic-bezier(0.34,1.56,0.64,1) forwards`,
            opacity: 0,
          }}>
            <div style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: `1px solid ${col}25`,
              background: `rgba(3,8,16,0.72)`,
              backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap',
            }}>
              {/* Category dot */}
              <div style={{
                width: 4, height: 4, borderRadius: '50%',
                background: col, flexShrink: 0,
                boxShadow: `0 0 4px ${col}`,
                animation: `pulseDot ${1.4 + (i % 4) * 0.35}s ease-in-out infinite`,
              }}/>
              <span style={{
                fontSize: 'clamp(7px,0.65vw,8.5px)',
                color: `${col}cc`,
                fontFamily: '"Courier New",monospace',
                letterSpacing: '0.08em',
              }}>
                {cap.text}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   TEXT OVERLAYS — one statement per act, top zone only
═══════════════════════════════════════════════════════ */
const MONO:React.CSSProperties={fontFamily:'"Courier New",Courier,monospace'};
const TOP:React.CSSProperties={position:'absolute',top:'clamp(52px,7.5vh,84px)',left:'8%',right:'8%',textAlign:'center',...MONO,pointerEvents:'none'};

function LiveCount(){
  const [v,setV]=useState(getLiveBase);
  useEffect(()=>{const iv=setInterval(()=>setV(c=>c+Math.round(129629/4+(Math.random()-.5)*600)),250);return()=>clearInterval(iv);},[]);
  return <>{v.toLocaleString()}</>;
}

function ActOverlay({act}:{act:number}){
  const today=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  return (
    <>
      {act===0&&(
        <div key="I" style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',gap:10,...MONO,pointerEvents:'none',
          animation:'textIn 1s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.46rem,0.74vw,0.6rem)',letterSpacing:'0.55em',color:'rgba(0,255,209,0.34)'}}>
            {today} · RIGHT NOW
          </div>
          <div style={{textAlign:'center',lineHeight:1.05}}>
            <div style={{fontSize:'clamp(2.4rem,6vw,5rem)',fontWeight:200,color:WHT,letterSpacing:'-0.02em',textShadow:'0 0 60px rgba(0,255,209,0.08)'}}>
              <LiveCount/>
            </div>
            <div style={{fontSize:'clamp(0.58rem,1vw,0.76rem)',color:'rgba(255,255,255,0.26)',letterSpacing:'0.28em',marginTop:7}}>
              SEARCHES SINCE MIDNIGHT
            </div>
          </div>
          <div style={{height:1,width:110,background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.22),transparent)',margin:'3px 0'}}/>
          <div style={{fontSize:'clamp(0.72rem,1.3vw,1rem)',fontWeight:200,color:'rgba(255,255,255,0.32)',letterSpacing:'0.08em',textAlign:'center',animation:'fadeUp 0.7s 1.2s ease forwards',opacity:0,maxWidth:'min(540px,82vw)',lineHeight:1.6}}>
            The internet has a pulse.
          </div>
          <div style={{fontSize:'clamp(0.72rem,1.3vw,1rem)',fontWeight:200,color:`rgba(0,255,209,0.68)`,letterSpacing:'0.08em',textAlign:'center',animation:'fadeUp 0.7s 2.5s ease forwards',opacity:0}}>
            Most brands are invisible to all of it.
          </div>
          <div style={{marginTop:18,padding:'6px 16px',border:'1px solid rgba(0,255,209,0.1)',background:'rgba(0,255,209,0.025)',borderRadius:3,
            fontSize:'clamp(0.42rem,0.65vw,0.52rem)',letterSpacing:'0.13em',color:'rgba(0,255,209,0.38)',
            animation:'fadeUp 0.6s 3.3s ease forwards',opacity:0,textAlign:'center',maxWidth:'min(500px,84vw)'}}>
            TODAY · GOOGLE I/O 2026 · AI MODE NOW GLOBAL DEFAULT · 82% OF SERPS IMPACTED
          </div>
        </div>
      )}
      {act===1&&(
        <div key="II" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.44rem,0.7vw,0.56rem)',letterSpacing:'0.5em',color:'rgba(0,255,209,0.3)',marginBottom:9}}>
            THE SIGNAL NETWORK
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.5vw,1.9rem)',fontWeight:200,color:WHT,lineHeight:1.4}}>
            Every search is a signal.{' '}<span style={{color:CYN}}>Every signal has a pattern.</span>
          </div>
          <div style={{fontSize:'clamp(0.68rem,1.15vw,0.9rem)',fontWeight:200,color:'rgba(255,255,255,0.28)',lineHeight:1.5,marginTop:11,animation:'fadeUp 0.7s 1.6s ease forwards',opacity:0}}>
            Human behaviour. Emotional intent. Platform shifts.<br/>
            Manav reads every dimension of how your audience searches.
          </div>
        </div>
      )}
      {act===2&&(
        <div key="III" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.44rem,0.7vw,0.56rem)',letterSpacing:'0.5em',color:'rgba(255,184,0,0.4)',marginBottom:9}}>
            THE CAPTURE
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.5vw,1.9rem)',fontWeight:200,color:WHT,lineHeight:1.4}}>
            Manav reads what no one else can.
          </div>
          <div style={{fontSize:'clamp(0.68rem,1.15vw,0.9rem)',fontWeight:200,color:'rgba(255,255,255,0.28)',lineHeight:1.5,marginTop:11,animation:'fadeUp 0.7s 1.8s ease forwards',opacity:0}}>
            Every behaviour signal. Every algorithm update.<br/>
            Absorbed, cross-referenced and applied to your brand.
          </div>
        </div>
      )}
      {act===3&&(
        <div key="IV" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.44rem,0.7vw,0.56rem)',letterSpacing:'0.5em',color:'rgba(0,255,209,0.3)',marginBottom:9}}>
            THE RESULT
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.5vw,1.9rem)',fontWeight:200,color:WHT,lineHeight:1.4}}>
            From invisible.{' '}<span style={{color:GOLD}}>To position #1.</span>
          </div>
          <div style={{fontSize:'clamp(0.68rem,1.15vw,0.9rem)',fontWeight:200,color:'rgba(255,255,255,0.28)',lineHeight:1.5,marginTop:11,animation:'fadeUp 0.7s 1.4s ease forwards',opacity:0}}>
            Not luck. Not shortcuts.<br/>
            Intelligence applied while 82% of brands lose ground to AI.
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   ACT V — SEO SEASON REVEAL
   titleReveal: pure opacity + scale + translateY (no letter-spacing animation)
   This is GPU-composited — zero jitter.
═══════════════════════════════════════════════════════ */
function ActV({onEnter}:{onEnter:()=>void}){
  return (
    <div style={{position:'absolute',inset:0,zIndex:10,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:'radial-gradient(ellipse 80% 65% at 50% 50%,rgba(3,8,22,0.97) 0%,rgba(3,8,16,0.995) 100%)',
      animation:'actVIn 0.9s cubic-bezier(0.22,1,0.36,1) forwards',...MONO}}>

      {/* Corner brackets */}
      {(['tl','tr','bl','br']as const).map((p,i)=>(
        <div key={p} style={{position:'absolute',width:32,height:32,
          ...(p==='tl'?{top:20,left:20}:p==='tr'?{top:20,right:20}:p==='bl'?{bottom:20,left:20}:{bottom:20,right:20}),
          transform:`rotate(${p==='tl'?0:p==='tr'?90:p==='bl'?-90:180}deg)`,
          animation:`bracketIn 0.4s ${i*80}ms ease forwards`,opacity:0}}>
          <div style={{position:'absolute',top:0,left:0,width:18,height:1,background:'rgba(0,255,209,0.38)'}}/>
          <div style={{position:'absolute',top:0,left:0,width:1,height:18,background:'rgba(0,255,209,0.38)'}}/>
        </div>
      ))}

      {/* Horizontal rules */}
      {[{top:48},{bottom:48}].map((pos,i)=>(
        <div key={i} style={{position:'absolute',left:'8%',right:'8%',height:1,...pos,
          background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.2),transparent)',
          animation:'ruleExpand 0.65s 0.2s ease forwards',transform:'scaleX(0)',transformOrigin:'center'}}/>
      ))}

      {/* Brand block */}
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'clamp(0.44rem,0.76vw,0.58rem)',letterSpacing:'0.58em',
          color:'rgba(0,255,209,0.28)',marginBottom:16,
          animation:'fadeUp 0.55s 0.28s ease forwards',opacity:0}}>
          THE INTELLIGENCE PLATFORM FOR SEARCH DOMINANCE
        </div>

        {/* SEO SEASON — smooth reveal: no letter-spacing animation */}
        <div style={{position:'relative',display:'inline-block'}}>
          <div style={{
            fontSize:'clamp(3.2rem,9vw,7.5rem)',
            fontWeight:100,
            letterSpacing:'0.24em',    /* fixed — never animated */
            lineHeight:1,
            color:WHT,
            textIndent:'0.24em',
            textShadow:'0 0 80px rgba(0,255,209,0.04)',
            animation:'titleReveal 0.9s 0.42s cubic-bezier(0.22,1,0.36,1) forwards',
            opacity:0,
          }}>
            SEO SEASON
          </div>
          {/* Underline sweep */}
          <div style={{position:'absolute',bottom:-5,left:'6%',right:'6%',height:1,
            background:`linear-gradient(90deg,transparent,${CYN},transparent)`,
            animation:'ruleExpand 0.55s 1.22s ease forwards',transform:'scaleX(0)',transformOrigin:'center'}}/>
        </div>

        <div style={{fontSize:'clamp(0.5rem,0.9vw,0.68rem)',letterSpacing:'0.38em',
          color:'rgba(255,255,255,0.15)',marginTop:18,
          animation:'fadeUp 0.5s 1.28s ease forwards',opacity:0}}>
          BY MANAV · WHERE INTELLIGENCE BECOMES DOMINANCE
        </div>
      </div>

      {/* Stats */}
      <div style={{display:'flex',gap:'clamp(12px,2.8vw,30px)',marginTop:24,
        animation:'fadeUp 0.5s 1.48s ease forwards',opacity:0,flexWrap:'wrap',justifyContent:'center'}}>
        {[
          {v:'#1',   l:'SEARCH RANK',       c:GOLD},
          {v:'82%',  l:'AI SERP COVERAGE',  c:CYN },
          {v:'34%',  l:'LLM CITATION SHARE',c:CYN },
          {v:'LIVE', l:'ALGO ALIGNMENT',    c:GOLD},
        ].map(({v,l,c},i)=>(
          <div key={i} style={{textAlign:'center',minWidth:70}}>
            <div style={{fontSize:'clamp(1rem,2vw,1.5rem)',fontWeight:200,color:c,textShadow:`0 0 14px ${c}28`}}>{v}</div>
            <div style={{fontSize:'clamp(0.38rem,0.58vw,0.48rem)',color:'rgba(255,255,255,0.17)',letterSpacing:'0.16em',marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={onEnter} style={{marginTop:26,background:'transparent',
        border:'1px solid rgba(0,255,209,0.25)',borderRadius:0,
        padding:'clamp(10px,1.6vh,13px) clamp(40px,5.5vw,58px)',
        cursor:'pointer',letterSpacing:'0.42em',
        color:CYN,fontSize:'clamp(0.54rem,0.86vw,0.66rem)',fontWeight:400,
        fontFamily:'"Courier New",monospace',transition:'all 0.26s',
        animation:'fadeUp 0.5s 1.64s ease forwards',opacity:0}}
        onMouseEnter={e=>{const t=e.currentTarget;t.style.background='rgba(0,255,209,0.05)';t.style.borderColor='rgba(0,255,209,0.5)';t.style.boxShadow='0 0 20px rgba(0,255,209,0.08)';t.style.letterSpacing='0.52em';}}
        onMouseLeave={e=>{const t=e.currentTarget;t.style.background='transparent';t.style.borderColor='rgba(0,255,209,0.25)';t.style.boxShadow='none';t.style.letterSpacing='0.42em';}}>
        ENTER THE INTELLIGENCE
      </button>

      <div style={{fontSize:'clamp(0.38rem,0.58vw,0.48rem)',color:'rgba(255,255,255,0.1)',
        letterSpacing:'0.16em',marginTop:14,
        animation:'fadeUp 0.4s 1.8s ease forwards',opacity:0}}>
        APPROVED CLIENTS ONLY · MANAGED PERSONALLY BY MANAV
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROOT
═══════════════════════════════════════════════════════ */
export default function IntroAnimation({onComplete}:{onComplete:()=>void}){
  const [act,setAct]=useState(0);
  const [vis,setVis]=useState(true);
  const rafM=useRef(0);
  const onAct=useCallback((n:number)=>setAct(n),[]);
  const exit=useCallback((d=400)=>{cancelAnimationFrame(rafM.current);setVis(false);setTimeout(onComplete,d);},[onComplete]);
  if(!vis) return null;
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:BG,overflow:'hidden'}}>
      <CanvasEngine onAct={onAct}/>
      <BehaviorCapsules act={act}/>
      {act<4&&<ActOverlay act={act}/>}
      {act>=4&&<ActV onEnter={()=>exit(520)}/>}
      {act<4&&(
        <button onClick={()=>exit(160)} style={{position:'absolute',bottom:20,right:24,zIndex:20,
          background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.13)',
          fontSize:'clamp(0.46rem,0.7vw,0.54rem)',letterSpacing:'0.2em',
          fontFamily:'"Courier New",monospace',padding:'5px 10px',transition:'color 0.2s'}}
          onMouseEnter={e=>(e.currentTarget.style.color='rgba(0,255,209,0.48)')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.13)')}>
          SKIP
        </button>
      )}
      <style>{`
        @keyframes textIn    {from{opacity:0;transform:translateY(8px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
        @keyframes fadeUp    {from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
        @keyframes actVIn    {from{opacity:0}to{opacity:1}}
        @keyframes bracketIn {from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}
        @keyframes ruleExpand{from{transform:scaleX(0);opacity:0}to{transform:scaleX(1);opacity:1}}
        /* SEO SEASON: pure transform+opacity — GPU composited, zero jitter */
        @keyframes titleReveal{
          from{opacity:0;transform:translateY(14px) scale(0.97);filter:blur(5px)}
          to  {opacity:1;transform:translateY(0)    scale(1);   filter:blur(0)}
        }
        @keyframes capsuleIn {from{opacity:0;transform:translate(-50%,-50%) scale(0.85)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        @keyframes pulseDot  {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.65)}}
      `}</style>
    </div>
  );
}
