import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/AuthModal';
import { SeoEngine } from '@/components/SeoEngine';
import ManavBrainGuest from '@/components/ManavBrainGuest';
import IntroAnimation from '@/components/IntroAnimation';
import {
  Star, Brain, ShieldCheck, CheckCircle, Globe,
  BarChart3, Zap, ArrowRight, Lock, LogOut,
  Sparkles, TrendingUp, Target, Trophy,
  ChevronRight, Eye
} from 'lucide-react';

/* ─── Subtle star canvas ─── */
const Stars = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    let raf: number;
    type S = { x:number; y:number; r:number; ph:number; sp:number };
    let stars: S[] = [];
    const init = () => {
      c.width = c.offsetWidth; c.height = c.offsetHeight;
      stars = Array.from({length:80},()=>({
        x:Math.random()*c.width, y:Math.random()*c.height,
        r:Math.random()*0.9+0.2, ph:Math.random()*6.28,
        sp:Math.random()*0.005+0.002,
      }));
    };
    let t = 0;
    const draw = () => {
      ctx.clearRect(0,0,c.width,c.height);
      for (const s of stars) {
        const a = 0.06+0.38*(0.5+0.5*Math.sin(s.ph+t*s.sp));
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,6.28);
        ctx.fillStyle=`rgba(255,255,255,${a.toFixed(3)})`; ctx.fill();
      }
      t++; raf = requestAnimationFrame(draw);
    };
    init(); draw();
    window.addEventListener('resize', init);
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('resize',init); };
  },[]);
  return <canvas ref={ref} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />;
};

const gText: React.CSSProperties = {
  background:'linear-gradient(135deg,#6366f1 0%,#a78bfa 50%,#67e8f9 100%)',
  WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
};

/* ─── Mini score ring ─── */
const Ring = ({ score, label, color }: { score:number; label:string; color:string }) => {
  const r=22, circ=2*Math.PI*r;
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
      <div style={{position:'relative',height:56,width:56}}>
        <svg style={{height:56,width:56,transform:'rotate(-90deg)'}} viewBox="0 0 52 52">
          <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
          <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ*(1-score/100)}
            style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
        </svg>
        <span style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:'#fff'}}>{score}</span>
      </div>
      <span style={{fontSize:10,color:'rgba(255,255,255,0.42)',textAlign:'center',lineHeight:1.3}}>{label}</span>
    </div>
  );
};

/* ─── Dashboard mockup — what clients actually get ─── */
const DashboardCard = () => {
  const keywords = [
    { kw:'event rental dubai',        pos:'Page 1 · #3',   col:'#4ade80', w:92 },
    { kw:'av equipment hire',          pos:'Page 1 · #7',   col:'#4ade80', w:78 },
    { kw:'led screen rental dubai',    pos:'Page 2 · #14',  col:'#facc15', w:46 },
    { kw:'corporate event av company', pos:'Opportunity',   col:'#6366f1', w:12 },
  ];
  return (
    <div className="glass-strong spa-shimmer" style={{borderRadius:20,overflow:'hidden',position:'relative',zIndex:1}}>
      {/* Header */}
      <div style={{background:'rgba(255,255,255,0.03)',padding:'12px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:7}}>
          <div className="spa-nebula" style={{height:7,width:7,borderRadius:'50%',background:'#4ade80',boxShadow:'0 0 8px #4ade80',flexShrink:0}}/>
          <span style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.5)',letterSpacing:'0.08em'}}>LIVE · SEO SEASON PORTAL</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <img src="/manav.jpg" alt="Manav"
            style={{height:20,width:20,borderRadius:'50%',objectFit:'cover',objectPosition:'center 15%',border:'1.5px solid rgba(99,102,241,0.5)'}}
            onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
          <span style={{fontSize:10,color:'rgba(255,255,255,0.3)'}}>by Manav</span>
        </div>
      </div>

      {/* Score rings */}
      <div style={{padding:'20px 18px 16px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <Ring score={74} label="LLM" color="#6366f1"/>
        <Ring score={81} label="Health" color="#06b6d4"/>
        <Ring score={68} label="E-E-A-T" color="#a78bfa"/>
        <Ring score={77} label="Growth" color="#4ade80"/>
      </div>

      {/* Keywords */}
      <div style={{padding:'14px 18px 16px'}}>
        <div style={{fontSize:9,fontWeight:700,color:'rgba(255,255,255,0.3)',letterSpacing:'0.08em',marginBottom:10}}>KEYWORD RANKINGS · LIVE SERP</div>
        {keywords.map((k,i)=>(
          <div key={i} style={{marginBottom:i<keywords.length-1?8:0}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.7)'}}>{k.kw}</span>
              <span style={{fontSize:10,fontWeight:700,color:k.col,whiteSpace:'nowrap',marginLeft:8}}>{k.pos}</span>
            </div>
            <div style={{height:3,background:'rgba(255,255,255,0.05)',borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${k.w}%`,background:k.col,borderRadius:2,opacity:0.7}}/>
            </div>
          </div>
        ))}
      </div>

      {/* Footer stat */}
      <div style={{background:'rgba(99,102,241,0.07)',padding:'10px 18px',borderTop:'1px solid rgba(99,102,241,0.12)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <Trophy size={12} style={{color:'#facc15'}}/>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.55)'}}>Competitive rank: <strong style={{color:'#fff'}}>#2 of 8</strong> in market</span>
        </div>
        <span style={{fontSize:10,color:'rgba(99,102,241,0.6)',fontFamily:'monospace'}}>live ↑</span>
      </div>
    </div>
  );
};

/* ─── Marquee ─── */
const items = [
  '500+ Brands Grown','↑ 40% Avg Ranking Lift','94% Client Retention',
  'AI-Native SEO','Fiverr Top Rated','ChatGPT Visible','Perplexity Citations',
  '30+ Countries','Google AI Overviews','E-E-A-T Authority','10x AI Citations',
  'Validation-First','Live Dashboards',
];
const Marquee = () => {
  const doubled = [...items,...items];
  return (
    <div style={{overflow:'hidden',borderTop:'1px solid rgba(255,255,255,0.05)',borderBottom:'1px solid rgba(255,255,255,0.05)',background:'rgba(255,255,255,0.015)',padding:'10px 0',position:'relative'}}>
      <div style={{whiteSpace:'nowrap',animation:'marquee-scroll 28s linear infinite',display:'inline-flex',gap:0}}>
        {doubled.map((item,i)=>(
          <span key={i} style={{display:'inline-flex',alignItems:'center',fontSize:12,color:'rgba(255,255,255,0.4)',padding:'0 20px',gap:20,flexShrink:0}}>
            <span style={{height:4,width:4,borderRadius:'50%',background:'rgba(99,102,241,0.5)',display:'inline-block',flexShrink:0}}/>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

export default function Index() {
  const navigate = useNavigate();
  const {user,isApproved,authChecked,loading,signOut} = useAuth();

  const [showIntro, setShowIntro] = useState(() => {
    try { return sessionStorage.getItem('intro_seen') !== 'true'; } catch { return true; }
  });
  const handleIntroComplete = () => {
    try { sessionStorage.setItem('intro_seen', 'true'); } catch { }
    setShowIntro(false);
  };
  const [showModal, setShowModal] = useState(false);

  
  const handlePortal = () => {
    if(user&&isApproved){navigate('/dashboard');return;}
    setShowModal(true);
  };

  return (
    <div style={{background:'#04040d',minHeight:'100vh',color:'#fff',overflowX:'hidden'}}>

      <style>{`
        @keyframes marquee-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>

      {showModal && <AuthModal onClose={()=>setShowModal(false)}/>}

      {/* ══ NAV ══ */}
      <nav className="glass-nav" style={{position:'sticky',top:0,zIndex:30}}>
        <div style={{maxWidth:1280,margin:'0 auto',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <img src="/manav.jpg" alt="Manav"
              style={{height:34,width:34,borderRadius:'50%',objectFit:'cover',objectPosition:'center 15%',border:'2px solid rgba(99,102,241,0.55)',flexShrink:0}}
              onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
            <div style={{lineHeight:1.25}}>
              <div style={{fontWeight:700,fontSize:13}}>SEO Season</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.38)'}}>by Manav</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {user&&isApproved?(
              <>
                <button onClick={()=>navigate('/dashboard')} className="glass spa-card"
                  style={{padding:'6px 14px',borderRadius:9,fontSize:12,fontWeight:600,color:'#a5b4fc',cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                  <BarChart3 size={12}/>Dashboard
                </button>
                <button onClick={()=>navigate('/launchpad')} className="glass spa-card"
                  style={{padding:'6px 14px',borderRadius:9,fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.5)',cursor:'pointer',display:'flex',alignItems:'center',gap:5}}>
                  <Sparkles size={12}/>Launchpad
                </button>
                <button onClick={async()=>{await signOut();}}
                  style={{background:'none',border:'none',color:'rgba(255,255,255,0.28)',cursor:'pointer',padding:7}}>
                  <LogOut size={14}/>
                </button>
              </>
            ):(
              <button onClick={handlePortal} className="spa-btn"
                style={{padding:'8px 20px',borderRadius:11,fontSize:13}}>
                Client Portal
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ══ HERO ══ */}
      <section style={{position:'relative',overflow:'hidden',padding:'72px 24px 64px'}}>
        <Stars/>
        <div className="spa-nebula" style={{position:'absolute',top:'-20%',left:'-10%',width:'60vw',height:'70vh',borderRadius:'50%',background:'radial-gradient(ellipse,rgba(99,102,241,0.18) 0%,transparent 65%)',pointerEvents:'none'}}/>
        <div className="spa-nebula" style={{position:'absolute',top:'10%',right:'-15%',width:'50vw',height:'60vh',borderRadius:'50%',background:'radial-gradient(ellipse,rgba(139,92,246,0.13) 0%,transparent 65%)',pointerEvents:'none',animationDelay:'-3s'}}/>
        <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(99,102,241,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.022) 1px,transparent 1px)',backgroundSize:'60px 60px',pointerEvents:'none'}}/>

        <div style={{maxWidth:1280,margin:'0 auto',position:'relative',zIndex:5,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:52,alignItems:'center'}}>

          {/* LEFT */}
          <div style={{maxWidth:560}}>
            <div className="glass" style={{display:'inline-flex',alignItems:'center',gap:7,borderRadius:999,padding:'6px 14px',marginBottom:24}}>
              <div className="spa-nebula" style={{height:5,width:5,borderRadius:'50%',background:'#6366f1',boxShadow:'0 0 8px #6366f1',flexShrink:0}}/>
              <span style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.6)',letterSpacing:'0.06em'}}>
                AI-NATIVE SEO · FIVERR TOP RATED · 500+ BRANDS
              </span>
            </div>

            <h1 style={{fontWeight:900,lineHeight:1.07,letterSpacing:'-0.025em',marginBottom:18,color:'#fff',fontSize:'clamp(2.2rem,4.8vw,3.6rem)'}}>
              I architect{' '}
              <span style={gText}>search authority<br/>that compounds</span>{' '}
              — for brands that<br/>can't afford to fail.
            </h1>

            <p style={{fontSize:16,color:'rgba(255,255,255,0.44)',marginBottom:28,lineHeight:1.72,maxWidth:420}}>
              I'm Manav — a validation-first SEO strategist. I take on a select few clients and personally build their digital authority from the ground up.
            </p>

            <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:12,marginBottom:28}}>
              <button onClick={handlePortal} className="spa-btn"
                style={{padding:'13px 30px',borderRadius:14,fontSize:14,display:'inline-flex',alignItems:'center',gap:8}}>
                {user&&isApproved?'Go to Dashboard':'Access Client Portal'}
                <ArrowRight size={15}/>
              </button>
              <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,color:'rgba(255,255,255,0.36)'}}>
                <CheckCircle size={13} style={{color:'#4ade80',flexShrink:0}}/>
                No commitment required
              </div>
            </div>

            {/* Author proof */}
            <div className="glass" style={{borderRadius:14,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,maxWidth:380}}>
              <img src="/manav.jpg" alt="Manav"
                style={{height:40,width:40,borderRadius:'50%',objectFit:'cover',objectPosition:'center 15%',border:'2px solid rgba(99,102,241,0.5)',flexShrink:0}}
                onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:'#fff'}}>Manav</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,0.42)',marginBottom:4}}>Founder · SEO Season</div>
                <div style={{display:'flex',gap:2}}>
                  {[1,2,3,4,5].map(i=><Star key={i} size={10} style={{fill:'#facc15',color:'#facc15'}}/>)}
                  <span style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginLeft:5}}>500+ reviews</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — product dashboard */}
          <div className="spa-float-b" style={{position:'relative',minWidth:0}}>
            <div className="spa-nebula" style={{position:'absolute',inset:-40,borderRadius:'50%',background:'radial-gradient(ellipse,rgba(99,102,241,0.22) 0%,transparent 68%)',filter:'blur(24px)',pointerEvents:'none'}}/>
            {/* Floating badge */}
            <div className="spa-float-a" style={{position:'absolute',top:-14,right:-10,zIndex:4}}>
              <div className="glass-strong" style={{borderRadius:10,padding:'7px 12px',display:'flex',alignItems:'center',gap:6}}>
                <ShieldCheck size={11} style={{color:'#4ade80',flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:700,color:'#fff',whiteSpace:'nowrap'}}>Fiverr Top Rated</span>
              </div>
            </div>
            <DashboardCard/>
            {/* Bottom badge */}
            <div className="spa-float-c" style={{position:'absolute',bottom:-12,left:-10,zIndex:4}}>
              <div className="glass-strong" style={{borderRadius:10,padding:'7px 12px',display:'flex',alignItems:'center',gap:6}}>
                <Brain size={11} style={{color:'#a5b4fc',flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,0.85)',whiteSpace:'nowrap'}}>AI-Native SEO</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ MARQUEE ══ */}
      <Marquee/>

      {/* ══ WHAT YOU GET ══ */}
      <section style={{padding:'64px 24px',position:'relative',overflow:'hidden'}}>
        <div className="spa-nebula" style={{position:'absolute',top:'50%',right:'-10%',width:'45vw',height:'55vh',borderRadius:'50%',background:'radial-gradient(ellipse,rgba(139,92,246,0.09) 0%,transparent 65%)',pointerEvents:'none'}}/>
        <div style={{maxWidth:1280,margin:'0 auto',position:'relative'}}>
          <div style={{marginBottom:40,display:'flex',flexWrap:'wrap',alignItems:'flex-end',justifyContent:'space-between',gap:12}}>
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'rgba(99,102,241,0.7)',marginBottom:8}}>WHAT YOU ACTUALLY GET</div>
              <h2 style={{fontWeight:800,color:'#fff',margin:0,fontSize:'clamp(1.6rem,2.8vw,2.2rem)',letterSpacing:'-0.02em'}}>
                Not reports. Not vanity metrics.<br/><span style={gText}>Real, compounding authority.</span>
              </h2>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}}>
            {[
              {
                icon: Brain, color: '#6366f1',
                title: 'AI Search Visibility',
                desc: 'Your brand cited in ChatGPT, Perplexity, and Google AI Overviews. Buyers who ask AI — find you.',
                proof: '10x avg AI citation growth',
              },
              {
                icon: BarChart3, color: '#06b6d4',
                title: 'Live Keyword Rankings',
                desc: 'Every ranking verified with live Google SERP checks — not cached data from 3 months ago.',
                proof: '↑ 40% avg ranking improvement',
              },
              {
                icon: ShieldCheck, color: '#4ade80',
                title: 'Validation-First Strategy',
                desc: 'Every tactic tested in a controlled sprint before we invest in it. Your budget is protected.',
                proof: 'Zero wasted spend on unproven tactics',
              },
              {
                icon: Target, color: '#a78bfa',
                title: 'Competitive Intelligence',
                desc: 'Live competitive positioning. You see exactly where you rank against every named competitor.',
                proof: '94% of clients pass competitors in 90 days',
              },
              {
                icon: Eye, color: '#f59e0b',
                title: 'E-E-A-T Authority Building',
                desc: 'Google\'s trust signals built systematically — experience, expertise, authoritativeness, trust.',
                proof: 'Avg 22pt E-E-A-T score lift in 60 days',
              },
              {
                icon: Sparkles, color: '#f472b6',
                title: 'Executive Strategy Launchpad',
                desc: 'A premium portal showing your campaign phase, value realised, and accelerator opportunities.',
                proof: 'Updated live after every report',
              },
            ].map(({icon:Icon,color,title,desc,proof})=>(
              <div key={title} className="glass spa-card" style={{borderRadius:18,padding:'20px',display:'flex',flexDirection:'column',gap:14}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
                  <div style={{height:38,width:38,borderRadius:12,background:`${color}18`,border:`1px solid ${color}28`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Icon size={16} style={{color}}/>
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:'#fff',marginBottom:5}}>{title}</div>
                    <p style={{fontSize:12,color:'rgba(255,255,255,0.42)',lineHeight:1.65,margin:0}}>{desc}</p>
                  </div>
                </div>
                <div style={{borderTop:'1px solid rgba(255,255,255,0.05)',paddingTop:12,display:'flex',alignItems:'center',gap:6}}>
                  <ChevronRight size={11} style={{color,flexShrink:0}}/>
                  <span style={{fontSize:11,color,fontWeight:600}}>{proof}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ THE METHOD ══ */}
      <section style={{padding:'64px 24px',borderTop:'1px solid rgba(255,255,255,0.05)',position:'relative',overflow:'hidden'}}>
        <div className="spa-nebula" style={{position:'absolute',top:'50%',left:'-10%',width:'45vw',height:'55vh',borderRadius:'50%',background:'radial-gradient(ellipse,rgba(99,102,241,0.08) 0%,transparent 65%)',pointerEvents:'none'}}/>
        <div style={{maxWidth:1280,margin:'0 auto',position:'relative'}}>
          <div style={{textAlign:'center',marginBottom:40}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'rgba(99,102,241,0.7)',marginBottom:8}}>THE METHOD</div>
            <h2 style={{fontWeight:800,color:'#fff',margin:0,fontSize:'clamp(1.6rem,2.8vw,2.2rem)',letterSpacing:'-0.02em'}}>
              How SEO Season works
            </h2>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:4,position:'relative'}}>
            {[
              { n:'01', title:'Validation Audit', desc:'I crawl your site and competitors live. Every score is verified, not estimated. You see reality on day one.', color:'#6366f1', icon:Eye },
              { n:'02', title:'Architecture Sprint', desc:'Based on verified gaps, I build a targeted content and technical strategy. Nothing is launched without testing.', color:'#06b6d4', icon:Brain },
              { n:'03', title:'Authority Build', desc:'Link signals, E-E-A-T improvements, AI citation strategy — all tracked in your live dashboard weekly.', color:'#a78bfa', icon:TrendingUp },
              { n:'04', title:'Compounding Growth', desc:'Month over month, your authority compounds. Competitors plateau. Your rankings grow without paid ads.', color:'#4ade80', icon:Trophy },
            ].map(({n,title,desc,color,icon:Icon},i)=>(
              <div key={n} className="glass spa-card" style={{borderRadius:18,padding:'22px 20px',position:'relative',overflow:'hidden'}}>
                <div style={{position:'absolute',top:14,right:16,fontSize:28,fontWeight:900,color:'rgba(255,255,255,0.04)',lineHeight:1}}>{n}</div>
                <div style={{height:36,width:36,borderRadius:11,background:`${color}18`,border:`1px solid ${color}28`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:14}}>
                  <Icon size={16} style={{color}}/>
                </div>
                <div style={{fontWeight:700,fontSize:14,color:'#fff',marginBottom:8}}>{title}</div>
                <p style={{fontSize:12,color:'rgba(255,255,255,0.42)',lineHeight:1.68,margin:0}}>{desc}</p>
                {i<3&&(
                  <div style={{position:'absolute',top:'50%',right:-2,transform:'translateY(-50%)',zIndex:2,display:'none'}}
                    className="lg-only">
                    <ChevronRight size={14} style={{color:'rgba(255,255,255,0.1)'}}/>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SOCIAL PROOF ══ */}
      <section style={{padding:'64px 24px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
        <div style={{maxWidth:1280,margin:'0 auto'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16,alignItems:'start'}}>

            {/* Stats column */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {[
                { v:'500+',  l:'Brands Grown',    c:'#6366f1', sub:'across 30+ countries' },
                { v:'↑40%',  l:'Ranking Lift',    c:'#4ade80', sub:'within 90 days avg' },
                { v:'10x',   l:'AI Citations',     c:'#a78bfa', sub:'ChatGPT · Perplexity' },
                { v:'94%',   l:'Retention Rate',   c:'#facc15', sub:'clients stay 12+ months' },
              ].map(({v,l,c,sub})=>(
                <div key={l} className="glass spa-card" style={{borderRadius:16,padding:'20px 16px',textAlign:'center'}}>
                  <div style={{fontSize:30,fontWeight:900,color:c,lineHeight:1,marginBottom:4}}>{v}</div>
                  <div style={{fontSize:12,fontWeight:700,color:'#fff',marginBottom:3}}>{l}</div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.32)'}}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Testimonials + about */}
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {/* About Manav — compact */}
              <div className="glass" style={{borderRadius:18,padding:'18px 20px',display:'flex',gap:14,alignItems:'flex-start'}}>
                <img src="/manav.jpg" alt="Manav"
                  style={{height:48,width:48,borderRadius:'50%',objectFit:'cover',objectPosition:'center 15%',border:'2px solid rgba(99,102,241,0.5)',flexShrink:0}}
                  onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                <div>
                  <div style={{fontWeight:800,fontSize:14,color:'#fff',marginBottom:3}}>Manav · Founder</div>
                  <div style={{display:'flex',gap:2,marginBottom:6}}>
                    {[1,2,3,4,5].map(i=><Star key={i} size={11} style={{fill:'#facc15',color:'#facc15'}}/>)}
                    <span style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginLeft:5}}>500+ reviews</span>
                  </div>
                  <p style={{fontSize:12,color:'rgba(255,255,255,0.5)',lineHeight:1.62,margin:0}}>
                    "I don't run an agency. I personally manage every client's strategy — from the first audit to compounding growth. That's the SEO Season difference."
                  </p>
                </div>
              </div>

              {/* Testimonials */}
              {[
                { quote:'The most transparent SEO partner I\'ve worked with. Real data, real results — every single month.',  name:'E-commerce Founder, UAE' },
                { quote:'Ranked on Page 1 for 3 target keywords in 60 days. The live dashboard alone is worth the retainer.', name:'SaaS CEO, India' },
              ].map((t,i)=>(
                <div key={i} className="glass" style={{borderRadius:16,padding:'16px 18px'}}>
                  <div style={{display:'flex',gap:2,marginBottom:8}}>
                    {[1,2,3,4,5].map(i=><Star key={i} size={10} style={{fill:'#facc15',color:'#facc15'}}/>)}
                  </div>
                  <p style={{fontSize:13,color:'rgba(255,255,255,0.68)',fontStyle:'italic',lineHeight:1.6,margin:'0 0 8px'}}>{`"${t.quote}"`}</p>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.32)'}}>— {t.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ SEO TOOL ══ */}
      <section style={{padding:'64px 24px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
        <div style={{maxWidth:1280,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <div className="glass" style={{display:'inline-flex',alignItems:'center',gap:7,borderRadius:999,padding:'6px 14px',marginBottom:16}}>
              <Zap size={11} style={{color:'#6366f1'}}/>
              <span style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.55)',letterSpacing:'0.06em'}}>FREE SEO AUDIT</span>
            </div>
            <h2 style={{fontWeight:800,color:'#fff',marginBottom:8,fontSize:'clamp(1.6rem,2.8vw,2.2rem)'}}>
              See where you actually stand
            </h2>
            <p style={{color:'rgba(255,255,255,0.4)',fontSize:14,maxWidth:440,margin:'0 auto'}}>
              Powered by the same AI framework I use for every client. No fluff.
            </p>
          </div>
          <div style={{position:'relative',borderRadius:20,overflow:'hidden'}}>
            <SeoEngine/>
            {(!user||!isApproved)&&(
              <div style={{position:'absolute',inset:0,background:'rgba(4,4,13,0.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10,borderRadius:20}}>
                <div style={{textAlign:'center',maxWidth:320,padding:24}}>
                  <div className="glass" style={{height:52,width:52,borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
                    <Lock size={20} style={{color:'#6366f1'}}/>
                  </div>
                  <h3 style={{fontSize:16,fontWeight:800,color:'#fff',marginBottom:8}}>Client Portal Required</h3>
                  <p style={{color:'rgba(255,255,255,0.42)',fontSize:12,marginBottom:20,lineHeight:1.65}}>
                    Sign in or request access to run the full audit.
                  </p>
                  <button onClick={handlePortal} className="spa-btn"
                    style={{padding:'11px 24px',borderRadius:12,fontSize:13,display:'inline-flex',alignItems:'center',gap:7}}>
                    <ArrowRight size={14}/>Access Portal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ CTA ══ */}
      <section style={{padding:'64px 24px',borderTop:'1px solid rgba(255,255,255,0.05)',position:'relative',overflow:'hidden'}}>
        <div className="spa-nebula" style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'60vw',height:'55vh',background:'radial-gradient(ellipse,rgba(99,102,241,0.12) 0%,transparent 62%)',pointerEvents:'none'}}/>
        <div style={{position:'relative',zIndex:2,maxWidth:640,margin:'0 auto',textAlign:'center'}}>
          <div className="glass" style={{display:'inline-flex',alignItems:'center',gap:7,borderRadius:999,padding:'6px 14px',marginBottom:20}}>
            <div className="spa-nebula" style={{height:5,width:5,borderRadius:'50%',background:'#6366f1',boxShadow:'0 0 8px #6366f1',flexShrink:0}}/>
            <span style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.55)',letterSpacing:'0.06em'}}>LIMITED SPOTS</span>
          </div>
          <h2 style={{fontWeight:900,color:'#fff',marginBottom:12,lineHeight:1.1,fontSize:'clamp(1.8rem,3.5vw,2.8rem)'}}>
            Ready to build authority<br/>that compounds?
          </h2>
          <p style={{color:'rgba(255,255,255,0.42)',fontSize:15,marginBottom:28,lineHeight:1.7}}>
            I work with a select few clients at a time.<br/>Your personalised growth portal is waiting.
          </p>
          <button onClick={handlePortal} className="spa-btn"
            style={{padding:'14px 36px',borderRadius:16,fontSize:15,display:'inline-flex',alignItems:'center',gap:9,marginBottom:12}}>
            {user&&isApproved?'Go to My Dashboard':'Request Client Portal Access'}
            <ArrowRight size={16}/>
          </button>
          <p style={{fontSize:11,color:'rgba(255,255,255,0.2)'}}>
            Approved clients only · Managed personally by Manav
          </p>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{borderTop:'1px solid rgba(255,255,255,0.05)',padding:'22px 24px',background:'rgba(255,255,255,0.01)'}}>
        <div style={{maxWidth:1280,margin:'0 auto',display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <img src="/manav.jpg" alt="Manav"
              style={{height:30,width:30,borderRadius:'50%',objectFit:'cover',objectPosition:'center 15%',border:'1.5px solid rgba(99,102,241,0.4)'}}
              onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
            <div>
              <div style={{fontWeight:700,fontSize:12,color:'#fff'}}>SEO Season by Manav</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.28)'}}>I Don't Do Vanity SEO</div>
            </div>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:'5px 16px'}}>
            {[
              {icon:Star,        t:'Fiverr Top Rated'},
              {icon:ShieldCheck, t:'Data Private'},
              {icon:Globe,       t:'AI-Native SEO'},
              {icon:Brain,       t:'GEO + SEO'},
            ].map(({icon:Icon,t})=>(
              <div key={t} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'rgba(255,255,255,0.26)'}}>
                <Icon size={10} style={{color:'rgba(99,102,241,0.42)'}}/>{t}
              </div>
            ))}
          </div>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.18)'}}>© 2026 SEO Season</div>
        </div>
      </footer>

      {/* Manav Brain Guest — only shown when user is not logged in */}
      {/* Replay intro button — bottom-left, subtle */}
      {!showIntro && (
        <button
          onClick={() => setShowIntro(true)}
          style={{
            position: 'fixed', bottom: 68, left: 24, zIndex: 9990,
            background: 'rgba(8,10,24,0.85)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
            color: 'rgba(165,180,252,0.45)', fontSize: 10, fontFamily: 'monospace',
            letterSpacing: '0.08em', backdropFilter: 'blur(8px)',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
          }}
          title="Replay intro animation"
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(165,180,252,0.9)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(165,180,252,0.45)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; }}
        >
          ◈ REPLAY
        </button>
      )}
      {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}
      {(!user || !isApproved) && <ManavBrainGuest />}
    </div>
  );
}
