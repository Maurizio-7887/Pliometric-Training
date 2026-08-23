import React from 'react';
import { Clock3, History, Trash2 } from 'lucide-react';
import type { SessionLog } from '../types';

interface Props { logs: SessionLog[]; onClear?: () => void; }
const stamp = (iso:string|null) => iso ? new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso)) : '—';
const duration = (seconds:number|null) => seconds == null ? '—' : `${Math.floor(seconds/60)} min ${seconds%60} sec`;
const pace = (seconds:number) => { const rounded = Math.round(seconds); return `${Math.floor(rounded/60)}:${String(rounded%60).padStart(2,'0')} min/km`; };

export const WorkoutHistory:React.FC<Props> = ({logs, onClear}) => <section className="card bg-base-200"><div className="card-body p-4 gap-3">
 <div className="flex items-center gap-2"><History size={19} className="text-primary"/><h2 className="font-bold">Registro allenamenti</h2><span className="badge badge-outline ml-auto">{logs.length}</span></div>
 {logs.length===0 ? <p className="text-sm text-base-content/60">Il primo allenamento comparirà qui appena viene completato.</p> : <div className="space-y-2">{logs.slice(0,12).map(log=><div key={log.id} className="rounded-box bg-base-300 p-3 text-sm">
  <div className="flex justify-between gap-2"><strong>{log.workoutTitle}</strong><span className={`badge badge-sm ${log.status==='completato'?'badge-success':'badge-warning'}`}>{log.status==='completato'?'COMPLETATO':'IN CORSO'}</span></div>
  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-base-content/70"><span>Inizio<br/><b className="text-base-content">{stamp(log.startedAt)}</b></span><span>Fine<br/><b className="text-base-content">{stamp(log.endedAt)}</b></span></div>
  {log.durationSeconds!=null&&<p className="mt-2 flex items-center gap-1 text-xs"><Clock3 size={13}/> Durata effettiva: <b>{duration(log.durationSeconds)}</b></p>}
  {log.runRepetitions?.length ? <div className="mt-3 rounded-lg bg-base-100/60 p-2 text-xs">
    <div className="flex justify-between gap-2 font-semibold"><span>Distanza GPS: {Math.round(log.totalDistanceMeters ?? 0)} m</span>{log.averagePaceSecondsPerKm!=null&&<span>Passo medio: {pace(log.averagePaceSecondsPerKm)}</span>}</div>
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">{log.runRepetitions.map(rep=><div key={rep.repetition} className="flex justify-between gap-2"><span>Rip. {rep.repetition}</span><b>{pace(rep.paceSecondsPerKm)}</b></div>)}</div>
  </div> : null}
 </div>)}</div>}
 {onClear && logs.length>0 && <button className="btn btn-ghost btn-sm text-error mt-1" onClick={onClear}><Trash2 size={15}/> Cancella registro e progressi</button>}
</div></section>;
