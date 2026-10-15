import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Droplets, FlaskConical, History, Menu, Moon, Pause, Play, Settings2, ShieldCheck, Snowflake, Sun, Trash2, Volume2, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { advance, confirmWaterStop, elapsed, finish, formatTime, normalizeSettings, phaseLimit, startRun, togglePause, total, wetDeadline } from './domain';
import type { Phase, Run, Session, Settings } from './domain';
import { readData, saveData } from './storage';
import { beep, unlockAudio, vibrate } from './audio';
import { Share } from './Share';
import { version } from '../package.json';

type Panel = 'menu' | 'settings' | 'history' | 'tests' | null;
const phaseText: Record<Phase, { title: string; caption: string; emoji: string }> = {
  wet: { title: 'Ease into it.', caption: 'Water on. Let the day wash away.', emoji: '🚿' },
  soap: { title: 'Lather. Breathe.', caption: 'Water off. Take all the time you need.', emoji: '🫧' },
  rinse: { title: 'A fresh start.', caption: 'Water on. Rinse it all away.', emoji: '💧' },
  coldReady: { title: 'Ready for a reset?', caption: 'Turn the water cold. Start when you’re ready.', emoji: '❄️' },
  cold: { title: 'Find your calm.', caption: 'One breath at a time. You can stop whenever you like.', emoji: '❄️' }
};

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
  return <dialog ref={ref} className="sheet" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
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
    <label><input type="number" min="0" max="60" required value={Math.floor(value / 60)} onChange={e => onChange(Number(e.target.value) * 60 + value % 60)} inputMode="numeric" /><span>min</span></label>
    <span className="colon">:</span>
    <label><input type="number" min="0" max="59" required value={value % 60} onChange={e => onChange(Math.floor(value / 60) * 60 + Number(e.target.value))} inputMode="numeric" /><span>sec</span></label>
  </div></fieldset>;
}

function SettingsPanel({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => void }) {
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState('');
  const patch = (values: Partial<Settings>) => setDraft(s => ({ ...s, ...values }));
  return <form onSubmit={e => {
    e.preventDefault();
    if (draft.wet < 1 || draft.rinse < 1 || draft.wet > 3600 || draft.rinse > 3600) { setError('Choose a duration between 1 second and 60 minutes.'); return; }
    if (draft.wetWarning >= draft.wet || draft.rinseWarning >= draft.rinse) { setError('Each warning must be shorter than its phase. Use 0 to turn it off.'); return; }
    if (draft.coldMin < 1 || draft.coldMax < draft.coldMin || draft.coldMax > 3600) { setError('Cold range: minimum 1 second, maximum 60 minutes, and max must be at least min.'); return; }
    onSave(normalizeSettings(draft));
  }}>
    <p className="panel-intro">Set it once. Make it your ritual.</p>
    <h3>Appearance</h3><div className="segmented"><button type="button" className={draft.theme === 'dark' ? 'selected' : ''} onClick={() => patch({ theme: 'dark' })}><Moon size={17} />Dark</button><button type="button" className={draft.theme === 'light' ? 'selected' : ''} onClick={() => patch({ theme: 'light' })}><Sun size={17} />Light</button></div>
    <h3>Guided shower</h3><div className="settings-card">
      <DurationInput label="🚿 Get wet" value={draft.wet} onChange={wet => patch({ wet })} />
      <label className="number-row">Warn me before the end <span><input type="number" min="0" max="3599" value={draft.wetWarning} required onChange={e => patch({ wetWarning: Number(e.target.value) })} /> sec</span></label>
      <div className="divider" /><DurationInput label="💧 Rinse off" value={draft.rinse} onChange={rinse => patch({ rinse })} />
      <label className="number-row">Warn me before the end <span><input type="number" min="0" max="3599" value={draft.rinseWarning} required onChange={e => patch({ rinseWarning: Number(e.target.value) })} /> sec</span></label>
    </div><p className="hint">Soaping has no time limit. Set a warning to 0 for no warning.</p>
    <h3>Sound & vibration</h3><div className="settings-card"><Toggle checked={draft.sound} onChange={sound => patch({ sound })} label="Beep alerts" description="One for a warning. Three when time is up." icon={<Volume2 size={20} />} />
      {draft.sound && <><div className="segmented"><button type="button" className={draft.signal === 'gentle' ? 'selected' : ''} onClick={() => patch({ signal: 'gentle' })}>Gentle</button><button type="button" className={draft.signal === 'strong' ? 'selected' : ''} onClick={() => patch({ signal: 'strong' })}>Louder & longer</button></div><button type="button" className="text-button" onClick={async () => { if (await unlockAudio()) beep('end', draft.signal); }}>Preview 3 beeps</button><p className="hint">Your phone’s media volume controls the final loudness.</p></>}
      <div className="divider" /><Toggle checked={draft.vibration} onChange={vibration => patch({ vibration })} label="Vibrate with alerts" description="Optional extra feedback on supported phones." />
      <p className="hint">{typeof navigator.vibrate === 'function' ? 'This browser exposes vibration. Try the vibration test on your phone to check the hardware.' : 'Vibration alerts are not supported by this browser. Use sound on iPhone/Safari.'}</p>
    </div>
    <h3>Cold finish</h3><div className="settings-card"><Toggle checked={draft.coldEnabled} onChange={coldEnabled => patch({ coldEnabled })} label="Finish with cold water" description="Always starts with your own tap." icon={<Snowflake size={20} />} />
      {draft.coldEnabled && <><div className="divider" /><div className="segmented"><button type="button" className={draft.coldMode === 'measure' ? 'selected' : ''} onClick={() => patch({ coldMode: 'measure' })}>Measure</button><button type="button" className={draft.coldMode === 'random' ? 'selected' : ''} onClick={() => patch({ coldMode: 'random' })}>Surprise me</button></div>
        <p className="hint">{draft.coldMode === 'random' ? 'A random duration within your range. No countdown or warning gives it away.' : 'An open-ended stopwatch. Finish whenever you’re ready.'}</p>
        {draft.coldMode === 'random' && <div className="range-inputs"><DurationInput label="Minimum" value={draft.coldMin} onChange={coldMin => patch({ coldMin })} /><DurationInput label="Maximum" value={draft.coldMax} onChange={coldMax => patch({ coldMax })} /></div>}
      </>}
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
  const [toast, setToast] = useState('');
  const [deleted, setDeleted] = useState<Session | null>(null);
  const [testWake, setTestWake] = useState(false);
  const [soundStatus, setSoundStatus] = useState('Not tested');
  const [vibrationStatus, setVibrationStatus] = useState('Not tested');
  const [storageOk, setStorageOk] = useState(true);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const wake = useWakeLock(!!run || testWake);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const warned = useRef<string | null>(null);
  const endSignalled = useRef<string | null>(null);
  const runRef = useRef(run); runRef.current = run;
  const settings = data.settings;

  useEffect(() => { setStorageOk(saveData(data)); }, [data]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#10191e' : '#f3f7f5');
  }, [settings.theme]);
  useEffect(() => { if (!run) return; const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, [!!run]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => { setToast(''); setDeleted(null); }, 6000); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (panel !== 'tests') setTestWake(false); }, [panel]);
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible' && runRef.current) { setNow(Date.now()); setToast('Welcome back. Timing has caught up; background beeps may have been missed.'); }
    };
    document.addEventListener('visibilitychange', onReturn);
    const onUnload = (e: BeforeUnloadEvent) => { if (runRef.current) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => { document.removeEventListener('visibilitychange', onReturn); window.removeEventListener('beforeunload', onUnload); };
  }, []);
  const saveResult = useCallback((session: Session) => {
    setData(d => ({ ...d, sessions: [session, ...d.sessions] }));
    setResult(session); setRun(null); setConfirmStop(false);
  }, []);
  const goNext = (when: 'onTime' | 'now' = 'now') => {
    if (!run) return;
    const at = Date.now(), stopped = run.phase === 'rinse' ? confirmWaterStop(run, at, when) : run, next = advance(stopped, at);
    if (next) { setRun(next); setNow(at); } else saveResult(finish(stopped, at, true));
  };
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
      // Rinse keeps measuring overtime until the user confirms when the water stopped.
      else if (run.phase === 'cold') saveResult(finish(run, run.phaseStartedAt + limit * 1000, true));
    } else if (warning > 0 && spent >= limit - warning) {
      if (warned.current !== id) {
        warned.current = id;
        if (run.settings.sound && !beep('warning', run.settings.signal)) setToast('Sound is unavailable.');
        if (run.settings.vibration) vibrate('warning');
      }
    }
  }, [run, now, saveResult]);
  const patchSettings = (patch: Partial<Settings>) => setData(d => ({ ...d, settings: normalizeSettings({ ...d.settings, ...patch }) }));
  const start = () => {
    if (settings.sound) void unlockAudio().then(ok => { if (!ok) setToast('Audio could not start. Try the sound test in the menu.'); });
    const at = Date.now(); warned.current = null; endSignalled.current = null; setResult(null); setNow(at); setRun(startRun(settings, at));
  };
  const remove = (id: string) => {
    const session = data.sessions.find(s => s.id === id);
    if (session) { setDeleted(session); setData(d => ({ ...d, sessions: d.sessions.filter(s => s.id !== id) })); setToast('Shower deleted.'); }
  };
  const time = run ? elapsed(run, now) : 0;
  const limit = run ? phaseLimit(run) : null;
  const hidden = run?.phase === 'cold' && run.coldTarget !== null;
  const ready = run?.phase === 'coldReady';
  const rinseOvertime = run?.phase === 'rinse' && limit !== null && time >= limit;
  const phaseInfo = run ? phaseText[run.phase] : null;
  const progress = run && limit && !hidden ? Math.min(1, time / limit) : 0;
  const latest = data.sessions.find(s => s.complete);
  const notification = toast && <div className="toast" role="status"><span>{toast}</span>{deleted && <button onClick={() => { setData(d => ({ ...d, sessions: [...d.sessions, deleted].sort((a, b) => b.startedAt - a.startedAt) })); setDeleted(null); setToast('Restored.'); }}>Undo</button>}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>;

  return <div className="app-shell">
    <header className="app-header"><a className="brand" href={import.meta.env.BASE_URL} onClick={e => { e.preventDefault(); if (!run) { setResult(null); setPanel(null); } }}><span className="brand-mark"><Droplets size={22} /></span><span>shower<span className="brand-light">timer</span><span className="brand-dot">.</span></span></a><button className="icon-button" aria-label="Open menu" onClick={() => setPanel('menu')}><Menu size={23} /></button></header>
    <main>
      {!run && !result && <>
        <div className="eyebrow"><span className="status-dot" />A LITTLE EVERYDAY RESET</div>
        <div className="hero"><h1>Your shower.<br /><em>Your pace.</em></h1><p>A moment to switch off.<br />We’ll keep an eye on the time.</p></div>
        <div className="water-scene" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><div className="drop"><span /></div><span className="bubble bubble-one" /><span className="bubble bubble-two" /><span className="bubble bubble-three" /><span className="scene-spark">✦</span><span className="scene-caption">a fresh start, every time</span></div>
        <div className="mode-switch segmented" aria-label="Shower mode"><button className={settings.mode === 'guided' ? 'selected' : ''} onClick={() => patchSettings({ mode: 'guided' })}><Droplets size={18} />Guide me</button><button className={settings.mode === 'measure' ? 'selected' : ''} onClick={() => patchSettings({ mode: 'measure' })}><Clock3 size={18} />Just measure</button></div>
        <p className="mode-caption">{settings.mode === 'guided' ? 'A gentle nudge. An unhurried lather.' : 'No targets. Find out what your shower looks like.'}</p>
        <button className="routine-card" onClick={() => setPanel('settings')} aria-label="Change shower timings"><span><span className="routine-emoji">🚿</span><strong>{settings.mode === 'guided' ? formatTime(settings.wet) : 'Get wet'}</strong><small>{settings.mode === 'guided' ? 'get wet' : 'tap to move on'}</small></span><ChevronRight size={14} /><span><span className="routine-emoji">🫧</span><strong>No rush</strong><small>soap up</small></span><ChevronRight size={14} /><span><span className="routine-emoji">💧</span><strong>{settings.mode === 'guided' ? formatTime(settings.rinse) : 'Rinse off'}</strong><small>{settings.mode === 'guided' ? 'rinse off' : 'tap to finish'}</small></span><Settings2 className="routine-edit" size={15} /></button>
        <div className={'cold-card ' + (settings.coldEnabled ? 'enabled' : '')}><Toggle checked={settings.coldEnabled} onChange={coldEnabled => patchSettings({ coldEnabled })} label="A cold finish?" description={settings.coldEnabled ? settings.coldMode === 'random' ? `Surprise · ${formatTime(settings.coldMin)}–${formatTime(settings.coldMax)}` : 'Measure your moment of cold' : 'A little extra reset. Entirely optional.'} icon={<Snowflake size={22} />} />{settings.coldEnabled && <button className="cold-config text-button" onClick={() => setPanel('settings')}>Change cold finish<ChevronRight size={14} /></button>}</div>
        <button className="primary start-button" onClick={start}><Play size={19} fill="currentColor" />Start my shower<ArrowRight size={19} /></button>
        <p className="below-button">Set your phone down. Take a breath.</p>
        {latest && <button className="last-shower" onClick={() => setPanel('history')}><History size={15} />Last shower <strong>{formatTime(total(latest))}</strong><ChevronRight size={15} /></button>}
      </>}
      {run && phaseInfo && <section className={'active-view ' + (run.phase.startsWith('cold') ? 'is-cold ' : '') + (run.wetNeedsConfirmation || rinseOvertime ? 'awaiting-water-stop' : '')}>
        <div className="phase-stepper" aria-label="Current phase">{(['wet', 'soap', 'rinse', ...(run.settings.coldEnabled ? ['cold'] : [])] as Phase[]).map((p, i) => <span className={run.phase === p || (p === 'cold' && ready) ? 'current' : ''} key={p}><span>{i + 1}</span>{p === 'wet' ? 'Wet' : p === 'soap' ? 'Soap' : p === 'rinse' ? 'Rinse' : 'Cold'}</span>)}</div>
        <div className="active-heading"><h1>{phaseInfo.title}</h1><p>{phaseInfo.caption}</p></div>
        <div className={'timer-ring ' + (hidden || ready ? 'mystery' : '')}>
          <svg className="ring-svg" viewBox="0 0 300 300" aria-hidden="true"><circle className="ring-track" cx="150" cy="150" r="138" /><circle className="ring-progress" cx="150" cy="150" r="138" strokeDasharray="867.08" strokeDashoffset={867.08 * (1 - progress)} /></svg>
          <div className="timer-content"><span className="phase-emoji">{phaseInfo.emoji}</span>{hidden || ready ? <><strong className="mystery-label">{ready ? 'Your moment.' : 'Stay present.'}</strong><small>{ready ? 'Start when the water is cold' : run.pausedAt !== null ? 'Paused' : 'Listen for the three beeps'}</small></> : <><strong className="timer-number">{rinseOvertime ? `+${formatTime(time - limit!)}` : formatTime(limit !== null ? Math.ceil(Math.max(0, limit - time)) : time)}</strong><small>{run.pausedAt !== null ? 'Paused' : rinseOvertime ? 'past your target' : limit !== null ? 'remaining' : 'take your time'}</small></>}</div>
        </div>
        {run.phase === 'soap' && <p className="phase-note">No timer to beat. Tap below when you’re ready to rinse.</p>}
        {run.phase === 'soap' && run.wetNeedsConfirmation && <div className="water-confirmation"><strong>When did you turn the water off?</strong><p>Soap time starts at the beep. If you kept the water running, we’ll move that time back to Get wet.</p><div><button className="secondary" onClick={() => setRun(confirmWaterStop(run, Date.now(), 'onTime'))}>Stopped on time</button><button className="secondary" onClick={() => { const at = Date.now(); setRun(confirmWaterStop(run, at, 'now')); setNow(at); setToast('Water time corrected. Soap timer starts now.'); }}>Water off just now</button></div></div>}
        {hidden && !run.settings.sound && <p className="phase-note">Sound is off. The screen will change when you’re done.</p>}
        {rinseOvertime && <p className="phase-note">Still measuring. Did you stop at the beep, or just now?</p>}
        <button className="primary" onClick={() => goNext()}>{rinseOvertime ? <><Check size={19} />Stopped just now</> : ready ? <><Snowflake size={19} />Start cold water</> : run.phase === 'wet' ? <>Time to soap up<ArrowRight size={19} /></> : run.phase === 'soap' ? <>Start rinsing<ArrowRight size={19} /></> : run.phase === 'rinse' && run.settings.coldEnabled ? <>Ready for cold<ArrowRight size={19} /></> : <><Check size={19} />{run.phase === 'cold' ? 'Finish now' : 'Finish shower'}</>}</button>
        {rinseOvertime && <button className="secondary full" onClick={() => goNext('onTime')}>Stopped on time</button>}
        <div className="active-actions">{!ready && <button className="secondary" onClick={() => { setRun(togglePause(run, Date.now())); setNow(Date.now()); }}>{run.pausedAt !== null ? <Play size={16} /> : <Pause size={16} />}{run.pausedAt !== null ? 'Resume' : 'Pause'}</button>}{ready && <button className="secondary" onClick={() => saveResult(finish(run, Date.now(), true))}>Skip cold finish</button>}<button className="text-button muted" onClick={() => setConfirmStop(true)}>End shower</button></div>
        <button className="wake-status text-button" onClick={wake.retry}><span className={'status-dot ' + (wake.status === 'On' ? '' : 'warning')} />{wake.status === 'On' ? 'Keeping your screen awake' : `Screen awake: ${wake.status.toLowerCase()} · retry`}</button>
        {wake.status !== 'On' && <p className="hint">Keep the app visible. Screen lock and switching apps can interrupt sound.</p>}
      </section>}
      {result && !run && <section className="result-view"><div className="result-emoji">{result.complete ? '✨' : '🫧'}</div><div className="eyebrow">{result.complete ? 'FRESH CHAPTER. SAME YOU.' : 'SAVED TO YOUR HISTORY'}</div><h1>{result.complete ? 'All refreshed.' : 'A moment, saved.'}</h1><p>{result.complete ? 'A little reset goes a long way.' : 'This shower is marked as stopped early.'}</p><div className="result-total"><strong>{formatTime(total(result))}</strong><span>your shower</span></div><div className="settings-card"><PhaseTimes session={result} /></div><button className="primary" onClick={() => setResult(null)}>Lovely. All done.<Check size={19} /></button><button className="text-button center" onClick={() => setPanel('history')}><History size={17} />View history</button></section>}
    </main>
    {!run && <footer><ShieldCheck size={14} />Just you and your device. Always private.</footer>}
    {!storageOk && <div className="persistent-notice" role="alert">Storage is unavailable. Settings and history won’t survive closing this page.</div>}
    {needRefresh && !run && <div className="update-banner">A fresh version is ready.<button className="text-button" onClick={() => void updateServiceWorker(true)}>Update</button></div>}
    {!panel && notification}
    {panel && <Sheet title={panel === 'menu' ? 'Make yourself at home.' : panel === 'settings' ? 'Your preferences' : panel === 'history' ? 'Your little rituals' : 'Try it out'} onClose={() => setPanel(null)} back={panel !== 'menu' ? () => setPanel('menu') : undefined}>
      {panel === 'menu' && <><p className="panel-intro">A few things, tucked away.</p><div className="menu-items">{([{ id: 'history', title: 'History & totals', description: 'See your rituals add up.', icon: <History /> }, { id: 'settings', title: 'Settings', description: 'Timings, theme & cold finish.', icon: <Settings2 /> }, { id: 'tests', title: 'Test the essentials', description: 'Check sound & screen awake.', icon: <FlaskConical /> }] as const).map(item => <button className="menu-item" key={item.id} onClick={() => setPanel(item.id)} disabled={!!run && item.id !== 'tests'}>{item.icon}<span className="row-copy"><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={18} /></button>)}</div>{run && <p className="hint">Your shower is running. Settings and history are available afterwards.</p>}<div className="menu-footer"><Droplets size={25} /><strong>Shower Timer</strong><small>Made for a slower moment. v{version}</small><p>Works offline after the first load.<br />No accounts. No tracking. No cloud.</p></div></>}
      {panel === 'settings' && <SettingsPanel settings={settings} onSave={s => { setData(d => ({ ...d, settings: s })); setPanel(null); setToast('Your preferences are saved.'); }} />}
      {panel === 'history' && <><HistoryPanel sessions={data.sessions} onDelete={remove} />{data.sessions.length > 0 && <button className="text-button danger center" onClick={() => setConfirmClear(true)}><Trash2 size={16} />Clear all history</button>}</>}
      {panel === 'tests' && <><p className="panel-intro">A quick check before you step in.</p><div className="test-card"><Volume2 /><h3>Can you hear it?</h3><p>One beep for a warning. Three at the end.<br />Check your phone’s volume too.</p><div className="test-actions"><button className="secondary" onClick={async () => { const ok = await unlockAudio(); setSoundStatus(ok && beep('warning', settings.signal) ? 'Warning played — did you hear it?' : 'Audio unavailable'); }}>1 beep</button><button className="secondary" onClick={async () => { const ok = await unlockAudio(); setSoundStatus(ok && beep('end', settings.signal) ? 'End signal played — did you hear it?' : 'Audio unavailable'); }}>3 beeps</button></div><small role="status">{soundStatus}</small></div>
        <div className="test-card"><span className="vibration-icon" aria-hidden="true">📳</span><h3>Feel the signal</h3><p>Vibration depends on your browser, device and phone settings. iPhone/Safari does not support timer vibration.</p><button className="secondary" disabled={typeof navigator.vibrate !== 'function'} onClick={() => setVibrationStatus(vibrate('end') ? 'Request sent — did you feel three pulses?' : 'Vibration request was not accepted.')}>Test vibration</button><small role="status">{typeof navigator.vibrate === 'function' ? vibrationStatus : 'Not supported by this browser'}</small></div>
        <div className="test-card"><Sun /><h3>Stay awake</h3><p>Start this test and leave the screen untouched. It should stay on beyond your usual auto-lock time.</p><button className="secondary" disabled={!!run} onClick={() => setTestWake(v => !v)}>{run ? 'Active during your shower' : testWake ? 'Stop screen test' : 'Test screen awake'}</button><small role="status">Screen awake: {wake.status}</small></div><p className="hint">Sound tests play even when shower sound is off. Screen awake needs a supported browser and a secure connection. Test again on your phone before using it in the shower.</p></>}
    {notification}</Sheet>}
    {confirmStop && run && <Sheet title="Finish here?" onClose={() => setConfirmStop(false)}><p className="panel-intro">Save this shower as stopped early, discard it without saving, or keep going.</p><button className="primary" onClick={() => saveResult(finish(run, Date.now(), false))}>Save & end shower</button><button className="secondary full" onClick={() => setConfirmStop(false)}>Keep going</button><button className="text-button danger center" onClick={() => { setRun(null); setResult(null); setConfirmStop(false); setToast('Shower discarded. Nothing saved.'); }}><Trash2 size={16} />Discard shower</button></Sheet>}
    {confirmClear && <Sheet title="Clear your history?" onClose={() => setConfirmClear(false)}><p className="panel-intro">This permanently removes all shower entries on this device. Your preferences stay.</p><button className="primary destructive" onClick={() => { setData(d => ({ ...d, sessions: [] })); setDeleted(null); setConfirmClear(false); setToast('History cleared.'); }}>Clear all history</button><button className="secondary full" onClick={() => setConfirmClear(false)}>Keep my history</button></Sheet>}
  </div>;
}
