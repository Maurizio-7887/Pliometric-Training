import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MapPin, Play, RotateCcw, Timer } from 'lucide-react';

const say = (text: string) => { if (!('speechSynthesis' in window)) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'it-IT'; u.rate = .98; u.volume = 1; window.speechSynthesis.speak(u); };

// Distanza tra due coordinate GPS (formula di Haversine), in metri.
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Phase = 'setup' | 'running' | 'resting' | 'done';

interface Props { onExit: () => void; }

export const RunIntervals: React.FC<Props> = ({ onExit }) => {
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
  const lastPos = useRef<{ lat: number; lon: number; t: number } | null>(null);
  const watchId = useRef<number | null>(null);
  const repStart = useRef<number>(0);
  const repIntervalRef = useRef<number | null>(null);
  const restIntervalRef = useRef<number | null>(null);

  const stopGeo = () => { if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; } };
  const stopTimers = () => { if (repIntervalRef.current) { clearInterval(repIntervalRef.current); repIntervalRef.current = null; } if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; } };

  useEffect(() => () => { stopGeo(); stopTimers(); window.speechSynthesis?.cancel(); }, []);

  const startRep = (n: number) => {
    setRepNo(n);
    setRepDistance(0);
    setRepElapsed(0);
    lastPos.current = null;
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
          if (acc != null && acc > 30) return;
          if (lastPos.current) {
            const d = distanceMeters(lastPos.current.lat, lastPos.current.lon, latitude, longitude);
            const dt = (Date.now() - lastPos.current.t) / 1000;
            const speed = dt > 0 ? d / dt : 0;
            if (d > 0.5 && speed < 12) {
              setRepDistance(prev => {
                const next = prev + d;
                if (prev < targetMeters && next >= targetMeters) {
                  say('Millesimo raggiunto. Recupero.');
                  window.setTimeout(() => beginRest(), 50);
                }
                return next;
              });
            }
          }
          lastPos.current = { lat: latitude, lon: longitude, t: Date.now() };
        },
        () => setGpsError('GPS non disponibile: controlla i permessi di localizzazione del browser.'),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );
    }
  };

  const beginRest = () => {
    if (repIntervalRef.current) { clearInterval(repIntervalRef.current); repIntervalRef.current = null; }
    setPhase('resting');
    setRestLeft(restSeconds);
    if (restIntervalRef.current) clearInterval(restIntervalRef.current);
    restIntervalRef.current = window.setInterval(() => {
      setRestLeft(prev => {
        if (prev <= 1) {
          if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; }
          setRepNo(currentRep => {
            const next = currentRep + 1;
            if (next > reps) { finishAll(); } else { window.setTimeout(() => startRep(next), 50); }
            return currentRep;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const finishAll = () => {
    stopGeo(); stopTimers();
    setPhase('done');
    say('Serie completata. Ottimo lavoro.');
  };

  const skipRest = () => { if (restIntervalRef.current) { clearInterval(restIntervalRef.current); restIntervalRef.current = null; } const next = repNo + 1; if (next > reps) finishAll(); else startRep(next); };
  const stopAll = () => { stopGeo(); stopTimers(); window.speechSynthesis?.cancel(); setPhase('setup'); };

  const pace = repElapsed > 0 && repDistance > 0 ? (repElapsed / 60) / (repDistance / 1000) : null;

  if (phase === 'setup') return <div className="space-y-4 max-w-lg mx-auto p-4">
    <button className="btn btn-ghost btn-sm" onClick={onExit}><ArrowLeft size={18} /> Programma</button>
    <section className="card bg-primary text-primary-content"><div className="card-body p-5"><h2 className="card-title text-2xl">Serie sui 1000 metri</h2><p className="text-primary-content/80">Ripetute a distanza con GPS, recupero a camminare</p></div></section>
    <div className="card bg-base-200"><div className="card-body p-4 gap-3">
      <label className="form-control"><span className="label-text">Numero ripetute</span><input type="number" min={1} max={20} className="input input-bordered" value={reps} onChange={e => setReps(Math.max(1, Number(e.target.value) || 1))} /></label>
      <label className="form-control"><span className="label-text">Distanza per ripetuta (metri)</span><input type="number" min={100} step={50} className="input input-bordered" value={targetMeters} onChange={e => setTargetMeters(Math.max(100, Number(e.target.value) || 1000))} /></label>
      <label className="form-control"><span className="label-text">Recupero (secondi)</span><input type="number" min={15} step={15} className="input input-bordered" value={restSeconds} onChange={e => setRestSeconds(Math.max(15, Number(e.target.value) || 180))} /></label>
    </div></div>
    <div className="alert bg-base-200 text-sm"><MapPin size={20} /><span>Serve il GPS attivo e il permesso di localizzazione al browser. Tienilo acceso per tutta la sessione, anche a schermo bloccato se possibile.</span></div>
    {gpsError && <div className="alert alert-error text-sm">{gpsError}</div>}
    <button className="btn btn-primary btn-lg w-full" onClick={() => startRep(1)}><Play fill="currentColor" /> INIZIA LA SERIE</button>
  </div>;

  if (phase === 'done') return <div className="space-y-4 max-w-lg mx-auto p-4">
    <section className="card bg-success text-success-content"><div className="card-body p-6 text-center"><h2 className="card-title justify-center text-2xl">Serie completata!</h2><p>{reps} ripetute da {targetMeters} m</p></div></section>
    <button className="btn btn-primary btn-lg w-full" onClick={() => setPhase('setup')}><RotateCcw size={18} /> Rifai la serie</button>
    <button className="btn btn-ghost w-full" onClick={onExit}><ArrowLeft size={18} /> Torna al programma</button>
  </div>;

  return <div className="space-y-4 max-w-lg mx-auto p-4">
    <div className="flex justify-between items-center"><button className="btn btn-ghost btn-sm" onClick={stopAll}><ArrowLeft size={18} /> Esci</button><span className="badge badge-outline">Ripetuta {repNo}/{reps}</span></div>
    {phase === 'running' && <div className="card bg-primary text-primary-content"><div className="card-body items-center text-center p-6 gap-1">
      <span className="text-sm opacity-80">METRI PERCORSI</span>
      <span className="text-6xl font-bold tabular-nums">{Math.round(repDistance)}</span>
      <span className="text-sm opacity-80">di {targetMeters} m</span>
      <progress className="progress progress-secondary w-full mt-2" value={Math.min(repDistance, targetMeters)} max={targetMeters} />
      <div className="flex gap-4 mt-3 text-sm"><span className="flex items-center gap-1"><Timer size={15} /> {Math.floor(repElapsed / 60)}:{String(repElapsed % 60).padStart(2, '0')}</span>{pace && <span>{pace.toFixed(2)} min/km</span>}</div>
      {accuracy != null && <span className="text-xs opacity-60 mt-1">Precisione GPS: ±{Math.round(accuracy)} m</span>}
    </div></div>}
    {phase === 'resting' && <div className="card bg-base-200"><div className="card-body items-center text-center p-6 gap-1">
      <span className="text-sm text-base-content/60">RECUPERO — cammina</span>
      <span className="text-6xl font-bold tabular-nums">{Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, '0')}</span>
      <button className="btn btn-outline btn-sm mt-3" onClick={skipRest}><Play size={15} /> Salta recupero</button>
    </div></div>}
    {gpsError && <div className="alert alert-error text-sm">{gpsError}</div>}
  </div>;
};
