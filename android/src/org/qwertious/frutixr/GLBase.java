package org.qwertious.frutixr;

import android.content.res.AssetManager;
import android.opengl.GLES20;
import android.opengl.GLES30;
import android.os.SystemClock;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * GL plumbing shared by both engines: render-target formats, shader linking,
 * the genome uniform packing, the bloom pyramid and the final composite (all
 * using the web engine's shaders, exported into the APK's assets).
 */
abstract class GLBase {
    static final String TAG = "FrutiXr";
    static final int LEVELS = 6;
    private static final int GL_HALF_FLOAT_OES = 0x8D61;

    final AssetManager assets;
    final Schema S;
    final Evolver ev;
    final Cam cam = new Cam();
    final boolean es3Context;
    Config cfg;

    static final class Prog {
        int id;
        int[] map = new int[0], phMap = new int[0];
        float[] g, ph;
        final Map<String, Integer> loc = new HashMap<>();

        int u(String name) {
            Integer l = loc.get(name);
            if (l == null) { l = GLES20.glGetUniformLocation(id, name); loc.put(name, l); }
            return l;
        }
    }

    static final class Target { int tex, fb, w, h; }

    /** A scene image with its blur pyramid, plus the scene state it was rendered with. */
    static final class Post {
        Target scene;
        final Target[] down = new Target[LEVELS];
        final Target[] up = new Target[LEVELS - 1];
        float[] g, ph;
        final float[] camPos = new float[3], camRot = new float[9];
        float sunU, sunV, sunVis, time;
    }

    boolean highp = true, useEs3, hdr;
    /** the composite renders here when the user picked a reduced screen resolution, then is scaled up */
    private Target out;
    private Prog blit;
    int fmtInternal, fmtFormat, fmtType;
    int quadVbo, surfW, surfH;
    float[] mixG, mixPh;
    private Map<String, int[][]> layoutCache;
    private int statFrames;

    GLBase(AssetManager am, Schema s, Evolver e, boolean es3, Config c) {
        assets = am; S = s; ev = e; es3Context = es3; cfg = c;
        mixG = new float[s.nfloat];
        mixPh = new float[s.nph];
    }

    abstract void surfaceCreated();
    abstract void surfaceChanged(int w, int h);
    abstract void drawFrame();
    /** settings changed (called on the GL thread) */
    abstract void configChanged(Config old, Config now);
    /** free every GL object (before switching engines) */
    abstract void release();

    // ---------------------------------------------------------------- context setup
    void initGL() {
        int[] range = new int[2], prec = new int[1];
        GLES20.glGetShaderPrecisionFormat(GLES20.GL_FRAGMENT_SHADER, GLES20.GL_HIGH_FLOAT, range, 0, prec, 0);
        highp = prec[0] > 0;
        String version = String.valueOf(GLES20.glGetString(GLES20.GL_VERSION));
        useEs3 = es3Context && version.contains("OpenGL ES 3");
        pickFormat();
        int[] b = new int[1];
        GLES20.glGenBuffers(1, b, 0);
        quadVbo = b[0];
        FloatBuffer tri = ByteBuffer.allocateDirect(6 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        tri.put(new float[]{-1, -1, 3, -1, -1, 3}).position(0);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, quadVbo);
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, 6 * 4, tri, GLES20.GL_STATIC_DRAW);
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDisable(GLES20.GL_BLEND);
        GLES20.glDisable(GLES20.GL_DITHER);
        layoutCache = null;
        out = null;
        blit = link("attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }",
                "precision mediump float; varying vec2 vUv; uniform sampler2D uTex; void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.); }", null);
        Log.i(TAG, "GL " + version + " es3=" + useEs3 + " hdr=" + hdr + " highp=" + highp + " engine=" + getClass().getSimpleName() + " tier=" + cfg.tier);
    }

    private void pickFormat() {
        String ext = String.valueOf(GLES20.glGetString(GLES20.GL_EXTENSIONS));
        if (useEs3 && (ext.contains("GL_EXT_color_buffer_half_float") || ext.contains("GL_EXT_color_buffer_float"))
                && tryFormat(GLES30.GL_RGBA16F, GLES20.GL_RGBA, GLES30.GL_HALF_FLOAT)) {
            hdr = true; return;
        }
        if (!useEs3 && ext.contains("GL_OES_texture_half_float") && ext.contains("GL_OES_texture_half_float_linear")
                && tryFormat(GLES20.GL_RGBA, GLES20.GL_RGBA, GL_HALF_FLOAT_OES)) {
            hdr = true; return;
        }
        hdr = false;
        fmtInternal = GLES20.GL_RGBA; fmtFormat = GLES20.GL_RGBA; fmtType = GLES20.GL_UNSIGNED_BYTE;
    }

    private boolean tryFormat(int internal, int format, int type) {
        fmtInternal = internal; fmtFormat = format; fmtType = type;
        Target t = makeTarget(4, 4);
        boolean ok = t != null;
        if (t != null) freeTarget(t);
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0);
        while (GLES20.glGetError() != GLES20.GL_NO_ERROR) { /* clear errors from the probe */ }
        return ok;
    }

    Target makeTarget(int w, int h) {
        Target t = new Target();
        t.w = w; t.h = h;
        int[] id = new int[1];
        GLES20.glGenTextures(1, id, 0);
        t.tex = id[0];
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t.tex);
        GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, fmtInternal, w, h, 0, fmtFormat, fmtType, null);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glGenFramebuffers(1, id, 0);
        t.fb = id[0];
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, t.fb);
        GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, t.tex, 0);
        if (GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) != GLES20.GL_FRAMEBUFFER_COMPLETE) {
            freeTarget(t);
            return null;
        }
        GLES20.glClearColor(0, 0, 0, 1);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
        return t;
    }

    void freeTarget(Target t) {
        if (t == null) return;
        GLES20.glDeleteTextures(1, new int[]{t.tex}, 0);
        GLES20.glDeleteFramebuffers(1, new int[]{t.fb}, 0);
    }

    /** scene target plus pyramid; false if the GPU refused an allocation */
    boolean allocPost(Post p, int sw, int sh) {
        freePost(p);
        p.scene = makeTarget(sw, sh);
        if (p.scene == null) return false;
        int w = sw, h = sh;
        for (int i = 0; i < LEVELS; i++) {
            w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
            if ((p.down[i] = makeTarget(w, h)) == null) return false;
        }
        for (int i = 0; i < LEVELS - 1; i++) if ((p.up[i] = makeTarget(p.down[i].w, p.down[i].h)) == null) return false;
        return true;
    }

    void freePost(Post p) {
        freeTarget(p.scene); p.scene = null;
        for (int i = 0; i < LEVELS; i++) { freeTarget(p.down[i]); p.down[i] = null; }
        for (int i = 0; i < LEVELS - 1; i++) { freeTarget(p.up[i]); p.up[i] = null; }
    }

    /** after a context loss the old handles are meaningless: forget them without deleting */
    static void forgetPost(Post p) {
        p.scene = null;
        java.util.Arrays.fill(p.down, null);
        java.util.Arrays.fill(p.up, null);
    }

    // ---------------------------------------------------------------- shaders
    String asset(String path) throws IOException {
        try (InputStream in = assets.open(path)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n;
            while ((n = in.read(b)) > 0) bo.write(b, 0, n);
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    int[][] layout(String name) throws IOException {
        if (layoutCache == null) {
            layoutCache = new HashMap<>();
            for (String line : asset("layouts.txt").split("\n")) {
                if (line.trim().isEmpty()) continue;
                String[] parts = line.split("\\|", -1);
                layoutCache.put(parts[0].trim().split(" ")[0], new int[][]{ints(parts[1]), ints(parts[2])});
            }
        }
        return layoutCache.get(name);
    }

    private static int[] ints(String s) {
        s = s.trim();
        if (s.isEmpty()) return new int[0];
        String[] t = s.split(" ");
        int[] a = new int[t.length];
        for (int i = 0; i < t.length; i++) a[i] = Integer.parseInt(t[i]);
        return a;
    }

    Prog link(String vs, String fs, int[][] layout) {
        if (!highp) {
            // without highp the result has artefacts, but it is better than nothing
            fs = fs.replace("precision highp float;", "precision mediump float;").replace("precision highp int;", "precision mediump int;");
        }
        int v = shader(GLES20.GL_VERTEX_SHADER, vs), f = shader(GLES20.GL_FRAGMENT_SHADER, fs);
        if (v == 0 || f == 0) { if (v != 0) GLES20.glDeleteShader(v); if (f != 0) GLES20.glDeleteShader(f); return null; }
        int id = GLES20.glCreateProgram();
        GLES20.glAttachShader(id, v);
        GLES20.glAttachShader(id, f);
        GLES20.glBindAttribLocation(id, 0, "aPos");
        GLES20.glBindAttribLocation(id, 0, "a0");
        GLES20.glBindAttribLocation(id, 1, "a1");
        GLES20.glBindAttribLocation(id, 2, "a2");
        GLES20.glLinkProgram(id);
        int[] ok = new int[1];
        GLES20.glGetProgramiv(id, GLES20.GL_LINK_STATUS, ok, 0);
        GLES20.glDeleteShader(v);
        GLES20.glDeleteShader(f);
        if (ok[0] == 0) {
            Log.e(TAG, "link failed: " + GLES20.glGetProgramInfoLog(id));
            GLES20.glDeleteProgram(id);
            return null;
        }
        Prog p = new Prog();
        p.id = id;
        if (layout != null) { p.map = layout[0]; p.phMap = layout[1]; }
        p.g = new float[Math.max(4, (p.map.length + 3) / 4 * 4)];
        p.ph = new float[Math.max(4, (p.phMap.length + 3) / 4 * 4)];
        return p;
    }

    private int shader(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        int[] ok = new int[1];
        GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, ok, 0);
        if (ok[0] == 0) {
            Log.e(TAG, "shader compile failed: " + GLES20.glGetShaderInfoLog(s));
            GLES20.glDeleteShader(s);
            return 0;
        }
        return s;
    }

    static void deleteProg(Prog p) { if (p != null) GLES20.glDeleteProgram(p.id); }

    // ---------------------------------------------------------------- drawing helpers
    void bindQuad() {
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, quadVbo);
        GLES20.glDisableVertexAttribArray(1);
        GLES20.glDisableVertexAttribArray(2);
        GLES20.glEnableVertexAttribArray(0);
        GLES20.glVertexAttribPointer(0, 2, GLES20.GL_FLOAT, false, 0, 0);
    }

    void params(Prog p, float[] g, float[] ph) {
        for (int i = 0; i < p.map.length; i++) p.g[i] = g[p.map[i]];
        for (int i = 0; i < p.phMap.length; i++) p.ph[i] = ph[p.phMap[i]];
        int lg = p.u("G"), lp = p.u("uPh");
        if (lg >= 0) GLES20.glUniform4fv(lg, p.g.length / 4, p.g, 0);
        if (lp >= 0) GLES20.glUniform4fv(lp, p.ph.length / 4, p.ph, 0);
    }

    void tex(Prog p, String name, int unit, Target t) {
        int l = p.u(name);
        if (l < 0) return;
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit);
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t.tex);
        GLES20.glUniform1i(l, unit);
    }

    /** home-screen scroll position 0..1 (set by MainRenderer), eased into a small camera turn */
    volatile float parallaxTarget = .5f;
    private float parallax = .5f;

    /** Freeze the evolver's current state (with the user's look settings) into a Post. */
    void snapshot(Post s, float time) {
        s.g = ev.cur.clone();
        cfg.applyLook(S, s.g);
        s.ph = ev.phases.clone();
        s.time = time;
        parallax += (parallaxTarget - parallax) * .08f;
        cam.update(S, s.g, s.ph, time, surfW / (float) Math.max(1, surfH), (parallax - .5f) * .5f, ev.ch.cameraMotion);
        System.arraycopy(cam.pos, 0, s.camPos, 0, 3);
        System.arraycopy(cam.rot, 0, s.camRot, 0, 9);
        s.sunU = cam.sunU; s.sunV = cam.sunV; s.sunVis = cam.sunVis;
    }

    /** Blur pyramid: level 1 unthresholded, bloom thresholded from level 2. */
    void pyramid(Post s, Prog down, Prog up) {
        Target src = s.scene;
        GLES20.glUseProgram(down.id);
        bindQuad();
        float thr = s.g[S.off("bloomThr")];
        for (int i = 0; i < LEVELS; i++) {
            Target d = s.down[i];
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, d.fb);
            GLES20.glViewport(0, 0, d.w, d.h);
            tex(down, "uTex", 0, src);
            GLES20.glUniform1f(down.u("uThr"), i == 1 ? thr : -1);
            GLES20.glUniform2f(down.u("uTexel"), 1f / src.w, 1f / src.h);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3);
            src = d;
        }
        GLES20.glUseProgram(up.id);
        bindQuad();
        for (int i = LEVELS - 2; i >= 0; i--) {
            Target d = s.up[i];
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, d.fb);
            GLES20.glViewport(0, 0, d.w, d.h);
            tex(up, "uTex", 0, src);
            tex(up, "uAdd", 1, s.down[i]);
            GLES20.glUniform1f(up.u("uAddW"), i == 0 ? 0 : 1);
            GLES20.glUniform2f(up.u("uTexel"), .5f / src.w, .5f / src.h);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3);
            src = d;
        }
    }

    /** free the GL objects GLBase owns (engines call this from release()) */
    void releaseBase() {
        freeTarget(out); out = null;
        deleteProg(blit); blit = null;
        GLES20.glDeleteBuffers(1, new int[]{quadVbo}, 0);
    }

    /**
     * Final image to the screen: crossfade between a and b (u), bloom, overlays,
     * grading. Wallpapers may not shrink their surface (setFixedSize throws for a
     * real wallpaper), so a reduced resolution is done here: composite into a
     * smaller image, then scale it up to the screen.
     */
    void composite(Prog comp, Post a, Post b, float u) {
        int ow = surfW, oh = surfH;
        boolean scaled = cfg.resolution < .99f && blit != null;
        if (scaled) {
            ow = Math.max(64, Math.round(surfW * cfg.resolution));
            oh = Math.max(64, Math.round(surfH * cfg.resolution));
            if (out == null || out.w != ow || out.h != oh) {
                freeTarget(out);
                out = makeTarget(ow, oh);
                if (out == null) scaled = false;
            }
        }
        if (!scaled) { ow = surfW; oh = surfH; }
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, scaled ? out.fb : 0);
        GLES20.glViewport(0, 0, ow, oh);
        GLES20.glUseProgram(comp.id);
        bindQuad();
        tex(comp, "uScene", 0, a.scene);
        tex(comp, "uD1", 1, a.down[0]);
        tex(comp, "uD2", 2, a.down[1]);
        tex(comp, "uBloom", 3, a.up[0]);
        tex(comp, "uSceneB", 4, b.scene);
        tex(comp, "uD1B", 5, b.down[0]);
        tex(comp, "uD2B", 6, b.down[1]);
        tex(comp, "uBloomB", 7, b.up[0]);
        GLES20.glUniform1f(comp.u("uMix"), u);
        GLES20.glUniform2f(comp.u("uRes"), ow, oh);
        GLES20.glUniform1f(comp.u("uTime"), a.time + (b.time - a.time) * u);
        GLES20.glUniform2f(comp.u("uSunUV"), a.sunU + (b.sunU - a.sunU) * u, a.sunV + (b.sunV - a.sunV) * u);
        GLES20.glUniform1f(comp.u("uSunVis"), a.sunVis + (b.sunVis - a.sunVis) * u);
        GLES20.glUniform1f(comp.u("uLevels"), 1.6f);
        for (int i = 0; i < mixG.length; i++) mixG[i] = a.g[i] + (b.g[i] - a.g[i]) * u;
        for (int i = 0; i < mixPh.length; i++) mixPh[i] = a.ph[i] + (b.ph[i] - a.ph[i]) * u;
        params(comp, mixG, mixPh);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3);
        if (scaled) {
            GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0);
            GLES20.glViewport(0, 0, surfW, surfH);
            GLES20.glUseProgram(blit.id);
            bindQuad();
            tex(blit, "uTex", 0, out);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3);
        }
    }

    void clearScreen() {
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0);
        GLES20.glViewport(0, 0, surfW, surfH);
        GLES20.glClearColor(.02f, .05f, .1f, 1);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
    }

    /** Wait for the GPU so the work time is real, then sleep out the rest of the frame. Returns the work in ns. */
    long pace(long start) {
        GLES20.glFinish();
        long work = SystemClock.elapsedRealtimeNanos() - start;
        long frame = 1_000_000_000L / Math.max(5, cfg.fps);
        if (++statFrames % 120 == 0) Log.d(TAG, getClass().getSimpleName() + " frame " + work / 1_000_000L + " ms, surface " + surfW + "x" + surfH + statusExtra());
        long rest = (frame - work) / 1_000_000L;
        if (rest > 1) {
            try { Thread.sleep(rest); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }
        return work;
    }

    String statusExtra() { return ""; }
}
