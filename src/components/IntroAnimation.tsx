/**
 * SEO SEASON — CINEMATIC UNIVERSE
 * Fixes: capsule readability, responsive layout, Act V scrolling ticker
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

/* ─── Capsules ─── */
interface Cap { text: string; type: 'system'|'human'; side: 'left'|'right'; yr: number; }
const CAPS: Cap[] = [
  /* LEFT — anchored to left edge */
  { text:'Google I/O 2026 · AI Mode Global',        type:'system', side:'left',  yr:.26 },
  { text:'March 2026 Core Update active',            type:'system', side:'left',  yr:.40 },
  { text:'AI Overviews: 82% of SERPs',              type:'system', side:'left',  yr:.54 },
  { text:'Perplexity · 850M queries/day',            type:'system', side:'left',  yr:.68 },
  { text:'63% abandon if no answer in 3s',           type:'human',  side:'left',  yr:.33 },
  { text:'Curiosity peaks · Tue 2–4 pm',             type:'human',  side:'left',  yr:.47 },
  { text:'Mobile-first · 64% of searches',           type:'human',  side:'left',  yr:.61 },
  { text:'7 searches per person · every day',        type:'human',  side:'left',  yr:.75 },
  /* RIGHT — anchored to right edge */
  { text:'ChatGPT Search · 1.1B queries/day',        type:'system', side:'right', yr:.26 },
  { text:'LLM citations: 34% of branded queries',    type:'system', side:'right', yr:.40 },
  { text:'Voice search · 1B+ queries/day',           type:'system', side:'right', yr:.54 },
  { text:'Zero-click searches · 65% of queries',     type:'system', side:'right', yr:.68 },
  { text:'76% never scroll past page one',           type:'human',  side:'right', yr:.33 },
  { text:'Late-night emotional searches +340%',      type:'human',  side:'right', yr:.47 },
  { text:'FOMO drives 23% more search clicks',       type:'human',  side:'right', yr:.61 },
  { text:'Attention span · 8 seconds average',       type:'human',  side:'right', yr:.75 },
];

/* ─── Act V ticker content ─── */
const TICKER: { text:string; type:'sys'|'hum' }[] = [
  { text:'March 2026 Core Update · fully mapped and integrated',    type:'sys' },
  { text:'We don\'t rank brands · we make them the only answer',    type:'hum' },
  { text:'82% of SERPs carry AI Overviews · we\'ve built the playbook', type:'sys' },
  { text:'Fiverr Top Rated · 500+ clients · zero vanity metrics',   type:'hum' },
  { text:'12 AI engines monitored daily · Perplexity, ChatGPT, Gemini, Claude', type:'sys' },
  { text:'Your competitor optimises for 2022 · we build for 2027',  type:'hum' },
  { text:'LLM citation architecture · proprietary GEO framework',   type:'sys' },
  { text:'Every task Manav completes makes the next one smarter',   type:'hum' },
  { text:'Google I/O 2026 · AI Mode signals captured within 24 hours', type:'sys' },
  { text:'SEO is not gaming algorithms · it\'s being the best answer', type:'hum' },
  { text:'Auto-learning system · 47+ active learnings per project', type:'sys' },
  { text:'No duplicate strategies · every brand gets unique intelligence', type:'hum' },
  { text:'Real-time algo sync · not monthly reports',               type:'sys' },
  { text:'Managed personally by Manav · not a SaaS, an intelligence', type:'hum' },
];

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
      canvas.width=innerWidth*dpr; canvas.height=innerHeight*dpr;
      canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px';
    };
    setSize(); window.addEventListener('resize',setSize);
    const g = canvas.getContext('2d',{alpha:false})!;
    g.scale(dpr,dpr);
    const W=()=>innerWidth, H=()=>innerHeight;

    const ND=[
      {lb:'SEARCH INTENT',  c:CYN,  r:5.5},{lb:'BACKLINK TRUST',  c:WHT, r:4.5},
      {lb:'ALGO SIGNALS',   c:CYN,  r:4.5},{lb:'CONTENT DEPTH',   c:WHT, r:4.5},
      {lb:'LLM VISIBILITY', c:GOLD, r:6.5},{lb:'E-E-A-T',         c:WHT, r:4.5},
      {lb:'COMPETITOR GAPS',c:'#FF4477',r:4.5},{lb:'CORE WEB VITALS',c:CYN,r:4.5},
      {lb:'TOPICAL AUTH',   c:GOLD, r:5.5},{lb:'SCHEMA',          c:WHT, r:3.5},
      {lb:'CTR SIGNALS',    c:CYN,  r:4.5},{lb:'BRAND AUTH',      c:GOLD,r:5.5},
    ];
    const LK=[[0,2],[0,4],[1,4],[1,6],[2,8],[3,4],[3,5],[4,7],[4,11],[5,8],[6,9],[7,10],[8,11],[9,10],[10,11],[0,1],[2,3]];
    type NV={x:number;y:number;lb:string;c:string;r:number;ph:number};
    let nodes:NV[]=[];
    const buildN=()=>{
      const cx=W()/2,cy=H()/2,rm=Math.min(W()*0.23,H()*0.21,240);
      nodes=ND.map((nd,i)=>{const a=(i/ND.length)*Math.PI*2-Math.PI/2,r=rm*(.65+.35*((i%3)/2));return{x:cx+r*Math.cos(a),y:cy+r*Math.sin(a),...nd,ph:Math.random()*Math.PI*2};});
    };
    buildN(); window.addEventListener('resize',buildN);

    type Pt={x:number;y:number;sx:number;sy:number;tx:number;ty:number;prog:number;spd:number;col:string};
    let parts:Pt[]=[];
    const spPt=(a:{x:number;y:number},b:{x:number;y:number},col:string)=>
      parts.push({x:a.x,y:a.y,sx:a.x,sy:a.y,tx:b.x,ty:b.y,prog:0,spd:.006+Math.random()*.007,col});
    const hx=(c:string):[number,number,number]=>{ const s=c.replace('#','');return[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];};

    let rankV=47;
    const RP=[47,38,24,13,6,2,1];

    /* Pulse streams from capsule positions → Manav */
    const PERIOD=4200, TRAVEL=1000;
    const drawPulses=(el:number,cx:number,cy:number)=>{
      if (el<T.III) return;
      const tA=el-T.III;
      CAPS.forEach((cap,i)=>{
        const PAD=W()*0.018;
        const topPx=cl(cap.yr*H(),H()*.19,H()*.84);
        const ax=cap.side==='left'?PAD+90:W()-PAD-90;
        const ay=topPx;
        const phase=(tA+i*(PERIOD/CAPS.length))%PERIOD;
        if (phase>TRAVEL) return;
        const prog=phase/TRAVEL, eased=eio(prog);
        const [r,gg,b]=hx(cap.type==='system'?CYN:GOLD);
        const t0_=Math.max(0,eased-.14),t1_=eased;
        const lg=g.createLinearGradient(lp(ax,cx,t0_),lp(ay,cy,t0_),lp(ax,cx,t1_),lp(ay,cy,t1_));
        lg.addColorStop(0,`rgba(${r},${gg},${b},0)`);
        lg.addColorStop(1,`rgba(${r},${gg},${b},${.38*Math.sin(prog*Math.PI)})`);
        g.beginPath();g.moveTo(lp(ax,cx,t0_),lp(ay,cy,t0_));g.lineTo(lp(ax,cx,t1_),lp(ay,cy,t1_));
        g.strokeStyle=lg;g.lineWidth=.55;g.stroke();
        const dx=lp(ax,cx,eased),dy=lp(ay,cy,eased),da=.85*Math.sin(prog*Math.PI);
        g.beginPath();g.arc(dx,dy,2,0,Math.PI*2);
        g.fillStyle=`rgba(${r},${gg},${b},${da})`;g.shadowBlur=7;g.shadowColor=cap.type==='system'?CYN:GOLD;g.fill();g.shadowBlur=0;
        const sa=.22*Math.pow(1-prog,3);
        if (sa>.01){const sg=g.createRadialGradient(ax,ay,0,ax,ay,48);sg.addColorStop(0,`rgba(${r},${gg},${b},${sa})`);sg.addColorStop(1,'rgba(0,0,0,0)');g.beginPath();g.arc(ax,ay,48,0,Math.PI*2);g.fillStyle=sg;g.fill();}
        const ra2=.16*Math.pow(prog,4);
        if (ra2>.01){const rg=g.createRadialGradient(cx,cy,0,cx,cy,34);rg.addColorStop(0,`rgba(${r},${gg},${b},${ra2})`);rg.addColorStop(1,'rgba(0,0,0,0)');g.beginPath();g.arc(cx,cy,34,0,Math.PI*2);g.fillStyle=rg;g.fill();}
      });
    };

    const draw=(now:number)=>{
      if (!t0.current) t0.current=now;
      const el=now-t0.current;
      const w=W(),h=H(),cx=w/2,cy=h/2;
      const na=el<T.II?0:el<T.III?1:el<T.IV?2:el<T.V?3:4;
      if (na!==actR.current){actR.current=na;onAct(na);}
      g.fillStyle=`rgba(3,8,16,${el<T.II?.20:.09})`;g.fillRect(0,0,w,h);

      /* ACT I: orb */
      if (el<T.II+700){
        const tI=eo3(el/1000),fade=el>T.II?eo3(1-(el-T.II)/700):1;
        const br=.78+.22*Math.sin(el*.002),orbR=cl(Math.min(w,h)*.055,26,52)*tI*br;
        const gr=g.createRadialGradient(cx,cy,0,cx,cy,orbR*2.8);
        gr.addColorStop(0,`rgba(0,255,209,${.04*tI*fade})`);gr.addColorStop(1,'rgba(0,255,209,0)');
        g.beginPath();g.arc(cx,cy,orbR*2.8,0,Math.PI*2);g.fillStyle=gr;g.fill();
        g.beginPath();g.arc(cx,cy,2*tI,0,Math.PI*2);
        g.fillStyle=`rgba(0,255,209,${tI*fade})`;g.shadowBlur=10;g.shadowColor=CYN;g.fill();g.shadowBlur=0;
        for(let i=1;i<=4;i++){const rr=((el*.11-i*50)%260+260)%260,ra=Math.max(0,.28-rr/260*.28)*tI*fade;if(ra<.003)continue;g.beginPath();g.arc(cx,cy,rr,0,Math.PI*2);g.strokeStyle=`rgba(0,255,209,${ra})`;g.lineWidth=.5;g.stroke();}
      }

      /* ACT II+: network */
      if (el>T.II){
        const nT=eo3((el-T.II)/1800);
        if(Math.random()<.12*nT){const lk=LK[Math.floor(Math.random()*LK.length)];if(nodes[lk[0]]&&nodes[lk[1]])spPt(nodes[lk[0]],nodes[lk[1]],nodes[lk[0]].c);}
        g.lineWidth=.5;
        LK.forEach(([a,b])=>{
          if(!nodes[a]||!nodes[b])return;
          const bt=eo3(cl((el-T.II-Math.min(a,b)*110)/420,0,1));if(bt<.01)return;
          g.beginPath();g.moveTo(nodes[a].x,nodes[a].y);g.lineTo(nodes[b].x,nodes[b].y);g.strokeStyle=`rgba(0,255,209,${.055*bt})`;g.stroke();
        });
        parts=parts.filter(p=>{
          p.prog+=p.spd;
          const px=lp(p.sx,p.tx,p.prog),py=lp(p.sy,p.ty,p.prog),pa=Math.sin(p.prog*Math.PI)*.7;
          const [r,gg,b]=hx(p.col);
          g.beginPath();g.arc(px,py,1.2,0,Math.PI*2);g.fillStyle=`rgba(${r},${gg},${b},${pa})`;g.shadowBlur=3;g.shadowColor=p.col;g.fill();g.shadowBlur=0;
          return p.prog<1;
        });
        const lF=h*.60;
        nodes.forEach((n,i)=>{
          const bt=eo3(cl((el-T.II-i*130)/360,0,1));if(bt<.01)return;
          const pulse=.6+.4*Math.sin(el*.0015+n.ph);
          const [r,gg,b]=hx(n.c);
          const aura=g.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*5);
          aura.addColorStop(0,`rgba(${r},${gg},${b},${.065*bt*pulse})`);aura.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath();g.arc(n.x,n.y,n.r*5,0,Math.PI*2);g.fillStyle=aura;g.fill();
          g.beginPath();g.arc(n.x,n.y,n.r+2.5*pulse,0,Math.PI*2);g.strokeStyle=`rgba(${r},${gg},${b},${.18*bt})`;g.lineWidth=.6;g.stroke();
          g.beginPath();g.arc(n.x,n.y,n.r*bt,0,Math.PI*2);g.fillStyle=`rgba(${r},${gg},${b},${.9*bt})`;g.fill();
          if(bt>.85&&n.y>lF&&el<T.V){
            const la=(bt-.85)/.15*.5,fs=cl(Math.round(w*.006),7,9);
            g.font=`500 ${fs}px "Courier New",monospace`;g.fillStyle=`rgba(${r},${gg},${b},${la})`;g.textAlign='center';g.textBaseline='bottom';g.fillText(n.lb,n.x,n.y-n.r-8);
          }
        });
      }

      /* ACT III+: Manav + pulse streams */
      if (el>T.III){
        const tA=cl((el-T.III)/(T.IV-T.III),0,1);
        drawPulses(el,cx,cy);
        const ORBIT=[cl(w*.065,55,85),cl(w*.098,80,135),cl(w*.135,110,195)];
        ORBIT.forEach((or,i)=>{
          const a=(el-T.III)*.001*[1.2,.75,.5][i]+i*(Math.PI*2/3);
          g.beginPath();g.arc(cx,cy,or*eo5(tA*1.4),0,Math.PI*2);g.strokeStyle=`rgba(0,255,209,${(.1+i*.03)*eo3(tA)})`;g.lineWidth=.5;g.stroke();
          const dx=cx+or*eo5(tA*1.4)*Math.cos(a),dy=cy+or*eo5(tA*1.4)*Math.sin(a);
          g.beginPath();g.arc(dx,dy,2.2,0,Math.PI*2);g.fillStyle=`rgba(255,184,0,${.68*eo3(tA)})`;g.shadowBlur=6;g.shadowColor=GOLD;g.fill();g.shadowBlur=0;
        });
        const pm=.86+.14*Math.sin(el*.003),cR=cl(Math.min(w,h)*.018,10,14)*eo5(tA*1.2)*pm;
        const mg=g.createRadialGradient(cx,cy,0,cx,cy,cR*3.5);
        mg.addColorStop(0,`rgba(255,184,0,${.14*eo3(tA)})`);mg.addColorStop(.5,`rgba(0,255,209,${.04*eo3(tA)})`);mg.addColorStop(1,'rgba(0,0,0,0)');
        g.beginPath();g.arc(cx,cy,cR*3.5,0,Math.PI*2);g.fillStyle=mg;g.fill();
        g.beginPath();g.arc(cx,cy,cR,0,Math.PI*2);g.fillStyle=GOLD;g.shadowBlur=14*pm;g.shadowColor=GOLD;g.fill();g.shadowBlur=0;
        const la=eo3(cl((el-T.III-500)/700,0,1));
        if(la>.01){
          const fs=cl(Math.round(w*.009),9,12);
          g.font=`600 ${fs}px "Courier New",monospace`;g.fillStyle=`rgba(255,184,0,${la*.8})`;g.textAlign='center';g.textBaseline='top';g.fillText('MANAV',cx,cy+cR+10);
          g.font=`400 ${cl(Math.round(w*.006),7,8)}px "Courier New",monospace`;g.fillStyle=`rgba(0,255,209,${la*.42})`;g.fillText('INTELLIGENCE NODE',cx,cy+cR+23);
        }
      }

      /* ACT IV: rank */
      if(el>T.IV){
        const p=cl((el-T.IV)/(T.V-T.IV),0,1);
        const raw=p*(RP.length-1),lo=Math.floor(raw),hi=Math.min(lo+1,RP.length-1);
        rankV=lp(rankV,lp(RP[lo],RP[hi],raw-lo),.045);
        const rd=Math.round(rankV),ringR=cl(Math.min(w,h)*.068,40,68)*eo5(p*1.3);
        g.beginPath();g.arc(cx,cy,ringR,0,Math.PI*2);g.strokeStyle=`rgba(0,255,209,${.11*eo3(p)})`;g.lineWidth=.7;g.stroke();
        const arcEnd=-Math.PI/2+Math.PI*2*(1-(rankV-1)/46);
        g.beginPath();g.arc(cx,cy,ringR,-Math.PI/2,arcEnd);
        const rc=rd<=1?GOLD:CYN;
        g.strokeStyle=rc;g.lineWidth=1.5;g.shadowBlur=rd<=1?18:0;g.shadowColor=rc;g.stroke();g.shadowBlur=0;
        const fs=Math.round(lp(0,cl(Math.min(w,h)*.04,22,32),eo3(p*1.5)));
        if(fs>3){
          g.font=`200 ${fs}px "Courier New",monospace`;
          g.fillStyle=`rgba(${rd<=1?'255,184,0':'0,255,209'},${.95*eo3(p*1.4)})`;
          g.textAlign='center';g.textBaseline='middle';g.shadowBlur=rd<=1?18:0;g.shadowColor=rc;g.fillText(`#${rd}`,cx,cy);g.shadowBlur=0;
          g.font=`400 ${cl(Math.round(w*.006),6,8)}px "Courier New",monospace`;g.fillStyle=`rgba(255,255,255,${.24*eo3(p)})`;g.fillText('SEARCH POSITION',cx,cy+ringR+14);
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
   BEHAVIOR CAPSULES — improved readability
   White text always · col used for indicator + border only
   Font: 10-12px (legible), comfortable padding
   Type indicator: icon + colored left bar
═══════════════════════════════════════════════════════ */
function BehaviorCapsules({ act }:{ act:number }) {
  const [H, setH] = useState(innerHeight);
  useEffect(()=>{ const fn=()=>setH(innerHeight); window.addEventListener('resize',fn); return()=>window.removeEventListener('resize',fn); },[]);

  if (act<1||act>3) return null;

  return (
    <>
      {CAPS.map((cap,i)=>{
        const isSys = cap.type==='system';
        const col = isSys ? CYN : (i%3===0 ? GOLD : i%3===1 ? VIO : GOLD);
        const topPx = cl(cap.yr*H, H*.19, H*.84);
        const side: React.CSSProperties = cap.side==='left'
          ? { left:'clamp(8px,1.5vw,18px)', transform:'translateY(-50%)' }
          : { right:'clamp(8px,1.5vw,18px)', transform:'translateY(-50%)' };

        return (
          <div key={i} style={{
            position:'absolute', top:topPx, ...side,
            pointerEvents:'none',
            animation:`capsuleIn 0.5s ${i*150}ms cubic-bezier(0.34,1.56,0.64,1) forwards`,
            opacity:0, zIndex:2,
          }}>
            <div style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'6px 12px 6px 10px',
              borderRadius: isSys ? 4 : 8,
              background:'rgba(6,12,28,0.92)',
              backdropFilter:'blur(10px)',
              /* Distinct left bar: system=solid cyan, human=subtle warm */
              borderLeft:`2.5px solid ${col}`,
              border:`1px solid ${col}18`,
              borderLeftColor:col,
              maxWidth:'clamp(160px,19vw,230px)',
              /* Soft box shadow for depth */
              boxShadow:`0 2px 12px rgba(0,0,0,0.4), inset 0 0 0 1px ${col}10`,
            }}>
              {/* Type symbol */}
              <span style={{
                fontSize:10, color:col, flexShrink:0, lineHeight:1,
                opacity:.85,
              }}>
                {isSys ? '◈' : '○'}
              </span>
              {/* Type badge: tiny, above or below? No — inline keeps it clean */}
              <div style={{flex:1}}>
                {/* Category label */}
                <div style={{
                  fontSize:'clamp(8px,0.52vw,9px)',
                  color:`${col}70`, letterSpacing:'0.12em',
                  fontFamily:'"Courier New",monospace', lineHeight:1.2,
                  marginBottom:2,
                }}>
                  {isSys ? 'SYSTEM' : 'HUMAN'}
                </div>
                {/* Main text — WHITE, comfortable size */}
                <div style={{
                  fontSize:'clamp(10px,0.72vw,12px)',
                  color:'rgba(238,244,255,0.82)',
                  fontFamily:'"Courier New",monospace',
                  letterSpacing:'0.04em',
                  lineHeight:1.35,
                }}>
                  {cap.text}
                </div>
              </div>
              {/* Pulse dot */}
              <div style={{
                width:4, height:4, borderRadius:'50%',
                background:col, flexShrink:0,
                boxShadow:`0 0 5px ${col}`,
                animation:`pulseDot ${1.2+(i%5)*.28}s ease-in-out infinite`,
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
═══════════════════════════════════════════════════════ */
const MONO:React.CSSProperties={fontFamily:'"Courier New",Courier,monospace'};
const TOP:React.CSSProperties={
  position:'absolute', top:'clamp(50px,7vh,78px)',
  left:'10%', right:'10%', textAlign:'center', ...MONO, pointerEvents:'none',
};

function LiveCount(){
  const [v,setV]=useState(getLiveBase);
  useEffect(()=>{const iv=setInterval(()=>setV(c=>c+Math.round(129629/4+(Math.random()-.5)*600)),250);return()=>clearInterval(iv);},[]);
  return <>{v.toLocaleString()}</>;
}

function ActOverlay({act}:{act:number}){
  const today=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}).toUpperCase();
  const h1:React.CSSProperties={fontSize:'clamp(1rem,min(2.5vw,4vh),1.9rem)',fontWeight:200,color:WHT,lineHeight:1.4};
  const sub:React.CSSProperties={fontSize:'clamp(0.65rem,min(1.1vw,1.8vh),0.9rem)',fontWeight:200,color:'rgba(255,255,255,0.3)',lineHeight:1.6,marginTop:9};
  return (
    <>
      {act===0&&(<div key="I" style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'clamp(6px,1.1vh,11px)',...MONO,pointerEvents:'none',animation:'textIn 1s cubic-bezier(0.22,1,0.36,1) forwards'}}>
        <div style={{fontSize:'clamp(0.4rem,min(0.7vw,1.05vh),0.58rem)',letterSpacing:'0.55em',color:'rgba(0,255,209,0.32)'}}>{today} · RIGHT NOW</div>
        <div style={{textAlign:'center',lineHeight:1.05}}>
          <div style={{fontSize:'clamp(1.8rem,min(5.5vw,8vh),4.5rem)',fontWeight:200,color:WHT,letterSpacing:'-0.02em',textShadow:'0 0 60px rgba(0,255,209,0.08)'}}><LiveCount/></div>
          <div style={{fontSize:'clamp(0.5rem,min(0.88vw,1.35vh),0.7rem)',color:'rgba(255,255,255,0.24)',letterSpacing:'0.25em',marginTop:5}}>SEARCHES SINCE MIDNIGHT</div>
        </div>
        <div style={{height:1,width:'clamp(70px,9vw,110px)',background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.2),transparent)'}}/>
        <div style={{...h1,animation:'fadeUp 0.7s 1.2s ease forwards',opacity:0,textAlign:'center',maxWidth:'min(500px,78vw)'}}>The internet has a pulse.</div>
        <div style={{...h1,color:'rgba(0,255,209,0.66)',animation:'fadeUp 0.7s 2.5s ease forwards',opacity:0}}>Most brands are invisible to it.</div>
        <div style={{marginTop:'clamp(6px,1.2vh,14px)',padding:'5px 14px',border:'1px solid rgba(0,255,209,0.1)',background:'rgba(0,255,209,0.025)',borderRadius:3,fontSize:'clamp(0.36rem,min(0.58vw,0.9vh),0.48rem)',letterSpacing:'0.11em',color:'rgba(0,255,209,0.32)',animation:'fadeUp 0.6s 3.3s ease forwards',opacity:0,textAlign:'center',maxWidth:'min(460px,78vw)'}}>
          TODAY · GOOGLE I/O 2026 · AI MODE NOW GLOBAL DEFAULT · 82% OF SERPS IMPACTED
        </div>
      </div>)}
      {act===1&&(<div key="II" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
        <div style={{fontSize:'clamp(0.38rem,min(0.62vw,0.95vh),0.52rem)',letterSpacing:'0.5em',color:'rgba(0,255,209,0.28)',marginBottom:7}}>THE SIGNAL NETWORK</div>
        <div style={h1}>Every search is a signal.{' '}<span style={{color:CYN}}>Every signal has a pattern.</span></div>
        <div style={{...sub,animation:'fadeUp 0.7s 1.6s ease forwards',opacity:0}}>Human behaviour. Emotional intent. Platform shifts.<br/>Every dimension of how your audience searches.</div>
      </div>)}
      {act===2&&(<div key="III" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
        <div style={{fontSize:'clamp(0.38rem,min(0.62vw,0.95vh),0.52rem)',letterSpacing:'0.5em',color:'rgba(255,184,0,0.38)',marginBottom:7}}>THE CAPTURE</div>
        <div style={h1}>Manav reads what no one else can.</div>
        <div style={{...sub,animation:'fadeUp 0.7s 1.8s ease forwards',opacity:0}}>System updates absorbed. Human patterns mapped.<br/>Every signal applied to your brand in real time.</div>
      </div>)}
      {act===3&&(<div key="IV" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
        <div style={{fontSize:'clamp(0.38rem,min(0.62vw,0.95vh),0.52rem)',letterSpacing:'0.5em',color:'rgba(0,255,209,0.28)',marginBottom:7}}>THE RESULT</div>
        <div style={h1}>From invisible.{' '}<span style={{color:GOLD}}>To position #1.</span></div>
        <div style={{...sub,animation:'fadeUp 0.7s 1.4s ease forwards',opacity:0}}>Not luck. Intelligence applied with precision.<br/>While 82% of brands lose ground to AI, yours gains it.</div>
      </div>)}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   SCROLLING TICKER — appears in Act V after button loads
   Continuous horizontal scroll, dual-color (sys=cyan, hum=gold)
   Speed ~72px/s. Each item separated by ◈ dot.
═══════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════
   KNOWLEDGE TICKER — absolute bottom, below CTA
═══════════════════════════════════════════════════════ */
function KnowledgeTicker({ visible }:{ visible:boolean }) {
  const items = [...TICKER, ...TICKER];   /* double for seamless loop */
  return (
    <div style={{
      position:'absolute', bottom:50, left:0, right:0,
      overflow:'hidden',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.6s ease',
      pointerEvents:'none',
    }}>
      {/* Fade masks on left/right edges */}
      <div style={{position:'absolute',top:0,left:0,bottom:0,width:'clamp(40px,6vw,80px)',background:'linear-gradient(90deg,rgba(3,8,16,0.95),transparent)',zIndex:1,pointerEvents:'none'}}/>
      <div style={{position:'absolute',top:0,right:0,bottom:0,width:'clamp(40px,6vw,80px)',background:'linear-gradient(-90deg,rgba(3,8,16,0.95),transparent)',zIndex:1,pointerEvents:'none'}}/>
      <div style={{
        display:'flex', alignItems:'center',
        animation:'tickerScroll 100s linear infinite',
        willChange:'transform', width:'max-content',
        padding:'7px 0',
      }}>
        {items.map((item,i)=>(
          <React.Fragment key={i}>
            <span style={{
              fontSize:'clamp(9px,0.68vw,11px)',
              fontFamily:'"Courier New",monospace', letterSpacing:'0.06em',
              color: item.type==='sys' ? 'rgba(0,255,209,0.65)' : 'rgba(255,184,0,0.65)',
              whiteSpace:'nowrap', padding:'0 4px',
            }}>{item.text}</span>
            <span style={{fontSize:7,color:'rgba(255,255,255,0.12)',padding:'0 14px',flexShrink:0}}>◈</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ACT V — SEO SEASON REVEAL
   Acronym cycles PPC→SEM→SMM→CRO→CTR→AEO→GEO→LLM→NLP→SEO
   then SEASON fades in.  Ticker sits at absolute bottom.
═══════════════════════════════════════════════════════ */
const ACRONYMS = ['PPC','SEM','SMM','CRO','CTR','AEO','GEO','LLM','NLP','SEO'];
const ACRONYM_INTERVAL = 160;  /* ms each acronym is shown */

function ActV({onEnter}:{onEnter:()=>void}){
  const [aidx,   setAidx]   = React.useState(0);
  const [settled,setSettled]= React.useState(false);
  const [showSeason, setShowSeason] = React.useState(false);
  const [showRest,   setShowRest]   = React.useState(false);
  const [showTicker, setShowTicker] = React.useState(false);

  React.useEffect(()=>{
    let i = 0;
    const iv = setInterval(()=>{
      i++;
      if (i >= ACRONYMS.length - 1){
        clearInterval(iv);
        setAidx(ACRONYMS.length - 1);   /* 'SEO' */
        setSettled(true);
        setTimeout(()=> setShowSeason(true),  380);
        setTimeout(()=> setShowRest(true),    900);
        setTimeout(()=> setShowTicker(true), 1600);
      } else {
        setAidx(i);
      }
    }, ACRONYM_INTERVAL);
    return ()=> clearInterval(iv);
  },[]);

  const acro = ACRONYMS[aidx];

  return (
    <div style={{position:'absolute',inset:0,zIndex:10,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      background:'radial-gradient(ellipse 80% 65% at 50% 50%,rgba(3,8,22,0.97) 0%,rgba(3,8,16,0.995) 100%)',
      animation:'actVIn 0.9s cubic-bezier(0.22,1,0.36,1) forwards',fontFamily:'"Courier New",Courier,monospace'}}>

      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map((p,i)=>(
        <div key={p} style={{position:'absolute',width:28,height:28,
          ...(p==='tl'?{top:18,left:18}:p==='tr'?{top:18,right:18}:p==='bl'?{bottom:18,left:18}:{bottom:18,right:18}),
          transform:`rotate(${p==='tl'?0:p==='tr'?90:p==='bl'?-90:180}deg)`,
          animation:`bracketIn 0.4s ${i*80}ms ease forwards`,opacity:0}}>
          <div style={{position:'absolute',top:0,left:0,width:16,height:1,background:'rgba(0,255,209,0.35)'}}/>
          <div style={{position:'absolute',top:0,left:0,width:1,height:16,background:'rgba(0,255,209,0.35)'}}/>
        </div>
      ))}
      <div style={{position:'absolute',top:44,left:'8%',right:'8%',height:1,
        background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.2),transparent)',
        animation:'ruleExpand 0.6s 0.18s ease forwards',transform:'scaleX(0)',transformOrigin:'center'}}/>

      {/* Sub-label above title */}
      <div style={{fontSize:'clamp(0.36rem,min(0.68vw,1.02vh),0.54rem)',letterSpacing:'0.58em',
        color:'rgba(0,255,209,0.26)',marginBottom:12,
        animation:'fadeUp 0.5s 0.22s ease forwards',opacity:0}}>
        THE INTELLIGENCE PLATFORM FOR SEARCH DOMINANCE
      </div>

      {/* ── MAIN TITLE: acronym cycle + SEASON ── */}
      <div style={{position:'relative',display:'inline-flex',alignItems:'baseline',
        fontSize:'clamp(2.4rem,min(8.5vw,12.5vh),7rem)',
        fontWeight:100,lineHeight:1,letterSpacing:'0.24em',
        textIndent:'0.24em',
      }}>
        {/* Cycling acronym — key triggers CSS animation on every change */}
        <span key={acro} style={{
          display:'inline-block',
          color: settled ? WHT : CYN,
          textShadow: settled
            ? `0 0 60px rgba(0,255,209,0.08)`
            : `0 0 20px rgba(0,255,209,0.4)`,
          animation: settled
            ? 'acronymSettle 0.5s ease forwards'
            : 'acronymFlash 0.14s ease forwards',
          transition: settled ? 'color 0.4s ease, text-shadow 0.4s ease' : 'none',
        }}>{acro}</span>

        {/* SEASON — slides in from right once SEO is settled */}
        <span style={{
          display:'inline-block',
          color: WHT,
          letterSpacing:'0.24em',
          opacity: showSeason ? 1 : 0,
          transform: showSeason ? 'translateX(0)' : 'translateX(-6px)',
          filter:    showSeason ? 'blur(0)' : 'blur(6px)',
          transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1), filter 0.7s cubic-bezier(0.22,1,0.36,1)',
        }}>{'\u00A0'}SEASON</span>

        {/* Underline — appears after SEASON */}
        <div style={{
          position:'absolute', bottom:-5, left:'3%', right:'3%', height:1,
          background:`linear-gradient(90deg,transparent,${CYN},transparent)`,
          opacity: showSeason ? 1 : 0,
          transform: showSeason ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin:'center',
          transition:'opacity 0.5s 0.4s ease, transform 0.5s 0.4s ease',
        }}/>
      </div>

      {/* By Manav */}
      <div style={{fontSize:'clamp(0.42rem,min(0.8vw,1.2vh),0.62rem)',letterSpacing:'0.36em',
        color:'rgba(255,255,255,0.13)',marginTop:14,
        opacity: showRest ? 1 : 0, transform: showRest ? 'none' : 'translateY(5px)',
        transition:'opacity 0.5s ease, transform 0.5s ease'}}>
        BY MANAV · WHERE INTELLIGENCE BECOMES DOMINANCE
      </div>

      {/* Stats */}
      <div style={{display:'flex',gap:'clamp(10px,2.2vw,26px)',marginTop:'clamp(14px,2.2vh,22px)',
        flexWrap:'wrap',justifyContent:'center',
        opacity: showRest ? 1 : 0, transform: showRest ? 'none' : 'translateY(6px)',
        transition:'opacity 0.5s 0.1s ease, transform 0.5s 0.1s ease'}}>
        {[{v:'#1',l:'SEARCH RANK',c:GOLD},{v:'82%',l:'AI SERP COVERAGE',c:CYN},
          {v:'34%',l:'LLM CITATION SHARE',c:CYN},{v:'LIVE',l:'ALGO ALIGNMENT',c:GOLD}].map(({v,l,c},i)=>(
          <div key={i} style={{textAlign:'center',minWidth:60}}>
            <div style={{fontSize:'clamp(0.9rem,min(1.8vw,2.7vh),1.4rem)',fontWeight:200,color:c,textShadow:`0 0 14px ${c}28`}}>{v}</div>
            <div style={{fontSize:'clamp(0.32rem,min(0.5vw,0.76vh),0.42rem)',color:'rgba(255,255,255,0.15)',letterSpacing:'0.14em',marginTop:3}}>{l}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={onEnter} style={{marginTop:'clamp(14px,2.2vh,22px)',background:'transparent',
        border:'1px solid rgba(0,255,209,0.24)',borderRadius:0,
        padding:'clamp(9px,1.3vh,12px) clamp(32px,4.5vw,52px)',
        cursor:'pointer',letterSpacing:'0.4em',color:CYN,
        fontSize:'clamp(0.5rem,min(0.8vw,1.2vh),0.62rem)',fontWeight:400,
        fontFamily:'"Courier New",monospace',transition:'all 0.25s',
        opacity: showRest ? 1 : 0, transform: showRest ? 'none' : 'translateY(6px)',
        transitionDelay:'0.2s',
        }}
        onMouseEnter={e=>{const t=e.currentTarget;t.style.background='rgba(0,255,209,0.05)';t.style.borderColor='rgba(0,255,209,0.48)';t.style.boxShadow='0 0 18px rgba(0,255,209,0.08)';t.style.letterSpacing='0.5em';}}
        onMouseLeave={e=>{const t=e.currentTarget;t.style.background='transparent';t.style.borderColor='rgba(0,255,209,0.24)';t.style.boxShadow='none';t.style.letterSpacing='0.4em';}}>
        ENTER THE INTELLIGENCE
      </button>

      <div style={{fontSize:'clamp(0.32rem,min(0.48vw,0.72vh),0.4rem)',color:'rgba(255,255,255,0.09)',
        letterSpacing:'0.13em',marginTop:8,
        opacity: showRest ? 1 : 0, transition:'opacity 0.5s 0.35s ease'}}>
        APPROVED CLIENTS ONLY · MANAGED PERSONALLY BY MANAV
      </div>

      {/* Bottom rule — above ticker */}
      <div style={{position:'absolute',bottom:86,left:'8%',right:'8%',height:1,
        background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.15),transparent)',
        opacity: showTicker ? 1 : 0, transition:'opacity 0.5s ease'}}/>

      {/* Knowledge ticker — absolute bottom */}
      <KnowledgeTicker visible={showTicker}/>
    </div>
  );
}

/* ROOT */
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
        <button onClick={()=>exit(160)} style={{position:'absolute',bottom:18,right:20,zIndex:20,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.12)',fontSize:'clamp(0.42rem,min(0.64vw,0.95vh),0.5rem)',letterSpacing:'0.18em',fontFamily:'"Courier New",monospace',padding:'4px 8px',transition:'color 0.2s'}}
          onMouseEnter={e=>(e.currentTarget.style.color='rgba(0,255,209,0.42)')}
          onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.12)')}>SKIP</button>
      )}
      <style>{`
        @keyframes textIn      {from{opacity:0;transform:translateY(8px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
        @keyframes fadeUp      {from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
        @keyframes actVIn      {from{opacity:0}to{opacity:1}}
        @keyframes bracketIn   {from{opacity:0;transform:scale(0.72)}to{opacity:1;transform:scale(1)}}
        @keyframes ruleExpand  {from{transform:scaleX(0);opacity:0}to{transform:scaleX(1);opacity:1}}
        @keyframes capsuleIn   {from{opacity:0;transform:translateY(calc(-50% + 8px))}to{opacity:1;transform:translateY(-50%)}}
        @keyframes pulseDot    {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.3;transform:scale(0.55)}}
        @keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        /* Acronym cycling */
        @keyframes acronymFlash{
          0%  {opacity:0;transform:translateY(-6px);filter:blur(5px)}
          100%{opacity:1;transform:translateY(0);filter:blur(0)}
        }
        /* When SEO settles — brief glow pulse then calm */
        @keyframes acronymSettle{
          0%  {text-shadow:0 0 40px rgba(0,255,209,0.9)}
          60% {text-shadow:0 0 20px rgba(0,255,209,0.4)}
          100%{text-shadow:0 0 60px rgba(0,255,209,0.08)}
        }
      `}</style>
    </div>
  );
}
