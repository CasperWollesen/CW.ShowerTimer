import { describe, expect, it } from 'vitest';
import { defaults } from './domain';
import { pickerValues, settingsChanged, settingsError } from './preferences';

describe('preference changes', () => {
  it('does not warn for opening settings or undoing an edit', () => {
    expect(settingsChanged(defaults, null)).toBe(false);
    expect(settingsChanged(defaults, { ...defaults })).toBe(false);
    expect(settingsChanged(defaults, { ...defaults, wet: 125 })).toBe(true);
    expect(settingsChanged(defaults, { ...defaults, theme: 'light' })).toBe(true);
    expect(settingsChanged(defaults, { ...defaults, signal: 'gentle' })).toBe(true);
  });
  it('validates both direct saving and the leave-settings save action', () => {
    expect(settingsError(defaults)).toBe('');
    expect(settingsError({ ...defaults, wet: 0 })).not.toBe('');
    expect(settingsError({ ...defaults, wetWarning: 120 })).not.toBe('');
    expect(settingsError({ ...defaults, coldMin: 100, coldMax: 90 })).not.toBe('');
  });
});
describe('native time picker options', () => {
  it('offers seconds in five-second steps', () => {
    expect(pickerValues(59, 5, 0)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    expect(pickerValues(9, 5, 0)).toEqual([0, 5]);
  });
  it('preserves existing precise values until explicitly changed', () => {
    expect(pickerValues(59, 5, 12)).toContain(12);
    expect(pickerValues(59, 5, 12)).toHaveLength(13);
    expect(pickerValues(0, 5, 0)).toEqual([0]);
  });
});
