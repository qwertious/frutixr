// Rasterized renderer: the same scenes as the raymarcher, drawn as geometry so
// weak GPUs get real motion at full frame rate. Every element is a static mesh
// whose vertices are positioned in the vertex shader from the genome (see
// rshaders.js); this file builds those meshes once and issues the draws.
// Post-processing (bloom, overlays, grading) is the raymarcher's, inherited.
import { Renderer } from './renderer.js?v=7';
import { DOWN, UP, COMPOSITE, VERT } from './shaders.js?v=7';
import { PROGRAMS, rasterSources } from './rshaders.js?v=7';
import { layout, IDX } from './genome.js?v=7';

const KMAX_RINGS = 48, TIERS = 24, BLK = { x: 18, y: 6, z: 25 }, HLX_K = 400;

// ---------------------------------------------------------------- mesh building
// A mesh is interleaved vec4 attributes (comps = 4, 8 or 12 floats per vertex)
// plus 16-bit indices, so it also works on WebGL1 without extensions.
class MeshBuilder {
  constructor(comps) { this.comps = comps; this.v = []; this.i = []; this.n = 0; }
  vert(...a) { for (let k = 0; k < this.comps; k++) this.v.push(a[k] ?? 0); return this.n++; }
  tri(a, b, c) { this.i.push(a, b, c); }
  /** (U+1) x (V+1) grid; f(u, v) returns the vertex attributes. */
  grid(U, V, f) {
    const base = this.n;
    for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++) this.vert(...f(i / U, j / V));
    for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
      const a = base + j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
      this.tri(a, b, c); this.tri(b, d, c);
    }
  }
  /** axis-aligned unit box with per-face normals; f(corner, normal) returns attributes */
  box(f) {
    const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const n of faces) {
      const ax = n.findIndex(c => c !== 0), u = (ax + 1) % 3, w = (ax + 2) % 3;
      const base = this.n;
      for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const c = [0, 0, 0]; c[ax] = n[ax]; c[u] = su; c[w] = sw;
        this.vert(...f(c, n));
      }
      this.tri(base, base + 1, base + 2); this.tri(base, base + 2, base + 3);
    }
  }
}

const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function buildMeshes(potato) {
  const M = {};
  const q = (m, z) => m.grid(1, 1, (u, v) => [u * 2 - 1, v * 2 - 1, z, 0]);

  let m = new MeshBuilder(4); m.vert(-1, -1); m.vert(3, -1); m.vert(-1, 3); m.tri(0, 1, 2); M.tri = m;
  m = new MeshBuilder(4); q(m, 0); M.quad = m;
  const TN = potato ? 96 : 160;
  m = new MeshBuilder(4); m.grid(TN, TN, (u, v) => [u, v, 0, 0]); M.terrain = m;

  const RU = potato ? 160 : 320, RV = potato ? 2 : 6;
  m = new MeshBuilder(4); for (let r = 0; r < 6; r++) m.grid(RU, RV, (u, v) => [u, v, r, 0]); M.ribbon = m;
  m = new MeshBuilder(4);
  for (let r = 0; r < 6; r++) for (const e of [-1, 0, 1]) m.grid(RU, 1, (u, v) => [u, v, r, e]);
  M.ribglow = m;

  m = new MeshBuilder(4); for (let i = 0; i < 12; i++) q(m, i); M.sphere = m;
  m = new MeshBuilder(8);
  for (let s = 0; s < 24; s++) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const a = m.vert(sx, 0, 0, s, sx, sy, sz, 0), b = m.vert(0, sy, 0, s, sx, sy, sz, 0), c = m.vert(0, 0, sz, s, sx, sy, sz, 0);
    m.tri(a, b, c);
  }
  M.shard = m;
  m = new MeshBuilder(4); for (let i = 0; i < 24; i++) q(m, i); M.shardglow = m;

  const KR = potato ? 24 : KMAX_RINGS, RA = potato ? 32 : 48, RC = potato ? 6 : 8;
  m = new MeshBuilder(4); for (let k = 0; k < KR; k++) m.grid(RA, RC, (u, v) => [u, v, k, 0]); M.tunnel = m; M.tunnel.rings = KR;
  m = new MeshBuilder(4); for (let j = 0; j < 12; j++) m.grid(potato ? 48 : 96, 6, (u, v) => [u, v, j, 0]); M.rail = m;

  const AZ = potato ? 64 : 128, AR = potato ? 4 : 8;
  m = new MeshBuilder(4);
  for (let k = 0; k < TIERS; k++) m.grid(AZ, AR, (u, v) => [u, v, k, 0]);
  for (let k = 1; k < TIERS; k++) for (const part of [1, 2, 3]) m.grid(AZ, 1, (u, v) => [u, v, k, part]);
  m.grid(AZ, 4, (u, v) => [u, v, 0, 4]);
  M.arch = m;
  m = new MeshBuilder(4); for (let k = 1; k < TIERS; k++) m.grid(AZ, 1, (u, v) => [u, v, k, 0]); M.archglow = m;

  // block pool: every cell of the window gets a box with a random rank; sorted by
  // rank so that drawing the first N boxes shows exactly those with rank < density
  const r = rng(12345), cells = [];
  for (let x = -BLK.x / 2; x < BLK.x / 2; x++) for (let y = -BLK.y / 2; y < BLK.y / 2; y++) for (let z = 0; z < BLK.z; z++) cells.push([x, y, z, r(), r(), r()]);
  cells.sort((a, b) => a[3] - b[3]);
  m = new MeshBuilder(12);
  for (const [x, y, z, rank, h1, h2] of cells) m.box((c, n) => [...c, rank, ...n, h1, x, y, z, h2]);
  M.block = m; M.block.ranks = cells.map(c => c[3]);

  m = new MeshBuilder(8); for (let k = 0; k < HLX_K; k++) m.box((c, n) => [...c, k, ...n, 0]); M.helix = m;
  m = new MeshBuilder(4); m.grid(16, 8, (u, v) => [u, v, 0, 0]); M.trunk = m;
  m = new MeshBuilder(4); for (let i = 0; i < 7; i++) q(m, i); M.foliage = m;
  return M;
}

// ---------------------------------------------------------------- renderer
export class RasterRenderer extends Renderer {
  constructor(canvas, opts) {
    super(canvas, opts);
    this.raster = true;
  }

  get mode() { return `${this.gl2 ? 'WebGL2' : 'WebGL1'}${this.hdr ? '' : ' · 8-bit'} · smooth${this.opts?.potato ? ' · potato' : ''}`; }

  async compile({ tier = 'lite' } = {}) {
    const gl = this.gl;
    const o = { es3: this.gl2, hdr: this.hdr, linear: !this.hdr, lite: true, potato: tier === 'potato', tier, cpuShards: false };
    const vs = VERT(o);
    const LC = layout(COMPOSITE('', o));
    const progs = { down: this.link(vs, DOWN(o)), up: this.link(vs, UP(o)), comp: this.link(vs, COMPOSITE(LC.defs, o), LC) };
    const raster = {};
    for (const name of PROGRAMS) {
      const s0 = rasterSources(name, '', o);
      const L = layout(s0.vs + s0.fs);
      const s = rasterSources(name, L.defs, o);
      raster[name] = this.link(s.vs, s.fs, L);
    }
    const all = { ...progs, ...raster };
    if (this.par) {
      const done = () => Object.values(all).every(p => gl.getProgramParameter(p.prog, this.par.COMPLETION_STATUS_KHR));
      while (!done()) await new Promise(r => setTimeout(r, 30));
    }
    for (const k in all) this.check(all[k], k);
    for (const k in all) {
      const p = all[k], n = gl.getProgramParameter(p.prog, gl.ACTIVE_UNIFORMS);
      p.u = {};
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p.prog, i).name.replace(/\[0\]$/, '');
        p.u[name] = gl.getUniformLocation(p.prog, name);
      }
    }
    if (!this.meshes || this.meshes.potato !== o.potato) this.uploadMeshes(buildMeshes(o.potato), o.potato);
    for (const set of [this.p, this.r]) if (set) for (const k in set) gl.deleteProgram(set[k].prog);
    this.p = progs; this.r = raster; this.opts = o; this.fresh = true;
  }

  uploadMeshes(M, potato) {
    const gl = this.gl;
    if (this.meshes) for (const k in this.meshes) if (this.meshes[k].vbo) { gl.deleteBuffer(this.meshes[k].vbo); gl.deleteBuffer(this.meshes[k].ibo); }
    this.meshes = { potato };
    for (const k in M) {
      const m = M[k];
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.i), gl.STATIC_DRAW);
      if (m.n > 65535) throw new Error(`mesh ${k} has too many vertices`);
      this.meshes[k] = { vbo, ibo, count: m.i.length, comps: m.comps, rings: m.rings, ranks: m.ranks };
    }
  }

  // depth buffer for the scene target
  onTargets(T) {
    const gl = this.gl, s = T.scene;
    if (this.depthRb) gl.deleteRenderbuffer(this.depthRb);
    this.depthRb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, s.w, s.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRb);
  }

  bindMesh(mesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    const stride = mesh.comps * 4;
    for (let i = 0; i < 3; i++) {
      if (i * 4 < mesh.comps) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, stride, i * 16); }
      else gl.disableVertexAttribArray(i);
    }
  }

  renderScene(st) {
    const gl = this.gl, T = this.targets, R = this.r, M = this.meshes, g = st.genome;
    const v = n => g[IDX[n].off];
    const s = T.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
    gl.viewport(0, 0, s.w, s.h);
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    const asp = s.w / s.h, fov = Math.min(1, asp * 1.2), zoom = v('camZoom');
    const near = .1, far = 700;
    const proj = [zoom * 2 * fov / asp, zoom * 2 * fov, (far + near) / (far - near), -2 * far * near / (far - near)];
    const travel = st.phases[IDX.camTravel.phase];
    const cam = st.camPos;
    // camera position in an element's local frame (offset, then yaw), with travel removed
    const local = (off, yaw, trav) => {
      const x = cam[0] - off[0], y = cam[1] - off[1], z = cam[2] - off[2];
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      return [c * x - sn * z, y, sn * x + c * z - trav];
    };

    let mirror = 0, pass = 0;
    const use = (name, extra) => {
      const p = R[name];
      gl.useProgram(p.prog);
      gl.uniform3fv(p.u.uCamPos, cam);
      gl.uniformMatrix3fv(p.u.uCamRot, false, st.camRot);
      gl.uniform4fv(p.u.uProj, proj);
      gl.uniform2f(p.u.uRes, s.w, s.h);
      if (p.u.uMirror != null) gl.uniform1f(p.u.uMirror, mirror);
      if (p.u.uPass != null) gl.uniform1f(p.u.uPass, pass);
      if (p.u.uTime != null) gl.uniform1f(p.u.uTime, st.time);
      this.params(p, st);
      if (extra) extra(p);
      return p;
    };
    const draw = (name, mesh, extra, count) => {
      use(name, extra);
      this.bindMesh(M[mesh]);
      gl.drawElements(gl.TRIANGLES, count ?? M[mesh].count, gl.UNSIGNED_SHORT, 0);
    };

    // per-element extras
    const tunQ = local([v('tunX'), v('tunY'), 0], v('tunYaw'), travel);
    const tunnelExtra = p => {
      const sp = v('tunSpacing'), K = M.tunnel.rings;
      gl.uniform1f(p.u.uCi0, Math.floor((tunQ[2] + 4) / sp) - K + 1);
    };
    const railExtra = p => gl.uniform2f(p.u.uZ, tunQ[2] - 90, 94);
    const arcQ = local([0, 0, 0], v('arcYaw'), travel * v('arcTrav'));
    const archExtra = side => p => { gl.uniform1f(p.u.uSide, side); gl.uniform2f(p.u.uZ, arcQ[2] - 80, 110); };
    const blkQ = local([0, v('blkY'), 0], v('blkYaw'), travel);
    const blockExtra = p => gl.uniform3fv(p.u.uCamQ, blkQ);
    const ranks = M.block.ranks, dens = v('blkDensity');
    let nb = 0, hi = ranks.length;
    while (nb < hi) { const mid = (nb + hi) >> 1; if (ranks[mid] <= dens) nb = mid + 1; else hi = mid; }

    const on = n => v(n) > .01;
    const sides = v('arcOpen') < .5 ? [1, -1] : [1];
    const glassFamilies = () => {
      if (on('tunW')) { draw('tunnel', 'tunnel', tunnelExtra); if (on('tunRails')) draw('rail', 'rail', railExtra); }
      if (on('hlxW')) draw('helix', 'helix');
      if (on('blkW') && nb > 0) draw('block', 'block', blockExtra, nb * 36);
      if (on('ribW')) draw('ribbon', 'ribbon');
      if (on('shdW')) draw('shard', 'shard');
      if (on('sphW')) draw('sphere', 'sphere');
    };
    const opaqueFamilies = withTerrain => {
      if (withTerrain && on('terW')) draw('terrain', 'terrain', p => gl.uniform1f(p.u.uSpan, 90));
      if (on('arcW')) for (const sd of sides) draw('arch', 'arch', archExtra(sd));
      if (on('treeW')) { draw('trunk', 'trunk'); draw('foliage', 'foliage'); }
    };
    const glows = () => {
      gl.blendFunc(gl.ONE, gl.ONE);
      if (on('ribW') && on('ribGlow')) draw('ribglow', 'ribglow');
      if (on('shdW') && on('shdGlow')) draw('shardglow', 'shardglow');
      if (on('arcW') && on('arcLight')) for (const sd of sides) draw('archglow', 'archglow', archExtra(sd));
    };
    const glassPasses = () => {
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR); pass = 0; glassFamilies();
      gl.blendFunc(gl.ONE, gl.ONE); pass = 1; glassFamilies();
    };

    // 1. sky
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    draw('sky', 'tri');
    // 2. water, writing depth so everything under it is hidden
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    if (on('flrW')) draw('water', 'quad');
    // 3. reflections in the water: everything mirrored, weighted by Fresnel
    if (on('flrW') && !this.opts.potato) {
      mirror = 1;
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      opaqueFamilies(false);
      glassPasses();
      glows();
      mirror = 0;
      gl.enable(gl.DEPTH_TEST);
    }
    // 4. opaque geometry
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    opaqueFamilies(true);
    // 5. glass: multiply by transmission, then add the surface light
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    glassPasses();
    // 6. glow halos
    glows();
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }
}
