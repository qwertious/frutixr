package org.qwertious.frutixr;

import android.app.ActivityManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.opengl.GLSurfaceView;
import android.preference.PreferenceManager;
import android.service.wallpaper.WallpaperService;
import android.util.Log;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.SurfaceHolder;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The FrutiXr live wallpaper: evolving scenes from a content pack, rendered with OpenGL ES. */
public class FrutiXrWallpaper extends WallpaperService {
    private static Schema schema;
    private static final Map<String, Pack> packs = new HashMap<>();

    /** The parameter schema, shared by every pack and every engine. */
    static synchronized Schema schema(Context c) {
        if (schema == null) {
            try { schema = Schema.load(c.getAssets().open("schema.txt")); }
            catch (IOException e) { Log.e("FrutiXr", "schema load failed", e); }
        }
        return schema;
    }

    /** A pack by key (cached), falling back to the first pack; null only if the assets are broken. */
    static synchronized Pack pack(Context c, String key) {
        Schema s = schema(c);
        if (s == null) return null;
        Pack.Opener o = c.getAssets()::open;
        try {
            List<String> keys = Pack.index(o);
            if (!keys.contains(key)) key = keys.isEmpty() ? null : keys.get(0);
            if (key == null) return null;
            Pack p = packs.get(key);
            if (p == null) { p = Pack.load(o, key, s); packs.put(key, p); }
            return p;
        } catch (IOException e) {
            Log.e("FrutiXr", "pack load failed: " + key, e);
            return null;
        }
    }

    static Pack currentPack(Context c, SharedPreferences prefs) { return pack(c, prefs.getString("pack", "aero")); }

    @Override
    public Engine onCreateEngine() { return new GLEngine(); }

    final class GLEngine extends Engine implements SharedPreferences.OnSharedPreferenceChangeListener {
        /** GLSurfaceView drawing into the wallpaper's surface instead of a view's. */
        final class GLView extends GLSurfaceView {
            GLView(Context c) { super(c); }
            @Override public SurfaceHolder getHolder() { return getSurfaceHolder(); }

            // GLSurfaceView normally blocks the caller until a frame has been drawn.
            // Android calls these on the main thread when the wallpaper first shows,
            // and a slow first frame then freezes the system UI until it is killed as
            // not responding. Ask for a frame and return at once instead.
            @Override public void surfaceRedrawNeeded(SurfaceHolder h) { requestRender(); }
            @Override public void surfaceRedrawNeededAsync(SurfaceHolder h, Runnable done) { requestRender(); done.run(); }

            /** Stops the GL thread; the view was never attached, so guard the framework's detach path. */
            void destroy() {
                try { super.onDetachedFromWindow(); } catch (RuntimeException e) { Log.w("FrutiXr", "detach", e); }
            }
        }

        private GLView view;
        private MainRenderer renderer;
        private SharedPreferences prefs;
        private GestureDetector taps;
        private Config cfg;

        @Override
        public void onCreate(SurfaceHolder holder) {
            super.onCreate(holder);
            Context ctx = FrutiXrWallpaper.this;
            Schema s = schema(ctx);
            prefs = PreferenceManager.getDefaultSharedPreferences(ctx);
            Pack pack = currentPack(ctx, prefs);
            if (s == null || pack == null) return;
            cfg = Config.read(prefs, pack);
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            boolean es3 = am != null && am.getDeviceConfigurationInfo().reqGlEsVersion >= 0x30000;
            view = new GLView(ctx);
            view.setEGLContextClientVersion(es3 ? 3 : 2);
            view.setEGLConfigChooser(8, 8, 8, 0, 0, 0);
            view.setPreserveEGLContextOnPause(true);
            renderer = new MainRenderer(ctx, s, pack, es3, cfg);
            view.setRenderer(renderer);
            view.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
            setTouchEventsEnabled(true);
            setOffsetNotificationsEnabled(true);
            taps = new GestureDetector(ctx, new GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onDoubleTap(MotionEvent e) {
                    if (cfg.doubleTap) renderer.skipScene();
                    return true;
                }
            });
            prefs.registerOnSharedPreferenceChangeListener(this);
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            if (view == null) return;
            if (visible) view.onResume(); else view.onPause();
        }

        @Override
        public void onTouchEvent(MotionEvent e) {
            if (taps != null) taps.onTouchEvent(e);
            super.onTouchEvent(e);
        }

        @Override
        public void onOffsetsChanged(float xOffset, float yOffset, float xStep, float yStep, int xPixels, int yPixels) {
            if (renderer != null) renderer.setParallax(xOffset);
        }

        @Override
        public void onSharedPreferenceChanged(SharedPreferences p, String key) {
            if (renderer == null) return;
            if ("skipNonce".equals(key)) { renderer.skipScene(); return; }
            if ("favNonce".equals(key)) { renderer.favoritesChanged(); return; }
            Pack pack = currentPack(FrutiXrWallpaper.this, p);
            if (pack == null) return;
            cfg = Config.read(p, pack);
            renderer.setConfig(cfg);
        }

        @Override
        public void onDestroy() {
            if (prefs != null) prefs.unregisterOnSharedPreferenceChangeListener(this);
            if (view != null) view.destroy();
            super.onDestroy();
        }
    }
}
