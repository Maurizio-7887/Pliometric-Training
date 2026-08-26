import React, { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import type { SyncConfig, SyncVerification } from '../trainingSync';
import { isSyncConfigured } from '../trainingSync';

interface Props {
  config: SyncConfig;
  syncState: 'non_configurata' | 'sincronizzazione' | 'sincronizzata' | 'offline' | 'errore';
  lastSyncAt: string | null;
  syncError: string;
  verification: SyncVerification | null;
  onSaveConfig: (config: SyncConfig) => void;
  onSyncNow: () => void;
}

const stateText = (state: Props['syncState']) => {
  if (state === 'sincronizzata') return 'Verificato online';
  if (state === 'sincronizzazione') return 'Verifica in corso…';
  if (state === 'offline') return 'Offline · verrà inviato al ritorno della rete';
  if (state === 'errore') return 'Invio da riprovare';
  return 'Non collegato';
};

/** Compact phone-only setup. Detailed analysis lives only on the protected Railway dashboard. */
export const MobileSyncSettings: React.FC<Props> = ({ config, syncState, lastSyncAt, syncError, verification, onSaveConfig, onSyncNow }) => {
  const [open, setOpen] = useState(false);
  const [apiUrl, setApiUrl] = useState(config.apiUrl);
  const [token, setToken] = useState(config.token);
  const configured = isSyncConfigured(config);
  const Icon = configured ? Cloud : CloudOff;

  useEffect(() => {
    setApiUrl(config.apiUrl);
    setToken(config.token);
  }, [config.apiUrl, config.token]);

  return <section className="card bg-base-200 mobile-sync"><div className="card-body p-4 gap-3">
    <div className="flex items-center gap-2"><Icon size={19} className="text-primary" /><div><h2 className="font-bold">Salvataggio online</h2><p className="text-xs text-base-content/60">Ogni invio viene controllato contro il registro Railway.</p></div><span className="badge badge-outline ml-auto">{stateText(syncState)}</span></div>
    {verification?.verified && <div className="sync-verification"><ShieldCheck size={18} /><span><strong>Confermato:</strong> {verification.localCount}/{verification.localCount} registri locali presenti online <small>· {verification.onlineCount} totali su Railway</small></span></div>}
    {lastSyncAt && <p className="text-xs text-base-content/60">Ultima verifica: {new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(lastSyncAt))}</p>}
    {syncError && <div className="alert alert-error text-sm">{syncError}</div>}
    <div className="mobile-sync-actions">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(value => !value)}>{open ? 'Chiudi collegamento' : configured ? 'Modifica collegamento' : 'Collega questo dispositivo'}</button>
      {configured && <button className="btn btn-sm" disabled={syncState === 'sincronizzazione'} onClick={onSyncNow}><RefreshCw size={15} /> Verifica ora</button>}
    </div>
    {open && <div className="mobile-sync-form">
      <label className="sync-field"><span>Indirizzo API Railway</span><input type="url" inputMode="url" placeholder="https://pliometric-training-production.up.railway.app" value={apiUrl} onChange={event => setApiUrl(event.target.value)} /></label>
      <label className="sync-field"><span>Chiave personale</span><input type="password" autoComplete="off" placeholder="La SYNC_KEY configurata su Railway" value={token} onChange={event => setToken(event.target.value)} /></label>
      <button className="btn btn-primary" onClick={() => onSaveConfig({ apiUrl, token })}><Save size={16} /> Salva e verifica</button>
      <p className="text-xs text-base-content/60">Al primo invio vengono caricati anche tutti i registri già presenti in questo telefono. La chiave resta solo su questo dispositivo.</p>
    </div>}
  </div></section>;
};
