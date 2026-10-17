# Shower Timer 🚿

A little everyday reset. English, phone-first and completely local.

## Run locally

Requires Node.js 22.12+ or a current supported version.

```powershell
cd C:\Development\GitHub\CW.ShowerTimer\App
npm install
npm run dev
```

Open http://127.0.0.1:5173/CW.ShowerTimer/ on your PC.

```powershell
npm run typecheck
npm test
npm run build
npm exec vite preview -- --host 127.0.0.1 --port 4173
```

The production preview at http://127.0.0.1:4173/CW.ShowerTimer/ includes the service worker.
The development server intentionally does not register one.

## Features

- **Guide me:** timed wet → unlimited soap → timed rinse. Timings and warnings are independent.
- **Accurate water stops:** during soap, choose “Water off just now” if you kept the first
  water phase running after the beep. That time moves from soap back to Get wet.
  Rinse keeps counting past its target until you choose “Stopped just now” (include overtime)
  or “Stopped on time” (ignore the forgotten final tap).
- **Just measure:** tap to move through each phase, without targets.
- **Cold finish:** optional stopwatch or hidden random duration within your range. Start when
  the water is cold. A surprise has no countdown, progress indicator or warning beep.
  In Just measure the cold step asks again: **Just count** or **Surprise me** (your saved choice
  is preselected). The surprise duration is still drawn before the shower starts.
- **Phase scenes:** each phase fills the screen with its own colour — blue wet, pink soap,
  green rinse, bright frost for cold — plus a large phase badge when it begins. A lane below
  the timer fills like a progress bar in timed phases; elsewhere emojis drift across it
  (bubbles, drops, polar bears and ice cubes). Cold surprise lanes loop at irregular speeds and
  never reflect elapsed time. Animations pause with the shower and respect reduced motion.
- **Undo:** for 8 seconds after tapping to the next phase or finishing, Undo returns you to the
  previous phase. Time since the tap counts towards it, pauses stay excluded, and an undone
  finish is removed from history again.
- **Fits small phones:** home, every shower state and the result fit a 375×629 iPhone 13 mini
  Safari viewport without scrolling; the timer ring shrinks to the remaining height.
- **Sound:** one warning beep, three at the end. Louder, longer tones by default, with a gentle
  option and a preview in Settings. The phone's media volume still determines actual loudness.
- **Vibration:** optional warning/end patterns and a hardware test. Supported Android browsers
  can vibrate; iPhone/Safari does not support timed PWA vibration. An accepted request alone
  does not prove the device has a vibration motor or that its settings allow it.
- **Share:** expand Share Shower Timer in Settings for a local QR code, Copy link and native
  sharing where supported. It always shares the public Pages URL, never local history/preferences.
- **Screen awake:** automatically requested during a shower, with a test in the menu. The shower
  screen only shows a retry line when it could not be kept awake.
- **History:** phase times, sums, averages, cold time and a weekly chart. Completed showers
  count towards totals. Pauses and cold preparation do not count.
- **Themes:** dark default, light in Settings.
- **Time pickers:** native minute/second selectors with 5-second steps, including warning times.
  Existing more precise values are preserved until changed. Mobile presentation follows the OS/browser.
- **Unsaved settings:** closing Settings or returning to the menu offers Save, Discard or Keep editing.
  Invalid preferences cannot be saved from either route. Where supported, leaving/reloading the page
  also triggers the browser's own unsaved-work warning.
- **Sound selection:** each tone has its own 1-beep/3-beep tests without changing the selection.
  The louder tone has a deeper pitch. A new sample replaces any sample still playing.
- **Discard:** choose End shower → Discard shower to leave a test run without saving history.

Settings and history live in localStorage. No backend, account, sync, tracking or remote
runtime assets. Clearing site data removes everything. Production works offline after
the first load installs its service worker. An active shower lives in memory and does
not survive a reload or app termination.

Keep the app visible and the screen on. Wake lock requires HTTPS or localhost and can be
refused by power-saving settings. iPhone Home Screen apps need iOS 18.4+ for wake lock.
Locking the screen or switching apps can delay or suppress beeps. Test on actual phones.

## Structure

```text
App/                       Source, assets and build configuration
  src/domain.ts            Session timing and settings
  src/storage.ts           Local persistence
  src/audio.ts             Synthesized beeps
  src/App.tsx              Home, shower, history, settings and diagnostics
  src/styles.css           Themes and responsive layouts
.github/workflows/         Prepared GitHub Pages deployment
AI Documentation/Plan.md   Behavior and decisions
```

## GitHub Pages (later)

In repository Settings → Pages → Source choose **GitHub Actions**. The workflow builds
`App/` and deploys `App/dist` on a push to `main` or manual dispatch. The base path and
PWA scope follow the repository name. No deployment was performed for the local preview.
Default base: `/CW.ShowerTimer/`. Override with the `BASE_PATH` environment variable.

PNG icons are committed. Regenerate on Windows with:

```powershell
powershell -ExecutionPolicy Bypass -File App/scripts/generate-icons.ps1
```
