package org.qwertious.frutixr;

/** sRGB/HSL/OKLab helpers, matching genome.js. Colours in the genome are linear RGB. */
final class Colour {
    private Colour() {}

    static float s2l(float c) { return c <= 0.04045f ? c / 12.92f : (float) Math.pow((c + 0.055) / 1.055, 2.4); }
    static float l2s(float c) { return c <= 0.0031308f ? c * 12.92f : (float) (1.055 * Math.pow(c, 1 / 2.4) - 0.055); }

    static float[] hslToSrgb(float h, float s, float l) {
        h = (((h % 360) + 360) % 360) / 360f;
        float q = l < 0.5f ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        return new float[]{hue(p, q, h + 1 / 3f), hue(p, q, h), hue(p, q, h - 1 / 3f)};
    }

    private static float hue(float p, float q, float t) {
        t = ((t % 1) + 1) % 1;
        if (t < 1 / 6f) return p + (q - p) * 6 * t;
        if (t < 0.5f) return q;
        if (t < 2 / 3f) return p + (q - p) * (2 / 3f - t) * 6;
        return p;
    }

    static float[] srgbToHsl(float r, float g, float b) {
        float mx = Math.max(r, Math.max(g, b)), mn = Math.min(r, Math.min(g, b)), l = (mx + mn) / 2;
        if (mx == mn) return new float[]{0, 0, l};
        float d = mx - mn, s = l > 0.5f ? d / (2 - mx - mn) : d / (mx + mn);
        float h = mx == r ? (g - b) / d + (g < b ? 6 : 0) : mx == g ? (b - r) / d + 2 : (r - g) / d + 4;
        return new float[]{h * 60, s, l};
    }

    static float[] hueShift(float[] lin, float deg) {
        float m = Math.max(lin[0], Math.max(lin[1], lin[2]));
        if (m <= 0) return lin;
        float sc = m > 1 ? m : 1;
        float[] hsl = srgbToHsl(l2s(Math.min(lin[0] / sc, 1)), l2s(Math.min(lin[1] / sc, 1)), l2s(Math.min(lin[2] / sc, 1)));
        float[] s = hslToSrgb(hsl[0] + deg, hsl[1], hsl[2]);
        return new float[]{s2l(s[0]) * sc, s2l(s[1]) * sc, s2l(s[2]) * sc};
    }

    static float[] toLab(float[] c) {
        double r = c[0], g = c[1], b = c[2];
        double l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        double m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        double s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        return new float[]{
            (float) (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s),
            (float) (1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s),
            (float) (0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)};
    }

    static float[] fromLab(float[] c) {
        double L = c[0], a = c[1], b = c[2];
        double l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
        double m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
        double s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
        return new float[]{
            (float) Math.max(4.0767416621 * l - 3.3077085500 * m + 0.2309468470 * s, 0),
            (float) Math.max(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0),
            (float) Math.max(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s, 0)};
    }
}
