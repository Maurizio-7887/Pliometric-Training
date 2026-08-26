import type { SessionLog } from './types';

export const SYNC_URL_KEY = 'scatto-forza-30-sync-url';
export const SYNC_TOKEN_KEY = 'scatto-forza-30-sync-token';
export const DEFAULT_SYNC_API_URL = 'https://pliometric-training-production.up.railway.app';

export interface SyncConfig {
  apiUrl: string;
  token: string;
}

export interface SyncPayload {
  logs: SessionLog[];
  completedWorkoutIds: string[];
}

export interface SyncVerification {
  localCount: number;
  onlineCount: number;
  verified: boolean;
}

export function readSyncConfig(): SyncConfig {
  return {
    // A ready-to-use endpoint reduces setup mistakes, but the personal key is never stored in source.
    apiUrl: localStorage.getItem(SYNC_URL_KEY) || DEFAULT_SYNC_API_URL,
    token: localStorage.getItem(SYNC_TOKEN_KEY) ?? '',
  };
}

export function saveSyncConfig(config: SyncConfig) {
  const apiUrl = config.apiUrl.trim().replace(/\/+$/, '');
  const token = config.token.trim();
  if (apiUrl) localStorage.setItem(SYNC_URL_KEY, apiUrl); else localStorage.removeItem(SYNC_URL_KEY);
  if (token) localStorage.setItem(SYNC_TOKEN_KEY, token); else localStorage.removeItem(SYNC_TOKEN_KEY);
}

export function isSyncConfigured(config: SyncConfig) {
  return /^https:\/\//i.test(config.apiUrl) && config.token.length >= 24;
}

export async function synchronizeTraining(payload: SyncPayload, config: SyncConfig): Promise<SyncPayload> {
  const response = await fetch(`${config.apiUrl.replace(/\/+$/, '')}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Errore sincronizzazione (${response.status})`);
  }
  return response.json() as Promise<SyncPayload>;
}

/** A POST is successful only when Railway returns every record that was just sent. */
export function verifyRemoteLogs(localLogs: SessionLog[], remoteLogs: SessionLog[]): SyncVerification {
  const remoteIds = new Set(remoteLogs.map(log => log.id));
  const missing = localLogs.filter(log => !remoteIds.has(log.id));
  if (missing.length) {
    throw new Error(`${missing.length} registr${missing.length === 1 ? 'o non è' : 'i non sono'} ancora confermat${missing.length === 1 ? 'o' : 'i'} online. Riprova l'invio.`);
  }
  return { localCount: localLogs.length, onlineCount: remoteLogs.length, verified: true };
}

export function mergeLogs(local: SessionLog[], remote: SessionLog[]): SessionLog[] {
  const merged = new Map<string, SessionLog>();
  [...remote, ...local].forEach(log => {
    const current = merged.get(log.id);
    if (!current) { merged.set(log.id, log); return; }
    const score = (item: SessionLog) => (item.status === 'completato' ? 200 : item.status === 'interrotto' ? 100 : 0)
      + (item.endedAt ? 20 : 0)
      + (item.runRepetitions?.length ?? 0) * 2
      + (item.totalDistanceMeters ? 1 : 0)
      + (item.averagePaceSecondsPerKm ? 1 : 0);
    if (score(log) > score(current)) merged.set(log.id, { ...current, ...log });
  });
  return [...merged.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
