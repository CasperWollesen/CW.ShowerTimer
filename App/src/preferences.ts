import type { Settings } from './domain';

export function settingsError(draft: Settings): string {
  if (draft.wet < 1 || draft.rinse < 1 || draft.wet > 3600 || draft.rinse > 3600) return 'Choose a duration between 1 second and 60 minutes.';
  if (draft.wetWarning >= draft.wet || draft.rinseWarning >= draft.rinse) return 'Each warning must be shorter than its phase. Use 0 to turn it off.';
  if (draft.coldMin < 1 || draft.coldMax < draft.coldMin || draft.coldMax > 3600) return 'Cold range: minimum 1 second, maximum 60 minutes, and max must be at least min.';
  return '';
}
export function settingsChanged(saved: Settings, draft: Settings | null): boolean {
  return draft !== null && (Object.keys(saved) as Array<keyof Settings>).some(key => saved[key] !== draft[key]);
}
/** Keep an existing off-grid setting until the owner explicitly changes it. */
export function pickerValues(max: number, step: number, current: number): number[] {
  const values = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  if (current >= 0 && current <= max && !values.includes(current)) values.push(current);
  return values.sort((a, b) => a - b);
}
