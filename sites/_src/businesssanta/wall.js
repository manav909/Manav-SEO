/* Live wallpaper: slow, silky flowing light (domain-warped noise) drawn by the GPU.
   Palette follows the visitor's time of day. S.warm adds gold as the story succeeds,
   S.lit adds sheen, S.cz drifts the flow as the page scrolls. */
const PAL = {
  night: ["#040716", "#143077", "#55309a", "#f2a51f", "#ffe9b8"],
  dusk: ["#160b24", "#4c2468", "#d4527c", "#ffa45e", "#ffe3c2"],
  day: ["#fbf4e8", "#ffdab0", "#b9d5ff", "#ffc747", "#ffffff"]
};
const VS = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FS = `precision mediump float;
uniform vec2 r;uniform float t,warm,lit,scr,day;uniform vec2 m;uniform vec3 c0,c1,c2,c3,c4;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
 vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
 float T=t*.028;
 p+=m*.04; p.y-=scr*.22;
 vec2 q=vec2(fbm(p*1.1+vec2(0.,T)),fbm(p*1.1+vec2(5.2,1.3)-T));
 vec2 w=vec2(fbm(p*1.35+1.9*q+vec2(1.7,9.2)+T*1.2),fbm(p*1.35+1.9*q+vec2(8.3,2.8)-T*.9));
 float f=fbm(p*1.2+2.1*w);
 vec3 col=mix(c0,c1,smoothstep(.12,.58,f));
 col=mix(col,c2,smoothstep(.38,.9,w.y)*.85);
 float g=smoothstep(.42,.95,f+.3*q.x);
 col=mix(col,c3,g*g*(.55+.45*warm));
 float rib=.5+.5*sin(f*7.+w.x*4.-T*5.);
 col+=c4*pow(rib,8.)*(.12+.18*lit)*(1.-.6*day);
 col+=c4*pow(g,5.)*.3*(.4+.6*warm)*(1.-.5*day);
 float v=length(p*vec2(.75,1.));
 col*=mix(1.,mix(.72,.97,day),smoothstep(.3,1.2,v));
 gl_FragColor=vec4(col,1.);
}`;
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
export function createNight(canvas, S, mode = "night") {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power", preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: true });
  if (!gl) throw new Error("no hardware webgl");
  /* only animate on a real graphics chip; software rendering keeps the still gradient */
  const dbg = gl.getExtension("WEBGL_debug_renderer_info"), ren = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  if (/swiftshader|llvmpipe|software|basic render|softpipe/i.test(ren)) throw new Error("software webgl");
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ["r", "t", "warm", "lit", "scr", "day", "m", "c0", "c1", "c2", "c3", "c4"].forEach(k => U[k] = gl.getUniformLocation(pr, k));
  (PAL[mode] || PAL.night).forEach((c, i) => gl.uniform3fv(U["c" + i], rgb(c)));
  gl.uniform1f(U.day, mode === "day" ? 1 : 0);
  let mx = 0, my = 0, tx = 0, ty = 0;
  function resize() {
    const q = canvas.clientWidth < 760 ? .5 : .55;
    canvas.width = Math.max(2, Math.round(canvas.clientWidth * q)); canvas.height = Math.max(2, Math.round(canvas.clientHeight * q));
    gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(U.r, canvas.width, canvas.height);
  }
  const t0 = performance.now();
  function render(now) {
    mx += (tx - mx) * .03; my += (ty - my) * .03;
    gl.uniform1f(U.t, (now - t0) / 1000 + 40); gl.uniform1f(U.warm, S.warm); gl.uniform1f(U.lit, S.lit); gl.uniform1f(U.scr, S.cz / 7);
    gl.uniform2f(U.m, mx, my); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  resize();
  return { render, resize, look(x, y) { tx = x; ty = -y; } };
}
