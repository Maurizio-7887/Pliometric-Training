import type { SessionLog } from './types';

export const SYNC_URL_KEY = 'scatto-forza-30-sync-url';
export const SYNC_TOKEN_KEY = 'scatto-forza-30-device-token';
const LEGACY_SYNC_TOKEN_KEY = 'scatto-forza-30-sync-token';
export const SYNC_OUTBOX_KEY = 'scatto-forza-30-sync-outbox';
export const REMOTE_IMPORT_KEY = 'scatto-forza-30-remote-import-enabled';
export const DEFAULT_SYNC_API_URL = 'https://pliometric-training-production.up.railway.app';
export const SYNC_REQUEST_TIMEOUT_MS = 15_000;
export const SYNC_BATCH_LOG_LIMIT = 250;
export const SYNC_BATCH_COMPLETED_LIMIT = 500;
export interface SyncConfig { apiUrl: string; token: string; }
export interface SyncPayload { logs: SessionLog[]; completedWorkoutIds: string[]; }
export interface SyncOutbox extends SyncPayload { updatedAt: string; }
export interface SyncVerification { localCount: number; onlineCount: number; verified: boolean; }
const isLocalhost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
/** Only HTTPS APIs are trusted in production. HTTP is limited to localhost while Vite is in development. */
export function normalizeApiUrl(value: string, allowLocalHttp = import.meta.env.DEV): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Inserisci un indirizzo API HTTPS valido.'); }
  const localhostHttp = url.protocol === 'http:' && allowLocalHttp && isLocalhost(url.hostname);
  if (url.protocol !== 'https:' && !localhostHttp) throw new Error('L’API deve usare HTTPS (HTTP è consentito solo su localhost in sviluppo).');
  if (url.username || url.password || url.search || url.hash) throw new Error('L’indirizzo API non può contenere credenziali, parametri o hash.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}
export function readSyncConfig(): SyncConfig {
  const storedUrl = localStorage.getItem(SYNC_URL_KEY); let apiUrl = DEFAULT_SYNC_API_URL;
  if (storedUrl) { try { apiUrl = normalizeApiUrl(storedUrl); } catch { localStorage.removeItem(SYNC_URL_KEY); } }
  return { apiUrl, token: localStorage.getItem(SYNC_TOKEN_KEY) ?? localStorage.getItem(LEGACY_SYNC_TOKEN_KEY) ?? '' };
}
export function saveSyncConfig(config: SyncConfig) {
  const apiUrl = normalizeApiUrl(config.apiUrl), token = config.token.trim();
  localStorage.setItem(SYNC_URL_KEY, apiUrl);
  if (token) localStorage.setItem(SYNC_TOKEN_KEY, token); else localStorage.removeItem(SYNC_TOKEN_KEY);
  localStorage.removeItem(LEGACY_SYNC_TOKEN_KEY);
}
export function isSyncConfigured(config: SyncConfig) { try { normalizeApiUrl(config.apiUrl); return config.token.length >= 24; } catch { return false; } }
export function readOutbox(): SyncOutbox { try { const raw = JSON.parse(localStorage.getItem(SYNC_OUTBOX_KEY) || 'null'); if (raw && Array.isArray(raw.logs) && Array.isArray(raw.completedWorkoutIds)) return raw; } catch { /* invalid local data */ } return { logs: [], completedWorkoutIds: [], updatedAt: new Date().toISOString() }; }
export function saveOutbox(outbox: SyncOutbox) { localStorage.setItem(SYNC_OUTBOX_KEY, JSON.stringify(outbox)); }
/** Adds only records changed by the caller; it never requeues the entire local history. */
export function enqueueSync(current: SyncOutbox, changedLogs: SessionLog[] = [], changedCompletedWorkoutIds: string[] = []): SyncOutbox { const byId = new Map(current.logs.map(log => [log.id, log])); changedLogs.forEach(log => byId.set(log.id, log)); return { logs: [...byId.values()], completedWorkoutIds: [...new Set([...current.completedWorkoutIds, ...changedCompletedWorkoutIds])], updatedAt: new Date().toISOString() }; }
export function takeSyncBatch(outbox: SyncOutbox): SyncPayload { return { logs: outbox.logs.slice(0, SYNC_BATCH_LOG_LIMIT), completedWorkoutIds: outbox.completedWorkoutIds.slice(0, SYNC_BATCH_COMPLETED_LIMIT) }; }
/** Removes only IDs that the server acknowledged, retaining edits made while the request was in flight. */
export function acknowledgeSyncBatch(current: SyncOutbox, sent: SyncPayload, remoteLogs: SessionLog[]): SyncOutbox { const remoteIds = new Set(remoteLogs.map(log => log.id)), sentById = new Map(sent.logs.map(log => [log.id, JSON.stringify(log)])), sentCompleted = new Set(sent.completedWorkoutIds); return { logs: current.logs.filter(log => !(sentById.get(log.id) === JSON.stringify(log) && remoteIds.has(log.id))), completedWorkoutIds: current.completedWorkoutIds.filter(id => !sentCompleted.has(id)), updatedAt: new Date().toISOString() }; }
export function clearOutbox() { localStorage.removeItem(SYNC_OUTBOX_KEY); }
export function isRemoteImportEnabled() { return localStorage.getItem(REMOTE_IMPORT_KEY) !== 'false'; }
export function setRemoteImportEnabled(enabled: boolean) { localStorage.setItem(REMOTE_IMPORT_KEY, enabled ? 'true' : 'false'); }
async function request(url: string, init: RequestInit, config: SyncConfig) { const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS); try { const response = await fetch(`${normalizeApiUrl(config.apiUrl)}${url}`, { ...init, signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}`, ...(init.headers || {}) } }); if (!response.ok) { const detail = await response.text().catch(() => ''); throw new Error(detail || `Errore sincronizzazione (${response.status})`); } return response; } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw new Error('La richiesta di sincronizzazione è scaduta. Riprova.'); throw error; } finally { window.clearTimeout(timeout); } }
export async function synchronizeTraining(payload: SyncPayload, config: SyncConfig): Promise<SyncPayload> { return (await request('/api/sync', { method: 'POST', body: JSON.stringify(payload) }, config)).json() as Promise<SyncPayload>; }
export async function pairDevice(apiUrl: string, code: string, label: string): Promise<SyncConfig> { const cleanUrl = normalizeApiUrl(apiUrl), controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), SYNC_REQUEST_TIMEOUT_MS); try { const response = await fetch(`${cleanUrl}/api/pair`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, label }) }); if (!response.ok) { let detail = ''; try { detail = (await response.json()).error || ''; } catch { /* fallback */ } throw new Error(detail || 'Associazione non riuscita'); } const data = await response.json() as { token: string; apiUrl?: string }; if (typeof data.token !== 'string' || data.token.length < 24 || typeof data.apiUrl !== 'string') throw new Error('Risposta di associazione non valida.'); if (normalizeApiUrl(data.apiUrl) !== cleanUrl) throw new Error('Il server di associazione ha restituito un URL API non atteso.'); return { apiUrl: cleanUrl, token: data.token }; } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw new Error('La richiesta di associazione è scaduta. Riprova.'); throw error; } finally { window.clearTimeout(timeout); } }
export function verifyRemoteLogs(localLogs: SessionLog[], remoteLogs: SessionLog[]): SyncVerification { const ids = new Set(remoteLogs.map(log => log.id)), missing = localLogs.filter(log => !ids.has(log.id)); if (missing.length) throw new Error(`${missing.length} registri non sono ancora confermati online.`); return { localCount: localLogs.length, onlineCount: remoteLogs.length, verified: true }; }
/** Remote payload is canonical for ties; local data wins only when it is demonstrably more complete. */
export function mergeLogs(local: SessionLog[], remote: SessionLog[]): SessionLog[] { const merged = new Map<string, SessionLog>(); [...remote, ...local].forEach(log => { const old = merged.get(log.id); if (!old) return void merged.set(log.id, log); const score = (x: SessionLog) => (x.status === 'completato' ? 200 : x.status === 'interrotto' ? 100 : 0) + (x.endedAt ? 20 : 0) + (x.runRepetitions?.length ?? 0) * 2; if (score(log) > score(old)) merged.set(log.id, log); }); return [...merged.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)); }
