package org.qwertious.frutixr;

import android.content.res.AssetManager;
import android.opengl.GLES20;
import android.os.SystemClock;
import android.util.Log;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.ShortBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * The smooth engine (port of the web page's raster.js): every scene element is
 * real geometry, positioned in the vertex shader from the genome and shaded with
 * the same material code as the raymarcher, so it renders a full new frame every
 * frame even on weak GPUs. Shaders are small and compile in milliseconds.
 */
final class RasterRenderer extends GLBase {
    private static final String[] PROGRAMS = {"sky", "water", "terrain", "ribbon", "ribglow", "sphere", "shard", "shardglow",
        "tunnel", "rail", "arch", "archglow", "block", "helix", "trunk", "foliage"};
    private static final int TIERS = 24, HLX_K = 400, BLK_X = 18, BLK_Y = 6, BLK_Z = 25;

    private static final class Mesh {
        int vbo, ibo, count, comps, rings;
        float[] ranks;
    }

    private final Map<String, Prog> R = new HashMap<>();
    private final Map<String, Mesh> M = new HashMap<>();
    private Prog down, up, comp;
    private final Post post = new Post();
    private int depthRb;
    private boolean ready, targetsOk, potato;
    private float simTime, dynScale = 1;
    private long lastStart, lastScaleChange;
    private float avgWork = 0;
    private int slowFrames, fastFrames;

    RasterRenderer(AssetManager am, Schema s, Evolver e, boolean es3, Config c) { super(am, s, e, es3, c); }

    // ---------------------------------------------------------------- lifecycle
    @Override
    void surfaceCreated() {
        ready = targetsOk = false;
        forgetPost(post);
        R.clear(); M.clear();
        down = up = comp = null;
        depthRb = 0;
        initGL();
        buildPrograms();
    }

    @Override
    void surfaceChanged(int w, int h) {
        surfW = w; surfH = h;
        allocTargets();
    }

    @Override
    void configChanged(Config old, Config now) {
        if (!now.tier.equals(old.tier)) buildPrograms();
        if (now.detail != old.detail) { dynScale = 1; allocTargets(); }
    }

    @Override
    void release() {
        freePost(post);
        if (depthRb != 0) GLES20.glDeleteRenderbuffers(1, new int[]{depthRb}, 0);
        for (Prog p : R.values()) deleteProg(p);
        for (Prog p : new Prog[]{down, up, comp}) deleteProg(p);
        freeMeshes();
        releaseBase();
    }

    private void allocTargets() {
        targetsOk = false;
        if (surfW <= 0 || surfH <= 0) return;
        float sc = cfg.detail * dynScale;
        int sw = Math.max(64, Math.round(surfW * sc)), sh = Math.max(36, Math.round(surfH * sc));
        if (!allocPost(post, sw, sh)) { Log.e(TAG, "could not allocate render targets"); return; }
        int[] id = new int[1];
        if (depthRb != 0) GLES20.glDeleteRenderbuffers(1, new int[]{depthRb}, 0);
        GLES20.glGenRenderbuffers(1, id, 0);
        depthRb = id[0];
        GLES20.glBindRenderbuffer(GLES20.GL_RENDERBUFFER, depthRb);
        GLES20.glRenderbufferStorage(GLES20.GL_RENDERBUFFER, GLES20.GL_DEPTH_COMPONENT16, sw, sh);
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, post.scene.fb);
        GLES20.glFramebufferRenderbuffer(GLES20.GL_FRAMEBUFFER, GLES20.GL_DEPTH_ATTACHMENT, GLES20.GL_RENDERBUFFER, depthRb);
        targetsOk = GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) == GLES20.GL_FRAMEBUFFER_COMPLETE;
        if (!targetsOk) Log.e(TAG, "scene target with depth is incomplete");
    }

    private void buildPrograms() {
        for (Prog p : R.values()) deleteProg(p);
        for (Prog p : new Prog[]{down, up, comp}) deleteProg(p);
        R.clear();
        down = up = comp = null;
        ready = false;
        potato = cfg.tier.equals("potato");
        String enc = hdr ? "hdr" : "lin", tier = potato ? "potato" : "lite";
        try {
            String vert = asset("shaders/vert_es2.glsl");
            down = link(vert, asset("shaders/down_es2_" + enc + "_r.glsl"), null);
            up = link(vert, asset("shaders/up_es2_" + enc + "_r.glsl"), null);
            comp = link(vert, asset("shaders/comp_es2_" + enc + "_r.glsl"), layout("comp_es2_" + enc + "_r"));
            boolean ok = down != null && up != null && comp != null;
            for (String name : PROGRAMS) {
                String key = "r_" + name + "_" + enc + "_" + tier;
                Prog p = link(asset("shaders/" + key + ".vert"), asset("shaders/" + key + ".frag"), layout(key));
                if (p == null) { Log.e(TAG, "raster program failed: " + name); ok = false; continue; }
                R.put(name, p);
            }
            freeMeshes();
            buildMeshes(potato);
            ready = ok;
        } catch (IOException e) {
            Log.e(TAG, "asset load failed", e);
        }
    }

    // ---------------------------------------------------------------- meshes
    /** Interleaved vec4 attributes (4, 8 or 12 floats per vertex) with 16-bit indices. */
    private static final class Builder {
        final int comps;
        float[] v = new float[4096];
        short[] i = new short[4096];
        int nv, ni, n;

        Builder(int comps) { this.comps = comps; }

        int vert(float... a) {
            if (nv + comps > v.length) v = Arrays.copyOf(v, v.length * 2);
            for (int k = 0; k < comps; k++) v[nv++] = k < a.length ? a[k] : 0;
            return n++;
        }

        void tri(int a, int b, int c) {
            if (ni + 3 > i.length) i = Arrays.copyOf(i, i.length * 2);
            i[ni++] = (short) a; i[ni++] = (short) b; i[ni++] = (short) c;
        }

        interface GridFn { float[] at(float u, float v); }

        void grid(int U, int V, GridFn f) {
            int base = n;
            for (int j = 0; j <= V; j++) for (int k = 0; k <= U; k++) vert(f.at(k / (float) U, j / (float) V));
            for (int j = 0; j < V; j++) for (int k = 0; k < U; k++) {
                int a = base + j * (U + 1) + k, b = a + 1, c = a + U + 1, d = c + 1;
                tri(a, b, c); tri(b, d, c);
            }
        }

        interface BoxFn { float[] at(float[] corner, float[] normal); }

        void box(BoxFn f) {
            int[][] faces = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
            int[][] quad = {{-1, -1}, {1, -1}, {1, 1}, {-1, 1}};
            for (int[] nn : faces) {
                int ax = nn[0] != 0 ? 0 : nn[1] != 0 ? 1 : 2, u = (ax + 1) % 3, w = (ax + 2) % 3;
                int base = n;
                for (int[] q : quad) {
                    float[] c = new float[3];
                    c[ax] = nn[ax]; c[u] = q[0]; c[w] = q[1];
                    vert(f.at(c, new float[]{nn[0], nn[1], nn[2]}));
                }
                tri(base, base + 1, base + 2); tri(base, base + 2, base + 3);
            }
        }

        void quad(final float z) { grid(1, 1, (u, v2) -> new float[]{u * 2 - 1, v2 * 2 - 1, z, 0}); }
    }

    private void upload(String name, Builder b) {
        if (b.n > 65535) throw new IllegalStateException("mesh " + name + " too large");
        Mesh m = new Mesh();
        int[] id = new int[2];
        GLES20.glGenBuffers(2, id, 0);
        m.vbo = id[0]; m.ibo = id[1];
        FloatBuffer fb = ByteBuffer.allocateDirect(b.nv * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        fb.put(b.v, 0, b.nv).position(0);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, m.vbo);
        GLES20.glBufferData(GLES20.GL_ARRAY_BUFFER, b.nv * 4, fb, GLES20.GL_STATIC_DRAW);
        ShortBuffer sb = ByteBuffer.allocateDirect(b.ni * 2).order(ByteOrder.nativeOrder()).asShortBuffer();
        sb.put(b.i, 0, b.ni).position(0);
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, m.ibo);
        GLES20.glBufferData(GLES20.GL_ELEMENT_ARRAY_BUFFER, b.ni * 2, sb, GLES20.GL_STATIC_DRAW);
        m.count = b.ni; m.comps = b.comps;
        M.put(name, m);
    }

    private void freeMeshes() {
        for (Mesh m : M.values()) GLES20.glDeleteBuffers(2, new int[]{m.vbo, m.ibo}, 0);
        M.clear();
    }

    private void buildMeshes(boolean potato) {
        Builder b = new Builder(4); b.vert(-1, -1); b.vert(3, -1); b.vert(-1, 3); b.tri(0, 1, 2); upload("tri", b);
        b = new Builder(4); b.quad(0); upload("quad", b);
        final int TN = potato ? 96 : 160;
        b = new Builder(4); b.grid(TN, TN, (u, v) -> new float[]{u, v, 0, 0}); upload("terrain", b);

        final int RU = potato ? 160 : 320, RV = potato ? 2 : 6;
        b = new Builder(4);
        for (int r = 0; r < 6; r++) { final float rr = r; b.grid(RU, RV, (u, v) -> new float[]{u, v, rr, 0}); }
        upload("ribbon", b);
        b = new Builder(4);
        for (int r = 0; r < 6; r++) for (int e = -1; e <= 1; e++) { final float rr = r, ee = e; b.grid(RU, 1, (u, v) -> new float[]{u, v, rr, ee}); }
        upload("ribglow", b);

        b = new Builder(4); for (int i = 0; i < 12; i++) b.quad(i); upload("sphere", b);
        b = new Builder(8);
        for (int s = 0; s < 24; s++) for (int sx = -1; sx <= 1; sx += 2) for (int sy = -1; sy <= 1; sy += 2) for (int sz = -1; sz <= 1; sz += 2) {
            int a = b.vert(sx, 0, 0, s, sx, sy, sz, 0), c = b.vert(0, sy, 0, s, sx, sy, sz, 0), d = b.vert(0, 0, sz, s, sx, sy, sz, 0);
            b.tri(a, c, d);
        }
        upload("shard", b);
        b = new Builder(4); for (int i = 0; i < 24; i++) b.quad(i); upload("shardglow", b);

        final int KR = potato ? 24 : 48, RA = potato ? 32 : 48, RC = potato ? 6 : 8;
        b = new Builder(4);
        for (int k = 0; k < KR; k++) { final float kk = k; b.grid(RA, RC, (u, v) -> new float[]{u, v, kk, 0}); }
        upload("tunnel", b);
        M.get("tunnel").rings = KR;
        b = new Builder(4);
        for (int j = 0; j < 12; j++) { final float jj = j; b.grid(potato ? 48 : 96, 6, (u, v) -> new float[]{u, v, jj, 0}); }
        upload("rail", b);

        final int AZ = potato ? 64 : 128, AR = potato ? 4 : 8;
        b = new Builder(4);
        for (int k = 0; k < TIERS; k++) { final float kk = k; b.grid(AZ, AR, (u, v) -> new float[]{u, v, kk, 0}); }
        for (int k = 1; k < TIERS; k++) for (int part = 1; part <= 3; part++) { final float kk = k, pp = part; b.grid(AZ, 1, (u, v) -> new float[]{u, v, kk, pp}); }
        b.grid(AZ, 4, (u, v) -> new float[]{u, v, 0, 4});
        upload("arch", b);
        b = new Builder(4);
        for (int k = 1; k < TIERS; k++) { final float kk = k; b.grid(AZ, 1, (u, v) -> new float[]{u, v, kk, 0}); }
        upload("archglow", b);

        // block pool sorted by a random rank: drawing the first N boxes shows those below the density
        Random rnd = new Random(12345);
        List<float[]> cells = new ArrayList<>();
        for (int x = -BLK_X / 2; x < BLK_X / 2; x++) for (int y = -BLK_Y / 2; y < BLK_Y / 2; y++) for (int z = 0; z < BLK_Z; z++)
            cells.add(new float[]{x, y, z, rnd.nextFloat(), rnd.nextFloat(), rnd.nextFloat()});
        Collections.sort(cells, new Comparator<float[]>() {
            @Override public int compare(float[] a, float[] c) { return Float.compare(a[3], c[3]); }
        });
        b = new Builder(12);
        float[] ranks = new float[cells.size()];
        for (int i = 0; i < cells.size(); i++) {
            final float[] c = cells.get(i);
            ranks[i] = c[3];
            b.box((cn, nn) -> new float[]{cn[0], cn[1], cn[2], c[3], nn[0], nn[1], nn[2], c[4], c[0], c[1], c[2], c[5]});
        }
        upload("block", b);
        M.get("block").ranks = ranks;

        b = new Builder(8);
        for (int k = 0; k < HLX_K; k++) { final float kk = k; b.box((cn, nn) -> new float[]{cn[0], cn[1], cn[2], kk, nn[0], nn[1], nn[2], 0}); }
        upload("helix", b);
        b = new Builder(4); b.grid(16, 8, (u, v) -> new float[]{u, v, 0, 0}); upload("trunk", b);
        b = new Builder(4); for (int i = 0; i < 7; i++) b.quad(i); upload("foliage", b);
    }

    // ---------------------------------------------------------------- frame
    @Override
    void drawFrame() {
        long start = SystemClock.elapsedRealtimeNanos();
        float dt = lastStart == 0 ? 0 : Math.min((start - lastStart) / 1e9f, .1f);
        lastStart = start;
        if (!ready || !targetsOk) { clearScreen(); pace(start); return; }

        ev.update(dt);
        simTime += dt * ev.ch.animSpeed;
        snapshot(post, simTime);
        renderScene(post);
        pyramid(post, down, up);
        composite(comp, post, post, 0);
        long work = pace(start);
        adaptDetail(work, start);
    }

    /** Lower the render resolution when frames run over budget, raise it again when there is room. */
    private void adaptDetail(long work, long now) {
        float budget = 1e9f / Math.max(5, cfg.fps);
        avgWork += (work - avgWork) * .1f;
        if (avgWork > budget * 1.1f) { slowFrames++; fastFrames = 0; }
        else if (avgWork < budget * .55f) { fastFrames++; slowFrames = 0; }
        else { slowFrames = fastFrames = 0; }
        if (now - lastScaleChange < 2_000_000_000L) return;
        float next = dynScale;
        if (slowFrames > 20) next = Math.max(.35f, dynScale * .85f);
        else if (fastFrames > 90 && dynScale < 1) next = Math.min(1, dynScale * 1.1f);
        if (next != dynScale) {
            dynScale = next;
            lastScaleChange = now;
            slowFrames = fastFrames = 0;
            allocTargets();
        }
    }

    @Override
    String statusExtra() { return ", scale " + cfg.detail * dynScale; }

    // ---------------------------------------------------------------- scene
    private float mirror, pass;
    private final float[] proj = new float[4];
    private Post cur;

    private float v(String n) { return cur.g[S.off(n)]; }
    private boolean on(String n) { return v(n) > .01f; }

    /** camera position in an element's frame: minus offset, rotated by yaw, minus travel */
    private float[] local(float ox, float oy, float oz, float yaw, float trav) {
        float x = cur.camPos[0] - ox, y = cur.camPos[1] - oy, z = cur.camPos[2] - oz;
        float c = (float) Math.cos(yaw), s = (float) Math.sin(yaw);
        return new float[]{c * x - s * z, y, s * x + c * z - trav};
    }

    private interface Extra { void set(Prog p); }

    private Prog use(String name, Extra extra) {
        Prog p = R.get(name);
        GLES20.glUseProgram(p.id);
        GLES20.glUniform3fv(p.u("uCamPos"), 1, cur.camPos, 0);
        GLES20.glUniformMatrix3fv(p.u("uCamRot"), 1, false, cur.camRot, 0);
        GLES20.glUniform4fv(p.u("uProj"), 1, proj, 0);
        GLES20.glUniform2f(p.u("uRes"), cur.scene.w, cur.scene.h);
        GLES20.glUniform1f(p.u("uMirror"), mirror);
        GLES20.glUniform1f(p.u("uPass"), pass);
        GLES20.glUniform1f(p.u("uTime"), cur.time);
        params(p, cur.g, cur.ph);
        if (extra != null) extra.set(p);
        return p;
    }

    private void draw(String prog, String mesh, Extra extra, int count) {
        use(prog, extra);
        Mesh m = M.get(mesh);
        GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, m.vbo);
        GLES20.glBindBuffer(GLES20.GL_ELEMENT_ARRAY_BUFFER, m.ibo);
        int stride = m.comps * 4;
        for (int i = 0; i < 3; i++) {
            if (i * 4 < m.comps) { GLES20.glEnableVertexAttribArray(i); GLES20.glVertexAttribPointer(i, 4, GLES20.GL_FLOAT, false, stride, i * 16); }
            else GLES20.glDisableVertexAttribArray(i);
        }
        GLES20.glDrawElements(GLES20.GL_TRIANGLES, count >= 0 ? count : m.count, GLES20.GL_UNSIGNED_SHORT, 0);
    }

    private void draw(String prog, String mesh, Extra extra) { draw(prog, mesh, extra, -1); }

    private void renderScene(Post s) {
        cur = s;
        Target t = s.scene;
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, t.fb);
        GLES20.glViewport(0, 0, t.w, t.h);
        GLES20.glDepthMask(true);
        GLES20.glClearDepthf(1);
        GLES20.glClear(GLES20.GL_DEPTH_BUFFER_BIT);

        float asp = t.w / (float) t.h, fov = Math.min(1, asp * 1.2f), zoom = v("camZoom");
        float near = .1f, far = 700;
        proj[0] = zoom * 2 * fov / asp; proj[1] = zoom * 2 * fov;
        proj[2] = (far + near) / (far - near); proj[3] = -2 * far * near / (far - near);
        float travel = s.ph[S.idx.get("camTravel").phase];

        final float[] tunQ = local(v("tunX"), v("tunY"), 0, v("tunYaw"), travel);
        final float sp = v("tunSpacing");
        final int rings = M.get("tunnel").rings;
        final Extra tunnelExtra = p -> GLES20.glUniform1f(p.u("uCi0"), (float) Math.floor((tunQ[2] + 4) / sp) - rings + 1);
        final Extra railExtra = p -> GLES20.glUniform2f(p.u("uZ"), tunQ[2] - 90, 94);
        final float[] arcQ = local(0, 0, 0, v("arcYaw"), travel * v("arcTrav"));
        final float[] blkQ = local(0, v("blkY"), 0, v("blkYaw"), travel);
        final Extra blockExtra = p -> GLES20.glUniform3fv(p.u("uCamQ"), 1, blkQ, 0);
        float[] ranks = M.get("block").ranks;
        float dens = v("blkDensity");
        int nb = 0, hi = ranks.length;
        while (nb < hi) { int mid = (nb + hi) >>> 1; if (ranks[mid] <= dens) nb = mid + 1; else hi = mid; }
        final int boxes = nb;
        final float[] sides = v("arcOpen") < .5f ? new float[]{1, -1} : new float[]{1};

        // 1. sky
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDisable(GLES20.GL_BLEND);
        mirror = 0; pass = 0;
        draw("sky", "tri", null);
        // 2. water, writing depth so everything under it is hidden
        GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthFunc(GLES20.GL_LEQUAL);
        if (on("flrW")) draw("water", "quad", null);
        // 3. reflections in the water, weighted by its Fresnel term
        if (on("flrW") && !potato && cfg.reflections) {
            mirror = 1;
            GLES20.glDisable(GLES20.GL_DEPTH_TEST);
            GLES20.glDepthMask(false);
            GLES20.glEnable(GLES20.GL_BLEND);
            GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA);
            opaque(false, sides, arcQ);
            glassPasses(tunnelExtra, railExtra, blockExtra, boxes);
            glows(sides, arcQ);
            mirror = 0;
            GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        }
        // 4. opaque geometry
        GLES20.glDisable(GLES20.GL_BLEND);
        GLES20.glDepthMask(true);
        opaque(true, sides, arcQ);
        // 5. glass: multiply by transmission, then add the surface light
        GLES20.glDepthMask(false);
        GLES20.glEnable(GLES20.GL_BLEND);
        glassPasses(tunnelExtra, railExtra, blockExtra, boxes);
        // 6. glow halos
        glows(sides, arcQ);
        GLES20.glDisable(GLES20.GL_BLEND);
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(true);
    }

    private Extra archExtra(final float side, final float[] arcQ) {
        return p -> { GLES20.glUniform1f(p.u("uSide"), side); GLES20.glUniform2f(p.u("uZ"), arcQ[2] - 80, 110); };
    }

    private void opaque(boolean withTerrain, float[] sides, float[] arcQ) {
        if (withTerrain && on("terW")) draw("terrain", "terrain", p -> GLES20.glUniform1f(p.u("uSpan"), 90));
        if (on("arcW")) for (float sd : sides) draw("arch", "arch", archExtra(sd, arcQ));
        if (on("treeW")) { draw("trunk", "trunk", null); draw("foliage", "foliage", null); }
    }

    private void glassFamilies(Extra tunnelExtra, Extra railExtra, Extra blockExtra, int boxes) {
        if (on("tunW")) { draw("tunnel", "tunnel", tunnelExtra); if (on("tunRails")) draw("rail", "rail", railExtra); }
        if (on("hlxW")) draw("helix", "helix", null);
        if (on("blkW") && boxes > 0) draw("block", "block", blockExtra, boxes * 36);
        if (on("ribW")) draw("ribbon", "ribbon", null);
        if (on("shdW")) draw("shard", "shard", null);
        if (on("sphW")) draw("sphere", "sphere", null);
    }

    private void glassPasses(Extra tunnelExtra, Extra railExtra, Extra blockExtra, int boxes) {
        GLES20.glBlendFunc(GLES20.GL_ZERO, GLES20.GL_SRC_COLOR);
        pass = 0;
        glassFamilies(tunnelExtra, railExtra, blockExtra, boxes);
        GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE);
        pass = 1;
        glassFamilies(tunnelExtra, railExtra, blockExtra, boxes);
    }

    private void glows(float[] sides, float[] arcQ) {
        GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE);
        if (on("ribW") && on("ribGlow")) draw("ribglow", "ribglow", null);
        if (on("shdW") && on("shdGlow")) draw("shardglow", "shardglow", null);
        if (on("arcW") && on("arcLight")) for (float sd : sides) draw("archglow", "archglow", archExtra(sd, arcQ));
    }
}
