export type Mode = 'guided' | 'measure';
export type Phase = 'wet' | 'soap' | 'rinse' | 'coldReady' | 'cold';
export interface Settings {
  theme: 'dark' | 'light'; mode: Mode; wet: number; rinse: number;
  wetWarning: number; rinseWarning: number; sound: boolean;
  signal: 'gentle' | 'strong'; vibration: boolean;
  coldEnabled: boolean; coldMode: 'measure' | 'random'; coldMin: number; coldMax: number;
}
export interface Session {
  id: string; startedAt: number; mode: Mode; complete: boolean;
  durations: Record<'wet' | 'soap' | 'rinse' | 'cold', number>;
  coldTarget: number | null;
}
export interface Run {
  settings: Settings; phase: Phase; startedAt: number; phaseStartedAt: number;
  pausedAt: number | null; durations: Session['durations']; coldTarget: number | null;
  wetNeedsConfirmation: boolean;
}
export const defaults: Settings = {
  theme: 'dark', mode: 'guided', wet: 120, rinse: 120, wetWarning: 30, rinseWarning: 30,
  sound: true, signal: 'strong', vibration: false, coldEnabled: false, coldMode: 'measure', coldMin: 30, coldMax: 90
};
export function normalizeSettings(value: unknown): Settings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Settings>;
  const seconds = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  const wet = seconds(v.wet, 120, 1, 3600), rinse = seconds(v.rinse, 120, 1, 3600);
  const coldMin = seconds(v.coldMin, 30, 1, 3600);
  return {
    theme: v.theme === 'light' ? 'light' : 'dark', mode: v.mode === 'measure' ? 'measure' : 'guided',
    wet, rinse, wetWarning: seconds(v.wetWarning, 30, 0, wet - 1), rinseWarning: seconds(v.rinseWarning, 30, 0, rinse - 1),
    sound: v.sound !== false, coldEnabled: v.coldEnabled === true,
    signal: v.signal === 'gentle' ? 'gentle' : 'strong', vibration: v.vibration === true,
    coldMode: v.coldMode === 'random' ? 'random' : 'measure', coldMin,
    coldMax: Math.max(coldMin, seconds(v.coldMax, 90, 1, 3600))
  };
}
export function randomDuration(min: number, max: number, random = Math.random): number {
  return min + Math.min(max - min, Math.floor(random() * (max - min + 1)));
}
export function startRun(settings: Settings, now: number): Run {
  const snapshot = normalizeSettings(settings);
  return { settings: snapshot, phase: 'wet', startedAt: now, phaseStartedAt: now, pausedAt: null,
    durations: { wet: 0, soap: 0, rinse: 0, cold: 0 }, wetNeedsConfirmation: false,
    coldTarget: snapshot.coldEnabled && snapshot.coldMode === 'random' ? randomDuration(snapshot.coldMin, snapshot.coldMax) : null };
}
export function elapsed(run: Run, now: number): number {
  return Math.max(0, ((run.pausedAt ?? now) - run.phaseStartedAt) / 1000);
}
export function togglePause(run: Run, now: number): Run {
  return run.pausedAt === null ? { ...run, pausedAt: now } : { ...run, phaseStartedAt: run.phaseStartedAt + now - run.pausedAt, pausedAt: null };
}
export function phaseLimit(run: Run): number | null {
  if (run.phase === 'cold') return run.coldTarget;
  if (run.settings.mode === 'guided' && (run.phase === 'wet' || run.phase === 'rinse')) return run.settings[run.phase];
  return null;
}
export function advance(run: Run, now: number): Run | null {
  const next: Record<Phase, Phase | null> = { wet: 'soap', soap: 'rinse', rinse: run.settings.coldEnabled ? 'coldReady' : null, coldReady: 'cold', cold: null };
  const phase = next[run.phase];
  if (!phase) return null;
  return { ...run, phase, phaseStartedAt: now, pausedAt: null, durations: recordPhase(run, now), wetNeedsConfirmation: false };
}
/** Automatic wet-to-soap transition; the water stop can still be corrected during soaping. */
export function wetDeadline(run: Run): Run {
  if (run.phase !== 'wet' || run.settings.mode !== 'guided') return run;
  return { ...advance(run, run.phaseStartedAt + run.settings.wet * 1000)!, wetNeedsConfirmation: true };
}
/** Reattribute active soap time to water, or cap rinse at its target after a late tap. */
export function confirmWaterStop(run: Run, now: number, when: 'onTime' | 'now'): Run {
  if (run.phase === 'soap' && run.wetNeedsConfirmation) {
    if (when === 'onTime') return { ...run, wetNeedsConfirmation: false };
    return { ...run, durations: { ...run.durations, wet: run.durations.wet + elapsed(run, now) },
      phaseStartedAt: now, pausedAt: run.pausedAt === null ? null : now, wetNeedsConfirmation: false };
  }
  if (run.phase === 'rinse' && run.settings.mode === 'guided' && when === 'onTime') {
    const duration = Math.min(elapsed(run, now), run.settings.rinse);
    // This snapshot is immediately advanced or finished by the caller, excluding the late tap.
    return { ...run, phaseStartedAt: now - duration * 1000, pausedAt: now };
  }
  return run;
}
function recordPhase(run: Run, now: number): Session['durations'] {
  return run.phase === 'coldReady' ? run.durations : { ...run.durations, [run.phase]: run.durations[run.phase] + elapsed(run, now) };
}
export function finish(run: Run, now: number, complete: boolean): Session {
  return { id: crypto.randomUUID(), startedAt: run.startedAt, mode: run.settings.mode, complete,
    durations: recordPhase(run, now), coldTarget: run.coldTarget };
}
export function total(session: Session): number { return Object.values(session.durations).reduce((a, b) => a + b, 0); }
export function formatTime(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
