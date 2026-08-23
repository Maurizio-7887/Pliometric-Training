import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Music, Pause, Play, RotateCcw, SkipForward, Volume2 } from 'lucide-react';
import type { Workout } from '../types';
import { MovementAnimation } from './MovementAnimation';
import { getSpotifyLink, openSpotify } from '../spotify';
import { isSpotifyLoggedIn } from '../spotifyAuth';
import { activateSpotifyElement, pauseSpotifyPlayback, playSpotifyLink, prepareSpotifyPlayer, resumeSpotifyPlayback } from '../spotifyPlayer';

type Phase = 'ready' | 'work' | 'rest' | 'done';
interface Props { workout: Workout; onExit: () => void; onStart: (startedAt: string) => void; onComplete: (startedAt: string, endedAt: string) => void; }

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

export const GuidedTimer: React.FC<Props> = ({ workout, onExit, onStart, onComplete }) => {
  const [idx, setIdx] = useState(0);
  const [setNo, setSetNo] = useState(1);
  const [phase, setPhase] = useState<Phase>('ready');
  const [left, setLeft] = useState(5);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const startedAt = useRef<string | null>(null);
  const deadline = useRef(0);
  const spokenSecond = useRef(-1);
  const spotifyStarted = useRef(false);
  const exercise = workout.exercises[idx];

  useEffect(() => {
    if (isSpotifyLoggedIn() && getSpotifyLink()) void prepareSpotifyPlayer();
  }, []);

  const next = useCallback(() => {
    deadline.current = 0; spokenSecond.current = -1;
    if (phase === 'ready') { setPhase('work'); setLeft(exercise.work); return; }
    if (phase === 'work' && exercise.rest > 0) { setPhase('rest'); setLeft(exercise.rest); return; }
    if ((phase === 'work' || phase === 'rest') && setNo < exercise.sets) { setSetNo(n => n + 1); setPhase('ready'); setLeft(5); return; }
    if (idx < workout.exercises.length - 1) { setIdx(n => n + 1); setSetNo(1); setPhase('ready'); setLeft(5); return; }
    setPhase('done'); setRunning(false);
    const endedAt = new Date().toISOString();
    onComplete(startedAt.current ?? endedAt, endedAt);
  }, [phase, exercise, setNo, idx, workout.exercises.length, onComplete]);

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
    if (phase === 'done') say('Allenamento completato. Ottimo lavoro.');
  }, [phase, running]);

  const start = async () => {
    if (starting) return;
    const firstStart = !startedAt.current;
    if (firstStart) {
      setStarting(true);
      startedAt.current = new Date().toISOString();
      onStart(startedAt.current);
      // Deve avvenire direttamente nel gesto dell'utente per sbloccare l'audio Spotify su mobile.
      activateSpotifyElement();
      await sayAndWait('Preparati');
      // Sequenza obbligatoria: fine TTS → comando PLAY Spotify → countdown da 5.
      if (isSpotifyLoggedIn() && getSpotifyLink()) {
        spotifyStarted.current = await playSpotifyLink(getSpotifyLink());
      }
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
    try { (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<unknown> } }).wakeLock?.request('screen').catch(() => undefined); } catch { /* facoltativo */ }
  };
  const pause = () => { setRunning(false); deadline.current = 0; if (isSpotifyLoggedIn()) pauseSpotifyPlayback(); };
  const reset = () => { setRunning(false); setIdx(0); setSetNo(1); setPhase('ready'); setLeft(5); deadline.current = 0; spokenSecond.current = -1; spotifyStarted.current = false; if (isSpotifyLoggedIn()) void pauseSpotifyPlayback(); window.speechSynthesis?.cancel(); };

  if (phase === 'done') return <div className="min-h-[80vh] flex items-center justify-center"><div className="card bg-base-200 text-center"><div className="card-body items-center"><CheckCircle2 size={72} className="text-success" /><h2 className="card-title text-2xl">Allenamento completato!</h2><p>Hai concluso {workout.title}. Recupera almeno 48 ore prima della prossima seduta pliometrica.</p><button className="btn btn-primary mt-3" onClick={onExit}>Torna al programma</button></div></div></div>;

  const duration = phase === 'work' ? exercise.work : phase === 'rest' ? exercise.rest : 5;
  const pct = Math.max(0, Math.round(left / duration * 100));
  return <div className="guided-timer min-h-screen flex flex-col gap-4 pb-5">
    <div className="flex justify-between items-center"><button className="btn btn-ghost btn-sm" onClick={onExit}><ArrowLeft size={18} /> Esci</button><span className="badge badge-outline">{idx + 1}/{workout.exercises.length}</span>{getSpotifyLink() && <button className="btn btn-ghost btn-sm btn-circle" onClick={openSpotify} aria-label="Apri Spotify"><Music size={18} /></button>}</div>
    <div className={`guided-main-card card ${phase === 'work' ? 'bg-primary text-primary-content' : phase === 'rest' ? 'bg-secondary text-secondary-content' : 'bg-base-200'}`}><div className="guided-main-body card-body p-5 items-center text-center"><div><span className="badge badge-lg">{phase === 'ready' ? 'CONTO ALLA ROVESCIA' : phase === 'work' ? 'LAVORO' : 'RECUPERO'}</span><h2 className="text-2xl font-bold mt-3">{exercise.name}</h2><p className="opacity-80">Serie {setNo} di {exercise.sets} · {exercise.prescription}</p></div><MovementAnimation kind={exercise.kind} active={running} id={exercise.id} /><div><div className="font-mono text-7xl font-black tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div><progress className="progress w-full mt-3" value={pct} max="100" /><p className="mt-3 font-medium">{exercise.cues.join(' · ')}</p></div></div></div>
    <div className="guided-controls grid grid-cols-4 gap-2"><button className="btn btn-ghost" onClick={reset}><RotateCcw /></button><button className="guided-start btn btn-primary col-span-2 btn-lg" disabled={starting} onClick={() => running ? pause() : void start()}>{starting ? <><Volume2 /> PREPARATI…</> : running ? <><Pause /> PAUSA</> : <><Play /> {startedAt.current ? 'RIPRENDI' : 'START'}</>}</button><button className="btn btn-ghost" onClick={next}><SkipForward /></button></div>
    <p className="text-xs text-center text-base-content/60 flex items-center justify-center gap-1"><Volume2 size={14} /> Conto alla rovescia e annunci anche nelle cuffiette Bluetooth.</p>
  </div>;
};
