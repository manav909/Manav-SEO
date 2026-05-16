import React,{useEffect,useState,useRef,useCallback} from "react";
import {useTour} from "@/contexts/TourContext";
import {useNavigate} from "react-router-dom";

function useSpotlight(target?: string) {
  const [spot, setSpot] = useState({ x:"50%", y:"50%", w:300, h:200, found:false });
  useEffect(() => {
    if (!target) { setSpot({ x:"50%", y:"50%", w:300, h:200, found:false }); return; }
    const el = document.querySelector(target);
    if (!el) { setSpot(s => ({...s, found:false})); return; }
    const rect = el.getBoundingClientRect();
    setSpot({
      x: `${rect.left + rect.width/2}px`,
      y: `${rect.top  + rect.height/2}px`,
      w: rect.width  + 32,
      h: rect.height + 32,
      found: true,
    });
  }, [target]);
  return spot;
}

const ROLE_COLORS: Record<string,string> = {
  hod:"#dc2626", bde:"#10b981", client:"#6366f1", pm:"#06b6d4"
};

export default function TourOverlay() {
  const { active, step, steps, next, prev, skip, setRole, role, goTo } = useTour();
  const navigate = useNavigate();
  const current = steps[step];
  const spot = useSpotlight(current?.target);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => { setAnimKey(k => k+1); }, [step]);

  useEffect(() => {
    if (active && current?.action?.href) {
      navigate(current.action.href);
    }
  }, [step, active]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, next, prev, skip]);

  if (!active || !current) return null;

  const accent = ROLE_COLORS[role] || "#6366f1";
  const isCenter = current.position === "center" || !current.target || !spot.found;
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9500,
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      {/* Backdrop */}
      <div style={{
        position:"absolute", inset:0,
        background: isCenter
          ? "rgba(0,0,8,.85)"
          : `radial-gradient(ellipse ${spot.w}px ${spot.h}px at ${spot.x} ${spot.y},
              transparent 0%,
              transparent 50%,
              rgba(0,0,16,.88) 70%,
              rgba(0,0,16,.95) 100%)`,
        backdropFilter:"blur(2px)",
        transition:"background .4s ease",
      }}/>

      {/* Spotlight ring */}
      {!isCenter && spot.found && (
        <div style={{
          position:"absolute",
          left:`calc(${spot.x} - ${spot.w/2}px)`,
          top:`calc(${spot.y} - ${spot.h/2}px)`,
          width: spot.w, height: spot.h,
          border:`2px solid ${accent}`,
          borderRadius:16,
          boxShadow:`0 0 0 4px ${accent}20, 0 0 40px ${accent}40`,
          animation:"glow-expand 2s ease-in-out infinite",
          pointerEvents:"none",
          transition:"all .4s cubic-bezier(.4,0,.2,1)",
        }}/>
      )}

      {/* Tour card */}
      <div key={animKey} style={{
        position:"relative", zIndex:2,
        width: Math.min(520, window.innerWidth - 40),
        background:"rgba(6,6,20,.97)",
        backdropFilter:"blur(40px)",
        borderRadius:20,
        border:`0.5px solid ${accent}50`,
        boxShadow:`0 0 0 1px ${accent}20,
          0 24px 80px rgba(0,0,0,.8),
          0 0 60px ${accent}20`,
        overflow:"hidden",
        animation:"warp-in .35s cubic-bezier(.2,0,.2,1) both",
      }}>
        {/* Top accent bar */}
        <div style={{
          height:3,
          background:`linear-gradient(90deg, ${accent}00, ${accent}, ${accent}00)`,
          animation:"holo-shimmer 2s linear infinite",
          backgroundSize:"200% auto",
        }}/>

        {/* Role selector (first step only) */}
        {step === 0 && (
          <div style={{
            padding:"14px 24px 0",
            display:"flex", gap:8, flexWrap:"wrap" as const,
          }}>
            {[
              { r:"hod",    l:"👑 HOD",    c:"#dc2626" },
              { r:"bde",    l:"💼 BDE",    c:"#10b981" },
              { r:"client", l:"🏢 Client", c:"#6366f1" },
              { r:"pm",     l:"🗂 PM",     c:"#06b6d4" },
            ].map(({r,l,c}) => (
              <button key={r} onClick={() => setRole(r)}
                style={{
                  padding:"5px 14px", borderRadius:20, fontSize:11, fontWeight:600,
                  cursor:"pointer", border:`1.5px solid ${r===role?c:"rgba(255,255,255,.12)"}`,
                  background: r===role?`${c}20`:"transparent",
                  color: r===role?c:"rgba(255,255,255,.4)",
                  transition:"all .2s",
                }}>
                {l}
              </button>
            ))}
            <div style={{fontSize:10,color:"rgba(255,255,255,.3)",alignSelf:"center",marginLeft:4}}>
              Select your role for a personalised tour
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ padding:"20px 24px" }}>
          {/* Icon + step */}
          <div style={{
            display:"flex", justifyContent:"space-between",
            alignItems:"flex-start", marginBottom:14,
          }}>
            <div style={{
              width:44, height:44, borderRadius:14,
              background:`${accent}18`, border:`0.5px solid ${accent}40`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:22, flexShrink:0,
            }}>
              {current.icon || "✦"}
            </div>
            <div style={{ textAlign:"right" as const }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,.3)", letterSpacing:"1px" }}>
                STEP {step+1} OF {steps.length}
              </div>
              <button onClick={skip} style={{
                background:"none", border:"none", color:"rgba(255,255,255,.3)",
                fontSize:11, cursor:"pointer", marginTop:2,
              }}>Skip tour</button>
            </div>
          </div>

          {/* Title */}
          <div style={{
            fontSize:18, fontWeight:800, color:"#fff",
            letterSpacing:"-0.02em", marginBottom:10, lineHeight:1.3,
          }}>
            {current.title}
          </div>

          {/* Body */}
          <div style={{
            fontSize:14, color:"rgba(255,255,255,.65)",
            lineHeight:1.7, marginBottom:current.hint?10:16,
          }}>
            {current.body}
          </div>

          {/* Hint */}
          {current.hint && (
            <div style={{
              padding:"8px 12px", borderRadius:9, marginBottom:16,
              background:`${accent}0f`, border:`0.5px solid ${accent}25`,
              fontSize:12, color:`${accent}cc`,
              display:"flex", gap:7, alignItems:"center",
            }}>
              <span>💡</span>{current.hint}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ height:2, background:"rgba(255,255,255,.06)" }}>
          <div style={{
            height:"100%", width:`${progress}%`,
            background:`linear-gradient(90deg,${accent},${accent}80)`,
            transition:"width .4s cubic-bezier(.4,0,.2,1)",
          }}/>
        </div>

        {/* Controls */}
        <div style={{
          padding:"14px 24px 18px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          borderTop:"0.5px solid rgba(255,255,255,.06)",
        }}>
          {/* Step dots */}
          <div style={{ display:"flex", gap:5 }}>
            {steps.map((_,i) => (
              <div key={i} onClick={() => goTo(i)}
                style={{
                  width: i===step ? 18 : 6,
                  height:6, borderRadius:3,
                  background: i===step ? accent : i<step?"rgba(255,255,255,.3)":"rgba(255,255,255,.1)",
                  cursor:"pointer",
                  transition:"all .3s cubic-bezier(.4,0,.2,1)",
                }}/>
            ))}
          </div>

          {/* Buttons */}
          <div style={{ display:"flex", gap:8 }}>
            {step > 0 && (
              <button onClick={prev} style={{
                padding:"9px 18px", borderRadius:10, fontSize:13, fontWeight:600,
                cursor:"pointer", border:"0.5px solid rgba(255,255,255,.12)",
                background:"rgba(255,255,255,.05)", color:"rgba(255,255,255,.5)",
              }}>← Back</button>
            )}
            <button onClick={next} style={{
              padding:"9px 24px", borderRadius:10, fontSize:13, fontWeight:700,
              cursor:"pointer", border:"none",
              background:`linear-gradient(135deg,${accent},${accent}cc)`,
              color:"#fff",
              boxShadow:`0 4px 16px ${accent}40`,
              transition:"all .2s",
            }}>
              {step === steps.length-1 ? "🚀 Start Using Empire" : "Next →"}
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard hints */}
      <div style={{
        position:"absolute", bottom:16, left:"50%",
        transform:"translateX(-50%)",
        fontSize:10, color:"rgba(255,255,255,.25)",
        display:"flex", gap:12,
      }}>
        {[["→","Next"],["←","Back"],["Esc","Skip"]].map(([k,l])=>(
          <div key={k} style={{display:"flex",gap:4,alignItems:"center"}}>
            <span style={{background:"rgba(255,255,255,.1)",borderRadius:4,
              padding:"1px 6px",fontFamily:"monospace"}}>{k}</span>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
