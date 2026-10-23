package org.qwertious.frutixr;

import android.content.Context;
import android.util.Log;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Saved scenes (full genomes, so mutations and hybrids can be kept too), stored
 * per pack in the app's private files. The running wallpaper publishes what it
 * is showing in {@link #current}, which the settings screen saves or hides.
 */
final class Favorites {
    private Favorites() {}

    static final int MAX = 100;

    /** the scene the wallpaper is showing now (set by the GL thread) */
    static volatile Evolver.Entry current;
    static volatile String currentPack;

    private static File file(Context c, String pack) { return new File(c.getFilesDir(), "favorites." + pack + ".bin"); }

    static synchronized List<Evolver.Entry> load(Context c, String pack, int nfloat) {
        List<Evolver.Entry> list = new ArrayList<>();
        File f = file(c, pack);
        if (!f.exists()) return list;
        try (DataInputStream in = new DataInputStream(new FileInputStream(f))) {
            int n = in.readInt();
            for (int i = 0; i < n; i++) {
                Evolver.Entry e = new Evolver.Entry();
                e.name = in.readUTF();
                e.libIndex = in.readInt();
                int len = in.readInt();
                float[] g = new float[len];
                for (int k = 0; k < len; k++) g[k] = in.readFloat();
                if (len != nfloat) continue; // saved by an incompatible version
                e.g = g;
                e.favorite = true;
                list.add(e);
            }
        } catch (IOException e) {
            Log.w("FrutiXr", "could not read favourites", e);
        }
        return list;
    }

    static synchronized void save(Context c, String pack, List<Evolver.Entry> list) throws IOException {
        File tmp = new File(c.getFilesDir(), "favorites." + pack + ".tmp");
        try (DataOutputStream out = new DataOutputStream(new FileOutputStream(tmp))) {
            out.writeInt(list.size());
            for (Evolver.Entry e : list) {
                out.writeUTF(e.name == null ? "Scene" : e.name);
                out.writeInt(e.libIndex);
                out.writeInt(e.g.length);
                for (float v : e.g) out.writeFloat(v);
            }
        }
        if (!tmp.renameTo(file(c, pack))) throw new IOException("could not replace favourites file");
    }

    /** @return the new number of favourites, or -1 if the list is full */
    static synchronized int add(Context c, String pack, Evolver.Entry e, int nfloat) throws IOException {
        List<Evolver.Entry> list = load(c, pack, nfloat);
        if (list.size() >= MAX) return -1;
        Evolver.Entry copy = e.meta();
        copy.g = e.g.clone();
        copy.favorite = true;
        list.add(copy);
        save(c, pack, list);
        return list.size();
    }

    static synchronized void clear(Context c, String pack) {
        File f = file(c, pack);
        if (f.exists() && !f.delete()) Log.w("FrutiXr", "could not delete favourites");
    }

    static int count(Context c, String pack, int nfloat) { return load(c, pack, nfloat).size(); }
}
