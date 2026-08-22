import { useCallback, useEffect, useMemo, useState } from 'react'; 
import { ArrowLeft, CheckCircle2, Dumbbell, History, Info, MapPinned, Zap } from 'lucide-react';
import { workouts } from './data';
import type { SessionLog, Workout } from './types';
import { WorkoutDetail } from './components/WorkoutDetail';
import { GuidedTimer } from './components/GuidedTimer';
import { WorkoutHistory } from './components/WorkoutHistory';
import { RunIntervals } from './components/RunIntervals';
import { MovementAnimation } from './components/MovementAnimation';
import { handleSpotifyRedirect } from './spotifyAuth';

type View = 'home' | 'plyo' | 'detail' | 'timer' | 'history' | 'run';
const STORAGE_KEY = 'scatto-forza-30-progress';
const LOG_KEY = 'scatto-forza-30-session-log';
const RESET_KEY = 'scatto-forza-30-reset-2026-08-22';

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

  useEffect(() => {
    // Azzeramento unico richiesto il 22/08/2026: conserva Spotify e preferenze musicali.
    if (!localStorage.getItem(RESET_KEY)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LOG_KEY);
      localStorage.setItem(RESET_KEY, 'done');
    }
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
  const completeSession = useCallback((startedAt: string, endedAt: string) => {
    if (!selected) return;
    const id = `${selected.id}-${startedAt}`;
    const durationSeconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
    setCompleted(previous => new Set(previous).add(selected.id));
    setLogs(previous => previous.map(item => item.id === id
      ? { ...item, endedAt, durationSeconds, status: 'completato' }
      : item));
  }, [selected]);

  if (!ready) return <div className="h-screen flex items-center justify-center"><span className="loading loading-spinner loading-lg text-primary" /></div>;
  if (view === 'timer' && selected) return <main className="app-shell w-full p-3"><GuidedTimer workout={selected} onExit={() => setView('detail')} onStart={startSession} onComplete={completeSession} /></main>;
  if (view === 'detail' && selected) return <main className="app-shell w-full p-3"><WorkoutDetail workout={selected} onBack={() => setView('plyo')} onStart={() => setView('timer')} /></main>;
  if (view === 'history') return <main className="app-shell w-full p-3 space-y-4"><button className="btn btn-ghost btn-sm" onClick={() => setView('home')}><ArrowLeft size={18} /> Home</button><WorkoutHistory logs={logs} onClear={() => { if (window.confirm('Cancellare tutto il registro e i progressi salvati? Non si può annullare.')) { setLogs([]); setCompleted(new Set()); } }} /></main>;
  if (view === 'run') return <RunIntervals onExit={() => setView('home')} />;

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
      <button className="home-choice home-choice-run" onClick={() => setView('run')}><MapPinned /><span><strong>RIPETUTE</strong><small>Serie sui 1000 metri · GPS live</small></span></button>
      <button className="home-choice home-choice-plyo" onClick={() => setView('plyo')}><Dumbbell /><span><strong>PLIOMETRIA</strong><small>{allComplete ? 'Programma completato' : `Prossima: S${nextWorkout.week} · G${nextWorkout.day} — ${nextWorkout.title}`}</small></span></button>
    </div>
    <div className="home-secondary-actions">
      <button className="btn w-full" onClick={() => setView('history')}><History size={19} /> Registro allenamenti <span className="badge badge-outline">{logs.length}</span></button>
      <button className="btn btn-ghost btn-sm w-full" onClick={() => setInfo(value => !value)}><Info size={16} /> Come usare l’app</button>
      {info && <div className="card bg-base-200"><div className="card-body p-4 text-sm space-y-2"><p><strong>Ripetute:</strong> apre direttamente le serie sui 1000 metri.</p><p><strong>Pliometria:</strong> mostra soltanto la prossima seduta prevista; le successive restano bloccate.</p><p>Collega le cuffiette e mantieni almeno 48 ore tra due sedute pliometriche.</p></div></div>}
    </div>
  </main>;
}
