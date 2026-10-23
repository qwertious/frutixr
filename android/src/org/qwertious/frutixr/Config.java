package org.qwertious.frutixr;

import android.content.SharedPreferences;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * A snapshot of the user's settings, read on the main thread and handed to the
 * GL thread. Styles, colour schemes and hidden scenes are stored per pack
 * ("styles.aero", ...), so each pack keeps its own choices.
 */
final class Config {
    // ---- content
    String pack = "aero";
    // ---- performance
    String engine = "smooth";   // smooth (rasterized) | ray (ray traced keyframes)
    String tier = "lite";       // potato | lite | full
    float detail = .75f;        // scene render scale relative to the screen
    float resolution = .75f;    // final image scale relative to the screen
    int fps = 30;
    boolean reflections = true;
    // ---- look
    boolean overlays = true;
    Set<String> overlayTypes = new HashSet<>();
    float brightness = 0, contrast = 1, glow = 1, vignette = 1, grain = 1, saturation = 1, hueShift = 0;
    // ---- motion and touch
    boolean parallax = true, doubleTap = true;
    // ---- scene choice, handed to the evolver
    Evolver.Choices choices;

    static final String[] OVERLAYS = {"dots", "bokeh", "lines", "streak", "spark", "flare"};

    /** factory defaults for the three custom colour schemes */
    static final int[][] CUSTOM_DEFAULTS = {
        {0xFFFF7A3D, 0xFFFF3D8B, 0xFFFFD166},   // sunset
        {0xFF3DDCB0, 0xFF2B8CFF, 0xFFE0FFF6},   // mint
        {0xFF8A4DFF, 0xFFFF4FD8, 0xFF4FD8FF},   // grape
    };

    static Config read(SharedPreferences p, Pack pack) {
        Config c = new Config();
        c.pack = p.getString("pack", c.pack);
        c.engine = p.getString("engine", c.engine);
        c.tier = p.getString("shader", c.tier);
        c.detail = f(p, "detail", .75f);
        c.resolution = f(p, "resolution", .75f);
        c.fps = (int) f(p, "fps", 30);
        c.reflections = p.getBoolean("reflections", true);

        c.overlays = p.getBoolean("overlays", true);
        Set<String> all = new HashSet<>();
        Collections.addAll(all, OVERLAYS);
        c.overlayTypes = new HashSet<>(p.getStringSet("overlaytypes", all));
        c.brightness = f(p, "brightness", 0);
        c.contrast = f(p, "contrast", 1);
        c.glow = f(p, "glow", 1);
        c.vignette = f(p, "vignette", 1);
        c.grain = f(p, "grain", 1);
        c.saturation = f(p, "saturation", 1);
        c.hueShift = f(p, "hueshift", 0);
        c.parallax = p.getBoolean("parallax", true);
        c.doubleTap = p.getBoolean("doubletap", true);

        Evolver.Choices ch = new Evolver.Choices();
        String k = pack.key;
        ch.styleW = weights(p, "styles." + k, "favstyles." + k, pack.styles.size(), i -> pack.styles.get(i).key);
        ch.schemeW = weights(p, "schemes." + k, "favschemes." + k, pack.schemes.size(), i -> pack.schemes.get(i).key);
        ch.mood = (int) f(p, "mood", 0);
        ch.variety = (int) f(p, "variety", 1);
        ch.hybrids = p.getBoolean("hybrids", true);
        ch.mutations = p.getBoolean("mutations", true);
        ch.freeze = p.getBoolean("freeze", false);
        ch.favShare = f(p, "favshare", .15f);
        ch.holdBase = f(p, "scenetime", 25);
        ch.morphBase = f(p, "transition", 35);
        ch.animSpeed = f(p, "animspeed", 1);
        ch.cameraMotion = f(p, "cammotion", 1);
        ch.customShare = f(p, "customshare", .5f);
        ch.customWorld = p.getBoolean("customworld", true);
        java.util.List<float[][]> customs = new java.util.ArrayList<>();
        for (int i = 0; i < 3; i++) {
            if (!p.getBoolean("custom" + (i + 1) + ".on", false)) continue;
            float[][] hsl = new float[3][];
            String[] slot = {"a", "b", "c"};
            for (int j = 0; j < 3; j++) hsl[j] = Palette.hslOf(p.getInt("custom" + (i + 1) + "." + slot[j], CUSTOM_DEFAULTS[i][j]));
            customs.add(hsl);
        }
        ch.customs = customs.toArray(new float[0][][]);
        for (String s : p.getStringSet("hidden." + k, new HashSet<String>())) {
            try { ch.hidden.add(Integer.parseInt(s)); } catch (NumberFormatException e) { /* ignore junk */ }
        }
        c.choices = ch;
        return c;
    }

    private interface KeyOf { String at(int i); }

    /** 0 for items switched off, 3 for favourites, 1 otherwise; everything on when nothing is stored */
    private static float[] weights(SharedPreferences p, String onKey, String favKey, int n, KeyOf key) {
        Set<String> on = p.getStringSet(onKey, null), fav = p.getStringSet(favKey, new HashSet<String>());
        float[] w = new float[n];
        for (int i = 0; i < n; i++) {
            String s = key.at(i);
            w[i] = on != null && !on.contains(s) ? 0 : fav.contains(s) ? 3 : 1;
        }
        return w;
    }

    private static float f(SharedPreferences p, String key, float d) {
        try { return Float.parseFloat(p.getString(key, String.valueOf(d))); } catch (RuntimeException e) { return d; }
    }

    /** The user's look settings, applied to a copy of the scene genome before it is drawn. */
    void applyLook(Schema S, float[] g) {
        String[][] types = {{"dots", "dotsAmt"}, {"bokeh", "bokehAmt"}, {"lines", "linesAmt"}, {"streak", "streakAmt"},
            {"spark", "sparkAmt"}, {"flare", "flareAmt"}, {"flare", "burstAmt"}};
        for (String[] t : types) if (!overlays || !overlayTypes.contains(t[0])) g[S.off(t[1])] = 0;
        g[S.off("exposure")] *= (float) Math.pow(2, brightness);
        g[S.off("contrast")] = 1 + (g[S.off("contrast")] - 1) * contrast + (contrast - 1) * .5f;
        g[S.off("bloom")] *= glow;
        g[S.off("diffuse")] *= glow;
        g[S.off("shafts")] *= glow;
        g[S.off("vignette")] *= vignette;
        g[S.off("grain")] *= grain;
        g[S.off("saturation")] *= saturation;
        if (hueShift != 0) Palette.shift(S, g, hueShift);
    }
}
