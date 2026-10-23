# FrutiXr

A generative Frutiger Aero wallpaper engine. Scenes are built from a "genome"
that slowly evolves, so one scene morphs into the next and the wallpaper never
repeats.

Runs in two places from one engine:

| Where | Files |
|---|---|
| Browser (WebGL2) | `index.html`, `js/` |
| Android live wallpaper | `android/` |

Two renderers: **Smooth** (default) rasterizes every shape from the same
formulas the raymarcher uses, and is 10-50x cheaper; **Ray traced** streams
raymarched keyframes and crossfades between them.

## Running it

Serve the folder with any static server and open `index.html`, for example:

```bash
python3 -m http.server 8748
```

## Building the Android wallpaper

```bash
python3 android/build_apk.py --sdk ANDROID_SDK [--out frutixr.apk] [--keystore PATH]
```

Needs Node, a JDK 17 (`javac`, `keytool`) and Android SDK build-tools plus a
platform. Pure Java and OpenGL ES, no Gradle or NDK. `android/export_assets.mjs`
exports the shaders, parameter schema and scene library from the web engine,
so the wallpaper and the page render the same scenes. The APK is signed with
a key kept outside the repository (by default
`~/.config/frutixr-android/frutixr.keystore`, created on first use).

## License

Copyright (C) 2026 Qwertious

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
A PARTICULAR PURPOSE. See [LICENSE](LICENSE) for the full text.

In short: use it, change it and share it freely, commercially or not. If you
share it or a modified version, keep this credit, say what you changed, and
release your version under the GPL too, with its source code.
