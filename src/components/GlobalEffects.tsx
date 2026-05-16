import { useEffect } from "react";

export default function GlobalEffects() {
  useEffect(() => {
    // ── CSS injection ──────────────────────────────────────
    const styleId = "empire-global-effects";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        /* Auto-detected card treatment */
        .eg-card {
          position: relative !important;
          transition: transform .18s cubic-bezier(.2,0,.2,1),
                      box-shadow .18s ease,
                      border-color .18s ease !important;
          will-change: transform !important;
          backface-visibility: hidden !important;
          isolation: isolate !important;
        }
        .eg-card::after {
          content: '' !important;
          position: absolute !important;
          inset: 0 !important;
          border-radius: inherit !important;
          background: linear-gradient(135deg,
            rgba(255,255,255,.035) 0%,
            transparent 60%) !important;
          pointer-events: none !important;
          z-index: 0 !important;
        }
        /* HUD corners */
        .eg-card::before {
          content: '' !important;
          position: absolute !important;
          top: 7px !important; left: 7px !important;
          width: 9px !important; height: 9px !important;
          border-top: 1.5px solid var(--accent, #6366f1) !important;
          border-left: 1.5px solid var(--accent, #6366f1) !important;
          border-radius: 2px 0 0 0 !important;
          opacity: .45 !important;
          pointer-events: none !important;
          z-index: 2 !important;
        }
        .eg-card:hover {
          border-color: var(--border-glow, rgba(99,102,241,.4)) !important;
          box-shadow:
            0 0 0 0.5px var(--accent-glow, rgba(99,102,241,.2)),
            0 8px 32px rgba(0,0,8,.6),
            0 0 24px var(--accent-glow, rgba(99,102,241,.15)) !important;
        }
        /* Shine on hover — injected via JS */
        .eg-shine {
          position: absolute !important;
          inset: 0 !important;
          border-radius: inherit !important;
          pointer-events: none !important;
          z-index: 1 !important;
          transition: opacity .25s !important;
        }
        /* Headers */
        .eg-header {
          backdrop-filter: blur(24px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
          background: rgba(4,4,14,.88) !important;
          border-bottom: 0.5px solid rgba(99,102,241,.15) !important;
          box-shadow: 0 1px 0 rgba(255,255,255,.04) !important;
        }
        /* Inputs */
        .eg-input, input.eg-input {
          background: rgba(4,4,14,.8) !important;
          border: 0.5px solid rgba(255,255,255,.1) !important;
          color: #f0f0ff !important;
          transition: border-color .15s, box-shadow .15s !important;
        }
        .eg-input:focus {
          border-color: var(--accent, #6366f1) !important;
          box-shadow: 0 0 0 2px var(--accent-glow, rgba(99,102,241,.2)) !important;
          outline: none !important;
        }
        /* Buttons */
        .eg-btn {
          transition: all .15s cubic-bezier(.2,0,.2,1) !important;
        }
        .eg-btn:hover {
          transform: translateY(-1px) !important;
          filter: brightness(1.1) !important;
        }
        .eg-btn:active {
          transform: translateY(0) scale(.97) !important;
        }
        /* Select */
        select {
          background: rgba(8,8,24,.9) !important;
          color: #e8e8f8 !important;
          border-radius: 8px !important;
          cursor: pointer !important;
        }
        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,.3); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--accent, #6366f1); }
        /* Page enter animation */
        .eg-page-enter > * {
          animation: warp-in .4s cubic-bezier(.2,0,.2,1) both;
        }
        .eg-page-enter > *:nth-child(1) { animation-delay: .02s; }
        .eg-page-enter > *:nth-child(2) { animation-delay: .06s; }
        .eg-page-enter > *:nth-child(3) { animation-delay: .10s; }
        .eg-page-enter > *:nth-child(4) { animation-delay: .14s; }
        .eg-page-enter > *:nth-child(5) { animation-delay: .18s; }
        /* Badge */
        span[style*="borderRadius:20"],
        span[style*="border-radius:20"] {
          backdrop-filter: blur(8px) !important;
        }
        /* Table rows */
        tr {
          transition: background .12s !important;
        }
        /* Link hover */
        a[style] {
          transition: all .15s !important;
        }
      `;
      document.head.appendChild(style);
    }

    // ── Card detector ──────────────────────────────────────
    const CARD_PATTERNS = [
      "#0d0d1e","#0a0a18","#080818","#0d0d1a","#0d0d20",
      "bg-card","empire-card","glass-card",
    ];
    const HEADER_PATTERNS = [
      "#09091a","#09091b","sticky","fixed",
    ];
    const SKIP_TAGS = new Set(["SCRIPT","STYLE","SVG","PATH","CIRCLE","DEFS"]);

    function classify(el: Element) {
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.classList.contains("eg-card") ||
          el.classList.contains("eg-header")) return;

      const style = el.getAttribute("style") || "";
      const cls   = el.className || "";

      // Card detection
      const isCard =
        (style.includes("borderRadius") || style.includes("border-radius")) &&
        (CARD_PATTERNS.some(p => style.includes(p)) ||
         cls.includes("empire-card") || cls.includes("glass-card"));

      if (isCard) {
        el.classList.add("eg-card");
        // Add shine element
        if (!el.querySelector(".eg-shine")) {
          const shine = document.createElement("div");
          shine.className = "eg-shine";
          shine.style.cssText = "opacity:0;background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.06),transparent 60%)";
          el.prepend(shine);
        }
      }

      // Header detection
      const isHeader =
        (style.includes("position:\"sticky\"") ||
         style.includes("position: sticky") ||
         style.includes("sticky")) &&
        (style.includes("top:0") || style.includes("top: 0") ||
         style.includes("zIndex:100") || style.includes("z-index:100")) &&
        HEADER_PATTERNS.some(p => style.includes(p));

      if (isHeader) el.classList.add("eg-header");

      // Input detection
      if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") &&
          !el.classList.contains("eg-input")) {
        el.classList.add("eg-input");
      }

      // Button detection
      if (el.tagName === "BUTTON" && !el.classList.contains("eg-btn") &&
          !el.closest(".dock-container")) {
        el.classList.add("eg-btn");
      }
    }

    function classifyAll(root: Element | Document) {
      const els = root.querySelectorAll("div,header,nav,section,article,button,input,textarea");
      els.forEach(classify);
    }

    // Initial pass
    setTimeout(() => classifyAll(document), 200);
    setTimeout(() => classifyAll(document), 800);
    setTimeout(() => classifyAll(document), 2000);

    // MutationObserver for dynamic content
    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            classify(node as Element);
            classifyAll(node as Element);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ── 3D Mouse tracking ──────────────────────────────────
    let activeCard: HTMLElement | null = null;
    let raf = 0;

    function resetCard(card: HTMLElement) {
      card.style.transform = "";
      const shine = card.querySelector<HTMLElement>(".eg-shine");
      if (shine) shine.style.opacity = "0";
    }

    function onMouseMove(e: MouseEvent) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const target = e.target as Element;
        const card = target.closest<HTMLElement>(".eg-card");

        if (activeCard && activeCard !== card) {
          resetCard(activeCard);
          activeCard = null;
        }

        if (!card || card.closest(".dock-container") ||
            card.closest(".panel-left") || card.closest(".panel-right")) return;

        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width  / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        const rx = -dy * 7;
        const ry =  dx * 7;

        card.style.transform =
          `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(10px)`;

        // Shine follows cursor
        const shine = card.querySelector<HTMLElement>(".eg-shine");
        if (shine) {
          const sx = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
          const sy = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
          shine.style.opacity = "1";
          shine.style.background =
            `radial-gradient(circle at ${sx}% ${sy}%, rgba(255,255,255,.1), transparent 55%)`;
        }

        activeCard = card;
      });
    }

    function onMouseLeave(e: MouseEvent) {
      const card = (e.target as Element).closest<HTMLElement>(".eg-card");
      if (card) {
        card.style.transform = "";
        card.style.transition =
          "transform .35s cubic-bezier(.2,0,.2,1), box-shadow .2s ease, border-color .2s ease";
        const shine = card.querySelector<HTMLElement>(".eg-shine");
        if (shine) shine.style.opacity = "0";
        setTimeout(() => { if (card) card.style.transition = ""; }, 350);
        activeCard = null;
      }
    }

    // ── Page enter animation ───────────────────────────────
    function addPageEnter() {
      const main = document.querySelector<HTMLElement>("main, #root > div > div:not([class])");
      if (main && !main.classList.contains("eg-page-enter")) {
        main.classList.add("eg-page-enter");
        setTimeout(() => main.classList.remove("eg-page-enter"), 800);
      }
    }

    document.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return null;
}
