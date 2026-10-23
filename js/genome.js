// Aeroscape genome: a flat parameter vector that fully describes a scene,
// archetype generators modelled on the Perfect Hue wallpaper set, mutation,
// hybridisation, and the Evolver that morphs one genome into the next.

// ---------------------------------------------------------------- schema
// group name default kind sigma lo hi      (kind: f float, c colour, d discrete, r rate)
const SPEC = `
cam camTX 0 f .3 - -
cam camTY 0 f .2 - -
cam camTZ 0 f .3 - -
cam camDist 8 f .7 1.5 30
cam camYaw 0 f .12 - -
cam camPitch .08 f .04 -1.3 1.4
cam camZoom 1.7 f .15 .7 4
cam camRoll 0 f .03 -.5 .5
cam camOrbit 0 r .003 - -
cam camDrift .3 f .1 0 1
cam camTravel 0 r 0 - -
env skyTop .02,.1,.4 c
env skyHor .5,.7,.9 c
env skyBot .1,.2,.35 c
env skyCurve .8 f .15 .2 3
env sunYaw 0 f .12 - -
env sunElev .25 f .05 -1.5 1.5
env sunCol 1,.9,.75 c
env sunInt 1.5 f .3 0 12
env sunSize 1 f .2 .1 3
env stars 0 f .1 0 1
env fogDen .008 f .003 0 .2
cloud cloudAmt 0 f .1 0 1
cloud cloudScale 1 f .2 .2 4
cloud cloudCol 1,1,1 c
cloud windSpeed .01 r .003 - -
glow glowAmt 0 f .2 0 4
glow glowColA .1,.3,1 c
glow glowColB .1,1,.5 c
glow glowAX .5 f .2 - -
glow glowAY .15 f .1 - -
glow glowBX -.6 f .2 - -
glow glowBY -.05 f .1 - -
glow glowSize 1 f .2 .2 4
flr flrW 0 f 0 0 1
flr flrY -1.5 f .12 - -
flr waterCol .01,.08,.15 c
flr waveAmp .3 f .06 0 2
flr waveScale 1 f .2 .1 5
flr waveSpeed .4 r .08 - -
flr mirror 0 f .1 0 1
flr caustic .3 f .1 0 2
grid gridAmt 0 f .1 0 3
grid gridCol .2,.6,1 c
grid gridScale 1 f .2 .1 6
rip ripAmt 0 f .2 0 4
rip ripX 0 f .3 - -
rip ripZ 0 f .3 - -
rip ripFreq 5 f 1 .5 20
rip ripSpeed 1.5 r .2 - -
rip ripSpread 0 f .3 0 8
ter terW 0 f 0 0 1
ter terAmp 1 f .2 0 8
ter terScale .15 f .02 .01 1
ter terNear 0 f 1 0 60
ter terRidge 0 f .1 0 1
ter terCol .1,.4,.05 c
ter terCol2 .05,.2,.02 c
ter terIsland 0 f .15 0 5
ter terSink 0 f .1 - -
rib ribW 0 f 0 0 1
rib ribCount 3 f .6 0 6
rib ribX 0 f .3 - -
rib ribY 0 f .2 - -
rib ribZ 0 f .3 - -
rib ribYaw 0 f .12 - -
rib ribRoll 0 f .06 - -
rib ribAmp .8 f .15 0 4
rib ribFreq .45 f .05 .05 2
rib ribSpread .5 f .1 0 3
rib ribVert .3 f .15 - -
rib ribFan 0 f .04 - -
rib ribDepth .4 f .1 0 3
rib ribTwist .15 f .05 - -
rib ribAngle 0 f .12 - -
rib ribTwistPh .3 f .1 - -
rib ribWidth .6 f .1 .02 5
rib ribThick .025 f .006 .003 .5
rib ribJitter .3 f .1 0 1
rib ribPhaseOff .5 f .15 - -
rib ribSpeed .08 r .02 - -
rib ribColA .1,.5,1 c
rib ribColB .1,1,.6 c
rib ribHue 0 f .05 - -
rib ribGlass .8 f .08 0 1
rib ribGlow 0 f .15 0 8
rib ribIrid 0 f .1 0 1
rib ribLines 0 f .1 0 3
rib ribLineN 12 f 3 1 60
rib ribEdge .5 f .15 0 3
rib ribDots 0 f .1 0 2
rib ribSeed 1 d
sph sphW 0 f 0 0 1
sph sphCount 5 f 1 0 12
sph sphX 0 f .3 - -
sph sphY 0 f .2 - -
sph sphZ 0 f .3 - -
sph sphSpread 2 f .3 0 8
sph sphSize .4 f .06 .02 3
sph sphVar .5 f .1 0 1
sph sphBob .5 f .1 0 3
sph sphSpeed .2 r .05 - -
sph sphCenter0 0 f 0 0 1
sph sphCol .5,.8,1 c
sph sphGlass .9 f .05 0 1
sph sphIrid .2 f .1 0 1
sph sphSeed 1 d
shd shdW 0 f 0 0 1
shd shdCount 16 f 2 0 24
shd shdX 0 f .3 - -
shd shdY 0 f .2 - -
shd shdZ 0 f .3 - -
shd shdR0 .3 f .1 0 3
shd shdLen 2 f .3 .1 8
shd shdThick .18 f .04 .01 1
shd shdFlat 1 f .1 0 1
shd shdSpin .03 r .01 - -
shd shdCol .2,.8,1 c
shd shdGlass .5 f .1 0 1
shd shdGlow .5 f .15 0 6
shd shdSeed 1 d
tun tunW 0 f 0 0 1
tun tunX 0 f .2 - -
tun tunY 0 f .2 - -
tun tunYaw 0 f .05 - -
tun tunRadius 3 f .3 .8 12
tun tunSpacing 2 f .3 .3 10
tun tunThick .1 f .03 .01 1
tun tunFlat 0 f .1 0 1
tun tunBandW .3 f .08 .02 1
tun tunPoly 0 f .1 0 1
tun tunSides 6 d
tun tunRails 0 f .15 0 1
tun tunRailN 8 d
tun tunCol .5,.8,1 c
tun tunGlass .7 f .08 0 1
tun tunGlow 0 f .1 0 6
tun tunWobble 0 f .1 0 2
arc arcW 0 f 0 0 1
arc arcYaw 0 f .05 - -
arc arcTrav 0 f 0 0 1
arc arcWidth 3 f .3 1 10
arc arcWave .8 f .2 0 4
arc arcFreq .3 f .05 .02 2
arc arcTierH 1.6 f .2 .4 6
arc arcStep .5 f .15 0 3
arc arcCeil 6 f .5 1 30
arc arcHole 1.5 f .3 0 20
arc arcLip .5 f .1 0 3
arc arcOpen 0 f .1 0 1
arc arcCol .8,.8,.8 c
arc arcLightCol 1,.4,.05 c
arc arcLight 1 f .2 0 8
arc arcGloss .6 f .1 0 1
blk blkW 0 f 0 0 1
blk blkY 0 f .2 - -
blk blkYaw 0 f .05 - -
blk blkCell 2 f .2 .3 8
blk blkDensity .25 f .05 0 1
blk blkSize .4 f .05 .05 .5
blk blkStretch 0 f .2 -1 1
blk blkLayers 3 f .5 0 20
blk blkClear 2 f .3 0 10
blk blkCol .2,.6,1 c
blk blkGlass .6 f .1 0 1
blk blkGlow .3 f .1 0 6
blk blkEdge 1 f .2 0 6
blk blkSeed 1 d
hlx hlxW 0 f 0 0 1
hlx hlxX 0 f .3 - -
hlx hlxY 0 f .2 - -
hlx hlxZ 0 f .3 - -
hlx hlxRadius 2 f .2 .3 8
hlx hlxPitch 3.5 f .3 .5 12
hlx hlxWidth .6 f .08 .05 3
hlx hlxThick .07 f .02 .01 .6
hlx hlxSteps 24 d
hlx hlxStepify 1 f .1 0 1
hlx hlxHeight 6 f .5 .5 30
hlx hlxSpin .02 r .008 - -
hlx hlxCol .5,.9,1 c
hlx hlxGlass .7 f .08 0 1
tre treeW 0 f 0 0 1
tre treeX 0 f .3 - -
tre treeZ 0 f .3 - -
tre treeBase 0 f .1 - -
tre treeSize 1.4 f .15 .2 5
tre treeCol .08,.35,.03 c
tre treeSeed 1 d
dots dotsAmt 0 f .1 0 3
dots dotsCol .3,.7,1 c
dots dotsScale 70 f 10 10 300
dots dotsAngle 0 f .1 - -
dots dotsCurve .15 f .05 - -
dots dotsOff 0 f .05 - -
dots dotsWidth .12 f .03 .01 1
dots dotsFade 1 f .2 - -
bokeh bokehAmt 0 f .1 0 3
bokeh bokehCol .4,.8,1 c
bokeh bokehSize 1 f .2 .2 4
bokeh bokehSpeed .02 r .005 - -
lines linesAmt 0 f .1 0 3
lines linesCol .6,.9,1 c
lines linesN 16 f 3 2 32
lines linesAmp .15 f .04 0 1
lines linesFreq 2 f .4 .1 10
lines linesSpread .2 f .05 0 2
lines linesAngle 0 f .08 - -
lines linesOff 0 f .05 - -
lines linesSpeed .05 r .01 - -
streak streakAmt 0 f .1 0 3
streak streakCol .5,.8,1 c
streak streakRainbow 0 f .1 0 1
streak streakSpeed .06 r .015 - -
streak streakX .5 f .03 - -
streak streakY .5 f .03 - -
spark sparkAmt 0 f .1 0 3
spark sparkCol 1,1,1 c
pst flareAmt 0 f .1 0 3
pst burstAmt 0 f .1 0 3
pst exposure 1 f .08 .2 4
pst contrast 1.05 f .05 .5 2
pst saturation 1.1 f .06 0 2
pst bloom .5 f .1 0 4
pst bloomThr .8 f .1 0 5
pst diffuse .1 f .05 0 2
pst shafts 0 f .1 0 3
pst vignette .35 f .08 0 2
pst chroma .2 f .08 0 3
pst grain .025 f .008 0 .2
pst tintCol 1,1,1 c
pst lift 0,0,0 c
pst dof 0 f .1 0 1
pst focus 8 f .5 .5 60
`;

export const PARAMS = [];
export const IDX = {};
export const RATES = [];
export const GROUP_WEIGHT = {
  cloud: 'cloudAmt', glow: 'glowAmt', flr: 'flrW', grid: 'gridAmt', rip: 'ripAmt', ter: 'terW',
  rib: 'ribW', sph: 'sphW', shd: 'shdW', tun: 'tunW', arc: 'arcW', blk: 'blkW', hlx: 'hlxW', tre: 'treeW',
  dots: 'dotsAmt', bokeh: 'bokehAmt', lines: 'linesAmt', streak: 'streakAmt', spark: 'sparkAmt',
};
export const FAMILIES = ['rib', 'sph', 'shd', 'tun', 'arc', 'blk', 'hlx', 'tre', 'ter', 'flr'];
const OVERLAYS = ['dots', 'bokeh', 'lines', 'streak', 'spark'];

let off = 0;
for (const line of SPEC.trim().split('\n')) {
  const [grp, name, dv, kind, sig, lo, hi] = line.trim().split(/\s+/);
  const def = dv.split(',').map(Number);
  const size = kind === 'c' ? 3 : 1;
  const p = {
    grp, name, kind, size, off, def,
    sig: Number(sig || 0),
    lo: lo === '-' ? -Infinity : lo === undefined ? 0 : Number(lo),
    hi: hi === '-' || hi === undefined ? Infinity : Number(hi),
  };
  if (kind === 'r') { p.phase = RATES.length; RATES.push(name); }
  PARAMS.push(p); IDX[name] = p; off += size;
}
export const NFLOAT = off;
export const NVEC4 = Math.ceil(off / 4);
export const NPH = Math.ceil(RATES.length / 4);

// Uniform layout for one shader: only the parameters (and phases) its source
// actually names are packed, tightly, into `uniform vec4 G[NG]` / `uPh[NPH]`.
// Keeping each shader small matters on WebGL1 phones, many of which only allow
// 64 fragment uniform vectors. `map[i]` is the genome index of packed float i.
export function layout(src) {
  const c = 'xyzw', at = (arr, i) => `${arr}[${i >> 2}].${c[i & 3]}`;
  const uses = n => new RegExp(`\\b${n}\\b`).test(src);
  const map = [], phMap = [];
  let defs = '';
  for (const p of PARAMS) {
    if (!uses(p.name)) continue;
    const k = map.length;
    defs += p.kind === 'c'
      ? `#define ${p.name} vec3(${at('G', k)},${at('G', k + 1)},${at('G', k + 2)})\n`
      : `#define ${p.name} ${at('G', k)}\n`;
    for (let i = 0; i < p.size; i++) map.push(p.off + i);
  }
  for (const name of RATES) {
    if (!uses(`PH_${name}`)) continue;
    defs += `#define PH_${name} ${at('uPh', phMap.length)}\n`;
    phMap.push(IDX[name].phase);
  }
  const ng = Math.max(1, Math.ceil(map.length / 4)), nph = Math.max(1, Math.ceil(phMap.length / 4));
  return { defs: `#define NG ${ng}\n#define NPH ${nph}\n${defs}`, map: Int32Array.from(map), phMap: Int32Array.from(phMap), ng, nph };
}

export function blank() {
  const g = new Float32Array(NVEC4 * 4);
  for (const p of PARAMS) g.set(p.def, p.off);
  return g;
}
export const get = (g, n) => { const p = IDX[n]; return p.size === 3 ? [g[p.off], g[p.off + 1], g[p.off + 2]] : g[p.off]; };
export function pack(obj) {
  const g = blank();
  for (const k in obj) {
    const p = IDX[k];
    if (!p) { console.warn('unknown param', k); continue; }
    if (p.size === 3) g.set(obj[k], p.off); else g[p.off] = obj[k];
  }
  // a generator bug must never reach the GPU as NaN (phones turn it into black blotches)
  for (const p of PARAMS) for (let i = 0; i < p.size; i++) if (!Number.isFinite(g[p.off + i])) g[p.off + i] = p.def[i];
  return g;
}

// ---------------------------------------------------------------- rng + colour
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export class Rng {
  constructor(seed) { this.f = mulberry32(seed >>> 0); }
  r(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return Math.floor(this.r(a, b + 1)); }
  chance(p) { return this.f() < p; }
  pick(a) { return a[Math.floor(this.f() * a.length)]; }
  sign() { return this.f() < 0.5 ? -1 : 1; }
  gauss() { return (this.f() + this.f() + this.f() + this.f() - 2) * 1.2; }
  weighted(list) {
    let s = 0; for (const [, w] of list) s += w;
    let x = this.f() * s;
    for (const [v, w] of list) { if ((x -= w) <= 0) return v; }
    return list[list.length - 1][0];
  }
}

const s2l = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const l2s = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
function hslToSrgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
function srgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
// linear-light colour from hue (degrees), saturation, lightness, optional HDR multiplier
export const H = (h, s, l, m = 1) => hslToSrgb(h, s, l).map(v => s2l(v) * m);
function hueShift(lin, deg) {
  const m = Math.max(...lin);
  if (m <= 0) return lin;
  const sc = m > 1 ? m : 1;
  const [h, s, l] = srgbToHsl(lin.map(v => l2s(Math.min(v / sc, 1))));
  return hslToSrgb(h + deg, s, l).map(v => s2l(v) * sc);
}

// OKLab for perceptually smooth colour morphs
function toLab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromLab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077085500 * m + 0.2309468470 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(v => Math.max(v, 0));
}

// ---------------------------------------------------------------- palettes
const PAL_W = [['blue', 3], ['aqua', 3], ['green', 2], ['teal', 1.4], ['purple', 1.4], ['orange', 1.3], ['rainbow', 1], ['magenta', .6], ['red', .6]];
function palette(R, prefer) {
  const fam = prefer && R.chance(0.75) ? R.pick(prefer) : R.weighted(PAL_W);
  const P = { fam, rainbow: false };
  switch (fam) {
    case 'blue': P.a = R.r(205, 225); P.b = R.r(185, 200); P.acc = R.pick([150, 120, 280, 30]); break;
    case 'aqua': P.a = R.r(180, 196); P.b = R.r(128, 155); P.acc = R.pick([210, 90]); break;
    case 'green': P.a = R.r(85, 115); P.b = R.r(140, 165); P.acc = R.pick([200, 55]); break;
    case 'teal': P.a = R.r(168, 182); P.b = R.r(195, 208); P.acc = R.pick([100, 260]); break;
    case 'purple': P.a = R.r(262, 285); P.b = R.r(222, 238); P.acc = R.pick([320, 190]); break;
    case 'orange': P.a = R.r(22, 36); P.b = R.r(40, 50); P.acc = R.pick([5, 205]); break;
    case 'magenta': P.a = R.r(298, 318); P.b = R.r(268, 285); P.acc = R.pick([190, 30]); break;
    case 'red': P.a = R.r(350, 362); P.b = R.r(12, 22); P.acc = R.pick([210, 0]); break;
    default: P.a = R.r(0, 360); P.b = P.a + R.r(90, 180); P.acc = P.a + 240; P.rainbow = true;
  }
  return P;
}

// ---------------------------------------------------------------- building blocks
function camStd(g, R, o = {}) {
  g.camDist = R.r(o.d0 ?? 6, o.d1 ?? 10); g.camYaw = R.r(-.35, .35); g.camPitch = R.r(o.p0 ?? .02, o.p1 ?? .16);
  g.camZoom = R.r(1.4, 2.1); g.camTY = R.r(-.2, .4); g.camDrift = R.r(.15, .45);
  g.camOrbit = R.r(-.006, .006); g.camRoll = R.r(-.05, .05);
}
function sunAhead(g, R, dy = 0, dx = 0) { g.sunYaw = -g.camYaw + dx; g.sunElev = -g.camPitch + dy; }

function brightSky(g, R, P) {
  const top = R.r(200, 222);
  g.skyTop = H(top, R.r(.6, .9), R.r(.28, .45));
  g.skyHor = H(top - R.r(5, 20), R.r(.45, .8), R.r(.72, .86));
  g.skyBot = H(top - 10, .6, .5);
  g.skyCurve = R.r(.3, .65);
  g.cloudAmt = R.r(.3, .75); g.cloudScale = R.r(.6, 1.5); g.cloudCol = [1, 1, 1]; g.windSpeed = R.r(.006, .02);
  g.sunCol = H(R.r(40, 55), .7, .92); g.sunInt = R.r(1.2, 3); g.sunSize = R.r(.6, 1.5);
  g.sunYaw = R.r(-.6, .6); g.sunElev = R.r(.1, .45);
  g.fogDen = R.r(.004, .012);
}
function paleSky(g, R, P) {
  const h = R.chance(.5) ? P.a : R.r(190, 210);
  g.skyTop = H(h, R.r(.2, .5), R.r(.86, .95));
  g.skyHor = H(h, R.r(.1, .3), R.r(.95, .99));
  g.skyBot = H(h, R.r(.2, .4), R.r(.85, .93));
  g.skyCurve = R.r(.6, 1.5); g.cloudAmt = 0;
  g.sunCol = [1, 1, 1]; g.sunInt = R.r(.5, 1.5); g.sunSize = R.r(1, 2.5);
  g.sunYaw = R.r(-.8, .8); g.sunElev = R.r(.2, .7);
  g.fogDen = R.r(.01, .03);
}
function darkSky(g, R, P, o = {}) {
  g.skyTop = H(P.a, R.r(.5, .9), R.r(.004, .025));
  g.skyHor = H(P.a, R.r(.5, .9), R.r(.03, o.hor ?? .11));
  g.skyBot = H(P.a, .6, R.r(.008, .03));
  g.skyCurve = R.r(.4, 1); g.cloudAmt = 0;
  g.sunInt = R.r(.2, .8); g.sunCol = H(P.b, .6, .75); g.sunSize = R.r(.3, 1);
  g.sunYaw = R.r(-.8, .8); g.sunElev = R.r(-.1, .4);
  g.glowAmt = R.r(.2, .9); g.glowColA = H(P.a, .9, .5); g.glowColB = H(P.rainbow ? P.acc : P.b, .9, .45);
  g.glowAX = R.r(-1, 1); g.glowAY = R.r(-.2, .4); g.glowBX = R.r(-1, 1); g.glowBY = R.r(-.3, .3); g.glowSize = R.r(.5, 2);
  g.stars = R.chance(.3) ? R.r(.2, .8) : 0;
  g.fogDen = R.r(.01, .04);
}
function water(g, R, P) {
  g.flrW = 1; g.flrY = R.r(-2, -1.1);
  g.waterCol = H(R.r(185, 210), R.r(.7, .95), R.r(.14, .26));
  g.waveAmp = R.r(.15, .5); g.waveScale = R.r(.6, 1.4); g.waveSpeed = R.r(.25, .5);
  g.caustic = R.r(.2, .7); g.mirror = R.r(0, .25);
}
function darkFloor(g, R, P, grid = true) {
  g.flrW = 1; g.flrY = R.r(-2.4, -1.4);
  g.waterCol = H(P.a, .5, R.r(.01, .04)); g.waveAmp = R.r(0, .04); g.mirror = R.r(.5, .9); g.caustic = 0;
  if (grid) { g.gridAmt = R.r(.3, 1.1); g.gridCol = H(R.chance(.7) ? P.a : P.b, .9, .55); g.gridScale = R.r(.5, 1.8); }
}

function glassRibbons(g, R, P, o = {}) {
  g.ribW = 1; g.ribCount = R.int(o.n0 ?? 2, o.n1 ?? 5);
  g.ribAmp = R.r(.4, 1.3); g.ribFreq = R.r(.2, .6); g.ribSpread = R.r(.25, .9);
  g.ribVert = R.r(-.6, .8); g.ribFan = R.chance(.3) ? R.r(-.15, .15) : 0; g.ribDepth = R.r(0, .8);
  g.ribTwist = R.r(-.35, .35); g.ribAngle = R.r(-.8, .8); g.ribTwistPh = R.r(-.5, .5);
  g.ribWidth = R.r(.35, 1.1); g.ribThick = R.r(.015, .05); g.ribJitter = R.r(0, .6); g.ribPhaseOff = R.r(.2, 1.2);
  g.ribSpeed = R.r(.03, .1) * R.sign();
  g.ribColA = H(P.a, R.r(.65, .95), R.r(.45, .6)); g.ribColB = H(P.b, R.r(.65, .95), R.r(.45, .6));
  g.ribHue = P.rainbow ? R.r(.4, 1) : 0;
  g.ribGlass = R.r(.6, .95); g.ribGlow = R.chance(.3) ? R.r(.05, .4) : 0; g.ribIrid = R.chance(.2) ? R.r(.1, .5) : 0;
  g.ribLines = R.chance(.55) ? R.r(.15, .7) : 0; g.ribLineN = R.r(6, 24); g.ribEdge = R.r(.3, 1);
  g.ribDots = R.chance(.2) ? R.r(.2, .6) : 0;
  g.ribYaw = R.r(-.7, .7); g.ribRoll = R.r(-.3, .3); g.ribY = R.r(-.4, .6); g.ribZ = R.r(-1.5, 1); g.ribX = R.r(-1, 1);
  g.ribSeed = R.int(1, 999);
}
function glowRibbons(g, R, P, o = {}) {
  glassRibbons(g, R, P, o);
  g.ribGlass = R.r(.93, 1); g.ribGlow = R.r(.5, 2.2); g.ribLines = R.r(.4, 1.3); g.ribLineN = R.r(10, 40);
  g.ribEdge = R.r(.5, 1.4); g.ribThick = R.r(.006, .02);
  g.ribColA = H(P.a, R.r(.8, 1), R.r(.45, .6)); g.ribColB = H(P.rainbow ? P.b : (R.chance(.35) ? P.acc : P.b), R.r(.8, 1), R.r(.45, .6));
  g.ribHue = P.rainbow ? R.r(.5, 1) : (R.chance(.15) ? R.r(.2, .6) : 0);
}
function bubbles(g, R, P, o = {}) {
  g.sphW = 1; g.sphCount = R.int(o.n0 ?? 3, o.n1 ?? 10); g.sphSpread = R.r(1.5, 3.5); g.sphSize = R.r(.2, .55);
  g.sphVar = R.r(.3, .9); g.sphBob = R.r(.3, 1); g.sphSpeed = R.r(.1, .3);
  g.sphCol = H(R.chance(.5) ? P.a : P.b, R.r(.4, .8), R.r(.6, .8)); g.sphGlass = R.r(.85, .98); g.sphIrid = R.r(0, .6);
  g.sphX = R.r(-1.5, 1.5); g.sphY = R.r(-.2, .8); g.sphZ = R.r(-1.5, 1); g.sphSeed = R.int(1, 999);
}
function lightOverlays(g, R, P) {
  if (R.chance(.3)) { g.dotsAmt = R.r(.08, .25); g.dotsCol = H(P.b, .8, .7); g.dotsScale = R.r(70, 140); g.dotsAngle = R.r(-.5, .5); g.dotsOff = R.r(-.42, -.2); g.dotsCurve = R.r(-.2, .2); g.dotsWidth = R.r(.04, .12); g.dotsFade = R.r(-1.5, 1.5); }
  if (R.chance(.45)) { g.linesAmt = R.r(.25, .8); g.linesCol = H(P.a, .4, .92); g.linesN = R.r(8, 24); g.linesAmp = R.r(.05, .2); g.linesFreq = R.r(1, 3.5); g.linesSpread = R.r(.08, .35); g.linesAngle = R.r(-.4, .4); g.linesOff = R.r(-.25, .2); g.linesSpeed = R.r(.02, .06); }
  if (R.chance(.4)) { g.sparkAmt = R.r(.2, .8); g.sparkCol = [1, 1, 1]; }
  if (R.chance(.35)) g.flareAmt = R.r(.2, .6);
}
function darkOverlays(g, R, P) {
  if (R.chance(.6)) { g.dotsAmt = R.r(.25, .9); g.dotsCol = H(R.chance(.6) ? P.a : P.b, .9, .55); g.dotsScale = R.r(50, 140); g.dotsAngle = R.r(-.6, .6); g.dotsOff = R.r(-.35, .2); g.dotsCurve = R.r(-.25, .25); g.dotsWidth = R.r(.06, .25); g.dotsFade = R.r(-2, 2); }
  if (R.chance(.35)) { g.linesAmt = R.r(.3, 1); g.linesCol = H(P.b, .8, .7); g.linesN = R.r(10, 30); g.linesAmp = R.r(.05, .25); g.linesFreq = R.r(1, 4); g.linesSpread = R.r(.1, .4); g.linesAngle = R.r(-.5, .5); g.linesOff = R.r(-.2, .2); g.linesSpeed = R.r(.02, .07); }
  if (R.chance(.35)) { g.streakAmt = R.r(.3, .9); g.streakCol = H(P.a, .8, .7); g.streakRainbow = P.rainbow ? 1 : R.chance(.2) ? R.r(.3, 1) : 0; g.streakSpeed = R.r(.03, .1); g.streakX = R.r(.3, .7); g.streakY = R.r(.35, .65); }
  if (R.chance(.35)) { g.bokehAmt = R.r(.12, .45); g.bokehCol = H(R.chance(.5) ? P.a : P.b, .8, .6); g.bokehSize = R.r(.4, 1.2); g.bokehSpeed = R.r(.01, .03); }
  if (R.chance(.45)) { g.sparkAmt = R.r(.3, 1); g.sparkCol = H(P.b, .4, .9); }
}

// ---------------------------------------------------------------- archetypes
export const ARCH = {};
function arch(key, name, w, prefer, fn) { ARCH[key] = { key, name, w, prefer, fn }; }

arch('skySea', 'Azure Horizon', 3, ['aqua', 'blue', 'green', 'teal'], (g, R, P) => {
  brightSky(g, R, P); water(g, R, P); camStd(g, R);
  if (R.chance(.92)) glassRibbons(g, R, P);
  if (R.chance(.25)) bubbles(g, R, P, { n0: 1, n1: 4 });
  lightOverlays(g, R, P);
  g.shafts = R.r(.1, .5); g.bloom = R.r(.4, .8); g.diffuse = R.r(.05, .25); g.exposure = R.r(.9, 1.1);
});

arch('waterDrop', 'Still Drop', 1.2, ['blue', 'aqua'], (g, R, P) => {
  brightSky(g, R, P); water(g, R, P);
  g.waveAmp = R.r(.03, .1); g.mirror = R.r(.2, .5); g.caustic = R.r(.1, .4);
  camStd(g, R, { d0: 5, d1: 8, p0: .02, p1: .1 }); g.camTY = g.flrY + R.r(.6, 1.2); g.camYaw = R.r(-.15, .15); g.camOrbit = R.r(-.004, .004);
  g.sphW = 1; g.sphCount = 1; g.sphCenter0 = 1; g.sphSize = R.r(.3, .55); g.sphX = 0; g.sphZ = 0;
  g.sphY = g.flrY + g.sphSize * R.r(1.4, 2.6); g.sphBob = R.r(.1, .3); g.sphSpeed = .15;
  g.sphCol = H(P.a, .5, .8); g.sphGlass = .95; g.sphIrid = R.r(0, .3); g.sphSeed = 1;
  g.ripAmt = R.r(.8, 1.8); g.ripX = 0; g.ripZ = 0; g.ripFreq = R.r(3, 7); g.ripSpeed = R.r(.8, 1.6); g.ripSpread = R.chance(.3) ? R.r(1, 3) : 0;
  if (R.chance(.4)) { glassRibbons(g, R, P, { n0: 1, n1: 3 }); g.ribZ = R.r(-6, -3); g.ribGlass = R.r(.8, .97); }
  lightOverlays(g, R, P);
  g.bloom = R.r(.4, .8); g.diffuse = R.r(.1, .3);
});

arch('neon', 'Neon Currents', 3, ['blue', 'purple', 'aqua', 'rainbow', 'red', 'green', 'orange'], (g, R, P) => {
  darkSky(g, R, P); camStd(g, R, { d0: 6, d1: 9 });
  glowRibbons(g, R, P, { n0: 3, n1: 6 });
  if (R.chance(.35)) { bubbles(g, R, P, { n0: 1, n1: 5 }); g.sphGlass = R.r(.7, .95); }
  if (R.chance(.35)) darkFloor(g, R, P);
  darkOverlays(g, R, P);
  g.bloom = R.r(.6, 1.2); g.bloomThr = R.r(.7, 1.3); g.shafts = R.r(0, .3); g.vignette = R.r(.4, .8); g.exposure = R.r(1, 1.4);
});

arch('pale', 'Pale Silk', 1.6, ['aqua', 'blue', 'orange', 'green'], (g, R, P) => {
  paleSky(g, R, P); camStd(g, R, { d0: 4.5, d1: 7.5 });
  glassRibbons(g, R, P, { n0: 2, n1: 6 });
  g.ribWidth = R.r(.6, 2); g.ribGlass = R.r(.4, .85); g.ribAmp = R.r(.4, 1);
  const vivid = R.chance(.7);
  g.ribColA = H(P.a, vivid ? R.r(.85, 1) : R.r(.45, .7), vivid ? R.r(.5, .6) : R.r(.6, .75));
  g.ribColB = H(P.b, vivid ? R.r(.85, 1) : R.r(.45, .7), vivid ? R.r(.5, .6) : R.r(.65, .8));
  if (R.chance(.4)) { g.flrW = 1; g.flrY = R.r(-2.2, -1.4); g.waterCol = H(P.a, .2, .85); g.mirror = R.r(.3, .7); g.waveAmp = R.r(0, .03); g.caustic = 0; }
  if (R.chance(.3)) bubbles(g, R, P, { n0: 2, n1: 7 });
  lightOverlays(g, R, P);
  if (R.chance(.5)) { g.dotsAmt = R.r(.2, .6); g.dotsCol = H(P.a, .8, .55); }
  g.bloom = R.r(.2, .5); g.diffuse = R.r(.1, .35); g.exposure = R.r(.85, 1); g.vignette = R.r(.05, .25); g.contrast = R.r(1, 1.15);
});

arch('bubbles', 'Glass Bubbles', 1.4, ['blue', 'aqua'], (g, R, P) => {
  brightSky(g, R, P); camStd(g, R, { d0: 6, d1: 9 });
  g.camPitch = R.r(-.15, .1); g.sunElev = R.r(.3, .8);
  bubbles(g, R, P, { n0: 6, n1: 12 }); g.sphIrid = R.r(.2, .7);
  if (R.chance(.85)) { glassRibbons(g, R, P, { n0: 1, n1: 3 }); g.ribGlass = R.r(.8, .97); g.ribLines = R.r(.3, 1); }
  lightOverlays(g, R, P); g.sparkAmt = R.r(.4, 1);
  g.bloom = R.r(.4, .7); g.diffuse = R.r(.1, .3);
});

arch('crystal', 'Crystal Burst', 1.8, ['red', 'aqua', 'green', 'orange', 'purple', 'blue', 'magenta'], (g, R, P) => {
  const bright = R.chance(.25);
  if (bright) brightSky(g, R, P); else darkSky(g, R, P, { hor: .15 });
  if (bright) { g.cloudAmt = R.r(0, .3); }
  camStd(g, R, { d0: 6, d1: 10 });
  g.shdW = 1; g.shdCount = R.int(10, 18); g.shdLen = R.r(1.5, 3.2); g.shdThick = R.r(.1, .3); g.shdFlat = R.r(.3, 1);
  g.shdR0 = R.r(.1, .6); g.shdSpin = R.r(.01, .04) * R.sign();
  g.shdCol = H(P.a, R.r(.8, 1), R.r(.45, .6)); g.shdGlass = R.r(.25, .75); g.shdGlow = bright ? R.r(0, .3) : R.r(.4, 1.6);
  g.shdSeed = R.int(1, 999); g.shdY = R.r(-.3, .4);
  if (!bright) sunAhead(g, R, R.r(-.05, .05), R.r(-.05, .05)), g.sunInt = R.r(1, 2.5), g.sunCol = H(P.a, .7, .75), g.sunSize = R.r(.4, 1);
  if (R.chance(.5)) { g.streakAmt = R.r(.4, 1); g.streakCol = H(P.a, .7, .7); g.streakX = .5; g.streakY = .5; g.streakSpeed = R.r(.03, .08); g.streakRainbow = P.rainbow ? 1 : 0; }
  if (R.chance(.3)) g.burstAmt = R.r(.3, .8);
  if (R.chance(.4)) darkFloor(g, R, P);
  if (R.chance(.3)) { glowRibbons(g, R, P, { n0: 1, n1: 3 }); }
  darkOverlays(g, R, P);
  g.bloom = R.r(.8, 1.6); g.shafts = R.r(.3, .9); g.exposure = R.r(1, 1.3);
});

arch('arcade', 'Glass Arcade', 1.6, ['blue', 'aqua', 'purple', 'teal'], (g, R, P) => {
  brightSky(g, R, P); water(g, R, P); g.flrY = R.r(-1.4, -.9); g.waveAmp = R.r(.08, .3);
  g.tunW = 1; g.tunRadius = R.r(2.6, 4); g.tunSpacing = R.r(1.4, 3); g.tunThick = R.r(.08, .2); g.tunFlat = R.r(.4, 1);
  g.tunBandW = R.r(.08, .35); g.tunPoly = R.chance(.25) ? 1 : 0; g.tunSides = R.pick([4, 6, 8]);
  g.tunRails = R.chance(.35) ? R.r(.3, 1) : 0; g.tunRailN = R.pick([6, 8, 12]);
  g.tunCol = H(P.a, R.r(.6, .9), R.r(.55, .7)); g.tunGlass = R.r(.6, .9); g.tunGlow = R.chance(.2) ? R.r(.1, .4) : 0;
  g.tunY = R.r(-.2, .3); g.tunYaw = R.r(-.15, .15);
  g.camDist = R.r(1.5, 4); g.camYaw = R.r(-.25, .25); g.camPitch = R.r(-.06, .06); g.camTY = R.r(.1, .9); g.camZoom = R.r(1.2, 1.7);
  g.camDrift = R.r(.1, .3); g.camTravel = R.r(.12, .35);
  sunAhead(g, R, R.r(.08, .3), R.r(-.3, .3)); g.sunInt = R.r(1, 2);
  if (R.chance(.5)) { glassRibbons(g, R, P, { n0: 1, n1: 2 }); g.ribYaw = Math.PI / 2; g.ribAngle = 0; g.ribTwist = 0; g.ribRoll = 0; g.ribAmp = R.r(.05, .25); g.ribFreq = R.r(.1, .25); g.ribY = g.flrY + R.r(.15, .4); g.ribWidth = R.r(.6, 1.2); g.ribZ = 0; g.ribVert = 0; g.ribGlass = R.r(.3, .7); g.ribDepth = R.r(0, .4); }
  lightOverlays(g, R, P);
  g.bloom = R.r(.5, .9); g.diffuse = R.r(.1, .3); g.shafts = R.r(.2, .6);
});

arch('atrium', 'White Atrium', 1.6, ['orange', 'green', 'aqua', 'blue', 'purple'], (g, R, P) => {
  brightSky(g, R, P); g.cloudAmt = R.r(.2, .6);
  g.arcW = 1; g.arcWidth = R.r(3.5, 6); g.arcWave = R.r(.3, 1.2); g.arcFreq = R.r(.08, .22); g.arcTierH = R.r(1.5, 2.4);
  g.arcStep = R.r(.1, .7); g.arcCeil = R.r(5, 10); g.arcHole = R.r(1.5, 4); g.arcYaw = R.r(-.5, .5); g.arcLip = R.r(.4, 1);
  const wh = R.r(0, 360); g.arcCol = H(wh, R.r(0, .1), R.r(.78, .9)); g.arcLightCol = H(P.a, 1, .55, R.r(1.2, 2.2)); g.arcLight = R.r(.6, 1.6); g.arcGloss = R.r(.4, .9);
  g.flrW = 1; g.flrY = -1.5;
  if (R.chance(.6)) { g.waterCol = H(wh, .1, R.r(.6, .8)); g.mirror = R.r(.4, .8); g.waveAmp = R.r(0, .02); g.caustic = 0; }
  else { g.waterCol = H(R.r(175, 200), .8, .35); g.mirror = R.r(.1, .3); g.waveAmp = R.r(.05, .15); g.caustic = R.r(.4, .9); }
  g.camDist = R.r(3, 7); g.camYaw = R.r(-.35, .35); g.camPitch = R.r(-.04, .1); g.camTY = R.r(-.2, .8); g.camZoom = R.r(1.05, 1.4);
  if (R.chance(.6)) {
    g.arcOpen = 1; g.arcWave = R.r(.8, 2.5); g.arcFreq = R.r(.08, .2); g.arcWidth = R.r(2, 4); g.arcHole = 0; g.arcCeil = R.r(6, 12);
    g.camTX = R.r(-1.5, .5); g.camDist = R.r(4, 8); g.camYaw = R.r(-.6, -.25); g.camZoom = R.r(1.1, 1.5);
  }
  g.camTravel = R.r(.05, .2); g.arcTrav = 1; g.camDrift = R.r(.1, .3);
  sunAhead(g, R, R.r(.3, .7), R.r(-.3, .3)); g.sunInt = R.r(1.5, 3);
  if (R.chance(.6)) { glassRibbons(g, R, P, { n0: 1, n1: 2 }); g.ribColA = H(P.a, 1, .5); g.ribColB = H(P.b, 1, .5); g.ribGlass = R.r(.1, .5); g.ribGlow = R.r(.1, .5); g.ribThick = R.r(.05, .12); g.ribY = R.r(-.5, 1.2); g.ribYaw = R.r(.6, 1.4) * R.sign(); g.ribZ = R.r(-4, -1); g.ribIrid = 0; }
  if (R.chance(.35)) { g.treeW = 1; g.treeSize = R.r(.6, 1.1); g.treeX = (g.arcWidth - R.r(.8, 1.4)) * R.sign(); g.treeZ = R.r(-6, -2); g.treeCol = H(R.r(95, 130), .7, .3); g.treeSeed = R.int(1, 99); }
  if (R.chance(.3)) lightOverlays(g, R, P);
  g.bloom = R.r(.4, .8); g.diffuse = R.r(.1, .3); g.exposure = R.r(.95, 1.1); g.shafts = R.r(.2, .6); g.fogDen = R.r(.002, .006);
});

arch('dataFlight', 'Data Flight', 1.8, ['blue', 'teal', 'green', 'purple', 'orange'], (g, R, P) => {
  darkSky(g, R, P, { hor: .16 }); camStd(g, R, { d0: 3, d1: 6, p0: -.05, p1: .1 }); g.camYaw = R.r(-.3, .3);
  g.blkW = 1; g.blkCell = R.r(1.4, 3); g.blkDensity = R.r(.1, .32); g.blkSize = R.r(.25, .45); g.blkStretch = R.chance(.6) ? R.r(-1, 1) : 0;
  g.blkLayers = R.r(1.5, 4); g.blkClear = R.r(1.6, 3); g.blkCol = H(P.a, R.r(.6, .9), R.r(.45, .65)); g.blkGlass = R.r(.3, .85);
  g.blkGlow = R.r(.1, .6); g.blkEdge = R.r(.6, 2); g.blkSeed = R.int(1, 999); g.blkYaw = R.r(-.3, .3);
  g.camTravel = R.r(.3, .9);
  sunAhead(g, R, R.r(-.05, .1), R.r(-.2, .2)); g.sunInt = R.r(1.2, 3); g.sunCol = H(P.b, .7, .75); g.sunSize = R.r(.3, .8);
  if (R.chance(.6)) darkFloor(g, R, P);
  g.streakAmt = R.chance(.6) ? R.r(.3, .9) : 0; g.streakCol = H(P.b, .7, .7); g.streakX = .5 + R.r(-.05, .05); g.streakY = .5 + R.r(-.05, .05); g.streakSpeed = R.r(.05, .12);
  darkOverlays(g, R, P);
  g.bloom = R.r(.8, 1.4); g.shafts = R.r(.4, 1); g.exposure = R.r(1, 1.3);
});

arch('hex', 'Hex Chamber', 1.1, ['teal', 'blue', 'green', 'aqua'], (g, R, P) => {
  darkSky(g, R, P, { hor: .14 });
  g.tunW = 1; g.tunPoly = 1; g.tunSides = R.pick([6, 6, 8, 4]); g.tunRadius = R.r(2, 3.2); g.tunSpacing = R.r(.6, 1.6); g.tunThick = R.r(.04, .12);
  g.tunFlat = R.r(.6, 1); g.tunBandW = R.r(.1, .5); g.tunRails = R.r(.4, 1); g.tunRailN = R.pick([6, 12]);
  g.tunCol = H(P.a, .8, .55); g.tunGlass = R.r(.75, .95); g.tunGlow = R.r(.25, .9); g.tunYaw = R.r(-.05, .05);
  g.camDist = R.r(1.5, 4); g.camYaw = R.r(-.2, .2); g.camPitch = R.r(-.08, .08); g.camTY = R.r(-.4, .4); g.camZoom = R.r(1.2, 1.6); g.camDrift = R.r(.1, .3);
  g.camTravel = R.r(.15, .45); g.camRoll = R.r(-.2, .2);
  sunAhead(g, R, R.r(-.03, .03), R.r(-.03, .03)); g.sunInt = R.r(1.5, 3.5); g.sunCol = H(P.b, .6, .8); g.sunSize = R.r(.3, .9);
  if (R.chance(.5)) glowRibbons(g, R, P, { n0: 1, n1: 3 }), g.ribZ = R.r(-4, -1), g.ribAmp = R.r(.3, .8);
  darkOverlays(g, R, P);
  g.bloom = R.r(1, 1.8); g.shafts = R.r(.5, 1.2); g.exposure = R.r(1, 1.3);
});

arch('island', 'Island Grove', 1.4, ['green', 'aqua', 'blue', 'teal'], (g, R, P) => {
  brightSky(g, R, P); water(g, R, P); camStd(g, R, { d0: 7, d1: 11, p0: .02, p1: .12 });
  g.treeW = 1; g.treeX = R.r(-2.5, 2.5); g.treeZ = R.r(-3, 0); g.treeSize = R.r(1.2, 2); g.treeCol = H(R.r(90, 130), R.r(.6, .85), R.r(.25, .38)); g.treeSeed = R.int(1, 99);
  g.terW = 1; g.terAmp = R.r(0, .3); g.terIsland = R.r(1.2, 2); g.terSink = R.r(.6, 1); g.terScale = R.r(.3, .6);
  g.terCol = H(R.r(85, 120), .7, .32); g.terCol2 = H(R.r(40, 60), .4, .45);
  g.sunYaw = Math.atan2(g.treeX, 8) * .6 + R.r(-.2, .2); g.sunElev = R.r(.2, .5);
  if (R.chance(.7)) glassRibbons(g, R, P, { n0: 1, n1: 4 });
  if (R.chance(.5)) bubbles(g, R, P, { n0: 2, n1: 6 });
  lightOverlays(g, R, P);
  g.bloom = R.r(.4, .8); g.shafts = R.r(.3, .7); g.diffuse = R.r(.1, .3);
});

arch('hills', 'Green Hills', 1.2, ['green', 'aqua', 'blue'], (g, R, P) => {
  brightSky(g, R, P); g.cloudAmt = R.r(.35, .8);
  g.terW = 1; g.terAmp = R.r(.8, 1.8); g.terScale = R.r(.08, .18); g.terNear = 0;
  g.terCol = H(R.r(88, 112), R.r(.75, .95), R.r(.3, .42)); g.terCol2 = H(R.r(70, 95), .7, .25);
  g.flrY = -1.5;
  camStd(g, R, { d0: 7, d1: 11, p0: .0, p1: .08 }); g.camTY = R.r(.8, 1.6);
  g.sunElev = R.r(.35, .8);
  if (R.chance(.75)) { glowRibbons(g, R, P, { n0: 2, n1: 5 }); g.ribColA = H(P.a, .5, .9); g.ribColB = H(P.b, .6, .85); g.ribGlow = R.r(.15, .6); g.ribY = R.r(.6, 1.6); }
  if (R.chance(.35)) { g.treeW = 1; g.treeX = R.r(-4, 4); g.treeZ = R.r(-6, -2); g.treeSize = R.r(1, 1.8); g.treeCol = H(R.r(90, 125), .7, .3); g.treeSeed = R.int(1, 99); }
  lightOverlays(g, R, P);
  g.bloom = R.r(.3, .6); g.diffuse = R.r(.1, .25); g.saturation = R.r(1.1, 1.3);
});

arch('aurora', 'Aurora Night', 1.1, ['teal', 'green', 'purple', 'aqua', 'rainbow'], (g, R, P) => {
  darkSky(g, R, P); g.stars = R.r(.4, 1); g.glowAmt = R.r(.4, 1.2); g.glowAY = R.r(.15, .45); g.glowBY = R.r(.1, .4);
  g.flrW = 1; g.flrY = -1.5; g.waterCol = H(P.a, .5, .02); g.waveAmp = R.r(.02, .1); g.mirror = R.r(.3, .7); g.caustic = 0;
  g.terW = 1; g.terNear = R.r(12, 20); g.terAmp = R.r(3, 6); g.terRidge = R.r(.4, .9); g.terScale = R.r(.06, .12); g.terSink = R.r(.5, 1.2);
  g.terCol = H(P.a, .3, .03); g.terCol2 = H(P.a, .2, .015);
  camStd(g, R, { d0: 6, d1: 10, p0: -.1, p1: .05 }); g.camTY = R.r(-.6, 0);
  glowRibbons(g, R, P, { n0: 3, n1: 6 }); g.ribY = R.r(1.5, 3); g.ribWidth = R.r(1, 2.5); g.ribGlow = R.r(.6, 2); g.ribLines = R.r(.2, .7); g.ribZ = R.r(-8, -3); g.ribRoll = R.r(-.15, .15);
  g.ribHue = P.rainbow ? 1 : R.r(0, .4);
  if (R.chance(.4)) { g.bokehAmt = R.r(.1, .4); g.bokehCol = H(P.b, .7, .6); g.bokehSpeed = .01; }
  g.bloom = R.r(.6, 1.2); g.bloomThr = R.r(.6, 1.1); g.vignette = R.r(.4, .8);
});

arch('chrome', 'Liquid Chrome', 1, ['rainbow', 'purple', 'blue', 'orange'], (g, R, P) => {
  if (R.chance(.5)) { const h = R.r(200, 270); g.skyTop = H(h, .25, R.r(.35, .5)); g.skyHor = H(R.r(20, 40), .25, R.r(.75, .88)); g.skyBot = H(h, .15, .2); g.sunInt = R.r(1.5, 3); g.fogDen = .01; g.cloudAmt = 0; g.sunElev = R.r(.2, .6); g.sunYaw = R.r(-.8, .8); g.sunCol = [1, .95, .9]; }
  else { darkSky(g, R, P); g.sunInt = R.r(1, 3); g.glowAmt = R.r(2, 4); g.glowSize = R.r(1.5, 3); }
  camStd(g, R, { d0: 5, d1: 8 });
  g.ribW = 1; g.ribCount = R.int(1, 3); g.ribWidth = R.r(.8, 1.6); g.ribThick = R.r(.08, .25); g.ribAmp = R.r(.5, 1.2); g.ribFreq = R.r(.3, .6);
  g.ribSpread = R.r(.5, 1.2); g.ribTwist = R.r(-.5, .5); g.ribAngle = R.r(-1, 1); g.ribDepth = R.r(.2, 1); g.ribVert = R.r(-.5, .5); g.ribJitter = R.r(.2, .8);
  g.ribColA = H(0, 0, R.r(.75, .9)); g.ribColB = H(P.a, .3, .8); g.ribGlass = R.r(0, .15); g.ribIrid = R.r(.6, 1); g.ribEdge = R.r(0, .3);
  g.ribDots = R.chance(.5) ? R.r(.3, .8) : 0; g.ribLineN = R.r(12, 30); g.ribSpeed = R.r(.03, .08); g.ribYaw = R.r(-.6, .6); g.ribRoll = R.r(-.3, .3); g.ribSeed = R.int(1, 999);
  if (R.chance(.4)) darkFloor(g, R, P, false);
  g.bloom = R.r(.4, .9); g.contrast = R.r(1.05, 1.25);
});

arch('spiral', 'Sky Stair', 1, ['aqua', 'blue', 'teal', 'green'], (g, R, P) => {
  if (R.chance(.6)) brightSky(g, R, P);
  else { paleSky(g, R, P); g.skyTop = H(P.a, .55, .42); g.skyHor = H(P.a, .45, .75); g.shafts = R.r(.5, 1); }
  g.hlxW = 1; g.hlxRadius = R.r(1.4, 3); g.hlxPitch = R.r(2.6, 5); g.hlxWidth = R.r(.45, .9); g.hlxThick = R.r(.04, .09);
  g.hlxSteps = R.int(16, 36); g.hlxStepify = R.chance(.7) ? 1 : 0; g.hlxHeight = R.r(4, 9); g.hlxSpin = R.r(.01, .03) * R.sign();
  g.hlxCol = H(P.a, R.r(.6, .9), R.r(.55, .7)); g.hlxGlass = R.r(.35, .75); g.hlxX = R.r(-1.5, 1.5); g.hlxY = R.r(0, 2);
  camStd(g, R, { d0: 7, d1: 12, p0: -.3, p1: .05 }); g.camTY = R.r(.5, 2.5);
  g.sunElev = R.r(.5, 1);
  if (R.chance(.5)) glassRibbons(g, R, P, { n0: 1, n1: 3 });
  if (R.chance(.3)) water(g, R, P), g.flrY = R.r(-3, -2);
  lightOverlays(g, R, P);
  g.bloom = R.r(.4, .8); g.diffuse = R.r(.15, .35); g.shafts = Math.max(g.shafts ?? 0, R.r(.2, .6));
});

arch('bokeh', 'Bokeh Veil', 1, ['blue', 'aqua', 'orange', 'purple', 'teal', 'rainbow'], (g, R, P) => {
  darkSky(g, R, P); camStd(g, R, { d0: 5, d1: 8 });
  glowRibbons(g, R, P, { n0: 1, n1: 4 }); g.ribWidth = R.r(.8, 2);
  g.bokehAmt = R.r(.6, 1.3); g.bokehCol = H(P.a, .8, .6); g.bokehSize = R.r(.8, 2); g.bokehSpeed = R.r(.01, .03);
  g.sparkAmt = R.r(.2, .7); g.sparkCol = H(P.b, .5, .85);
  g.dof = R.r(.4, .9); g.focus = g.camDist;
  if (R.chance(.4)) { bubbles(g, R, P, { n0: 3, n1: 8 }); }
  g.bloom = R.r(1, 1.6); g.vignette = R.r(.5, .9); g.exposure = R.r(1, 1.3);
});

arch('spectral', 'Spectral Burst', .8, ['rainbow', 'blue', 'purple', 'orange'], (g, R, P) => {
  darkSky(g, R, P); g.glowAmt = R.r(0, .4); camStd(g, R, { d0: 6, d1: 9 });
  sunAhead(g, R, R.r(-.08, .08), R.r(-.2, .2)); g.sunInt = R.r(1.5, 3); g.sunCol = [1, 1, 1]; g.sunSize = R.r(.2, .5);
  g.burstAmt = R.r(.6, 1.3); g.flareAmt = R.r(.3, .8);
  g.streakAmt = R.r(.5, 1.1); g.streakRainbow = R.r(.6, 1); g.streakCol = H(P.a, .8, .7); g.streakSpeed = R.r(.04, .1); g.streakX = .5; g.streakY = .5;
  if (R.chance(.45)) { glowRibbons(g, R, P, { n0: 3, n1: 6 }); g.ribHue = R.r(.6, 1); }
  if (R.chance(.3)) darkFloor(g, R, P);
  g.bloom = R.r(1, 1.6); g.shafts = R.r(.4, 1);
});

arch('vista', 'Vista Waves', 2.2, ['blue', 'purple', 'teal', 'aqua', 'magenta', 'rainbow', 'red', 'green'], (g, R, P) => {
  darkSky(g, R, P, { hor: .18 }); g.glowAmt = R.r(.3, 1); g.stars = 0;
  camStd(g, R, { d0: 6, d1: 9, p0: -.05, p1: .08 }); g.camOrbit = R.r(-.002, .002);
  glowRibbons(g, R, P, { n0: 3, n1: 5 });
  g.ribWidth = R.r(1, 2.4); g.ribThick = R.r(.004, .012); g.ribAmp = R.r(.25, .7); g.ribFreq = R.r(.15, .35);
  g.ribTwist = R.r(-.15, .15); g.ribAngle = R.r(-.4, .4); g.ribSpread = R.r(.15, .5); g.ribGlow = R.r(.25, 1); g.ribLines = R.r(.25, .8); g.ribLineN = R.r(18, 45);
  g.ribYaw = R.r(-.4, .4); g.ribRoll = R.r(-.35, .35); g.ribSpeed = R.r(.02, .05) * R.sign();
  if (R.chance(.7)) { g.dotsAmt = R.r(.2, .6); g.dotsCol = H(P.a, .8, .55); g.dotsOff = R.r(-.42, -.2); g.dotsWidth = R.r(.08, .18); g.dotsScale = R.r(80, 160); g.dotsFade = R.r(-2, 2); g.dotsAngle = R.r(-.2, .2); }
  if (R.chance(.3)) { g.bokehAmt = R.r(.15, .4); g.bokehCol = H(P.b, .8, .6); g.bokehSize = R.r(.6, 1.2); g.bokehSpeed = .01; }
  g.bloom = R.r(.8, 1.4); g.vignette = R.r(.5, 1); g.contrast = R.r(1, 1.15); g.exposure = R.r(1, 1.3);
});

arch('mercury', 'Mercury Rings', .9, ['blue', 'rainbow', 'aqua', 'purple'], (g, R, P) => {
  const dark = R.chance(.4);
  if (dark) darkSky(g, R, P), g.glowAmt = R.r(.8, 2); else if (R.chance(.5)) brightSky(g, R, P); else paleSky(g, R, P);
  g.flrW = 1; g.flrY = -1.5; g.waterCol = dark ? H(0, 0, .03) : H(R.r(190, 220), R.r(.1, .4), R.r(.4, .65));
  g.mirror = R.r(.75, 1); g.waveAmp = R.r(.005, .03); g.caustic = 0;
  g.ripAmt = R.r(1, 2.5); g.ripFreq = R.r(3, 9); g.ripSpeed = R.r(.6, 1.4); g.ripSpread = R.r(0, 3.5); g.ripX = R.r(-1, 1); g.ripZ = R.r(-1, 1);
  g.camTX = g.ripX; g.camTZ = g.ripZ; g.camTY = -1.5; g.camDist = R.r(4, 7); g.camPitch = R.r(.45, 1); g.camYaw = R.r(-1, 1); g.camZoom = R.r(1.3, 2); g.camDrift = R.r(.1, .3); g.camOrbit = R.r(-.008, .008);
  if (R.chance(.5)) { bubbles(g, R, P, { n0: 1, n1: 3 }); g.sphX = g.ripX; g.sphZ = g.ripZ; g.sphY = R.r(-.8, 0); g.sphSpread = R.r(.5, 2); g.sphSize = R.r(.15, .35); g.sphIrid = R.r(.3, .9); }
  g.bloom = R.r(.4, .9); g.contrast = R.r(1.05, 1.2);
});

arch('conservatory', 'Glass Conservatory', .9, ['green', 'teal', 'aqua'], (g, R, P) => {
  brightSky(g, R, P); water(g, R, P); g.flrY = -1.2; g.waterCol = H(R.r(165, 185), .8, .3);
  g.tunW = 1; g.tunPoly = 1; g.tunSides = R.pick([3, 4, 6]); g.tunRadius = R.r(3, 4.2); g.tunSpacing = R.r(1.6, 3); g.tunThick = R.r(.08, .18);
  g.tunFlat = R.r(.6, 1); g.tunBandW = R.r(.08, .25); g.tunRails = R.r(.3, .9); g.tunRailN = R.pick([6, 8]); g.tunCol = H(P.a, .6, .75); g.tunGlass = R.r(.5, .85); g.tunY = R.r(.3, 1);
  g.treeW = 1; g.treeX = R.r(4, 5.5) * R.sign(); g.treeZ = R.r(-8, -4); g.treeSize = R.r(1.6, 2.4); g.treeCol = H(R.r(95, 135), .7, .28); g.treeSeed = R.int(1, 99);
  g.terW = 1; g.terIsland = R.r(1.2, 1.8); g.terSink = .6; g.terAmp = 0; g.terScale = .4; g.terCol = H(100, .6, .3); g.terCol2 = H(45, .3, .4);
  g.camDist = R.r(2, 4); g.camYaw = R.r(-.3, .3); g.camPitch = R.r(-.1, .04); g.camTY = R.r(.2, .9); g.camZoom = R.r(1.1, 1.5); g.camTravel = R.r(.06, .15); g.camDrift = .2;
  sunAhead(g, R, R.r(.3, .6), R.r(-.4, .4));
  lightOverlays(g, R, P);
  g.bloom = R.r(.5, .9); g.shafts = R.r(.3, .8); g.diffuse = R.r(.15, .35);
});

export const ARCH_KEYS = Object.keys(ARCH);

export function generate(key, seed) {
  const R = new Rng(seed), A = ARCH[key];
  const P = palette(R, A.prefer);
  const g = {};
  A.fn(g, R, P);
  return { g: pack(g), name: A.name, key, seed, pal: P.fam };
}

// copy every parameter of one group from src into dst
function graft(dst, src, grp) {
  for (const p of PARAMS) if (p.grp === grp) for (let i = 0; i < p.size; i++) dst[p.off + i] = src[p.off + i];
}
const active = (g, grp) => g[IDX[GROUP_WEIGHT[grp]].off] > 0.01;

export function hybrid(seed) {
  const R = new Rng(seed);
  const pickArch = () => R.weighted(ARCH_KEYS.map(k => [k, ARCH[k].w]));
  const a = pickArch(); let b = pickArch(); if (b === a) b = pickArch();
  const A = generate(a, R.int(1, 1e9)), B = generate(b, R.int(1, 1e9));
  const g = A.g;
  const donors = FAMILIES.filter(f => active(B.g, f) && f !== 'flr' && f !== 'ter');
  let n = 0;
  for (const f of donors) if (R.chance(.6) || n === 0) { graft(g, B.g, f); n++; if (n >= 2) break; }
  if (R.chance(.35)) for (const grp of ['env', 'cloud', 'glow']) graft(g, B.g, grp);
  for (const o of OVERLAYS) if (active(B.g, o) && R.chance(.4)) graft(g, B.g, o);
  if (R.chance(.4)) shiftHues(g, R.r(-60, 60));
  return { g, name: `${A.name} × ${B.name}`, key: 'hybrid', seed, pal: A.pal };
}

function shiftHues(g, deg) {
  for (const p of PARAMS) if (p.kind === 'c') {
    const c = hueShift([g[p.off], g[p.off + 1], g[p.off + 2]], deg);
    g.set(c, p.off);
  }
}

export function mutate(src, seed, strength = 1) {
  const R = new Rng(seed);
  const g = new Float32Array(src);
  if (R.chance(.55)) shiftHues(g, R.r(-35, 35) * strength);
  const live = new Set(['cam', 'env', 'pst']);
  for (const grp in GROUP_WEIGHT) if (active(g, grp)) live.add(grp);
  for (const p of PARAMS) {
    if (p.kind !== 'f' || !live.has(p.grp) || p.name === GROUP_WEIGHT[p.grp]) continue;
    if (R.chance(.35)) g[p.off] = Math.min(p.hi, Math.max(p.lo, g[p.off] + R.gauss() * p.sig * strength));
  }
  // structural changes
  if (R.chance(.25)) {
    const o = R.pick(OVERLAYS); const donor = generate(R.pick(ARCH_KEYS), R.int(1, 1e9)).g;
    if (active(g, o)) g[IDX[GROUP_WEIGHT[o]].off] = 0; else if (active(donor, o)) graft(g, donor, o);
  }
  if (R.chance(.22)) {
    const donor = generate(R.pick(ARCH_KEYS), R.int(1, 1e9)).g;
    const cand = FAMILIES.filter(f => active(donor, f) && !active(g, f) && f !== 'flr' && f !== 'ter');
    if (cand.length) graft(g, donor, R.pick(cand));
  }
  if (R.chance(.15)) {
    const act = FAMILIES.filter(f => active(g, f) && f !== 'flr' && f !== 'ter');
    if (act.length > 1) g[IDX[GROUP_WEIGHT[R.pick(act)]].off] = 0;
  }
  return g;
}

// ---------------------------------------------------------------- evolver
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);

export class Evolver {
  constructor(seed, startKey) {
    this.rng = new Rng(seed);
    this.pace = 1; this.paused = false; this.lock = '';
    this.phases = new Float32Array(NPH * 4);
    this.history = []; this.hpos = -1;
    const first = startKey ? generate(startKey, this.rng.int(1, 1e9)) : this.pickNext(null);
    this.cur = new Float32Array(first.g);
    this.info = first; this.target = first;
    this.push(first);
    this.state = 'hold'; this.t = 0; this.holdDur = this.rng.r(18, 30);
  }

  push(e) { this.history.splice(this.hpos + 1); this.history.push(e); this.hpos = this.history.length - 1; if (this.history.length > 60) { this.history.shift(); this.hpos--; } }

  pickNext(base) {
    const R = this.rng, seed = R.int(1, 2 ** 31 - 2);
    if (this.lock) {
      if (base && R.chance(.4)) return { ...this.info, g: mutate(base, seed, .8), name: this.info.name, seed };
      return generate(this.lock, seed);
    }
    const roll = R.r(0, 1);
    if (base && roll < .3) return { ...this.info, g: mutate(base, seed), seed };
    if (roll < .85) return generate(R.weighted(ARCH_KEYS.map(k => [k, ARCH[k].w])), seed);
    return hybrid(seed);
  }

  next(fast = false) { this.begin(this.pickNext(this.target.g), fast, true); }
  prev() { if (this.hpos > 0) { this.hpos--; this.begin(this.history[this.hpos], true, false); } }
  forward() { if (this.hpos < this.history.length - 1) { this.hpos++; this.begin(this.history[this.hpos], true, false); } else this.next(true); }
  jump(key) { this.begin(generate(key, this.rng.int(1, 2 ** 31 - 2)), true, true); }
  show(key, seed) { // debug: snap straight to a scene with no morph
    const e = key === 'hybrid' ? hybrid(seed) : generate(key, seed);
    this.push(e); this.cur.set(e.g); this.info = this.target = e; this.state = 'hold'; this.t = 0; this.holdDur = 1e9;
    return e;
  }
  mutateNow() { const seed = this.rng.int(1, 2 ** 31 - 2); this.begin({ ...this.info, g: mutate(this.target.g, seed, 1.3), seed }, true, true); }

  begin(entry, fast, record) {
    if (record) this.push(entry);
    const from = new Float32Array(this.cur), to = new Float32Array(entry.g);
    // families that appear take their target shape immediately and only grow in;
    // families that vanish keep their current shape and only fade out.
    for (const grp in GROUP_WEIGHT) {
      const w = IDX[GROUP_WEIGHT[grp]].off;
      const fOn = from[w] > 0.01, tOn = to[w] > 0.01;
      for (const p of PARAMS) {
        if (p.grp !== grp || p.off === w) continue;
        for (let i = 0; i < p.size; i++) {
          const k = p.off + i;
          if (!fOn) from[k] = to[k];
          else if (!tOn || p.kind === 'd') to[k] = from[k];
        }
      }
    }
    this.from = from; this.to = to;
    // stagger: each group starts at its own moment and takes its own time
    const R = this.rng; const grpT = {};
    for (const p of PARAMS) if (!grpT[p.grp]) { const s = R.r(0, .45); grpT[p.grp] = [s, R.r(.4, 1 - s)]; }
    this.win = PARAMS.map(p => grpT[p.grp]);
    this.colLab = PARAMS.map(p => p.kind === 'c' ? [toLab([from[p.off], from[p.off + 1], from[p.off + 2]]), toLab([to[p.off], to[p.off + 1], to[p.off + 2]])] : null);
    this.target = entry; this.info = entry;
    this.state = 'morph'; this.t = 0;
    this.dur = fast ? R.r(9, 14) : R.r(28, 46);
  }

  get progress() { return this.state === 'morph' ? this.t / this.dur : this.t / this.holdDur; }

  update(dt) {
    const sdt = dt * this.pace;
    if (!this.paused || this.state === 'morph') this.t += sdt;
    if (this.state === 'morph') {
      const u = Math.min(this.t / this.dur, 1);
      for (let i = 0; i < PARAMS.length; i++) {
        const p = PARAMS[i], [s, len] = this.win[i];
        const e = smoother(Math.min(Math.max((u - s) / len, 0), 1));
        if (p.kind === 'c') {
          const [a, b] = this.colLab[i];
          this.cur.set(fromLab([a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]), p.off);
        } else if (p.kind === 'd') this.cur[p.off] = this.to[p.off];
        else this.cur[p.off] = this.from[p.off] + (this.to[p.off] - this.from[p.off]) * e;
      }
      if (u >= 1) { this.cur.set(this.to); this.state = 'hold'; this.t = 0; this.holdDur = this.rng.r(16, 32); }
    } else if (!this.paused && this.t >= this.holdDur) this.next(false);
    for (const name of RATES) this.phases[IDX[name].phase] += this.cur[IDX[name].off] * dt;
  }
}
