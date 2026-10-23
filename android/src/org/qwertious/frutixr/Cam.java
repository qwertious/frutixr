package org.qwertious.frutixr;

/** Camera and sun projection, ported from the web engine's main.js. */
final class Cam {
    final float[] pos = new float[3];
    final float[] rot = new float[9]; // columns: right, up, forward
    float[] r, u, f;
    float sunU = .5f, sunV = .5f, sunVis = 0;

    /**
     * @param g      genome (with the user's look adjustments)
     * @param ph     integrated phases
     * @param yawExtra extra yaw in radians (home-screen parallax)
     * @param motion scale on the camera's wandering (0 = still)
     */
    void update(Schema S, float[] g, float[] ph, float t, float aspect, float yawExtra, float motion) {
        float drift = g[S.off("camDrift")] * motion;
        double yaw = g[S.off("camYaw")] + ph[S.idx.get("camOrbit").phase] + yawExtra
            + drift * .12 * Math.sin(t * .031) + drift * .05 * Math.sin(t * .071 + 2);
        double pitch = g[S.off("camPitch")] + drift * .04 * Math.sin(t * .023 + 1.3);
        float[] tgt = {
            (float) (g[S.off("camTX")] + drift * .3 * Math.sin(t * .017)),
            (float) (g[S.off("camTY")] + drift * .15 * Math.sin(t * .029 + 2)),
            g[S.off("camTZ")]};
        float d = g[S.off("camDist")];
        double cp = Math.cos(pitch);
        pos[0] = (float) (tgt[0] + d * cp * Math.sin(yaw));
        pos[1] = (float) (tgt[1] + d * Math.sin(pitch));
        pos[2] = (float) (tgt[2] + d * cp * Math.cos(yaw));
        float flrW = g[S.off("flrW")];
        if (flrW > .5f) pos[1] = Math.max(pos[1], g[S.off("flrY")] - (1 - flrW) * 40 + .25f);
        f = norm(sub(tgt, pos));
        float[] rr = norm(cross(f, new float[]{0, 1, 0}));
        float[] uu = cross(rr, f);
        double roll = g[S.off("camRoll")] + drift * .015 * Math.sin(t * .043);
        float c = (float) Math.cos(roll), s = (float) Math.sin(roll);
        r = add(mul(rr, c), mul(uu, s));
        u = add(mul(rr, -s), mul(uu, c));
        System.arraycopy(r, 0, rot, 0, 3);
        System.arraycopy(u, 0, rot, 3, 3);
        System.arraycopy(f, 0, rot, 6, 3);

        // sun position on screen, for light shafts and the spectral burst
        float e = g[S.off("sunElev")], y = g[S.off("sunYaw")];
        float ce = (float) Math.cos(e);
        float[] sd = {(float) Math.sin(y) * ce, (float) Math.sin(e), -(float) Math.cos(y) * ce};
        float z = dot(sd, f);
        if (z <= .02f) { sunU = .5f; sunV = .5f; sunVis = 0; return; }
        float zoom = g[S.off("camZoom")], fov = Math.min(1, aspect * 1.2f); // matches the scene shader
        float sx = dot(sd, r) / z * zoom, sy = dot(sd, u) / z * zoom;
        sunU = sx * fov / aspect + .5f;
        sunV = sy * fov + .5f;
        float edge = Math.max(Math.abs(sunU - .5f), Math.abs(sunV - .5f));
        sunVis = Math.min(1, z * 4) * Math.max(0, Math.min(1, (1.1f - edge) / .5f));
    }

    static float[] sub(float[] a, float[] b) { return new float[]{a[0] - b[0], a[1] - b[1], a[2] - b[2]}; }
    static float[] add(float[] a, float[] b) { return new float[]{a[0] + b[0], a[1] + b[1], a[2] + b[2]}; }
    static float[] mul(float[] a, float k) { return new float[]{a[0] * k, a[1] * k, a[2] * k}; }
    static float dot(float[] a, float[] b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    static float[] cross(float[] a, float[] b) { return new float[]{a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]}; }
    static float[] norm(float[] a) {
        float l = (float) Math.sqrt(dot(a, a));
        return l > 1e-9f ? mul(a, 1 / l) : new float[]{0, 0, -1};
    }
}
