import React from 'react';
import { CalendarDays, Clock3, History, Trash2 } from 'lucide-react';
import type { SessionLog } from '../types';

interface Props { logs: SessionLog[]; onClear?: () => void; }
const stamp = (iso:string|null) => iso ? new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)) : 'Non terminato';
const duration = (seconds:number|null) => seconds == null ? 'In corso' : `${Math.floor(seconds/60)} min ${seconds%60} sec`;
const pace = (seconds:number) => { const rounded = Math.round(seconds); return `${Math.floor(rounded/60)}:${String(rounded%60).padStart(2,'0')} min/km`; };
const speed = (kmh:number) => `${kmh.toFixed(1)} km/h`;
const statusLabel = (status: SessionLog['status']) => status === 'completato' ? 'COMPLETATO' : status === 'interrotto' ? 'INTERROTTO' : 'IN CORSO';
const statusClass = (status: SessionLog['status']) => status === 'completato' ? 'badge-success' : status === 'interrotto' ? 'badge-error' : 'badge-warning';

export const WorkoutHistory:React.FC<Props> = ({logs, onClear}) => <section className="workout-history">
 <header className="history-heading"><span className="history-icon"><History /></span><div><h1>Registro allenamenti</h1><p>{logs.length === 1 ? '1 seduta registrata' : `${logs.length} sedute registrate`}</p></div></header>
 {logs.length===0 ? <div className="history-empty">Il primo allenamento comparirà qui appena viene avviato.</div> : <div className="history-list">{logs.slice(0,12).map(log=><article key={log.id} className="history-card">
  <div className="history-card-title"><strong>{log.workoutTitle}</strong><span className={`history-status ${statusClass(log.status)}`}>{statusLabel(log.status)}</span></div>
  <div className="history-dates"><div><CalendarDays /><span>INIZIO<b>{stamp(log.startedAt)}</b></span></div><div><CalendarDays /><span>FINE<b>{stamp(log.endedAt)}</b></span></div></div>
  <div className="history-duration"><Clock3 /> <span>Durata effettiva</span><b>{duration(log.durationSeconds)}</b></div>
  {log.plannedSetCount != null && <div className="history-progress"><span>Serie completate <b>{log.completedSetCount ?? 0} / {log.plannedSetCount}</b></span>{log.plannedExerciseCount != null && <span>Esercizi <b>{log.completedExerciseCount ?? 0} / {log.plannedExerciseCount}</b></span>}</div>}
  {log.runRepetitions?.length ? <div className="history-runs">
    <div className="history-run-summary"><span>Distanza GPS <b>{Math.round(log.totalDistanceMeters ?? 0)} m</b></span>{log.averagePaceSecondsPerKm!=null&&<span>Velocità media <b>{speed(3600 / log.averagePaceSecondsPerKm)}</b></span>}</div>
    <div className="history-repetitions">{log.runRepetitions.map(rep=><div key={rep.repetition} className="history-repetition-speed"><span>Ripetuta {rep.repetition}<small>{Math.round(rep.distanceMeters)} m · {Math.round(rep.durationSeconds)} s</small></span><b>{speed(rep.averageSpeedKmh ?? 3600 / rep.paceSecondsPerKm)}<small>MAX {rep.maxSpeedKmh != null ? speed(rep.maxSpeedKmh) : 'non rilevata'}</small></b></div>)}</div>
  </div> : null}
 </article>)}</div>}
 {onClear && logs.length>0 && <button className="history-clear" onClick={onClear}><Trash2 /> Cancella registro e progressi</button>}
</section>;
