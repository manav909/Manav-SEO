/* "Grow with us": a briefcase that grows into a brand as the service bar fills.
   Clay-style vector scenes (soft gradients, side walls for depth), one per step. */
const C = { navy: "#16204a", navy2: "#0d1430", gold: "#FDB913", cream: "#fff6e6", brick: "#c8694a" };
const defs = `<defs>
<linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd970"/><stop offset="1" stop-color="#e79a00"/></linearGradient>
<linearGradient id="gNavy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25336e"/><stop offset="1" stop-color="#121a3d"/></linearGradient>
<linearGradient id="gBrick" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#df8763"/><stop offset="1" stop-color="#b3563a"/></linearGradient>
<linearGradient id="gBrick2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9d3b4"/><stop offset="1" stop-color="#cdb08a"/></linearGradient>
<linearGradient id="gSlate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d93b8"/><stop offset="1" stop-color="#55698f"/></linearGradient>
<linearGradient id="gGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="1" stop-color="#ffc85a"/></linearGradient>
<linearGradient id="gDim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e1ec"/><stop offset="1" stop-color="#b8c4d6"/></linearGradient>
<radialGradient id="gShadow"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="gHalo"><stop offset="0" stop-color="#FDB913" stop-opacity=".45"/><stop offset="1" stop-color="#FDB913" stop-opacity="0"/></radialGradient>
</defs>`;
const shade = (x, y, w, h, d = 22) => `<path d="M${x + w} ${y} l${d} ${-d * .55} v${h} l${-d} ${d * .55}z" fill="#000" opacity=".22"/><path d="M${x} ${y} l${d} ${-d * .55} h${w} l${-d} ${d * .55}z" fill="#fff" opacity=".18"/>`;
const awning = (x, y, w, n = 8, h = 26) => {
  const sw = w / n; let o = "";
  for (let i = 0; i < n; i++) o += `<rect x="${x + i * sw}" y="${y}" width="${sw + .5}" height="${h}" fill="${i % 2 ? C.cream : C.navy}"/><circle cx="${x + i * sw + sw / 2}" cy="${y + h}" r="${sw / 2}" fill="${i % 2 ? C.cream : C.navy}"/>`;
  return o + `<rect x="${x}" y="${y - 3}" width="${w}" height="6" rx="3" fill="${C.navy2}"/>`;
};
const sign = (x, y, w, h, fs) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="url(#gNavy)"/><rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="5" fill="none" stroke="${C.gold}" stroke-opacity=".5"/><text class="gsn" x="${x + w / 2}" y="${y + h / 2 + fs * .36}" font-size="${fs}" text-anchor="middle" fill="${C.gold}" font-weight="800" letter-spacing=".06em">YOUR BUSINESS</text>`;
const win = (x, y, w, h, lit) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#${lit ? "gGlass" : "gDim"})"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="${C.navy2}" stroke-width="4"/><path d="M${x + w * .18} ${y + h - 8} L${x + w * .55} ${y + 8}" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>`;
const door = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="url(#gNavy)"/><rect x="${x + 8}" y="${y + 10}" width="${w - 16}" height="${h * .45}" rx="4" fill="url(#gGlass)" opacity=".85"/><circle cx="${x + w - 10}" cy="${y + h * .62}" r="3.5" fill="${C.gold}"/>`;
const person = (x, c, k) => `<g class="walker" style="--d:${k}s"><g transform="translate(${x} 0)"><circle cx="0" cy="338" r="9" fill="#2b2b33"/><path d="M-11 400 v-32 a11 11 0 0 1 22 0 v32z" fill="${c}"/></g></g>`;
const pin = (x, y) => `<g class="bob"><path d="M${x} ${y + 46} C${x - 4} ${y + 30} ${x - 22} ${y + 26} ${x - 22} ${y + 8} a22 22 0 0 1 44 0 C${x + 22} ${y + 26} ${x + 4} ${y + 30} ${x} ${y + 46}z" fill="#ea4335"/><circle cx="${x}" cy="${y + 8}" r="8" fill="#a50e0e"/></g>`;
const stars = (x, y) => `<g class="bob" style="animation-delay:-1.2s"><rect x="${x}" y="${y}" width="150" height="44" rx="22" fill="#fff"/><text x="${x + 18}" y="${y + 28}" font-size="17" fill="#f59e0b" letter-spacing="1">★★★★★</text><text x="${x + 112}" y="${y + 28}" font-size="16" font-weight="800" fill="${C.navy}">4.9</text></g>`;
const ai = (x, y) => `<g class="bob" style="animation-delay:-2s"><rect x="${x}" y="${y}" width="230" height="58" rx="18" fill="#fff"/><path d="M${x + 30} ${y + 58} l-8 14 l20 -14z" fill="#fff"/><circle cx="${x + 26}" cy="${y + 29}" r="12" fill="#111"/><path d="M${x + 26} ${y + 21} v16 M${x + 18} ${y + 29} h16 M${x + 20} ${y + 23} l12 12 M${x + 32} ${y + 23} l-12 12" stroke="#fff" stroke-width="2"/><text x="${x + 46}" y="${y + 25}" font-size="12" fill="#6b7280" font-weight="600">ChatGPT recommends</text><text class="gsn2" x="${x + 46}" y="${y + 44}" font-size="14" fill="#111" font-weight="800">Your Business</text></g>`;
const ground = (w = 300) => `<ellipse cx="400" cy="402" rx="${w}" ry="16" fill="url(#gShadow)"/>`;

const briefcase = `${ground(130)}<rect x="304" y="262" width="192" height="130" rx="18" fill="url(#gGold)"/><rect x="304" y="262" width="192" height="130" rx="18" fill="none" stroke="#b97800" stroke-opacity=".5" stroke-width="2"/>
<path d="M368 262 v-20 a14 14 0 0 1 14-14 h36 a14 14 0 0 1 14 14 v20" fill="none" stroke="${C.navy}" stroke-width="11" stroke-linecap="round"/>
<rect x="298" y="276" width="204" height="8" rx="4" fill="#000" opacity=".12"/><rect x="296" y="252" width="208" height="30" rx="15" fill="#fff" stroke="#e4d6bd" stroke-width="2"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<circle cx="${306 + i * 23.5}" cy="254" r="9" fill="#fff"/>`).join("")}
<rect x="386" y="296" width="28" height="24" rx="5" fill="${C.navy}"/><rect x="393" y="302" width="14" height="10" rx="2" fill="${C.gold}"/>
<rect x="318" y="296" width="8" height="78" rx="4" fill="#fff" opacity=".28"/>`;
const stand = `${ground(170)}<rect x="300" y="196" width="8" height="196" fill="${C.navy2}"/><rect x="492" y="196" width="8" height="196" fill="${C.navy2}"/>${awning(282, 190, 236, 8, 30)}
<rect x="292" y="296" width="216" height="14" rx="7" fill="${C.cream}"/><rect x="300" y="306" width="200" height="78" rx="10" fill="url(#gNavy)"/>${shade(300, 306, 200, 78, 16)}
<rect x="352" y="326" width="96" height="32" rx="7" fill="url(#gGold)"/><text x="400" y="348" font-size="17" font-weight="900" text-anchor="middle" fill="${C.navy}" letter-spacing=".08em">OPEN</text>
<rect x="312" y="270" width="34" height="26" rx="5" fill="#f9a8d4"/><rect x="354" y="262" width="30" height="34" rx="5" fill="#93c5fd"/><rect x="420" y="272" width="40" height="24" rx="5" fill="#86efac"/>
<circle cx="330" cy="392" r="12" fill="#22263a"/><circle cx="470" cy="392" r="12" fill="#22263a"/>`;
const shop = lit => `${lit ? '<circle cx="400" cy="290" r="230" fill="url(#gHalo)"/>' : ""}${ground(200)}<rect x="270" y="180" width="260" height="220" fill="url(#gBrick)"/>${shade(270, 180, 260, 220)}
<rect x="260" y="166" width="280" height="18" rx="4" fill="${C.cream}"/>${sign(300, 192, 200, 36, 15)}${awning(280, 240, 240, 8, 22)}
${win(292, 278, 136, 96, lit)}${door(450, 284, 58, 116)}${lit ? `<rect x="306" y="292" width="56" height="22" rx="11" fill="#ef4444"/><text x="334" y="308" font-size="12" font-weight="900" text-anchor="middle" fill="#fff">OPEN</text>` : ""}`;
const busyShop = `${shop(true)}${pin(400, 96)}${person(560, "#2563eb", 0)}${person(620, "#db2777", 1.4)}${person(220, "#059669", .7)}`;
const big = (withAi) => `<circle cx="400" cy="260" r="280" fill="url(#gHalo)"/>${ground(250)}<rect x="230" y="110" width="340" height="290" fill="url(#gBrick2)"/>${shade(230, 110, 340, 290, 26)}
<rect x="220" y="96" width="360" height="20" rx="4" fill="${C.cream}"/>${sign(268, 124, 264, 44, 20)}
${[0, 1, 2, 3].map(i => win(252 + i * 78, 184, 60, 46, true)).join("")}${awning(240, 252, 320, 10, 22)}
${win(250, 290, 130, 92, true)}${win(420, 290, 130, 92, true)}${door(372, 284, 56, 116)}
${stars(588, 118)}${withAi ? ai(40, 120) : ""}${person(160, "#2563eb", 0)}${person(640, "#db2777", 1)}${person(690, "#f59e0b", 2.1)}${person(110, "#059669", .5)}`;
const brand = `<circle cx="400" cy="250" r="320" fill="url(#gHalo)"/>${ground(340)}
<rect x="90" y="200" width="170" height="200" fill="url(#gSlate)"/>${shade(90, 200, 170, 200, 18)}${sign(104, 212, 142, 30, 11)}${awning(98, 258, 154, 6, 18)}${win(104, 290, 80, 70, true)}${door(196, 300, 48, 100)}
<rect x="540" y="170" width="180" height="230" fill="url(#gBrick)"/>${shade(540, 170, 180, 230, 18)}${sign(556, 184, 148, 30, 11)}${awning(548, 232, 164, 6, 18)}${win(556, 266, 86, 74, true)}${door(656, 290, 50, 110)}
<rect x="290" y="80" width="220" height="320" fill="url(#gBrick2)"/>${shade(290, 80, 220, 320, 24)}<rect x="282" y="68" width="236" height="18" rx="4" fill="${C.cream}"/>${sign(306, 94, 188, 40, 15)}
${[0, 1, 2].map(i => win(312 + i * 64, 150, 48, 44, true)).join("")}${[0, 1, 2].map(i => win(312 + i * 64, 210, 48, 44, true)).join("")}${awning(298, 270, 204, 8, 20)}${win(306, 300, 96, 80, true)}${door(420, 292, 62, 108)}
<g class="drive"><rect x="560" y="330" width="150" height="62" rx="12" fill="#fff"/><path d="M710 342 h34 l22 26 v24 h-56z" fill="#fff"/><path d="M716 348 h24 l15 18 h-39z" fill="#bfd3f2"/><circle cx="620" cy="361" r="16" fill="url(#gGold)"/><text x="620" y="366" font-size="13" font-weight="900" text-anchor="middle" fill="${C.navy}">BS</text><circle cx="596" cy="394" r="13" fill="#22263a"/><circle cx="728" cy="394" r="13" fill="#22263a"/></g>
${stars(40, 120)}${person(270, "#2563eb", 0)}${person(520, "#db2777", 1.2)}`;

export const SCENES = [briefcase, stand, shop(false), busyShop, big(false), big(true), brand];
export function buildGrow(svg) {
  svg.innerHTML = defs + SCENES.map((g, i) => `<g class="gs${i ? "" : " on"}" data-s="${i}">${g}</g>`).join("") +
    `<g id="grSpark">${Array.from({ length: 10 }, (_, i) => `<circle class="spk" cx="400" cy="250" r="${3 + (i % 3)}" fill="${C.gold}" style="--a:${i * 36}deg"/>`).join("")}</g>`;
  const scenes = [...svg.querySelectorAll(".gs")], spark = svg.querySelector("#grSpark");
  let cur = 0;
  return {
    set(i) {
      if (i === cur) return; cur = i;
      scenes.forEach((g, k) => g.classList.toggle("on", k === i));
      spark.classList.remove("go"); void spark.getBBox(); spark.classList.add("go");
    },
    name(n) { svg.querySelectorAll(".gsn").forEach(t => t.textContent = n.toUpperCase()); svg.querySelectorAll(".gsn2").forEach(t => t.textContent = n); }
  };
}
