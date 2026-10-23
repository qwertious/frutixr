// GLSL sources. Every genome parameter a shader uses is reachable by name through
// #defines generated from the schema (see genome.js layout). Each source compiles
// as GLSL ES 3.00 (WebGL2) or GLSL ES 1.00 (WebGL1) depending on o.es3, and o.lite
// selects the cheaper tier for weak GPUs. o.hdr is false when float render targets
// are unavailable; colours are then squeezed into 8 bits with c / (1 + c).

export const VERT = o => o.es3 ? `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }` : `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

export const fragHead = o => (o.es3 ? `#version 300 es
precision highp float;
precision highp int;
out vec4 FRAGC;
#define TEX texture
#define VARYING in
` : `precision highp float;
precision highp int;
#define FRAGC gl_FragColor
#define TEX texture2D
#define VARYING varying
`) + (o.hdr ? `#define ENCC(c) (c)
#define DECC(c) (c)
#define ENCD(d) (d)
#define DECD(a) (a)
` : o.linear ? `#define ENCC(c) min((c) * .25, 1.)
#define DECC(c) ((c) * 4.)
#define ENCD(d) ((d) / ((d) + 8.))
#define DECD(a) (8. * (a) / max(1. - (a), 1e-3))
` : `#define ENCC(c) ((c) / (1. + (c)))
#define DECC(c) ((c) / max(1. - (c), 1e-3))
#define ENCD(d) ((d) / ((d) + 8.))
#define DECD(a) (8. * (a) / max(1. - (a), 1e-3))
`);

export const COMMON = `
#define PI 3.14159265
#define TAU 6.2831853
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash31(float p){ vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }
vec3 hueRot(vec3 c, float a){
  const vec3 k = vec3(.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca);
}
float sqc(float x){ return x * x; }
vec3 spectrum(float x){ return clamp(abs(fract(x + vec3(0., .6667, .3333)) * 6. - 3.) - 1., 0., 1.); }
`;


// The shared GLSL library, in parts, so each shader includes only what it uses.
// The uniform layout is computed from shader text (genome.js layout), so leaving
// unused families out keeps rasterizer shaders inside phones' uniform limits.
const LIB_CORE = `float noise2(vec2 p){
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
float fbm2(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < FBM_OCT; i++){ s += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; }
  return s;
}
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float smin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float maxc(vec3 v){ return max(v.x, max(v.y, v.z)); }
// tight neon falloff: bright core, short tails
float sq(float x){ return x * x; }
float glowK(float d, float w){ float x = d / w; float q = 1. / (1. + x * x); return q * q; }

vec3 SUN;
float TREEY;
float gClouds = 1.; // the rasterizer turns clouds off for cheap reflections
vec3 gEm;
vec4 gInfo;
float gId;

vec3 angDir(float ax, float ay){ float c = cos(ay); return vec3(sin(ax) * c, sin(ay), -cos(ax) * c); }

`;
const LIB_RIB = `vec3 ribCol(float i){
  float t = ribCount > 1.5 ? clamp(i / (ribCount - 1.), 0., 1.) : 0.;
  return max(hueRot(mix(ribColA, ribColB, t), ribHue * t * TAU), 0.);
}

`;
const LIB_TER = `float terrainH(vec2 xz){
  vec2 q = xz * terScale;
  float n = noise2(q) * .6 + noise2(q * 2.03 + 7.1) * .27 + noise2(q * 4.1 + 3.3) * .13;
  float r = 1. - abs(noise2(q * .7 + 11.) * 2. - 1.);
  n = mix(n, r * r, terRidge);
  float h = n * terAmp;
  if (terNear > 0.) h *= smoothstep(terNear, terNear + 8., length(xz - vec2(camTX, camTZ)));
  vec2 di = xz - vec2(treeX, treeZ);
  h += terIsland * exp(-dot(di, di) * .18);
  return h - terSink - (1. - terW) * 10.;
}

`;
const LIB_SHADOW = `#if SHADOW_STEPS > 0
float softShadow(vec3 ro, vec3 rd);
#endif

`;
const LIB_ENV = `// ------------------------------------------------------------------ environment
vec3 env(vec3 rd){
  float y = rd.y;
  vec3 c = y > 0. ? mix(skyHor, skyTop, pow(clamp(y * 1.15, 0., 1.), skyCurve)) : mix(skyHor, skyBot, pow(clamp(-y * 2.5, 0., 1.), .6));
  if (glowAmt > .001){
    float ka = max(dot(rd, angDir(glowAX, glowAY)), 0.), kb = max(dot(rd, angDir(glowBX, glowBY)), 0.);
    float s = 10. / glowSize;
    c += glowAmt * (glowColA * (pow(ka, s) * .07 + pow(ka, s * 6.) * .25) + glowColB * (pow(kb, s) * .07 + pow(kb, s * 6.) * .25));
  }
  if (stars > .001 && y > -.05){
    vec3 q = rd * 170.;
    float h = hash13(floor(q));
    if (h > .985){
      float b = smoothstep(.14, 0., length(fract(q) - .5)) * (h - .985) * 66.;
      c += vec3(.8, .9, 1.) * b * stars * smoothstep(-.05, .25, y);
    }
  }
  if (cloudAmt * gClouds > .001 && y > 0.){
    vec2 uv = rd.xz / (y + .12) * .5 * cloudScale + vec2(PH_windSpeed, PH_windSpeed * .3);
    float n = fbm2(uv);
    float th = .78 - cloudAmt * .45;
    float cov = smoothstep(th, th + .2, n);
    float n2 = fbm2(uv + SUN.xz * .12);
    float lit = clamp(.75 + (n - n2) * 4., .35, 1.25);
    vec3 cc = cloudCol * mix(skyHor * .9, vec3(1.08), lit - .2);
    cc += sunCol * pow(max(dot(rd, SUN), 0.), 6.) * sunInt * .35;
    c = mix(c, cc, cov * smoothstep(0., .12, y));
  }
  float sd = max(dot(rd, SUN), 0.);
  c += sunCol * sunInt * (pow(sd, 900.) * 12. + pow(sd, 80. / sunSize) * .3 + pow(sd, 6.) * .05 * sunSize);
  return c;
}
vec3 ambient(vec3 n){ return mix(skyBot * .7 + skyHor * .3, skyTop * .5 + skyHor * .5, n.y * .5 + .5); }
vec3 irid(float c){ return .5 + .5 * cos(TAU * (c * 1.7 + vec3(0., .33, .67))); }

`;
const LIB_MAT_HEAD = `// ------------------------------------------------------------------ materials
struct Mat { vec3 alb; float glass; float irid; float ior; vec3 emi; float gloss; float milk; };

Mat material(float id, vec4 info, vec3 p, vec3 n, float dist){
  Mat m = Mat(vec3(.8), 0., 0., 1., vec3(0), .5, 0.);
`;
const LIB_MAT_FOOT = `  return m;
}

`;
const LIB_MAT = {
  1: `    float fi = info.z;
    vec3 c = ribCol(fi);
    m.alb = c; m.glass = ribGlass; m.irid = ribIrid; m.ior = 1. + .12 * ribGlass; m.gloss = .9; m.milk = .25;
    float v = info.y, u = info.x;
    float cosv = max(abs(dot(n, normalize(p - uCamPos))), .12);
    float fw = clamp(dist / (uRes.y * camZoom) * ribLineN * .5 / max(ribWidth, .05) / cosv * 1.5, 0., 1.);
    if (ribLines > 0.){
      float k = abs(fract(v * ribLineN * .5) - .5);
      float ln = 1. - smoothstep(.05, .05 + fw + .03, k);
      ln = mix(ln, .1, smoothstep(.15, .6, fw));
      float var = .35 + .65 * smoothstep(-.6, .9, sin(u * .45 + v * 2.3 + fi * 1.7 + info.w * 6.));
      m.emi += (c * 1.1 + .12) * ln * ribLines * var;
    }
    m.emi += mix(c, vec3(1), .5) * ribEdge * smoothstep(.8, 1., abs(v)) * .9;
    if (ribDots > 0.){
      vec2 g = vec2(u * ribLineN * .3, v * ribLineN * .3);
      vec2 f = fract(g) - .5;
      float rad = .42 * smoothstep(-1., 1., v);
      float dt = smoothstep(rad, rad - .1 - fw, length(f));
      m.emi += c * dt * ribDots * .8;
      m.alb = mix(m.alb, vec3(.04), dt * ribDots * .5);
    }
    m.emi += c * ribGlow * .05;
`,
  2: `    m.alb = sphCol; m.glass = sphGlass; m.irid = sphIrid; m.ior = 1.33; m.gloss = 1.; m.milk = .1;
`,
  3: `    m.alb = shdCol; m.glass = shdGlass; m.ior = 1.45; m.gloss = 1.; m.milk = .3;
    vec3 a = abs(info.xyz);
    float edge = smoothstep(.75, .98, a.x + a.y) + smoothstep(.85, 1., a.z);
    m.emi = shdCol * shdGlow * (.25 + edge * .8);
`,
  4: `    m.alb = tunCol; m.glass = tunGlass; m.ior = 1.08; m.gloss = .9; m.milk = .35;
    float edge = smoothstep(.7, 1., abs(info.y)) * tunFlat;
    m.emi = tunCol * (tunGlow * .5 + edge * (.3 + tunGlow));
`,
  5: `    m.alb = arcCol; m.gloss = arcGloss;
    float strip = info.z * smoothstep(.06, .0, abs(info.w)) * step(n.y, .5);
    m.emi = arcLightCol * arcLight * strip * 3.;
    m.alb *= .8 + .2 * smoothstep(.0, .25, info.x);
`,
  6: `    m.alb = blkCol; m.glass = blkGlass; m.ior = 1.2; m.gloss = .9; m.milk = .3;
    vec3 a = abs(info.xyz);
    float s2 = a.x + a.y + a.z - maxc(a) - min(a.x, min(a.y, a.z));
    float edge = smoothstep(.86, .97, s2);
    m.emi = blkCol * (blkEdge * edge * 2. + blkGlow * .3);
`,
  7: `    m.alb = hlxCol; m.glass = hlxGlass; m.ior = 1.15; m.gloss = .9; m.milk = .3;
    m.emi = mix(hlxCol, vec3(1), .5) * smoothstep(.8, 1., abs(info.x)) * .8;
`,
  8: `    float nn = noise3(p * 3.1 / treeSize) * .6 + noise3(p * 9. / treeSize) * .4;
    m.alb = treeCol * (.2 + 1.3 * nn * nn) * (.45 + .55 * clamp(info.y - .9, 0., 1.)) * (.6 + .4 * max(n.y, 0.)); m.gloss = .15;
`,
  9: `    m.alb = vec3(.07, .045, .03); m.gloss = .1;
`,
  10: `    float nn = noise2(p.xz * .7);
    m.alb = mix(terCol, terCol2, smoothstep(.3, .75, nn));
    m.alb = mix(m.alb, terCol2 * .6, smoothstep(.75, .45, n.y));
    m.gloss = .12;
`,
};
const LIB_SHADE = `vec3 shadeOpaque(Mat m, vec3 p, vec3 n, vec3 rd, float ao, float id){
  float dif = max(dot(n, SUN), 0.);
#if SHADOW_STEPS > 0
  if (dif > 0. && SUN.y > -.1) dif *= softShadow(p + n * .02, SUN);
#endif
  if (id > 7.5 && id < 8.5) dif = dif * .7 + .3 * max(dot(-n, SUN), 0.) + .15;
  vec3 r = reflect(rd, n);
  float cosi = max(dot(n, -rd), 0.);
  float fr = .04 + .96 * pow(max(1. - cosi, 0.), 5.);
  vec3 spec = sunCol * sunInt * pow(max(dot(r, SUN), 0.), 16. + 300. * m.gloss) * m.gloss * 2.;
  vec3 amb = ambient(n);
  if (id > 4.5 && id < 5.5) amb = mix(vec3(.62), amb, .3);
  vec3 c = m.alb * (amb * ao + sunCol * dif * sunInt * .55) + spec;
  vec3 rf = env(r);
  c += rf * fr * m.gloss * ao;
  if (m.irid > 0.){
    vec3 chrome = rf * mix(vec3(1), irid(cosi), m.irid) * (.35 + .65 * m.alb) * (.55 + .45 * fr) * ao + spec;
    c = mix(c, chrome, m.irid);
  }
  if (id > 7.5 && id < 8.5) c += m.alb * sunCol * sunInt * pow(max(dot(rd, SUN), 0.), 4.) * .5 * ao;
  if (id > 4.5 && id < 5.5) c += m.alb * (vec3(dot(skyHor, vec3(.3, .5, .2))) * .18 + sunCol * sunInt * .04) * ao * ao;
  return c + m.emi;
}

`;
const LIB_WATER = `vec3 waterNormal(vec2 xz, float dist){
  float a = waveAmp * exp(-dist * .02);
  vec2 g = vec2(0);
  vec2 p = xz * waveScale;
  float f = 1., amp = 1., ph = PH_waveSpeed;
  for (int k = 0; k < WAVES; k++){
    float fk = float(k);
    vec2 dir = vec2(cos(fk * 2.39 + .3), sin(fk * 2.39 + .3));
    g += dir * cos(dot(dir, p) * f + ph * (1. + fk * .3) + fk) * amp * f;
    f *= 1.73; amp *= .5;
  }
  g *= a * .22 * waveScale;
  if (ripAmt > 0.){
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      vec2 c = vec2(ripX, ripZ) + (i == 0 ? vec2(0) : (hash31(fi * 7.7).xy - .5) * 2. * ripSpread);
      float wgt = i == 0 ? 1. : clamp(ripSpread, 0., 1.) * .8;
      vec2 dv = xz - c;
      float r = length(dv) + 1e-3;
      float ph2 = r * ripFreq - PH_ripSpeed * (1. + fi * .23) + fi * 2.;
      float en = exp(-r * .3) * smoothstep(0., .4, r) * exp(-dist * .015);
      g += dv / r * cos(ph2) * ripFreq * en * ripAmt * .045 * wgt;
    }
  }
  return normalize(vec3(-g.x, 1., -g.y));
}
float causticPat(vec2 p){
  float t = PH_waveSpeed * .5;
  float n = noise2(p * 1.4 + vec2(t, -t * .7)) + noise2(p * 2.6 * mat2(.8, .6, -.6, .8) - vec2(t * .8, t * .3));
  return pow(max(1. - abs(n - 1.), 0.), 7.);
}

`;

// sel: { mats: [material ids], rib, ter, water } - material ids: 1 ribbon, 2 sphere,
// 3 shard, 4 tunnel, 5 atrium, 6 block, 7 helix, 8 foliage, 9 trunk, 10 terrain
export function libFor(sel) {
  const mats = (sel.mats || []).map(id => `  if (id > ${id - .5} && id < ${id + .5}){\n${LIB_MAT[id]}  }\n`).join('');
  return LIB_CORE
    + (sel.rib || (sel.mats || []).includes(1) ? LIB_RIB : '')
    + (sel.ter ? LIB_TER : '')
    + LIB_SHADOW + LIB_ENV
    + LIB_MAT_HEAD + mats + LIB_MAT_FOOT
    + LIB_SHADE
    + (sel.water ? LIB_WATER : '');
}

// Everything, for the raymarcher. Expects FBM_OCT, WAVES and SHADOW_STEPS to be
// defined, the uniforms uRes and uCamPos, and the genome #defines.
export const LIB = libFor({ mats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], rib: true, ter: true, water: true });

export const SCENE = (defs, o) => `${fragHead(o)}
uniform vec2 uRes;
uniform float uTime;
uniform int uFrame;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
${defs}
uniform vec4 G[NG];
uniform vec4 uPh[NPH];
${o.cpuShards ? '#define SHD_CPU\nuniform vec4 uShd[48];' : ''}
#define ZERO ${o.es3 ? 'min(uFrame, 0)' : '0'}
#define FAR 140.
#define MAX_STEPS ${o.potato ? 100 : o.lite ? 120 : 230}
#define MAX_LAYERS ${o.potato ? 1 : o.lite ? 2 : 4}
#define AO_STEPS ${o.potato ? 0 : o.lite ? 3 : 5}
#define SHADOW_STEPS ${o.lite ? 0 : 28}
#define FBM_OCT ${o.potato ? 3 : o.lite ? 4 : 5}
#define WAVES ${o.potato ? 3 : 5}
#define EPS_K ${o.potato ? '.0012' : '.0006'}
#define STEP_K ${o.potato ? '.95' : '.9'}
#define GLOW_STEP ${o.potato ? '1.2' : '.6'}
uniform float uPhase;
${COMMON}

${LIB}
// ------------------------------------------------------------------ scene SDF
float map(vec3 p){
  float d = 1e4;
  gId = 0.; gEm = vec3(0);

  if (terW > .01){
    float h = terrainH(p.xz);
    float dt = (p.y - flrY - h) * .55 * inversesqrt(1. + sq(terAmp * terScale * (2.5 + terRidge * 3.)));
    if (dt < d){ d = dt; gId = 10.; gInfo = vec4(h, 0, 0, 0); }
  }

  if (ribW > .01){
    vec3 q = p - vec3(ribX, ribY, ribZ);
    q.xz = rot(ribYaw) * q.xz;
    q.xy = rot(ribRoll) * q.xy;
    float ext = ribAmp * 1.4 + ribWidth * 1.3 + ribSpread * (ribCount + 1.) * .6 * (1. + abs(ribFan) * 6.) + ribDepth + .5;
    float bd = max(abs(q.y), abs(q.z)) - ext;
    if (bd > .4) d = min(d, bd);
    else {
      float frm = ribFreq * 1.3;
      float lip = inversesqrt(1. + sq(ribAmp * frm * 1.35) + sq(ribTwist * ribWidth) + sq(ribDepth * frm * .7) + sq(ribFan * ribSpread * ribCount * .5));
      float thk = ribThick * min(ribW * 4., 1.);
      for (int i = 0; i < 6; i++){
        float fi = float(i);
        float on = clamp(ribCount - fi, 0., 1.);
        if (on <= 0.) break;
        float hi = hash11(fi * 7.31 + ribSeed * 1.7);
        float o = fi - (ribCount - 1.) * .5;
        float x = q.x;
        float ph = PH_ribSpeed + fi * ribPhaseOff + hi * ribJitter * TAU;
        float fr = ribFreq * (1. + (hi - .5) * ribJitter * .5);
        float cy = ribAmp * (sin(x * fr + ph) + .35 * sin(x * fr * 2.13 - ph * 1.3 + fi)) + o * ribSpread * ribVert;
        float cz = o * ribSpread * (1. + ribFan * clamp(x, -6., 6.)) + ribDepth * cos(x * fr * .7 + ph * .8 + fi * 1.7);
        float th = ribAngle + ribTwist * x + ribTwistPh * fi;
        vec2 l = rot(-th) * vec2(q.y - cy, q.z - cz);
        float w = ribWidth * on * ribW * (1. - ribJitter * .4 + ribJitter * .8 * hi);
        float dr = (length(vec2(l.x, max(abs(l.y) - w, 0.))) - thk) * lip;
        if (ribGlow > 0.){
          // light threads along both edges and the spine, not the whole sheet
          float de = length(vec2(l.x, abs(l.y) - w)) * lip;
          float dsp = length(l) * lip;
          gEm += ribCol(fi) * (ribGlow * on * ribW * (3. * glowK(de, .05) + .8 * glowK(dsp, .04)));
        }
        if (dr < d){ d = dr; gId = 1.; gInfo = vec4(x, l.y / max(w, 1e-3), fi, hi); }
      }
    }
  }

  if (sphW > .01){
    vec3 q = p - vec3(sphX, sphY, sphZ);
    float bd = length(q) - (sphSpread * 1.1 + sphBob * .4 + sphSize * 2. + .3);
    if (bd > .4) d = min(d, bd);
    else for (int i = 0; i < 12; i++){
      float fi = float(i);
      float on = clamp(sphCount - fi, 0., 1.);
      if (on <= 0.) break;
      vec3 h = hash31(fi * 3.71 + sphSeed * 1.3);
      vec3 c = (h - .5) * vec3(2., 1., 1.4) * sphSpread * (i == 0 ? 1. - sphCenter0 : 1.);
      c.y += sphBob * .3 * sin(PH_sphSpeed + fi * 1.9);
      c.x += sphBob * .2 * sin(PH_sphSpeed * .7 + fi * 2.7);
      float r = sphSize * on * sphW * (1. - sphVar * .6 + sphVar * 1.2 * hash11(fi * 9.1 + sphSeed));
      float ds = length(q - c) - r;
      if (ds < d){ d = ds; gId = 2.; gInfo = vec4(q - c, r); }
    }
  }

  if (shdW > .01){
    vec3 q = p - vec3(shdX, shdY, shdZ);
    q.xz = rot(PH_shdSpin) * q.xz;
    q.yz = rot(PH_shdSpin * .37) * q.yz;
    float bd = length(q) - (shdR0 + shdLen * 1.6 + .3);
    if (bd > .4) d = min(d, bd);
    else for (int i = 0; i < 24; i++){
#ifdef SHD_CPU
      // per-shard frame is precomputed on the CPU each frame (see shardFrames in main.js)
      vec4 A = uShd[i * 2], B = uShd[i * 2 + 1];
      float len = A.w, th = B.w;
      if (len <= 0.) break;
      float on = 1.;
      vec3 dir = A.xyz, bx = B.xyz;
#else
      // not enough uniform space for the CPU frames: derive them here
      float fi = float(i);
      float on = clamp(shdCount - fi, 0., 1.);
      if (on <= 0.) break;
      vec3 hs = hash31(fi * 5.37 + shdSeed * 2.1);
      float a = hs.x * TAU, z = (hs.y * 2. - 1.) * shdFlat, sz = sqrt(max(1. - z * z, 0.));
      vec3 dir = normalize(vec3(sz * cos(a), z, sz * sin(a)));
      float len = shdLen * (.45 + hs.z) * on * shdW;
      float th = shdThick * (.5 + hs.y) * on * shdW + 1e-3;
      vec3 bx = normalize(cross(abs(dir.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0), dir));
#endif
      vec3 l = q - dir * (shdR0 + len * .5);
      float rough = length(l) - len * .5 - th;
      if (rough > max(d, .2)) { d = min(d, rough); continue; }
      vec3 by = cross(dir, bx);
      vec3 h = vec3(0, 0, float(i) / 24.);
      vec3 ll = vec3(dot(l, bx), dot(l, by), dot(l, dir));
      vec3 ia = 1. / vec3(th, th * .55, len * .5 + 1e-3);
      float ds = (dot(abs(ll), ia) - 1.) / length(ia);
      if (shdGlow > 0.) gEm += shdCol * (shdGlow * on * shdW * 3. * glowK(ds, .05));
      if (ds < d){ d = ds; gId = 3.; gInfo = vec4(ll * ia, h.z); }
    }
  }

  if (tunW > .01){
    vec3 q = p - vec3(tunX, tunY, 0.);
    q.xz = rot(tunYaw) * q.xz;
    q.z -= PH_camTravel;
    float sp = tunSpacing;
    float ci = floor(q.z / sp + .5);
    float zz = q.z - ci * sp;
    float ang = atan(q.y, q.x + 1e-6);
    float r = length(q.xy);
    float N = max(tunSides, 3.);
    float an = mod(ang + PI / N, TAU / N) - PI / N;
    float rp = mix(r, r * cos(an), tunPoly);
    float rad = tunRadius * (1. + tunWobble * .15 * sin(ci * 1.7)) + (1. - tunW) * 14.;
    float rr = rp - rad;
    float dt = mix(length(vec2(rr, zz)) - tunThick, max(abs(rr) - tunThick * .35, abs(zz) - tunBandW * sp * .5), tunFlat);
    if (tunRails > .01){
      float M = max(tunRailN, 1.);
      float ar = mod(ang + PI / M, TAU / M) - PI / M;
      dt = min(dt, length(vec2(rr, r * sin(ar))) - tunThick * .5 * tunRails);
    }
    dt *= .8;
    if (tunGlow > 0.) gEm += tunCol * (tunGlow * tunW * 2. * glowK(dt, .05));
    if (dt < d){ d = dt; gId = 4.; gInfo = vec4(rr, zz / (sp * max(tunBandW, .05)), ang, ci); }
  }

  if (arcW > .01){
    vec3 q = p;
    q.xz = rot(arcYaw) * q.xz;
    q.z -= PH_camTravel * arcTrav;
    float y = q.y - flrY;
    float tf = y / arcTierH;
    float ti = max(floor(tf) + smoothstep(.85, 1., fract(tf)), 0.);
    float wz = arcWidth + arcWave * sin(q.z * arcFreq + 1.3 * sin(q.z * arcFreq * .41 + floor(tf) * .6)) + ti * arcStep + (1. - arcW) * 25.;
    float ax = mix(abs(q.x), q.x, arcOpen);
    float dw = wz - ax;
    float dc = max(arcCeil + (1. - arcW) * 25. - y, arcHole - ax);
    // balcony slabs protruding from the wall at every tier boundary
    float yb = (fract(tf + .5) - .5) * arcTierH;
    float inner = ax - (wz - arcLip);
    float slab = max(abs(yb) - .07, -inner);
    slab = max(slab, -y + arcTierH * .5);
    float slope = arcStep / (.15 * arcTierH) + arcWave * arcFreq * 2.3;
    float k = inversesqrt(1. + slope * slope);
    float da = min(min(dw, dc), slab) * k;
    if (arcLight > 0. && y > arcTierH * .5){
      float ds = length(vec2(inner, yb + .09));
      gEm += arcLightCol * (arcLight * arcW * .9 * glowK(ds, .035));
    }
    if (da < d){ d = da; gId = 5.; gInfo = vec4(fract(tf), q.z, slab < min(dw, dc) ? 1. : 0., inner); }
  }

  if (blkW > .01){
    vec3 q = p - vec3(0., blkY, 0.);
    q.xz = rot(blkYaw) * q.xz;
    q.z -= PH_camTravel;
    vec3 cam = uCamPos - vec3(0., blkY, 0.);
    cam.xz = rot(blkYaw) * cam.xz;
    float cs = blkCell;
    vec3 ci = floor(q / cs);
    vec3 lq = q - (ci + .5) * cs;
    float h = hash13(ci + blkSeed * 13.1);
    vec3 h3 = hash31(h * 91.7 + 3.);
    vec3 bq = cs * .5 - abs(lq);
    float dcell = min(bq.x, min(bq.y, bq.z)) + .04 * cs;
    float present = step(h, blkDensity) * step(abs(ci.y + .5), blkLayers) * step(blkClear, length((ci.xy + .5) * cs - cam.xy));
    if (present > 0.){
      vec3 sz = cs * blkSize * (.4 + .6 * h3);
      sz = mix(sz, sz * vec3(.3, .3, 2.6), clamp(blkStretch, 0., 1.));
      sz = mix(sz, sz * vec3(.3, 2.6, .3), clamp(-blkStretch, 0., 1.));
      sz = min(sz, vec3(cs * .47)) * blkW;
      float db = sdBox(lq, sz) - .02 * cs;
      if (blkGlow > 0.) gEm += blkCol * (blkGlow * 2. * glowK(db, .05));
      if (db < d){ d = db; gId = 6.; gInfo = vec4(lq / sz, h); }
    }
    d = min(d, dcell);
  }

  if (hlxW > .01){
    vec3 q = p - vec3(hlxX, hlxY, hlxZ);
    q.xz = rot(PH_hlxSpin) * q.xz;
    float r = length(q.xz);
    float a = atan(q.z, q.x + 1e-6);
    float pt = hlxPitch;
    float m = floor(q.y / pt - a / TAU + .5);
    float A = a + TAU * m;
    float da = TAU / max(hlxSteps, 3.);
    float Aq = (floor(A / da) + .5) * da;
    float yc = mix(A, Aq, hlxStepify) * pt / TAU;
    float dy = q.y - yc;
    float cosS = mix(cos(atan(pt / (TAU * max(hlxRadius, .1)))), 1., hlxStepify);
    vec2 e = vec2(abs(r - hlxRadius) - hlxWidth * hlxW, abs(dy) * cosS - hlxThick);
    float dh = length(max(e, 0.)) + min(max(e.x, e.y), 0.);
    dh = max(dh, abs(q.y) - hlxHeight * hlxW) * .7;
    if (dh < d){ d = dh; gId = 7.; gInfo = vec4((r - hlxRadius) / hlxWidth, dy, A, 0.); }
  }

  if (treeW > .01){
    float s = treeSize * treeW;
    vec3 q = p - vec3(treeX, TREEY, treeZ);
    float bd = length(q - vec3(0., s * 1.5, 0.)) - s * 1.8;
    if (bd > .4) d = min(d, bd);
    else {
      float hy = clamp(q.y, 0., s * 1.3);
      float dtr = length(q - vec3(sin(hy * 2. / s) * .06 * s, hy, 0.)) - s * (.1 - .05 * hy / (s * 1.3));
      float dc = 1e4;
      for (int i = 0; i < 7; i++){
        vec3 h = hash31(float(i) * 4.1 + treeSeed);
        vec3 c = i == 0 ? vec3(0., 1.5, 0.) : vec3((h.x - .5) * 1.5, 1.3 + (h.y - .3) * .75, (h.z - .5) * 1.5);
        dc = smin(dc, length(q - c * s) - s * (.42 + .2 * h.y), .3 * s);
      }
      if (dc < .35 * s) dc += (noise3(q * 5. / s) - .5) * .22 * s + (noise3(q * 13. / s) - .5) * .08 * s;
      dc *= .7;
      if (dtr < d){ d = dtr; gId = 9.; }
      if (dc < d){ d = dc; gId = 8.; gInfo = vec4(q / s, 0.); }
    }
  }
  return d;
}

vec3 calcNormal(vec3 p, float e){
  vec3 n = vec3(0);
  for (int i = ZERO; i < 4; i++){
    vec3 k = .5773 * (i == 0 ? vec3(1, -1, -1) : i == 1 ? vec3(-1, -1, 1) : i == 2 ? vec3(-1, 1, -1) : vec3(1));
    n += k * map(p + e * k);
  }
  return normalize(n + vec3(0, 1e-6, 0));
}
float calcAO(vec3 p, vec3 n){
  float o = 0., s = 1.;
  for (int i = ZERO; i < AO_STEPS; i++){
    float h = .04 + .22 * float(i) * 5. / float(AO_STEPS);
    o += (h - map(p + n * h)) * s; s *= .7;
  }
  return clamp(1. - 1.2 * o, .12, 1.);
}

float softShadow(vec3 ro, vec3 rd){
  float res = 1., t = .05;
#if SHADOW_STEPS > 0
  for (int i = ZERO; i < SHADOW_STEPS; i++){
    float h = map(ro + rd * t);
    res = min(res, 10. * h / t);
    t += clamp(h, .05, .6);
    if (res < .02 || t > 18.) break;
  }
#endif
  return clamp(res, 0., 1.);
}

// ------------------------------------------------------------------ floor
float planeT(vec3 ro, vec3 rd){
  if (flrW < .01 || rd.y > -1e-4) return 1e9;
  float t = (flrY - (1. - flrW) * 40. - ro.y) / rd.y;
  return t > 0. ? t : 1e9;
}
// ------------------------------------------------------------------ renderer
vec4 render(vec3 ro, vec3 rd){
  vec3 col = vec3(0), thr = vec3(1), glow = vec3(0);
  float t = .02, tAcc = 0., depth = -1., curIor = 1.;
  bool inside = false;
  int layers = 0;
  bool anyGlow = ribGlow * ribW + shdGlow * shdW + tunGlow * tunW + arcLight * arcW + blkGlow * blkW > .01;
  float maxStep = anyGlow ? GLOW_STEP : 60.;
  float tPl = planeT(ro, rd);
  vec3 fogC = skyHor;
  for (int i = ZERO; i < MAX_STEPS; i++){
    vec3 p = ro + rd * t;
    float dm = map(p);
    float d = inside ? -dm : dm;
    float eps = EPS_K * (1. + tAcc + t);
    if (!inside && anyGlow) glow += thr * gEm * clamp(d, .01, maxStep) * exp(-(tAcc + t) * fogDen);
    if (d < eps){
      float id = gId; vec4 info = gInfo;
      vec3 n = calcNormal(p, max(eps, .001));
      float dist = tAcc + t;
      if (depth < 0.) depth = dist;
      if (!inside){
        Mat m = material(id, info, p, n, dist);
        float fogf = 1. - exp(-dist * fogDen);
        if (m.glass < .02){
          float ao = calcAO(p, n);
          col += thr * mix(shadeOpaque(m, p, n, rd, ao, id), fogC, fogf);
          thr = vec3(0);
          break;
        }
        float cosi = abs(dot(n, rd));
        float F = .05 + .95 * pow(max(1. - cosi, 0.), 4.);
        vec3 r = reflect(rd, n);
        vec3 it = mix(vec3(1), irid(cosi), m.irid);
        vec3 refl = env(r) * it + sunCol * sunInt * pow(max(dot(r, SUN), 0.), 400.) * 6.;
        vec3 body = m.alb * (ambient(n) + sunCol * max(dot(n, SUN), 0.) * sunInt * .5);
        vec3 c = F * refl + (1. - F) * ((1. - m.glass) * body + m.glass * m.milk * body) + m.emi;
        col += thr * mix(c, fogC, fogf);
        vec3 hueT = m.alb / max(maxc(m.alb), 1e-3);
        thr *= (1. - F) * m.glass * (1. - m.milk * .5) * mix(vec3(1), hueT, .65) * mix(vec3(1), it, m.irid * .5);
        vec3 nr = refract(rd, n, 1. / m.ior);
        if (dot(nr, nr) > .001) rd = nr;
        tAcc += t; ro = p - n * eps * 3.; t = 0.; inside = true; curIor = m.ior;
        layers++;
        if (layers > MAX_LAYERS || maxc(thr) < .03) break;
      } else {
        vec3 nr = refract(rd, -n, curIor);
        tAcc += t; t = 0.;
        if (dot(nr, nr) < .001){ rd = reflect(rd, -n); ro = p - n * eps * 3.; }
        else { rd = nr; ro = p + n * eps * 3.; inside = false; tPl = planeT(ro, rd); }
      }
      continue;
    }
    t += inside ? max(d, eps) : min(d * STEP_K, maxStep);
    if (!inside && t > tPl){
      vec3 pp = ro + rd * tPl;
      float dist = tAcc + tPl;
      if (depth < 0.) depth = dist;
      vec3 n = waterNormal(pp.xz, dist);
      float cosi = max(dot(n, -rd), 0.);
      float om = max(1. - cosi, 0.);
      float F = mix(.02 + .98 * pow(om, 5.), .5 + .5 * om * om * om, mirror);
      vec3 deep = waterCol * (.35 + .65 * max(SUN.y, .1)) * mix(vec3(1), sunCol, .3);
      if (caustic > 0.) deep *= 1. + caustic * causticPat(pp.xz) * exp(-dist * .03) * 2.;
      deep += waterCol * sunCol * sunInt * pow(max(dot(refract(rd, n, .75), SUN), 0.), 8.) * .5;
      vec3 c = (1. - F) * deep;
      if (gridAmt > 0.){
        vec2 gp = pp.xz * gridScale;
        gp.y -= PH_camTravel * gridScale;
        vec2 gf = abs(fract(gp) - .5);
        float lw = .015 + dist * .002 * gridScale;
        float ln = smoothstep(.5 - lw * 2., .5, max(gf.x, gf.y));
        ln = mix(ln, lw * 2., smoothstep(.1, .3, lw));
        c += gridCol * gridAmt * ln * 2.5 * exp(-dist * .03);
      }
      col += thr * mix(c, fogC * (1. - F), 1. - exp(-dist * fogDen));
      thr *= F * mix(vec3(1), waterCol / max(maxc(waterCol), 1e-3), .25);
      rd = reflect(rd, n);
      rd.y = abs(rd.y) + .002;
      tAcc = dist; ro = pp + vec3(0, .01, 0); t = .02; tPl = 1e9;
      layers++;
      if (layers > 6 || maxc(thr) < .02) break;
      continue;
    }
    if (tAcc + t > FAR || (inside && t > 40.)) break;
  }
  col += thr * env(rd);
  col += glow;
  if (depth < 0.) depth = FAR;
  return vec4(col, depth);
}

void shade(){
  // portrait screens widen the view so phones are not stuck with a narrow slice
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / (uRes.y * min(1., uRes.x * 1.2 / uRes.y));
  SUN = angDir(sunYaw, sunElev);
  TREEY = flrY + treeBase;
  if (treeW > .01 && terW > .01) TREEY = flrY + max(terrainH(vec2(treeX, treeZ)), treeBase);
  vec3 rd = normalize(uCamRot * vec3(uv, camZoom));
  vec4 r = render(uCamPos, rd);
  vec3 c = r.rgb;
  if (!(c.x == c.x && c.y == c.y && c.z == c.z)) c = vec3(0);
  FRAGC = vec4(ENCC(clamp(c, 0., 60.)), ENCD(r.a));
}
// Interleaved mode traces one 8x8 tile of each 2x2 group of tiles per frame; the
// others keep their previous value. Tiles (not single pixels) so whole GPU
// thread groups skip together: with per-pixel interleave every group still runs
// the full raymarch with most lanes masked. The branch (rather than a bare
// discard) guarantees skipped tiles never enter the raymarch.
void main(){
  vec2 f = mod(floor(gl_FragCoord.xy / 8.), 2.);
  if (uPhase < 0. || abs(f.x + 2. * f.y - uPhase) < .5) shade();
  else discard;
}`;

export const DOWN = o => `${fragHead(o)}
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThr;
VARYING vec2 vUv;
vec3 rd(vec2 uv){ return DECC(TEX(uTex, uv).rgb); }
void main(){
  vec2 h = uTexel;
  vec3 c = rd(vUv) * 4. + rd(vUv + vec2(-h.x, -h.y)) + rd(vUv + vec2(h.x, -h.y)) + rd(vUv + vec2(-h.x, h.y)) + rd(vUv + vec2(h.x, h.y));
  vec3 r = min(c / 8., vec3(14.));
  if (uThr >= 0.){ float L = dot(r, vec3(.2126, .7152, .0722)); r *= min(max(L - uThr, 0.), 3.) / max(L, 1e-4); }
  FRAGC = vec4(ENCC(r), 1.);
}`;

export const UP = o => `${fragHead(o)}
uniform sampler2D uTex;
uniform sampler2D uAdd;
uniform float uAddW;
uniform vec2 uTexel;
VARYING vec2 vUv;
vec3 rd(vec2 uv){ return DECC(TEX(uTex, uv).rgb); }
void main(){
  vec2 h = uTexel;
  vec3 c = rd(vUv + vec2(-h.x * 2., 0.)) + rd(vUv + vec2(h.x * 2., 0.)) + rd(vUv + vec2(0., h.y * 2.)) + rd(vUv + vec2(0., -h.y * 2.))
         + (rd(vUv + vec2(-h.x, h.y)) + rd(vUv + vec2(h.x, h.y)) + rd(vUv + vec2(h.x, -h.y)) + rd(vUv + vec2(-h.x, -h.y))) * 2.;
  FRAGC = vec4(ENCC(c / 12. * .6 + DECC(TEX(uAdd, vUv).rgb) * uAddW), 1.);
}`;

export const COMPOSITE = (defs, o) => `${fragHead(o)}
uniform sampler2D uScene;
uniform sampler2D uD1;
uniform sampler2D uD2;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uSunUV;
uniform float uSunVis;
uniform float uLevels;
${defs}
uniform vec4 G[NG];
uniform vec4 uPh[NPH];
VARYING vec2 vUv;
#define LINES_MAX ${o.lite ? 14 : 32}
#define SHAFT_N ${o.lite ? 14 : 36}
#define SHAFT_DECAY ${o.lite ? '.9' : '.96'}
#define LITE ${o.lite ? 1 : 0}
${COMMON}

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }

void main(){
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  vec2 sc = (uv - .5) * vec2(asp, 1.);
  float px = 1. / uRes.y;

  vec4 s = TEX(uScene, uv);
  s.a = DECD(s.a);
  vec3 col = DECC(s.rgb);
  if (LITE == 0 && chroma > .01){
    vec2 cd = (uv - .5) * chroma * .006;
    col.r = DECC(TEX(uScene, uv + cd).rgb).r;
    col.b = DECC(TEX(uScene, uv - cd).rgb).b;
  }
  vec3 bl = DECC(TEX(uBloom, uv).rgb) / uLevels;

  if (LITE == 0 && dof > .01){
    float coc = clamp(abs(s.a - focus) / (focus * .5 + 1.), 0., 1.) * dof;
    vec2 tx = 2.5 / uRes;
    vec3 d1 = DECC(TEX(uD1, uv).rgb);
    vec3 d2 = DECC((TEX(uD1, uv + tx * vec2(1, 1)).rgb + TEX(uD1, uv + tx * vec2(-1, 1)).rgb
             + TEX(uD1, uv + tx * vec2(1, -1)).rgb + TEX(uD1, uv + tx * vec2(-1, -1)).rgb) * .25);
    col = mix(col, d1, smoothstep(0., .5, coc));
    col = mix(col, d2, smoothstep(.5, 1., coc));
  }
  col += bl * (bloom + diffuse);

  if (shafts > .01 && uSunVis > .01){
    vec2 dir = (uSunUV - uv) / float(SHAFT_N);
    vec2 p = uv;
    vec3 acc = vec3(0);
    float w = 1.;
    for (int i = 0; i < SHAFT_N; i++){
      p += dir;
      vec3 c = DECC(TEX(uD2, p).rgb);
      acc += c * w;
      w *= SHAFT_DECAY;
    }
    col += acc / float(SHAFT_N) * shafts * uSunVis * 1.6;
  }

  // ---- overlays (HDR, before tone mapping)
  if (dotsAmt > .001){
    vec2 q = rot(dotsAngle) * sc;
    float cy = dotsOff + dotsCurve * sin(q.x * 2.2 + .7);
    float band = exp(-sqc((q.y - cy) / dotsWidth));
    float fx = smoothstep(-1.2, 1.2, q.x * sign(dotsFade + 1e-4) * min(abs(dotsFade), 2.) * .5 + .3);
    vec2 g = q * dotsScale;
    g.x += step(1., mod(floor(g.y), 2.)) * .5;
    vec2 f = fract(g) - .5;
    float r = .46 * sqrt(clamp(band * mix(1., fx, min(abs(dotsFade), 1.)), 0., 1.));
    float aa = 1.2 * dotsScale * px;
    float dt = smoothstep(r + aa, r - aa, length(f)) * smoothstep(0., .08, r);
    col += dotsCol * dt * dotsAmt;
  }
  if (bokehAmt > .001){
    for (int l = 0; l < 3; l++){
      float fl = float(l);
      float cs = (.14 + fl * .1) * bokehSize;
      vec2 p = sc / cs + vec2(PH_bokehSpeed * (.6 + fl * .4), PH_bokehSpeed * .25 * (fl + 1.)) + fl * 17.3;
      vec2 id = floor(p), f = fract(p) - .5;
      vec3 h = hash32(id + fl * 31.);
      if (h.x < .4){
        float r = .14 + .22 * h.z;
        vec2 oo = (h.yz - .5) * (1. - 2. * r - .04);
        float dd = length(f - oo);
        float ed = .03 + fl * .02;
        float disk = smoothstep(r, r - ed, dd);
        float rim = smoothstep(r - .06, r, dd) * disk;
        vec3 bc = hueRot(bokehCol, (h.y - .5) * 1.2);
        float tw = .6 + .4 * sin(uTime * .3 + h.y * 30.);
        col += max(bc, 0.) * (disk * .22 + rim * .3) * bokehAmt * tw * (1. - fl * .2);
      }
    }
  }
  if (linesAmt > .001){
    vec2 q = rot(linesAngle) * sc;
    float acc = 0.;
    float nL = min(linesN, float(LINES_MAX));
    for (int i = 0; i < LINES_MAX; i++){
      float fi = float(i);
      if (fi >= nL) break;
      float k = fi / nL;
      float y = linesOff + (k - .5) * linesSpread * (1. + q.x * .45)
              + linesAmp * sin(q.x * linesFreq + PH_linesSpeed + k * 1.6)
              + linesAmp * .4 * sin(q.x * linesFreq * 2.3 - PH_linesSpeed * .7 + k * 3.1);
      float dd = abs(q.y - y);
      acc += exp(-dd / (px * .9)) + .25 * exp(-dd / (px * 6.));
    }
    float fade = smoothstep(-asp * .5, -asp * .5 + .4, q.x) * smoothstep(asp * .5, asp * .5 - .4, q.x);
    col += linesCol * acc * linesAmt * .35 * (.4 + .6 * fade) * linesN / nL;
  }
  if (streakAmt > .001){
    vec2 c = sc - vec2((streakX - .5) * asp, streakY - .5);
    float r = length(c), a = atan(c.y, c.x);
    for (int l = 0; l < 2; l++){
      float N = l == 0 ? 140. : 230.;
      float ai = floor((a / TAU + .5) * N);
      float h = hash11(ai + float(l) * 91.), h2 = hash11(ai * 1.37 + 17.);
      float pos = fract(h2 - PH_streakSpeed * (.5 + h));
      float R = exp(mix(-3., .8, pos));
      float Lh = R * (.25 + .4 * h);
      float seg = smoothstep(R - Lh, R, r) * smoothstep(R + Lh * .15, R, r);
      float aw = abs(fract((a / TAU + .5) * N) - .5) * 2.;
      float thin = smoothstep(.5, .0, aw * (1. + r * 2.));
      vec3 scol = mix(streakCol, spectrum(a / TAU * 2. + h * .3) * 1.5, streakRainbow);
      col += scol * seg * thin * step(.55, h) * streakAmt * smoothstep(0., .25, r) * 1.6;
    }
  }
  if (sparkAmt > .001){
    vec2 p = sc * 9.;
    vec2 id = floor(p), f = fract(p) - .5;
    vec3 h = hash32(id + 5.);
    if (h.x > .86){
      vec2 dd = f - (h.yz - .5) * .6;
      float tw = pow(max(.5 + .5 * sin(uTime * (.4 + h.y) + h.z * 40.), 0.), 3.);
      float st = exp(-abs(dd.x) * 300.) * exp(-abs(dd.y) * 18.) + exp(-abs(dd.y) * 300.) * exp(-abs(dd.x) * 18.) + exp(-length(dd) * 60.);
      col += sparkCol * st * tw * sparkAmt * 1.5;
    }
  }
  if (uSunVis > .01 && (burstAmt > .001 || flareAmt > .001)){
    vec2 sp = (uSunUV - .5) * vec2(asp, 1.);
    vec2 c = sc - sp;
    float r = length(c), a = atan(c.y, c.x);
    if (burstAmt > .001){
      float rays = 0.;
      for (int k = 0; k < 3; k++){
        float fk = float(k);
        float n = hash11(floor((a / TAU + .5) * (40. + fk * 37.)) + fk * 13.);
        rays += pow(n, 6.) * (1. - fk * .25);
      }
      vec3 rc = spectrum(a / TAU * 3. + r * .4 + uTime * .005) * 1.4;
      col += rc * rays * burstAmt * uSunVis * .22 / (r * 3. + .2) * smoothstep(1.4, .0, r);
    }
    if (flareAmt > .001){
      col += vec3(.6, .8, 1.) * exp(-abs(c.y) * 220.) * exp(-abs(c.x) * 2.5) * flareAmt * uSunVis * 1.5;
      for (int k = 1; k < 5; k++){
        float fk = float(k);
        vec2 gp = sp * (1. - fk * .55);
        float gr = .03 + .035 * fk;
        float gd = length(sc - gp);
        vec3 gc = spectrum(fk * .27 + .1) * .5 + .2;
        col += gc * (smoothstep(gr, gr * .8, gd) * .06 + smoothstep(gr * .9, gr, gd) * smoothstep(gr * 1.05, gr, gd) * .08) * flareAmt * uSunVis;
      }
    }
  }

  // ---- tone + grade
  col *= exposure * tintCol;
  col = aces(col);
  col = pow(col, vec3(1. / 2.2));
  float l = dot(col, vec3(.299, .587, .114));
  col = mix(vec3(l), col, saturation);
  col = (col - .5) * contrast + .5;
  col += lift * (1. - col);
  col *= 1. - vignette * dot(sc * .85, sc * .85);
  col += (hash12(uv * uRes + fract(uTime) * 100.) - .5) * grain;
  col += (hash12(uv * uRes * 1.3 + 7.) - .5) / 255.;
  FRAGC = vec4(clamp(col, 0., 1.), 1.);
}`;
