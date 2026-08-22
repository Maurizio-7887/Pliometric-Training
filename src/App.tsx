import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Dumbbell, Footprints, Gauge, History, Info, LogOut, MapPinned, Music, Zap } from 'lucide-react';
import { workouts } from './data';
import type { SessionLog, Workout } from './types';
import { WorkoutList } from './components/WorkoutList';
import { WorkoutDetail } from './components/WorkoutDetail';
import { GuidedTimer } from './components/GuidedTimer';
import { WorkoutHistory } from './components/WorkoutHistory';
import { RunIntervals } from './components/RunIntervals';
import { handleSpotifyRedirect, isSpotifyLoggedIn, loginWithSpotify, spotifyLogout } from './spotifyAuth';
import { getSpotifyLink, setSpotifyLink } from './spotify';

type View = 'home' | 'detail' | 'timer' | 'history' | 'run';
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

function SpotifyHomeCard() {
  const [spotify, setSpotify] = useState(getSpotifyLink());
  const [loggedIn, setLoggedIn] = useState(isSpotifyLoggedIn());
  const saveSpotify = (value: string) => { setSpotify(value); setSpotifyLink(value); };
  const logout = () => { spotifyLogout(); setLoggedIn(false); };

  return <section className="card bg-base-200 border-2 border-success/50 shadow-sm">
    <div className="card-body p-4 gap-3">
      <div className="flex items-center gap-2">
        <span className="btn btn-success btn-circle btn-sm pointer-events-none"><Music size={17} /></span>
        <div><h2 className="font-bold">Musica di sottofondo</h2><p className="text-xs text-base-content/60">Spotify · playlist o brano personale</p></div>
      </div>
      <input type="url" inputMode="url" aria-label="Link Spotify" placeholder="https://open.spotify.com/playlist/..." className="input input-bordered input-sm w-full" value={spotify} onChange={e => saveSpotify(e.target.value)} />
      {loggedIn ? <div className="flex items-center justify-between gap-2"><span className="text-xs text-success flex items-center gap-1"><CheckCircle2 size={14} /> Spotify connesso</span><button className="btn btn-ghost btn-xs" onClick={logout}><LogOut size={13} /> Disconnetti</button></div> : <button className="btn btn-success btn-sm" onClick={() => loginWithSpotify()}><Music size={15} /> COLLEGA SPOTIFY</button>}
      <p className="text-[11px] text-base-content/50">Con Spotify Premium la musica parte insieme al timer. La guida vocale resta udibile in cuffia.</p>
    </div>
  </section>;
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
  if (view === 'timer' && selected) return <main className="app-shell max-w-lg mx-auto p-4"><GuidedTimer workout={selected} onExit={() => setView('detail')} onStart={startSession} onComplete={completeSession} /></main>;
  if (view === 'detail' && selected) return <main className="app-shell max-w-lg mx-auto p-4"><WorkoutDetail workout={selected} onBack={() => setView('home')} onStart={() => setView('timer')} /></main>;
  if (view === 'history') return <main className="app-shell max-w-lg mx-auto p-4 space-y-4"><button className="btn btn-ghost btn-sm" onClick={() => setView('home')}><ArrowLeft size={18} /> Programma</button><WorkoutHistory logs={logs} onClear={() => { if (window.confirm('Cancellare tutto il registro e i progressi salvati? Non si può annullare.')) { setLogs([]); setCompleted(new Set()); } }} /></main>;
  if (view === 'run') return <RunIntervals onExit={() => setView('home')} />;

  return <main className="app-shell max-w-lg mx-auto p-4 pb-10 space-y-5">
    <section className="card bg-primary text-primary-content overflow-hidden"><div className="card-body p-5 relative"><div className="absolute right-3 top-3 opacity-20"><Zap size={90} /></div><span className="badge">PROGRAMMA 30 GIORNI</span><h1 className="text-2xl font-bold max-w-xs">Potenza gambe, rapidità e velocità</h1><p className="text-primary-content/75 text-sm">12 sedute guidate · corpo libero · 35–42 minuti</p><div className="mt-2"><div className="flex justify-between text-xs"><span>{doneCount}/12 completati</span><span>{progress}%</span></div><progress className="progress w-full" value={progress} max="100" /></div></div></section>
    <SpotifyHomeCard />
    <button className="card bg-base-200 w-full text-left border border-primary/30" onClick={() => open(nextWorkout)}><div className="card-body p-4"><div className="flex items-center justify-between"><div><span className="badge badge-secondary">PROSSIMO</span><h2 className="font-bold text-lg mt-2">S{nextWorkout.week} · G{nextWorkout.day} — {nextWorkout.title}</h2><p className="text-sm text-base-content/60">{nextWorkout.duration} · {nextWorkout.focus}</p></div><span className="btn btn-primary btn-circle"><Zap /></span></div></div></button>
    <div className="grid grid-cols-3 gap-2 text-center"><div className="stat bg-base-200 rounded-box p-3"><Dumbbell className="mx-auto text-primary" /><div className="text-xs mt-1">Potenza</div></div><div className="stat bg-base-200 rounded-box p-3"><Footprints className="mx-auto text-primary" /><div className="text-xs mt-1">Rapidità</div></div><div className="stat bg-base-200 rounded-box p-3"><Gauge className="mx-auto text-primary" /><div className="text-xs mt-1">Velocità</div></div></div>
    <button className="card bg-base-200 w-full text-left border border-primary/20" onClick={() => setView('run')}><div className="card-body p-4 flex-row items-center justify-between"><div className="flex items-center gap-2"><MapPinned size={19} className="text-primary" /><div><span className="font-semibold block">Serie sui 1000 metri</span><span className="text-xs text-base-content/60">GPS live · ripetute a distanza</span></div></div><Zap size={18} className="text-primary" /></div></button>
    <WorkoutList workouts={workouts} selectedWeek={week} onWeek={setWeek} onOpen={open} completed={completed} />
    <button className="card bg-base-200 w-full text-left" onClick={() => setView('history')}><div className="card-body p-4 flex-row items-center justify-between"><div className="flex items-center gap-2"><History size={19} className="text-primary" /><span className="font-semibold">Registro allenamenti</span></div><span className="badge badge-outline">{logs.length}</span></div></button>
    <button className="btn btn-ghost btn-sm w-full" onClick={() => setInfo(v => !v)}><Info size={16} /> Come usare il programma</button>
    {info && <div className="card bg-base-200"><div className="card-body p-4 text-sm space-y-2"><p><strong>1.</strong> Collega le cuffiette prima di premere START.</p><p><strong>2.</strong> Usa prato regolare, pista o pavimento sportivo; non asfalto.</p><p><strong>3.</strong> Mantieni almeno 48 ore tra le sedute. Se hai una gara o un lavoro di sprint intenso, non sommare questa seduta nello stesso giorno.</p><p><strong>4.</strong> Il corpetto è facoltativo e indicato solo in due esercizi: 3–5% del peso corporeo, esclusivamente con tecnica solida.</p><p><strong>5.</strong> Il timer stima il tempo per le ripetizioni: se termini prima, resta fermo e recupera.</p></div></div>}
  </main>;
}
