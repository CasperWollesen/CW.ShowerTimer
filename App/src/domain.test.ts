import { describe, expect, it } from 'vitest';
import { advance, defaults, elapsed, finish, normalizeSettings, phaseLimit, randomDuration, startRun, togglePause, total } from './domain';

describe('shower timing', () => {
  it('uses timestamps so delayed ticks do not slow the clock', () => {
    const run = startRun(defaults, 1000);
    expect(elapsed(run, 121000)).toBe(120); expect(phaseLimit(run)).toBe(120);
  });
  it('excludes paused time across multiple pauses', () => {
    let run = startRun(defaults, 1000);
    run = togglePause(run, 11000); expect(elapsed(run, 90000)).toBe(10);
    run = togglePause(run, 91000); run = togglePause(run, 101000);
    run = togglePause(run, 201000); expect(elapsed(run, 211000)).toBe(30);
  });
  it('has unlimited soap and excludes preparation for cold water', () => {
    let run = startRun({ ...defaults, coldEnabled: true }, 0);
    run = advance(run, 120000)!; expect(run.phase).toBe('soap'); expect(phaseLimit(run)).toBeNull();
    run = advance(run, 300000)!; run = advance(run, 420000)!; expect(run.phase).toBe('coldReady');
    run = advance(run, 480000)!; expect(run.phase).toBe('cold');
    expect(run.durations).toEqual({ wet: 120, soap: 180, rinse: 120, cold: 0 });
    const session = finish(run, 510000, true);
    expect(total(session)).toBe(450); expect(session.durations.cold).toBe(30);
  });
  it('supports open ended measurement in both water phases', () => {
    let run = startRun({ ...defaults, mode: 'measure' }, 0); expect(phaseLimit(run)).toBeNull();
    run = advance(run, 90000)!; run = advance(run, 140000)!;
    expect(run.phase).toBe('rinse'); expect(phaseLimit(run)).toBeNull();
    expect(advance(run, 200000)).toBeNull(); expect(total(finish(run, 200000, true))).toBe(200);
  });
  it('freezes preferences for a running shower', () => {
    const settings = { ...defaults }; const run = startRun(settings, 0);
    settings.wet = 12; expect(phaseLimit(run)).toBe(120);
  });
  it('saves stopped showers without marking them complete', () => {
    const run = togglePause(startRun(defaults, 0), 10000); const session = finish(run, 60000, false);
    expect(session.complete).toBe(false); expect(total(session)).toBe(10);
  });
});
describe('cold surprise', () => {
  it('includes both endpoints and supports an exact range', () => {
    expect(randomDuration(30, 90, () => 0)).toBe(30);
    expect(randomDuration(30, 90, () => 0.999999)).toBe(90);
    expect(randomDuration(30, 30, () => 0.5)).toBe(30);
  });
  it('chooses the target before showering and keeps it across phases', () => {
    let run = startRun({ ...defaults, coldEnabled: true, coldMode: 'random', coldMin: 12, coldMax: 12 }, 0);
    expect(run.coldTarget).toBe(12); run = advance(run, 1000)!; run = advance(run, 2000)!;
    run = advance(run, 3000)!; run = advance(run, 4000)!;
    expect(phaseLimit(run)).toBe(12); expect(finish(run, 16000, true).durations.cold).toBe(12);
  });
  it('does not choose a target for measured cold water', () => {
    expect(startRun({ ...defaults, coldEnabled: true }, 0).coldTarget).toBeNull();
  });
});
describe('stored settings', () => {
  it('handles malformed settings and bounds stored values', () => {
    expect(normalizeSettings(null)).toEqual(defaults);
    const value = normalizeSettings({ wet: -5, wetWarning: 30, rinse: NaN, coldMin: 50, coldMax: 2 });
    expect(value.wet).toBe(1); expect(value.wetWarning).toBe(0);
    expect(value.rinse).toBe(120); expect(value.coldMax).toBe(50);
  });
});
