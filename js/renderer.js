// Render pipeline: raymarched HDR scene at an adaptive render scale, a
// dual-filter blur pyramid (bloom, depth of field, light shafts), then a
// full-resolution composite that adds 2D overlays and grades the image.
// Runs on WebGL2, or on WebGL1 for phones and older browsers that lack it.
import { VERT, SCENE, DOWN, UP, COMPOSITE } from './shaders.js?v=7';
import { layout } from './genome.js?v=7';

const LEVELS = 6;

export class Renderer {
  constructor(canvas, { forceGL1 = false, forceLDR = false } = {}) {
    this.canvas = canvas;
    const attrs = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false };
    let gl = forceGL1 ? null : canvas.getContext('webgl2', attrs);
    this.gl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('WebGL is not available in this browser, so Aeroscape cannot run here.');
    this.gl = gl;
    this.par = gl.getExtension('KHR_parallel_shader_compile');
    this.maxFragVec = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    this.highp = !!hp && hp.precision > 0;
    this.fmt = this.pickFormat(forceLDR);
    this.hdr = this.fmt.hdr;
    // one fullscreen triangle, bound to attribute 0 for every program
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.bindQuad();
    this.scale = 0.55;
    this.dprCap = 2;
    this.interleave = false; // trace one 8x8 tile of each 2x2 tile group per frame (low/potato)
    this.fresh = true;       // next scene pass must fill every pixel
    this.frame = 0;
    this.targets = null;
  }

  // Best render-target format: half float when it is renderable and filterable,
  // otherwise 8-bit RGBA (the shaders then tone-compress HDR values into it).
  pickFormat(forceLDR) {
    const gl = this.gl;
    const ldr = { internal: this.gl2 ? gl.RGBA8 : gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE, hdr: false };
    if (forceLDR) return ldr;
    if (this.gl2) {
      if (gl.getExtension('EXT_color_buffer_float')) return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, hdr: true };
      return { ...ldr, internal: gl.RGBA8 };
    }
    const hf = gl.getExtension('OES_texture_half_float');
    const lin = gl.getExtension('OES_texture_half_float_linear');
    gl.getExtension('EXT_color_buffer_half_float');
    if (!hf || !lin) return ldr;
    const f = { internal: gl.RGBA, format: gl.RGBA, type: hf.HALF_FLOAT_OES, hdr: true };
    const t = this.makeTarget(4, 4, f);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ok ? f : ldr;
  }

  get mode() { return `${this.gl2 ? 'WebGL2' : 'WebGL1'}${this.hdr ? '' : ' · 8-bit'}${this.opts && this.opts.tier !== 'full' ? ` · ${this.opts.tier}` : ''}`; }

  // Compile without blocking the page: resolves once every program is linked.
  // Programs are swapped in only after they all link, so the old set keeps
  // rendering while a quality change recompiles.
  // tier: 'full' | 'lite' | 'potato'
  async compile({ tier = 'full' } = {}) {
    const gl = this.gl;
    const base = { es3: this.gl2, hdr: this.hdr, tier, lite: tier !== 'full', potato: tier === 'potato' };
    // CPU-built crystal frames cost 48 uniform vectors; drop them when they would not fit
    let o = { ...base, cpuShards: true };
    let L = layout(SCENE('', o));
    if (L.ng + L.nph + 48 + 8 > this.maxFragVec) { o = { ...base, cpuShards: false }; L = layout(SCENE('', o)); }
    if (L.ng + L.nph + 8 > this.maxFragVec) throw new Error(`This GPU allows only ${this.maxFragVec} fragment uniform vectors; Aeroscape needs ${L.ng + L.nph + 8}.`);
    const LC = layout(COMPOSITE('', o));
    const vs = VERT(o);
    const progs = {
      scene: this.link(vs, SCENE(L.defs, o), L),
      down: this.link(vs, DOWN(o)),
      up: this.link(vs, UP(o)),
      comp: this.link(vs, COMPOSITE(LC.defs, o), LC),
    };
    if (this.par) {
      const done = () => Object.values(progs).every(p => gl.getProgramParameter(p.prog, this.par.COMPLETION_STATUS_KHR));
      while (!done()) await new Promise(r => setTimeout(r, 50));
    }
    for (const k in progs) this.check(progs[k], k);
    for (const k in progs) {
      const p = progs[k], n = gl.getProgramParameter(p.prog, gl.ACTIVE_UNIFORMS);
      p.u = {};
      for (let i = 0; i < n; i++) {
        const name = gl.getActiveUniform(p.prog, i).name.replace(/\[0\]$/, '');
        p.u[name] = gl.getUniformLocation(p.prog, name);
      }
    }
    const old = this.p;
    this.p = progs; this.opts = o; this.fresh = true;
    if (old) for (const k in old) { gl.deleteProgram(old[k].prog); gl.deleteShader(old[k].v); gl.deleteShader(old[k].f); }
  }

  link(vs, fs, L = null) {
    const gl = this.gl;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, v); gl.attachShader(prog, f);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.bindAttribLocation(prog, 0, 'a0');
    gl.bindAttribLocation(prog, 1, 'a1');
    gl.bindAttribLocation(prog, 2, 'a2');
    gl.linkProgram(prog);
    const p = { prog, v, f, fs, L };
    if (L) { p.g = new Float32Array(L.ng * 4); p.ph = new Float32Array(L.nph * 4); }
    return p;
  }

  check(p, name) {
    const gl = this.gl;
    if (gl.getProgramParameter(p.prog, gl.LINK_STATUS)) return;
    const log = gl.getShaderInfoLog(p.f) || gl.getShaderInfoLog(p.v) || gl.getProgramInfoLog(p.prog);
    const m = /0:(\d+)/.exec(log || '');
    let ctx = '';
    if (m) { const lines = p.fs.split('\n'), n = +m[1]; ctx = lines.slice(Math.max(0, n - 3), n + 2).map((l, i) => `${n - 2 + i}: ${l}`).join('\n'); }
    throw new Error(`Shader "${name}" failed:\n${log}\n${ctx}`);
  }

  makeTarget(w, h, f = this.fmt) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, f.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  free() {
    if (!this.targets) return;
    const gl = this.gl;
    for (const t of [this.targets.scene, ...this.targets.down, ...this.targets.up]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    this.targets = null;
  }

  ensure() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    let W = Math.round(c.clientWidth * dpr), Hh = Math.round(c.clientHeight * dpr);
    if (this.fixed) [W, Hh] = this.fixed;
    const cap = 2560 / Math.max(W, 1);
    if (cap < 1) { W = Math.round(W * cap); Hh = Math.round(Hh * cap); }
    if (c.width !== W || c.height !== Hh) { c.width = W; c.height = Hh; }
    const sw = Math.max(64, Math.round(W * this.scale)), sh = Math.max(36, Math.round(Hh * this.scale));
    const t = this.targets;
    if (t && t.scene.w === sw && t.scene.h === sh) return;
    this.free();
    this.fresh = true;
    const down = [], up = [];
    let w = sw, h = sh;
    for (let i = 0; i < LEVELS; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); down.push(this.makeTarget(w, h)); }
    for (let i = 0; i < LEVELS - 1; i++) up.push(this.makeTarget(down[i].w, down[i].h));
    this.targets = { scene: this.makeTarget(sw, sh), down, up };
    this.onTargets?.(this.targets);
  }

  bindQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    for (let i = 1; i < 3; i++) gl.disableVertexAttribArray(i);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }
  pass(prog, target, w, h) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.prog);
    this.bindQuad();
  }
  tex(prog, name, unit, tex) {
    const gl = this.gl;
    if (prog.u[name] == null) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.u[name], unit);
  }
  // gather just the genome values and phases this program's layout asked for
  params(p, st) {
    const gl = this.gl, { map, phMap } = p.L;
    for (let i = 0; i < map.length; i++) p.g[i] = st.genome[map[i]];
    for (let i = 0; i < phMap.length; i++) p.ph[i] = st.phases[phMap[i]];
    if (p.u.G != null) gl.uniform4fv(p.u.G, p.g);
    if (p.u.uPh != null) gl.uniform4fv(p.u.uPh, p.ph);
  }

  render(st) {
    this.ensure();
    this.frame++;
    this.renderScene(st);
    this.post(st);
  }

  renderScene(st) {
    const gl = this.gl, T = this.targets, P = this.p;
    const p = P.scene;
    this.pass(p, T.scene, T.scene.w, T.scene.h);
    gl.uniform2f(p.u.uRes, T.scene.w, T.scene.h);
    if (p.u.uTime != null) gl.uniform1f(p.u.uTime, st.time);
    if (p.u.uFrame != null) gl.uniform1i(p.u.uFrame, this.frame);
    // 0,3,1,2 visits the 2x2 tile group diagonally, which hides the update pattern best
    gl.uniform1f(p.u.uPhase, this.interleave && !this.fresh ? [0, 3, 1, 2][this.frame & 3] : -1);
    this.fresh = false;
    gl.uniform3fv(p.u.uCamPos, st.camPos);
    gl.uniformMatrix3fv(p.u.uCamRot, false, st.camRot);
    this.params(p, st);
    if (p.u.uShd != null) gl.uniform4fv(p.u.uShd, st.shards);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Blur pyramid (bloom, depth of field, shafts) and the full-resolution composite. */
  post(st) {
    const gl = this.gl, T = this.targets, P = this.p;
    let p;
    // level 1 stays unthresholded (depth of field); the bloom chain is thresholded from level 2 on
    p = P.down;
    let src = T.scene;
    T.down.forEach((d, i) => {
      this.pass(p, d, d.w, d.h);
      this.tex(p, 'uTex', 0, src.tex);
      gl.uniform1f(p.u.uThr, i === 1 ? st.bloomThr : -1);
      gl.uniform2f(p.u.uTexel, 1 / src.w, 1 / src.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = d;
    });
    // and back up, accumulating every level
    p = P.up;
    for (let i = LEVELS - 2; i >= 0; i--) {
      const dst = T.up[i];
      this.pass(p, dst, dst.w, dst.h);
      this.tex(p, 'uTex', 0, src.tex);
      this.tex(p, 'uAdd', 1, T.down[i].tex);
      gl.uniform1f(p.u.uAddW, i === 0 ? 0 : 1);
      gl.uniform2f(p.u.uTexel, 0.5 / src.w, 0.5 / src.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = dst;
    }

    // composite
    p = P.comp;
    this.pass(p, null, this.canvas.width, this.canvas.height);
    this.tex(p, 'uScene', 0, T.scene.tex);
    this.tex(p, 'uD1', 1, T.down[0].tex);
    this.tex(p, 'uD2', 2, T.down[1].tex);
    this.tex(p, 'uBloom', 3, T.up[0].tex);
    gl.uniform2f(p.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(p.u.uTime, st.time);
    gl.uniform2fv(p.u.uSunUV, st.sunUV);
    gl.uniform1f(p.u.uSunVis, st.sunVis);
    gl.uniform1f(p.u.uLevels, 1.6);
    this.params(p, st);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
