import { defaults, normalizeSettings } from './domain';
import type { Session, Settings } from './domain';
const key = 'cw-shower-timer.v1';
export interface Data { settings: Settings; sessions: Session[] }
function validSession(s: unknown): s is Session {
  if (!s || typeof s !== 'object') return false;
  const v = s as Session;
  return typeof v.id === 'string' && Number.isFinite(v.startedAt) && typeof v.complete === 'boolean' &&
    (v.mode === 'guided' || v.mode === 'measure') && v.durations != null &&
    ['wet', 'soap', 'rinse', 'cold'].every(p => { const n = v.durations[p as keyof Session['durations']]; return Number.isFinite(n) && n >= 0; }) &&
    (v.coldTarget === null || (Number.isFinite(v.coldTarget) && v.coldTarget > 0));
}
export function readData(): Data {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { settings: { ...defaults }, sessions: [] };
    const value = JSON.parse(raw);
    return { settings: normalizeSettings(value.settings), sessions: Array.isArray(value.sessions) ? value.sessions.filter(validSession) : [] };
  } catch { return { settings: { ...defaults }, sessions: [] }; }
}
export function saveData(data: Data): boolean {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
}
