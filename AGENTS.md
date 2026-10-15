# CW.ShowerTimer

Personal, offline-first shower PWA. Everything shipped lives in `App/`.
React + TypeScript + Vite. Static GitHub Pages, no backend, accounts,
analytics, remote fonts or runtime network dependencies.

- English UI, code and comments. Respond to the owner in Danish.
- Dark theme by default; light is a saved preference.
- Keep the home screen minimal. Extra preferences, history and diagnostics belong in the menu.
- `src/domain.ts` holds pure session timing. Use timestamps, not tick counters.
- `src/storage.ts` owns persistence. History is device-local and disposable.
- Freeze settings for a shower. Paused time and cold preparation do not count.
- Choose the cold surprise before the shower. Never reveal countdown, progress, target or elapsed
  time while the surprise is active. No warning beep during a surprise.
- Cold always needs its own Start tap after the water is cold.
- Support reduced motion, keyboard navigation, accessible labels and safe areas.
- Updates must not interrupt a shower. Never promise alarms while locked/backgrounded.
- Before finishing: `cd App`, `npm run typecheck`, `npm test`, `npm run build`.
- Desktop checks do not verify phone sound or wake lock. Test those on real phones.
- Do not push or deploy while the task is local-only.

See README.md and `AI Documentation/Plan.md` for behavior and startup.
