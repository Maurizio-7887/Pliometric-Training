const localHost = hostname => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
export function canonicalPublicApiUrl(value, { nodeEnv = 'development', port = 3000 } = {}) {
  const fallback = nodeEnv === 'production' ? '' : `http://localhost:${port}`;
  const input = String(value || fallback).trim();
  if (!input) throw new Error('PUBLIC_API_URL è obbligatoria in produzione');
  let url;
  try { url = new URL(input); } catch { throw new Error('PUBLIC_API_URL deve essere un URL assoluto valido'); }
  if (url.protocol !== 'https:' && !(nodeEnv !== 'production' && url.protocol === 'http:' && localHost(url.hostname))) throw new Error('PUBLIC_API_URL deve usare HTTPS; HTTP è ammesso solo su localhost in sviluppo');
  if (url.username || url.password || url.search || url.hash) throw new Error('PUBLIC_API_URL non può contenere credenziali, query o hash');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}
export function positiveEnv(value, fallback, name) { const parsed = Number(value ?? fallback); if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} deve essere un intero positivo`); return parsed; }
