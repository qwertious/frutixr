package org.qwertious.frutixr;

/**
 * Recolouring whole scenes: shifting a scene from one colour scheme to another,
 * and mapping it onto a user's custom three-colour scheme.
 */
final class Palette {
    private Palette() {}

    /** colours that describe light rather than the scheme, and are never recoloured */
    private static boolean neutral(String name) {
        return name.equals("cloudCol") || name.equals("sunCol") || name.equals("tintCol") || name.equals("lift");
    }

    /** sky, water and land colours: recoloured by custom schemes only if the user wants that */
    private static boolean world(String name) {
        return name.startsWith("sky") || name.startsWith("glowCol") || name.equals("waterCol")
            || name.startsWith("terCol") || name.equals("treeCol");
    }

    /** rotate every colour's hue (greys and whites are unaffected) */
    static void shift(Schema S, float[] g, float deg) {
        if (Math.abs(deg) < .5f) return;
        for (Schema.P p : S.params) {
            if (p.kind != 'c' || neutral(p.name)) continue;
            float[] c = Colour.hueShift(new float[]{g[p.off], g[p.off + 1], g[p.off + 2]}, deg);
            System.arraycopy(c, 0, g, p.off, 3);
        }
    }

    /**
     * Map a scene onto a custom scheme. Each colour is assigned to the primary,
     * secondary or accent colour by how far its hue sits from the scene's
     * dominant hue, takes that colour's hue and most of its saturation, and
     * keeps its own lightness, so the scene's light and shade survive.
     *
     * @param hsl three colours {hue degrees, saturation, lightness}
     */
    static void recolor(Schema S, float[] g, float[][] hsl, boolean world) {
        double sx = 0, sy = 0;
        for (Schema.P p : S.params) {
            if (p.kind != 'c' || neutral(p.name) || (!world && world(p.name))) continue;
            float[] h = hslOf(g, p.off);
            if (h == null) continue;
            double w = h[1] * Math.max(0, 1 - Math.abs(h[2] - .5) * 1.4);
            sx += Math.cos(Math.toRadians(h[0])) * w;
            sy += Math.sin(Math.toRadians(h[0])) * w;
        }
        float dom = (float) Math.toDegrees(Math.atan2(sy, sx));
        for (Schema.P p : S.params) {
            if (p.kind != 'c' || neutral(p.name) || (!world && world(p.name))) continue;
            float[] h = hslOf(g, p.off);
            if (h == null || h[1] < .12f) continue;
            float dh = wrap(h[0] - dom);
            float[] t = Math.abs(dh) < 50 ? hsl[0] : Math.abs(dh) < 115 ? hsl[1] : hsl[2];
            float hue = t[0] + dh * .12f, sat = h[1] * .35f + t[1] * .65f;
            float scale = Math.max(1, Math.max(g[p.off], Math.max(g[p.off + 1], g[p.off + 2])));
            float[] s = Colour.hslToSrgb(hue, sat, h[2]);
            for (int i = 0; i < 3; i++) g[p.off + i] = Colour.s2l(s[i]) * scale;
        }
    }

    /** HSL of a linear colour (HDR colours normalised first), or null for black */
    private static float[] hslOf(float[] g, int o) {
        float m = Math.max(g[o], Math.max(g[o + 1], g[o + 2]));
        if (m <= 1e-5f) return null;
        float sc = m > 1 ? m : 1;
        return Colour.srgbToHsl(Colour.l2s(Math.min(g[o] / sc, 1)), Colour.l2s(Math.min(g[o + 1] / sc, 1)), Colour.l2s(Math.min(g[o + 2] / sc, 1)));
    }

    static float wrap(float d) {
        d = ((d % 360) + 360) % 360;
        return d > 180 ? d - 360 : d;
    }

    /** sRGB int colour to {hue, saturation, lightness} */
    static float[] hslOf(int argb) {
        return Colour.srgbToHsl(((argb >> 16) & 255) / 255f, ((argb >> 8) & 255) / 255f, (argb & 255) / 255f);
    }
}
