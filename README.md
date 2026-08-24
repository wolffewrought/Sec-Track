# Sec-Track Android shell

A ~200-line WebView wrapper replacing the TWA. Same page, same offline
behaviour, same icon slot - plus the three things a page cannot do
alone: a folder chosen once (the OS remembers the grant), native writes
to Downloads (a blob link inside a WebView is a dead end), and a working
restore button (`onShowFileChooser` carried by hand).

**Screenshots work** - there is no FLAG_SECURE in this wrapper, on
purpose.

## What the page sees

`window.AndroidSaver` with `hasFolder()`, `folderName()`, `pickFolder()`,
`saveFile(name, base64)`, `saveToDownloads(name, base64)`; results come
back via `app.folderPicked(ok, name)` and `app.fileSaved(name, ok)`.
index.html `sat-v159`+ detects all of this and behaves identically in a
plain browser without it.

## Building on GitHub (no Android Studio)

1. Commit this `android-shell/` folder to the repo, and put
   `shell.yml` in `.github/workflows/`.
2. Add four repository secrets so the APK is signed with the SAME key
   as the old wrapper and installs over it as an update:
   - `KEYSTORE_BASE64` - the keystore file, base64:
     `base64 -w0 your.keystore` (on the phone/Termux or any machine)
   - `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
3. Actions -> "shell apk" -> Run workflow. Download the APK from the
   run's artifacts and install it.

Without the secrets the workflow still builds a **debug** APK - good
for trying the shell, but a debug key can never update over the signed
app, so it installs alongside instead.

Check `BASE_URL` at the top of `MainActivity.java` points at your
published page. Export a backup before switching wrappers regardless:
app data does not migrate between them, and the app's own backup and
restore covers the move.

Known limits, stated plainly: `navigator.share` does not exist inside a
WebView, so *Ask each time* falls back to Downloads with a toast;
`minSdk 29` (Android 10) keeps the Downloads code honest. I cannot run
Gradle or an Android SDK in my environment, so this project is written
conservatively against documented APIs - the workflow's first run is
its first compile, and any error it prints is the next thing to fix.
