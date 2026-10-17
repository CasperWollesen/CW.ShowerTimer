import { afterEach, describe, expect, it, vi } from 'vitest';
import { beep, unlockAudio, vibrate } from './audio';

afterEach(() => vi.unstubAllGlobals());
describe('vibration feedback', () => {
  it('requests one pulse for a warning and three for completion', () => {
    const request = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: request });
    expect(vibrate('warning')).toBe(true); expect(request).toHaveBeenLastCalledWith([250]);
    expect(vibrate('end')).toBe(true); expect(request).toHaveBeenLastCalledWith([400, 180, 400, 180, 650]);
  });
  it('degrades gracefully when unsupported or refused', () => {
    vi.stubGlobal('navigator', {}); expect(vibrate('end')).toBe(false);
    vi.stubGlobal('navigator', { vibrate: () => false }); expect(vibrate('end')).toBe(false);
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('blocked'); } }); expect(vibrate('end')).toBe(false);
  });
});
describe('audible feedback', () => {
  it('makes strong signals louder and longer, with three completion tones', async () => {
    let cancelled = 0;
    const gains: Array<{ ramp: ReturnType<typeof vi.fn> }> = [];
    const stops: number[] = [];
    const tones: Array<{ frequency: { value: number } }> = [];
    class TestContext {
      state = 'running'; currentTime = 0; destination = {};
      async resume() {}
      createOscillator() { const tone = { type: 'sine', frequency: { value: 0 }, connect() {}, start() {}, stop(at?: number) { if (at !== undefined) stops.push(at); else cancelled++; } }; tones.push(tone); return tone; }
      createGain() {
        const ramp = vi.fn(); gains.push({ ramp });
        return { connect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime: ramp, exponentialRampToValueAtTime() {} } };
      }
    }
    vi.stubGlobal('AudioContext', TestContext);
    expect(await unlockAudio()).toBe(true); gains.length = 0; stops.length = 0; tones.length = 0;
    expect(beep('warning', 'gentle')).toBe(true);
    const gentleDuration = stops[0]!;
    expect(gains[0]!.ramp).toHaveBeenCalledWith(0.24, 0.02);
    expect(tones[0]!.frequency.value).toBe(740);
    gains.length = 0; stops.length = 0; tones.length = 0;
    expect(beep('end', 'strong')).toBe(true);
    expect(stops).toHaveLength(3); expect(stops[0]!).toBeGreaterThan(gentleDuration);
    expect(gains[0]!.ramp).toHaveBeenCalledWith(0.65, 0.02);
    expect(stops[1]! - stops[0]!).toBeCloseTo(0.78);
    expect(tones.map(tone => tone.frequency.value)).toEqual([520, 520, 520]);
    gains.length = 0; stops.length = 0; tones.length = 0; cancelled = 0;
    expect(beep('tap', 'strong')).toBe(true);
    expect(cancelled).toBe(0); expect(stops).toHaveLength(1); expect(stops[0]!).toBeLessThan(0.2);
    expect(gains[0]!.ramp).toHaveBeenCalledWith(0.65, 0.02);
  });
});
