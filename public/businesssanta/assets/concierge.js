/* Business Santa assistant: instant answers, expert handoff, Zoom requests, voice.
   Built-in answer engine (no AI service). Edit TEAM, KB and SVC_INFO to change answers. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- the team ---------- */
const TEAM={
  jyoti:{name:"Jyoti", role:"Head of Client Success", img:"/businesssanta/assets/img/jyoti.webp", topics:"your project, quotes, reports and calls"},
  manav:{name:"Manav", role:"Founder, strategy and AI search (GEO)", img:"/businesssanta/assets/img/manav.webp", topics:"strategy, AI search, monthly plans and bigger projects"},
  sam:{name:"Sam", role:"Technical SEO specialist", img:"/businesssanta/assets/img/sam.webp", topics:"Search Console, indexing, speed, schema and site errors"},
  sakshi:{name:"Sakshi", role:"On-page and content specialist", img:"/businesssanta/assets/img/sakshi.webp", topics:"on-page SEO, content, WordPress and Yoast, and Shopify listings"}
};
const EXPERT_FOR={gsc:"sam", yoast:"sakshi", shopify:"sakshi", full:"manav", monthly:"manav", geo:"manav"};

/* ---------- what each service is, in plain words ---------- */
const SVC_INFO={
  full:{inc:["Keyword and competitor research for your niche","On-page fixes on your key pages","Technical fixes that block Google","Off-page work: quality links and mentions","AI search basics so assistants can cite you","A written plan and a report of every change"],
        need:["Your website address","Your main services and the cities or regions you serve","Access to Google Search Console (we help you set it up if needed)"],
        result:"You get a clear plan, the work done on your site, and a report you can check in Google Search Console. Rankings then build over the following months."},
  gsc:{inc:["A full Google Search Console review","Fixes for indexing and 'page not indexed' problems","Sitemap and robots.txt checks","Crawl errors, redirects and 404s fixed","Schema (structured data) errors fixed","Speed and Core Web Vitals checks","Plain-English notes your developer can act on"],
       need:["Your website address","Access to Google Search Console","Access to your website admin, or your developer's contact"],
       result:"Pages Google could not index are fixed and resubmitted, and you can watch them return in Search Console, usually within a few weeks."},
  yoast:{inc:["Yoast SEO set up and configured properly","SEO titles and meta descriptions","Headings, content and internal links","Image alt text","Basic schema","Plugin and WordPress SEO settings checked"],
         need:["Your website address","A WordPress login with editor or admin rights (you can remove it after)"],
         result:"Each important page is clear to Google and to buyers, with a before and after report of every change."},
  monthly:{inc:["A monthly plan agreed with you","On-page, technical and off-page work every month","Keyword tracking","A plain-English report each month","Direct access to the team for questions"],
           need:["Your website address","Your goals and main services","Access to Google Search Console and Google Analytics"],
           result:"Steady progress month after month, with a report that shows what we did and what changed."},
  shopify:{inc:["A Shopify store SEO audit","Product and collection titles, descriptions and URLs","Product listing improvements","Technical fixes for Shopify themes","Promotion and visibility plan"],
           need:["Your store address","Staff access to your Shopify admin (you can remove it after)"],
           result:"Products and collections that are easier for shoppers to find on Google, with every change listed."},
  geo:{inc:["A check of how ChatGPT, Google AI Overviews, Claude and Gemini see your brand","Content and page structure that AI assistants can quote","Schema and entity setup so AI understands who you are","Mentions on trusted sources","A report of where you appear"],
       need:["Your website address","Your main services and competitors"],
       result:"Your business becomes easier for AI assistants to understand, recommend and cite. One client saw new AI citations within days of the work."}
};

/* ---------- general knowledge (intent: words, answer, chips, expert) ---------- */
const KB=[
 {id:"hello", w:["hi","hello","hey","good morning","good afternoon","good evening","yo"], a:()=>`Hi! I'm the Business Santa assistant. Ask me anything about SEO for your business, or tell me what's wrong with your website and I'll point you to the right service and the right person on our team.`, chips:["What do you do?","How much does it cost?","My site isn't on Google","Talk to a person"]},
 {id:"what", w:["what do you do","services","what do you offer","help me with","what can you"], a:()=>`We help US businesses get found on Google and in AI answers like ChatGPT. Our services:<ul>${SVCS().map(s=>`<li><b>${esc(s.name)}</b>: ${esc(s.short)}</li>`).join("")}</ul>Tell me about your website and I'll suggest the best fit.`, chips:["Which one do I need?","How much does it cost?","How long does it take?"]},
 {id:"which", w:["which one","which service","what do i need","recommend","suggest","best for me","not sure"], a:()=>`Easiest way: tell me in one line what's going on, for example "my Shopify store gets no traffic" or "Google won't index my pages". Or answer 4 quick questions and I'll build you a plan.`, chips:["Answer 4 quick questions","My site isn't on Google","I want more leads"], act:"guide"},
 {id:"price", w:["price","prices","cost","costs","how much","pricing","budget","expensive","cheap","rate","rates","quote","fee","fees","charge"], a:ctx=>{
    const s=ctx.svc!=null?SVCS()[ctx.svc]:null;
    if(s) return s.price?`<b>${esc(s.name)}</b> starts at <b>$${s.price}</b>. The final price depends on your site's size, and we confirm it in writing after a free review. You pay nothing until you approve.`:`<b>${esc(s.name)}</b> is quoted for your site, because the work depends on its size and goals. The review is free, and you pay nothing until you approve the plan and price.`;
    return `Starting prices: <b>On-Page SEO from $120</b> and <b>Technical SEO from $160</b>. Monthly SEO, Shopify, AI search (GEO) and full packages are quoted after a free review of your site. You pay nothing until you approve the plan and price.`;}, chips:["What's included?","How long does it take?","Get my free review"]},
 {id:"time", w:["how long","timeline","time","days","weeks","fast","quick","soon","delivery","turnaround","when will"], a:ctx=>{
    const s=ctx.svc!=null?SVCS()[ctx.svc]:null;
    if(s) return `For <b>${esc(s.name)}</b>, typical delivery is <b>${esc(window.TIMELINE[s.id])}</b>. Fixes show in Google Search Console within a few weeks, and rankings build over the following months.`;
    return `Most one-time projects take <b>3 to 7 days</b>. Technical fixes usually show in Google Search Console within a few weeks. Rankings and traffic build over months, depending on your competition. We give you a timeline for your site before you pay.`;}, chips:["How much does it cost?","Can you guarantee rankings?"]},
 {id:"guarantee", w:["guarantee","guaranteed","promise","rank 1","rank #1","number one","first page","page one","results guaranteed"], a:()=>`Honest answer: no one can guarantee a #1 position, because Google decides rankings, and anyone who promises it is taking a gamble with your business. What we guarantee is the work: a clear plan, every fix done and shown to you, and reports you can check yourself in Google Search Console.`, chips:["How do you report?","See client reviews"]},
 {id:"process", w:["how does it work","how do you work","process","steps","get started","start","begin","next step","onboarding"], a:()=>`It's simple:<ol><li>Tell us your website and goal here or on WhatsApp.</li><li>We review your site for free and tell you what it needs, the price and the timeline, in writing.</li><li>You approve. Nothing is charged before that.</li><li>Our team does the work and shows you every change.</li><li>You get a report, and we stay available for questions.</li></ol>`, chips:["Get my free review","Book a Zoom call"]},
 {id:"report", w:["report","reports","reporting","track","tracking","measure","proof","see progress","results"], a:()=>`You get a plain-English report listing every change we made and why, with screenshots where useful, plus where to check results yourself in Google Search Console. Monthly clients get a report every month.`, chips:["How long does it take?","See client reviews"]},
 {id:"access", w:["access","login","password","credentials","admin","safe","security","secure","data","privacy","trust","hacked"], a:()=>`Your site and data stay yours. We ask only for the access a task needs, ideally a separate login you can remove when we finish. We never paste your logins, customer data or analytics into public AI chat tools, and we don't share your information with anyone.`, chips:["Do you use AI?","Who will work on my site?"]},
 {id:"ai", w:["do you use ai","chatgpt write","ai content","ai generated","automated","bot","are you a bot","are you human","are you real","real person"], a:()=>`I'm the team's assistant, so I'm software. I answer common questions instantly, and a real person takes over whenever you want. For the work itself, AI tools only speed up research. A person on our team writes or reviews every change before it goes live. No mass-produced AI pages.`, chips:["Talk to a person","Who will work on my site?"]},
 {id:"team", w:["who will","who works","team","who are you","people","specialist","expert","experts","staff"], a:()=>`You'll deal with four people:<ul>${Object.values(TEAM).map(t=>`<li><b>${t.name}</b>: ${esc(t.role)}</li>`).join("")}</ul>Jyoti is your main contact, and the right specialist joins when your question needs them.`, chips:["Talk to Sam","Talk to Sakshi","Talk to Manav"]},
 {id:"where", w:["where are you","located","location","based","country","india","usa","us based","time zone","timezone","hours","office"], a:()=>`Our team is based in India and works with US clients. We schedule calls in your time zone, and we've delivered for US businesses for over ten years. You can talk to us here, on WhatsApp, or on a Zoom call.`, chips:["Book a Zoom call","See client reviews"]},
 {id:"reviews", w:["reviews","review","testimonials","clients","references","case study","case studies","portfolio","examples","past work","trust you"], a:()=>`We've delivered 2,000+ projects with a 4.9 average from client reviews. A few US clients, in their own words:<ul><li>"They provided a very detailed report that went above and beyond what we were expecting" (jahlisa)</li><li>"Having someone who takes the time to explain things and answer my questions means a lot to me" (thecini07)</li><li>"The team was professional, polite, well-spoken, and highly knowledgeable" (metablazetoken)</li></ul>`, chips:["Show me all reviews","How much does it cost?"], act:"reviews"},
 {id:"pay", w:["pay","payment","paypal","card","credit card","invoice","deposit","upfront","refund","money back"], a:()=>`You pay nothing until you approve the written plan and price. Payment details come with your written quote. If something in the agreed scope is missing or wrong, we fix it at no cost.`, chips:["Get my free review","Talk to Jyoti"]},
 {id:"contract", w:["contract","commitment","cancel","long term","lock in","minimum","retainer","monthly plan"], a:()=>`One-time projects have no ongoing commitment. For monthly SEO, the scope and terms are agreed in writing before you start, so you know exactly what you're signing up for. Manav can walk you through the monthly options.`, chips:["Talk to Manav","What's included in monthly SEO?"]},
 {id:"platforms", w:["wordpress","shopify","wix","squarespace","webflow","woocommerce","custom","platform","cms","godaddy","duda"], a:()=>`We work on WordPress, Shopify, Wix, Squarespace, Webflow and custom-built sites. Tell me what your site is built on and what you need, and I'll match the service.`, chips:["My site isn't on Google","Rank my Shopify store"]},
 {id:"local", w:["local","near me","google maps","maps","google business","gbp","city","service area","nearby"], a:()=>`For local businesses we focus on the pages and signals Google uses for local results: your service and city pages, schema, and the consistency of your business details. Our Full SEO package covers this, and we review your site first so the plan fits your area.`, chips:["How much does it cost?","Talk to Manav"], svc:"full"},
 {id:"geo", w:["geo","aeo","chatgpt","gemini","claude","perplexity","ai overview","ai overviews","ai search","llm","cited","recommended by ai"], a:()=>`GEO (Generative Engine Optimization) makes your business easier for AI assistants like ChatGPT, Google AI Overviews, Claude and Gemini to understand, recommend and cite. More buyers ask an AI before they search, so it helps to be the answer it gives.`, chips:["What's included?","Talk to Manav"], svc:"geo"},
 {id:"traffic_drop", w:["dropped","drop","lost traffic","traffic down","rankings down","penalty","algorithm","update hit","decline","fell"], a:()=>`Sorry to hear that. Drops usually come from a technical problem, a Google update, or a change on the site. We find the cause in Search Console and fix it. Sam, our technical specialist, handles these.`, chips:["Talk to Sam","How much does it cost?"], svc:"gsc"},
 {id:"thanks", w:["thanks","thank you","great","awesome","perfect","cool","ok","okay"], a:()=>`You're welcome! Anything else? I can also bring someone from the team in, or book a Zoom call.`, chips:["Talk to a person","Book a Zoom call"]},
 {id:"human", w:["talk to a person","talk to someone","human","real person","agent","representative","call me","phone","speak to"], a:()=>`Of course. Who would you like?`, act:"pickexpert"},
 {id:"zoom", w:["zoom","meeting","call","schedule","book","appointment","video call","consultation","demo"], a:()=>`Happy to set up a Zoom call. It takes 30 seconds.`, act:"zoom"},
 {id:"included", w:["included","include","includes","what do i get","what's in","deliverables","scope","what will you do"], a:ctx=>{
    const s=ctx.svc!=null?SVCS()[ctx.svc]:null;
    if(!s) return `Which service would you like to know about?`;
    const i=SVC_INFO[s.id];
    return `<b>${esc(s.name)}</b> includes:<ul>${i.inc.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${esc(i.result)}`;}, chips:["What do you need from me?","How much does it cost?","How long does it take?"], askSvc:true},
 {id:"needs", w:["need from me","what do you need","requirements","what info","what information","prepare"], a:ctx=>{
    const s=ctx.svc!=null?SVCS()[ctx.svc]:null;
    if(!s) return `Usually just your website address and your goal. For the work itself, we ask for access only to what the task needs.`;
    return `For <b>${esc(s.name)}</b> we need:<ul>${SVC_INFO[s.id].need.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>Don't have something? We'll help you set it up.`;}, chips:["Get my free review","Is my data safe?"]}
];
const SVCS=()=>window.SERVICES||[];
const WEAK=new Set(["hello","platforms","thanks","what"]);
const ROUTE={sam:["technical","code","developer","server","hosting","speed","slow","schema","index","indexing","crawl","error","errors","redirect","ssl","https","api","integrate","integration","plugin","javascript","migration","migrate","domain","dns","analytics","ga4","tag manager","tracking","console"],
  sakshi:["content","blog","write","writing","copy","article","articles","product","products","description","descriptions","listing","listings","wordpress","yoast","shopify","pages","meta","title","titles","keywords"],
  manav:["strategy","plan","competitor","competitors","budget","enterprise","agency","partnership","white label","resell","monthly","retainer","ai","geo","chatgpt","growth","marketing"]};
function routeFor(text){
  const q=" "+n(text)+" "; let best="jyoti", bs=0;
  for(const [k,ws] of Object.entries(ROUTE)){ const sc=ws.filter(w=>q.includes(" "+w+" ")||q.includes(" "+w)).length; if(sc>bs){bs=sc;best=k;} }
  return best;
}

/* ---------- matching ---------- */
function n(t){return (window.norm?window.norm(t):t.toLowerCase()).replace(/\s+/g," ").trim();}
function detect(text){
  const q=" "+n(text)+" "; const words=n(text).split(" ");
  let best=null, bs=0;
  for(const k of KB){
    let sc=0;
    for(const w of k.w){ if(w.includes(" ")){ if(q.includes(" "+w+" ")||q.includes(" "+w)) sc+=3; } else if(words.includes(w)) sc+=2; }
    if(sc>bs){ bs=sc; best=k; }
  }
  let svc=null;
  if(window.score){ const r=window.score(text); if(r.length&&r[0].sc>=2) svc=r[0].i; }
  return {intent:bs>=2?best:null, svc, svcScore:svc!=null?window.score(text)[0].sc:0};
}

/* ---------- UI ---------- */
const ctx={svc:null, log:[], expert:null};
const root=document.createElement("div");
root.innerHTML=`
<button class="cg-launch" id="cgLaunch" type="button" aria-label="Ask our team" aria-expanded="false" aria-controls="cgPanel">
  <span class="cg-faces">${["jyoti","manav","sam","sakshi"].map(k=>`<img src="${TEAM[k].img}" alt="">`).join("")}</span>
  <span class="cg-lbl">Ask our team</span>
</button>
<section class="cg-panel" id="cgPanel" role="dialog" aria-modal="false" aria-labelledby="cgTitle" hidden>
  <header class="cg-head">
    <div class="cg-faces sm">${["jyoti","manav","sam","sakshi"].map(k=>`<img src="${TEAM[k].img}" alt="${TEAM[k].name}">`).join("")}</div>
    <div class="cg-ht"><strong id="cgTitle">Business Santa assistant</strong><span>Instant answers. A real person joins anytime.</span></div>
    <button class="cg-ic" id="cgSpeak" type="button" aria-pressed="false" title="Read answers aloud" aria-label="Read answers aloud"><svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path class="w" d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <button class="cg-ic" id="cgClose" type="button" aria-label="Close chat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
  </header>
  <div class="cg-log" id="cgLog" aria-live="polite"></div>
  <div class="cg-chips" id="cgChips"></div>
  <form class="cg-in" id="cgForm" autocomplete="off">
    <button class="cg-mic" id="cgMic" type="button" aria-label="Speak your question" title="Speak your question"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <input id="cgText" placeholder="Type or tap the mic and speak" aria-label="Your message">
    <button class="cg-send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" fill="currentColor"/></svg></button>
  </form>
</section>`;
document.body.appendChild(root);

const panel=$("#cgPanel"), log=$("#cgLog"), chipsEl=$("#cgChips"), input=$("#cgText");
let speakOn=false, opened=false;

function open(withText, svcIndex){
  panel.hidden=false; $("#cgLaunch").setAttribute("aria-expanded","true"); document.body.classList.add("cg-open");
  if(svcIndex!=null) ctx.svc=svcIndex;
  if(!opened){ opened=true;
    bot(`Hi, I'm the Business Santa assistant. I answer instantly, and Jyoti, Manav, Sam or Sakshi can join whenever you want. What can I help you with?`,
        ["How much does it cost?","My site isn't on Google","Show up in ChatGPT","Book a Zoom call","Talk to a person"]);
  }
  if(withText) setTimeout(()=>handle(withText),reduce?0:350);
  setTimeout(()=>input.focus(),60);
}
function close(){ panel.hidden=true; $("#cgLaunch").setAttribute("aria-expanded","false"); document.body.classList.remove("cg-open"); stopVoice(); }
$("#cgLaunch").onclick=()=>panel.hidden?open():close();
$("#cgClose").onclick=close;
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!panel.hidden) close(); });

function scroll(){ log.scrollTo({top:log.scrollHeight,behavior:reduce?"auto":"smooth"}); }
function user(t){ ctx.log.push("Client: "+t); const d=document.createElement("div"); d.className="cg-m me"; d.textContent=t; log.appendChild(d); scroll(); }
function setChips(list){ chipsEl.innerHTML=(list||[]).map(c=>`<button type="button">${esc(c)}</button>`).join(""); chipsEl.querySelectorAll("button").forEach(b=>b.onclick=()=>handle(b.textContent)); }
function bot(html, chips, who){
  const t=document.createElement("div"); t.className="cg-m bot typing"; t.innerHTML=`<span class="dots"><i></i><i></i><i></i></span>`;
  log.appendChild(t); scroll(); setChips([]);
  const delay=reduce?0:Math.min(900,350+html.length*2);
  return new Promise(res=>setTimeout(()=>{
    t.classList.remove("typing");
    const w=who?TEAM[who]:null;
    t.innerHTML=(w?`<span class="cg-who"><img src="${w.img}" alt="">${w.name} will take this</span>`:"")+html;
    ctx.log.push("Assistant: "+t.textContent.replace(/\s+/g," ").slice(0,300));
    setChips(chips); scroll(); say(t.textContent); res(t);
  },delay));
}
function card(html){ const d=document.createElement("div"); d.className="cg-card"; d.innerHTML=html; log.appendChild(d); scroll(); return d; }

/* ---------- expert handoff ---------- */
function expertFor(){ if(ctx.expert) return ctx.expert; if(ctx.svc!=null) return EXPERT_FOR[SVCS()[ctx.svc].id]||"jyoti"; return "jyoti"; }
function transcript(){ return ctx.log.slice(-10).join("\n").slice(0,1200); }
function offerExpert(key, why){
  const t=TEAM[key]; ctx.expert=key;
  const c=card(`<div class="cg-ex"><img src="${t.img}" alt=""><div><strong>${t.name}</strong><span>${esc(t.role)}</span></div></div>
    <p>${why?esc(why)+" ":""}${t.name} handles ${esc(t.topics)}. How would you like to talk?</p>
    <div class="cg-acts"><button type="button" class="b1">Chat with ${t.name} on WhatsApp</button><button type="button" class="b2">Zoom call with ${t.name}</button></div>`);
  c.querySelector(".b1").onclick=()=>handoffWA(key);
  c.querySelector(".b2").onclick=()=>zoomFlow(key);
  setChips(["Someone else","Ask another question"]);
}
function handoffWA(key){
  const t=TEAM[key];
  const svc=ctx.svc!=null?SVCS()[ctx.svc].name:"Not chosen yet";
  const msg=`Hi Business Santa, I was chatting with your website assistant. Please bring ${t.name} (${t.role}) into this conversation.\nService: ${svc}\nMy website: \n\nWhat we discussed:\n${transcript()}`;
  if(window.fbq) try{fbq("track","Lead")}catch(e){}
  window.open(window.waLink?window.waLink(msg):"https://wa.me/?text="+encodeURIComponent(msg),"_blank","noopener");
  bot(`Done. WhatsApp is open with our conversation, so ${t.name} has the full picture. Add your website address and press send, and ${t.name} will reply personally.`,["Book a Zoom call too","Ask another question"]);
}
function pickExpert(){
  const c=card(`<p>Who would you like to talk to?</p><div class="cg-pick">${Object.entries(TEAM).map(([k,t])=>`<button type="button" data-k="${k}"><img src="${t.img}" alt=""><strong>${t.name}</strong><span>${esc(t.role)}</span></button>`).join("")}</div>`);
  c.querySelectorAll("button").forEach(b=>b.onclick=()=>{ user(TEAM[b.dataset.k].name); offerExpert(b.dataset.k); });
  setChips(["Not sure, you choose"]);
}

/* ---------- Zoom request inside the chat ---------- */
function zoomFlow(key){
  key=key||expertFor(); const t=TEAM[key];
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"your time zone";
  const days=[]; const d=new Date();
  while(days.length<5){ d.setDate(d.getDate()+1); const wd=d.getDay(); if(wd!==0&&wd!==6) days.push(new Date(d)); }
  const fmt=x=>x.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
  const slots=["Morning (9 AM to 12 PM)","Afternoon (12 to 3 PM)","Late afternoon (3 to 6 PM)"];
  const st={day:null,slot:null};
  const c=card(`<div class="cg-ex"><img src="${t.img}" alt=""><div><strong>Zoom call with ${t.name}</strong><span>${esc(t.role)}, 15 to 30 minutes</span></div></div>
    <p class="cg-l">Pick a day</p><div class="cg-opts d">${days.map((x,i)=>`<button type="button" data-i="${i}">${fmt(x)}</button>`).join("")}</div>
    <p class="cg-l">Pick a time, in your time zone (${esc(tz)})</p><div class="cg-opts s">${slots.map((x,i)=>`<button type="button" data-i="${i}">${x}</button>`).join("")}</div>
    <p class="cg-l">Where should we send the Zoom link?</p>
    <div class="cg-f"><input class="nm" placeholder="Your name" autocomplete="name"><input class="em" type="email" placeholder="Your email" autocomplete="email"><input class="ws" placeholder="Your website" inputmode="url"></div>
    <p class="cg-err" role="alert"></p>
    <button type="button" class="cg-go">Request this time</button>`);
  c.querySelectorAll(".d button").forEach(b=>b.onclick=()=>{ st.day=fmt(days[+b.dataset.i]); c.querySelectorAll(".d button").forEach(x=>x.setAttribute("aria-pressed",x===b)); });
  c.querySelectorAll(".s button").forEach(b=>b.onclick=()=>{ st.slot=slots[+b.dataset.i]; c.querySelectorAll(".s button").forEach(x=>x.setAttribute("aria-pressed",x===b)); });
  c.querySelector(".cg-go").onclick=()=>{
    const nm=c.querySelector(".nm").value.trim(), em=c.querySelector(".em").value.trim(), ws=c.querySelector(".ws").value.trim(), er=c.querySelector(".cg-err");
    if(!st.day||!st.slot){ er.textContent="Pick a day and a time."; return; }
    if(!nm||!/^\S+@\S+\.\S+$/.test(em)){ er.textContent="Add your name and a valid email for the Zoom invite."; return; }
    er.textContent="";
    const svc=ctx.svc!=null?SVCS()[ctx.svc].name:"Not chosen yet";
    const msg=`Hi Business Santa, please book a Zoom call.\nWith: ${t.name} (${t.role})\nDay: ${st.day}\nTime: ${st.slot}, ${tz}\nName: ${nm}\nEmail for the Zoom link: ${em}\nWebsite: ${ws||"(not given)"}\nService: ${svc}\n\nWhat we discussed:\n${transcript()}`;
    if(window.fbq) try{fbq("track","Schedule")}catch(e){}
    window.open(window.waLink?window.waLink(msg):"https://wa.me/?text="+encodeURIComponent(msg),"_blank","noopener");
    c.querySelectorAll("button,input").forEach(x=>x.disabled=true);
    user(`${st.day}, ${st.slot}`);
    bot(`Your request is ready in WhatsApp. Press send, and Jyoti will confirm the exact time and email the Zoom link to <b>${esc(em)}</b>${t.name!=="Jyoti"?`, with ${t.name} on the call`:""}.`,["Ask another question","See packages"]);
  };
  setChips(["Talk on WhatsApp instead"]);
}

/* ---------- main handler ---------- */
async function handle(text){
  text=String(text).trim(); if(!text) return;
  user(text); input.value="";
  const L=text.toLowerCase();
  // direct actions
  if(/^talk to (sam|sakshi|manav|jyoti)$/.test(L)){ offerExpert(L.split(" ").pop()); return; }
  if(L==="talk to a person"||L==="someone else"||L==="not sure, you choose"){ if(L==="not sure, you choose"){ offerExpert(expertFor()); } else pickExpert(); return; }
  if(/book a zoom|zoom call|book a call|schedule/.test(L)){ zoomFlow(); return; }
  if(L==="talk on whatsapp instead"){ handoffWA(expertFor()); return; }
  if(L==="answer 4 quick questions"){ close(); document.getElementById("guideOpen").click(); return; }
  if(L==="see packages"||L==="get my free review"){ close(); if(ctx.svc!=null&&window.chooseService) window.chooseService(ctx.svc); else document.getElementById("order").scrollIntoView({behavior:reduce?"auto":"smooth"}); return; }
  if(L==="show me all reviews"||L==="see client reviews"){ close(); document.getElementById("reviews").scrollIntoView({behavior:reduce?"auto":"smooth"}); return; }
  if(L==="ask another question"){ bot("Sure, go ahead.",["How much does it cost?","How long does it take?","Is my data safe?","Talk to a person"]); return; }
  if(L==="what's included in monthly seo?"){ ctx.svc=SVCS().findIndex(s=>s.id==="monthly"); }

  const r=detect(text);
  if(r.svc!=null) ctx.svc=r.svc;
  if(r.intent&&r.intent.svc){ ctx.svc=SVCS().findIndex(s=>s.id===r.intent.svc); }

  if(r.intent && WEAK.has(r.intent.id) && r.svc!=null && r.svcScore>=2) r.intent=null;
  if(r.intent){
    const k=r.intent;
    if(k.act==="pickexpert"){ await bot(k.a(ctx)); pickExpert(); return; }
    if(k.act==="zoom"){ await bot(k.a(ctx)); zoomFlow(); return; }
    if(k.askSvc&&ctx.svc==null){ await bot(k.a(ctx)); serviceChooser(); return; }
    await bot(k.a(ctx), k.chips);
    return;
  }
  if(r.svc!=null){
    const s=SVCS()[ctx.svc], ex=EXPERT_FOR[s.id], i=SVC_INFO[s.id];
    await bot(`Sounds like <b>${esc(s.name)}</b> is the right fit. ${esc(window.MATCH?window.MATCH[s.id].why:"")}.<br><span class="cg-meta">${s.price?`From $${s.price}`:"Quoted after a free review"} | Typical delivery: ${esc(window.TIMELINE?window.TIMELINE[s.id]:"")}</span><br>${esc(i.result)}`,
      ["What's included?","How much does it cost?",`Talk to ${TEAM[ex].name}`,"Book a Zoom call"]);
    return;
  }
  const ex=routeFor(text);
  await bot(`Good question. I want to give you a precise answer rather than a guess, so let me bring in ${TEAM[ex].name}, who handles ${esc(TEAM[ex].topics)}.`);
  offerExpert(ex);
}
function serviceChooser(){
  const c=card(`<div class="cg-pick svc">${SVCS().map((s,i)=>`<button type="button" data-i="${i}"><img src="/businesssanta/assets/img/${s.img}-thumb.webp" alt=""><strong>${esc(s.name)}</strong></button>`).join("")}</div>`);
  c.querySelectorAll("button").forEach(b=>b.onclick=()=>{ ctx.svc=+b.dataset.i; user(SVCS()[ctx.svc].name); handle("what's included"); });
}
$("#cgForm").addEventListener("submit",e=>{ e.preventDefault(); handle(input.value); });

/* ---------- voice: speak your question, hear the answer ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null, listening=false;
if(!SR){ $("#cgMic").hidden=true; input.placeholder="Type your question"; }
function stopVoice(){ if(rec&&listening){ try{rec.stop()}catch(e){} } if(window.speechSynthesis) speechSynthesis.cancel(); }
$("#cgMic").onclick=()=>{
  if(!SR) return;
  if(listening){ rec.stop(); return; }
  rec=new SR(); rec.lang="en-US"; rec.interimResults=true; rec.continuous=false;
  rec.onstart=()=>{ listening=true; $("#cgMic").classList.add("on"); input.placeholder="Listening… speak now"; };
  rec.onresult=e=>{ let t=""; for(const r of e.results) t+=r[0].transcript; input.value=t; if(e.results[e.results.length-1].isFinal){ rec.stop(); handle(t); } };
  rec.onerror=e=>{ if(e.error==="not-allowed") bot("Your browser blocked the microphone. Allow it in the address bar, or type your question.",[]); };
  rec.onend=()=>{ listening=false; $("#cgMic").classList.remove("on"); input.placeholder="Type or tap the mic and speak"; };
  if(!speakOn&&window.speechSynthesis){ speakOn=true; $("#cgSpeak").setAttribute("aria-pressed","true"); }
  rec.start();
};
$("#cgSpeak").onclick=()=>{ speakOn=!speakOn; $("#cgSpeak").setAttribute("aria-pressed",speakOn); if(!speakOn&&window.speechSynthesis) speechSynthesis.cancel(); };
if(!window.speechSynthesis) $("#cgSpeak").hidden=true;
function say(t){
  if(!speakOn||!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(t.replace(/\s+/g," ").slice(0,600)); u.lang="en-US"; u.rate=1.02;
  const v=speechSynthesis.getVoices().find(v=>/en-US/.test(v.lang)&&/Samantha|Google US English|Jenny|Aria/i.test(v.name)); if(v) u.voice=v;
  speechSynthesis.speak(u);
}

/* ---------- open from anywhere on the page ---------- */
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-ask]"); if(!a||a.closest(".results")) return;
  e.preventDefault();
  const i=a.dataset.svc!=null?+a.dataset.svc:null;
  open(a.dataset.ask||"", i);
});
window.openConcierge=open;
})();
