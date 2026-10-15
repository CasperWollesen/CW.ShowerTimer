let context: AudioContext | null = null;
export async function unlockAudio(): Promise<boolean> {
  try {
    context ??= new AudioContext();
    await context.resume();
    // A silent oscillator primes audio from the Start tap on mobile browsers.
    const oscillator = context.createOscillator(), gain = context.createGain();
    gain.gain.value = 0; oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + 0.01);
    return context.state === 'running';
  } catch { return false; }
}
export function beep(kind: 'warning' | 'end'): boolean {
  if (!context || context.state !== 'running') return false;
  const count = kind === 'warning' ? 1 : 3;
  for (let i = 0; i < count; i++) {
    const start = context.currentTime + i * 0.28;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = kind === 'warning' ? 740 : 920;
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.24, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.17);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + 0.19);
  }
  return true;
}
