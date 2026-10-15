# Shower Timer · first version

Phone-first, English, minimal home screen. Preferences, history and diagnostics in a menu.

## Compact layout, version 0.2.1
- Home omits the everyday-reset eyebrow, introductory paragraph, mode description and privacy footer.
- Heading and drop illustration stay beside one another in a compact row on mobile and desktop.
- Settings order: Guided shower, Cold finish, Appearance, Sound & vibration, Save, Share.

## Behavior
- Guided: timed wet → unlimited soap → timed rinse. Wet advances at its target; rinse waits for confirmation.
- Measure: stopwatch per phase with manual transitions.
- Independent durations/warnings; warning 0 means off. One warning beep, three at the end.
- During soap, confirm an on-time water stop or move elapsed soap time back to wet if water
  stopped just now. Moving on without a correction assumes an on-time wet stop.
- Rinse counts overtime until “Stopped just now” or “Stopped on time”. A forgotten final tap
  is excluded from the saved duration when on-time is selected. Pauses are always excluded.
- Stronger/longer beeps by default, optional gentle tone, preview and device media-volume guidance.
- Optional vibration and a diagnostic. Browser support is detected, not assumed from device type;
  iPhone/Safari does not support timer vibration. Requests may be accepted without hardware feedback.
- Expandable Share section under Settings: locally generated QR, public URL, copy and native share.
- Optional cold finish, measured or random. Target is selected once before the shower.
- Cold preparation is untimed and excluded from totals. Explicit tap starts cold water.
- Random cold exposes no timing or progress and has no warning. Target appears afterwards.
- Pause, stop early, finish early, skip cold. Stops are marked and excluded from aggregate totals.
- End shower also offers Discard shower: return home without adding history or changing preferences.
- Dark default, light option. Local history, sums, averages, cold totals, weekly chart.
- Undo single deletions; confirm clearing all history.
- Screen Wake Lock during a shower or test. Status, retry, sound and wake diagnostics.
- Offline cache; updates offered outside active showers.

## Decisions
- React/TypeScript/Vite under App/ follows SnackTrainer.
- lucide-react icons; CSS drop illustration; local PNG install icons.
- vite-plugin-pwa handles manifest/offline/update prompt. Web Audio synthesizes beeps.
- localStorage for preferences/history. Clearing site data removes both.
- Session lives in memory; reload/termination ends it. beforeunload requests a leave prompt.
- Timestamp calculations catch up on return. Beeps may be missed in the background.
- No backend, tracking, cloud, remote runtime assets or account.
- QR encoder/component and independent decoder tests reuse the existing SnackTrainer code.
  No dependency added. Sharing always uses https://casperwollesen.github.io/CW.ShowerTimer/.
- Version 0.2.0 adds normalized preferences for signal strength and vibration, preserving old history.

## Validation
- Unit tests: timestamps, pauses, transitions, preparation exclusion, random bounds,
  settings snapshots, stopped sessions and malformed settings.
- Desktop browser: actual flows, both themes, responsive layout.
- Real iPhone/Android sound, wake lock, installation and power-saving remain device checks.
- Initial delivery is local only. Pages workflow prepared; no deployment performed.

## Desktop verification, 2026-10-15
- Typecheck, production build and all 10 unit tests passed.
- Guided 6-second water phases advanced automatically; cold surprise (8–10 seconds)
  exposed no timing, then finished and saved actual/target durations correctly.
- Manual measurement, pause/resume, cold preparation, measured cold and stopping early checked.
- History totals exclude stopped entries; deletion/Undo and persistence after reload checked.
- Both themes inspected. Layout checked at 320, 390 and 1440 pixels; narrow overflow corrected.
- Audio test reported playback; Wake Lock reported On in the desktop browser. No browser errors.
- Production HTML, manifest, service worker and icon returned HTTP 200 under the Pages base path.
- Test entries removed and default preferences restored for the handoff.
- Offline cache generation is verified by the build; disconnected reload and real phone behavior
  have not yet been verified.

## Discard and first publication
- End shower → Discard shower returns home without adding history or changing preferences.
- Browser-checked with an empty history: discarded run left zero entries and zero totals.
- Typecheck, all 10 unit tests and production build passed after the change.
- Owner authorized commit/push and mobile testing; initial local-only restriction is lifted.

## Version 0.2.0 verification
- All 26 automated tests pass: late water-stop attribution, paused corrections, actual/on-time
  rinse durations, public QR URL round-trip/error correction, longer/louder tones and vibration fallback.
- Desktop browser checked both rinse choices: on-time saved the target after overtime;
  just-now saved actual elapsed time. Wet correction reset soap and preserved total active time.
- QR shown locally with public Pages URL. Sound preview and vibration request diagnostic checked.
- These checks do not verify physical phone loudness, vibration hardware or camera QR scanning.
