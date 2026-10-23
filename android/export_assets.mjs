// Generates the Android wallpaper's assets from the web engine, so both stay in
// step: every shader variant with its uniform layout, the parameter schema, and
// a library of scenes produced by the real archetype generators.
//
//   node export_assets.mjs OUT_DIR [scenesPerStyle]
import fs from 'fs';
import path from 'path';
import * as G from '../js/genome.js';
import * as S from '../js/shaders.js';
import * as R from '../js/rshaders.js';

const out = process.argv[2];
const PER = Number(process.argv[3] || 100);
if (!out) { console.error('usage: node export_assets.mjs OUT_DIR [scenesPerStyle]'); process.exit(1); }
fs.mkdirSync(path.join(out, 'shaders'), { recursive: true });
fs.mkdirSync(path.join(out, 'packs'), { recursive: true });

const OVERLAYS = ['dots', 'bokeh', 'lines', 'streak', 'spark'];
const NFLOAT = G.NVEC4 * 4, NPH = G.NPH * 4;

// ---------------------------------------------------------------- schema (shared by all packs)
const num = v => v === Infinity ? 'inf' : v === -Infinity ? '-inf' : String(v);
let schema = `N ${NFLOAT} ${NPH}\n`;
for (const p of G.PARAMS) {
  schema += `P ${p.name} ${p.grp} ${p.kind} ${p.size} ${p.off} ${p.sig} ${num(p.lo)} ${num(p.hi)} ${p.phase ?? -1} ${p.def.join(',')}\n`;
}
schema += `R ${G.RATES.join(' ')}\n`;
for (const [grp, w] of Object.entries(G.GROUP_WEIGHT)) schema += `W ${grp} ${w}\n`;
schema += `F ${G.FAMILIES.join(' ')}\n`;
schema += `O ${OVERLAYS.join(' ')}\n`;
fs.writeFileSync(path.join(out, 'schema.txt'), schema);

// ---------------------------------------------------------------- packs
// A pack is a set of styles (scene generators), its colour schemes and a library
// of pre-generated scenes. Frutiger Aero is the first; more can follow.
//   packs/index.txt           one pack key per line
//   packs/KEY/pack.txt        K key, N name, D description, A style lines, C colour scheme lines
//   packs/KEY/library.bin     int32 count, int32 nfloat, per scene: int16 style, int16 scheme, float32[nfloat]
const PACKS = [{
  key: 'aero',
  name: 'Frutiger Aero',
  desc: 'Glass, water, sky and light: the optimistic 2000s Frutiger Aero look.',
  styles: G.ARCH_KEYS,
  // key, representative hue (-1: multicoloured, never hue-shifted), display name
  schemes: [['blue', 213, 'Blue'], ['aqua', 188, 'Aqua'], ['green', 100, 'Green'], ['teal', 175, 'Teal'],
    ['purple', 273, 'Purple'], ['orange', 29, 'Orange'], ['rainbow', -1, 'Rainbow'], ['magenta', 308, 'Magenta'], ['red', 0, 'Red']],
}];
let index = '';
for (const pack of PACKS) {
  const dir = path.join(out, 'packs', pack.key);
  fs.mkdirSync(dir, { recursive: true });
  index += pack.key + '\n';
  let txt = `K ${pack.key}\nN ${pack.name}\nD ${pack.desc}\n`;
  for (const k of pack.styles) txt += `A ${k} ${G.ARCH[k].w} ${G.ARCH[k].name}\n`;
  for (const [k, h, n] of pack.schemes) txt += `C ${k} ${h} ${n}\n`;
  fs.writeFileSync(path.join(dir, 'pack.txt'), txt);
  const keys = pack.schemes.map(c => c[0]);
  const entries = [];
  pack.styles.forEach((k, ai) => {
    for (let i = 0; i < PER; i++) {
      const e = G.generate(k, ((ai + 1) * 100003 + i * 7919) >>> 0);
      entries.push([ai, Math.max(0, keys.indexOf(e.pal)), e.g]);
    }
  });
  const buf = Buffer.alloc(8 + entries.length * (4 + NFLOAT * 4));
  buf.writeInt32LE(entries.length, 0);
  buf.writeInt32LE(NFLOAT, 4);
  let o = 8;
  for (const [ai, pi, g] of entries) {
    buf.writeInt16LE(ai, o); buf.writeInt16LE(pi, o + 2); o += 4;
    for (let i = 0; i < NFLOAT; i++, o += 4) buf.writeFloatLE(g[i] ?? 0, o);
  }
  fs.writeFileSync(path.join(dir, 'library.bin'), buf);
  console.log(`pack ${pack.key}: ${entries.length} scenes in ${pack.styles.length} styles`);
}
fs.writeFileSync(path.join(out, 'packs', 'index.txt'), index);

// ---------------------------------------------------------------- shaders
// The wallpaper composite crossfades between two finished keyframes, so every
// read of a scene-derived texture becomes a mix of slot A and slot B.
function blendify(src) {
  src = src.replace('uniform sampler2D uBloom;', `uniform sampler2D uBloom;
uniform sampler2D uSceneB;
uniform sampler2D uD1B;
uniform sampler2D uD2B;
uniform sampler2D uBloomB;
uniform float uMix;
#define TEXM(a, b, p) mix(TEX(a, p), TEX(b, p), uMix)`);
  return src.replace(/TEX\((uScene|uD1|uD2|uBloom), /g, 'TEXM($1, $1B, ');
}

let layouts = '';
const lay = (name, L) => { layouts += `${name} ${L.ng} ${L.nph} | ${[...L.map].join(' ')} | ${[...L.phMap].join(' ')}\n`; };
const write = (name, src) => fs.writeFileSync(path.join(out, 'shaders', name + '.glsl'), src);
for (const es3 of [true, false]) {
  const es = es3 ? 'es3' : 'es2';
  write(`vert_${es}`, S.VERT({ es3 }));
  for (const hdr of [true, false]) {
    const tag = `${es}_${hdr ? 'hdr' : 'ldr'}`;
    const base = { es3, hdr, cpuShards: false };
    write(`down_${tag}`, S.DOWN(base));
    write(`up_${tag}`, S.UP(base));
    for (const tier of ['potato', 'lite', 'full']) {
      const o2 = { ...base, tier, lite: tier !== 'full', potato: tier === 'potato' };
      const L = G.layout(S.SCENE('', o2));
      write(`scene_${tag}_${tier}`, S.SCENE(L.defs, o2));
      lay(`scene_${tag}_${tier}`, L);
    }
    for (const lite of [true, false]) {
      const o2 = { ...base, lite, potato: false };
      const L = G.layout(blendify(S.COMPOSITE('', o2)));
      const name = `comp_${tag}_${lite ? 'lite' : 'full'}`;
      write(name, blendify(S.COMPOSITE(L.defs, o2)));
      lay(name, L);
    }
  }
}
// Smooth (rasterized) engine: GLSL ES 1.00 only (ES3 contexts run it too). Its
// 8-bit fallback stores linear values ("lin"), because blending needs them.
{
  const vert = S.VERT({ es3: false });
  for (const enc of ['hdr', 'lin']) {
    const base = { es3: false, hdr: enc === 'hdr', linear: enc === 'lin', cpuShards: false };
    write(`down_es2_${enc}_r`, S.DOWN(base));
    write(`up_es2_${enc}_r`, S.UP(base));
    const oc = { ...base, lite: true, potato: false };
    const LC = G.layout(blendify(S.COMPOSITE('', oc)));
    write(`comp_es2_${enc}_r`, blendify(S.COMPOSITE(LC.defs, oc)));
    lay(`comp_es2_${enc}_r`, LC);
    for (const tier of ['potato', 'lite']) {
      const o2 = { ...base, lite: true, potato: tier === 'potato', tier };
      for (const name of R.PROGRAMS) {
        const s0 = R.rasterSources(name, '', o2);
        const L = G.layout(s0.vs + s0.fs);
        const s = R.rasterSources(name, L.defs, o2);
        const key = `r_${name}_${enc}_${tier}`;
        fs.writeFileSync(path.join(out, 'shaders', key + '.vert'), s.vs);
        fs.writeFileSync(path.join(out, 'shaders', key + '.frag'), s.fs);
        lay(key, L);
      }
    }
  }
  void vert;
}
fs.writeFileSync(path.join(out, 'layouts.txt'), layouts);
console.log(`assets: ${G.PARAMS.length} params (${NFLOAT} floats), shaders in ${path.join(out, 'shaders')}`);
