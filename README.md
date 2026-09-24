# ScholarFlow: Android

Offline class companion: attendance, planner, calendar, syllabus. Everything is stored **on the phone**. There is no server and no account.

Converted from a Next.js + PostgreSQL app into **Vite + React + Capacitor**. The original API routes now run on-device (`src/db/`), so all existing screens work unchanged.

## Get the APK (no Android Studio needed)

1. Create a GitHub repo and push this folder to `main`.
2. Open the **Actions** tab → **Build Android APK** → it runs automatically on push (or click *Run workflow*).
3. When it finishes, open the run and download the **`scholarflow-debug-apk`** artifact. Unzip it, and copy `app-debug.apk` to your phone.
4. On the phone, allow *Install unknown apps* for your file manager/browser, then open the APK.

The debug APK is fully functional. It is signed with Android's debug key, which is fine for personal use but **not accepted by Play Store**.

### Signed release APK (optional)

Generate a keystore once (keep it, and back it up. Losing it means you can't update the app):

```bash
keytool -genkeypair -v -keystore release.keystore -alias scholarflow \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # macOS: base64 -i release.keystore
```

Add these four **Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | output of the `base64` command above |
| `KEYSTORE_PASSWORD` | the keystore password |
| `KEY_ALIAS` | `scholarflow` (or what you chose) |
| `KEY_PASSWORD` | the key password |

With those present, the workflow also uploads `scholarflow-release-apk`. Without them it simply skips that step.

## Local development

```bash
npm install
npm run dev          # browser, hot reload, uses IndexedDB
npm test             # 130 tests: data engine + backup/restore
npm run build        # typecheck + production bundle
npx cap sync android # copy bundle into the Android project
npx cap open android # open in Android Studio (optional)
```

## Your data

- Stored in the WebView's IndexedDB (with a localStorage mirror).
- **Uninstalling the app deletes it.** Use **Home → avatar (S) → Backup & Data → Export backup** regularly and keep the file somewhere off the phone (Drive, email to yourself).
- Restore validates the entire file first. A corrupt or wrong file is rejected and your current data is left untouched.
- **Clear all data** removes the bundled sample courses so you can enter your own.

## Reminders

Tasks schedule a real Android notification at **9:00 AM, `remindDaysBefore` days before the due date**. The app requests notification permission the first time. Reminders are re-synced whenever data changes.

## Known limits

- No cross-device sync (by design; use Export/Restore to move data between phones).
- Exact-alarm scheduling on Android 12+ depends on the OS granting `SCHEDULE_EXACT_ALARM`; if a user revokes it, reminders may arrive a few minutes late.
- Notification delivery and the share sheet were verified against plugin source and in a browser, **not yet on a physical device**. Test both on first install.

## Layout

```
src/db/store.ts     on-device tables, atomic transactions, persistence
src/db/router.ts    port of every /api/* route
src/db/backup.ts    export / validated restore / clear
src/db/seed.ts      sample data (first launch only)
src/lib/native.ts   status bar, splash
src/lib/reminders.ts notification scheduling
android/            generated native project (Capacitor)
```
