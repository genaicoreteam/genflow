# GenFlow Android shell

A one-screen WebView app that loads the live GenFlow website fullscreen.
Because it only loads the URL, every Vercel deploy updates the app instantly.

## Build steps
1. Open **this `android/` folder** in Android Studio (it syncs Gradle automatically).
2. In `app/src/main/java/com/genflow/app/MainActivity.kt`, replace
   `https://your-genflow.vercel.app` with your deployed URL.
3. Test: press ▶ Run with an emulator or USB-connected phone.
4. Release: **Build → Generate Signed Bundle / APK → APK** — create a keystore
   the first time (keep the file + password safe; you need the same one for
   every future update) and choose the *release* variant.
5. Copy `app/build/outputs/apk/release/app-release.apk` into the website's
   `public/` folder as **`genflow.apk`** and redeploy — the "Download App"
   button then serves it.

Mic permissions are pre-wired so RecordUs live recording works inside the app.
