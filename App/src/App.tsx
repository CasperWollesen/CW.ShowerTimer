import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Droplets, FlaskConical, History, Menu, Moon, Pause, Play, Settings2, Shuffle, Snowflake, Sun, Trash2, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { advance, chooseCold, confirmWaterStop, elapsed, finish, formatTime, normalizeSettings, phaseLimit, startRun, togglePause, total, undoAdvance, wetDeadline } from './domain';
import type { Phase, Run, Session, Settings } from './domain';
import { readData, saveData } from './storage';
import { beep, unlockAudio, vibrate } from './audio';
import { Share } from './Share';
import { version } from '../package.json';
import { pickerValues, settingsChanged, settingsError } from './preferences';

type Panel = 'menu' | 'settings' | 'history' | 'tests' | null;
const phaseText: Record<Phase, { title: string; name: string; emoji: string }> = {
  wet: { title: 'Ease into it.', name: 'Get wet', emoji: '🚿' },
  soap: { title: 'Lather. Breathe.', name: 'Soap up', emoji: '🫧' },
  rinse: { title: 'A fresh start.', name: 'Rinse off', emoji: '💧' },
  coldReady: { title: 'Ready for a reset?', name: 'Turn it cold', emoji: '🧊' },
  cold: { title: 'Find your calm.', name: 'Go cold', emoji: '🐻‍❄️' }
};
const steps = { wet: ['🚿', 'Wet'], soap: ['🫧', 'Soap'], rinse: ['💧', 'Rinse'], cold: ['❄️', 'Cold'] } as const;
const UNDO_MS = 8000;

type Drifter = [emoji: string, seconds: number, delay: number, motion: 'bob' | 'wobble' | 'spin' | 'waddle', size?: number];
/** Looping lanes never encode time, so they are safe during a cold surprise. Irregular periods avoid countable laps. */
const parades: Record<Exclude<Phase, 'coldReady'>, Drifter[]> = {
  wet: [['💧', 6.3, 0, 'bob'], ['🚿', 9.7, -3.4, 'bob', 1.25], ['💧', 7.9, -5.9, 'bob', .8]],
  soap: [['🫧', 8.3, 0, 'wobble', 1.25], ['🧼', 11.9, -4.6, 'waddle'], ['🫧', 6.7, -2.3, 'wobble', .8], ['🫧', 9.4, -7.1, 'wobble']],
  rinse: [['💦', 7.1, 0, 'bob'], ['💧', 5.7, -2.1, 'bob', .85], ['💧', 8.9, -5.3, 'bob', 1.15]],
  cold: [['🐻‍❄️', 12.7, 0, 'waddle', 1.35], ['🧊', 8.9, -3.7, 'bob'], ['❄️', 6.1, -1.3, 'spin', .85], ['🐧', 10.3, -7.9, 'waddle', 1.1], ['🧊', 14.3, -10.6, 'bob', .8]]
};
const ambient: Record<Phase, [emoji: string, direction: 'fall' | 'rise']> = { wet: ['💧', 'fall'], soap: ['🫧', 'rise'], rinse: ['💧', 'fall'], coldReady: ['❄️', 'fall'], cold: ['❄️', 'fall'] };
const particles = [[4, 7.3, 0, .9], [17, 9.1, -4.2, .7], [30, 6.6, -2.5, 1], [50, 8.4, -6.1, .75], [66, 7.7, -1.4, .95], [80, 9.8, -5.3, .7], [92, 6.9, -3.6, .85]] as const;

/** Timed phases fill like a progress bar; everything else, including a cold surprise, only loops (and pulses once a surprise is over). */
function PhaseLane({ phase, progress, overtime }: { phase: Phase; progress: number | null; overtime: boolean }) {
  if (progress !== null) return <div className={'lane timed' + (overtime ? ' overtime' : '')} aria-hidden="true">
    <div className="lane-fill" style={{ width: `${progress * 100}%` }} />
    <span className="lane-head" style={{ left: `clamp(24px, ${progress * 100}%, calc(100% - 24px))` }}><span className="m-bob">{phaseText[phase].emoji}</span></span>
  </div>;
  if (phase === 'coldReady') return <div className="lane idle" aria-hidden="true">{['🧊', '❄️', '🐻‍❄️', '❄️', '🧊'].map((emoji, i) => <span key={i} style={{ left: `${12 + i * 19}%`, animationDelay: `${-i * .07}s` }}>{emoji}</span>)}</div>;
  return <div className={'lane parade' + (overtime ? ' overtime' : '')} aria-hidden="true">{parades[phase].map(([emoji, seconds, delay, motion, size = 1], i) => <span className="drift" key={i} style={{ animationDuration: `${seconds}s`, animationDelay: `${delay}s` }}><span className={'m-' + motion} style={{ fontSize: `${Math.round(size * 26)}px` }}>{emoji}</span></span>)}</div>;
}

function Ambient({ phase }: { phase: Phase }) {
  const [emoji, direction] = ambient[phase];
  return <div className={'ambient ' + direction} aria-hidden="true">{particles.map(([left, seconds, delay, size], i) => <span key={i} style={{ left: `${left}%`, animationDuration: `${seconds}s`, animationDelay: `${delay}s` }}><i style={{ fontSize: `${Math.round(size * 20)}px` }}>{emoji}</i></span>)}</div>;
}

function useWakeLock(active: boolean) {
  const [status, setStatus] = useState('Off');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active) { setStatus('Off'); return; }
    let disposed = false;
    let requesting = false;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      if (document.visibilityState !== 'visible' || disposed || lock || requesting) return;
      if (!('wakeLock' in navigator)) { setStatus('Not supported'); return; }
      requesting = true;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (disposed) { await acquired.release(); return; }
        lock = acquired; setStatus('On');
        acquired.addEventListener('release', () => { lock = null; if (!disposed) setStatus('Released'); });
      } catch { if (!disposed) setStatus('Unavailable'); }
      finally { requesting = false; }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => { disposed = true; document.removeEventListener('visibilitychange', request); void lock?.release(); };
  }, [active, retry]);
  return { status, retry: () => setRetry(v => v + 1) };
}

function Sheet({ title, children, onClose, back }: { title: string; children: ReactNode; onClose: () => void; back?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="sheet" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sheet-inner"><div className="sheet-header">
      {back && <button className="icon-button" onClick={back} aria-label="Back to menu"><ArrowLeft size={20} /></button>}
      <h2>{title}</h2><button className="icon-button close" onClick={onClose} aria-label="Close"><X size={22} /></button>
    </div>{children}</div>
  </dialog>;
}

function Toggle({ checked, onChange, label, description, icon }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string; icon?: ReactNode }) {
  return <label className="toggle-row">{icon && <span className="row-icon">{icon}</span>}<span className="row-copy"><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <input className="switch" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /></label>;
}

function DurationInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <fieldset className="duration-field"><legend>{label}</legend><div>
    <label><select value={Math.floor(value / 60)} onChange={e => { const minutes = Number(e.target.value); onChange(minutes * 60 + (minutes === 60 ? 0 : value % 60)); }}>{pickerValues(60, 1, Math.floor(value / 60)).map(n => <option key={n} value={n}>{String(n).padStart(2, '0')}</option>)}</select><span>min</span></label>
    <span className="colon">:</span>
    <label><select value={value % 60} onChange={e => onChange(Math.floor(value / 60) * 60 + Number(e.target.value))}>{pickerValues(value >= 3600 ? 0 : 59, 5, value % 60).map(n => <option key={n} value={n}>{String(n).padStart(2, '0')}</option>)}</select><span>sec</span></label>
  </div></fieldset>;
}

function SettingsPanel({ settings, onSave, onDraftChange }: { settings: Settings; onSave: (s: Settings) => void; onDraftChange: (draft: Settings | null) => void }) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState('');
  const [previewStatus, setPreviewStatus] = useState('');
  useEffect(() => { onDraftChange(draft); }, [draft, onDraftChange]);
  useEffect(() => () => onDraftChange(null), [onDraftChange]);
  const preview = async (signal: Settings['signal'], kind: 'warning' | 'end') => {
    const ok = await unlockAudio();
    setPreviewStatus(ok && beep(kind, signal) ? `${signal === 'strong' ? 'Louder & longer' : 'Gentle'} ${kind === 'warning' ? 'warning' : 'end signal'} played.` : 'Audio could not start. Check your phone volume and try again.');
  };
  const patch = (values: Partial<Settings>) => setDraft(s => ({ ...s, ...values }));
  return <form onSubmit={e => {
    e.preventDefault();
    const validation = settingsError(draft);
    if (validation) { setError(validation); return; }
    onSave(normalizeSettings(draft));
  }}>
    <p className="panel-intro">Set it once. Make it your ritual.</p>
    <h3>Guided shower</h3><div className="settings-card">
      <DurationInput label="🚿 Get wet" value={draft.wet} onChange={wet => patch({ wet, wetWarning: Math.min(draft.wetWarning, Math.max(0, Math.floor((wet - 1) / 5) * 5)) })} />
      <label className="number-row">Warn me before the end <select aria-label="Get wet warning" value={draft.wetWarning} onChange={e => patch({ wetWarning: Number(e.target.value) })}>{pickerValues(Math.max(0, draft.wet - 1), 5, draft.wetWarning).map(n => <option key={n} value={n}>{n === 0 ? 'Off' : `${n} sec`}</option>)}</select></label>
      <div className="divider" /><DurationInput label="💧 Rinse off" value={draft.rinse} onChange={rinse => patch({ rinse, rinseWarning: Math.min(draft.rinseWarning, Math.max(0, Math.floor((rinse - 1) / 5) * 5)) })} />
      <label className="number-row">Warn me before the end <select aria-label="Rinse warning" value={draft.rinseWarning} onChange={e => patch({ rinseWarning: Number(e.target.value) })}>{pickerValues(Math.max(0, draft.rinse - 1), 5, draft.rinseWarning).map(n => <option key={n} value={n}>{n === 0 ? 'Off' : `${n} sec`}</option>)}</select></label>
    </div><p className="hint">Soaping has no time limit. Choose Off for no warning.</p>
    <h3>Cold finish</h3><div className="settings-card"><Toggle checked={draft.coldEnabled} onChange={coldEnabled => patch({ coldEnabled })} label="Finish with cold water" description="Always starts with your own tap." icon={<Snowflake size={20} />} />
      {draft.coldEnabled && <><div className="divider" /><div className="segmented"><button type="button" className={draft.coldMode === 'measure' ? 'selected' : ''} onClick={() => patch({ coldMode: 'measure' })}>Measure</button><button type="button" className={draft.coldMode === 'random' ? 'selected' : ''} onClick={() => patch({ coldMode: 'random' })}>Surprise me</button></div>
        <p className="hint">{draft.coldMode === 'random' ? 'A random duration within your range. No countdown or warning gives it away.' : 'An open-ended stopwatch. Finish whenever you’re ready.'}{draft.mode === 'measure' && ' Just measure asks again when the water is cold.'}</p>
        {(draft.coldMode === 'random' || draft.mode === 'measure') && <div className="range-inputs"><DurationInput label="Minimum" value={draft.coldMin} onChange={coldMin => patch({ coldMin })} /><DurationInput label="Maximum" value={draft.coldMax} onChange={coldMax => patch({ coldMax })} /></div>}
      </>}
    </div>
    <h3>Appearance</h3><div className="segmented"><button type="button" className={draft.theme === 'dark' ? 'selected' : ''} onClick={() => patch({ theme: 'dark' })}><Moon size={17} />Dark</button><button type="button" className={draft.theme === 'light' ? 'selected' : ''} onClick={() => patch({ theme: 'light' })}><Sun size={17} />Light</button></div>
    <h3>Sound & vibration</h3><div className="settings-card"><Toggle checked={draft.sound} onChange={sound => patch({ sound })} label="Beep alerts" description="One for a warning. Three when time is up." icon={<Volume2 size={20} />} />
      {draft.sound && <><div className="sound-choices">{(['gentle', 'strong'] as const).map(signal => <div className={'sound-choice ' + (draft.signal === signal ? 'selected' : '')} key={signal}><button type="button" className="sound-select" aria-pressed={draft.signal === signal} onClick={() => patch({ signal })}>{signal === 'gentle' ? 'Gentle' : 'Louder & longer'}{draft.signal === signal && <Check size={16} />}</button><div className="sound-previews"><button type="button" className="secondary" aria-label={`Test ${signal === 'gentle' ? 'Gentle' : 'Louder & longer'} warning`} onClick={() => void preview(signal, 'warning')}><Volume2 size={15} />1 beep</button><button type="button" className="secondary" aria-label={`Test ${signal === 'gentle' ? 'Gentle' : 'Louder & longer'} end signal`} onClick={() => void preview(signal, 'end')}>3 beeps</button></div></div>)}</div><p className="hint" role="status">{previewStatus || 'Try either sound without changing your selection.'}</p><p className="hint">Your phone’s media volume controls the final loudness.</p></>}
      <div className="divider" /><Toggle checked={draft.vibration} onChange={vibration => patch({ vibration })} label="Vibrate with alerts" description="Optional extra feedback on supported phones." />
      <p className="hint">{typeof navigator.vibrate === 'function' ? 'This browser exposes vibration. Try the vibration test on your phone to check the hardware.' : 'Vibration alerts are not supported by this browser. Use sound on iPhone/Safari.'}</p>
    </div>{error && <p className="error" role="alert">{error}</p>}
    <button className="primary sticky-action" type="submit"><Check size={19} />Save settings</button>
    <Share />
  </form>;
}

function HistoryPanel({ sessions, onDelete }: { sessions: Session[]; onDelete: (id: string) => void }) {
  const [range, setRange] = useState('all');
  const since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - (range === 'week' ? 6 : 29));
  const filtered = sessions.filter(s => range === 'all' || s.startedAt >= since.getTime());
  const complete = filtered.filter(s => s.complete), sum = complete.reduce((n, s) => n + total(s), 0);
  const cold = complete.reduce((n, s) => n + s.durations.cold, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6 + i);
    const next = new Date(date); next.setDate(next.getDate() + 1);
    return { date, seconds: sessions.filter(s => s.complete && s.startedAt >= date.getTime() && s.startedAt < next.getTime()).reduce((n, s) => n + total(s), 0) };
  });
  const max = Math.max(1, ...days.map(d => d.seconds));
  return <><p className="panel-intro">Small rituals, over time.</p><div className="segmented"><button className={range === 'week' ? 'selected' : ''} onClick={() => setRange('week')}>7 days</button><button className={range === 'month' ? 'selected' : ''} onClick={() => setRange('month')}>30 days</button><button className={range === 'all' ? 'selected' : ''} onClick={() => setRange('all')}>All time</button></div>
    <div className="stats-grid"><Stat value={String(complete.length)} label="showers" /><Stat value={formatTime(sum)} label="total time" /><Stat value={formatTime(complete.length ? sum / complete.length : 0)} label="average" /><Stat value={formatTime(cold)} label="cold water" /></div>
    <div className="settings-card chart"><h3>Past 7 days <span>shower minutes</span></h3><div className="bars">{days.map(d => <div className="bar-column" key={d.date.getTime()}><span className="bar-value">{d.seconds ? Math.round(d.seconds / 60 * 10) / 10 : '·'}</span><div className="bar-track"><div style={{ height: `${Math.max(d.seconds ? 5 : 0, d.seconds / max * 100)}%` }} /></div><small>{d.date.toLocaleDateString('en', { weekday: 'narrow' })}</small></div>)}</div></div>
    <h3>Your showers <span className="muted">{filtered.length}</span></h3>
    {filtered.length === 0 ? <div className="empty"><span>🫧</span><h3>A fresh page.</h3><p>Your showers will appear here.<br />Everything stays on this device.</p></div> : filtered.map(s => <details className="history-item" key={s.id}><summary><span className="history-emoji">{s.durations.cold > 0 ? '❄️' : '🚿'}</span><span className="row-copy"><strong>{new Date(s.startedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}<small className="inline-time">{new Date(s.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</small></strong><small>{s.mode === 'guided' ? 'Guided' : 'Measured'}{!s.complete ? ' · Stopped early' : ''}</small></span><strong className="mono">{formatTime(total(s))}</strong><ChevronRight size={16} /></summary><div className="history-details"><PhaseTimes session={s} /><button className="text-button danger" onClick={() => onDelete(s.id)}><Trash2 size={15} />Delete entry</button></div></details>)}
    <p className="hint">Totals include completed showers. Cold-water preparation and paused time are excluded. Clear this site’s data and the history is gone.</p>
  </>;
}
function Stat({ value, label }: { value: string; label: string }) { return <div className="stat"><strong>{value}</strong><small>{label}</small></div>; }
function PhaseTimes({ session }: { session: Session }) {
  return <div className="phase-times">{(['wet', 'soap', 'rinse', 'cold'] as const).map(p => <div key={p}><span>{p === 'wet' ? '🚿 Get wet' : p === 'soap' ? '🫧 Soap' : p === 'rinse' ? '💧 Rinse' : '❄️ Cold'}</span><strong>{formatTime(session.durations[p])}</strong></div>)}{session.coldTarget !== null && <p className="hint">Surprise duration: {formatTime(session.coldTarget)}</p>}</div>;
}

export default function App() {
  const [data, setData] = useState(readData);
  const [run, setRun] = useState<Run | null>(null);
  const [result, setResult] = useState<Session | null>(null);
  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<Panel>(null);
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const [pendingPanel, setPendingPanel] = useState<{ next: Panel } | null>(null);
  const [pendingError, setPendingError] = useState('');
  const [toast, setToast] = useState('');
  const [deleted, setDeleted] = useState<Session | null>(null);
  const [testWake, setTestWake] = useState(false);
  const [soundStatus, setSoundStatus] = useState('Not tested');
  const [vibrationStatus, setVibrationStatus] = useState('Not tested');
  const [storageOk, setStorageOk] = useState(true);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [undo, setUndo] = useState<{ previous: Run; at: number; phase?: Phase; sessionId?: string } | null>(null);
  const wake = useWakeLock(!!run || testWake);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const warned = useRef<string | null>(null);
  const endSignalled = useRef<string | null>(null);
  const runRef = useRef(run); runRef.current = run;
  const settings = data.settings;
  const unsavedRef = useRef(false);
  unsavedRef.current = settingsChanged(settings, settingsDraft);
  const navigatePanel = (next: Panel) => {
    if (panel === 'settings' && settingsChanged(settings, settingsDraft)) {
      setPendingError(''); setPendingPanel({ next });
    } else setPanel(next);
  };

  const scene = run ? (run.phase === 'coldReady' ? 'cold' : run.phase) : null;
  useEffect(() => { setStorageOk(saveData(data)); }, [data]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    if (scene) root.dataset.phase = scene; else delete root.dataset.phase;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  }, [settings.theme, scene]);
  useEffect(() => { if (!undo) return; const id = setTimeout(() => setUndo(null), UNDO_MS); return () => clearTimeout(id); }, [undo]);
  useEffect(() => { if (!run) return; const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, [!!run]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => { setToast(''); setDeleted(null); }, 6000); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (panel !== 'tests') setTestWake(false); }, [panel]);
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible' && runRef.current) { setNow(Date.now()); setToast('Welcome back. Timing has caught up; background beeps may have been missed.'); }
    };
    document.addEventListener('visibilitychange', onReturn);
    const onUnload = (e: BeforeUnloadEvent) => { if (runRef.current || unsavedRef.current) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => { document.removeEventListener('visibilitychange', onReturn); window.removeEventListener('beforeunload', onUnload); };
  }, []);
  const saveResult = useCallback((session: Session) => {
    setData(d => ({ ...d, sessions: [session, ...d.sessions] }));
    setResult(session); setRun(null); setConfirmStop(false);
  }, []);
  // Every shower tap beeps briefly when beeps are on, so a silent phone or a connected headset is noticed at once.
  const tap = (s: Settings) => {
    if (s.sound) void unlockAudio().then(ok => { if (!ok || !beep('tap', s.signal)) setToast('Sound is unavailable. Tap the speaker to test it.'); });
  };
  const testBeep = async () => {
    const s = run?.settings ?? settings;
    if (await unlockAudio() && beep('warning', s.signal)) {
      setRinging(true); setTimeout(() => setRinging(false), 900);
      if (!s.sound) setToast('Test beep played. Shower beeps are off in Settings.');
    } else setToast('Audio could not start. Check the volume, silent mode and whether a headset is connected.');
  };
  const goNext = (when: 'onTime' | 'now' = 'now') => {
    if (!run) return;
    tap(run.settings);
    const at = Date.now(), stopped = run.phase === 'rinse' ? confirmWaterStop(run, at, when) : run, next = advance(stopped, at);
    if (next) { setRun(next); setNow(at); setUndo({ previous: run, at, phase: next.phase }); }
    else { const session = finish(stopped, at, true); saveResult(session); setUndo({ previous: run, at, sessionId: session.id }); }
  };
  // Only the latest manual tap can be undone, and only while its phase or result is still on screen.
  const canUndo = !!undo && (undo.sessionId ? !run && result?.id === undo.sessionId : !!run && run.startedAt === undo.previous.startedAt && run.phase === undo.phase);
  const undoLast = () => {
    if (!undo || !canUndo) return;
    tap(undo.previous.settings);
    const at = Date.now(), sessionId = undo.sessionId;
    if (sessionId) { setData(d => ({ ...d, sessions: d.sessions.filter(s => s.id !== sessionId) })); setResult(null); setRun(undoAdvance(undo.previous, undo.at, at)); }
    else if (run) setRun(undoAdvance(undo.previous, undo.at, at, run));
    setNow(at); setUndo(null);
  };
  const undoButton = (label: string) => canUndo && undo && <button className="secondary undo-button" style={{ '--undo-ms': `${UNDO_MS}ms` } as CSSProperties} onClick={undoLast} aria-label={`Undo, back to ${undo.sessionId ? 'your shower' : phaseText[undo.previous.phase].name}`}><Undo2 size={16} />{label}</button>;
  useEffect(() => {
    if (!run || run.pausedAt !== null || document.visibilityState !== 'visible') return;
    const limit = phaseLimit(run);
    if (limit === null) return;
    const spent = elapsed(run, now);
    const warning = run.phase === 'wet' ? run.settings.wetWarning : run.phase === 'rinse' ? run.settings.rinseWarning : 0;
    const id = `${run.startedAt}:${run.phase}`;
    if (spent >= limit) {
      if (endSignalled.current !== id) {
        endSignalled.current = id;
        if (run.settings.sound && !beep('end', run.settings.signal)) setToast('Sound is unavailable. Check the sound test before your next shower.');
        if (run.settings.vibration) vibrate('end');
      }
      if (run.phase === 'wet') setRun(wetDeadline(run));
      // Rinse and a cold surprise keep measuring past their targets until the next tap.
    } else if (warning > 0 && spent >= limit - warning) {
      if (warned.current !== id) {
        warned.current = id;
        if (run.settings.sound && !beep('warning', run.settings.signal)) setToast('Sound is unavailable.');
        if (run.settings.vibration) vibrate('warning');
      }
    }
  }, [run, now]);
  const patchSettings = (patch: Partial<Settings>) => setData(d => ({ ...d, settings: normalizeSettings({ ...d.settings, ...patch }) }));
  const start = () => {
    tap(settings);
    const at = Date.now(); warned.current = null; endSignalled.current = null; setResult(null); setUndo(null); setNow(at); setRun(startRun(settings, at));
  };
  const remove = (id: string) => {
    const session = data.sessions.find(s => s.id === id);
    if (session) { setDeleted(session); setData(d => ({ ...d, sessions: d.sessions.filter(s => s.id !== id) })); setToast('Shower deleted.'); }
  };
  const time = run ? elapsed(run, now) : 0;
  const limit = run ? phaseLimit(run) : null;
  // A cold surprise counts up but hides its target and progress until the three beeps.
  const surprise = run?.phase === 'cold' && run.coldTarget !== null;
  const surpriseDone = surprise && limit !== null && time >= limit;
  const ready = run?.phase === 'coldReady';
  const rinseOvertime = run?.phase === 'rinse' && limit !== null && time >= limit;
  const phaseInfo = run ? phaseText[run.phase] : null;
  const progress = surpriseDone ? 1 : run && limit && !surprise ? Math.min(1, time / limit) : 0;
  const wakeProblem = wake.status !== 'On' && wake.status !== 'Off';
  const coldSummary = !settings.coldEnabled ? 'A little extra reset. Entirely optional.' : settings.mode === 'measure' ? 'Count or surprise · pick when cold' : settings.coldMode === 'random' ? `Surprise · ${formatTime(settings.coldMin)}–${formatTime(settings.coldMax)}` : 'Measure your moment of cold';
  const latest = data.sessions.find(s => s.complete);
  const notification = toast && <div className="toast" role="status"><span>{toast}</span>{deleted && <button onClick={() => { setData(d => ({ ...d, sessions: [...d.sessions, deleted].sort((a, b) => b.startedAt - a.startedAt) })); setDeleted(null); setToast('Restored.'); }}>Undo</button>}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>;

  return <div className={'app-shell' + (!run && !result ? ' home-screen' : '') + (run ? ' shower-screen' : '')}>
    <header className="app-header"><a className="brand" href={import.meta.env.BASE_URL} onClick={e => { e.preventDefault(); if (!run) { setResult(null); setPanel(null); } }}><span className="brand-mark"><Droplets size={22} /></span><span>shower<span className="brand-light">timer</span><span className="brand-dot">.</span></span></a><div className="header-actions"><button className={'icon-button sound-test' + (ringing ? ' ringing' : '')} aria-label={(run?.settings ?? settings).sound ? 'Test beep' : 'Test beep (shower beeps are off)'} onClick={() => void testBeep()}>{(run?.settings ?? settings).sound ? <Volume2 size={21} /> : <VolumeX size={21} />}</button><button className="icon-button" aria-label="Open menu" onClick={() => setPanel('menu')}><Menu size={23} /></button></div></header>
    <main>
      {!run && !result && <>
        <div className="home-intro">
        <div className="hero"><h1>Your shower.<br /><em>Your pace.</em></h1></div>
        <div className="water-scene" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><div className="drop"><span /></div><span className="bubble bubble-one" /><span className="bubble bubble-two" /><span className="bubble bubble-three" /><span className="scene-spark">✦</span><span className="scene-caption">a fresh start, every time</span></div>
        </div>
        <div className="mode-switch segmented" aria-label="Shower mode"><button className={settings.mode === 'guided' ? 'selected' : ''} onClick={() => patchSettings({ mode: 'guided' })}><Droplets size={18} />Guide me</button><button className={settings.mode === 'measure' ? 'selected' : ''} onClick={() => patchSettings({ mode: 'measure' })}><Clock3 size={18} />Just measure</button></div>
        <button className="routine-card" onClick={() => setPanel('settings')} aria-label="Change shower timings"><span><span className="routine-emoji">🚿</span><strong>{settings.mode === 'guided' ? formatTime(settings.wet) : 'Get wet'}</strong><small>{settings.mode === 'guided' ? 'get wet' : 'tap to move on'}</small></span><ChevronRight size={14} /><span><span className="routine-emoji">🫧</span><strong>No rush</strong><small>soap up</small></span><ChevronRight size={14} /><span><span className="routine-emoji">💧</span><strong>{settings.mode === 'guided' ? formatTime(settings.rinse) : 'Rinse off'}</strong><small>{settings.mode === 'guided' ? 'rinse off' : 'tap to finish'}</small></span><Settings2 className="routine-edit" size={15} /></button>
        <div className={'cold-card ' + (settings.coldEnabled ? 'enabled' : '')}><Toggle checked={settings.coldEnabled} onChange={coldEnabled => patchSettings({ coldEnabled })} label="A cold finish?" description={coldSummary} icon={<Snowflake size={22} />} />{settings.coldEnabled && <button className="icon-button cold-config" onClick={() => setPanel('settings')} aria-label="Change cold finish"><Settings2 size={19} /></button>}</div>
        <button className="primary start-button" onClick={start}><Play size={19} fill="currentColor" />Start my shower<ArrowRight size={19} /></button>
        {latest && <button className="last-shower" onClick={() => setPanel('history')}><History size={15} />Last shower <strong>{formatTime(total(latest))}</strong><ChevronRight size={15} /></button>}
      </>}
      {run && phaseInfo && <>
        <div key={'splash-' + run.phase} className="phase-splash" aria-hidden="true"><span>{phaseInfo.emoji}</span><strong>{phaseInfo.name}</strong></div>
        <section key={run.phase} className={'active-view' + (run.pausedAt !== null ? ' paused' : '')}>
        <div className="phase-stepper" aria-label="Shower phases">{(['wet', 'soap', 'rinse', ...(run.settings.coldEnabled ? ['cold'] : [])] as Array<keyof typeof steps>).map((p, i, all) => {
          const current = all.indexOf(run.phase === 'coldReady' ? 'cold' : run.phase);
          return <span className={i === current ? 'current' : i < current ? 'done' : ''} aria-current={i === current ? 'step' : undefined} key={p}><span aria-hidden="true">{i < current ? '✓' : steps[p][0]}</span>{steps[p][1]}</span>;
        })}</div>
        <h1 className="active-title">{phaseInfo.title}</h1>
        <div className="ring-zone"><Ambient phase={run.phase} /><div className={'timer-ring ' + (ready || (surprise && !surpriseDone) ? 'mystery' : '')}>
          <svg className="ring-svg" viewBox="0 0 300 300" aria-hidden="true"><circle className="ring-track" cx="150" cy="150" r="138" /><circle className="ring-progress" cx="150" cy="150" r="138" strokeDasharray="867.08" strokeDashoffset={867.08 * (1 - progress)} /></svg>
          <div className="timer-content"><span className="phase-emoji">{phaseInfo.emoji}</span>{ready ? <><strong className="mystery-label">Your moment.</strong><small>Start when it’s cold</small></> : <><strong className="timer-number">{rinseOvertime ? `+${formatTime(time - limit!)}` : formatTime(limit !== null && !surprise ? Math.ceil(Math.max(0, limit - time)) : time)}</strong><small>{run.pausedAt !== null ? 'Paused' : rinseOvertime ? 'past your target' : surpriseDone ? `Surprise ${formatTime(limit!)} ✓` : surprise ? (run.settings.sound ? 'Wait for three beeps' : 'Sound is off') : limit !== null ? 'remaining' : 'elapsed'}</small></>}</div>
        </div></div>
        {run.phase === 'soap' && run.wetNeedsConfirmation && <div className="water-confirmation"><strong>When did you turn the water off?</strong><div><button className="secondary" onClick={() => { tap(run.settings); setRun(confirmWaterStop(run, Date.now(), 'onTime')); }}>Stopped on time</button><button className="secondary" onClick={() => { tap(run.settings); const at = Date.now(); setRun(confirmWaterStop(run, at, 'now')); setNow(at); setToast('Water time corrected. Soap timer starts now.'); }}>Water off just now</button></div></div>}
        {ready && run.settings.mode === 'measure' && run.coldSurprise !== null && <div className="segmented cold-choice" role="group" aria-label="Cold finish"><button aria-pressed={run.coldTarget === null} className={run.coldTarget === null ? 'selected' : ''} onClick={() => setRun(chooseCold(run, 'measure'))}><Clock3 size={18} />Just count</button><button aria-pressed={run.coldTarget !== null} className={run.coldTarget !== null ? 'selected' : ''} onClick={() => setRun(chooseCold(run, 'random'))}><Shuffle size={18} />Surprise me</button></div>}
        <PhaseLane phase={run.phase} progress={limit !== null && !surprise ? progress : null} overtime={rinseOvertime || surpriseDone} />
        {rinseOvertime ? <div className="stop-choice"><button className="primary secondary-tone" onClick={() => goNext('onTime')}>Stopped on time</button><button className="primary" onClick={() => goNext('now')}><Check size={19} />Stopped just now</button></div>
          : <button className="primary" onClick={() => goNext()}>{ready ? <><Snowflake size={19} />Start cold water</> : run.phase === 'wet' ? <>Time to soap up<ArrowRight size={19} /></> : run.phase === 'soap' ? <>Start rinsing<ArrowRight size={19} /></> : run.phase === 'rinse' && run.settings.coldEnabled ? <>Ready for cold<ArrowRight size={19} /></> : <><Check size={19} />{run.phase !== 'cold' ? 'Finish shower' : surpriseDone ? 'I’m done' : 'Finish now'}</>}</button>}
        <div className="active-actions">{undoButton('Undo')}{!ready && <button className="secondary" onClick={() => { tap(run.settings); setRun(togglePause(run, Date.now())); setNow(Date.now()); }}>{run.pausedAt !== null ? <Play size={16} /> : <Pause size={16} />}{run.pausedAt !== null ? 'Resume' : 'Pause'}</button>}{ready && <button className="secondary" onClick={() => { tap(run.settings); saveResult(finish(run, Date.now(), true)); }}>Skip cold</button>}<button className="text-button muted" onClick={() => setConfirmStop(true)}>End shower</button></div>
        {wakeProblem && <button className="wake-status text-button" onClick={wake.retry}><span className="status-dot warning" />Screen may sleep · retry</button>}
      </section></>}
      {result && !run && <section className="result-view"><div className="result-emoji">{result.complete ? '✨' : '🫧'}</div><div className="eyebrow">{result.complete ? 'FRESH CHAPTER. SAME YOU.' : 'STOPPED EARLY · SAVED'}</div><h1>{result.complete ? 'All refreshed.' : 'A moment, saved.'}</h1><div className="result-total"><strong>{formatTime(total(result))}</strong><span>your shower</span></div><div className="settings-card"><PhaseTimes session={result} /></div><button className="primary" onClick={() => { setResult(null); setUndo(null); }}>Lovely. All done.<Check size={19} /></button><div className="result-actions">{undoButton('Not done yet')}<button className="text-button" onClick={() => setPanel('history')}><History size={17} />View history</button></div></section>}
    </main>
    {!storageOk && <div className="persistent-notice" role="alert">Storage is unavailable. Settings and history won’t survive closing this page.</div>}
    {needRefresh && !run && <div className="update-banner">A fresh version is ready.<button className="text-button" onClick={() => void updateServiceWorker(true)}>Update</button></div>}
    {!panel && notification}
    {panel && <Sheet title={panel === 'menu' ? 'Make yourself at home.' : panel === 'settings' ? 'Your preferences' : panel === 'history' ? 'Your little rituals' : 'Try it out'} onClose={() => navigatePanel(null)} back={panel !== 'menu' ? () => navigatePanel('menu') : undefined}>
      {panel === 'menu' && <><p className="panel-intro">A few things, tucked away.</p><div className="menu-items">{([{ id: 'history', title: 'History & totals', description: 'See your rituals add up.', icon: <History /> }, { id: 'settings', title: 'Settings', description: 'Timings, theme & cold finish.', icon: <Settings2 /> }, { id: 'tests', title: 'Test the essentials', description: 'Check sound & screen awake.', icon: <FlaskConical /> }] as const).map(item => <button className="menu-item" key={item.id} onClick={() => setPanel(item.id)} disabled={!!run && item.id !== 'tests'}>{item.icon}<span className="row-copy"><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={18} /></button>)}</div>{run && <p className="hint">Your shower is running. Settings and history are available afterwards.</p>}<div className="menu-footer"><Droplets size={25} /><strong>Shower Timer</strong><small>Made for a slower moment. v{version}</small><p>Works offline after the first load.<br />No accounts. No tracking. No cloud.</p></div></>}
      {panel === 'settings' && <SettingsPanel settings={settings} onDraftChange={setSettingsDraft} onSave={s => { setData(d => ({ ...d, settings: s })); setSettingsDraft(null); setPanel(null); setToast('Your preferences are saved.'); }} />}
      {panel === 'history' && <><HistoryPanel sessions={data.sessions} onDelete={remove} />{data.sessions.length > 0 && <button className="text-button danger center" onClick={() => setConfirmClear(true)}><Trash2 size={16} />Clear all history</button>}</>}
      {panel === 'tests' && <><p className="panel-intro">A quick check before you step in.</p><div className="test-card"><Volume2 /><h3>Can you hear it?</h3><p>One beep for a warning. Three at the end.<br />Check your phone’s volume too.</p><div className="test-actions"><button className="secondary" onClick={async () => { const ok = await unlockAudio(); setSoundStatus(ok && beep('warning', settings.signal) ? 'Warning played — did you hear it?' : 'Audio unavailable'); }}>1 beep</button><button className="secondary" onClick={async () => { const ok = await unlockAudio(); setSoundStatus(ok && beep('end', settings.signal) ? 'End signal played — did you hear it?' : 'Audio unavailable'); }}>3 beeps</button></div><small role="status">{soundStatus}</small></div>
        <div className="test-card"><span className="vibration-icon" aria-hidden="true">📳</span><h3>Feel the signal</h3><p>Vibration depends on your browser, device and phone settings. iPhone/Safari does not support timer vibration.</p><button className="secondary" disabled={typeof navigator.vibrate !== 'function'} onClick={() => setVibrationStatus(vibrate('end') ? 'Request sent — did you feel three pulses?' : 'Vibration request was not accepted.')}>Test vibration</button><small role="status">{typeof navigator.vibrate === 'function' ? vibrationStatus : 'Not supported by this browser'}</small></div>
        <div className="test-card"><Sun /><h3>Stay awake</h3><p>Start this test and leave the screen untouched. It should stay on beyond your usual auto-lock time.</p><button className="secondary" disabled={!!run} onClick={() => setTestWake(v => !v)}>{run ? 'Active during your shower' : testWake ? 'Stop screen test' : 'Test screen awake'}</button><small role="status">Screen awake: {wake.status}</small></div><p className="hint">Sound tests play even when shower sound is off. Screen awake needs a supported browser and a secure connection. Test again on your phone before using it in the shower.</p></>}
    {notification}</Sheet>}
    {confirmStop && run && <Sheet title="Finish here?" onClose={() => setConfirmStop(false)}><p className="panel-intro">Save this shower as stopped early, discard it without saving, or keep going.</p><button className="primary" onClick={() => saveResult(finish(run, Date.now(), false))}>Save & end shower</button><button className="secondary full" onClick={() => setConfirmStop(false)}>Keep going</button><button className="text-button danger center" onClick={() => { setRun(null); setResult(null); setConfirmStop(false); setToast('Shower discarded. Nothing saved.'); }}><Trash2 size={16} />Discard shower</button></Sheet>}
    {confirmClear && <Sheet title="Clear your history?" onClose={() => setConfirmClear(false)}><p className="panel-intro">This permanently removes all shower entries on this device. Your preferences stay.</p><button className="primary destructive" onClick={() => { setData(d => ({ ...d, sessions: [] })); setDeleted(null); setConfirmClear(false); setToast('History cleared.'); }}>Clear all history</button><button className="secondary full" onClick={() => setConfirmClear(false)}>Keep my history</button></Sheet>}
    {pendingPanel && <Sheet title="Save your changes?" onClose={() => setPendingPanel(null)}>
      <p className="panel-intro">You’ve changed your preferences. Save them before leaving?</p>
      {pendingError && <p className="error" role="alert">{pendingError}</p>}
      <button className="primary" onClick={() => {
        if (!settingsDraft) return;
        const validation = settingsError(settingsDraft);
        if (validation) { setPendingError(validation); return; }
        setData(d => ({ ...d, settings: normalizeSettings(settingsDraft) }));
        setSettingsDraft(null); setPanel(pendingPanel.next); setPendingPanel(null); setToast('Your preferences are saved.');
      }}>Save changes</button>
      <button className="secondary full" onClick={() => setPendingPanel(null)}>Keep editing</button>
      <button className="text-button danger center" onClick={() => { setSettingsDraft(null); setPanel(pendingPanel.next); setPendingPanel(null); }}>Discard changes</button>
    </Sheet>}
  </div>;
}
