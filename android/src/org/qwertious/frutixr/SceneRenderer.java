package org.qwertious.frutixr;

import android.content.res.AssetManager;
import android.opengl.GLES20;
import android.os.SystemClock;
import android.util.Log;

import java.io.IOException;

/**
 * The ray-traced engine. Raymarching is too slow to run every frame on most
 * phones, so it is streamed: each scene keyframe is traced a band of rows per
 * display frame while the display crossfades between the two newest finished
 * keyframes. The band height adapts every frame so each frame fits its time
 * budget: a slow GPU gets slower dissolves, never a long frame.
 */
final class SceneRenderer extends GLBase {
    private Prog scene, down, up, comp;
    private boolean ready, targetsOk;
    private final Post[] slots = {new Post(), new Post(), new Post()};

    private int k0 = -1, k1 = -1, building = 0, rowDone = 0, frameNo = 0, warm = 0;
    /** scene rows traced per display frame; adapted every frame to the measured cost */
    private float rowsPerFrame = 8;
    private float simTime = 0, avgPeriod = 1 / 30f;
    private boolean firstKey = true;
    private long lastStart = 0;

    SceneRenderer(AssetManager am, Schema s, Evolver e, boolean es3, Config c) { super(am, s, e, es3, c); }

    @Override
    void surfaceCreated() {
        ready = targetsOk = false;
        warm = 0;
        for (Post p : slots) forgetPost(p);
        scene = down = up = comp = null;
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
        boolean tier = !now.tier.equals(old.tier);
        if (tier) buildPrograms();
        if (tier || now.detail != old.detail) allocTargets();
    }

    @Override
    void release() {
        for (Post p : slots) freePost(p);
        for (Prog p : new Prog[]{scene, down, up, comp}) deleteProg(p);
        scene = down = up = comp = null;
        releaseBase();
    }

    private void allocTargets() {
        targetsOk = false;
        if (surfW <= 0 || surfH <= 0) return;
        int sw = Math.max(64, Math.round(surfW * cfg.detail)), sh = Math.max(36, Math.round(surfH * cfg.detail));
        for (Post p : slots) if (!allocPost(p, sw, sh)) { Log.e(TAG, "could not allocate render targets"); return; }
        targetsOk = true;
        resetKeys();
    }

    private void resetKeys() { k0 = k1 = -1; building = 0; rowDone = 0; }

    private void buildPrograms() {
        for (Prog p : new Prog[]{scene, down, up, comp}) deleteProg(p);
        scene = down = up = comp = null;
        ready = false;
        String tier = cfg.tier.equals("potato") || cfg.tier.equals("full") ? cfg.tier : "lite";
        // GLSL ES 3.00 first when the context allows it, then 1.00 (which ES3 also runs)
        for (String es : useEs3 ? new String[]{"es3", "es2"} : new String[]{"es2"}) {
            try {
                String tag = es + "_" + (hdr ? "hdr" : "ldr");
                String vert = asset("shaders/vert_" + es + ".glsl");
                String compTier = tier.equals("full") ? "full" : "lite";
                Prog s = link(vert, asset("shaders/scene_" + tag + "_" + tier + ".glsl"), layout("scene_" + tag + "_" + tier));
                Prog d = link(vert, asset("shaders/down_" + tag + ".glsl"), null);
                Prog u = link(vert, asset("shaders/up_" + tag + ".glsl"), null);
                Prog c = link(vert, asset("shaders/comp_" + tag + "_" + compTier + ".glsl"), layout("comp_" + tag + "_" + compTier));
                if (s != null && d != null && u != null && c != null) {
                    scene = s; down = d; up = u; comp = c;
                    ready = true;
                    resetKeys();
                    return;
                }
                for (Prog p : new Prog[]{s, d, u, c}) deleteProg(p);
            } catch (IOException e) {
                Log.e(TAG, "asset load failed", e);
            }
        }
        Log.e(TAG, "no shader variant compiled; the wallpaper will stay blank");
    }

    @Override
    void drawFrame() {
        long start = SystemClock.elapsedRealtimeNanos();
        if (lastStart != 0) avgPeriod += (Math.min((start - lastStart) / 1e9f, .5f) - avgPeriod) * .1f;
        lastStart = start;

        // the first frames only clear, so the wallpaper shows up instantly
        if (!ready || !targetsOk || warm < 2) {
            warm++;
            clearScreen();
            pace(start);
            return;
        }

        Post b = slots[building];
        int h = b.scene.h;
        if (rowDone == 0) beginKeyframe(h);
        int rows = Math.max(1, Math.min(h - rowDone, Math.round(rowsPerFrame)));
        traceRows(b, rowDone, rows);
        rowDone += rows;
        boolean finished = rowDone >= h;
        if (finished) pyramid(b, down, up);

        if (k0 < 0) clearScreen();
        else if (k1 < 0) composite(comp, slots[k0], slots[k0], 0);
        else composite(comp, slots[k0], slots[k1], Math.min(rowDone / (float) h, 1));

        if (finished) {
            if (k0 < 0) k0 = building;
            else if (k1 < 0) k1 = building;
            else { k0 = k1; k1 = building; }
            for (int i = 0; i < 3; i++) if (i != k0 && i != k1) { building = i; break; }
            rowDone = 0;
        }
        long work = pace(start);
        float budget = 1e9f / Math.max(5, cfg.fps) * .75f;
        rowsPerFrame = Math.max(1, Math.min(4096, rowsPerFrame * Math.max(.5f, Math.min(1.25f, budget / Math.max(work, 1_000_000L)))));
    }

    @Override
    String statusExtra() { return ", rows/frame " + rowsPerFrame; }

    /** Freeze the scene state for the keyframe about to be traced. */
    private void beginKeyframe(int h) {
        float target = 1f / Math.max(5, cfg.fps);
        // scene time this keyframe covers = how long tracing it is expected to take
        float dt = firstKey ? 0 : Math.min(h / Math.max(rowsPerFrame, 1) * Math.max(avgPeriod, target), 2.5f);
        firstKey = false;
        ev.update(dt);
        simTime += dt * ev.ch.animSpeed;
        snapshot(slots[building], simTime);
    }

    private void traceRows(Post s, int y0, int rows) {
        Target t = s.scene;
        GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, t.fb);
        GLES20.glViewport(0, 0, t.w, t.h);
        GLES20.glEnable(GLES20.GL_SCISSOR_TEST);
        GLES20.glScissor(0, y0, t.w, rows);
        GLES20.glUseProgram(scene.id);
        bindQuad();
        GLES20.glUniform2f(scene.u("uRes"), t.w, t.h);
        GLES20.glUniform1f(scene.u("uTime"), s.time);
        GLES20.glUniform1i(scene.u("uFrame"), ++frameNo);
        GLES20.glUniform1f(scene.u("uPhase"), -1);
        GLES20.glUniform3fv(scene.u("uCamPos"), 1, s.camPos, 0);
        GLES20.glUniformMatrix3fv(scene.u("uCamRot"), 1, false, s.camRot, 0);
        params(scene, s.g, s.ph);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLES, 0, 3);
        GLES20.glDisable(GLES20.GL_SCISSOR_TEST);
    }
}
