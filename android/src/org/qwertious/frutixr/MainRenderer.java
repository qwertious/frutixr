package org.qwertious.frutixr;

import android.content.Context;
import android.opengl.GLSurfaceView;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * The GLSurfaceView renderer: owns the evolving scene and hands each frame to
 * the engine the user picked (smooth or ray traced). Switching engine or pack
 * happens on the GL thread; switching engine keeps the scene going.
 */
final class MainRenderer implements GLSurfaceView.Renderer {
    private final Context ctx;
    private final Schema S;
    private final boolean es3;
    private Config cfg;
    private Pack pack;
    private Evolver ev;
    private GLBase engine;
    private boolean created;
    private int w, h;
    private volatile Config pending;
    private volatile boolean skip, reloadFavorites;
    private volatile float parallax = .5f;
    private Evolver.Entry lastLogged;

    MainRenderer(Context c, Schema s, Pack p, boolean es3, Config conf) {
        ctx = c; S = s; this.es3 = es3; cfg = conf; pack = p;
        ev = newEvolver();
        engine = make(conf);
    }

    private Evolver newEvolver() {
        Evolver e = new Evolver(S, pack, System.currentTimeMillis(), cfg.choices);
        e.favorites = Favorites.load(ctx, pack.key, S.nfloat);
        return e;
    }

    private GLBase make(Config c) {
        return c.engine.equals("ray") ? new SceneRenderer(ctx.getAssets(), S, ev, es3, c) : new RasterRenderer(ctx.getAssets(), S, ev, es3, c);
    }

    /** Called from the main thread; picked up at the start of the next frame. */
    void setConfig(Config c) { pending = c; }
    void skipScene() { skip = true; }
    void favoritesChanged() { reloadFavorites = true; }
    void setParallax(float x) { parallax = x; }

    @Override
    public void onSurfaceCreated(GL10 unused, EGLConfig config) {
        created = true;
        engine.surfaceCreated();
    }

    @Override
    public void onSurfaceChanged(GL10 unused, int width, int height) {
        w = width; h = height;
        engine.surfaceChanged(w, h);
    }

    private void swapEngine() {
        engine.release();
        engine = make(cfg);
        if (created) { engine.surfaceCreated(); engine.surfaceChanged(w, h); }
    }

    @Override
    public void onDrawFrame(GL10 unused) {
        Config c = pending;
        if (c != null) {
            pending = null;
            android.util.Log.i("FrutiXr", "settings: " + c.choices.customs.length + " custom schemes, share " + c.choices.customShare + ", favourites " + c.choices.favShare);
            Config old = cfg;
            cfg = c;
            if (!c.pack.equals(pack.key)) {
                Pack p = FrutiXrWallpaper.pack(ctx, c.pack);
                if (p != null) { pack = p; ev = newEvolver(); swapEngine(); }
            } else {
                ev.setChoices(c.choices);
                if (!c.engine.equals(old.engine)) swapEngine();
                else { engine.cfg = c; engine.configChanged(old, c); }
            }
        }
        if (reloadFavorites) { reloadFavorites = false; ev.favorites = Favorites.load(ctx, pack.key, S.nfloat); }
        if (skip) { skip = false; ev.next(true); }
        engine.parallaxTarget = cfg.parallax ? parallax : .5f;
        engine.drawFrame();
        if (ev.target != lastLogged) {
            lastLogged = ev.target;
            Evolver.Entry e = ev.target;
            android.util.Log.i("FrutiXr", "scene \"" + e.name + "\" scheme " + e.scheme + " lib " + e.libIndex + (e.favorite ? " (favourite)" : ""));
        }
        Favorites.current = ev.target;
        Favorites.currentPack = pack.key;
    }
}
