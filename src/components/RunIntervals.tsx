import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Music, Play, RotateCcw, Timer } from 'lucide-react';
import { getSpotifyLink, openSpotify } from '../spotify';
import { isSpotifyLoggedIn } from '../spotifyAuth';
import { activateSpotifyElement, playSpotifyLink } from '../spotifyPlayer';
import type { RunRepResult, RunSessionSummary } from '../types';

const say = (text: string) => { if (!('speechSynthesis' in window)) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'it-IT'; u.rate = .98; u.volume = 1; window.speechSynthesis.speak(u); };
const formatPace = (seconds: number) => { const rounded = Math.round(seconds); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}/km`; };

// Distanza tra due coordinate GPS (formula di Haversine), in metri.
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
  const [reps, setReps] = useState(5);
  const [targetMeters, setTargetMeters] = useState(1000);
  const [restSeconds, setRestSeconds] = useState(180);
  const [phase, setPhase] = useState<Phase>('setup');
  const [repNo, setRepNo] = useState(1);
  const [repDistance, setRepDistance] = useState(0);
  const [repElapsed, setRepElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [gpsError, setGpsError] = useState('');
  const [accuracy, setAccuracy] = useState<number | null>(null);
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

  function finishAll() {
    if (phaseRef.current === 'done') return;
    stopGeo(); stopTimers();
    phaseRef.current = 'done';
    setPhase('done');
    say('Serie completata. Ottimo lavoro.');
    if (!sessionSaved.current && sessionStartedAt.current && completedReps.current.length) {
      sessionSaved.current = true;
      onComplete({
        startedAt: sessionStartedAt.current,
        endedAt: new Date().toISOString(),
        targetMeters,
        recoverySeconds: restSeconds,
        repetitions: [...completedReps.current],
      });
    }
  }

  function startRep(n: number) {
    if (n === 1) {
      completedReps.current = [];
      sessionStartedAt.current = new Date().toISOString();
      sessionSaved.current = false;
    }
    repNoRef.current = n;
    setRepNo(n);
    setRepDistance(0);
    repDistanceRef.current = 0;
    setRepElapsed(0);
    lastPos.current = null;
    phaseRef.current = 'running';
    setPhase('running');
    repStart.current = Date.now();
    say(`Ripetuta ${n} di ${reps}. Via!`);
    if (repIntervalRef.current) clearInterval(repIntervalRef.current);
    repIntervalRef.current = window.setInterval(() => setRepElapsed(Math.round((Date.now() - repStart.current) / 1000)), 1000);
    if (watchId.current == null) {
      if (!('geolocation' in navigator)) { setGpsError('Il browser non supporta il GPS.'); return; }
      watchId.current = navigator.geolocation.watchPosition(
        pos => {
          setGpsError('');
          setAccuracy(pos.coords.accuracy);
          const { latitude, longitude, accuracy: acc } = pos.coords;
          if (phaseRef.current !== 'running' || (acc != null && acc > 30)) return;
          if (lastPos.current) {
            const d = distanceMeters(lastPos.current.lat, lastPos.current.lon, latitude, longitude);
            const dt = (Date.now() - lastPos.current.t) / 1000;
            const speed = dt > 0 ? d / dt : Number.POSITIVE_INFINITY;
            if (d > 0.5 && speed < 12) {
              const previous = repDistanceRef.current;
              const next = previous + d;
              repDistanceRef.current = next;
              setRepDistance(next);
              if (previous < targetMeters && next >= targetMeters) {
                say('Distanza raggiunta. Recupero camminato.');
                window.setTimeout(beginRest, 50);
              }
            }
          }
          lastPos.current = { lat: latitude, lon: longitude, t: Date.now() };
        },
        () => setGpsError('GPS non disponibile: controlla i permessi di localizzazione del browser.'),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );
    }
  }

  function beginRest() {
    if (phaseRef.current !== 'running') return;
    if (repIntervalRef.current) { clearInterval(repIntervalRef.current); repIntervalRef.current = null; }
    const durationSeconds = Math.max(1, Math.round((Date.now() - repStart.current) / 1000));
    const distance = repDistanceRef.current;
    completedReps.current.push({
      repetition: repNoRef.current,
      distanceMeters: distance,
      durationSeconds,
      paceSecondsPerKm: durationSeconds / (distance / 1000),
    });
    setRepElapsed(durationSeconds);
    phaseRef.current = 'resting';
    setPhase('resting');
    setRestLeft(restSeconds);
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    restIntervalRef.current = window.setInterval(() => {
      setRestLeft(prev => {
        if (prev <= 1) {
          if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; }
          if (repNoRef.current >= reps) finishAll(); else window.setTimeout(() => startRep(repNoRef.current + 1), 50);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const skipRest = () => { if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; } if (repNoRef.current >= reps) finishAll(); else startRep(repNoRef.current + 1); };
  const stopAll = () => { stopGeo(); stopTimers(); window.speechSynthesis?.cancel(); phaseRef.current = 'setup'; completedReps.current = []; sessionStartedAt.current = ''; setGpsError(''); setAccuracy(null); setPhase('setup'); };
  const paceSeconds = repElapsed > 0 && repDistance > 0 ? repElapsed / (repDistance / 1000) : null;

  if (phase === 'setup') return <div className="app-shell run-shell run-setup">
    <button className="btn btn-ghost run-back" onClick={onExit}><ArrowLeft size={20} /> Programma</button>
    <section className="run-setup-hero"><img src="./images/run-work.png" alt="Atleta durante una ripetuta di corsa" /><div className="run-setup-overlay"><h2>Serie sui 1000 metri</h2><p>Ripetute GPS con recupero camminato</p></div></section>
    <div className="run-settings">
      <label><span>RIPETUTE</span><input type="number" min={1} max={20} value={reps} onChange={e => setReps(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} /></label>
      <label><span>METRI</span><input type="number" min={100} step={50} value={targetMeters} onChange={e => setTargetMeters(Math.max(100, Number(e.target.value) || 1000))} /></label>
      <label><span>RECUPERO SEC.</span><input type="number" min={15} step={15} value={restSeconds} onChange={e => setRestSeconds(Math.max(15, Number(e.target.value) || 180))} /></label>
    </div>
    <div className="run-music"><Music size={22} /><span><strong>MUSICA SPOTIFY</strong><small>{isSpotifyLoggedIn() ? 'Collegata: partirà insieme alla serie' : 'Playlist pronta: aprila prima di partire'}</small></span><button type="button" className="btn btn-outline" onClick={openSpotify}>APRI SPOTIFY</button></div>
    <div className="run-gps-note"><MapPin size={22} /><span>Attiva il GPS e consenti la localizzazione. Mantienilo acceso durante tutta la sessione.</span></div>
    {gpsError && <div className="alert alert-error text-sm">{gpsError}</div>}
    <button className="btn btn-primary run-start" onClick={() => { activateSpotifyElement(); if (isSpotifyLoggedIn()) { playSpotifyLink(getSpotifyLink()).then(ok => { if (!ok) openSpotify(); }); } else { openSpotify(); } startRep(1); }}><Play fill="currentColor" /> INIZIA LA SERIE</button>
  </div>;

  if (phase === 'done') return <div className="app-shell run-shell run-done">
    <section className="card bg-success text-success-content"><div className="card-body p-6 text-center"><h2 className="card-title justify-center text-2xl">Serie completata!</h2><p>{reps} ripetute da {targetMeters} m</p>{completedReps.current.length > 0 && <p>Passo medio: {formatPace(completedReps.current.reduce((s, r) => s + r.durationSeconds, 0) / (completedReps.current.reduce((s, r) => s + r.distanceMeters, 0) / 1000))}</p>}</div></section>
    <button className="btn btn-primary btn-lg w-full" onClick={() => { phaseRef.current = 'setup'; setGpsError(''); setAccuracy(null); setPhase('setup'); }}><RotateCcw size={18} /> Rifai la serie</button>
    <button className="btn btn-ghost w-full" onClick={onExit}><ArrowLeft size={18} /> Torna al programma</button>
  </div>;

  return <div className={`app-shell run-shell run-session run-${phase}`}>
    <div className="run-toolbar"><button className="btn btn-ghost" onClick={stopAll}><ArrowLeft size={20} /> Esci</button><span className="run-rep-badge">RIPETUTA {repNo} / {reps}</span>{getSpotifyLink() ? <button className="btn btn-ghost btn-circle" onClick={openSpotify} aria-label="Apri Spotify"><Music size={20} /></button> : <span className="run-toolbar-spacer" />}</div>
    {phase === 'running' && <section className="run-phase-card run-phase-work"><div className="run-phase-photo"><img src="./images/run-work.png" alt="Atleta che corre durante la ripetuta" /><strong>CORRI FORTE</strong></div><div className="run-phase-data"><span className="run-kicker">METRI PERCORSI</span><span className="run-distance">{Math.round(repDistance)}</span><span className="run-target">di {targetMeters} m</span><progress className="progress progress-secondary w-full" value={Math.min(repDistance, targetMeters)} max={targetMeters} /><div className="run-metrics"><span><Timer size={20} /> {Math.floor(repElapsed / 60)}:{String(repElapsed % 60).padStart(2, '0')}</span>{paceSeconds && <span>{formatPace(paceSeconds)}</span>}</div>{accuracy != null && <span className="run-accuracy">Precisione GPS: ±{Math.round(accuracy)} m</span>}</div></section>}
    {phase === 'resting' && <section className="run-phase-card run-phase-rest"><div className="run-phase-photo"><img src="./images/run-recovery.png" alt="Atleta che cammina durante il recupero" /><strong>RECUPERO • CAMMINA</strong></div><div className="run-phase-data"><span className="run-kicker">PROSSIMA RIPETUTA TRA</span><span className="run-rest-time">{Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}</span><button className="btn btn-outline run-skip" onClick={skipRest}><Play size={18} /> Salta recupero</button></div></section>}
    {gpsError && <div className="alert alert-error text-sm">{gpsError}</div>}
  </div>;
};
