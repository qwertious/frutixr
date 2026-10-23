package org.qwertious.frutixr;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * Port of the web engine's Evolver (genome.js), extended with the app's
 * choices: picks the next scene (a library scene recoloured into a chosen
 * colour scheme, a mutation, a hybrid or a favourite) and morphs the current
 * genome into it with staggered per-group timing and OKLab colour blending.
 */
final class Evolver {
    static final class Entry {
        float[] g;
        String name;
        int style = -1;     // -1 for hybrids
        int scheme = -1;    // scheme index, -1 untouched, -2-k custom scheme k
        int libIndex = -1;  // the library scene this came from, if any
        boolean favorite;

        Entry meta() {
            Entry e = new Entry();
            e.name = name; e.style = style; e.scheme = scheme; e.libIndex = libIndex; e.favorite = favorite;
            return e;
        }
    }

    /** Everything the user can choose that affects which scenes appear and how they move. */
    static final class Choices {
        float[] styleW, schemeW;                 // per style / scheme: 0 off, 1 on, 3 favourite
        float[][][] customs = new float[0][][];  // enabled custom schemes, each 3 x {hue, sat, light}
        float customShare = 0;                   // how often a custom scheme is used
        boolean customWorld = true;              // custom schemes also recolour sky, water and land
        int mood = 0;                            // 0 any, 1 prefer bright, 2 prefer dark, 3 bright only, 4 dark only
        int variety = 1;                         // 0 calm, 1 normal, 2 wild
        boolean hybrids = true, mutations = true, freeze = false;
        float favShare = 0;                      // how often a favourite is chosen (1 = only favourites)
        float holdBase = 24, morphBase = 37;     // seconds resting on a scene / morphing to the next
        float animSpeed = 1, cameraMotion = 1;
        Set<Integer> hidden = new HashSet<>();
    }

    final Schema S;
    final Pack P;
    final Library L;
    final Random R;
    final float[] cur, phases;
    float[] from, to;
    private float[][] win;
    private float[][][] lab;
    Entry info, target;
    boolean morphing = false;
    float t = 0, dur = 1, holdDur = 20;
    Choices ch;
    List<Entry> favorites = new ArrayList<>();
    private final int orbitPhase;

    Evolver(Schema s, Pack p, long seed, Choices c) {
        S = s; P = p; L = p.lib; R = new Random(seed);
        setChoices(c);
        phases = new float[s.nph];
        orbitPhase = s.idx.get("camOrbit").phase;
        Entry first = pickNext(null);
        cur = first.g.clone();
        info = target = first;
        holdDur = hold();
    }

    void setChoices(Choices c) {
        if (c.styleW == null || c.styleW.length != P.styles.size()) { c.styleW = new float[P.styles.size()]; Arrays.fill(c.styleW, 1); }
        if (c.schemeW == null || c.schemeW.length != P.schemes.size()) { c.schemeW = new float[P.schemes.size()]; Arrays.fill(c.schemeW, 1); }
        ch = c;
    }

    // ------------------------------------------------------------ random helpers
    float r(float a, float b) { return a + (b - a) * R.nextFloat(); }
    boolean chance(float p) { return R.nextFloat() < p; }
    float gauss() { return (R.nextFloat() + R.nextFloat() + R.nextFloat() + R.nextFloat() - 2f) * 1.2f; }
    private float hold() { return ch.holdBase * r(.75f, 1.25f); }

    private int weighted(float[] w) {
        float sum = 0;
        for (float x : w) sum += x;
        if (sum <= 0) return -1;
        float x = R.nextFloat() * sum;
        for (int i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0 && w[i] > 0) return i; }
        for (int i = w.length - 1; i >= 0; i--) if (w[i] > 0) return i;
        return -1;
    }

    // ------------------------------------------------------------ choosing scenes
    int pickStyle() {
        float[] w = new float[P.styles.size()];
        for (int i = 0; i < w.length; i++) w[i] = ch.styleW[i] * P.styles.get(i).weight;
        int i = weighted(w);
        if (i >= 0) return i;
        for (int k = 0; k < w.length; k++) w[k] = P.styles.get(k).weight; // nothing chosen: everything
        return weighted(w);
    }

    /** a scheme index, -2-k for custom scheme k, or -1 to leave colours alone */
    int pickScheme() {
        if (ch.customs.length > 0 && chance(ch.customShare)) return -2 - R.nextInt(ch.customs.length);
        return weighted(ch.schemeW);
    }

    private float moodWeight(int m) {
        switch (ch.mood) {
            case 1: return m == Pack.BRIGHT ? 4 : m == Pack.MID ? 1.5f : .5f;
            case 2: return m == Pack.DARK ? 4 : m == Pack.MID ? 1.5f : .5f;
            case 3: return m == Pack.BRIGHT ? 1 : m == Pack.MID ? .25f : 0;
            case 4: return m == Pack.DARK ? 1 : m == Pack.MID ? .25f : 0;
            default: return 1;
        }
    }

    /** a library scene of this style that suits the mood and, ideally, already uses the scheme */
    private int pickIndex(int style, int scheme) {
        List<Integer> list = L.byStyle[style];
        float[] w = new float[list.size()];
        for (int i = 0; i < w.length; i++) {
            int idx = list.get(i);
            if (ch.hidden.contains(idx)) continue;
            w[i] = moodWeight(P.mood[idx]) * (scheme >= 0 && L.scenes.get(idx).palette == scheme ? 4 : 1);
        }
        int k = weighted(w);
        return k < 0 ? -1 : list.get(k);
    }

    Entry fromLibrary(int idx) {
        Library.Scene sc = L.scenes.get(idx);
        Entry e = new Entry();
        e.g = sc.g.clone();
        e.style = sc.style;
        e.scheme = sc.palette;
        e.libIndex = idx;
        e.name = P.styles.get(sc.style).name;
        return e;
    }

    Entry pickScene() {
        int scheme = pickScheme(), idx = -1;
        for (int a = 0; a < 30 && idx < 0; a++) idx = pickIndex(pickStyle(), scheme);
        if (idx < 0) { // the mood or hidden list excluded everything: relax
            for (int a = 0; a < 50 && (idx < 0 || ch.hidden.contains(idx)); a++) idx = R.nextInt(L.scenes.size());
        }
        Entry e = fromLibrary(idx);
        applyScheme(e, scheme);
        return e;
    }

    /** recolour an entry into the chosen scheme */
    void applyScheme(Entry e, int scheme) {
        if (scheme <= -2) {
            Palette.recolor(S, e.g, ch.customs[-2 - scheme], ch.customWorld);
            e.scheme = scheme;
            return;
        }
        if (scheme < 0 || e.scheme == scheme || e.scheme < 0) return;
        float th = P.schemes.get(scheme).hue, sh = P.schemes.get(e.scheme).hue;
        if (th < 0 || sh < 0) return; // multicoloured schemes are left as they are
        Palette.shift(S, e.g, Palette.wrap(th - sh) + r(-10, 10));
        e.scheme = scheme;
    }

    Library.Scene anyScene() { return L.scenes.get(R.nextInt(L.scenes.size())); }

    // ------------------------------------------------------------ genome surgery
    void graft(float[] dst, float[] src, String grp) {
        for (Schema.P p : S.params) if (p.grp.equals(grp)) System.arraycopy(src, p.off, dst, p.off, p.size);
    }

    private boolean structural(String f) { return !f.equals("flr") && !f.equals("ter"); }

    Entry hybrid() {
        int scheme = pickScheme();
        int ia = -1, ib = -1;
        for (int k = 0; k < 30 && ia < 0; k++) ia = pickIndex(pickStyle(), scheme);
        for (int k = 0; k < 30 && (ib < 0 || ib == ia); k++) ib = pickIndex(pickStyle(), -1);
        if (ia < 0 || ib < 0) return pickScene();
        Entry A = fromLibrary(ia), B = fromLibrary(ib);
        float[] g = A.g;
        int n = 0;
        for (String f : S.families) {
            if (!S.active(B.g, f) || !structural(f)) continue;
            if (chance(.6f) || n == 0) { graft(g, B.g, f); n++; if (n >= 2) break; }
        }
        if (chance(.35f)) for (String grp : new String[]{"env", "cloud", "glow"}) graft(g, B.g, grp);
        for (String o : S.overlays) if (S.active(B.g, o) && chance(.4f)) graft(g, B.g, o);
        A.name = A.name + " × " + B.name;
        A.style = -1;
        applyScheme(A, scheme);
        return A;
    }

    float[] mutate(float[] src, float strength, boolean hue) {
        float[] g = src.clone();
        if (hue && chance(.55f)) Palette.shift(S, g, r(-35, 35) * strength);
        List<String> live = new ArrayList<>();
        live.add("cam"); live.add("env"); live.add("pst");
        for (String grp : S.groupWeight.keySet()) if (S.active(g, grp)) live.add(grp);
        for (Schema.P p : S.params) {
            if (p.kind != 'f' || !live.contains(p.grp) || p.name.equals(S.groupWeight.get(p.grp))) continue;
            if (chance(.35f)) g[p.off] = Math.min(p.hi, Math.max(p.lo, g[p.off] + gauss() * p.sig * strength));
        }
        if (chance(.25f)) {
            String o = S.overlays[R.nextInt(S.overlays.length)];
            float[] donor = anyScene().g;
            if (S.active(g, o)) g[S.weightOff(o)] = 0;
            else if (S.active(donor, o)) graft(g, donor, o);
        }
        if (chance(.22f * strength)) {
            float[] donor = anyScene().g;
            List<String> cand = new ArrayList<>();
            for (String f : S.families) if (S.active(donor, f) && !S.active(g, f) && structural(f)) cand.add(f);
            if (!cand.isEmpty()) graft(g, donor, cand.get(R.nextInt(cand.size())));
        }
        if (chance(.15f)) {
            List<String> act = new ArrayList<>();
            for (String f : S.families) if (S.active(g, f) && structural(f)) act.add(f);
            if (act.size() > 1) g[S.weightOff(act.get(R.nextInt(act.size())))] = 0;
        }
        return g;
    }

    /** true when the user left colours unrestricted, so mutations may drift hues */
    private boolean coloursFree() {
        if (ch.customs.length > 0 && ch.customShare > 0) return false;
        for (float w : ch.schemeW) if (w != 1) return false;
        return true;
    }

    Entry pickNext(float[] base) {
        if (!favorites.isEmpty() && ch.favShare > 0 && chance(ch.favShare)) {
            Entry f = favorites.get(R.nextInt(favorites.size()));
            Entry e = f.meta();
            e.g = f.g.clone();
            e.favorite = true;
            return e;
        }
        float mutP = !ch.mutations ? 0 : ch.variety == 0 ? .2f : ch.variety == 2 ? .35f : .3f;
        float hybP = !ch.hybrids ? 0 : ch.variety == 0 ? .05f : ch.variety == 2 ? .3f : .15f;
        float strength = ch.variety == 0 ? .6f : ch.variety == 2 ? 1.6f : 1f;
        float roll = R.nextFloat();
        if (base != null && roll < mutP) {
            Entry e = info.meta();
            e.g = mutate(base, strength, coloursFree());
            e.favorite = false;
            return e;
        }
        if (roll > 1 - hybP) return hybrid();
        return pickScene();
    }

    // ------------------------------------------------------------ morphing
    void next(boolean fast) { begin(pickNext(target.g), fast); }

    void begin(Entry entry, boolean fast) {
        float[] f = cur.clone(), tg = entry.g.clone();
        // families that appear take their target shape and only grow in;
        // families that vanish keep their current shape and only fade out
        for (String grp : S.groupWeight.keySet()) {
            int w = S.weightOff(grp);
            boolean fOn = f[w] > 0.01f, tOn = tg[w] > 0.01f;
            for (Schema.P p : S.params) {
                if (!p.grp.equals(grp) || p.off == w) continue;
                for (int i = 0; i < p.size; i++) {
                    int k = p.off + i;
                    if (!fOn) f[k] = tg[k];
                    else if (!tOn || p.kind == 'd') tg[k] = f[k];
                }
            }
        }
        from = f; to = tg;
        // stagger: each group starts at its own moment and takes its own time
        Map<String, float[]> grpT = new HashMap<>();
        win = new float[S.params.size()][];
        lab = new float[S.params.size()][][];
        for (int i = 0; i < S.params.size(); i++) {
            Schema.P p = S.params.get(i);
            float[] w = grpT.get(p.grp);
            if (w == null) { float s = r(0, .45f); w = new float[]{s, r(.4f, 1 - s)}; grpT.put(p.grp, w); }
            win[i] = w;
            if (p.kind == 'c') lab[i] = new float[][]{
                Colour.toLab(new float[]{f[p.off], f[p.off + 1], f[p.off + 2]}),
                Colour.toLab(new float[]{tg[p.off], tg[p.off + 1], tg[p.off + 2]})};
        }
        target = info = entry;
        morphing = true;
        t = 0;
        dur = fast ? r(9, 14) * Math.min(1, ch.morphBase / 20f + .3f) : ch.morphBase * r(.8f, 1.2f);
    }

    float progress() { return morphing ? t / dur : t / holdDur; }

    private static float smoother(float x) { return x * x * x * (x * (x * 6 - 15) + 10); }

    void update(float dt) {
        if (!ch.freeze || morphing) t += dt;
        if (morphing) {
            float u = Math.min(t / dur, 1);
            for (int i = 0; i < S.params.size(); i++) {
                Schema.P p = S.params.get(i);
                float[] w = win[i];
                float e = smoother(Math.min(Math.max((u - w[0]) / w[1], 0), 1));
                if (p.kind == 'c') {
                    float[] a = lab[i][0], b = lab[i][1];
                    float[] c = Colour.fromLab(new float[]{a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e});
                    System.arraycopy(c, 0, cur, p.off, 3);
                } else if (p.kind == 'd') cur[p.off] = to[p.off];
                else cur[p.off] = from[p.off] + (to[p.off] - from[p.off]) * e;
            }
            if (u >= 1) { System.arraycopy(to, 0, cur, 0, cur.length); morphing = false; t = 0; holdDur = hold(); }
        } else if (!ch.freeze && t >= holdDur) next(false);
        for (String name : S.rates) {
            Schema.P p = S.idx.get(name);
            phases[p.phase] += cur[p.off] * dt * ch.animSpeed * (p.phase == orbitPhase ? ch.cameraMotion : 1);
        }
    }

    float v(String name) { return cur[S.off(name)]; }
}
