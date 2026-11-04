/* Business Santa: Main Street at night, real-time 3D scene.
   Everything is drawn in code. Built into /sites/businesssanta/assets/js/app.js by build.sh. */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);

function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

/* soft round glow, used for lamps, moon and the light pools on the ground */
function glowTex() {
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(.25, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return tex(c);
}
/* vertical streak for wet road reflections: bright near the building, fading toward the camera */
function streakTex() {
  const [c, g] = canvas(64, 256);
  for (let y = 0; y < 256; y++) {
    const a = Math.pow(1 - y / 256, 1.6);
    const row = g.createLinearGradient(0, 0, 64, 0);
    row.addColorStop(0, "rgba(255,255,255,0)"); row.addColorStop(.5, `rgba(255,255,255,${a})`); row.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = row; g.fillRect(0, y, 64, 1);
  }
  return tex(c);
}

/* building facade with a window grid; emissive map carries the lit windows */
function facade({ w, h, base, litRatio, ground = 3.8, ppm = 40 }) {
  const W = Math.round(w * ppm), H = Math.round(h * ppm);
  const [mc, m] = canvas(W, H), [ec, e] = canvas(W, H);
  const grd = m.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, base[0]); grd.addColorStop(1, base[1]);
  m.fillStyle = grd; m.fillRect(0, 0, W, H);
  e.fillStyle = "#000"; e.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H / 900; i++) { m.fillStyle = `rgba(255,255,255,${rand() * .025})`; m.fillRect(rand() * W, rand() * H, 2, 2); }
  m.fillStyle = "rgba(0,0,0,.35)";
  for (let y = ground; y < h; y += 3.3) m.fillRect(0, H - y * ppm, W, 3);
  const cols = Math.max(2, Math.round(w / 2.1)), cw = (w - 1.2) / cols;
  for (let y = ground + .9; y + 1.9 < h - .4; y += 3.3) {
    for (let i = 0; i < cols; i++) {
      const x = .6 + i * cw + cw * .18, ww = cw * .64, wh = 1.9;
      const px = x * ppm, py = H - (y + wh) * ppm, pw = ww * ppm, ph = wh * ppm;
      if (rand() < litRatio) {
        const warm = rand() < .78;
        const gg = e.createLinearGradient(0, py, 0, py + ph);
        gg.addColorStop(0, warm ? "#ffd98a" : "#cfe6ff"); gg.addColorStop(1, warm ? "#f39a2c" : "#6aa6e8");
        e.globalAlpha = .55 + rand() * .45; e.fillStyle = gg; e.fillRect(px, py, pw, ph); e.globalAlpha = 1;
        e.fillStyle = "rgba(0,0,0,.35)"; e.fillRect(px + pw * .48, py, 2, ph);
        m.fillStyle = "#2a2418"; m.fillRect(px, py, pw, ph);
      } else {
        const gg = m.createLinearGradient(0, py, 0, py + ph);
        gg.addColorStop(0, "#1b2442"); gg.addColorStop(1, "#0a0e1c");
        m.fillStyle = gg; m.fillRect(px, py, pw, ph);
      }
      m.strokeStyle = "rgba(255,255,255,.06)"; m.lineWidth = 2; m.strokeRect(px, py, pw, ph);
    }
  }
  m.fillStyle = "#07090f"; m.fillRect(0, H - ground * ppm, W, ground * ppm);
  return { map: tex(mc), emissiveMap: tex(ec) };
}

function neonTex(text, color, font = 800) {
  const [c, g] = canvas(1024, 256);
  g.font = `${font} 150px "Inter Tight", "Poppins", system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  const fit = Math.min(1, 940 / g.measureText(text).width);
  g.font = `${font} ${Math.round(150 * fit)}px "Inter Tight", "Poppins", system-ui, sans-serif`;
  g.shadowColor = color; g.shadowBlur = 30; g.fillStyle = color; g.fillText(text, 512, 132);
  g.shadowBlur = 0; g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(text, 512, 132);
  return tex(c);
}

export function createScene(canvasEl, S) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: "high-performance" });
  const mobile = matchMedia("(max-width: 760px)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.35 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050812");
  scene.fog = new THREE.FogExp2("#0a1024", 0.0105);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 400);

  const G = glowTex(), ST = streakTex();

  /* sky, moon, stars */
  { const [c, g] = canvas(8, 512); const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, "#02030a"); gr.addColorStop(.55, "#0a1130"); gr.addColorStop(.85, "#1b2350"); gr.addColorStop(1, "#2a2a55");
    g.fillStyle = gr; g.fillRect(0, 0, 8, 512);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(600, 160), new THREE.MeshBasicMaterial({ map: tex(c), fog: false, depthWrite: false }));
    sky.position.set(0, 60, -120); scene.add(sky); }
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: G, color: "#f7f1d6", fog: false, transparent: true, depthWrite: false }));
  moon.scale.set(16, 16, 1); moon.position.set(48, 62, -110); scene.add(moon);
  const moonCore = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff8e0").multiplyScalar(1.4), fog: false, toneMapped: false }));
  moonCore.position.set(48, 62, -109.9); scene.add(moonCore);
  { const n = 700, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (rand() - .5) * 520; p[i * 3 + 1] = 20 + rand() * 110; p[i * 3 + 2] = -118; }
    const gm = new THREE.BufferGeometry(); gm.setAttribute("position", new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(gm, new THREE.PointsMaterial({ color: "#cdd8ff", size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: .8 }))); }

  /* lights */
  scene.add(new THREE.HemisphereLight("#33407a", "#05060a", .55));
  const moonLight = new THREE.DirectionalLight("#7f95d8", .35); moonLight.position.set(30, 50, 20); scene.add(moonLight);

  /* ground: sidewalk, curb, wet road */
  const walk = new THREE.Mesh(new THREE.BoxGeometry(160, .3, 4.4), new THREE.MeshStandardMaterial({ color: "#161b2a", roughness: .55, metalness: .2 }));
  walk.position.set(0, .15, 2.2); scene.add(walk);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(160, .32, .25), new THREE.MeshStandardMaterial({ color: "#2b3350", roughness: .6 }));
  curb.position.set(0, .16, 4.45); scene.add(curb);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), new THREE.MeshStandardMaterial({ color: "#06070d", roughness: .18, metalness: .65 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, 44); scene.add(road);
  for (let x = -76; x < 76; x += 6) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .16), new THREE.MeshBasicMaterial({ color: "#3a4060", transparent: true, opacity: .55 }));
    d.rotation.x = -Math.PI / 2; d.position.set(x, .01, 12); scene.add(d);
  }

  const streaks = [];
  function streak(x, w, color, strength, len = 9) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshBasicMaterial({ map: ST, color, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .02, 4.6 + len / 2); scene.add(m); streaks.push(m); return m;
  }
  function pool(x, z, s, color, op) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * .6), new THREE.MeshBasicMaterial({ map: G, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .32, z); scene.add(m); return m;
  }

  /* neighbour buildings: competitors that are already lit */
  const stores = [];
  const B = [
    { x: -38, w: 10, h: 17, base: ["#151a2c", "#0e1220"], lit: .5 },
    { x: -27, w: 9.5, h: 12.5, base: ["#1a1f33", "#10131f"], lit: .55, sign: "PIZZA", c: "#ff6a4d", glass: "#ffb35c" },
    { x: -17, w: 8.6, h: 9.6, base: ["#1c2238", "#121625"], lit: .45, sign: "DENTAL", c: "#5fd3ff", glass: "#bfe8ff" },
    { x: -8.6, w: 7, h: 14, base: ["#171c2e", "#0f1220"], lit: .4 },
    { x: 8.8, w: 7.4, h: 10.5, base: ["#1b2136", "#111523"], lit: .5, sign: "AUTO SHOP", c: "#8cff7a", glass: "#d8ffc9" },
    { x: 17.6, w: 8.6, h: 14.5, base: ["#181d30", "#0f1220"], lit: .55, sign: "BAKERY", c: "#ff9fdc", glass: "#ffd6a0" },
    { x: 27.2, w: 9.2, h: 11, base: ["#1a2034", "#10131f"], lit: .5, sign: "CAFE", c: "#ffd36b", glass: "#ffc27a" },
    { x: 38, w: 10, h: 16, base: ["#151a2c", "#0e1220"], lit: .45 }
  ];
  const dark = new THREE.MeshStandardMaterial({ color: "#0b0e18", roughness: .9 });
  for (const b of B) {
    const f = facade({ w: b.w, h: b.h, base: b.base, litRatio: b.lit });
    const front = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissiveMap, emissive: "#ffffff", emissiveIntensity: 1.6, roughness: .85 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, 7), [dark, dark, dark, dark, front, dark]);
    mesh.position.set(b.x, b.h / 2, -3.5); scene.add(mesh);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + .5, .45, 7.4), new THREE.MeshStandardMaterial({ color: "#232a44", roughness: .8 }));
    cap.position.set(b.x, b.h + .2, -3.5); scene.add(cap);
    if (b.sign) {
      const gw = b.w - 1.6;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(gw, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.glass).multiplyScalar(.62), toneMapped: false }));
      glass.position.set(b.x, 1.65, .02); scene.add(glass);
      for (let k = -1; k <= 1; k += 2) { const mull = new THREE.Mesh(new THREE.BoxGeometry(.12, 2.6, .08), dark); mull.position.set(b.x + k * gw / 6, 1.65, .06); scene.add(mull); }
      const aw = new THREE.Mesh(new THREE.BoxGeometry(b.w - .6, .14, 1.5), new THREE.MeshStandardMaterial({ color: b.c, roughness: .7, emissive: b.c, emissiveIntensity: .08 }));
      aw.position.set(b.x, 3.25, .65); aw.rotation.x = .28; scene.add(aw);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 1.2, (b.w - 1.2) / 4), new THREE.MeshBasicMaterial({ map: neonTex(b.sign, b.c), transparent: true, toneMapped: false, color: new THREE.Color("#ffffff").multiplyScalar(1.15), depthWrite: false }));
      sg.position.set(b.x, 4.5, .05); scene.add(sg);
      streak(b.x, gw * .9, b.glass, .22); streak(b.x, b.w * .5, b.c, .2, 12);
      pool(b.x, 2.4, gw * 1.3, b.glass, .18);
      stores.push(new THREE.Vector3(b.x, 1.6, .3));
    }
  }
  /* far skyline */
  for (let i = 0; i < 26; i++) {
    const w = 7 + rand() * 10, h = 16 + rand() * 34, x = -110 + i * 8.6 + rand() * 3, z = -26 - rand() * 22;
    const f = facade({ w, h, base: ["#10142a", "#0b0e1c"], litRatio: .22, ground: 0, ppm: 14 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), [dark, dark, dark, dark, new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissiveMap, emissive: "#ffffff", emissiveIntensity: 1.1, roughness: .9 }), dark]);
    m.position.set(x, h / 2, z); scene.add(m);
  }

  /* street lamps */
  for (const x of [-21.8, -4.9, 4.9, 22.4, -33, 33]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 6.2, 12), new THREE.MeshStandardMaterial({ color: "#2b3150", metalness: .6, roughness: .4 }));
    pole.position.set(x, 3.1, 3.7); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.9, .18, .5), new THREE.MeshStandardMaterial({ color: "#39405f", metalness: .5, roughness: .4 }));
    head.position.set(x, 6.2, 3.7); scene.add(head);
    const bulb = new THREE.Mesh(new THREE.PlaneGeometry(.7, .3), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe3a3").multiplyScalar(3), toneMapped: false, side: THREE.DoubleSide }));
    bulb.rotation.x = Math.PI / 2; bulb.position.set(x, 6.1, 3.7); scene.add(bulb);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: G, color: "#ffd98f", transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
    gl.scale.set(4, 4, 1); gl.position.set(x, 6.05, 3.7); scene.add(gl);
    if (Math.abs(x) < 30) { const pl = new THREE.PointLight("#ffcf7a", 34, 15, 2); pl.position.set(x, 5.9, 3.8); scene.add(pl); }
    pool(x, 4.2, 7, "#ffcf7a", .14); streak(x, 1.4, "#ffd98f", .3, 14);
  }

  /* ===== YOUR SHOP ===== */
  const shop = new THREE.Group(); scene.add(shop);
  const SW = 9.2, SH = 11.5;
  { const f = facade({ w: SW, h: SH, base: ["#1d2338", "#121626"], litRatio: 0 });
    const front = new THREE.MeshStandardMaterial({ map: f.map, roughness: .8 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, 7), [dark, dark, dark, dark, front, dark]);
    m.position.set(0, SH / 2, -3.5); shop.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(SW + .6, .5, 7.4), new THREE.MeshStandardMaterial({ color: "#262e4a", roughness: .8 }));
    cap.position.set(0, SH + .22, -3.5); shop.add(cap); }
  /* upstairs windows, lit one by one */
  const upWins = [];
  const cols = 4, cw = (SW - 1.2) / cols;
  for (let r = 0; r < 2; r++) for (let i = 0; i < cols; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(cw * .64, 1.9), new THREE.MeshBasicMaterial({ color: "#141a2e", toneMapped: false }));
    m.position.set(-SW / 2 + .6 + i * cw + cw / 2, 3.8 + .9 + r * 3.3 + .95, .03); shop.add(m); upWins.push({ m, k: (r * cols + i) / 8 });
  }
  const winOff = new THREE.Color("#141a2e"), winOn = new THREE.Color("#ffc35a").multiplyScalar(.95);
  /* storefront */
  const dispMat = new THREE.MeshBasicMaterial({ color: "#10141f", toneMapped: false });
  const dispL = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.6), dispMat); dispL.position.set(-2.65, 1.65, .03); shop.add(dispL);
  const dispR = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.6), dispMat); dispR.position.set(2.65, 1.65, .03); shop.add(dispR);
  const dispOff = new THREE.Color("#10141f"), dispOn = new THREE.Color("#ffd27a").multiplyScalar(.85);
  const doorLight = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.7), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe2a0").multiplyScalar(1.1), toneMapped: false, transparent: true, opacity: 0 }));
  doorLight.position.set(0, 1.65, .01); shop.add(doorLight);
  const doorPivot = new THREE.Group(); doorPivot.position.set(-.75, 0, .06); shop.add(doorPivot);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.7, .08), new THREE.MeshStandardMaterial({ color: "#2a3150", roughness: .5, metalness: .3 }));
  door.position.set(.75, 1.65, 0); doorPivot.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 12), new THREE.MeshStandardMaterial({ color: "#FDB913", metalness: .8, roughness: .3 }));
  knob.position.set(1.3, 1.6, .06); doorPivot.add(knob);
  for (const x of [-4.4, -.9, .9, 4.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.18, 3, .15), dark); p.position.set(x, 1.65, .08); shop.add(p); }
  /* awning in brand yellow */
  { const [c, g] = canvas(512, 64); for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#e0a312" : "#b5800c"; g.fillRect(i * 32, 0, 32, 64); }
    const aw = new THREE.Mesh(new THREE.BoxGeometry(SW - .4, .14, 1.6), new THREE.MeshStandardMaterial({ map: tex(c), roughness: .7, emissive: "#FDB913", emissiveIntensity: 0 }));
    aw.position.set(0, 3.3, .7); aw.rotation.x = .28; shop.add(aw); S._awning = aw; }
  /* sign board, text typed by Sakshi */
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.45, .3), new THREE.MeshStandardMaterial({ color: "#0d1120", roughness: .5, metalness: .4 }));
  signBoard.position.set(0, 4.55, .1); shop.add(signBoard);
  const [sc, sg] = canvas(1536, 288); const signTex = tex(sc);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, depthWrite: false });
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 7.3 * 288 / 1536), signMat); signFace.position.set(0, 4.55, .27); shop.add(signFace);
  let signText = "YOUR BUSINESS", signShown = -1, signLitShown = -1;
  function drawSign(n, lit) {
    sg.clearRect(0, 0, 1536, 288);
    const txt = signText.slice(0, n);
    sg.textAlign = "center"; sg.textBaseline = "middle";
    let fs = 150; sg.font = `800 ${fs}px "Inter Tight", "Poppins", system-ui, sans-serif`;
    const full = sg.measureText(signText).width; if (full > 1420) { fs = Math.floor(fs * 1420 / full); sg.font = `800 ${fs}px "Inter Tight", "Poppins", system-ui, sans-serif`; }
    const offX = 768 - sg.measureText(signText).width / 2;
    sg.textAlign = "left";
    if (lit > 0) { sg.shadowColor = "#FDB913"; sg.shadowBlur = 40 * lit; }
    sg.fillStyle = lit > 0 ? "#FDB913" : "#3a4466";
    sg.fillText(txt, offX, 150);
    if (lit > 0) { sg.shadowBlur = 0; sg.fillStyle = `rgba(255,248,220,${.75 * lit})`; sg.fillText(txt, offX, 150); }
    if (n > 0 && n < signText.length) { const cx = offX + sg.measureText(txt).width + 10; sg.fillStyle = "#FDB913"; sg.fillRect(cx, 150 - fs * .42, 12, fs * .84); }
    if (n === 0 && lit === 0) { sg.fillStyle = "#2c3352"; sg.fillText(signText, offX, 150); }
    signTex.needsUpdate = true;
  }
  /* Sam: scan plane, wireframe, problem markers */
  const scanMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#4ee6ff").multiplyScalar(3), toneMapped: false, transparent: true, opacity: 0, depthWrite: false });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(SW + 1.2, .07), scanMat); scan.position.set(0, SH, .4); shop.add(scan);
  const scanGlowMat = new THREE.MeshBasicMaterial({ map: G, color: "#36d6ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const scanGlow = new THREE.Mesh(new THREE.PlaneGeometry(SW + 3, 2.2), scanGlowMat); scanGlow.position.set(0, SH, .35); shop.add(scanGlow);
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SW + .05, SH + .05, 7.05)), new THREE.LineBasicMaterial({ color: new THREE.Color("#4ee6ff").multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false }));
  wire.position.set(0, SH / 2, -3.5); shop.add(wire);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH, 12, 14), new THREE.MeshBasicMaterial({ color: "#4ee6ff", wireframe: true, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  grid.position.set(0, SH / 2, .2); shop.add(grid);
  function markerTex(ok) {
    const [c, g] = canvas(128, 128); g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.fillStyle = ok ? "#13c97a" : "#ff3b55"; g.fill();
    g.lineWidth = 8; g.strokeStyle = "rgba(255,255,255,.9)"; g.stroke();
    g.strokeStyle = "#fff"; g.lineWidth = 12; g.lineCap = "round"; g.beginPath();
    if (ok) { g.moveTo(42, 66); g.lineTo(58, 82); g.lineTo(88, 48); } else { g.moveTo(64, 38); g.lineTo(64, 70); g.moveTo(64, 90); g.lineTo(64, 91); }
    g.stroke(); return tex(c);
  }
  const mBad = markerTex(false), mOk = markerTex(true);
  const markers = [[-3.1, 9.6], [2.4, 6.3], [-1.2, 7.6], [3.4, 10.4], [-2.6, 2.2], [1.9, 1.3], [0, 4.6]].map(([x, y]) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mBad, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    s.scale.set(.85, .85, 1); s.position.set(x, y, .7); shop.add(s); return { s, y };
  });
  /* Manav: map pin, beam, shockwave ring */
  const pin = new THREE.Group(); shop.add(pin);
  { const red = new THREE.MeshStandardMaterial({ color: "#ff2d4a", emissive: "#ff2d4a", emissiveIntensity: .9, roughness: .35, metalness: .2 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.15, 40, 32), red); head.position.y = 1.9; pin.add(head);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 40), red); tip.rotation.x = Math.PI; tip.position.y = .55; pin.add(tip);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(.45, 24, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").multiplyScalar(1.6), toneMapped: false })); dot.position.set(0, 1.95, .85); pin.add(dot); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.12, .5, 12, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#ff4d63", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(0, SH + 6, -1.5); shop.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.9, 1.1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff4d63").multiplyScalar(2), transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, .34, 2.4); shop.add(ring);
  const ring2 = ring.clone(); ring2.material = ring.material.clone(); shop.add(ring2);
  /* Jyoti: warm spill on the sidewalk */
  const spot = new THREE.SpotLight("#ffc96b", 0, 16, .95, .6, 1.6); spot.position.set(0, 3.2, 1.5); spot.target.position.set(0, 0, 4); shop.add(spot, spot.target);
  const inner = new THREE.PointLight("#ffcf7a", 0, 10, 2); inner.position.set(0, 2.2, 1.2); shop.add(inner);
  const spill = pool(0, 2.6, 12, "#ffcf6a", 0);
  const shopStreakA = streak(0, 7, "#ffcf6a", 0, 12);
  const shopStreakB = streak(0, 6, "#FDB913", 0, 14);

  /* ===== search signals: people searching on their phones ===== */
  const N = mobile ? 70 : 120;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), alp = new Float32Array(N);
  const sig = [];
  const door3 = new THREE.Vector3(0, 1.5, .4);
  function respawn(s, t0) {
    s.a = new THREE.Vector3((rand() - .5) * 64, .6 + rand() * .6, 5 + rand() * 12);
    s.comp = stores[Math.floor(rand() * stores.length)].clone().add(new THREE.Vector3((rand() - .5) * 3, rand() * .8, 0));
    s.h = 2.5 + rand() * 6; s.t = t0 ?? 0; s.sp = .1 + rand() * .12;
  }
  for (let i = 0; i < N; i++) { const s = { r: rand() }; respawn(s, rand()); sig.push(s); }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  sgeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  sgeo.setAttribute("alpha", new THREE.BufferAttribute(alp, 1));
  const smat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uSize: { value: mobile ? 40 : 52 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute vec3 color; attribute float alpha; varying vec3 vC; varying float vA; uniform float uSize; uniform float uPx;
      void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=uSize*uPx/(-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); a=a*a; gl_FragColor=vec4(vC*2.4, a*vA); }`
  });
  scene.add(new THREE.Points(sgeo, smat));
  const cCyan = new THREE.Color("#8fe6ff"), cGold = new THREE.Color("#ffd24a");
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

  /* cars passing */
  const cars = [];
  function car(color, lane, dir, speed, off) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, .9, 1.9), new THREE.MeshStandardMaterial({ color, metalness: .7, roughness: .3 }));
    body.position.y = .75; g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, .7, 1.7), new THREE.MeshStandardMaterial({ color: "#0b0f1c", metalness: .8, roughness: .2 }));
    top.position.set(-.2, 1.5, 0); g.add(top);
    const hl = new THREE.Mesh(new THREE.PlaneGeometry(.5, .2), new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff6d6").multiplyScalar(4), toneMapped: false }));
    hl.position.set(2.11, .85, .6); hl.rotation.y = Math.PI / 2; g.add(hl); const hl2 = hl.clone(); hl2.position.z = -.6; g.add(hl2);
    const tl = new THREE.Mesh(new THREE.PlaneGeometry(.4, .16), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2a3a").multiplyScalar(3), toneMapped: false }));
    tl.position.set(-2.11, .9, .6); tl.rotation.y = -Math.PI / 2; g.add(tl); const tl2 = tl.clone(); tl2.position.z = -.6; g.add(tl2);
    const beamC = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), new THREE.MeshBasicMaterial({ map: G, color: "#fff1c4", transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beamC.rotation.x = -Math.PI / 2; beamC.position.set(6.4, .03, 0); g.add(beamC);
    if (dir < 0) g.rotation.y = Math.PI;
    g.position.set(0, 0, lane); scene.add(g); cars.push({ g, dir, speed, off });
  }
  car("#3a4a86", 9.5, 1, 9, 0); car("#7a2f44", 14.5, -1, 7, 40);

  /* composer with bloom */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .72, .5, .72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let W = 1, H = 1, viewX = 0, viewY = 0;
  function resize() {
    W = canvasEl.clientWidth; H = canvasEl.clientHeight;
    renderer.setSize(W, H, false); composer.setSize(W, H);
    bloom.resolution.set(W / 2, H / 2);
    camera.aspect = W / H;
    camera.fov = camera.aspect < .8 ? 58 : camera.aspect < 1.2 ? 48 : 36;
    const desk = W > 760;
    viewX = desk ? -W * .17 : 0; viewY = desk ? 0 : H * .06;
    camera.setViewOffset(W, H, viewX, viewY, W, H);
    camera.updateProjectionMatrix();
    smat.uniforms.uPx.value = renderer.getPixelRatio();
  }
  resize();

  const look = new THREE.Vector3(), mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener("pointermove", e => { mouse.tx = (e.clientX / innerWidth - .5); mouse.ty = (e.clientY / innerHeight - .5); }, { passive: true });

  let last = performance.now();
  function render(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
    mouse.x += (mouse.tx - mouse.x) * .04; mouse.y += (mouse.ty - mouse.y) * .04;
    camera.position.set(S.cx + mouse.x * 1.2, S.cy - mouse.y * .6, S.cz);
    look.set(S.lx, S.ly, S.lz); camera.lookAt(look);

    /* Sam */
    const scanY = SH + .6 - S.scan * (SH + 1.2);
    scan.position.y = scanY; scanGlow.position.y = scanY;
    const scanOn = S.scan > .001 && S.scan < .999 ? 1 : 0;
    scanMat.opacity = scanOn; scanGlowMat.opacity = .55 * scanOn;
    wire.material.opacity = S.wire * .9; grid.material.opacity = S.wire * .16;
    for (const mk of markers) {
      const passed = scanY < mk.y;
      mk.s.material.map = passed ? mOk : mBad;
      mk.s.material.opacity = S.wire * (passed ? (1 - S.fixed) : 1);
      mk.s.scale.setScalar(.85 + (passed ? .15 : Math.sin(t * 6 + mk.y) * .06));
    }
    dispMat.color.copy(dispOff).lerp(dispOn, S.fixed);
    /* Sakshi */
    const n = Math.round(S.sign * signText.length), lit = Math.round(S.signLit * 20) / 20;
    if (n !== signShown || lit !== signLitShown) { signShown = n; signLitShown = lit; drawSign(n, lit); }
    S._awning.material.emissiveIntensity = .25 * S.signLit;
    /* Manav */
    pin.position.set(0, SH + 1.4 + (1 - S.pin) * 30 + Math.sin(t * 2) * .12 * S.pin, -1.5);
    pin.rotation.y = t * .8; pin.visible = S.pin > .01;
    beam.material.opacity = .35 * S.ring;
    const r1 = S.ring, r2 = (t * .45) % 1;
    ring.scale.setScalar(1 + r1 * 9); ring.material.opacity = (1 - r1) * (S.pin > .99 ? 1 : 0);
    ring2.scale.setScalar(1 + r2 * 7); ring2.material.opacity = (1 - r2) * .3 * S.ring * (1 - S.door * .7);
    /* Jyoti */
    doorPivot.rotation.y = -1.35 * smooth(S.door);
    doorLight.material.opacity = S.door;
    spot.intensity = 26 * S.door; inner.intensity = 10 * S.door;
    spill.material.opacity = .1 * S.fixed + .32 * S.door;
    shopStreakA.material.opacity = .14 * S.fixed + .3 * S.door;
    shopStreakB.material.opacity = .28 * S.signLit;
    for (const w of upWins) { const k = clamp((S.lit - w.k * .8) * 4, 0, 1); w.m.material.color.copy(winOff).lerp(winOn, k); }
    /* signals */
    for (let i = 0; i < N; i++) {
      const s = sig[i]; s.t += dt * s.sp; if (s.t >= 1) respawn(s, 0);
      const toShop = s.r < S.attract;
      const target = toShop ? door3 : s.comp;
      const u = s.t;
      tmpA.copy(s.a).lerp(target, .5); tmpA.y += s.h;
      tmpB.copy(s.a).multiplyScalar((1 - u) * (1 - u)).addScaledVector(tmpA, 2 * u * (1 - u)).addScaledVector(target, u * u);
      pos[i * 3] = tmpB.x; pos[i * 3 + 1] = tmpB.y; pos[i * 3 + 2] = tmpB.z;
      const c = toShop ? cGold : cCyan; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      alp[i] = Math.sin(Math.PI * u) * S.sig;
    }
    sgeo.attributes.position.needsUpdate = true; sgeo.attributes.color.needsUpdate = true; sgeo.attributes.alpha.needsUpdate = true;
    for (const c of cars) { const x = ((t * c.speed + c.off) % 140) - 70; c.g.position.x = c.dir > 0 ? x : -x; }
    composer.render();
  }

  const v = new THREE.Vector3();
  function project(x, y, z) {
    v.set(x, y, z).project(camera);
    return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z < 1];
  }
  return {
    render, resize, project,
    setSign(text) { signText = text; signShown = -1; },
    anchors: { stores, sign: [0, 4.55, .3], pin: [0, SH + 3.6, -1.5], door: [0, 2.2, .4], street: () => sig.slice(0, 12).map(s => s.a) },
    renderer
  };
}
