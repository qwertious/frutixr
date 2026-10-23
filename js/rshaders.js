// Rasterized renderer shaders. The raymarcher (shaders.js SCENE) traces every
// pixel through a signed distance field, which weak GPUs cannot afford; here
// every scene element is real geometry instead, placed in the vertex shader with
// the same formulas as the distance field and shaded with the same shared
// material code (LIB), so the two renderers show the same scenes.
//
// All meshes share one vertex format: up to three vec4 attributes a0, a1, a2,
// whose meaning depends on the program (see raster.js for the mesh builders).
// Glass is drawn in two passes: uPass 0 multiplies what is behind by the
// transmission colour, uPass 1 adds the surface light. uMirror 1 draws an
// element reflected in the water plane, weighted by the water's Fresnel term.
import { fragHead, COMMON, libFor } from './shaders.js?v=7';

const vertHead = o => o.es3 ? `#version 300 es
#define ATTR in
#define VARY out
` : `#define ATTR attribute
#define VARY varying
`;

// shared by both stages, so the uniform declarations match exactly
const DECLS = (defs, o, sel) => `${defs}
uniform vec4 G[NG];
uniform vec4 uPh[NPH];
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform vec4 uProj;
uniform vec2 uRes;
uniform float uMirror;
uniform float uPass;
uniform float uTime;
#define FBM_OCT ${o.potato ? 3 : 4}
#define WAVES ${o.potato ? 3 : 5}
#define SHADOW_STEPS 0
#define REFL_CLOUDS ${o.potato ? 0 : 1}
#define RIB_X 36.
${COMMON}
${libFor(sel)}
float flrYw(){ return flrY - (1. - flrW) * 40.; }
${sel.ter ? `float treeY(){
  float y = flrY + treeBase;
  if (treeW > .01 && terW > .01) y = flrY + max(terrainH(vec2(treeX, treeZ)), treeBase);
  return y;
}` : ''}
`;

const VS_BASE = `
const vec4 OFF = vec4(2., 2., 2., 1.); // a vertex outside the clip volume: its triangles vanish
vec3 mirrorP(vec3 p){ if (uMirror > .5) p.y = 2. * flrYw() - p.y; return p; }
vec3 mirrorN(vec3 n){ if (uMirror > .5) n.y = -n.y; return n; }
vec4 project(vec3 p){
  vec3 d = p - uCamPos;
  vec3 v = vec3(dot(d, uCamRot[0]), dot(d, uCamRot[1]), dot(d, uCamRot[2]));
  return vec4(v.x * uProj.x, v.y * uProj.y, v.z * uProj.z + uProj.w, v.z);
}
// billboard corner around a centre, facing the camera
vec3 billboard(vec3 c, vec2 corner, float r){ return c + (uCamRot[0] * corner.x + uCamRot[1] * corner.y) * r; }
`;
const VS_RIB = `
// ---- ribbons: the centre-line, twist and bundle transform of the distance field
vec3 ribQ(float x, float s, float fi, float hi){
  float o = fi - (ribCount - 1.) * .5;
  float ph = PH_ribSpeed + fi * ribPhaseOff + hi * ribJitter * TAU;
  float fr = ribFreq * (1. + (hi - .5) * ribJitter * .5);
  float cy = ribAmp * (sin(x * fr + ph) + .35 * sin(x * fr * 2.13 - ph * 1.3 + fi)) + o * ribSpread * ribVert;
  float cz = o * ribSpread * (1. + ribFan * clamp(x, -6., 6.)) + ribDepth * cos(x * fr * .7 + ph * .8 + fi * 1.7);
  float th = ribAngle + ribTwist * x + ribTwistPh * fi;
  return vec3(x, cy - sin(th) * s, cz + cos(th) * s);
}
vec3 ribDir(vec3 q){ q.xy = rot(-ribRoll) * q.xy; q.xz = rot(-ribYaw) * q.xz; return q; }
vec3 ribWorld(vec3 q){ return ribDir(q) + vec3(ribX, ribY, ribZ); }
float ribHash(float fi){ return hash11(fi * 7.31 + ribSeed * 1.7); }
float ribWidthOf(float fi, float hi){
  return ribWidth * clamp(ribCount - fi, 0., 1.) * ribW * (1. - ribJitter * .4 + ribJitter * .8 * hi);
}
`;
const VS_SHD = `
// ---- crystal shards
void shardFrame(float fi, out vec3 dir, out vec3 bx, out float len, out float th, out float hz){
  float on = clamp(shdCount - fi, 0., 1.);
  vec3 hs = hash31(fi * 5.37 + shdSeed * 2.1);
  float a = hs.x * TAU, z = (hs.y * 2. - 1.) * shdFlat, sz = sqrt(max(1. - z * z, 0.));
  dir = normalize(vec3(sz * cos(a), z, sz * sin(a)));
  len = shdLen * (.45 + hs.z) * on * shdW;
  th = shdThick * (.5 + hs.y) * on * shdW + 1e-3;
  bx = normalize(cross(abs(dir.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0), dir));
  hz = hs.z;
}
vec3 shardSpin(vec3 q){ q.yz = rot(-PH_shdSpin * .37) * q.yz; q.xz = rot(-PH_shdSpin) * q.xz; return q; }
`;
const VS_ARC = `
// ---- atrium wall position (distance from the corridor axis) at height y above the floor
float archWz(float z, float y){
  float tf = y / arcTierH;
  float ti = max(floor(tf) + smoothstep(.85, 1., fract(tf)), 0.);
  return arcWidth + arcWave * sin(z * arcFreq + 1.3 * sin(z * arcFreq * .41 + floor(tf) * .6)) + ti * arcStep + (1. - arcW) * 25.;
}
vec3 archWorld(vec3 q){ q.z += PH_camTravel * arcTrav; q.xz = rot(-arcYaw) * q.xz; return q; }
vec3 archDir(vec3 n){ n.xz = rot(-arcYaw) * n.xz; return n; }
`;

const FS_LIB = `
// share of light the water reflects toward the camera at a mirrored point
float waterF(vec3 pm){
  vec3 rd = normalize(pm - uCamPos);
  float om = 1. - clamp(-rd.y, 0., 1.);
  return mix(.02 + .98 * om * om * om * om * om, .5 + .5 * om * om * om, mirror);
}
float fogF(float dist){ return 1. - exp(-dist * fogDen); }
vec3 envR(vec3 r){ gClouds = float(REFL_CLOUDS); vec3 c = env(r); gClouds = 1.; return c; }
// two-pass glass: pass 0 writes the transmission (multiply), pass 1 the light (add)
void outGlass(Mat m, vec3 p, vec3 n, vec3 rd, float dist, vec3 extra){
  float cosi = abs(dot(n, rd));
  float F = .05 + .95 * pow(max(1. - cosi, 0.), 4.);
  vec3 it = mix(vec3(1), irid(cosi), m.irid);
  vec3 r = reflect(rd, n);
  vec3 c, T;
  if (uPass > .5){
    vec3 refl = envR(r) * it + sunCol * sunInt * pow(max(dot(r, SUN), 0.), 400.) * 6.;
    vec3 body = m.alb * (ambient(n) + sunCol * max(dot(n, SUN), 0.) * sunInt * .5);
    c = F * refl + (1. - F) * ((1. - m.glass) * body + m.glass * m.milk * body) + m.emi + extra;
    c = mix(c, skyHor, fogF(dist));
    if (uMirror > .5) c *= waterF(p);
    FRAGC = vec4(ENCC(clamp(c, 0., 60.)), 1.);
  } else {
    vec3 hueT = m.alb / max(maxc(m.alb), 1e-3);
    T = (1. - F) * m.glass * (1. - m.milk * .5) * mix(vec3(1), hueT, .65) * mix(vec3(1), it, m.irid * .5);
    if (uMirror > .5) T = 1. - waterF(p) * (1. - T);
    FRAGC = vec4(clamp(T, 0., 1.), 1.);
  }
}
// opaque surfaces; in the mirror pass the result is blended in by the water's Fresnel term
void outOpaque(vec3 c, vec3 p, float dist){
  c = mix(c, skyHor, fogF(dist));
  float k = uMirror > .5 ? waterF(p) : 1.;
  FRAGC = vec4(ENCC(clamp(c * k, 0., 60.)), k);
}
// additive light (glow halos)
void outAdd(vec3 c, vec3 p, float dist){
  c *= exp(-dist * fogDen);
  if (uMirror > .5) c *= waterF(p);
  FRAGC = vec4(ENCC(clamp(c, 0., 60.)), 1.);
}
// integrated glow of the distance field's glowK(d, w) across a line, at distance d
float lineGlow(float d, float w){ float x = d / w; return 1. / pow(1. + x * x, 1.5); }
`;

// ------------------------------------------------------------------ programs
// Each entry: vs body, fs body (both get the shared declarations and libraries).
const P = {};

P.sky = {
  vs: `ATTR vec4 a0;
VARY vec2 vUv;
void main(){ vUv = a0.xy * .5 + .5; gl_Position = vec4(a0.xy, 0., 1.); }`,
  fs: `VARYING vec2 vUv;
void main(){
  SUN = angDir(sunYaw, sunElev);
  vec2 uv = (vUv - .5) * uRes / (uRes.y * min(1., uRes.x * 1.2 / uRes.y));
  vec3 rd = normalize(uCamRot * vec3(uv, camZoom));
  FRAGC = vec4(ENCC(clamp(env(rd), 0., 60.)), 1.);
}`,
};

P.water = {
  vs: `ATTR vec4 a0;
VARY vec3 vP;
void main(){
  if (flrW < .01){ gl_Position = OFF; return; }
  vP = vec3(uCamPos.x + a0.x * 600., flrYw(), uCamPos.z + a0.y * 600.);
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
void main(){
  SUN = angDir(sunYaw, sunElev);
  vec3 rd = normalize(vP - uCamPos);
  float dist = length(vP - uCamPos);
  vec3 n = waterNormal(vP.xz, dist);
  float cosi = max(dot(n, -rd), 0.), om = max(1. - cosi, 0.);
  float F = mix(.02 + .98 * pow(om, 5.), .5 + .5 * om * om * om, mirror);
  vec3 deep = waterCol * (.35 + .65 * max(SUN.y, .1)) * mix(vec3(1), sunCol, .3);
  if (caustic > 0.) deep *= 1. + caustic * causticPat(vP.xz) * exp(-dist * .03) * 2.;
  deep += waterCol * sunCol * sunInt * pow(max(dot(refract(rd, n, .75), SUN), 0.), 8.) * .5;
  vec3 c = (1. - F) * deep;
  if (gridAmt > 0.){
    vec2 gp = vP.xz * gridScale;
    gp.y -= PH_camTravel * gridScale;
    vec2 gf = abs(fract(gp) - .5);
    float lw = .015 + dist * .002 * gridScale;
    float ln = smoothstep(.5 - lw * 2., .5, max(gf.x, gf.y));
    ln = mix(ln, lw * 2., smoothstep(.1, .3, lw));
    c += gridCol * gridAmt * ln * 2.5 * exp(-dist * .03);
  }
  c = mix(c, skyHor * (1. - F), fogF(dist));
  vec3 r = reflect(rd, n);
  r.y = abs(r.y) + .002;
  c += F * mix(vec3(1), waterCol / max(maxc(waterCol), 1e-3), .25) * env(r);
  FRAGC = vec4(ENCC(clamp(c, 0., 60.)), 1.);
}`,
};

P.terrain = {
  vs: `ATTR vec4 a0;
VARY vec3 vP;
VARY vec3 vN;
VARY float vH;
uniform float uSpan;
void main(){
  if (terW < .01){ gl_Position = OFF; return; }
  float cell = 2. * uSpan / TER_N;
  vec2 ctr = floor(uCamPos.xz / cell) * cell;
  vec2 xz = ctr + (a0.xy * 2. - 1.) * uSpan;
  float h = terrainH(xz);
  float hx = terrainH(xz + vec2(cell, 0.)), hz = terrainH(xz + vec2(0., cell));
  vec3 p = vec3(xz.x, flrY + h, xz.y);
  vH = h;
  vP = mirrorP(p);
  vN = mirrorN(normalize(vec3(h - hx, cell, h - hz)));
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING vec3 vN;
VARYING float vH;
void main(){
  SUN = angDir(sunYaw, sunElev);
  vec3 rd = normalize(vP - uCamPos);
  float dist = length(vP - uCamPos);
  vec3 n = normalize(vN);
  gClouds = 0.;
  Mat m = material(10., vec4(vH, 0, 0, 0), vP, n, dist);
  outOpaque(shadeOpaque(m, vP, n, rd, 1., 10.), vP, dist);
}`,
};

P.ribbon = {
  vs: `ATTR vec4 a0; // x along, y across, z ribbon index
VARY vec3 vP;
VARY vec3 vN;
VARY vec4 vInfo;
VARY float vOrigY;
void main(){
  float fi = a0.z;
  if (ribW <= .01 || ribCount - fi <= 0.){ gl_Position = OFF; return; }
  float hi = ribHash(fi), w = ribWidthOf(fi, hi);
  float x = (a0.x * 2. - 1.) * RIB_X, v = a0.y * 2. - 1.;
  vec3 q = ribQ(x, v * w, fi, hi);
  vec3 n = normalize(cross(ribQ(x + .05, v * w, fi, hi) - q, ribQ(x, v * w + .05, fi, hi) - q));
  vec3 p = ribWorld(q);
  vOrigY = p.y;
  vP = mirrorP(p);
  vN = mirrorN(ribDir(n));
  vInfo = vec4(x, v, fi, hi);
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING vec3 vN;
VARYING vec4 vInfo;
VARYING float vOrigY;
void main(){
  if (uMirror > .5 && vOrigY < flrYw()) discard;
  SUN = angDir(sunYaw, sunElev);
  vec3 rd = normalize(vP - uCamPos);
  float dist = length(vP - uCamPos);
  vec3 n = normalize(vN);
  if (dot(n, rd) > 0.) n = -n;
  Mat m = material(1., vInfo, vP, n, dist);
  outGlass(m, vP, n, rd, dist, vec3(0));
}`,
};

P.ribglow = {
  vs: `ATTR vec4 a0; // x along, y across the halo, z ribbon index, w edge (-1, 0 spine, 1)
VARY vec3 vP;
VARY float vD;
VARY float vAmp;
VARY float vW;
VARY float vFi;
VARY float vOrigY;
void main(){
  float fi = a0.z;
  if (ribW <= .01 || ribGlow <= .01 || ribCount - fi <= 0.){ gl_Position = OFF; return; }
  float hi = ribHash(fi), w = ribWidthOf(fi, hi);
  float x = (a0.x * 2. - 1.) * RIB_X, s = a0.w * w;
  vec3 c = ribWorld(ribQ(x, s, fi, hi));
  vec3 t = normalize(ribWorld(ribQ(x + .05, s, fi, hi)) - c);
  vOrigY = c.y;
  c = mirrorP(c); t = mirrorN(t);
  vec3 side = normalize(cross(t, c - uCamPos));
  float H = .45, v = a0.y * 2. - 1.;
  vP = c + side * v * H;
  vD = v * H;
  float on = clamp(ribCount - fi, 0., 1.);
  bool spine = abs(a0.w) < .5;
  vW = spine ? .04 : .05;
  vAmp = ribGlow * on * ribW * (spine ? .8 : 3.) * 1.5708 * vW;
  vFi = fi;
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING float vD;
VARYING float vAmp;
VARYING float vW;
VARYING float vFi;
VARYING float vOrigY;
void main(){
  if (uMirror > .5 && vOrigY < flrYw()) discard;
  outAdd(ribCol(vFi) * vAmp * lineGlow(abs(vD), vW), vP, length(vP - uCamPos));
}`,
};

P.sphere = {
  vs: `ATTR vec4 a0; // xy quad corner, z sphere index
VARY vec3 vP;
VARY vec3 vC;
VARY float vR;
void main(){
  float fi = a0.z, on = clamp(sphCount - fi, 0., 1.);
  if (sphW <= .01 || on <= 0.){ gl_Position = OFF; return; }
  vec3 h = hash31(fi * 3.71 + sphSeed * 1.3);
  vec3 c = (h - .5) * vec3(2., 1., 1.4) * sphSpread * (fi < .5 ? 1. - sphCenter0 : 1.);
  c.y += sphBob * .3 * sin(PH_sphSpeed + fi * 1.9);
  c.x += sphBob * .2 * sin(PH_sphSpeed * .7 + fi * 2.7);
  float r = sphSize * on * sphW * (1. - sphVar * .6 + sphVar * 1.2 * hash11(fi * 9.1 + sphSeed));
  vC = mirrorP(c + vec3(sphX, sphY, sphZ));
  vR = r;
  vP = billboard(vC, a0.xy, r * 1.6);
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING vec3 vC;
VARYING float vR;
void main(){
  vec3 rd = normalize(vP - uCamPos), oc = uCamPos - vC;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + vR * vR;
  if (h < 0.) discard;
  float t = -b - sqrt(h);
  if (t < 0.) discard;
  SUN = angDir(sunYaw, sunElev);
  vec3 p = uCamPos + rd * t, n = (p - vC) / vR;
  Mat m = material(2., vec4(p - vC, vR), p, n, t);
  // the lens: refract through the ball and look up what is behind
  vec3 r1 = refract(rd, n, 1. / 1.33);
  vec3 p2 = p + r1 * max(-2. * dot(r1, n) * vR, 0.);
  vec3 r2 = refract(r1, -(p2 - vC) / vR, 1.33);
  if (dot(r2, r2) < .001) r2 = reflect(r1, -(p2 - vC) / vR);
  vec3 lens = envR(r2) * (m.alb / max(maxc(m.alb), 1e-3) * .5 + .5);
  float cosi = abs(dot(n, rd));
  outGlass(m, p, n, rd, t, lens * (1. - cosi * .2) * .45 * m.glass);
}`,
};

P.shard = {
  vs: `ATTR vec4 a0; // xyz octahedron corner, w shard index
ATTR vec4 a1; // xyz face signs
VARY vec3 vP;
VARY vec3 vN;
VARY vec4 vInfo;
VARY float vOrigY;
void main(){
  float fi = a0.w;
  if (shdW <= .01 || shdCount - fi <= 0.){ gl_Position = OFF; return; }
  vec3 dir, bx; float len, th, hz;
  shardFrame(fi, dir, bx, len, th, hz);
  vec3 by = cross(dir, bx);
  vec3 ax = vec3(th, th * .55, len * .5 + 1e-3);
  vec3 q = dir * (shdR0 + len * .5) + bx * a0.x * ax.x + by * a0.y * ax.y + dir * a0.z * ax.z;
  vec3 n = normalize(bx * a1.x / ax.x + by * a1.y / ax.y + dir * a1.z / ax.z);
  vec3 p = shardSpin(q) + vec3(shdX, shdY, shdZ);
  vOrigY = p.y;
  vP = mirrorP(p);
  vN = mirrorN(shardSpin(n));
  vInfo = vec4(a0.xyz, hz);
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING vec3 vN;
VARYING vec4 vInfo;
VARYING float vOrigY;
void main(){
  if (uMirror > .5 && vOrigY < flrYw()) discard;
  SUN = angDir(sunYaw, sunElev);
  vec3 rd = normalize(vP - uCamPos);
  float dist = length(vP - uCamPos);
  vec3 n = normalize(vN);
  if (dot(n, rd) > 0.) n = -n;
  outGlass(material(3., vInfo, vP, n, dist), vP, n, rd, dist, vec3(0));
}`,
};

P.shardglow = {
  vs: `ATTR vec4 a0; // xy quad corner, z shard index
VARY vec3 vP;
VARY vec2 vQ;
VARY float vR;
VARY float vAmp;
void main(){
  float fi = a0.z;
  if (shdW <= .01 || shdGlow <= .01 || shdCount - fi <= 0.){ gl_Position = OFF; return; }
  vec3 dir, bx; float len, th, hz;
  shardFrame(fi, dir, bx, len, th, hz);
  vec3 c = mirrorP(shardSpin(dir * (shdR0 + len * .5)) + vec3(shdX, shdY, shdZ));
  vR = len * .5 + th * 4. + .2;
  vQ = a0.xy;
  vAmp = shdGlow * clamp(shdCount - fi, 0., 1.) * shdW * th * 2.;
  vP = billboard(c, a0.xy, vR);
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING vec2 vQ;
VARYING float vR;
VARYING float vAmp;
void main(){
  float d = length(vQ);
  if (d > 1.) discard;
  outAdd(shdCol * vAmp * lineGlow(d * vR, .12) * (1. - d), vP, length(vP - uCamPos));
}`,
};

// shared fragment body for everything shaded as "glass with material id"
const glassFs = id => `VARYING vec3 vP;
VARYING vec3 vN;
VARYING vec4 vInfo;
VARYING float vOrigY;
void main(){
  if (uMirror > .5 && vOrigY < flrYw()) discard;
  SUN = angDir(sunYaw, sunElev);
  vec3 rd = normalize(vP - uCamPos);
  float dist = length(vP - uCamPos);
  vec3 n = normalize(vN);
  if (dot(n, rd) > 0.) n = -n;
  outGlass(material(${id}., vInfo, vP, n, dist), vP, n, rd, dist, vec3(0));
}`;

P.tunnel = {
  vs: `ATTR vec4 a0; // x around, y cross-section, z ring k
VARY vec3 vP;
VARY vec3 vN;
VARY vec4 vInfo;
VARY float vOrigY;
uniform float uCi0;
void main(){
  if (tunW <= .01){ gl_Position = OFF; return; }
  float ci = uCi0 + a0.z, sp = tunSpacing;
  float ang = a0.x * TAU - PI;
  float N = max(tunSides, 3.);
  float an = mod(ang + PI / N, TAU / N) - PI / N;
  float den = mix(1., cos(an), tunPoly);
  float rad = tunRadius * (1. + tunWobble * .15 * sin(ci * 1.7)) + (1. - tunW) * 14.;
  float er = mix(tunThick, tunThick * .35, tunFlat), ez = mix(tunThick, tunBandW * sp * .5, tunFlat);
  float cs = a0.y * TAU, c1 = cos(cs), s1 = sin(cs), e = mix(1., .25, tunFlat);
  float cr = sign(c1) * pow(abs(c1), e), sr = sign(s1) * pow(abs(s1), e);
  vec3 radial = vec3(cos(ang), sin(ang), 0.);
  vec3 q = radial * (rad / den + cr * er) + vec3(0., 0., ci * sp + sr * ez);
  vec3 n = normalize(radial * cr / er + vec3(0., 0., sr / ez));
  q.z += PH_camTravel;
  q.xz = rot(-tunYaw) * q.xz;
  n.xz = rot(-tunYaw) * n.xz;
  vec3 p = q + vec3(tunX, tunY, 0.);
  vOrigY = p.y;
  vP = mirrorP(p);
  vN = mirrorN(n);
  vInfo = vec4(cr * er, sr * ez / (sp * max(tunBandW, .05)), ang, ci);
  gl_Position = project(vP);
}`,
  fs: glassFs(4),
};

P.rail = {
  vs: `ATTR vec4 a0; // x along, y around the tube, z rail index
VARY vec3 vP;
VARY vec3 vN;
VARY vec4 vInfo;
VARY float vOrigY;
uniform vec2 uZ;
void main(){
  float M = max(tunRailN, 1.);
  if (tunW <= .01 || tunRails <= .01 || a0.z >= M){ gl_Position = OFF; return; }
  float ang = a0.z * TAU / M;
  float N = max(tunSides, 3.);
  float an = mod(ang + PI / N, TAU / N) - PI / N;
  float rad = (tunRadius + (1. - tunW) * 14.) / mix(1., cos(an), tunPoly);
  float tr = tunThick * .5 * tunRails, cs = a0.y * TAU;
  vec3 radial = vec3(cos(ang), sin(ang), 0.), perp = vec3(-sin(ang), cos(ang), 0.);
  vec3 off = (radial * cos(cs) + vec3(0., 0., 1.) * 0. + perp * sin(cs));
  vec3 q = radial * rad + off * tr + vec3(0., 0., uZ.x + a0.x * uZ.y);
  vec3 n = off;
  q.z += PH_camTravel;
  q.xz = rot(-tunYaw) * q.xz;
  n.xz = rot(-tunYaw) * n.xz;
  vec3 p = q + vec3(tunX, tunY, 0.);
  vOrigY = p.y;
  vP = mirrorP(p);
  vN = mirrorN(n);
  vInfo = vec4(cos(cs) * tr, 0., ang, 0.);
  gl_Position = project(vP);
}`,
  fs: glassFs(4),
};

P.arch = {
  vs: `ATTR vec4 a0; // x along z, y across, z tier, w part (0 wall, 1 slab bottom, 2 slab face, 3 slab top, 4 ceiling)
VARY vec3 vP;
VARY vec3 vN;
VARY vec4 vInfo;
VARY float vOrigY;
uniform float uSide;
uniform vec2 uZ;
void main(){
  if (arcW <= .01){ gl_Position = OFF; return; }
  float z = uZ.x + a0.x * uZ.y, part = a0.w, k = a0.z, T = arcTierH;
  float ceilY = arcCeil + (1. - arcW) * 25.;
  bool roof = arcHole < arcWidth + arcStep;
  float yMax = roof ? ceilY : 40.;
  vec3 q, n;
  vec4 info;
  if (part < .5){
    float y = min((k + mix(.004, .996, a0.y)) * T, yMax);
    float wz = archWz(z, y);
    q = vec3(uSide * wz, y, z);
    vec3 dz = vec3(uSide * archWz(z + .05, y), y, z + .05) - q;
    vec3 dy = vec3(uSide * archWz(z, y + .05), y + .05, z) - q;
    n = normalize(cross(dz, dy)) * -uSide;
    if (n.x * uSide > 0.) n = -n;
    info = vec4(fract(y / T), z, 0., -1.);
  } else if (part < 3.5){
    float y0 = k * T;
    if (k < 1. || y0 > yMax){ gl_Position = OFF; return; }
    float wz = archWz(z, y0 + .001), t = a0.y, ax, y;
    if (part < 1.5){ ax = wz - t * arcLip; y = y0 - .07; n = vec3(0, -1, 0); }
    else if (part < 2.5){ ax = wz - arcLip; y = y0 - .07 + t * .14; n = vec3(-uSide, 0, 0); }
    else { ax = wz - (1. - t) * arcLip; y = y0 + .07; n = vec3(0, 1, 0); }
    q = vec3(uSide * ax, y, z);
    info = vec4(0., z, 1., ax - (wz - arcLip));
  } else {
    float wz = archWz(z, ceilY);
    if (!roof || arcHole >= wz){ gl_Position = OFF; return; }
    q = vec3(uSide * mix(arcHole, wz, a0.y), ceilY, z);
    n = vec3(0, -1, 0);
    info = vec4(.5, z, 0., -1.);
  }
  q.y += flrY;
  vec3 p = archWorld(q);
  vOrigY = p.y;
  vP = mirrorP(p);
  vN = mirrorN(archDir(n));
  vInfo = info;
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING vec3 vN;
VARYING vec4 vInfo;
VARYING float vOrigY;
void main(){
  if (uMirror > .5 && vOrigY < flrYw() - .01) discard;
  SUN = angDir(sunYaw, sunElev);
  vec3 rd = normalize(vP - uCamPos);
  float dist = length(vP - uCamPos);
  vec3 n = normalize(vN);
  gClouds = 0.;
  Mat m = material(5., vInfo, vP, n, dist);
  // stand-in for the raymarcher's ambient occlusion: darker just under each balcony
  float ao = vInfo.z > .5 ? 1. : mix(.62, 1., smoothstep(.0, .35, 1. - vInfo.x));
  outOpaque(shadeOpaque(m, vP, n, rd, ao, 5.), vP, dist);
}`,
};

P.archglow = {
  vs: `ATTR vec4 a0; // x along z, y across the halo, z tier
VARY vec3 vP;
VARY float vD;
VARY float vOrigY;
uniform float uSide;
uniform vec2 uZ;
void main(){
  float k = a0.z, T = arcTierH, y0 = k * T;
  float ceilY = arcCeil + (1. - arcW) * 25.;
  float yMax = arcHole < arcWidth + arcStep ? ceilY : 40.;
  if (arcW <= .01 || arcLight <= .01 || k < 1. || y0 > yMax){ gl_Position = OFF; return; }
  float z = uZ.x + a0.x * uZ.y;
  vec3 c = archWorld(vec3(uSide * (archWz(z, y0 + .001) - arcLip), y0 - .09 + flrY, z));
  vec3 c2 = archWorld(vec3(uSide * (archWz(z + .1, y0 + .001) - arcLip), y0 - .09 + flrY, z + .1));
  vOrigY = c.y;
  c = mirrorP(c); c2 = mirrorP(c2);
  vec3 side = normalize(cross(normalize(c2 - c), c - uCamPos));
  float H = .35, v = a0.y * 2. - 1.;
  vP = c + side * v * H;
  vD = v * H;
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING float vD;
VARYING float vOrigY;
void main(){
  if (uMirror > .5 && vOrigY < flrYw()) discard;
  outAdd(arcLightCol * arcLight * arcW * .9 * 1.5708 * .035 * lineGlow(abs(vD), .035), vP, length(vP - uCamPos));
}`,
};

P.block = {
  vs: `ATTR vec4 a0; // xyz box corner (+-1), w rank
ATTR vec4 a1; // xyz face normal, w hash
ATTR vec4 a2; // xyz cell, w hash
VARY vec3 vP;
VARY vec3 vN;
VARY vec4 vInfo;
VARY float vOrigY;
uniform vec3 uCamQ;
void main(){
  float cs = blkCell;
  vec3 cell = a2.xyz;
  if (blkW <= .01 || a0.w > blkDensity || abs(cell.y + .5) > blkLayers
      || length((cell.xy + .5) * cs - uCamQ.xy) < blkClear){ gl_Position = OFF; return; }
  float D = BLK_D * cs, zc0 = (cell.z + .5) * cs;
  float zc = uCamQ.z + 2. * cs - mod(uCamQ.z + 2. * cs - zc0, D);
  vec3 h3 = vec3(a1.w, a2.w, fract(a0.w * 91.7 + a1.w * 13.1));
  vec3 sz = cs * blkSize * (.4 + .6 * h3);
  sz = mix(sz, sz * vec3(.3, .3, 2.6), clamp(blkStretch, 0., 1.));
  sz = mix(sz, sz * vec3(.3, 2.6, .3), clamp(-blkStretch, 0., 1.));
  sz = min(sz, vec3(cs * .47)) * blkW;
  vec3 q = vec3((cell.xy + .5) * cs, zc) + a0.xyz * sz;
  q.z += PH_camTravel;
  q.xz = rot(-blkYaw) * q.xz;
  vec3 n = a1.xyz;
  n.xz = rot(-blkYaw) * n.xz;
  vec3 p = q + vec3(0., blkY, 0.);
  vOrigY = p.y;
  vP = mirrorP(p);
  vN = mirrorN(n);
  vInfo = vec4(a0.xyz, a0.w);
  gl_Position = project(vP);
}`,
  fs: glassFs(6),
};

P.helix = {
  vs: `ATTR vec4 a0; // xyz box corner (+-1: radial, up, along), w step index
ATTR vec4 a1; // xyz face normal in the same frame
VARY vec3 vP;
VARY vec3 vN;
VARY vec4 vInfo;
VARY float vOrigY;
void main(){
  if (hlxW <= .01){ gl_Position = OFF; return; }
  float da = TAU / max(hlxSteps, 3.), st = hlxStepify;
  float A0 = (a0.w - HLX_K * .5 + .5) * da;
  if (abs(A0 * hlxPitch / TAU) > hlxHeight * hlxW){ gl_Position = OFF; return; }
  float A = A0 + a0.z * da * mix(.5, .46, st);
  float y = mix(A, A0, st) * hlxPitch / TAU + a0.y * hlxThick;
  float r = hlxRadius + a0.x * hlxWidth * hlxW;
  vec3 R = vec3(cos(A), 0., sin(A)), Tg = vec3(-sin(A), 0., cos(A));
  vec3 q = R * r + vec3(0., y, 0.);
  vec3 n = R * a1.x + vec3(0., a1.y, 0.) + Tg * a1.z;
  q.xz = rot(-PH_hlxSpin) * q.xz;
  n.xz = rot(-PH_hlxSpin) * n.xz;
  vec3 p = q + vec3(hlxX, hlxY, hlxZ);
  vOrigY = p.y;
  vP = mirrorP(p);
  vN = mirrorN(n);
  vInfo = vec4(a0.x, a0.y * hlxThick, A, 0.);
  gl_Position = project(vP);
}`,
  fs: glassFs(7),
};

P.trunk = {
  vs: `ATTR vec4 a0; // x around, y along
VARY vec3 vP;
VARY vec3 vN;
VARY float vOrigY;
void main(){
  if (treeW <= .01){ gl_Position = OFF; return; }
  float s = treeSize * treeW, hy = a0.y * s * 1.3, ang = a0.x * TAU;
  vec3 ctr = vec3(sin(hy * 2. / s) * .06 * s, hy, 0.);
  vec3 rdir = vec3(cos(ang), 0., sin(ang));
  vec3 p = vec3(treeX, treeY(), treeZ) + ctr + rdir * s * (.1 - .05 * hy / (s * 1.3));
  vOrigY = p.y;
  vP = mirrorP(p);
  vN = mirrorN(rdir);
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING vec3 vN;
VARYING float vOrigY;
void main(){
  if (uMirror > .5 && vOrigY < flrYw()) discard;
  SUN = angDir(sunYaw, sunElev);
  vec3 rd = normalize(vP - uCamPos);
  float dist = length(vP - uCamPos);
  vec3 n = normalize(vN);
  gClouds = 0.;
  Mat m = material(9., vec4(0), vP, n, dist);
  outOpaque(shadeOpaque(m, vP, n, rd, 1., 9.), vP, dist);
}`,
};

P.foliage = {
  vs: `ATTR vec4 a0; // xy quad corner, z blob index
VARY vec3 vP;
VARY vec3 vC;
VARY float vR;
VARY vec3 vBase;
void main(){
  if (treeW <= .01){ gl_Position = OFF; return; }
  float s = treeSize * treeW, i = a0.z;
  vec3 h = hash31(i * 4.1 + treeSeed);
  vec3 c = i < .5 ? vec3(0., 1.5, 0.) : vec3((h.x - .5) * 1.5, 1.3 + (h.y - .3) * .75, (h.z - .5) * 1.5);
  vBase = vec3(treeX, treeY(), treeZ);
  vC = mirrorP(vBase + c * s);
  vR = s * (.42 + .2 * h.y) * 1.18;
  vP = billboard(vC, a0.xy, vR * 1.25);
  gl_Position = project(vP);
}`,
  fs: `VARYING vec3 vP;
VARYING vec3 vC;
VARYING float vR;
VARYING vec3 vBase;
void main(){
  vec3 rd = normalize(vP - uCamPos), oc = uCamPos - vC;
  float b = dot(oc, rd), h = b * b - dot(oc, oc) + vR * vR;
  if (h < 0.) discard;
  float t = -b - sqrt(h);
  vec3 p = uCamPos + rd * t;
  float s = treeSize * treeW;
  vec3 lp = (p - vBase) / s;
  // leafy silhouette: eat into the rim with noise
  float rim = 1. - sqrt(h) / vR;
  if (rim > .55 + .4 * noise3(lp * 6.)) discard;
  SUN = angDir(sunYaw, sunElev);
  vec3 n = normalize((p - vC) / vR + (vec3(noise3(lp * 5.), noise3(lp * 5. + 3.1), noise3(lp * 5. + 7.3)) - .5) * .9);
  gClouds = 0.;
  Mat m = material(8., vec4(lp, 0.), p, n, t);
  outOpaque(shadeOpaque(m, p, n, rd, mix(.55, 1., clamp(n.y * .5 + .5, 0., 1.)), 8.), p, t);
}`,
};

// what each program needs from the shared libraries
const SEL = {
  sky: {}, water: { water: true }, terrain: { mats: [10], ter: true },
  ribbon: { mats: [1] }, ribglow: { rib: true }, sphere: { mats: [2] },
  shard: { mats: [3] }, shardglow: {}, tunnel: { mats: [4] }, rail: { mats: [4] },
  arch: { mats: [5] }, archglow: {}, block: { mats: [6] }, helix: { mats: [7] },
  trunk: { mats: [9], ter: true }, foliage: { mats: [8], ter: true },
};
const VS_PARTS = { ribbon: 'rib', ribglow: 'rib', shard: 'shd', shardglow: 'shd', arch: 'arc', archglow: 'arc' };

export const PROGRAMS = Object.keys(P);

/** Sources for one raster program. Layout comes from genome.js layout() over both stages. */
export function rasterSources(name, defs, o) {
  const p = P[name];
  const consts = `#define TER_N ${o.potato ? '96.' : '160.'}
#define BLK_D 25.
#define HLX_K 400.
`;
  const head = DECLS(defs, o, SEL[name]) + consts;
  const part = { rib: VS_RIB, shd: VS_SHD, arc: VS_ARC }[VS_PARTS[name]] || '';
  return {
    vs: vertHead(o) + head + VS_BASE + part + p.vs,
    fs: fragHead(o) + head + FS_LIB + p.fs,
  };
}
