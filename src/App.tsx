import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dumbbell, Footprints, Gauge, Info, Zap } from 'lucide-react';
import { workouts } from './data';
import type { SessionLog, Workout } from './types';
import { WorkoutList } from './components/WorkoutList';
import { WorkoutDetail } from './components/WorkoutDetail';
import { GuidedTimer } from './components/GuidedTimer';
import { WorkoutHistory } from './components/WorkoutHistory';
import { handleSpotifyRedirect } from './spotifyAuth';

type View = 'home' | 'detail' | 'timer';
const STORAGE_KEY = 'scatto-forza-30-progress';
const LOG_KEY = 'scatto-forza-30-session-log';

function readProgress(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch { return new Set(); }
}
function readLogs(): SessionLog[] {
  try { const value=JSON.parse(localStorage.getItem(LOG_KEY)??'[]'); return Array.isArray(value)?value:[]; }
  catch { return []; }
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [selected, setSelected] = useState<Workout | null>(null);
  const [week, setWeek] = useState(1);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState(false);
  const [logs, setLogs] = useState<SessionLog[]>([]);

  useEffect(() => {
    const done = readProgress();
    setCompleted(done);
    setLogs(readLogs());
    const next = workouts.find(w => !done.has(w.id));
    if (next) setWeek(next.week);
    handleSpotifyRedirect().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  }, [completed, ready]);
  useEffect(() => { if (ready) localStorage.setItem(LOG_KEY, JSON.stringify(logs)); }, [logs, ready]);

  const doneCount = completed.size;
  const progress = Math.round(doneCount / 12 * 100);
  const open = (w: Workout) => { setSelected(w); setView('detail'); window.scrollTo(0, 0); };
  const startSession = useCallback((startedAt:string) => {
    if (!selected) return;
    const id=`${selected.id}-${startedAt}`;
    setLogs(prev=>[{id,workoutId:selected.id,workoutTitle:`S${selected.week} · G${selected.day} — ${selected.title}`,startedAt,endedAt:null,durationSeconds:null,status:'in_corso'},...prev.filter(x=>x.id!==id)]);
  }, [selected]);
  const completeSession = useCallback((startedAt:string,endedAt:string) => {
    if (!selected) return;
    const id=`${selected.id}-${startedAt}`; const durationSeconds=Math.max(0,Math.round((Date.parse(endedAt)-Date.parse(startedAt))/1000));
    setCompleted(prev => new Set(prev).add(selected.id));
    setLogs(prev=>prev.map(x=>x.id===id?{...x,endedAt,durationSeconds,status:'completato'}:x));
  }, [selected]);
  const nextWorkout = useMemo(() => workouts.find(w => !completed.has(w.id)) ?? workouts[11], [completed]);

  if (!ready) return <div className="h-screen flex items-center justify-center"><span className="loading loading-spinner loading-lg text-primary" /></div>;
  if (view === 'timer' && selected) return <main className="max-w-lg mx-auto p-4"><GuidedTimer workout={selected} onExit={() => setView('detail')} onStart={startSession} onComplete={completeSession} /></main>;
  if (view === 'detail' && selected) return <main className="max-w-lg mx-auto p-4"><WorkoutDetail workout={selected} onBack={() => setView('home')} onStart={() => setView('timer')} /></main>;

  return <main className="max-w-lg mx-auto p-4 pb-10 space-y-5">
    <section className="card bg-primary text-primary-content overflow-hidden"><div className="card-body p-5 relative"><div className="absolute right-3 top-3 opacity-20"><Zap size={90} /></div><span className="badge">PROGRAMMA 30 GIORNI</span><h1 className="text-2xl font-bold max-w-xs">Potenza gambe, rapidità e velocità</h1><p className="text-primary-content/75 text-sm">12 sedute guidate · corpo libero · 35–42 minuti</p><div className="mt-2"><div className="flex justify-between text-xs"><span>{doneCount}/12 completati</span><span>{progress}%</span></div><progress className="progress w-full" value={progress} max="100" /></div></div></section>
    <button className="card bg-base-200 w-full text-left border border-primary/30" onClick={() => open(nextWorkout)}><div className="card-body p-4"><div className="flex items-center justify-between"><div><span className="badge badge-secondary">PROSSIMO</span><h2 className="font-bold text-lg mt-2">S{nextWorkout.week} · G{nextWorkout.day} — {nextWorkout.title}</h2><p className="text-sm text-base-content/60">{nextWorkout.duration} · {nextWorkout.focus}</p></div><span className="btn btn-primary btn-circle"><Zap /></span></div></div></button>
    <div className="grid grid-cols-3 gap-2 text-center"><div className="stat bg-base-200 rounded-box p-3"><Dumbbell className="mx-auto text-primary" /><div className="text-xs mt-1">Potenza</div></div><div className="stat bg-base-200 rounded-box p-3"><Footprints className="mx-auto text-primary" /><div className="text-xs mt-1">Rapidità</div></div><div className="stat bg-base-200 rounded-box p-3"><Gauge className="mx-auto text-primary" /><div className="text-xs mt-1">Velocità</div></div></div>
    <WorkoutList workouts={workouts} selectedWeek={week} onWeek={setWeek} onOpen={open} completed={completed} />
    <WorkoutHistory logs={logs} />
    <button className="btn btn-ghost btn-sm w-full" onClick={() => setInfo(v => !v)}><Info size={16} /> Come usare il programma</button>
    {info && <div className="card bg-base-200"><div className="card-body p-4 text-sm space-y-2"><p><strong>1.</strong> Collega le cuffiette prima di premere START.</p><p><strong>2.</strong> Usa prato regolare, pista o pavimento sportivo; non asfalto.</p><p><strong>3.</strong> Mantieni almeno 48 ore tra le sedute. Se hai una gara o un lavoro di sprint intenso, non sommare questa seduta nello stesso giorno.</p><p><strong>4.</strong> Il corpetto è facoltativo e indicato solo in due esercizi: 3–5% del peso corporeo, esclusivamente con tecnica solida.</p><p><strong>5.</strong> Il timer stima il tempo per le ripetizioni: se termini prima, resta fermo e recupera.</p></div></div>}
  </main>;
}
