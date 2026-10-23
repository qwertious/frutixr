package org.qwertious.frutixr;

import android.app.AlertDialog;
import android.app.WallpaperManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.preference.ListPreference;
import android.preference.MultiSelectListPreference;
import android.preference.Preference;
import android.preference.PreferenceActivity;
import android.preference.PreferenceCategory;
import android.preference.PreferenceManager;
import android.widget.Toast;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * FrutiXr settings; also the launcher entry. The static part comes from
 * res/xml/prefs.xml; everything that depends on the chosen pack (its styles and
 * colour schemes) is built here, with keys suffixed by the pack key so every
 * pack keeps its own choices.
 */
@SuppressWarnings("deprecation") // framework preferences: no support library needed
public class SettingsActivity extends PreferenceActivity {
    private SharedPreferences prefs;
    private Pack pack;
    private Schema schema;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        addPreferencesFromResource(R.xml.prefs);
        prefs = PreferenceManager.getDefaultSharedPreferences(this);
        schema = FrutiXrWallpaper.schema(this);
        pack = FrutiXrWallpaper.currentPack(this, prefs);
        if (pack == null || schema == null) {
            Toast.makeText(this, "FrutiXr's content could not be loaded", Toast.LENGTH_LONG).show();
            return;
        }
        buildPackChoices();
        wireActions();
    }

    // ---------------------------------------------------------------- pack-dependent settings
    private void buildPackChoices() {
        ListPreference packPref = (ListPreference) findPreference("pack");
        List<String> keys = new ArrayList<>(), names = new ArrayList<>();
        try {
            for (String k : Pack.index(getAssets()::open)) {
                Pack p = FrutiXrWallpaper.pack(this, k);
                if (p != null) { keys.add(k); names.add(p.name); }
            }
        } catch (IOException e) { keys.add(pack.key); names.add(pack.name); }
        packPref.setEntries(names.toArray(new CharSequence[0]));
        packPref.setEntryValues(keys.toArray(new CharSequence[0]));
        packPref.setValue(pack.key);
        packPref.setSummary(pack.name + ": " + pack.desc);
        packPref.setOnPreferenceChangeListener((p, v) -> {
            // rebuild the screen for the new pack's styles and schemes
            prefs.edit().putString("pack", (String) v).apply();
            recreate();
            return false;
        });

        String[] styleKeys = new String[pack.styles.size()], styleNames = new String[pack.styles.size()];
        for (int i = 0; i < styleKeys.length; i++) { styleKeys[i] = pack.styles.get(i).key; styleNames[i] = pack.styles.get(i).name; }
        String[] schemeKeys = new String[pack.schemes.size()], schemeNames = new String[pack.schemes.size()];
        for (int i = 0; i < schemeKeys.length; i++) { schemeKeys[i] = pack.schemes.get(i).key; schemeNames[i] = pack.schemes.get(i).name; }

        PreferenceCategory scenes = (PreferenceCategory) findPreference("cat_pack");
        scenes.addPreference(multi("styles." + pack.key, "Styles", "Which styles appear", styleKeys, styleNames, true));
        scenes.addPreference(multi("favstyles." + pack.key, "Favourite styles", "Shown three times as often", styleKeys, styleNames, false));
        PreferenceCategory schemes = (PreferenceCategory) findPreference("cat_schemes");
        schemes.addPreference(multi("schemes." + pack.key, "Colour schemes", "Which colour schemes appear", schemeKeys, schemeNames, true));
        schemes.addPreference(multi("favschemes." + pack.key, "Favourite colour schemes", "Shown three times as often", schemeKeys, schemeNames, false));
    }

    /** a multi-select over the pack's styles or schemes, with a summary of what is chosen */
    private MultiSelectListPreference multi(String key, String title, String what, String[] keys, String[] names, boolean allByDefault) {
        final MultiSelectListPreference p = new MultiSelectListPreference(this);
        p.setKey(key);
        p.setTitle(title);
        p.setDialogTitle(title);
        p.setEntries(names);
        p.setEntryValues(keys);
        Set<String> def = new HashSet<>();
        if (allByDefault) Collections.addAll(def, keys);
        p.setDefaultValue(def);
        p.setPersistent(true);
        final String[] fk = keys, fn = names;
        p.setOnPreferenceChangeListener((pref, v) -> {
            @SuppressWarnings("unchecked") Set<String> chosen = (Set<String>) v;
            p.setSummary(summary(what, chosen, fk, fn, allByDefault));
            return true;
        });
        p.setSummary(summary(what, prefs.getStringSet(key, def), keys, names, allByDefault));
        return p;
    }

    private static String summary(String what, Set<String> chosen, String[] keys, String[] names, boolean allMeansAll) {
        int n = 0;
        StringBuilder list = new StringBuilder();
        for (int i = 0; i < keys.length; i++) if (chosen.contains(keys[i])) {
            if (n++ > 0) list.append(", ");
            list.append(names[i]);
        }
        if (allMeansAll && (n == 0 || n == keys.length)) return what + ": all " + keys.length;
        if (n == 0) return what + ": none";
        return n > 4 ? what + ": " + n + " of " + keys.length : what + ": " + list;
    }

    // ---------------------------------------------------------------- actions
    private void action(String key, Runnable r) {
        Preference p = findPreference(key);
        if (p != null) p.setOnPreferenceClickListener(x -> { r.run(); return true; });
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }
    private void poke(String key) { prefs.edit().putLong(key, System.currentTimeMillis()).apply(); }

    private Evolver.Entry currentScene() {
        Evolver.Entry e = Favorites.current;
        if (e == null || !pack.key.equals(Favorites.currentPack)) {
            toast("Set FrutiXr as your wallpaper first, then come back here");
            return null;
        }
        return e;
    }

    private void wireActions() {
        action("set", this::setWallpaper);
        action("skip", () -> { poke("skipNonce"); toast("Moving on to the next scene"); });
        action("favsave", () -> {
            Evolver.Entry e = currentScene();
            if (e == null) return;
            try {
                int n = Favorites.add(this, pack.key, e, schema.nfloat);
                if (n < 0) toast("Favourites are full (" + Favorites.MAX + "); clear some first");
                else { toast("Saved “" + e.name + "” (" + n + " favourites)"); poke("favNonce"); updateFavSummary(); }
            } catch (IOException ex) { toast("Could not save the favourite"); }
        });
        action("favclear", () -> confirm("Clear all favourites?", "Every saved scene in " + pack.name + " will be removed.", () -> {
            Favorites.clear(this, pack.key);
            poke("favNonce");
            updateFavSummary();
            toast("Favourites cleared");
        }));
        action("hide", () -> {
            Evolver.Entry e = currentScene();
            if (e == null) return;
            if (e.libIndex < 0 || e.favorite) { toast("Favourites can't be hidden; clear them instead"); return; }
            Set<String> hidden = new HashSet<>(prefs.getStringSet("hidden." + pack.key, new HashSet<String>()));
            hidden.add(String.valueOf(e.libIndex));
            prefs.edit().putStringSet("hidden." + pack.key, hidden).apply();
            poke("skipNonce");
            updateHiddenSummary();
            toast("“" + e.name + "” won't be shown again");
        });
        action("unhide", () -> {
            prefs.edit().remove("hidden." + pack.key).apply();
            updateHiddenSummary();
            toast("Every scene can appear again");
        });
        action("reset", () -> confirm("Reset all settings?", "Every setting goes back to its default. Favourites are kept.", () -> {
            prefs.edit().clear().commit();
            PreferenceManager.setDefaultValues(this, R.xml.prefs, true);
            toast("Settings reset");
            recreate();
        }));
        updateFavSummary();
        updateHiddenSummary();
    }

    private void updateFavSummary() {
        Preference p = findPreference("favsave");
        int n = Favorites.count(this, pack.key, schema.nfloat);
        if (p != null) p.setSummary("Keep the scene on screen now (" + n + " saved)");
    }

    private void updateHiddenSummary() {
        Preference p = findPreference("unhide");
        int n = prefs.getStringSet("hidden." + pack.key, new HashSet<String>()).size();
        if (p != null) p.setSummary(n == 0 ? "No scenes are hidden" : n + (n == 1 ? " scene is" : " scenes are") + " hidden");
    }

    private void confirm(String title, String msg, Runnable yes) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(msg)
            .setPositiveButton(android.R.string.ok, (d, w) -> yes.run())
            .setNegativeButton(android.R.string.cancel, null).show();
    }

    private void setWallpaper() {
        Intent i = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
        i.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, new ComponentName(this, FrutiXrWallpaper.class));
        try {
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            try { startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER)); }
            catch (ActivityNotFoundException e2) { toast("This device has no live wallpaper picker"); }
        }
    }
}
