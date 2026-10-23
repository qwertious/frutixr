import { Renderer } from './renderer.js?v=7';
import { RasterRenderer } from './raster.js?v=7';
import { Evolver, ARCH, ARCH_KEYS, IDX, Rng } from './genome.js?v=7';

const $ = s => document.querySelector(s);
const canvas = $('#view');
const status = $('#status');

// ---------------------------------------------------------------- state from URL
const hash = new URLSearchParams(location.hash.slice(1));
const seed = Number(hash.get('s')) || (Math.random() * 2 ** 31) | 0;
const startKey = ARCH[hash.get('a')] ? hash.get('a') : null;

// ?gl1 (or #gl1) forces the WebGL1 path, for testing what older phones get
const query = new URLSearchParams(location.search);
const forceGL1 = hash.has('gl1') || query.has('gl1');
const forceLDR = hash.has('ldr') || query.has('ldr');
// Two engines: the raymarcher (exact glass, reflections, shadows; needs a strong
// GPU) and the rasterizer ("smooth": the same scenes as geometry, fast anywhere).
const touch = matchMedia('(pointer: coarse)').matches;
const gl2ok = !forceGL1 && !!document.createElement('canvas').getContext('webgl2');
let engine = query.get('engine') || localGet('aero.engine') || (touch || !gl2ok ? 'smooth' : 'ray');
if (engine !== 'ray') engine = 'smooth';
let R, evo;
try {
  R = engine === 'smooth' ? new RasterRenderer(canvas, { forceGL1, forceLDR }) : new Renderer(canvas, { forceGL1, forceLDR });
} catch (e) { fail(e.message); throw e; }
evo = new Evolver(seed, startKey);
if (hash.get('lock') && ARCH[hash.get('lock')]) evo.lock = hash.get('lock');

// Each level picks a shader tier, a render-scale range the adapter moves within,
// a pixel-ratio cap, and whether the scene is traced interleaved (a quarter of
// the pixels per frame). Low and Potato are for phones: Low is the default on
// touch devices, Potato on WebGL1. Medium and up are untouched desktop quality.
const QUALITY = {
  potato: { tier: 'potato', scale: [.3, .6], dpr: 1, interleave: true },
  low: { tier: 'lite', scale: [.35, .7], dpr: 1.25, interleave: true },
  medium: { tier: 'full', scale: [.35, .7], dpr: 2, interleave: false },
  high: { tier: 'full', scale: [.5, .9], dpr: 2, interleave: false },
  ultra: { tier: 'full', scale: [.7, 1], dpr: 2, interleave: false },
};
const LEVELS = Object.keys(QUALITY);
// the rasterizer is cheap enough for sharp images and needs no interleaving
const SMOOTH_SCALE = { potato: [.45, .75], low: [.55, .9], medium: [.7, 1], high: [.85, 1], ultra: [1, 1] };
let quality = localGet('aero.quality') || (!R.gl2 ? 'potato' : touch ? 'low' : 'medium');
if (!QUALITY[quality]) quality = 'medium';
let QUALITY_NOW = QUALITY[quality];
// start at the bottom of a level's range and let the adapter climb: jumping
// straight to a heavy frame is what makes weak GPUs reset
function applyQuality() {
  let Q = QUALITY[quality];
  if (R.raster) Q = { ...Q, scale: SMOOTH_SCALE[quality], interleave: false };
  QUALITY_NOW = Q;
  R.scale = Q.scale[0]; R.dprCap = Q.dpr; R.interleave = Q.interleave;
  ftAvg = 16.7; slowChecks = 0;
}

function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
function fail(msg) { status.classList.add('err'); status.textContent = msg; status.hidden = false; }

// ---------------------------------------------------------------- camera
const v = name => evo.cur[IDX[name].off];
const ph = name => evo.phases[IDX[name].phase];
function camera(t) {
  const drift = v('camDrift');
  const yaw = v('camYaw') + ph('camOrbit') + drift * .12 * Math.sin(t * .031) + drift * .05 * Math.sin(t * .071 + 2);
  const pitch = v('camPitch') + drift * .04 * Math.sin(t * .023 + 1.3);
  const tgt = [v('camTX') + drift * .3 * Math.sin(t * .017), v('camTY') + drift * .15 * Math.sin(t * .029 + 2), v('camTZ')];
  const d = v('camDist'), cp = Math.cos(pitch);
  const pos = [tgt[0] + d * cp * Math.sin(yaw), tgt[1] + d * Math.sin(pitch), tgt[2] + d * cp * Math.cos(yaw)];
  if (v('flrW') > .5) pos[1] = Math.max(pos[1], v('flrY') - (1 - v('flrW')) * 40 + .25);
  const f = norm(sub(tgt, pos));
  let r = norm(cross(f, [0, 1, 0]));
  let u = cross(r, f);
  const roll = v('camRoll') + drift * .015 * Math.sin(t * .043);
  const c = Math.cos(roll), s = Math.sin(roll);
  [r, u] = [add(mul(r, c), mul(u, s)), add(mul(r, -s), mul(u, c))];
  return { pos, rot: new Float32Array([...r, ...u, ...f]), r, u, f };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / Math.hypot(...a));

function sunScreen(cam) {
  const e = v('sunElev'), y = v('sunYaw'), ce = Math.cos(e);
  const s = [Math.sin(y) * ce, Math.sin(e), -Math.cos(y) * ce];
  const z = dot(s, cam.f);
  if (z <= 0.02) return { uv: [0.5, 0.5], vis: 0 };
  const zoom = v('camZoom'), asp = canvas.width / canvas.height, fov = Math.min(1, asp * 1.2); // matches the scene shader
  const sx = dot(s, cam.r) / z * zoom, sy = dot(s, cam.u) / z * zoom;
  const uv = [sx * fov / asp + .5, sy * fov + .5];
  const edge = Math.max(Math.abs(uv[0] - .5), Math.abs(uv[1] - .5));
  return { uv, vis: Math.min(1, z * 4) * Math.max(0, Math.min(1, (1.1 - edge) / .5)) };
}

// ---------------------------------------------------------------- adaptive quality
let ftAvg = 16, lastAdapt = 0, lastDrop = -1e9, slowChecks = 0;
function adapt(dt, now) {
  ftAvg += (dt * 1000 - ftAvg) * .08;
  if (now - lastAdapt < 1200) return;
  lastAdapt = now;
  const [lo, hi] = QUALITY_NOW.scale;
  let s = R.scale;
  if (ftAvg > 50) { s *= .75; lastDrop = now; }
  else if (ftAvg > 30) { s *= .85; lastDrop = now; }
  else if (ftAvg > 21) { s *= .93; lastDrop = now; }
  else if (ftAvg < 17.5 && now - lastDrop > 6000) s *= 1.05;
  s = Math.min(hi, Math.max(lo, Math.round(s * 40) / 40));
  // already at the floor of this level and still far too slow: drop a level
  slowChecks = s === lo && ftAvg > 45 ? slowChecks + 1 : 0;
  if (slowChecks >= 5 && quality !== LEVELS[0]) { setQuality(LEVELS[LEVELS.indexOf(quality) - 1], true); return; }
  if (s !== R.scale) { R.scale = s; ftAvg = 16.7; }
}

// ---------------------------------------------------------------- loop
let last = performance.now(), time = 0, running = false, shot = false;
// Crystal shard frames depend only on the genome, so build them once per frame
// here instead of per pixel per march step. Inactive shards get length 0.
const shards = new Float32Array(48 * 4);
function shardFrames() {
  shards.fill(0);
  const w = v('shdW');
  if (w <= .01) return shards;
  const R = new Rng(Math.round(v('shdSeed')) * 7919 + 13);
  const n = v('shdCount'), flat = v('shdFlat'), L = v('shdLen'), T = v('shdThick');
  for (let i = 0; i < 24; i++) {
    const hx = R.r(0, 1), hy = R.r(0, 1), hz = R.r(0, 1), hw = R.r(0, 6.283);
    const on = Math.min(Math.max(n - i, 0), 1);
    if (on <= 0) break;
    const a = hx * 6.283, z = (hy * 2 - 1) * flat, s = Math.sqrt(Math.max(1 - z * z, 0));
    const dir = norm([s * Math.cos(a), z, s * Math.sin(a)]);
    const up = Math.abs(dir[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const bx0 = norm(cross(up, dir)), by0 = cross(dir, bx0);
    const bx = add(mul(bx0, Math.cos(hw)), mul(by0, Math.sin(hw)));
    shards.set([...dir, L * (.45 + hz) * on * w, ...bx, T * (.5 + hy) * on * w + 1e-3], i * 8);
  }
  return shards;
}
function draw() {
  const cam = camera(time);
  const sun = sunScreen(cam);
  R.render({ time, camPos: cam.pos, camRot: cam.rot, genome: evo.cur, phases: evo.phases, sunUV: sun.uv, sunVis: sun.vis, bloomThr: v('bloomThr'), shards: shardFrames() });
}
function frame(now) {
  if (lost) return;
  const dt = Math.min((now - last) / 1000, .1);
  last = now; time += dt;
  evo.update(dt);
  draw();
  if (shot) { shot = false; saveShot(); }
  adapt(dt, now);
  ui(now);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- UI
const sel = $('#lock');
for (const k of ARCH_KEYS) sel.add(new Option(ARCH[k].name, k));
sel.value = evo.lock;
const qsel = $('#quality');
qsel.value = quality;
const pace = $('#pace');
pace.value = localGet('aero.pace') || '1';
evo.pace = +pace.value;

let lastName = '', idle = 0, lastMove = performance.now();
function ui(now) {
  const name = evo.info.name;
  if (name !== lastName) {
    lastName = name;
    $('#scene').textContent = name;
    $('#sub').textContent = evo.info.key === 'hybrid' ? 'hybrid' : `${evo.info.pal} · #${evo.info.seed % 100000}`;
  }
  $('#bar').style.width = `${Math.min(evo.progress, 1) * 100}%`;
  $('#bar').classList.toggle('morph', evo.state === 'morph');
  $('#phase').textContent = evo.state === 'morph' ? 'evolving' : evo.paused ? 'held' : 'resting';
  const show = now - lastMove < 3200 || document.body.matches(':has(.chrome:hover)') || document.activeElement?.closest?.('.chrome');
  document.body.classList.toggle('idle', !show);
}
addEventListener('pointermove', () => { lastMove = performance.now(); });
addEventListener('pointerdown', () => { lastMove = performance.now(); });

const playBtn = $('#play');
function setPaused(p) { evo.paused = p; playBtn.textContent = p ? '▶' : '❚❚'; playBtn.title = p ? 'Resume evolving (P)' : 'Hold this scene (P)'; }
setPaused(false);
playBtn.onclick = () => setPaused(!evo.paused);
$('#next').onclick = () => evo.forward();
$('#prev').onclick = () => evo.prev();
$('#mutate').onclick = () => evo.mutateNow();
sel.onchange = () => { evo.lock = sel.value; if (sel.value) evo.jump(sel.value); };
qsel.onchange = () => setQuality(qsel.value, false);
const esel = $('#engine');
esel.value = engine;
esel.onchange = () => { localSet('aero.engine', esel.value); location.reload(); };
function setQuality(q, auto) {
  const tierChanged = QUALITY[q].tier !== QUALITY[quality].tier;
  quality = q; qsel.value = q; localSet('aero.quality', q);
  applyQuality();
  if (tierChanged) build();
  if (auto) toast(`Running slowly, so quality dropped to ${qsel.selectedOptions[0].textContent}`);
}
pace.oninput = () => { evo.pace = +pace.value; localSet('aero.pace', pace.value); $('#paceVal').textContent = `${(+pace.value).toFixed(2).replace(/0$/, '')}×`; };
pace.oninput();
$('#full').onclick = toggleFull;
$('#shot').onclick = () => { shot = true; };
$('#link').onclick = async () => {
  const url = `${location.origin}${location.pathname}#s=${evo.info.seed}&a=${evo.info.key === 'hybrid' ? '' : evo.info.key}`;
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
};
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
function saveShot() {
  canvas.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `aeroscape-${evo.info.name.replace(/\W+/g, '-').toLowerCase()}-${Date.now() % 1e6}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }

addEventListener('keydown', e => {
  if (e.target.matches('input, select')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'arrowright') { e.preventDefault(); evo.forward(); }
  else if (k === 'arrowleft') evo.prev();
  else if (k === 'p') setPaused(!evo.paused);
  else if (k === 'm') $('#mutate').click();
  else if (k === 'f') toggleFull();
  else if (k === 's') shot = true;
  else if (k === 'h') document.body.classList.toggle('hideui');
  lastMove = performance.now();
});

// console hook: aero.evo.show('atrium', 7) snaps to a scene; aero.renderNow(dt) steps and draws synchronously
function renderNow(dt = 0) { time += dt; evo.update(dt); draw(); }
window.aero = { evo, R, ARCH_KEYS, renderNow, stats: () => ({ ft: ftAvg, scale: R.scale, w: canvas.width, h: canvas.height }) };

// ---------------------------------------------------------------- boot
// (re)compile for the current quality tier; the previous programs keep drawing meanwhile
let building = null;
function build() {
  status.classList.remove('err');
  status.textContent = running ? 'Switching quality…' : 'Compiling shaders…';
  status.hidden = false;
  const job = building = R.compile({ tier: QUALITY[quality].tier }).then(() => {
    if (job !== building) return;
    status.hidden = true;
    $('#mode').textContent = R.mode;
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  }).catch(e => { console.error(e); fail(String(e.message || e)); });
}
// If the GPU takes too long on a frame the browser resets it and the canvas
// goes dead. Recover by reloading one quality level lower instead of flashing.
let lost = false;
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  lost = true;
  const i = LEVELS.indexOf(quality);
  if (i > 0) localSet('aero.quality', LEVELS[i - 1]);
  status.classList.remove('err');
  status.textContent = i > 0 ? `The graphics driver reset. Reloading at ${LEVELS[i - 1]} quality…` : 'The graphics driver reset. Reloading…';
  status.hidden = false;
  setTimeout(() => location.reload(), 1800);
});
if (!R.highp) toast('This GPU lacks high-precision shaders; expect artefacts');
applyQuality();
build();
