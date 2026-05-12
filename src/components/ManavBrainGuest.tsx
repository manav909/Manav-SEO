/**
 * ManavBrainGuest.tsx
 * Floating Manav Brain widget for non-logged-in visitors on the Index page.
 * Hooks attention with facts, engages in real conversation via Claude API,
 * asks for industry, creates a demo project, and launches the full tour.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Send, X, Sparkles, ChevronRight, ArrowRight } from 'lucide-react';
import { detectIndustry, DEMO_INDUSTRIES } from '@/contexts/DemoContext';

const HOOK_FACTS = [
  { stat:'73%', text:'of websites never recover their rankings after a Google Core Update — because they find out months too late.' },
  { stat:'40%', text:'of commercial searches now end in an AI answer. If your site is not cited, you do not exist to that buyer.' },
  { stat:'14h', text:'per week is wasted by the average marketing team on SEO tasks that will never move rankings.' },
  { stat:'90d', text:'is all it takes to see measurable ranking movement when SEO tasks are executed in the right order.' },
  { stat:'3x',  text:'more backlinks go to pages with real case studies and specific data points over generic content.' },
];

const OPENING_LINE = "I'm Manav Brain — the AI engine inside SEO Season. I've been watching how most businesses handle SEO, and I want to show you something different. Give me 3 minutes?";

type Phase = 'dormant' | 'hook' | 'chat' | 'loading' | 'ready';

interface Msg { role: 'brain' | 'user'; text: string; }

export default function ManavBrainGuest() {
  const navigate = useNavigate();
  const [phase,      setPhase]     = useState<Phase>('dormant');
  const [factIdx,    setFactIdx]   = useState(0);
  const [msgs,       setMsgs]      = useState<Msg[]>([]);
  const [input,      setInput]     = useState('');
  const [streaming,  setStreaming] = useState(false);
  const [pulseAnim,  setPulseAnim] = useState(false);
  const [askIndustry,setAskIndustry] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Pop after 3 seconds */
  useEffect(() => {
    const t = setTimeout(() => { setPhase('hook'); setPulseAnim(true); }, 3000);
    return () => clearTimeout(t);
  }, []);

  /* Rotate facts */
  useEffect(() => {
    if (phase !== 'hook') return;
    const t = setInterval(() => setFactIdx(i => (i + 1) % HOOK_FACTS.length), 4500);
    return () => clearInterval(t);
  }, [phase]);

  /* Auto-scroll */
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  /* Open chat with opening line */
  const openChat = useCallback(() => {
    setPhase('chat');
    setMsgs([{ role:'brain', text: OPENING_LINE }]);
    setTimeout(() => {
      setMsgs(m => [...m, {role:'brain', text:"What's your business about? Tell me your industry or goal — e.g. \"e-commerce fashion brand\", \"SaaS startup\", \"local dental practice\". I'll personalise a live demo for you right now."}]);
      setAskIndustry(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }, 1200);
  }, []);

  /* Stream a response from Claude */
  const streamBrainReply = useCallback(async (userText: string, systemPrompt: string) => {
    setStreaming(true);
    const thinkingId = Date.now().toString();
    setMsgs(m => [...m, { role:'brain', text:'' }]);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userText }],
        }),
      });
      if (!res.body) throw new Error('no stream');
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   full   = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === 'content_block_delta' && d.delta?.text) {
              full += d.delta.text;
              setMsgs(m => {
                const cp = [...m];
                cp[cp.length-1] = { role:'brain', text: full };
                return cp;
              });
            }
          } catch (_e) { /* ok */ }
        }
      }
    } catch (_e) {
      setMsgs(m => {
        const cp = [...m];
        cp[cp.length-1] = { role:'brain', text:"Let me show you a demo of SEO Season right now. Click 'Start tour' and I'll walk you through everything." };
        return cp;
      });
    }
    setStreaming(false);
  }, []);

  /* Handle user message */
  const handleSend = useCallback(async () => {
    const val = input.trim();
    if (!val || streaming) return;
    setInput('');
    setMsgs(m => [...m, { role:'user', text: val }]);

    if (askIndustry) {
      /* Detect industry and launch tour */
      setAskIndustry(false);
      const industryKey = detectIndustry(val);
      const data        = DEMO_INDUSTRIES[industryKey];
      setPhase('loading');
      setMsgs(m => [...m, { role:'brain', text:"Creating your personalised demo project: " + data.name + " — " + data.tagline + ". Give me a second..." }]);
      setTimeout(() => {
        setMsgs(m => [...m, { role:'brain', text:"Done! I've built a full SEO strategy canvas, loaded competitor data, and set up your metrics dashboard. Ready to see it?" }]);
        setPhase('ready');
        localStorage.setItem('seo_demo_industry', industryKey);
      }, 1800);
    } else {
      /* General question — stream a response */
      const sp = `You are Manav Brain, the AI assistant for SEO Season — a professional SEO management platform.
You are chatting with a website visitor who has not signed up yet. Your goal is to be genuinely helpful, show deep SEO expertise, and excite them about the platform.
SEO Season includes: strategy canvas, live metrics dashboard, data room, algorithm intel, automated audits, AI learning engine.
Keep responses under 4 sentences. Be direct, insightful, and reference specific platform capabilities where relevant.
End with a soft invitation to take the demo tour.`;
      await streamBrainReply(val, sp);
      setMsgs(m => [...m, { role:'brain', text:"Want to see how the system would handle this for your actual project? Take the 3-minute tour." }]);
    }
  }, [input, streaming, askIndustry, streamBrainReply]);

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSend(); };

  const launchTour = useCallback(() => {
    const ind = localStorage.getItem('seo_demo_industry') || 'saas';
    localStorage.setItem('seo_demo_industry', ind);
    navigate('/tour');
  }, [navigate]);

  const fact = HOOK_FACTS[factIdx];

  return (
    <>
      {/* DORMANT: nothing */}
      {phase === 'dormant' && null}

      {/* HOOK: pulsing fact bubble */}
      {phase === 'hook' && (
        <div style={{position:'fixed',bottom:24,right:24,zIndex:9000,display:'flex',flexDirection:'column',alignItems:'flex-end',gap:10}}>
          {/* Fact bubble */}
          <div style={{maxWidth:300,background:'rgba(10,10,25,0.97)',border:'1px solid rgba(99,102,241,0.35)',borderRadius:16,padding:'14px 16px',boxShadow:'0 0 40px rgba(99,102,241,0.15), 0 8px 32px rgba(0,0,0,0.5)',animation:'slideUp 0.4s ease'}}>
            <div style={{fontSize:9,fontFamily:'monospace',color:'rgba(99,102,241,0.6)',letterSpacing:'0.12em',marginBottom:6}}>DID YOU KNOW?</div>
            <div style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:10}}>
              <span style={{fontSize:22,fontWeight:900,color:'#a5b4fc',lineHeight:1,flexShrink:0}}>{fact.stat}</span>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.65)',lineHeight:1.5}}>{fact.text}</span>
            </div>
            <div style={{display:'flex',gap:5,marginBottom:8}}>
              {HOOK_FACTS.map((_,i) => (
                <div key={i} style={{height:3,borderRadius:2,background:i===factIdx?'#6366f1':'rgba(255,255,255,0.1)',width:i===factIdx?18:10,transition:'all 0.3s'}}/>
              ))}
            </div>
            <button onClick={openChat} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:8,padding:'7px',color:'white',fontSize:10,fontFamily:'monospace',fontWeight:700,cursor:'pointer',boxShadow:'0 0 14px rgba(99,102,241,0.4)'}}>
              <Brain size={11}/> Show me how to fix this <ChevronRight size={10}/>
            </button>
          </div>
          {/* Brain button */}
          <button onClick={openChat} style={{width:56,height:56,borderRadius:'50%',border:'none',cursor:'pointer',background:'linear-gradient(135deg,#1e1b4b,#0a0f1e)',boxShadow:'0 0 0 1px rgba(99,102,241,0.5), 0 0 30px rgba(99,102,241,0.4)',display:'flex',alignItems:'center',justifyContent:'center',animation:'brainGlow 3s ease-in-out infinite'}}>
            <Brain size={22} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 6px rgba(99,102,241,0.8))'}}/>
          </button>
        </div>
      )}

      {/* CHAT + LOADING + READY: full panel */}
      {(phase==='chat'||phase==='loading'||phase==='ready') && (
        <div style={{position:'fixed',bottom:24,right:24,zIndex:9000,width:360,background:'rgba(6,8,20,0.97)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:18,boxShadow:'0 0 60px rgba(99,102,241,0.12), 0 20px 60px rgba(0,0,0,0.7)',display:'flex',flexDirection:'column',overflow:'hidden',animation:'slideUp 0.3s ease'}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'12px 14px',background:'rgba(0,0,0,0.4)',borderBottom:'1px solid rgba(99,102,241,0.1)'}}>
            <div style={{position:'relative'}}>
              <Brain size={15} style={{color:'#a5b4fc',filter:'drop-shadow(0 0 5px rgba(99,102,241,0.7))'}}/>
              <div style={{position:'absolute',top:-2,right:-2,width:6,height:6,borderRadius:'50%',background:'#10b981',border:'1px solid #030712'}}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:900,fontFamily:'monospace',color:'#e0e7ff',letterSpacing:'0.1em'}}>MANAV BRAIN</div>
              <div style={{fontSize:7,color:'rgba(255,255,255,0.25)',fontFamily:'monospace'}}>{streaming?'Thinking...':'Your SEO partner'}</div>
            </div>
            {phase==='ready' && (
              <button onClick={launchTour} style={{display:'flex',alignItems:'center',gap:4,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:7,padding:'5px 10px',color:'white',fontSize:9,fontFamily:'monospace',fontWeight:700,cursor:'pointer'}}>
                <Sparkles size={9}/> Tour
              </button>
            )}
            <button onClick={()=>setPhase('hook')} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.25)',padding:3,display:'flex'}}>
              <X size={13}/>
            </button>
          </div>

          {/* Messages */}
          <div style={{maxHeight:280,overflow:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:8}}>
            {msgs.map((m,i) => (
              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:7,justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                {m.role==='brain' && (
                  <div style={{width:22,height:22,borderRadius:'50%',background:'linear-gradient(135deg,#1e1b4b,#0a0f1e)',border:'1px solid rgba(99,102,241,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <Brain size={10} style={{color:'#a5b4fc'}}/>
                  </div>
                )}
                <div style={{maxWidth:'85%',background:m.role==='user'?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.03)',border:m.role==='user'?'1px solid rgba(99,102,241,0.2)':'1px solid rgba(6,182,212,0.08)',borderRadius:m.role==='user'?'12px 12px 3px 12px':'3px 12px 12px 12px',padding:'8px 11px'}}>
                  <p style={{fontSize:11,color:'rgba(255,255,255,0.75)',lineHeight:1.6,margin:0}}>{m.text}{m.role==='brain'&&i===msgs.length-1&&streaming&&<span style={{animation:'blink 0.8s step-end infinite',color:'#6366f1',marginLeft:2}}>▋</span>}</p>
                </div>
              </div>
            ))}
            {phase==='loading' && (
              <div style={{display:'flex',gap:4,alignItems:'center',paddingLeft:29}}>
                {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:'50%',background:'#6366f1',animation:'dotB 1.4s ease-in-out '+(i*0.2)+'s infinite'}}/>)}
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* CTA when ready */}
          {phase==='ready' && (
            <div style={{padding:'0 12px 10px'}}>
              <button onClick={launchTour} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:10,padding:'10px',color:'white',fontSize:11,fontFamily:'monospace',fontWeight:700,cursor:'pointer',boxShadow:'0 0 20px rgba(99,102,241,0.4)'}}>
                <Brain size={13}/> Launch Full Demo Tour <ArrowRight size={12}/>
              </button>
              <button onClick={()=>navigate('/')} style={{width:'100%',marginTop:5,background:'none',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'6px',color:'rgba(255,255,255,0.3)',fontSize:10,fontFamily:'monospace',cursor:'pointer'}}>
                Sign in to my account
              </button>
            </div>
          )}

          {/* Input */}
          {(phase==='chat') && !streaming && (
            <div style={{padding:'0 10px 10px',display:'flex',gap:6}}>
              <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} placeholder={askIndustry?'e.g. e-commerce fashion, local gym, SaaS...':'Ask me anything about SEO...'} style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:9,padding:'7px 11px',fontSize:10,color:'rgba(255,255,255,0.8)',outline:'none',fontFamily:'inherit'}}/>
              <button onClick={handleSend} style={{width:32,height:32,background:'linear-gradient(135deg,#6366f1,#4f46e5)',border:'none',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <Send size={12} style={{color:'white'}}/>
              </button>
            </div>
          )}
          {/* Quick replies */}
          {phase==='chat' && !streaming && !askIndustry && (
            <div style={{padding:'0 10px 10px',display:'flex',gap:4,flexWrap:'wrap'}}>
              {["How is this different?","Does it work for my niche?","How long before I see results?"].map((q,i)=>(
                <button key={i} onClick={()=>{setInput(q);setTimeout(handleSend,50);}} style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:10,padding:'3px 8px',fontSize:8,fontFamily:'monospace',color:'rgba(165,180,252,0.65)',cursor:'pointer'}}>{q}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
        @keyframes brainGlow{0%,100%{box-shadow:0 0 0 1px rgba(99,102,241,0.5),0 0 30px rgba(99,102,241,0.4);}50%{box-shadow:0 0 0 1px rgba(99,102,241,0.8),0 0 50px rgba(99,102,241,0.6);}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        @keyframes dotB{0%,60%,100%{transform:scale(1);opacity:0.4;}30%{transform:scale(1.6);opacity:1;}}
      `}</style>
    </>
  );
}
