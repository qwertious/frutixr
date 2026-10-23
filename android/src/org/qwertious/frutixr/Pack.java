package org.qwertious.frutixr;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * A content pack: a set of styles (scene generators from the web engine), its
 * colour schemes, and a library of pre-generated scenes. Frutiger Aero is the
 * first; the app is built so more packs (liminal, dreamcore, ...) can be added
 * as new folders under assets/packs.
 */
final class Pack {
    static final class Style {
        String key, name;
        float weight;
    }

    static final class Scheme {
        String key, name;
        /** representative hue in degrees, or -1 for multicoloured schemes that are never hue-shifted */
        float hue;
    }

    /** brightness class of a scene, for the mood setting */
    static final int DARK = 0, MID = 1, BRIGHT = 2;

    String key, name, desc;
    final List<Style> styles = new ArrayList<>();
    final List<Scheme> schemes = new ArrayList<>();
    Library lib;
    /** per library scene: DARK, MID or BRIGHT */
    byte[] mood;

    interface Opener { InputStream open(String path) throws IOException; }

    static List<String> index(Opener o) throws IOException {
        List<String> keys = new ArrayList<>();
        for (String line : read(o.open("packs/index.txt"))) if (!line.trim().isEmpty()) keys.add(line.trim());
        return keys;
    }

    static Pack load(Opener o, String key, Schema s) throws IOException {
        Pack p = new Pack();
        for (String line : read(o.open("packs/" + key + "/pack.txt"))) {
            if (line.length() < 2) continue;
            String rest = line.substring(2);
            String[] t = rest.split(" ");
            switch (line.charAt(0)) {
                case 'K': p.key = rest.trim(); break;
                case 'N': p.name = rest.trim(); break;
                case 'D': p.desc = rest.trim(); break;
                case 'A': {
                    Style st = new Style();
                    st.key = t[0]; st.weight = Float.parseFloat(t[1]);
                    st.name = String.join(" ", Arrays.copyOfRange(t, 2, t.length));
                    p.styles.add(st);
                    break;
                }
                case 'C': {
                    Scheme c = new Scheme();
                    c.key = t[0]; c.hue = Float.parseFloat(t[1]);
                    c.name = String.join(" ", Arrays.copyOfRange(t, 2, t.length));
                    p.schemes.add(c);
                    break;
                }
                default: break;
            }
        }
        p.lib = Library.load(o.open("packs/" + key + "/library.bin"), p.styles.size());
        // brightness from the horizon and zenith sky colours (linear light)
        int hor = s.off("skyHor"), top = s.off("skyTop");
        p.mood = new byte[p.lib.scenes.size()];
        for (int i = 0; i < p.mood.length; i++) {
            float[] g = p.lib.scenes.get(i).g;
            float l = .6f * lum(g, hor) + .4f * lum(g, top);
            p.mood[i] = (byte) (l > .2f ? BRIGHT : l < .045f ? DARK : MID);
        }
        return p;
    }

    private static float lum(float[] g, int o) { return .2126f * g[o] + .7152f * g[o + 1] + .0722f * g[o + 2]; }

    int styleIndex(String k) {
        for (int i = 0; i < styles.size(); i++) if (styles.get(i).key.equals(k)) return i;
        return -1;
    }

    private static List<String> read(InputStream in) throws IOException {
        List<String> lines = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String l;
            while ((l = r.readLine()) != null) lines.add(l);
        }
        return lines;
    }
}
