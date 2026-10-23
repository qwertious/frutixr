package org.qwertious.frutixr;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** The genome parameter schema, shared by all packs, exported from the web engine (genome.js) as schema.txt. */
final class Schema {
    static final class P {
        String name, grp;
        char kind;          // f float, c colour (3 floats), d discrete, r rate (integrated into a phase)
        int size, off, phase;
        float sig, lo, hi;
        float[] def;
    }

    int nfloat, nph;
    final List<P> params = new ArrayList<>();
    final Map<String, P> idx = new HashMap<>();
    String[] rates = new String[0];
    final Map<String, String> groupWeight = new HashMap<>();
    String[] families = new String[0], overlays = new String[0];

    static Schema load(InputStream in) throws IOException {
        Schema s = new Schema();
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        String line;
        while ((line = r.readLine()) != null) {
            if (line.isEmpty()) continue;
            String[] t = line.split(" ");
            switch (t[0]) {
                case "N": s.nfloat = Integer.parseInt(t[1]); s.nph = Integer.parseInt(t[2]); break;
                case "P": {
                    P p = new P();
                    p.name = t[1]; p.grp = t[2]; p.kind = t[3].charAt(0);
                    p.size = Integer.parseInt(t[4]); p.off = Integer.parseInt(t[5]);
                    p.sig = Float.parseFloat(t[6]); p.lo = num(t[7]); p.hi = num(t[8]);
                    p.phase = Integer.parseInt(t[9]);
                    String[] d = t[10].split(",");
                    p.def = new float[d.length];
                    for (int i = 0; i < d.length; i++) p.def[i] = Float.parseFloat(d[i]);
                    s.params.add(p); s.idx.put(p.name, p);
                    break;
                }
                case "R": s.rates = rest(t); break;
                case "W": s.groupWeight.put(t[1], t[2]); break;
                case "F": s.families = rest(t); break;
                case "O": s.overlays = rest(t); break;
                default: break;
            }
        }
        return s;
    }

    private static float num(String v) {
        if (v.equals("inf")) return Float.POSITIVE_INFINITY;
        if (v.equals("-inf")) return Float.NEGATIVE_INFINITY;
        return Float.parseFloat(v);
    }

    private static String[] rest(String[] t) {
        String[] a = new String[t.length - 1];
        System.arraycopy(t, 1, a, 0, a.length);
        return a;
    }

    int off(String name) { return idx.get(name).off; }

    /** Offset of the weight parameter that switches a group on, or -1 for always-on groups. */
    int weightOff(String grp) {
        String w = groupWeight.get(grp);
        return w == null ? -1 : idx.get(w).off;
    }

    boolean active(float[] g, String grp) {
        int w = weightOff(grp);
        return w >= 0 && g[w] > 0.01f;
    }

    float[] blank() {
        float[] g = new float[nfloat];
        for (P p : params) System.arraycopy(p.def, 0, g, p.off, p.size);
        return g;
    }
}
