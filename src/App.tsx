import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Dumbbell, History, Info, MapPinned, Zap } from 'lucide-react';
import { workouts } from './data';
import type { PlyoProgress, RunSessionSummary, SessionLog, SessionStatus, Workout } from './types';
import { WorkoutDetail } from './components/WorkoutDetail';
import { GuidedTimer } from './components/GuidedTimer';
import { WorkoutHistory } from './components/WorkoutHistory';
import { MobileSyncSettings } from './components/MobileSyncSettings';
import { RunIntervals } from './components/RunIntervals';
import { MovementAnimation } from './components/MovementAnimation';
import { handleSpotifyRedirect } from './spotifyAuth';
import { isSyncConfigured, mergeLogs, readSyncConfig, saveSyncConfig, synchronizeTraining, verifyRemoteLogs, type SyncConfig, type SyncVerification } from './trainingSync';

type View = 'home' | 'plyo' | 'detail' | 'timer' | 'history' | 'run';
const STORAGE_KEY = 'scatto-forza-30-progress';
const LOG_KEY = 'scatto-forza-30-session-log';

function readProgress(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch { return new Set(); }
}
function readLogs(): SessionLog[] {
  try {
    const value = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [selected, setSelected] = useState<Workout | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState(false);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => readSyncConfig());
  const [syncState, setSyncState] = useState<'non_configurata' | 'sincronizzazione' | 'sincronizzata' | 'offline' | 'errore'>('non_configurata');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState('');
  const [syncVerification, setSyncVerification] = useState<SyncVerification | null>(null);
  const syncRunning = useRef(false);
  const syncAgain = useRef(false);
  const logsRef = useRef<SessionLog[]>([]);
  const completedRef = useRef<Set<string>>(new Set());
  logsRef.current = logs;
  completedRef.current = completed;

  useEffect(() => {
    // Non azzerare mai lo storico: al primo collegamento verrà migrato su PostgreSQL.
    setCompleted(readProgress());
    setLogs(readLogs());
    handleSpotifyRedirect().finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  }, [completed, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  }, [logs, ready]);

  const performSync = useCallback(async () => {
    if (!ready || !isSyncConfigured(syncConfig)) { setSyncState('non_configurata'); return; }
    if (!navigator.onLine) { setSyncState('offline'); return; }
    if (syncRunning.current) { syncAgain.current = true; return; }
    syncRunning.current = true;
    setSyncState('sincronizzazione');
    setSyncError('');
    try {
      // Snapshot first: the response must explicitly contain every ID sent by this device.
      const localLogs = logsRef.current;
      const remote = await synchronizeTraining({ logs: localLogs, completedWorkoutIds: [...completedRef.current] }, syncConfig);
      const verification = verifyRemoteLogs(localLogs, remote.logs ?? []);
      setSyncVerification(verification);
      setLogs(current => {
        const merged = mergeLogs(current, remote.logs ?? []);
        return JSON.stringify(merged) === JSON.stringify(current) ? current : merged;
      });
      setCompleted(current => {
        const merged = new Set([...current, ...(remote.completedWorkoutIds ?? [])]);
        return JSON.stringify([...merged].sort()) === JSON.stringify([...current].sort()) ? current : merged;
      });
      setLastSyncAt(new Date().toISOString());
      setSyncState('sincronizzata');
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sincronizzazione non riuscita');
      setSyncState(navigator.onLine ? 'errore' : 'offline');
    } finally {
      syncRunning.current = false;
      if (syncAgain.current) { syncAgain.current = false; window.setTimeout(() => void performSync(), 300); }
    }
  }, [ready, syncConfig]);

  useEffect(() => {
    if (!ready || !isSyncConfigured(syncConfig)) return;
    const timer = window.setTimeout(() => void performSync(), 900);
    const online = () => void performSync();
    window.addEventListener('online', online);
    return () => { window.clearTimeout(timer); window.removeEventListener('online', online); };
  }, [ready, syncConfig, logs, completed, performSync]);

  const updateSyncConfig = useCallback((config: SyncConfig) => {
    const clean = { apiUrl: config.apiUrl.trim().replace(/\/+$/, ''), token: config.token.trim() };
    saveSyncConfig(clean);
    setSyncConfig(clean);
    setSyncState(isSyncConfigured(clean) ? 'sincronizzazione' : 'non_configurata');
    setSyncError('');
  }, []);

  const doneCount = completed.size;
  const progress = Math.round(doneCount / workouts.length * 100);
  const allComplete = doneCount >= workouts.length;
  const nextWorkout = useMemo(
    () => workouts.find(workout => !completed.has(workout.id)) ?? workouts[workouts.length - 1],
    [completed],
  );
  const open = (workout: Workout) => {
    setSelected(workout);
    setView('detail');
    window.scrollTo(0, 0);
  };
  const startSession = useCallback((startedAt: string) => {
    if (!selected) return;
    const id = `${selected.id}-${startedAt}`;
    setLogs(previous => [{
      id,
      workoutId: selected.id,
      workoutTitle: `S${selected.week} · G${selected.day} — ${selected.title}`,
      startedAt,
      endedAt: null,
      durationSeconds: null,
      status: 'in_corso',
    }, ...previous.filter(item => item.id !== id)]);
  }, [selected]);
  const completeSession = useCallback((startedAt: string, endedAt: string, status: Extract<SessionStatus, 'completato' | 'interrotto'>, progress: PlyoProgress) => {
    if (!selected) return;
    const id = `${selected.id}-${startedAt}`;
    const durationSeconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
    // Only a fully completed workout unlocks the next programmed plyometric session.
    if (status === 'completato') setCompleted(previous => new Set(previous).add(selected.id));
    setLogs(previous => previous.map(item => item.id === id
      ? { ...item, endedAt, durationSeconds, status, ...progress }
      : item));
  }, [selected]);
  const completeRunSession = useCallback((summary: RunSessionSummary) => {
    const totalDistanceMeters = summary.repetitions.reduce((sum, rep) => sum + rep.distanceMeters, 0);
    const totalRunSeconds = summary.repetitions.reduce((sum, rep) => sum + rep.durationSeconds, 0);
    const averagePaceSecondsPerKm = totalDistanceMeters > 0
      ? totalRunSeconds / (totalDistanceMeters / 1000)
      : undefined;
    setLogs(previous => [{
      id: `run-${summary.startedAt}`,
      workoutId: `ripetute-${summary.targetMeters}m`,
      workoutTitle: `RIPETUTE · ${summary.repetitions.length} × ${summary.targetMeters} m`,
      startedAt: summary.startedAt,
      endedAt: summary.endedAt,
      durationSeconds: Math.max(0, Math.round((Date.parse(summary.endedAt) - Date.parse(summary.startedAt)) / 1000)),
      status: summary.status,
      runRepetitions: summary.repetitions,
      totalDistanceMeters,
      averagePaceSecondsPerKm,
    }, ...previous]);
  }, []);

  if (!ready) return <div className="h-screen flex items-center justify-center"><span className="loading loading-spinner loading-lg text-primary" /></div>;
  if (view === 'timer' && selected) return <main className="app-shell w-full p-3"><GuidedTimer workout={selected} onExit={() => setView('detail')} onStart={startSession} onComplete={completeSession} /></main>;
  if (view === 'detail' && selected) return <main className="app-shell w-full p-3"><WorkoutDetail workout={selected} onBack={() => setView('plyo')} onStart={() => setView('timer')} /></main>;
  if (view === 'history') return <main className="app-shell w-full p-3 space-y-4"><button className="btn btn-ghost btn-sm" onClick={() => setView('home')}><ArrowLeft size={18} /> Home</button><WorkoutHistory logs={logs} onClear={() => { if (window.confirm('Cancellare i dati soltanto da questo dispositivo? Le copie già sincronizzate resteranno nel database.')) { setLogs([]); setCompleted(new Set()); } }} /><MobileSyncSettings config={syncConfig} syncState={syncState} lastSyncAt={lastSyncAt} syncError={syncError} verification={syncVerification} onSaveConfig={updateSyncConfig} onSyncNow={() => void performSync()} /></main>;
  if (view === 'run') return <RunIntervals onExit={() => setView('home')} onComplete={completeRunSession} />;

  if (view === 'plyo') return <main className="app-shell plyo-shell w-full p-3 pb-10">
    <button className="btn btn-ghost btn-sm" onClick={() => setView('home')}><ArrowLeft size={18} /> Home</button>
    <section className="card bg-primary text-primary-content"><div className="card-body p-4">
      <span className="badge">PLIOMETRIA PROGRESSIVA</span>
      <h1 className="text-2xl font-bold">Il tuo prossimo allenamento</h1>
      <div><div className="flex justify-between text-sm"><span>{doneCount}/{workouts.length} completati</span><span>{progress}%</span></div><progress className="progress w-full" value={progress} max="100" /></div>
    </div></section>
    {allComplete ? <section className="card bg-base-200"><div className="card-body p-5 text-center space-y-3"><CheckCircle2 size={52} className="mx-auto text-success" /><h2 className="text-2xl font-bold">Programma completato</h2><p>Hai terminato tutte le sedute previste.</p></div></section>
      : <button className="next-plyo-card card bg-base-200 w-full text-left border border-primary/30" onClick={() => open(nextWorkout)}>
        <div className="plyo-preview-video" aria-hidden="true"><MovementAnimation kind={nextWorkout.exercises.find(e => ['pogo','squat','broad','lateral','lateralfeet','split','bounds','feet','sprint','calf'].includes(e.id))?.kind ?? 'warmup'} active id={nextWorkout.exercises.find(e => ['pogo','squat','broad','lateral','lateralfeet','split','bounds','feet','sprint','calf'].includes(e.id))?.id} showFullscreen={false} /></div>
        <div className="card-body plyo-next-copy"><div className="flex items-center justify-between gap-3"><div><span className="badge badge-secondary">SEDUTA SBLOCCATA</span><h2 className="font-bold text-2xl mt-2">S{nextWorkout.week} · G{nextWorkout.day}</h2><h3 className="font-semibold text-lg">{nextWorkout.title}</h3><p className="text-sm text-base-content/60 mt-1">{nextWorkout.duration} · {nextWorkout.focus}</p></div><span className="btn btn-primary btn-circle plyo-open"><Zap /></span></div></div>
      </button>}
    <div className="alert alert-warning text-sm"><Info size={18} /> La seduta successiva si sblocca solo dopo aver completato quella corrente. Mantieni almeno 48 ore di recupero.</div>
  </main>;

  return <main className="app-shell home-shell w-full p-3 pb-10">
    <header className="home-header"><span className="badge badge-primary">SCATTO FORZA 30</span><h1>Scegli l’allenamento</h1><p>Due modalità, nessuna confusione.</p></header>
    <div className="home-choice-grid">
      <button className="home-choice home-choice-run" onClick={() => setView('run')}><MapPinned /><span><strong>RIPETUTE</strong><small>400 · 800 · 1.000 metri · GPS live</small></span></button>
      <button className="home-choice home-choice-plyo" onClick={() => setView('plyo')}><Dumbbell /><span><strong>PLIOMETRIA</strong><small>{allComplete ? 'Programma completato' : `Prossima: S${nextWorkout.week} · G${nextWorkout.day} — ${nextWorkout.title}`}</small></span></button>
    </div>
    <div className="home-secondary-actions">
      <button className="btn w-full" onClick={() => setView('history')}><History size={19} /> Registro allenamenti <span className="badge badge-outline">{logs.length}</span></button>
      <p className={`home-sync-status ${syncState === 'sincronizzata' && syncVerification?.verified ? 'is-verified' : ''}`}>
        {syncState === 'sincronizzata' && syncVerification?.verified
          ? `Online verificati: ${syncVerification.localCount}/${syncVerification.localCount} locali · ${syncVerification.onlineCount} nel registro`
          : syncState === 'sincronizzazione' ? 'Verifica salvataggio online in corso…'
            : syncState === 'offline' ? 'Registro locale: invio appena torna la rete'
              : syncState === 'errore' ? 'Registro locale: ultimo invio da riprovare'
                : 'Registro locale · collega il salvataggio online nelle impostazioni'}
      </p>
      <button className="btn btn-ghost btn-sm w-full" onClick={() => setInfo(value => !value)}><Info size={16} /> Come usare l’app</button>
      {info && <div className="card bg-base-200"><div className="card-body p-4 text-sm space-y-2"><p><strong>Ripetute:</strong> scegli 8×400, 6×800 o 5×1.000 metri con recuperi fissi.</p><p><strong>Pliometria:</strong> mostra soltanto la prossima seduta prevista; le successive restano bloccate.</p><p>Collega le cuffiette e mantieni almeno 48 ore tra due sedute pliometriche.</p></div></div>}
    </div>
  </main>;
}
