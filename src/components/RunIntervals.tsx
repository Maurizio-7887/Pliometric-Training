import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Music, Play, RotateCcw, Timer } from 'lucide-react';
import { getSpotifyLink, openSpotify } from '../spotify';
import { isSpotifyLoggedIn } from '../spotifyAuth';
import { activateSpotifyElement, playSpotifyLink } from '../spotifyPlayer';
import type { RunRepResult, RunSessionSummary } from '../types';
import { useScreenWakeLock } from '../useScreenWakeLock';

const say = (text: string) => { if (!('speechSynthesis' in window)) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'it-IT'; u.rate = .98; u.volume = 1; window.speechSynthesis.speak(u); };
const formatPace = (seconds: number) => { const rounded = Math.round(seconds); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}/km`; };

const RUN_PROGRAMS = [
  { id: '400', reps: 8, targetMeters: 400, restSeconds: 90, purpose: 'Rapidità e velocità', recovery: '1:30 camminando' },
  { id: '800', reps: 6, targetMeters: 800, restSeconds: 150, purpose: 'Resistenza alla velocità', recovery: '2:30 camminando' },
  { id: '1000', reps: 5, targetMeters: 1000, restSeconds: 180, purpose: 'Potenza aerobica', recovery: '3:00 camminando' },
] as const;

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Phase = 'setup' | 'running' | 'resting' | 'done';
interface Props { onExit: () => void; onComplete: (summary: RunSessionSummary) => void; }

export const RunIntervals: React.FC<Props> = ({ onExit, onComplete }) => {
  const [programId, setProgramId] = useState<(typeof RUN_PROGRAMS)[number]['id']>('1000');
  const program = RUN_PROGRAMS.find(item => item.id === programId) ?? RUN_PROGRAMS[2];
  const { reps, targetMeters, restSeconds } = program;
  const [phase, setPhase] = useState<Phase>('setup');
  const [repNo, setRepNo] = useState(1);
  const [repDistance, setRepDistance] = useState(0);
  const [repElapsed, setRepElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [gpsError, setGpsError] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [finishedStatus, setFinishedStatus] = useState<'completato' | 'interrotto' | null>(null);
  const { acquire: keepScreenOn, release: allowScreenLock, held: screenKeptOn, supported: wakeLockSupported } = useScreenWakeLock();
  const phaseRef = useRef<Phase>('setup');
  const repNoRef = useRef(1);
  const lastPos = useRef<{ lat: number; lon: number; t: number } | null>(null);
  const watchId = useRef<number | null>(null);
  const repStart = useRef(0);
  const repDistanceRef = useRef(0);
  const completedReps = useRef<RunRepResult[]>([]);
  const sessionStartedAt = useRef('');
  const sessionSaved = useRef(false);
  const repIntervalRef = useRef<number | null>(null);
  const restIntervalRef = useRef<number | null>(null);

  const stopGeo = () => { if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; } };
  const stopTimers = () => { if (repIntervalRef.current) { clearInterval(repIntervalRef.current); repIntervalRef.current = null; } if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; } };
  useEffect(() => () => { stopGeo(); stopTimers(); window.speechSynthesis?.cancel(); }, []);

  function finishSession(status: 'completato' | 'interrotto', includePartialRunningRep = false) {
    if (phaseRef.current === 'done' || sessionSaved.current) return;
    const endedAt = new Date().toISOString();
    const repetitions = [...completedReps.current];
    // Keep a genuinely measured partial rep when the runner chooses to stop mid-effort.
    if (includePartialRunningRep && phaseRef.current === 'running') {
      const durationSeconds = Math.max(1, Math.round((Date.now() - repStart.current) / 1000));
      const distanceMeters = repDistanceRef.current;
      if (distanceMeters >= 10 && durationSeconds >= 5) {
        repetitions.push({ repetition: repNoRef.current, distanceMeters, durationSeconds, paceSecondsPerKm: durationSeconds / (distanceMeters / 1000) });
      }
    }
    completedReps.current = repetitions;
    stopGeo(); stopTimers(); void allowScreenLock();
    phaseRef.current = 'done';
    sessionSaved.current = true;
    setFinishedStatus(status);
    setPhase('done');
    say(status === 'completato' ? 'Serie completata. Ottimo lavoro.' : 'Serie interrotta. I dati svolti sono stati salvati.');
    if (sessionStartedAt.current) onComplete({ startedAt: sessionStartedAt.current, endedAt, targetMeters, recoverySeconds: restSeconds, repetitions, status });
  }

  function finishAll() { finishSession('completato'); }

  function startRep(n: number) {
    if (n === 1) {
      completedReps.current = [];
      sessionStartedAt.current = new Date().toISOString();
      sessionSaved.current = false;
      setFinishedStatus(null);
    }
    repNoRef.current = n;
    setRepNo(n); setRepDistance(0); repDistanceRef.current = 0; setRepElapsed(0); lastPos.current = null;
    phaseRef.current = 'running'; setPhase('running'); repStart.current = Date.now();
    say(`Ripetuta ${n} di ${reps}. Via!`);
    if (repIntervalRef.current) clearInterval(repIntervalRef.current);
    repIntervalRef.current = window.setInterval(() => setRepElapsed(Math.round((Date.now() - repStart.current) / 1000)), 1000);
    if (watchId.current == null) {
      if (!('geolocation' in navigator)) { setGpsError('Il browser non supporta il GPS.'); return; }
      watchId.current = navigator.geolocation.watchPosition(
        pos => {
          setGpsError(''); setAccuracy(pos.coords.accuracy);
          const { latitude, longitude, accuracy: acc } = pos.coords;
          if (phaseRef.current !== 'running' || (acc != null && acc > 30)) return;
          if (lastPos.current) {
            const d = distanceMeters(lastPos.current.lat, lastPos.current.lon, latitude, longitude);
            const dt = (Date.now() - lastPos.current.t) / 1000;
            const speed = dt > 0 ? d / dt : Number.POSITIVE_INFINITY;
            if (d > 0.5 && speed < 12) {
              const previous = repDistanceRef.current;
              const nextDistance = previous + d;
              repDistanceRef.current = nextDistance; setRepDistance(nextDistance);
              if (previous < targetMeters && nextDistance >= targetMeters) {
                say(repNoRef.current >= reps ? 'Distanza raggiunta.' : 'Distanza raggiunta. Recupero camminato.');
                window.setTimeout(beginRest, 50);
              }
            }
          }
          lastPos.current = { lat: latitude, lon: longitude, t: Date.now() };
        },
        () => setGpsError('GPS non disponibile: controlla i permessi di localizzazione del browser.'),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
      );
    }
  }

  function beginRest() {
    if (phaseRef.current !== 'running') return;
    if (repIntervalRef.current) { clearInterval(repIntervalRef.current); repIntervalRef.current = null; }
    const durationSeconds = Math.max(1, Math.round((Date.now() - repStart.current) / 1000));
    const distance = repDistanceRef.current;
    completedReps.current.push({ repetition: repNoRef.current, distanceMeters: distance, durationSeconds, paceSecondsPerKm: durationSeconds / (distance / 1000) });
    setRepElapsed(durationSeconds);
    if (repNoRef.current >= reps) { finishAll(); return; }
    phaseRef.current = 'resting'; setPhase('resting'); setRestLeft(restSeconds);
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    const restDeadline = Date.now() + restSeconds * 1000;
    restIntervalRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((restDeadline - Date.now()) / 1000));
      setRestLeft(remaining);
      if (remaining === 0) {
        if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; }
        window.setTimeout(() => startRep(repNoRef.current + 1), 50);
      }
    }, 250);
  }

  const terminateEarly = () => {
    if (!sessionStartedAt.current || sessionSaved.current) return;
    if (window.confirm('Terminare prima la serie? Verrà salvata come interrotta con le ripetute già svolte.')) finishSession('interrotto', phaseRef.current === 'running');
  };
  const exitApp = () => { stopGeo(); stopTimers(); void allowScreenLock(); window.speechSynthesis?.cancel(); onExit(); };
  const paceSeconds = repElapsed > 0 && repDistance > 0 ? repElapsed / (repDistance / 1000) : null;

  if (phase === 'setup') return <div className="app-shell run-shell run-setup">
    <button className="btn btn-ghost run-back" onClick={exitApp}><ArrowLeft size={20} /> Programma</button>
    <section className="run-setup-hero"><img src="./images/run-work.png" alt="Atleta durante una ripetuta di corsa" /><div className="run-setup-overlay"><h2>Scegli le ripetute</h2><p>Programmi GPS con recuperi fissi e camminati</p></div></section>
    <div className="run-programs" role="radiogroup" aria-label="Scegli il programma di ripetute">
      {RUN_PROGRAMS.map(item => <button key={item.id} type="button" role="radio" aria-checked={programId === item.id} className={`run-program ${programId === item.id ? 'is-selected' : ''}`} onClick={() => setProgramId(item.id)}><strong>{item.reps} × {item.targetMeters} m</strong><span>{item.purpose}</span><small>Recupero {item.recovery}</small></button>)}
    </div>
    <div className="run-music"><Music size={22} /><span><strong>MUSICA SPOTIFY</strong><small>{isSpotifyLoggedIn() ? 'Collegata: partirà insieme alla serie' : 'Playlist pronta: aprila prima di partire'}</small></span><button type="button" className="btn btn-outline" onClick={openSpotify}>APRI SPOTIFY</button></div>
    <div className="run-gps-note"><MapPin size={22} /><span>GPS ad alta precisione. Allo START l’app chiederà al telefono di mantenere lo schermo acceso.</span></div>
    {gpsError && <div className="alert alert-error text-sm">{gpsError}</div>}
    <button className="btn btn-primary run-start" onClick={() => { void keepScreenOn(); activateSpotifyElement(); if (isSpotifyLoggedIn()) { playSpotifyLink(getSpotifyLink()).then(ok => { if (!ok) openSpotify(); }); } else { openSpotify(); } startRep(1); }}><Play fill="currentColor" /> INIZIA {reps} × {targetMeters} m</button>
  </div>;

  if (phase === 'done') {
    const savedReps = completedReps.current;
    const totalDistance = savedReps.reduce((sum, rep) => sum + rep.distanceMeters, 0);
    const totalSeconds = savedReps.reduce((sum, rep) => sum + rep.durationSeconds, 0);
    return <div className="app-shell run-shell run-done">
    <section className={`card ${finishedStatus === 'interrotto' ? 'bg-base-200' : 'bg-success text-success-content'}`}><div className="card-body p-6 text-center"><h2 className="card-title justify-center text-2xl">{finishedStatus === 'interrotto' ? 'Serie interrotta' : 'Serie completata!'}</h2><p>{finishedStatus === 'interrotto' ? 'Le ripetute concluse e l’eventuale tratto GPS in corso sono stati salvati.' : `${reps} ripetute da ${targetMeters} m`}</p>{totalDistance > 0 && totalSeconds > 0 && <p>Passo medio corsa: {formatPace(totalSeconds / (totalDistance / 1000))}</p>}</div></section>
    <button className="btn btn-primary btn-lg w-full" onClick={() => { phaseRef.current = 'setup'; completedReps.current = []; sessionStartedAt.current = ''; sessionSaved.current = false; setFinishedStatus(null); setGpsError(''); setAccuracy(null); setPhase('setup'); }}><RotateCcw size={18} /> Nuova serie</button>
    <button className="btn btn-ghost w-full" onClick={exitApp}><ArrowLeft size={18} /> Torna al programma</button>
  </div>;
  }

  return <div className={`app-shell run-shell run-session run-${phase}`}>
    <div className="run-toolbar"><button className="btn btn-error run-terminate" onClick={terminateEarly}>TERMINA PRIMA</button><span className="run-rep-badge">RIPETUTA {repNo} / {reps}</span>{getSpotifyLink() ? <button className="btn btn-ghost btn-circle" onClick={openSpotify} aria-label="Apri Spotify"><Music size={20} /></button> : <span className="run-toolbar-spacer" />}</div>
    {phase === 'running' && <section className="run-phase-card run-phase-work"><div className="run-phase-photo"><img src="./images/run-work.png" alt="Atleta che corre durante la ripetuta" /><strong>CORRI FORTE</strong></div><div className="run-phase-data"><span className="run-kicker">METRI PERCORSI</span><span className="run-distance">{Math.round(repDistance)}</span><span className="run-target">di {targetMeters} m</span><progress className="progress progress-secondary w-full" value={Math.min(repDistance, targetMeters)} max={targetMeters} /><div className="run-metrics"><span><Timer size={20} /> {Math.floor(repElapsed / 60)}:{String(repElapsed % 60).padStart(2, '0')}</span>{paceSeconds && <span>{formatPace(paceSeconds)}</span>}</div>{accuracy != null && <span className="run-accuracy">Precisione GPS: ±{Math.round(accuracy)} m · Schermo {screenKeptOn ? 'attivo' : wakeLockSupported ? 'non garantito' : 'da impostazioni telefono'}</span>}</div></section>}
    {phase === 'resting' && <section className="run-phase-card run-phase-rest"><div className="run-phase-photo"><img src="./images/run-recovery.png" alt="Atleta che cammina durante il recupero" /><strong>RECUPERO • CAMMINA</strong></div><div className="run-phase-data"><span className="run-kicker">PROSSIMA RIPETUTA TRA</span><span className="run-rest-time">{Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}</span><p className="run-fixed-note">Recupero fissato dal programma</p></div></section>}
    {gpsError && <div className="alert alert-error text-sm">{gpsError}</div>}
  </div>;
};
