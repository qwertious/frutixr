#!/usr/bin/env python3
"""Build the FrutiXr live wallpaper APK.

Pure Java + OpenGL ES (no NDK, no Gradle): the shaders, parameter schema and
scene library are exported from the web engine (../js) by export_assets.mjs,
so the wallpaper and the web page render the same scenes.

usage:
  build_apk.py --sdk ANDROID_SDK [--out ../frutixr.apk] [--keystore PATH]

Needs node, a JDK (javac, keytool) and SDK build-tools + a platform. The APK is
signed with a key kept outside the published tree (by default
~/.config/frutixr-android/frutixr.keystore, created on first use).
"""
import argparse
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
PACKAGE = 'org.qwertious.frutixr'
LABEL = 'FrutiXr'
VERSION_CODE, VERSION_NAME = 4, '2.1'
MIN_SDK, TARGET_SDK = 24, 34

MANIFEST = f'''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="{PACKAGE}" android:versionCode="{VERSION_CODE}" android:versionName="{VERSION_NAME}">
  <uses-feature android:name="android.software.live_wallpaper" android:required="true"/>
  <uses-feature android:glEsVersion="0x00020000" android:required="true"/>
  <application android:label="{LABEL}" android:icon="@mipmap/icon" android:allowBackup="false">
    <activity android:name=".SettingsActivity" android:exported="true" android:label="{LABEL}"
        android:theme="@android:style/Theme.DeviceDefault">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
    <service android:name=".FrutiXrWallpaper" android:label="{LABEL}" android:exported="true"
        android:permission="android.permission.BIND_WALLPAPER">
      <intent-filter>
        <action android:name="android.service.wallpaper.WallpaperService"/>
      </intent-filter>
      <meta-data android:name="android.service.wallpaper" android:resource="@xml/wallpaper"/>
    </service>
  </application>
</manifest>
'''

WALLPAPER_XML = f'''<?xml version="1.0" encoding="utf-8"?>
<wallpaper xmlns:android="http://schemas.android.com/apk/res/android"
    android:settingsActivity="{PACKAGE}.SettingsActivity"
    android:thumbnail="@drawable/thumb"
    android:description="@string/description"/>
'''

PREFS_XML = '''<?xml version="1.0" encoding="utf-8"?>
<PreferenceScreen xmlns:android="http://schemas.android.com/apk/res/android">
  <Preference android:key="set" android:title="Set as live wallpaper"
      android:summary="Open the wallpaper picker with FrutiXr selected"/>

  <PreferenceCategory android:key="cat_pack" android:title="Pack">
    <ListPreference android:key="pack" android:title="Pack" android:defaultValue="aero"/>
  </PreferenceCategory>

  <PreferenceCategory android:title="Scenes">
    <Preference android:key="skip" android:title="Next scene now" android:summary="Start evolving into a new scene (or double-tap the wallpaper)"/>
    <CheckBoxPreference android:key="freeze" android:title="Freeze on this scene" android:defaultValue="false"
        android:summary="Keep the current scene; it still moves"/>
    <ListPreference android:key="variety" android:title="Variety" android:summary="%s" android:defaultValue="1"
        android:entries="@array/variety_names" android:entryValues="@array/variety_values"/>
    <CheckBoxPreference android:key="hybrids" android:title="Hybrids" android:defaultValue="true"
        android:summary="Blend two styles into new combinations"/>
    <CheckBoxPreference android:key="mutations" android:title="Mutations" android:defaultValue="true"
        android:summary="Let a scene drift into variations of itself"/>
    <ListPreference android:key="mood" android:title="Mood" android:summary="%s" android:defaultValue="0"
        android:entries="@array/mood_names" android:entryValues="@array/mood_values"/>
  </PreferenceCategory>

  <PreferenceCategory android:title="Favourites and hidden scenes">
    <Preference android:key="favsave" android:title="Save this scene to favourites" android:summary="Keep the scene on screen now"/>
    <ListPreference android:key="favshare" android:title="Show favourites" android:summary="%s" android:defaultValue="0.15"
        android:entries="@array/favshare_names" android:entryValues="@array/favshare_values"/>
    <Preference android:key="favclear" android:title="Clear favourites" android:summary="Remove every saved scene"/>
    <Preference android:key="hide" android:title="Never show this scene" android:summary="Hide the scene on screen now and move on"/>
    <Preference android:key="unhide" android:title="Show hidden scenes again" android:summary="No scenes are hidden"/>
  </PreferenceCategory>

  <PreferenceCategory android:key="cat_schemes" android:title="Colour schemes"/>

  <PreferenceCategory android:title="Colour">
    <ListPreference android:key="saturation" android:title="Saturation" android:summary="%s" android:defaultValue="1"
        android:entries="@array/saturation_names" android:entryValues="@array/saturation_values"/>
    <ListPreference android:key="hueshift" android:title="Hue shift" android:summary="%s" android:defaultValue="0"
        android:entries="@array/hueshift_names" android:entryValues="@array/hueshift_values"/>
    <PreferenceScreen android:key="customs" android:title="Custom colour schemes"
        android:summary="Make up to three palettes of your own">
    <ListPreference android:key="customshare" android:title="How often custom schemes are used" android:summary="%s" android:defaultValue="0.5"
        android:entries="@array/customshare_names" android:entryValues="@array/customshare_values"/>
    <CheckBoxPreference android:key="customworld" android:title="Recolour sky, water and land too" android:defaultValue="true"
        android:summary="Off: only ribbons, glass and light change colour"/>
    <PreferenceCategory android:title="Custom scheme 1 (Sunset)">
      <CheckBoxPreference android:key="custom1.on" android:title="Use this scheme" android:defaultValue="false"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom1.a" android:title="Primary colour"
          android:defaultValue="#FF7A3D" android:dependency="custom1.on"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom1.b" android:title="Secondary colour"
          android:defaultValue="#FF3D8B" android:dependency="custom1.on"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom1.c" android:title="Accent colour"
          android:defaultValue="#FFD166" android:dependency="custom1.on"/>
    </PreferenceCategory>
    <PreferenceCategory android:title="Custom scheme 2 (Mint)">
      <CheckBoxPreference android:key="custom2.on" android:title="Use this scheme" android:defaultValue="false"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom2.a" android:title="Primary colour"
          android:defaultValue="#3DDCB0" android:dependency="custom2.on"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom2.b" android:title="Secondary colour"
          android:defaultValue="#2B8CFF" android:dependency="custom2.on"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom2.c" android:title="Accent colour"
          android:defaultValue="#E0FFF6" android:dependency="custom2.on"/>
    </PreferenceCategory>
    <PreferenceCategory android:title="Custom scheme 3 (Grape)">
      <CheckBoxPreference android:key="custom3.on" android:title="Use this scheme" android:defaultValue="false"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom3.a" android:title="Primary colour"
          android:defaultValue="#8A4DFF" android:dependency="custom3.on"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom3.b" android:title="Secondary colour"
          android:defaultValue="#FF4FD8" android:dependency="custom3.on"/>
      <org.qwertious.frutixr.ColorPreference android:key="custom3.c" android:title="Accent colour"
          android:defaultValue="#4FD8FF" android:dependency="custom3.on"/>
    </PreferenceCategory>
    </PreferenceScreen>
  </PreferenceCategory>

  <PreferenceCategory android:title="Look">
    <ListPreference android:key="brightness" android:title="Brightness" android:summary="%s" android:defaultValue="0"
        android:entries="@array/bright_names" android:entryValues="@array/bright_values"/>
    <ListPreference android:key="contrast" android:title="Contrast" android:summary="%s" android:defaultValue="1"
        android:entries="@array/contrast_names" android:entryValues="@array/contrast_values"/>
    <ListPreference android:key="glow" android:title="Glow and light rays" android:summary="%s" android:defaultValue="1"
        android:entries="@array/glow_names" android:entryValues="@array/glow_values"/>
    <ListPreference android:key="vignette" android:title="Vignette" android:summary="%s" android:defaultValue="1"
        android:entries="@array/vignette_names" android:entryValues="@array/vignette_values"/>
    <ListPreference android:key="grain" android:title="Film grain" android:summary="%s" android:defaultValue="1"
        android:entries="@array/grain_names" android:entryValues="@array/grain_values"/>
    <CheckBoxPreference android:key="overlays" android:title="Overlay effects" android:defaultValue="true"
        android:summary="Dots, bokeh, lines, streaks, sparkles and flares"/>
    <MultiSelectListPreference android:key="overlaytypes" android:title="Which overlay effects"
        android:entries="@array/overlay_names" android:entryValues="@array/overlay_values"
        android:defaultValue="@array/overlay_values" android:dependency="overlays"/>
  </PreferenceCategory>

  <PreferenceCategory android:title="Motion">
    <ListPreference android:key="scenetime" android:title="Time on each scene" android:summary="%s" android:defaultValue="25"
        android:entries="@array/scenetime_names" android:entryValues="@array/scenetime_values"/>
    <ListPreference android:key="transition" android:title="Transition length" android:summary="%s" android:defaultValue="35"
        android:entries="@array/transition_names" android:entryValues="@array/transition_values"/>
    <ListPreference android:key="animspeed" android:title="Animation speed" android:summary="%s" android:defaultValue="1"
        android:entries="@array/animspeed_names" android:entryValues="@array/animspeed_values"/>
    <ListPreference android:key="cammotion" android:title="Camera motion" android:summary="%s" android:defaultValue="1"
        android:entries="@array/cammotion_names" android:entryValues="@array/cammotion_values"/>
    <CheckBoxPreference android:key="parallax" android:title="Follow home screen scrolling" android:defaultValue="true"
        android:summary="The camera turns a little as you swipe between pages"/>
  </PreferenceCategory>

  <PreferenceCategory android:title="Performance">
    <ListPreference android:key="engine" android:title="Renderer" android:summary="%s" android:defaultValue="smooth"
        android:entries="@array/engine_names" android:entryValues="@array/engine_values"/>
    <ListPreference android:key="shader" android:title="Quality" android:summary="%s" android:defaultValue="lite"
        android:entries="@array/shader_names" android:entryValues="@array/shader_values"/>
    <ListPreference android:key="detail" android:title="Render detail" android:summary="%s" android:defaultValue="0.75"
        android:entries="@array/detail_names" android:entryValues="@array/detail_values"/>
    <ListPreference android:key="resolution" android:title="Screen resolution" android:summary="%s" android:defaultValue="0.75"
        android:entries="@array/res_names" android:entryValues="@array/res_values"/>
    <ListPreference android:key="fps" android:title="Frame rate cap" android:summary="%s" android:defaultValue="30"
        android:entries="@array/fps_names" android:entryValues="@array/fps_values"/>
    <CheckBoxPreference android:key="reflections" android:title="Water reflections" android:defaultValue="true"
        android:summary="Smooth renderer: mirror the scene in water and glossy floors"/>
  </PreferenceCategory>

  <PreferenceCategory android:title="Touch">
    <CheckBoxPreference android:key="doubletap" android:title="Double-tap for next scene" android:defaultValue="true"/>
  </PreferenceCategory>

  <PreferenceCategory android:title="Reset">
    <Preference android:key="reset" android:title="Reset all settings" android:summary="Put every setting back to its default (favourites are kept)"/>
  </PreferenceCategory>
</PreferenceScreen>
'''

LISTS = {
    'variety': [('Calm: stays close to the styles', '0'), ('Normal', '1'), ('Wild: more blends and bigger changes', '2')],
    'mood': [('Any', '0'), ('Prefer bright scenes', '1'), ('Prefer dark scenes', '2'), ('Bright scenes only', '3'), ('Dark scenes only', '4')],
    'favshare': [('Never', '0'), ('Sometimes', '0.15'), ('Often', '0.35'), ('Mostly', '0.65'), ('Only favourites', '1')],
    'saturation': [('Muted', '0.6'), ('Soft', '0.85'), ('Normal', '1'), ('Vivid', '1.2'), ('Extra vivid', '1.45')],
    'hueshift': [('Shift -90\u00b0', '-90'), ('Shift -60\u00b0', '-60'), ('Shift -30\u00b0', '-30'), ('None', '0'),
                 ('Shift +30\u00b0', '30'), ('Shift +60\u00b0', '60'), ('Shift +90\u00b0', '90'), ('Opposite colours', '180')],
    'customshare': [('Never', '0'), ('Now and then', '0.2'), ('Half the time', '0.5'), ('Mostly', '0.8'), ('Always', '1')],
    'bright': [('Darker', '-1'), ('Slightly darker', '-0.5'), ('Normal', '0'), ('Slightly brighter', '0.5'), ('Brighter', '1')],
    'contrast': [('Low', '0.85'), ('Normal', '1'), ('High', '1.15'), ('Very high', '1.3')],
    'glow': [('Off', '0'), ('Subtle', '0.5'), ('Normal', '1'), ('Strong', '1.6')],
    'vignette': [('Off', '0'), ('Normal', '1'), ('Strong', '1.8')],
    'grain': [('Off', '0'), ('Normal', '1'), ('Heavy', '2')],
    'overlay': [('Halftone dots', 'dots'), ('Bokeh', 'bokeh'), ('Light lines', 'lines'), ('Speed streaks', 'streak'),
                ('Sparkles', 'spark'), ('Lens flares and bursts', 'flare')],
    'scenetime': [('8 seconds', '8'), ('25 seconds', '25'), ('1 minute', '60'), ('2 minutes', '120'), ('5 minutes', '300'), ('15 minutes', '900')],
    'transition': [('Quick (10 s)', '10'), ('Normal (35 s)', '35'), ('Slow (70 s)', '70'), ('Very slow (2+ min)', '140')],
    'animspeed': [('Very slow', '0.25'), ('Slow', '0.5'), ('Normal', '1'), ('Fast', '1.5'), ('Very fast', '2')],
    'cammotion': [('Still', '0'), ('Gentle', '0.5'), ('Normal', '1'), ('Lively', '2')],
    'engine': [('Smooth (recommended)', 'smooth'), ('Ray traced (exact, needs a strong GPU)', 'ray')],
    'shader': [('Potato (fastest)', 'potato'), ('Standard', 'lite'), ('Full (ray traced only: desktop quality)', 'full')],
    'detail': [('Very low (25%)', '0.25'), ('Low (35%)', '0.35'), ('Medium (50%)', '0.5'), ('High (75%)', '0.75'), ('Full (100%)', '1.0')],
    'res': [('Half (50%)', '0.5'), ('Three quarters (75%)', '0.75'), ('Native (100%)', '1.0')],
    'fps': [('15 fps (battery saver)', '15'), ('24 fps', '24'), ('30 fps', '30'), ('60 fps', '60')],
}


def tool(path):
    for ext in ('', '.exe', '.bat', '.cmd'):
        if os.path.exists(path + ext):
            return path + ext
    sys.exit('missing tool: ' + path)


def run(cmd, **kw):
    print('  ' + ' '.join(os.path.basename(c) if i == 0 else c for i, c in enumerate(cmd))[:300])
    subprocess.run(cmd, check=True, **kw)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def array(name, items):
    return f'  <string-array name="{name}">\n' + ''.join(f'    <item>{escape(i)}</item>\n' for i in items) + '  </string-array>\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sdk', required=True)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(HERE), 'frutixr.apk'))
    ap.add_argument('--keystore', default=os.path.join(os.path.expanduser('~'), '.config', 'frutixr-android', 'frutixr.keystore'))
    ap.add_argument('--scenes', default='100', help='library scenes per style')
    a = ap.parse_args()
    out = os.path.abspath(a.out)

    btools = os.path.join(a.sdk, 'build-tools')
    btools = os.path.join(btools, sorted(os.listdir(btools))[-1])
    aapt2, zipalign, apksigner, d8 = (tool(os.path.join(btools, n)) for n in ('aapt2', 'zipalign', 'apksigner', 'd8'))
    platforms = os.path.join(a.sdk, 'platforms')
    android_jar = os.path.join(platforms, sorted(os.listdir(platforms))[-1], 'android.jar')
    jdk_bin = os.path.dirname(shutil.which('javac') or sys.exit('javac not found'))
    javac, keytool = tool(os.path.join(jdk_bin, 'javac')), tool(os.path.join(jdk_bin, 'keytool'))

    work = tempfile.mkdtemp(prefix='frutixr-')
    try:
        print('exporting engine assets')
        assets = os.path.join(work, 'assets')
        run(['node', os.path.join(HERE, 'export_assets.mjs'), assets, a.scenes])

        print('resources')
        res = os.path.join(work, 'res')
        values = '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        values += f'  <string name="description">{escape("Endlessly evolving wallpapers from content packs. First pack: Frutiger Aero (glass ribbons, bubbles, crystal, light and water).")}</string>\n'
        for k, items in LISTS.items():
            values += array(k + '_names', [n for n, _ in items]) + array(k + '_values', [v for _, v in items])
        values += '</resources>\n'
        write(os.path.join(res, 'values', 'strings.xml'), values)
        write(os.path.join(res, 'xml', 'prefs.xml'), PREFS_XML)
        write(os.path.join(res, 'xml', 'wallpaper.xml'), WALLPAPER_XML)
        os.makedirs(os.path.join(res, 'mipmap-xxxhdpi'))
        shutil.copy(os.path.join(HERE, 'icon.png'), os.path.join(res, 'mipmap-xxxhdpi', 'icon.png'))
        os.makedirs(os.path.join(res, 'drawable-nodpi'))
        shutil.copy(os.path.join(HERE, 'thumb.png'), os.path.join(res, 'drawable-nodpi', 'thumb.png'))
        manifest = os.path.join(work, 'AndroidManifest.xml')
        write(manifest, MANIFEST)
        flat = os.path.join(work, 'res.zip')
        run([aapt2, 'compile', '--dir', res, '-o', flat])
        gen = os.path.join(work, 'gen')
        unsigned = os.path.join(work, 'unsigned.apk')
        run([aapt2, 'link', '-o', unsigned, '-I', android_jar, '--manifest', manifest, '-A', assets, '--java', gen,
             '--min-sdk-version', str(MIN_SDK), '--target-sdk-version', str(TARGET_SDK), flat])

        print('compiling')
        classes = os.path.join(work, 'classes')
        os.makedirs(classes)
        srcs = glob.glob(os.path.join(HERE, 'src', '**', '*.java'), recursive=True) + glob.glob(os.path.join(gen, '**', '*.java'), recursive=True)
        # Java 8 platform stubs come from the JDK (android.jar's lack the lambda bootstrap);
        # android.* comes from the classpath. d8 desugars the lambdas for Android.
        run([javac, '--release', '8', '-classpath', android_jar, '-encoding', 'UTF-8', '-d', classes] + srcs)
        dex = os.path.join(work, 'dex')
        os.makedirs(dex)
        run([d8, '--release', '--min-api', str(MIN_SDK), '--lib', android_jar, '--output', dex]
            + glob.glob(os.path.join(classes, '**', '*.class'), recursive=True))

        print('packaging')
        with zipfile.ZipFile(unsigned, 'a', zipfile.ZIP_DEFLATED) as z:
            z.write(os.path.join(dex, 'classes.dex'), 'classes.dex')
        aligned = os.path.join(work, 'aligned.apk')
        run([zipalign, '-p', '-f', '4', unsigned, aligned])

        print('signing')
        if not os.path.exists(a.keystore):
            os.makedirs(os.path.dirname(a.keystore), exist_ok=True)
            run([keytool, '-genkeypair', '-keystore', a.keystore, '-alias', 'frutixr', '-keyalg', 'RSA',
                 '-keysize', '2048', '-validity', '10000', '-storepass', 'frutixr', '-keypass', 'frutixr',
                 '-dname', 'CN=FrutiXr'])
        run([apksigner, 'sign', '--ks', a.keystore, '--ks-key-alias', 'frutixr', '--ks-pass', 'pass:frutixr',
             '--key-pass', 'pass:frutixr', '--out', out, aligned])
        run([apksigner, 'verify', '--print-certs', out])
        print('wrote', out, os.path.getsize(out), 'bytes')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
