import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Music, Pause, Play, RotateCcw, SkipForward, Volume2 } from 'lucide-react';
import type { PlyoProgress, TimerCheckpoint, Workout } from '../types';
import { MovementAnimation } from './MovementAnimation';
import { getSpotifyLink, openSpotify } from '../spotify';
import { isSpotifyLoggedIn } from '../spotifyAuth';
import { activateSpotifyElement, pauseSpotifyPlayback, playSpotifyLink, prepareSpotifyPlayer, resumeSpotifyPlayback } from '../spotifyPlayer';
import { useScreenWakeLock } from '../useScreenWakeLock';

type Phase = 'ready' | 'work' | 'rest' | 'done';
interface Props { workout: Workout; checkpoint?: TimerCheckpoint | null; onCheckpoint: (checkpoint: TimerCheckpoint | null) => void; onExit: () => void; onStart: (startedAt: string) => void; onComplete: (startedAt: string, endedAt: string, status: 'completato' | 'interrotto', progress: PlyoProgress) => void; }

const say = (text: string) => {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'it-IT'; utterance.rate = .98; utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
};

/** Attende la fine reale del TTS: il countdown non può troncare “Preparati”. */
const sayAndWait = (text: string): Promise<void> => {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  window.speechSynthesis.cancel();
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT'; utterance.rate = .98; utterance.volume = 1;
    let finished = false;
    const finish = () => { if (!finished) { finished = true; resolve(); } };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
    // Salvagente per browser che, raramente, non emettono l'evento end.
    window.setTimeout(finish, 6000);
  });
};
const beep = () => {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new Ctx(), oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = 880; gain.gain.value = .09;
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .12);
  } catch { /* audio facoltativo */ }
};

export const GuidedTimer: React.FC<Props> = ({ workout, checkpoint, onCheckpoint, onExit, onStart, onComplete }) => {
  const restored = checkpoint?.kind === 'plyo' && checkpoint.workoutId === workout.id ? checkpoint : null;
  const [idx, setIdx] = useState(restored?.idx ?? 0);
  const [setNo, setSetNo] = useState(restored?.setNo ?? 1);
  const [phase, setPhase] = useState<Phase>(restored?.phase ?? 'ready');
  const [left, setLeft] = useState(restored?.left ?? 5);
  const [running, setRunning] = useState(false);
  const [resumedFromCheckpoint, setResumedFromCheckpoint] = useState(false);
  const [starting, setStarting] = useState(false);
  const startedAt = useRef<string | null>(restored?.startedAt ?? null);
  const deadline = useRef(0);
  const spokenSecond = useRef(-1);
  const spotifyStarted = useRef(false);
  const finalized = useRef(false);
  const [finishedStatus, setFinishedStatus] = useState<'completato' | 'interrotto' | null>(null);
  const { acquire: keepScreenOn, release: allowScreenLock, held: screenKeptOn, supported: wakeLockSupported } = useScreenWakeLock();
  const exercise = workout.exercises[idx];

  useEffect(() => {
    if (isSpotifyLoggedIn() && getSpotifyLink()) void prepareSpotifyPlayer();
  }, []);

  const progressAtStop = useCallback((includeFinishedWork = false): PlyoProgress => {
    const plannedSetCount = workout.exercises.reduce((sum, item) => sum + item.sets, 0);
    const completedBefore = workout.exercises.slice(0, idx).reduce((sum, item) => sum + item.sets, 0);
    const currentCompleted = Math.max(0, Math.min(exercise.sets,
      phase === 'rest' ? setNo : phase === 'work' ? setNo - 1 + (includeFinishedWork ? 1 : 0) : setNo - 1));
    return {
      plannedExerciseCount: workout.exercises.length,
      completedExerciseCount: Math.min(workout.exercises.length, idx + (currentCompleted >= exercise.sets ? 1 : 0)),
      plannedSetCount,
      completedSetCount: Math.min(plannedSetCount, completedBefore + currentCompleted),
    };
  }, [workout.exercises, idx, exercise.sets, phase, setNo]);

  const finishSession = useCallback((status: 'completato' | 'interrotto', includeFinishedWork = false) => {
    if (finalized.current) return;
    onCheckpoint(null);
    finalized.current = true;
    deadline.current = 0;
    setRunning(false);
    setPhase('done');
    setFinishedStatus(status);
    void allowScreenLock();
    window.speechSynthesis?.cancel();
    const endedAt = new Date().toISOString();
    onComplete(startedAt.current ?? endedAt, endedAt, status, progressAtStop(includeFinishedWork));
  }, [allowScreenLock, onCheckpoint, onComplete, progressAtStop]);

  const next = useCallback(() => {
    deadline.current = 0; spokenSecond.current = -1;
    if (phase === 'ready') { setPhase('work'); setLeft(exercise.work); return; }
    if (phase === 'work' && exercise.rest > 0) { setPhase('rest'); setLeft(exercise.rest); return; }
    if ((phase === 'work' || phase === 'rest') && setNo < exercise.sets) { setSetNo(n => n + 1); setPhase('ready'); setLeft(5); return; }
    if (idx < workout.exercises.length - 1) { setIdx(n => n + 1); setSetNo(1); setPhase('ready'); setLeft(5); return; }
    // Reaching this branch means the final work interval has elapsed, so count it as completed.
    finishSession('completato', phase === 'work');
  }, [phase, exercise, setNo, idx, workout.exercises.length, finishSession]);

  useEffect(() => {
    if (!running || phase === 'done') return;
    // In fase ready il parlato iniziale è gestito e atteso da start(), senza timer sovrapposti.
    if (phase === 'work') { beep(); say(`Via. ${exercise.name}. ${exercise.prescription}`); }
    if (phase === 'rest') say(`Stop. Recupero ${exercise.rest} secondi`);
  }, [running, phase, idx, setNo, exercise]);

  useEffect(() => {
    if (!running || phase === 'done') return;
    if (!deadline.current) deadline.current = performance.now() + left * 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000));
      setLeft(current => current === remaining ? current : remaining);
      if (remaining !== spokenSecond.current) {
        spokenSecond.current = remaining;
        if (phase === 'ready' && remaining > 0 && remaining <= 5) { beep(); say(String(remaining)); }
        else if ((phase === 'work' || phase === 'rest') && remaining > 0 && remaining <= 3) { beep(); say(String(remaining)); }
        else if ((phase === 'work' || phase === 'rest') && remaining === 10) say('10 secondi');
      }
      if (remaining === 0) next();
    };
    tick();
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [running, phase, idx, setNo, next]);

  useEffect(() => {
    if (phase === 'work' && running && !spotifyStarted.current && isSpotifyLoggedIn() && getSpotifyLink()) {
      spotifyStarted.current = true;
      void playSpotifyLink(getSpotifyLink());
    }
    if (phase === 'done' && finishedStatus === 'completato') say('Allenamento completato. Ottimo lavoro.');
  }, [phase, running, finishedStatus]);

  const start = async () => {
    if (starting) return;
    setResumedFromCheckpoint(true);
    const firstStart = !startedAt.current;
    if (firstStart) {
      setStarting(true);
      startedAt.current = new Date().toISOString();
      onStart(startedAt.current);
      // Entrambe le richieste partono dal gesto dell'utente: audio mobile e schermo sempre acceso.
      void keepScreenOn();
      activateSpotifyElement();
      await sayAndWait('Preparati');
      // A termination during the spoken preparation must not restart the timer afterwards.
      if (finalized.current) { setStarting(false); return; }
      // Spotify NON parte qui: il countdown 5-4-3-2-1 deve restare senza musica.
      // Il PLAY viene inviato solo al passaggio dalla fase ready alla fase work.
      setLeft(5);
      deadline.current = performance.now() + 5000;
      spokenSecond.current = -1;
      setRunning(true);
      setStarting(false);
    } else {
      if (spotifyStarted.current && isSpotifyLoggedIn()) await resumeSpotifyPlayback();
      deadline.current = performance.now() + left * 1000;
      spokenSecond.current = -1;
      setRunning(true);
    }
    void keepScreenOn();
  };
  const saveCheckpoint = () => { if (startedAt.current && !finalized.current && phase !== 'done') onCheckpoint({ kind: 'plyo', workoutId: workout.id, startedAt: startedAt.current, idx, setNo, phase, left, savedAt: new Date().toISOString() }); };
  const pause = () => { if (!running && !startedAt.current) return; setRunning(false); deadline.current = 0; void allowScreenLock(); if (isSpotifyLoggedIn()) void pauseSpotifyPlayback(); saveCheckpoint(); };
  useEffect(() => { const background = () => pause(); const visibility = () => { if (document.visibilityState === 'hidden') background(); }; document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', background); return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', background); }; }, [pause]);
  const reset = () => { if (startedAt.current && !finalized.current) { const endedAt = new Date().toISOString(); onComplete(startedAt.current, endedAt, 'interrotto', progressAtStop()); } startedAt.current = null; finalized.current = false; setResumedFromCheckpoint(false); onCheckpoint(null); setRunning(false); setStarting(false); setIdx(0); setSetNo(1); setPhase('ready'); setLeft(5); deadline.current = 0; spokenSecond.current = -1; spotifyStarted.current = false; void allowScreenLock(); if (isSpotifyLoggedIn()) void pauseSpotifyPlayback(); window.speechSynthesis?.cancel(); };
  const terminateEarly = () => {
    if (!startedAt.current || finalized.current) return;
    if (window.confirm('Terminare prima l’allenamento? Verrà salvato come interrotto e non sbloccherà la prossima seduta.')) finishSession('interrotto');
  };
  const exitTimer = () => {
    if (startedAt.current && !finalized.current) { terminateEarly(); return; }
    void allowScreenLock(); window.speechSynthesis?.cancel(); onExit();
  };

  if (phase === 'done') return <div className="min-h-[80vh] flex items-center justify-center"><div className="card bg-base-200 text-center"><div className="card-body items-center">{finishedStatus === 'completato' ? <CheckCircle2 size={72} className="text-success" /> : <Pause size={72} className="text-warning" />}<h2 className="card-title text-2xl">{finishedStatus === 'completato' ? 'Allenamento completato!' : 'Allenamento interrotto'}</h2><p>{finishedStatus === 'completato' ? `Hai concluso ${workout.title}. Recupera almeno 48 ore prima della prossima seduta pliometrica.` : 'La durata e i progressi svolti sono stati salvati. La prossima seduta resta bloccata.'}</p><button className="btn btn-primary mt-3" onClick={exitTimer}>Torna al programma</button></div></div></div>;

  const duration = phase === 'work' ? exercise.work : phase === 'rest' ? exercise.rest : 5;
  const pct = Math.max(0, Math.round(left / duration * 100));
  return <div className="guided-timer min-h-screen flex flex-col gap-4 pb-5">
    <div className="flex justify-between items-center"><button className="btn btn-ghost btn-sm" onClick={exitTimer}><ArrowLeft size={18} /> Esci</button><span className="badge badge-outline">{idx + 1}/{workout.exercises.length}</span>{getSpotifyLink() && <button className="btn btn-ghost btn-sm btn-circle" onClick={openSpotify} aria-label="Apri Spotify"><Music size={18} /></button>}</div>
    {restored && !resumedFromCheckpoint && !running && <div className="alert alert-info text-sm">Seduta ripristinata in pausa: premi RIPRENDI per continuare.</div>}
    <div className={`guided-main-card card ${phase === 'work' ? 'bg-primary text-primary-content' : phase === 'rest' ? 'bg-secondary text-secondary-content' : 'bg-base-200'}`}><div className="guided-main-body card-body p-5 items-center text-center"><div><span className="badge badge-lg">{phase === 'ready' ? 'CONTO ALLA ROVESCIA' : phase === 'work' ? 'LAVORO' : 'RECUPERO'}</span><h2 className="text-2xl font-bold mt-3">{exercise.name}</h2><p className="opacity-80">Serie {setNo} di {exercise.sets} · {exercise.prescription}</p></div><MovementAnimation kind={exercise.kind} active={running} id={exercise.id} /><div><div className="font-mono text-7xl font-black tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div><progress className="progress w-full mt-3" value={pct} max="100" /><p className="mt-3 font-medium">{exercise.cues.join(' · ')}</p></div></div></div>
    <div className="guided-controls grid grid-cols-4 gap-2"><button className="btn btn-ghost" onClick={reset}><RotateCcw /></button><button className="guided-start btn btn-primary col-span-2 btn-lg" disabled={starting} onClick={() => running ? pause() : void start()}>{starting ? <><Volume2 /> PREPARATI…</> : running ? <><Pause /> PAUSA</> : <><Play /> {startedAt.current ? 'RIPRENDI' : 'START'}</>}</button><button className="btn btn-ghost" onClick={next}><SkipForward /></button></div>
    {startedAt.current && <button className="btn btn-error guided-terminate" onClick={terminateEarly}>TERMINA PRIMA</button>}
    <p className="text-xs text-center text-base-content/60 flex items-center justify-center gap-1"><Volume2 size={14} /> Annunci in cuffia · Schermo {screenKeptOn ? 'mantenuto acceso' : wakeLockSupported ? 'attivo allo START' : 'da mantenere acceso nelle impostazioni'}</p>
  </div>;
};
