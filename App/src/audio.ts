let context: AudioContext | null = null;
let activeTones: OscillatorNode[] = [];
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
export function beep(kind: 'warning' | 'end', signal: 'gentle' | 'strong' = 'strong'): boolean {
  if (!context || context.state !== 'running') return false;
  // Trying another sample replaces the old one instead of stacking tones.
  for (const tone of activeTones) { try { tone.stop(); } catch { /* Already ended. */ } }
  activeTones = [];
  const count = kind === 'warning' ? 1 : 3;
  const strong = signal === 'strong';
  const duration = strong ? 0.6 : 0.25;
  for (let i = 0; i < count; i++) {
    const start = context.currentTime + i * (duration + 0.18);
    const oscillator = context.createOscillator(), gain = context.createGain();
    activeTones.push(oscillator);
    oscillator.onended = () => { activeTones = activeTones.filter(tone => tone !== oscillator); };
    oscillator.type = strong ? 'triangle' : 'sine';
    oscillator.frequency.value = strong ? (kind === 'warning' ? 440 : 520) : (kind === 'warning' ? 740 : 920);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(strong ? 0.65 : 0.24, start + 0.02);
    gain.gain.setValueAtTime(strong ? 0.65 : 0.24, start + duration - 0.09);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + duration + 0.02);
  }
  return true;
}
export function vibrate(kind: 'warning' | 'end'): boolean {
  try { return typeof navigator.vibrate === 'function' && navigator.vibrate(kind === 'warning' ? [250] : [400, 180, 400, 180, 650]); }
  catch { return false; }
}
