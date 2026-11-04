/* A US main street at dusk, shot like a photo with a shallow depth of field:
   shop windows and street lamps become soft bokeh, cars pass (headlights left,
   taillights right, as on a US street), the wet road reflects the lights.
   S.lit turns shop lights on, S.warm lights up "your" shop, S.focus racks focus. */
export function createNight(canvas, S, mode = "night") {
  const DAY = mode === "day", DUSK = mode === "dusk";
  const ctx = canvas.getContext("2d", { alpha: false });
  const low = document.createElement("canvas"), lx = low.getContext("2d");
  let W = 0, H = 0, D = 1, F = 1, vpx = 0, vpy = 0, sky = null, road = null, glowG = null;
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const sprite = (r, g, b, rim) => {
    const s = 128, c = document.createElement("canvas"); c.width = c.height = s;
    const x = c.getContext("2d"), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    const k = a => `rgba(${r},${g},${b},${a})`;
    if (rim) { gr.addColorStop(0, k(.42)); gr.addColorStop(.7, k(.5)); gr.addColorStop(.88, k(.72)); gr.addColorStop(.96, k(.25)); gr.addColorStop(1, k(0)); }
    else { gr.addColorStop(0, k(1)); gr.addColorStop(.12, k(.85)); gr.addColorStop(.3, k(.28)); gr.addColorStop(.6, k(.07)); gr.addColorStop(1, k(0)); }
    x.fillStyle = gr; x.fillRect(0, 0, s, s); return c;
  };
  const COL = { warm: [255, 178, 102], cream: [255, 220, 168], sodium: [255, 150, 70], cool: [196, 214, 255], red: [255, 48, 44], white: [255, 244, 228], pink: [255, 92, 146], teal: [88, 224, 214], yellow: [253, 185, 19], green: [84, 250, 150], amber: [255, 200, 60] };
  const SP = {}; for (const k in COL) SP[k] = { rim: sprite(...COL[k], 1), glow: sprite(...COL[k], 0) };

  /* the street: buildings on both sides, shop windows, upper floors, lamps */
  const L = [], B = [];
  for (const side of [-1, 1]) {
    let z = 4.5 + rnd() * 2;
    while (z < 170) {
      const len = 7 + rnd() * 11, h = 8 + rnd() * 16;
      B.push({ side, z0: z, z1: z + len, h, tone: rnd(), aw: rnd() * 5 | 0, fc: rnd() * 6 | 0 });
      const isMe = side > 0 && z < 17 && z + len > 13;
      const col = rnd() < .14 ? (rnd() < .5 ? "pink" : "teal") : (rnd() < .55 ? "warm" : "cream");
      const n = 2 + (rnd() * 3 | 0);
      if (!isMe) for (let i = 0; i < n; i++) L.push({ x: side * 6.05, y: .9 + rnd() * 1.7, z: z + (i + .5) * len / n, r: .34 + rnd() * .26, c: col, t: rnd() * .95, b: .75 + rnd() * .45, refl: .5 });
      if (!isMe && rnd() < .55) L.push({ x: side * 5.95, y: 3.3 + rnd() * .4, z: z + len * (.3 + rnd() * .4), r: .38, c: rnd() < .35 ? "pink" : rnd() < .5 ? "amber" : "warm", t: rnd(), b: 1 });
      for (let fl = 5; fl < h - 1; fl += 3.2) for (let i = 0; i < 3; i++) if (rnd() < .33) L.push({ x: side * 6.15, y: fl + rnd() * .6, z: z + (i + .5) * len / 3, r: .3, c: rnd() < .6 ? "cream" : "cool", t: .15 + rnd() * .85, b: .3 + rnd() * .3 });
      z += len + .3 + rnd();
    }
  }
  if (innerWidth < 760) for (let i = L.length - 1; i >= 0; i--) if (L[i].z > 125 || (L[i].y > 4.5 && L[i].t >= 0 && rnd() < .5)) L.splice(i, 1);
  for (let z = 7; z < 170; z += 17) for (const side of [-1, 1]) L.push({ x: side * 4.7, y: 6.3, z: z + (side > 0 ? 8.5 : 0), r: .5, c: "sodium", t: -1, b: 1.15, refl: 1 });
  L.push({ x: 2.6, y: 5.3, z: 58, r: .32, c: "green", t: -1, b: 1, refl: 1 });
  L.push({ x: -2.6, y: 5.3, z: 104, r: .3, c: "red", t: -1, b: .8, refl: 1 });
  /* "your" shop on the right: dark at first, glowing when it works */
  const ME = [];
  for (let i = 0; i < 6; i++) ME.push({ x: 6.05, y: 1 + (i % 2) * 1.05, z: 13.6 + (i >> 1) * 1.25, r: .44, c: "cream", b: 1.3, refl: .7 });
  ME.push({ x: 5.95, y: 3.45, z: 14.9, r: .62, c: "yellow", b: 1.7, refl: .4 });
  ME.push({ x: 5.95, y: 3.45, z: 15.9, r: .5, c: "yellow", b: 1.4 });
  const CARS = []; for (let i = 0; i < 8; i++) CARS.push({ dir: i % 2 ? 1 : -1, z: 5 + rnd() * 160, v: 7 + rnd() * 6 });

  let camX = 0, camY = 1.65, tx = 0, ty = 0;
  function resize() {
    D = canvas.clientWidth < 760 ? .7 : Math.min(devicePixelRatio || 1, 1.25);
    W = Math.round(canvas.clientWidth * D); H = Math.round(canvas.clientHeight * D);
    canvas.width = W; canvas.height = H;
    const mob = canvas.clientWidth < 760;
    F = Math.min(H * .95, W * (mob ? 1.6 : 1.05)); vpx = W * (mob ? .5 : .62); vpy = H * (mob ? .5 : .56);
    low.width = Math.max(2, W / 6 | 0); low.height = Math.max(2, H / 6 | 0);
    const lh = low.height;
    sky = lx.createLinearGradient(0, 0, 0, lh);
    const SK = DAY ? [[0, "#6fa9e6"], [.3, "#9fc8f2"], [.47, "#d6e8f7"], [.55, "#f6ecdc"], [.6, "#e9e2d6"], [1, "#d8d2c8"]]
      : DUSK ? [[0, "#161c40"], [.28, "#3d3466"], [.44, "#a35577"], [.52, "#ee8f66"], [.57, "#ffc183"], [.6, "#3a2632"], [1, "#120d16"]]
      : [[0, "#03050b"], [.3, "#081024"], [.47, "#1a1a35"], [.55, "#3a2838"], [.6, "#2a1e2a"], [1, "#06070c"]];
    SK.forEach(([o, c]) => sky.addColorStop(o, c));
    road = lx.createLinearGradient(0, lh * .56, 0, lh);
    if (DAY) { road.addColorStop(0, "#a9a49c"); road.addColorStop(.3, "#7c7973"); road.addColorStop(1, "#57554f"); }
    else if (DUSK) { road.addColorStop(0, "#5a3f4a"); road.addColorStop(.25, "#241a24"); road.addColorStop(1, "#100c12"); }
    else { road.addColorStop(0, "#1a1720"); road.addColorStop(.25, "#0d0e15"); road.addColorStop(1, "#07080d"); }
  }
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function proj(x, y, z) { const zz = z - S.cz; if (zz < .5) return null; return [vpx + (x - camX) / zz * F, vpy - (y - camY) / zz * F, zz]; }
  function light(x, y, z, r, c, a, refl) {
    const p = proj(x, y, z); if (!p || a <= .003) return;
    const [sx, sy, zz] = p;
    const sharp = r / zz * F, coc = .42 * Math.abs(1 / zz - 1 / S.focus) * F;
    const fade = sm(1.5, 9, zz) * (1 - sm(120, 165, zz));
    if (coc > sharp * 1.15) {
      const rad = Math.max(coc, sharp);
      if (sx + rad < 0 || sx - rad > W || sy + rad < 0 || sy - rad > H) return;
      const al = a * fade * Math.min(1, Math.pow((sharp + 1.6 * D) / rad, .7)) * 1.35;
      ctx.globalAlpha = Math.min(1, al); ctx.drawImage(SP[c].rim, sx - rad, sy - rad, rad * 2, rad * 2);
      if (refl && rad < 46 * D) { const q = proj(x, -y, z); if (q && q[1] < H + rad) { ctx.globalAlpha = Math.min(1, al * .22 * refl); ctx.drawImage(SP[c].rim, q[0] - rad * .8, q[1] - rad * 2.2, rad * 1.6, rad * 4.4); } }
    } else {
      const rad = Math.max(sharp, coc, 1.2 * D) * 2.6;
      if (sx + rad < 0 || sx - rad > W || sy + rad < 0 || sy - rad > H) return;
      ctx.globalAlpha = Math.min(1, a * fade * 1.25); ctx.drawImage(SP[c].glow, sx - rad, sy - rad, rad * 2, rad * 2);
      if (refl) { const q = proj(x, -y, z); if (q) { ctx.globalAlpha = Math.min(1, a * fade * .3 * refl); ctx.drawImage(SP[c].glow, q[0] - rad * .7, q[1] - rad * 2.4, rad * 1.4, rad * 4.8); } }
    }
  }
  function backdrop() {
    const lw = low.width, lh = low.height, s = 1 / 6;
    lx.globalAlpha = 1; lx.fillStyle = sky; lx.fillRect(0, 0, lw, lh);
    const gx = vpx * s, gy = vpy * s;
    glowG = lx.createRadialGradient(gx, gy, 0, gx, gy, lh * .5);
    const ga = DAY ? .18 : DUSK ? .35 : .22 + .12 * S.warm;
    glowG.addColorStop(0, DAY ? `rgba(255,250,235,${ga})` : `rgba(255,170,110,${ga})`); glowG.addColorStop(1, "rgba(255,170,110,0)");
    lx.fillStyle = glowG; lx.fillRect(0, 0, lw, lh);
    /* road */
    const a = proj(-6, 0, 1.2), b = proj(6, 0, 1.2), c = proj(6, 0, 170), d = proj(-6, 0, 170);
    if (a && b && c && d) { lx.fillStyle = road; lx.beginPath(); lx.moveTo(a[0] * s, a[1] * s); lx.lineTo(b[0] * s, b[1] * s); lx.lineTo(c[0] * s, c[1] * s); lx.lineTo(d[0] * s, d[1] * s); lx.fill(); }
    /* building faces */
    for (let i = B.length - 1; i >= 0; i--) {
      const k = B[i], x = k.side * 6.25;
      const z0 = Math.max(k.z0, S.cz + .6), z1 = k.z1; if (z1 <= z0) continue;
      const p0 = proj(x, 0, z0), p1 = proj(x, k.h, z0), p2 = proj(x, k.h, z1), p3 = proj(x, 0, z1);
      const fc = FAC[k.fc], sh = DAY ? (k.side < 0 ? .92 : 1) : DUSK ? .3 : 0;
      if (DAY || DUSK) lx.fillStyle = `rgb(${fc[0] * sh + 14 | 0},${fc[1] * sh + 10 | 0},${fc[2] * sh + 18 | 0})`;
      else { const t = 7 + k.tone * 6 | 0; lx.fillStyle = `rgb(${t},${t + 2},${t + 9})`; }
      lx.beginPath(); lx.moveTo(p0[0] * s, p0[1] * s); lx.lineTo(p1[0] * s, p1[1] * s); lx.lineTo(p2[0] * s, p2[1] * s); lx.lineTo(p3[0] * s, p3[1] * s); lx.fill();
      /* shop window and awning */
      const za = z0 + .5, zb = z1 - .5; if (zb <= za) continue;
      quad(x * .995, .5, 2.6, za, zb, DAY ? "rgba(120,150,175,.85)" : DUSK ? "rgba(40,30,44,.9)" : "rgba(14,15,22,.9)", s);
      const aw = AWN[k.aw], ad = DAY ? 1 : DUSK ? .45 : .22;
      quad(x * .985, 2.7, 3.25, za, zb, `rgb(${aw[0] * ad | 0},${aw[1] * ad | 0},${aw[2] * ad | 0})`, s);
      if (DAY) for (let fl = 4.6; fl < k.h - 1.2; fl += 3.2) quad(x * .997, fl, fl + 1.4, za + .4, zb - .4, "rgba(70,80,95,.55)", s);
    }
    if (DAY) { lx.fillStyle = "rgba(244,240,232,.22)"; lx.fillRect(0, 0, lw, lh); }
    if (S.warm > .01) { const k = 6.25 * .98; quad(k, 2.7, 3.3, 13.2, 17, `rgba(253,185,19,${(DAY ? .9 : .7) * S.warm})`, s); }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true; ctx.drawImage(low, 0, 0, W, H);
  }
  const FAC = [[178, 104, 82], [201, 160, 120], [226, 214, 190], [150, 92, 74], [196, 178, 150], [128, 136, 148]];
  const AWN = [[178, 34, 44], [31, 95, 74], [34, 53, 94], [200, 137, 43], [107, 59, 42]];
  function quad(x, y0, y1, z0, z1, col, s) {
    const a = proj(x, y0, z0), b = proj(x, y1, z0), c = proj(x, y1, z1), d = proj(x, y0, z1); if (!a || !d) return;
    lx.fillStyle = col; lx.beginPath(); lx.moveTo(a[0] * s, a[1] * s); lx.lineTo(b[0] * s, b[1] * s); lx.lineTo(c[0] * s, c[1] * s); lx.lineTo(d[0] * s, d[1] * s); lx.fill();
  }
  let lastT = 0;
  function render(now, still) {
    const dt = lastT ? Math.min(.05, (now - lastT) / 1000) : 0; lastT = now;
    camX += (tx - camX) * .04; camY += (1.65 + ty - camY) * .04;
    backdrop();
    ctx.globalCompositeOperation = "lighter";
    for (const l of L) {
      let on = l.t < 0 ? 1 : sm(0, .14, S.lit - l.t);
      if (DAY) on = l.t < 0 ? 0 : 0; else if (DUSK && l.t >= 0) on *= .8;
      if (on > 0) light(l.x, l.y, l.z, l.r, l.c, l.b * on, l.refl);
    }
    const mw = S.warm;
    if (mw > 0) for (const l of ME) light(l.x, l.y, l.z, l.r, l.c, l.b * mw * (DAY ? .4 : 1), l.refl);
    else if (!DAY) for (const l of ME.slice(0, 2)) light(l.x, l.y, l.z, l.r, "cool", .12, 0);
    for (const c of CARS) {
      if (!still) c.z += c.dir * c.v * dt * (c.dir < 0 ? 1.4 : 1);
      if (c.z < S.cz + .8) c.z = 168; if (c.z > 170) c.z = S.cz + 4;
      const x = c.dir < 0 ? -1.9 : 1.9, col = c.dir < 0 ? "white" : "red", b = (c.dir < 0 ? 1.1 : .95) * (DAY ? .28 : 1);
      light(x - .72, .72, c.z, .2, col, b, 1); light(x + .72, .72, c.z, .2, col, b, 1);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }
  resize();
  return { render, resize, look(nx, ny) { tx = nx * .8; ty = ny * .35; } };
}
