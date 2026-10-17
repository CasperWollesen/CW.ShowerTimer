import { describe, expect, it } from 'vitest';
import { advance, chooseCold, confirmWaterStop, defaults, elapsed, finish, normalizeSettings, phaseLimit, randomDuration, startRun, togglePause, total, undoAdvance, wetDeadline } from './domain';

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
    const run = startRun({ ...defaults, coldEnabled: true }, 0);
    expect(run.coldTarget).toBeNull(); expect(run.coldSurprise).toBeNull();
  });
  it('lets Just measure pick a stopwatch or the pre-drawn surprise when the water is cold', () => {
    let run = startRun({ ...defaults, mode: 'measure', coldEnabled: true, coldMin: 20, coldMax: 20 }, 0);
    expect(run.coldSurprise).toBe(20); expect(run.coldTarget).toBeNull();
    expect(chooseCold(run, 'random')).toBe(run);
    run = advance(advance(advance(run, 1000)!, 2000)!, 3000)!; expect(run.phase).toBe('coldReady');
    run = chooseCold(run, 'random'); expect(run.coldTarget).toBe(20);
    run = chooseCold(run, 'measure'); expect(run.coldTarget).toBeNull();
    run = advance(chooseCold(run, 'random'), 10000)!;
    expect(phaseLimit(run)).toBe(20); expect(chooseCold(run, 'measure')).toBe(run);
    expect(finish(run, 30000, true).coldTarget).toBe(20);
  });
  it('keeps the guided cold choice fixed before the shower', () => {
    let run = startRun({ ...defaults, coldEnabled: true }, 0);
    run = advance(advance(advance(run, 1000)!, 2000)!, 3000)!;
    expect(chooseCold(run, 'random')).toBe(run);
  });
});

describe('undo a phase change', () => {
  it('reopens the earlier phase and keeps the time after the accidental tap', () => {
    const wet = startRun({ ...defaults, mode: 'measure' }, 0);
    const soap = advance(wet, 30000)!;
    const back = undoAdvance(wet, 30000, 35000, soap);
    expect(back.phase).toBe('wet'); expect(back.durations).toEqual(wet.durations);
    expect(elapsed(back, 35000)).toBe(35); expect(back.pausedAt).toBeNull();
  });
  it('excludes and keeps a pause made after the accidental tap', () => {
    const soap = advance(startRun({ ...defaults, mode: 'measure' }, 0), 10000)!;
    let rinse = advance(soap, 70000)!;
    rinse = togglePause(rinse, 75000);
    const back = undoAdvance(soap, 70000, 95000, rinse);
    expect(back.phase).toBe('soap'); expect(back.pausedAt).not.toBeNull();
    expect(elapsed(back, 120000)).toBe(65);
    expect(elapsed(togglePause(back, 120000), 130000)).toBe(75);
  });
  it('reopens a finished shower, counting the time since the tap', () => {
    const rinse = advance(advance(startRun({ ...defaults, mode: 'measure' }, 0), 10000)!, 20000)!;
    const back = undoAdvance(rinse, 50000, 54000);
    expect(back.phase).toBe('rinse'); expect(elapsed(back, 54000)).toBe(34);
    expect(finish(back, 60000, true).durations).toEqual({ wet: 10, soap: 10, rinse: 40, cold: 0 });
  });
  it('restores rinse overtime after an on-time finish was undone', () => {
    const rinse = advance(wetDeadline(startRun(defaults, 0)), 180000)!;
    const back = undoAdvance(rinse, 330000, 332000);
    expect(back.phase).toBe('rinse'); expect(elapsed(back, 332000)).toBe(152);
  });
  it('keeps a paused shower paused when a finish is undone', () => {
    const rinse = togglePause(advance(startRun({ ...defaults, mode: 'measure' }, 0), 10000)!, 25000);
    const back = undoAdvance(rinse, 40000, 50000);
    expect(elapsed(back, 90000)).toBe(15); expect(back.pausedAt).not.toBeNull();
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

describe('late water stop confirmation', () => {
  it('counts soap from the wet beep when water was stopped on time', () => {
    const run = wetDeadline(startRun(defaults, 0));
    const corrected = confirmWaterStop(run, 150000, 'onTime');
    expect(corrected.phase).toBe('soap'); expect(corrected.wetNeedsConfirmation).toBe(false);
    expect(corrected.durations.wet).toBe(120); expect(elapsed(corrected, 150000)).toBe(30);
  });
  it('moves time from soap back to wet when water was only turned off now', () => {
    const run = wetDeadline(startRun(defaults, 0));
    const corrected = confirmWaterStop(run, 150000, 'now');
    expect(corrected.durations.wet).toBe(150); expect(elapsed(corrected, 150000)).toBe(0);
    const rinsing = advance(corrected, 180000)!;
    expect(rinsing.durations.soap).toBe(30);
    expect(total(finish(rinsing, 200000, true))).toBe(200);
    expect(confirmWaterStop(corrected, 180000, 'now')).toBe(corrected);
  });
  it('does not include paused time in a late wet correction', () => {
    let run = wetDeadline(startRun(defaults, 0));
    run = togglePause(run, 130000); run = togglePause(run, 200000);
    run = confirmWaterStop(run, 210000, 'now');
    expect(run.durations.wet).toBe(140); expect(elapsed(run, 220000)).toBe(10);
  });
  it('keeps a paused soap phase paused after correcting the wet time', () => {
    let run = togglePause(wetDeadline(startRun(defaults, 0)), 130000);
    run = confirmWaterStop(run, 200000, 'now');
    expect(run.durations.wet).toBe(130); expect(elapsed(run, 250000)).toBe(0);
    run = togglePause(run, 250000); expect(elapsed(run, 260000)).toBe(10);
  });
  it('preserves a soap interval if the user simply moves on to rinse', () => {
    const run = advance(wetDeadline(startRun(defaults, 0)), 160000)!;
    expect(run.durations.wet).toBe(120); expect(run.durations.soap).toBe(40);
    expect(run.wetNeedsConfirmation).toBe(false);
  });
  it('records extra rinse time when the water stops now', () => {
    let run = advance(wetDeadline(startRun(defaults, 0)), 180000)!;
    run = confirmWaterStop(run, 360000, 'now');
    const session = finish(run, 360000, true);
    expect(session.durations.rinse).toBe(180); expect(total(session)).toBe(360);
  });
  it('excludes the forgotten final tap when the water stopped on time', () => {
    let run = advance(wetDeadline(startRun({ ...defaults, coldEnabled: true }, 0)), 180000)!;
    run = confirmWaterStop(run, 360000, 'onTime');
    expect(finish(run, 360000, true).durations.rinse).toBe(120);
    run = advance(run, 360000)!; expect(run.phase).toBe('coldReady');
    run = advance(run, 400000)!;
    const session = finish(run, 410000, true);
    expect(session.durations).toEqual({ wet: 120, soap: 60, rinse: 120, cold: 10 });
    expect(total(session)).toBe(310);
  });
  it('leaves free measurement untouched', () => {
    let run = advance(startRun({ ...defaults, mode: 'measure' }, 0), 10000)!;
    run = advance(run, 20000)!;
    expect(confirmWaterStop(run, 30000, 'onTime')).toBe(run);
    expect(wetDeadline(startRun({ ...defaults, mode: 'measure' }, 0)).phase).toBe('wet');
  });
});
