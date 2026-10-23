package org.qwertious.frutixr;

import android.content.Context;
import android.content.res.TypedArray;
import android.graphics.Color;
import android.preference.DialogPreference;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

/** A colour setting: a dialog with hue, saturation and lightness sliders and a live preview. */
@SuppressWarnings("deprecation") // framework preferences: no support library needed
public class ColorPreference extends DialogPreference {
    private int value = 0xFF3FA9F5, pending;

    public ColorPreference(Context c, AttributeSet a) {
        super(c, a);
        setPositiveButtonText(android.R.string.ok);
        setNegativeButtonText(android.R.string.cancel);
    }

    @Override
    protected Object onGetDefaultValue(TypedArray a, int index) {
        String s = a.getString(index);
        try { return s == null ? value : Color.parseColor(s); } catch (IllegalArgumentException e) { return value; }
    }

    @Override
    protected void onSetInitialValue(boolean restore, Object def) {
        value = restore ? getPersistedInt(value) : (Integer) def;
        if (!restore) persistInt(value);
        updateSummary();
    }

    private void updateSummary() {
        // a coloured block, then the hex code
        SpannableString s = new SpannableString("███  " + String.format("#%06X", value & 0xFFFFFF));
        s.setSpan(new ForegroundColorSpan(value | 0xFF000000), 0, 3, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        setSummary(s);
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getContext().getResources().getDisplayMetrics());
    }

    @Override
    protected View onCreateDialogView() {
        Context c = getContext();
        LinearLayout box = new LinearLayout(c);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(16), dp(24), dp(8));
        final View preview = new View(c);
        box.addView(preview, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(72)));
        final TextView hex = new TextView(c);
        hex.setPadding(0, dp(6), 0, dp(10));
        box.addView(hex);
        pending = value;
        float[] hsl = Palette.hslOf(value);
        final int[] h = {Math.round(hsl[0]) % 360, Math.round(hsl[1] * 100), Math.round(hsl[2] * 100)};
        final Runnable refresh = () -> {
            float[] rgb = Colour.hslToSrgb(h[0], h[1] / 100f, h[2] / 100f);
            pending = Color.rgb(Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255));
            preview.setBackgroundColor(pending);
            hex.setText(String.format("#%06X", pending & 0xFFFFFF));
        };
        String[] labels = {"Hue", "Saturation", "Lightness"};
        int[] max = {359, 100, 100};
        for (int i = 0; i < 3; i++) {
            final int k = i;
            TextView label = new TextView(c);
            label.setText(labels[i]);
            box.addView(label);
            SeekBar bar = new SeekBar(c);
            bar.setMax(max[i]);
            bar.setProgress(h[i]);
            bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override public void onProgressChanged(SeekBar s, int p, boolean user) { h[k] = p; refresh.run(); }
                @Override public void onStartTrackingTouch(SeekBar s) { }
                @Override public void onStopTrackingTouch(SeekBar s) { }
            });
            box.addView(bar, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(40)));
        }
        refresh.run();
        return box;
    }

    @Override
    protected void onDialogClosed(boolean positive) {
        if (positive && callChangeListener(pending)) {
            value = pending;
            persistInt(value);
            updateSummary();
            notifyChanged();
        }
    }
}
