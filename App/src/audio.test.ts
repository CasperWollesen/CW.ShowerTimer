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
    const gains: Array<{ ramp: ReturnType<typeof vi.fn> }> = [];
    const stops: number[] = [];
    class TestContext {
      state = 'running'; currentTime = 0; destination = {};
      async resume() {}
      createOscillator() { return { type: 'sine', frequency: { value: 0 }, connect() {}, start() {}, stop(at: number) { stops.push(at); } }; }
      createGain() {
        const ramp = vi.fn(); gains.push({ ramp });
        return { connect() {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime: ramp, exponentialRampToValueAtTime() {} } };
      }
    }
    vi.stubGlobal('AudioContext', TestContext);
    expect(await unlockAudio()).toBe(true); gains.length = 0; stops.length = 0;
    expect(beep('warning', 'gentle')).toBe(true);
    const gentleDuration = stops[0]!;
    expect(gains[0]!.ramp).toHaveBeenCalledWith(0.24, 0.02);
    gains.length = 0; stops.length = 0;
    expect(beep('end', 'strong')).toBe(true);
    expect(stops).toHaveLength(3); expect(stops[0]!).toBeGreaterThan(gentleDuration);
    expect(gains[0]!.ramp).toHaveBeenCalledWith(0.65, 0.02);
    expect(stops[1]! - stops[0]!).toBeCloseTo(0.78);
  });
});
