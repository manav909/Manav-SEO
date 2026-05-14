/**
 * SEO SEASON — CINEMATIC UNIVERSE
 *
 * Principles:
 * – Canvas rendered at devicePixelRatio — no blur, ultra-sharp on all screens
 * – One statement per act, timed for human reading
 * – Every second earns its place like a movie scene
 * – Three hero visuals: Signal Network, Algorithm Capture, Brand Ascent
 *
 * ACTS (20 seconds total):
 *  I    0s   → 4.5s  — The Signal    (orb, the internet is alive)
 *  II   4.5s → 9.0s  — The Network   (signal nodes crystallise)
 *  III  9.0s → 14.0s — The Capture   (wireframe human + algos absorbed into Manav)
 *  IV  14.0s → 17.5s — The Ascent    (rank climbing, proof)
 *  V   17.5s → 21s   — SEO Season    (brand reveal, enter)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

/* ── palette ── */
const CYN  = '#00FFD1';
const GOLD = '#FFB800';
const WHT  = '#EEF4FF';
const DIM  = '#0A1830';
const BG   = '#030810';

/* ── act timing ms ── */
const ACT = { I:0, II:4500, III:9000, IV:14000, V:17500, END:21000 };

/* ── smooth maths ── */
const clamp = (v:number,lo:number,hi:number) => Math.max(lo,Math.min(hi,v));
const lerp  = (a:number,b:number,t:number)  => a+(b-a)*clamp(t,0,1);
const easeOut3  = (t:number) => 1-Math.pow(1-clamp(t,0,1),3);
const easeOut5  = (t:number) => 1-Math.pow(1-clamp(t,0,1),5);
const easeInOut = (t:number) => { const c=clamp(t,0,1); return c<.5?2*c*c:1-Math.pow(-2*c+2,2)/2; };

/* ════════════════════════════════════════════════════════
   CANVAS ENGINE — single, full-life renderer
   All drawing happens here; React only handles text overlays.
════════════════════════════════════════════════════════ */
function CanvasEngine({ onAct }:{ onAct:(n:number)=>void }) {
  const ref  = useRef<HTMLCanvasElement>(null);
  const rafId= useRef(0);
  const t0   = useRef(0);
  const actR = useRef(-1);

  useEffect(()=>{
    const canvas = ref.current; if (!canvas) return;

    /* ── UHD: draw at device pixel density ── */
    const dpr = window.devicePixelRatio || 1;
    const setSize = () => {
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = window.innerWidth  + 'px';
      canvas.style.height = window.innerHeight + 'px';
    };
    setSize();
    window.addEventListener('resize', setSize);

    const g = canvas.getContext('2d')!;
    /* Scale all draw calls — 1 "unit" = 1 CSS pixel */
    g.scale(dpr, dpr);

    /* ── helpers that respect DPR ── */
    const W  = ()=>window.innerWidth;
    const H  = ()=>window.innerHeight;
    const CX = ()=>W()/2;
    const CY = ()=>H()/2;

    type Vec2 = {x:number;y:number};
    type Pt   = Vec2 & {progress:number;speed:number;col:string;sx:number;sy:number};

    /* ──────────────────── Signal nodes ──────────────────── */
    const NODE_DATA = [
      {label:'SEARCH INTENT',   col:CYN,  r:5.5},
      {label:'BACKLINK TRUST',  col:WHT,  r:4.5},
      {label:'ALGO SIGNALS',    col:CYN,  r:4.5},
      {label:'CONTENT DEPTH',   col:WHT,  r:4.5},
      {label:'LLM VISIBILITY',  col:GOLD, r:6.5},
      {label:'E-E-A-T',         col:WHT,  r:4.5},
      {label:'COMPETITOR GAPS', col:'#FF4477', r:4.5},
      {label:'CORE WEB VITALS', col:CYN,  r:4.5},
      {label:'TOPICAL AUTH',    col:GOLD, r:5.5},
      {label:'SCHEMA',          col:WHT,  r:3.5},
      {label:'CTR SIGNALS',     col:CYN,  r:4.5},
      {label:'BRAND AUTH',      col:GOLD, r:5.5},
    ];
    const LINKS = [[0,2],[0,4],[1,4],[1,6],[2,8],[3,4],[3,5],[4,7],[4,11],
                   [5,8],[6,9],[7,10],[8,11],[9,10],[10,11],[0,1],[2,3]];

    type NodeState = Vec2 & {label:string;col:string;r:number;ph:number};
    let nodes: NodeState[] = [];

    const buildNodes = () => {
      const cx=CX(), cy=CY(), rMax=Math.min(W()*0.30,H()*0.27);
      nodes = NODE_DATA.map((nd,i)=>{
        const a=(i/NODE_DATA.length)*Math.PI*2-Math.PI/2;
        const r=rMax*(0.62+0.38*((i%3)/2));
        return {x:cx+r*Math.cos(a),y:cy+r*Math.sin(a),...nd,ph:Math.random()*Math.PI*2};
      });
    };
    buildNodes();
    window.addEventListener('resize',buildNodes);

    /* ──────────────────── Particles ──────────────────── */
    let particles: Pt[] = [];
    const spawnPt = (a:Vec2,b:Vec2,col:string) =>
      particles.push({...a,sx:a.x,sy:a.y,progress:0,speed:0.006+Math.random()*0.007,col,x:a.x,y:a.y});

    /* ──────────────────── Algo capture actors ──────────────────── */
    const ALGOS = [
      {label:'GOOGLE CORE UPDATE', x:0.12, y:0.28},
      {label:'AI OVERVIEWS',       x:0.82, y:0.22},
      {label:'E-E-A-T SIGNALS',    x:0.18, y:0.72},
      {label:'LLM CITATIONS',      x:0.78, y:0.70},
      {label:'MARCH 2025 UPDATE',  x:0.06, y:0.50},
      {label:'INTENT MAPPING',     x:0.90, y:0.46},
    ];
    type Algo = {label:string;x:number;y:number;captured:boolean;captureT:number;streamPts:Pt[]};
    let algos: Algo[] = ALGOS.map(a=>({...a,captured:false,captureT:0,streamPts:[]}));

    /* ──────────────────── Wireframe human ──────────────────── */
    const drawHuman = (cx:number,cy:number,h:number,alpha:number,t:number) => {
      /* Draw a sci-fi blueprint human figure.
         Origin cx,cy is the CHEST centre. h = total figure height. */
      const u = h/10;  /* unit = 1/10 total height */
      g.globalAlpha = alpha;
      g.strokeStyle = `rgba(0,255,209,${alpha})`;

      const ln = (ax:number,ay:number,bx:number,by:number,a2?:number) => {
        g.beginPath(); g.moveTo(ax,ay); g.lineTo(bx,by);
        g.globalAlpha = a2 ?? alpha; g.stroke();
      };
      const arc = (x:number,y:number,r:number,s:number,e:number,a2?:number) => {
        g.beginPath(); g.arc(x,y,r,s,e);
        g.globalAlpha = a2 ?? alpha; g.stroke();
      };

      /* --- draw in segments, each keyed to t 0-1 --- */
      const seg = (start:number, end:number, draw:()=>void) => {
        if (t < start) return;
        const st = clamp((t-start)/(end-start),0,1);
        g.globalAlpha = alpha*st;
        draw();
        g.globalAlpha = alpha;
      };

      /* Head */
      seg(0.0,0.25,()=>{ arc(cx,cy-4.2*u,1.4*u,0,Math.PI*2); });
      /* Spine */
      seg(0.1,0.35,()=>{ ln(cx,cy-2.8*u,cx,cy+3.5*u); });
      /* Shoulders */
      seg(0.2,0.4,()=>{ ln(cx-2.8*u,cy-1.8*u,cx+2.8*u,cy-1.8*u); });
      /* Upper arms */
      seg(0.3,0.5,()=>{ ln(cx-2.8*u,cy-1.8*u,cx-3.4*u,cy+0.8*u); ln(cx+2.8*u,cy-1.8*u,cx+3.4*u,cy+0.8*u); });
      /* Lower arms */
      seg(0.35,0.55,()=>{ ln(cx-3.4*u,cy+0.8*u,cx-3.0*u,cy+2.8*u); ln(cx+3.4*u,cy+0.8*u,cx+3.0*u,cy+2.8*u); });
      /* Collar bone */
      seg(0.25,0.45,()=>{ ln(cx-2.0*u,cy-2.0*u,cx,cy-2.0*u); ln(cx,cy-2.0*u,cx+2.0*u,cy-2.0*u); });
      /* Ribs */
      seg(0.3,0.55,()=>{
        [-0.2,0.5,1.2,1.9].forEach(oy=>{
          arc(cx,cy-1.2*u+oy*u,2.2*u,Math.PI*0.15,Math.PI*0.85,alpha*0.35);
          arc(cx,cy-1.2*u+oy*u,2.2*u,Math.PI*1.15,Math.PI*1.85,alpha*0.35);
        });
      });
      /* Pelvis */
      seg(0.45,0.65,()=>{ arc(cx,cy+3.0*u,1.8*u,Math.PI*0.1,Math.PI*0.9,alpha*0.5); arc(cx,cy+3.0*u,1.8*u,Math.PI*1.1,Math.PI*1.9,alpha*0.5); });
      /* Upper legs */
      seg(0.55,0.75,()=>{ ln(cx-0.9*u,cy+3.5*u,cx-1.2*u,cy+6.0*u); ln(cx+0.9*u,cy+3.5*u,cx+1.2*u,cy+6.0*u); });
      /* Lower legs */
      seg(0.65,0.85,()=>{ ln(cx-1.2*u,cy+6.0*u,cx-1.0*u,cy+8.5*u); ln(cx+1.2*u,cy+6.0*u,cx+1.0*u,cy+8.5*u); });
      /* Feet */
      seg(0.75,0.95,()=>{ ln(cx-1.0*u,cy+8.5*u,cx-2.2*u,cy+8.8*u); ln(cx+1.0*u,cy+8.5*u,cx+2.2*u,cy+8.8*u); });
      /* Neural dots on key joints */
      seg(0.8,1.0,()=>{
        const joints:Vec2[] = [
          {x:cx,y:cy-4.2*u},{x:cx-2.8*u,y:cy-1.8*u},{x:cx+2.8*u,y:cy-1.8*u},
          {x:cx,y:cy-0.0*u},{x:cx-1.2*u,y:cy+6.0*u},{x:cx+1.2*u,y:cy+6.0*u},
        ];
        joints.forEach(j=>{
          g.beginPath(); g.arc(j.x,j.y,2,0,Math.PI*2);
          g.fillStyle=CYN; g.globalAlpha=alpha*0.7; g.fill();
          g.beginPath(); g.arc(j.x,j.y,4,0,Math.PI*2);
          g.strokeStyle=CYN; g.globalAlpha=alpha*0.2; g.stroke();
        });
      });
      g.globalAlpha=1;
    };

    /* ──────────────────── Rank state ──────────────────── */
    let rankV  = 47;
    const RANK_PATH = [47,38,27,16,8,3,1];  /* smooth journey */

    /* ──────────────────── Main draw loop ──────────────────── */
    const draw = (now:number) => {
      if (!t0.current) t0.current = now;
      const el = now - t0.current;
      const w=W(), h=H(), cx=CX(), cy=CY();

      /* ── act advancement ── */
      const na = el<ACT.II?0:el<ACT.III?1:el<ACT.IV?2:el<ACT.V?3:4;
      if (na!==actR.current){ actR.current=na; onAct(na); }

      /* ── persistent trail — very slow fade keeps ghost trails ── */
      const trailA = el<ACT.II ? 0.18 : 0.08;
      g.fillStyle=`rgba(3,8,16,${trailA})`; g.fillRect(0,0,w,h);

      /* ════════════════ ACT I — THE SIGNAL ════════════════ */
      if (el < ACT.II + 600) {
        const fade = el>ACT.II ? easeOut3(1-(el-ACT.II)/600) : 1;
        const tI   = easeOut3(el/1000);
        /* Breathing orb */
        const br   = 0.78+0.22*Math.sin(el*0.002);
        const orbR = 48*tI*br;
        const gr   = g.createRadialGradient(cx,cy,0,cx,cy,orbR*2.8);
        gr.addColorStop(0,`rgba(0,255,209,${0.04*tI*fade})`);
        gr.addColorStop(1,'rgba(0,255,209,0)');
        g.beginPath(); g.arc(cx,cy,orbR*2.8,0,Math.PI*2); g.fillStyle=gr; g.fill();
        /* Central point — hard sharp dot */
        g.beginPath(); g.arc(cx,cy,2*tI,0,Math.PI*2);
        g.fillStyle=`rgba(0,255,209,${tI*fade})`; g.shadowBlur=10; g.shadowColor=CYN; g.fill(); g.shadowBlur=0;
        /* Concentric rings — crisp 0.5px lines */
        for (let i=1;i<=4;i++){
          const rr=((el*0.11-i*50)%260+260)%260;
          const ra=Math.max(0,0.28-rr/260*0.28)*tI*fade;
          if (ra<0.003) continue;
          g.beginPath(); g.arc(cx,cy,rr,0,Math.PI*2);
          g.strokeStyle=`rgba(0,255,209,${ra})`; g.lineWidth=0.5; g.stroke();
        }
      }

      /* ════════════════ ACT II — THE NETWORK ════════════════ */
      if (el > ACT.II) {
        const nT = easeOut3((el-ACT.II)/1800);

        /* Spawn particles along links */
        if (Math.random()<0.12*nT){
          const lk=LINKS[Math.floor(Math.random()*LINKS.length)];
          if (nodes[lk[0]]&&nodes[lk[1]]) spawnPt(nodes[lk[0]],nodes[lk[1]],nodes[lk[0]].col);
        }

        /* Link lines — ultra thin */
        g.lineWidth = 0.5;
        LINKS.forEach(([a,b])=>{
          if (!nodes[a]||!nodes[b]) return;
          const bt=easeOut3(clamp((el-ACT.II-Math.min(a,b)*110)/420,0,1));
          if (bt<0.01) return;
          g.beginPath(); g.moveTo(nodes[a].x,nodes[a].y); g.lineTo(nodes[b].x,nodes[b].y);
          g.strokeStyle=`rgba(0,255,209,${0.06*bt})`; g.stroke();
        });

        /* Particles */
        particles = particles.filter(p=>{
          p.progress+=p.spd;
          p.x=lerp(p.sx,p.x+(p.x-p.sx)*0.001,p.progress);
          const px=lerp(p.sx,p.x,p.progress);
          const py_t=lerp(p.sy,p.y,p.progress);
          const pa=Math.sin(p.progress*Math.PI)*0.7;
          const hx=p.col.replace('#','');
          const r=parseInt(hx.slice(0,2),16),gg=parseInt(hx.slice(2,4),16),b=parseInt(hx.slice(4,6),16);
          g.beginPath(); g.arc(px,py_t,1.2,0,Math.PI*2);
          g.fillStyle=`rgba(${r},${gg},${b},${pa})`; g.shadowBlur=3; g.shadowColor=p.col; g.fill(); g.shadowBlur=0;
          return p.progress<1;
        });

        /* Nodes */
        g.lineWidth=0.6;
        nodes.forEach((n,i)=>{
          const bt=easeOut3(clamp((el-ACT.II-i*130)/360,0,1));
          if (bt<0.01) return;
          const pulse=0.6+0.4*Math.sin(el*0.0015+n.ph);
          const hx=n.col.replace('#','');
          const r=parseInt(hx.slice(0,2),16),gg=parseInt(hx.slice(2,4),16),b=parseInt(hx.slice(4,6),16);
          /* Aura — soft, not blurry (radial gradient, no shadowBlur) */
          const aura=g.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*5);
          aura.addColorStop(0,`rgba(${r},${gg},${b},${0.07*bt*pulse})`);
          aura.addColorStop(1,'rgba(0,0,0,0)');
          g.beginPath(); g.arc(n.x,n.y,n.r*5,0,Math.PI*2); g.fillStyle=aura; g.fill();
          /* Outer ring */
          g.beginPath(); g.arc(n.x,n.y,n.r+2.5*pulse,0,Math.PI*2);
          g.strokeStyle=`rgba(${r},${gg},${b},${0.18*bt})`; g.stroke();
          /* Core — sharp filled circle */
          g.beginPath(); g.arc(n.x,n.y,n.r*bt,0,Math.PI*2);
          g.fillStyle=`rgba(${r},${gg},${b},${0.9*bt})`;
          g.shadowBlur=0; g.fill();
          /* Label — only if node is in safe zone (below 60% of height) */
          if (bt>0.85 && n.y>h*0.58 && el<ACT.V) {
            const la=(bt-0.85)/0.15*0.55;
            g.font=`500 8px "Courier New",monospace`;
            g.fillStyle=`rgba(${r},${gg},${b},${la})`;
            g.textAlign='center'; g.textBaseline='bottom';
            g.fillText(n.label,n.x,n.y-n.r-8);
          }
        });
      }

      /* ════════════════ ACT III — ALGORITHM CAPTURE ════════════════ */
      if (el>ACT.III) {
        const tA  = clamp((el-ACT.III)/(ACT.IV-ACT.III),0,1);
        const mx  = cx, my = cy;

        /* Manav orbital rings */
        const ORBIT=[85,136,200];
        ORBIT.forEach((or,i)=>{
          const speed=[0.012,0.0075,0.005][i];
          const a = (el-ACT.III)*speed + i*(Math.PI*2/3);
          g.beginPath(); g.arc(mx,my,or*easeOut5(tA*1.5),0,Math.PI*2);
          g.strokeStyle=`rgba(0,255,209,${(0.10+i*0.03)*easeOut3(tA)})`; g.lineWidth=0.5; g.stroke();
          const dx=mx+or*easeOut5(tA*1.5)*Math.cos(a), dy=my+or*easeOut5(tA*1.5)*Math.sin(a);
          g.beginPath(); g.arc(dx,dy,2.2,0,Math.PI*2);
          g.fillStyle=`rgba(255,184,0,${0.7*easeOut3(tA)})`;
          g.shadowBlur=6; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;
        });

        /* Manav core */
        const pm=0.85+0.15*Math.sin(el*0.003);
        const cR=12*easeOut5(tA*1.2)*pm;
        const mg=g.createRadialGradient(mx,my,0,mx,my,cR*3.5);
        mg.addColorStop(0,`rgba(255,184,0,${0.15*easeOut3(tA)})`);
        mg.addColorStop(0.5,`rgba(0,255,209,${0.04*easeOut3(tA)})`);
        mg.addColorStop(1,'rgba(0,0,0,0)');
        g.beginPath(); g.arc(mx,my,cR*3.5,0,Math.PI*2); g.fillStyle=mg; g.fill();
        g.beginPath(); g.arc(mx,my,cR,0,Math.PI*2);
        g.fillStyle=GOLD; g.shadowBlur=16*pm; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;

        /* Wireframe human — appears on right side */
        const humanX = cx + W()*0.28;
        const humanH = H()*0.55;
        const humanT = easeOut3(clamp((el-ACT.III-400)/1800,0,1));
        const humanA = humanT;
        if (humanA>0.01) {
          g.lineWidth=0.8;
          g.strokeStyle=CYN;
          drawHuman(humanX, cy-humanH*0.08, humanH, humanA*0.65, humanT);
          /* Search query bubble above head */
          if (humanT>0.7) {
            const bubA=(humanT-0.7)/0.3*0.6;
            const bx=humanX, by=cy-humanH*0.55;
            g.beginPath();
            const bw=110, bh=22, br=6;
            g.roundRect(bx-bw/2,by-bh,bw,bh,br);
            g.strokeStyle=`rgba(0,255,209,${bubA*0.5})`; g.lineWidth=0.6; g.stroke();
            g.fillStyle=`rgba(3,8,16,${bubA*0.8})`; g.fill();
            g.font=`400 8px "Courier New",monospace`;
            g.fillStyle=`rgba(0,255,209,${bubA})`; g.textAlign='center'; g.textBaseline='middle';
            g.fillText('"best seo agency 2025"',bx,by-bh/2);
            /* Line from bubble to head */
            g.beginPath(); g.moveTo(bx,by); g.lineTo(bx,cy-humanH*0.47);
            g.strokeStyle=`rgba(0,255,209,${bubA*0.3})`; g.lineWidth=0.5; g.stroke();
          }
        }

        /* Algo label boxes + capture streams */
        algos.forEach((alg,i)=>{
          const ax=alg.x*W(), ay=alg.y*H();
          /* Stagger appearance */
          const algT=easeOut3(clamp((el-ACT.III-i*280)/600,0,1));
          if (algT<0.01) return;

          /* Start capture after label fully visible */
          const captureStart=ACT.III+i*280+700;
          if (!alg.captured && el>captureStart){
            alg.captureT=clamp((el-captureStart)/1400,0,1);
            if (alg.captureT>=1) alg.captured=true;
          }

          const capT = alg.captured?1:alg.captureT;

          /* Box */
          const bw=alg.label.length*5.5+16, bh=18;
          const boxA=(1-capT*0.8)*algT;
          if (boxA>0.02){
            g.beginPath(); g.roundRect(ax-bw/2,ay-bh/2,bw,bh,3);
            g.strokeStyle=`rgba(0,255,209,${boxA*0.5})`; g.lineWidth=0.6; g.stroke();
            g.fillStyle=`rgba(3,8,16,${boxA*0.7})`; g.fill();
            g.font=`500 7.5px "Courier New",monospace`;
            g.fillStyle=`rgba(0,255,209,${boxA})`; g.textAlign='center'; g.textBaseline='middle';
            g.fillText(alg.label,ax,ay);
          }

          /* Stream line — from algo box to Manav */
          if (capT>0&&capT<1){
            const sx=lerp(ax,mx,capT), sy=lerp(ay,my,capT);
            const progress=capT;
            g.beginPath(); g.moveTo(ax,ay); g.lineTo(sx,sy);
            const lg=g.createLinearGradient(ax,ay,sx,sy);
            lg.addColorStop(0,'rgba(255,184,0,0)');
            lg.addColorStop(0.6,`rgba(255,184,0,${0.5*easeInOut(progress)})`);
            lg.addColorStop(1,`rgba(0,255,209,${0.3*easeInOut(progress)})`);
            g.strokeStyle=lg; g.lineWidth=1; g.stroke();
            /* Bright leading particle */
            g.beginPath(); g.arc(sx,sy,2.5,0,Math.PI*2);
            g.fillStyle=GOLD; g.shadowBlur=10; g.shadowColor=GOLD; g.fill(); g.shadowBlur=0;
          }

          /* Capture flash at Manav */
          if (alg.captured||capT>0.95){
            const fl=easeOut3(1-(el-captureStart-1400)/300);
            if (fl>0){
              g.beginPath(); g.arc(mx,my,cR*1.8*fl,0,Math.PI*2);
              g.fillStyle=`rgba(255,184,0,${fl*0.12})`; g.fill();
            }
          }
        });

        /* MANAV label */
        const la=easeOut3(clamp((el-ACT.III-500)/800,0,1));
        if (la>0){
          g.font=`600 11px "Courier New",monospace`;
          g.fillStyle=`rgba(255,184,0,${la*0.82})`; g.textAlign='center'; g.textBaseline='top';
          g.fillText('MANAV',mx,my+cR+10);
          g.font=`400 7px "Courier New",monospace`;
          g.fillStyle=`rgba(0,255,209,${la*0.45})`;
          g.fillText('INTELLIGENCE NODE',mx,my+cR+23);
        }
      }

      /* ════════════════ ACT IV — THE ASCENT ════════════════ */
      if (el>ACT.IV) {
        const p  = clamp((el-ACT.IV)/(ACT.V-ACT.IV),0,1);

        /* Smooth rank */
        if (p>0){
          const raw=p*(RANK_PATH.length-1);
          const lo=Math.floor(raw),hi=Math.min(lo+1,RANK_PATH.length-1);
          const tgt=lerp(RANK_PATH[lo],RANK_PATH[hi],raw-lo);
          rankV=lerp(rankV,tgt,0.045);
        }
        const rd=Math.round(rankV);

        /* Central rank ring */
        const ringR=58*easeOut5(p*1.3);
        g.beginPath(); g.arc(cx,cy,ringR,0,Math.PI*2);
        g.strokeStyle=`rgba(0,255,209,${0.12*easeOut3(p)})`; g.lineWidth=0.7; g.stroke();
        /* Filled progress arc */
        const arcEnd=-Math.PI/2+Math.PI*2*(1-(rankV-1)/46);
        g.beginPath(); g.arc(cx,cy,ringR,-Math.PI/2,arcEnd);
        const rankColor=rd<=1?GOLD:CYN;
        g.strokeStyle=rankColor; g.lineWidth=1.5;
        g.shadowBlur=rd<=1?16:0; g.shadowColor=rankColor; g.stroke(); g.shadowBlur=0;

        /* Rank number */
        const fs=Math.round(lerp(0,32,easeOut3(p*1.5)));
        if (fs>3){
          g.font=`200 ${fs}px "Courier New",monospace`;
          g.fillStyle=`rgba(${rd<=1?'255,184,0':'0,255,209'},${0.95*easeOut3(p*1.5)})`;
          g.textAlign='center'; g.textBaseline='middle';
          g.shadowBlur=rd<=1?20:0; g.shadowColor=rd<=1?GOLD:CYN;
          g.fillText(`#${rd}`,cx,cy); g.shadowBlur=0;
          g.font=`400 7px "Courier New",monospace`;
          g.fillStyle=`rgba(255,255,255,${0.25*easeOut3(p)})`;
          g.fillText('SEARCH POSITION',cx,cy+ringR+14);
        }
      }

      if (el<ACT.END) rafId.current=requestAnimationFrame(draw);
    };

    rafId.current = requestAnimationFrame(draw);
    return ()=>{
      cancelAnimationFrame(rafId.current);
      window.removeEventListener('resize',setSize);
      window.removeEventListener('resize',buildNodes);
    };
  },[onAct]);

  return <canvas ref={ref} style={{position:'absolute',inset:0}}/>;
}

/* ════════════════════════════════════════════════════════
   TEXT OVERLAYS — strict zones, timed for human reading
   Top zone 0→18vh: one statement only
   Bottom zone 82vh→100vh: one strip only
════════════════════════════════════════════════════════ */
const MONO: React.CSSProperties = {fontFamily:'"Courier New",Courier,monospace'};

type DomProps = {act:number};

const TOP:React.CSSProperties = {
  position:'absolute', top:'clamp(56px,8vh,88px)',
  left:'8%', right:'8%', textAlign:'center', ...MONO,
  pointerEvents:'none',
};

function ActOverlay({act}:DomProps) {
  return (
    <>
      {act===0 && (
        <div key="I" style={{
          position:'absolute',inset:0,display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',gap:10,
          ...MONO,pointerEvents:'none',
          animation:'textIn 1s cubic-bezier(0.22,1,0.36,1) forwards',
        }}>
          <div style={{fontSize:'clamp(0.5rem,0.8vw,0.65rem)',letterSpacing:'0.55em',color:'rgba(0,255,209,0.38)'}}>
            EVERY SECOND OF EVERY DAY
          </div>
          <div style={{textAlign:'center',lineHeight:1.05}}>
            <div style={{
              fontSize:'clamp(0.85rem,2vw,1.6rem)',fontWeight:200,color:WHT,
              letterSpacing:'0.1em',maxWidth:'min(600px,86vw)',margin:'0 auto',lineHeight:1.5,
            }}>
              The internet has a pulse.
            </div>
            <div style={{
              fontSize:'clamp(0.85rem,2vw,1.6rem)',fontWeight:200,color:WHT,
              letterSpacing:'0.1em',maxWidth:'min(600px,86vw)',margin:'6px auto 0',lineHeight:1.5,
              animation:'fadeUp 0.7s 1.2s ease forwards',opacity:0,
            }}>
              8.5 billion searches. Every day.
            </div>
            <div style={{
              fontSize:'clamp(0.85rem,2vw,1.6rem)',fontWeight:200,
              color:'rgba(0,255,209,0.7)',letterSpacing:'0.1em',
              maxWidth:'min(600px,86vw)',margin:'6px auto 0',lineHeight:1.5,
              animation:'fadeUp 0.7s 2.4s ease forwards',opacity:0,
            }}>
              Most brands are invisible to all of it.
            </div>
          </div>
        </div>
      )}

      {act===1 && (
        <div key="II" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.48rem,0.75vw,0.6rem)',letterSpacing:'0.5em',color:'rgba(0,255,209,0.35)',marginBottom:10}}>
            THE SIGNAL NETWORK
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.5vw,1.9rem)',fontWeight:200,color:WHT,lineHeight:1.4}}>
            Every search is a signal.{' '}
            <span style={{color:CYN}}>Every signal has a pattern.</span>
          </div>
          <div style={{
            fontSize:'clamp(0.72rem,1.3vw,1rem)',fontWeight:200,
            color:'rgba(255,255,255,0.35)',lineHeight:1.5,marginTop:12,
            animation:'fadeUp 0.7s 1.5s ease forwards',opacity:0,
          }}>
            Algorithm updates. Competitor moves. Intent clusters.<br/>
            This network reads them all in real time.
          </div>
        </div>
      )}

      {act===2 && (
        <div key="III" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.48rem,0.75vw,0.6rem)',letterSpacing:'0.5em',color:'rgba(255,184,0,0.45)',marginBottom:10}}>
            THE INTELLIGENCE
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.5vw,1.9rem)',fontWeight:200,color:WHT,lineHeight:1.4}}>
            Manav reads what no one else can.
          </div>
          <div style={{
            fontSize:'clamp(0.72rem,1.3vw,1rem)',fontWeight:200,
            color:'rgba(255,255,255,0.35)',lineHeight:1.5,marginTop:12,
            animation:'fadeUp 0.7s 1.8s ease forwards',opacity:0,
          }}>
            Every algorithm update is captured.<br/>
            Every signal is understood. Every gap becomes your opportunity.
          </div>
        </div>
      )}

      {act===3 && (
        <div key="IV" style={{...TOP,animation:'textIn 0.8s cubic-bezier(0.22,1,0.36,1) forwards'}}>
          <div style={{fontSize:'clamp(0.48rem,0.75vw,0.6rem)',letterSpacing:'0.5em',color:'rgba(0,255,209,0.35)',marginBottom:10}}>
            THE RESULT
          </div>
          <div style={{fontSize:'clamp(1.1rem,2.5vw,1.9rem)',fontWeight:200,color:WHT,lineHeight:1.4}}>
            From invisible.{' '}
            <span style={{color:GOLD}}>To position #1.</span>
          </div>
          <div style={{
            fontSize:'clamp(0.72rem,1.3vw,1rem)',fontWeight:200,
            color:'rgba(255,255,255,0.35)',lineHeight:1.5,marginTop:12,
            animation:'fadeUp 0.7s 1.4s ease forwards',opacity:0,
          }}>
            Not luck. Not shortcuts. Intelligence applied with precision.
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════
   ACT V — SEO SEASON REVEAL
════════════════════════════════════════════════════════ */
function ActV({onEnter}:{onEnter:()=>void}) {
  return (
    <div style={{
      position:'absolute',inset:0,zIndex:10,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      background:'radial-gradient(ellipse 85% 65% at 50% 50%,rgba(3,8,22,0.97) 0%,rgba(3,8,16,0.99) 100%)',
      animation:'actVIn 0.9s cubic-bezier(0.22,1,0.36,1) forwards',...MONO,
    }}>
      {/* Corner brackets */}
      {(['tl','tr','bl','br'] as const).map((p,i)=>(
        <div key={p} style={{
          position:'absolute',width:32,height:32,
          ...(p==='tl'?{top:20,left:20}:p==='tr'?{top:20,right:20}:p==='bl'?{bottom:20,left:20}:{bottom:20,right:20}),
          transform:`rotate(${p==='tl'?0:p==='tr'?90:p==='bl'?-90:180}deg)`,
          animation:`bracketIn 0.45s ${i*80}ms ease forwards`,opacity:0,
        }}>
          <div style={{position:'absolute',top:0,left:0,width:18,height:1,background:'rgba(0,255,209,0.4)'}}/>
          <div style={{position:'absolute',top:0,left:0,width:1,height:18,background:'rgba(0,255,209,0.4)'}}/>
        </div>
      ))}

      {/* Top / bottom rules */}
      {[{top:48},{bottom:48}].map((pos,i)=>(
        <div key={i} style={{
          position:'absolute',left:'8%',right:'8%',height:1,...pos,
          background:'linear-gradient(90deg,transparent,rgba(0,255,209,0.24),transparent)',
          animation:'ruleExpand 0.7s 0.2s ease forwards',transform:'scaleX(0)',transformOrigin:'center',
        }}/>
      ))}

      {/* Identity */}
      <div style={{textAlign:'center'}}>
        <div style={{
          fontSize:'clamp(0.48rem,0.8vw,0.62rem)',letterSpacing:'0.58em',
          color:'rgba(0,255,209,0.34)',marginBottom:14,
          animation:'fadeUp 0.55s 0.3s ease forwards',opacity:0,
        }}>
          THE INTELLIGENCE PLATFORM FOR SEARCH DOMINANCE
        </div>
        <div style={{position:'relative',display:'inline-block'}}>
          <div style={{
            fontSize:'clamp(3.2rem,9vw,7.5rem)',fontWeight:100,
            letterSpacing:'0.24em',lineHeight:1,color:WHT,textIndent:'0.24em',
            textShadow:'0 0 80px rgba(0,255,209,0.05)',
            animation:'titleReveal 1.0s 0.42s cubic-bezier(0.22,1,0.36,1) forwards',opacity:0,
          }}>
            SEO SEASON
          </div>
          <div style={{
            position:'absolute',bottom:-4,left:'6%',right:'6%',height:1,
            background:`linear-gradient(90deg,transparent,${CYN},transparent)`,
            animation:'ruleExpand 0.55s 1.28s ease forwards',transform:'scaleX(0)',transformOrigin:'center',
          }}/>
        </div>
        <div style={{
          fontSize:'clamp(0.55rem,1vw,0.72rem)',letterSpacing:'0.38em',
          color:'rgba(255,255,255,0.18)',marginTop:18,
          animation:'fadeUp 0.55s 1.32s ease forwards',opacity:0,
        }}>
          BY MANAV · WHERE INTELLIGENCE BECOMES DOMINANCE
        </div>
      </div>

      {/* Four values — readable, no data clutter */}
      <div style={{
        display:'flex',gap:'clamp(12px,3vw,32px)',marginTop:32,
        animation:'fadeUp 0.55s 1.52s ease forwards',opacity:0,
        flexWrap:'wrap',justifyContent:'center',
      }}>
        {[
          {v:'#1',      l:'SEARCH RANK',     c:GOLD},
          {v:'AUTO',    l:'LEARNING ENGINE', c:CYN },
          {v:'FULL',    l:'ALGO ALIGNMENT',  c:CYN },
          {v:'YOURS',   l:'THE INTELLIGENCE',c:GOLD},
        ].map(({v,l,c},i)=>(
          <div key={i} style={{textAlign:'center',minWidth:68}}>
            <div style={{fontSize:'clamp(1rem,2vw,1.5rem)',fontWeight:200,color:c,
              textShadow:`0 0 16px ${c}30`}}>{v}</div>
            <div style={{fontSize:'clamp(0.4rem,0.6vw,0.5rem)',color:'rgba(255,255,255,0.2)',
              letterSpacing:'0.17em',marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button onClick={onEnter} style={{
        marginTop:30,background:'transparent',
        border:'1px solid rgba(0,255,209,0.28)',borderRadius:0,
        padding:'clamp(10px,1.6vh,13px) clamp(40px,5.5vw,58px)',
        cursor:'pointer',letterSpacing:'0.42em',
        color:CYN,fontSize:'clamp(0.56rem,0.9vw,0.68rem)',fontWeight:400,
        fontFamily:'"Courier New",monospace',transition:'all 0.26s',
        animation:'fadeUp 0.55s 1.72s ease forwards',opacity:0,
      }}
      onMouseEnter={e=>{const el=e.currentTarget;el.style.background='rgba(0,255,209,0.05)';el.style.borderColor='rgba(0,255,209,0.55)';el.style.boxShadow='0 0 22px rgba(0,255,209,0.09)';el.style.letterSpacing='0.52em';}}
      onMouseLeave={e=>{const el=e.currentTarget;el.style.background='transparent';el.style.borderColor='rgba(0,255,209,0.28)';el.style.boxShadow='none';el.style.letterSpacing='0.42em';}}>
        ENTER THE INTELLIGENCE
      </button>

      <div style={{
        fontSize:'clamp(0.4rem,0.6vw,0.5rem)',color:'rgba(255,255,255,0.12)',
        letterSpacing:'0.17em',marginTop:14,
        animation:'fadeUp 0.45s 1.88s ease forwards',opacity:0,
      }}>
        APPROVED CLIENTS ONLY · MANAGED PERSONALLY BY MANAV
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════ */
export default function IntroAnimation({onComplete}:{onComplete:()=>void}) {
  const [act,     setAct]     = useState(0);
  const [visible, setVisible] = useState(true);
  const rafM = useRef(0);
  const t0   = useRef(0);

  useEffect(()=>{
    t0.current = performance.now();
    const tick=(now:number)=>{
      if (now-t0.current < ACT.END) rafM.current=requestAnimationFrame(tick);
    };
    rafM.current=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(rafM.current);
  },[]);

  const onAct = useCallback((n:number)=>setAct(n),[]);
  const exit  = useCallback((d=400)=>{
    cancelAnimationFrame(rafM.current);
    setVisible(false);
    setTimeout(onComplete,d);
  },[onComplete]);

  if (!visible) return null;
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:BG,overflow:'hidden'}}>
      <CanvasEngine onAct={onAct}/>

      {act<4 && <ActOverlay act={act}/>}
      {act>=4 && <ActV onEnter={()=>exit(520)}/>}

      {act<4 && (
        <button onClick={()=>exit(160)} style={{
          position:'absolute',bottom:20,right:24,zIndex:20,
          background:'none',border:'none',cursor:'pointer',
          color:'rgba(255,255,255,0.15)',fontSize:'clamp(0.5rem,0.75vw,0.58rem)',
          letterSpacing:'0.2em',fontFamily:'"Courier New",monospace',
          padding:'5px 10px',transition:'color 0.2s',
        }}
        onMouseEnter={e=>(e.currentTarget.style.color='rgba(0,255,209,0.55)')}
        onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.15)')}>
          SKIP
        </button>
      )}

      <style>{`
        @keyframes textIn     { from{opacity:0;transform:translateY(8px);filter:blur(3px)} to{opacity:1;transform:none;filter:none} }
        @keyframes fadeUp     { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:none} }
        @keyframes actVIn     { from{opacity:0} to{opacity:1} }
        @keyframes bracketIn  { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }
        @keyframes ruleExpand { from{transform:scaleX(0);opacity:0} to{transform:scaleX(1);opacity:1} }
        @keyframes titleReveal{ from{opacity:0;letter-spacing:0.65em;filter:blur(8px)} to{opacity:1;filter:blur(0)} }
      `}</style>
    </div>
  );
}
