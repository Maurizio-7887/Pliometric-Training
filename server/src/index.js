import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import { canonicalPublicApiUrl, positiveEnv } from './config.js';

const { Pool } = pg;
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const SYNC_KEY = process.env.SYNC_KEY || '';
const PAIRING_APP_URL = (process.env.PAIRING_APP_URL || '').trim().replace(/\/$/, '');
const PUBLIC_API_URL = canonicalPublicApiUrl(process.env.PUBLIC_API_URL, { nodeEnv: process.env.NODE_ENV, port: PORT });
const PAIRING_GLOBAL_LIMIT = positiveEnv(process.env.PAIRING_GLOBAL_LIMIT, 60, 'PAIRING_GLOBAL_LIMIT');
const PAIRING_CODE_MAX_ATTEMPTS = positiveEnv(process.env.PAIRING_CODE_MAX_ATTEMPTS, 5, 'PAIRING_CODE_MAX_ATTEMPTS');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://maurizio-7887.github.io')
  .split(',').map(value => value.trim()).filter(Boolean);

if (!DATABASE_URL) throw new Error('DATABASE_URL non configurata');
if (SYNC_KEY.length < 24) throw new Error('SYNC_KEY deve contenere almeno 24 caratteri');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      workout_id TEXT NOT NULL,
      workout_title TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      duration_seconds INTEGER,
      status TEXT NOT NULL CHECK (status IN ('in_corso', 'completato')),
      run_repetitions JSONB,
      total_distance_meters DOUBLE PRECISION,
      average_pace_seconds_per_km DOUBLE PRECISION,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Older deployed databases only allow 'in_corso'/'completato'. Replace that
    -- generated CHECK safely so interrupted sessions can be retained too.
    DO $$
    BEGIN
      ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_status_check;
      ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_status_check
        CHECK (status IN ('in_corso', 'completato', 'interrotto'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS workout_sessions_started_at_idx ON workout_sessions (started_at DESC);
    CREATE INDEX IF NOT EXISTS workout_sessions_workout_id_idx ON workout_sessions (workout_id);
    CREATE TABLE IF NOT EXISTS training_state (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      completed_workout_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO training_state (singleton) VALUES (TRUE) ON CONFLICT (singleton) DO NOTHING;
    CREATE TABLE IF NOT EXISTS device_tokens (
      id UUID PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS pairing_codes (
      code_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), attempts SMALLINT NOT NULL DEFAULT 0
    );
    ALTER TABLE pairing_codes ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS pairing_codes_expires_at_idx ON pairing_codes (expires_at);
    CREATE TABLE IF NOT EXISTS pairing_attempt_limits (scope TEXT PRIMARY KEY, window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS pairing_code_attempts (code_hash TEXT PRIMARY KEY, attempts SMALLINT NOT NULL DEFAULT 0, last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
  `);
}

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const randomCode = () => String(crypto.randomInt(100000, 1000000));
const safeEqual = (provided, expected) => {
  const a = Buffer.from(provided || '');
  const b = Buffer.from(expected || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const optionalFinite = (value, min, max) => value == null || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
const optionalInteger = (value, min, max) => value == null || (Number.isInteger(value) && value >= min && value <= max);
const validRepetition = rep => rep && Number.isInteger(rep.repetition) && rep.repetition > 0 && rep.repetition <= 100
  && optionalFinite(rep.distanceMeters, 0, 100000)
  && optionalFinite(rep.durationSeconds, 0, 86400)
  && optionalFinite(rep.paceSecondsPerKm, 0, 86400);
const validLog = log => log && typeof log.id === 'string' && log.id.length > 0 && log.id.length <= 300
  && typeof log.workoutId === 'string' && log.workoutId.length <= 200
  && typeof log.workoutTitle === 'string' && log.workoutTitle.length <= 500
  && typeof log.startedAt === 'string' && !Number.isNaN(Date.parse(log.startedAt))
  && (log.endedAt == null || (typeof log.endedAt === 'string' && !Number.isNaN(Date.parse(log.endedAt))))
  && optionalFinite(log.durationSeconds, 0, 2147483647) && (log.durationSeconds == null || Number.isInteger(log.durationSeconds))
  && optionalFinite(log.totalDistanceMeters, 0, 10000000)
  && optionalFinite(log.averagePaceSecondsPerKm, 0, 86400)
  && optionalInteger(log.plannedExerciseCount, 0, 1000)
  && optionalInteger(log.completedExerciseCount, 0, 1000)
  && optionalInteger(log.plannedSetCount, 0, 10000)
  && optionalInteger(log.completedSetCount, 0, 10000)
  && (log.plannedExerciseCount == null || log.completedExerciseCount == null || log.completedExerciseCount <= log.plannedExerciseCount)
  && (log.plannedSetCount == null || log.completedSetCount == null || log.completedSetCount <= log.plannedSetCount)
  && (log.runRepetitions == null || (Array.isArray(log.runRepetitions) && log.runRepetitions.length <= 100 && log.runRepetitions.every(validRepetition)))
  && ['in_corso', 'completato', 'interrotto'].includes(log.status);

const app = express();
const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const dashboardFile = path.join(publicDirectory, 'dashboard.html');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) callback(null, true);
    else callback(new Error('Origine non autorizzata'));
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false }));

// This is intentionally a read-only desktop surface. Its JavaScript asks for SYNC_KEY
// in the browser and uses the existing authenticated /api/sync endpoint for all data.
app.get(['/dashboard', '/dashboard/'], (_req, res) => res.sendFile(dashboardFile));
app.use('/dashboard/assets', express.static(path.join(publicDirectory, 'assets'), { maxAge: 0 }));

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'postgresql' }); }
  catch { res.status(503).json({ ok: false }); }
});

async function authenticate(req, res, next) {
  const provided = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (safeEqual(provided, SYNC_KEY)) { req.auth = { kind: 'owner' }; return next(); }
  if (!provided) return res.status(401).json({ error: 'Dispositivo non associato' });
  try {
    const result = await pool.query('SELECT id FROM device_tokens WHERE token_hash = $1 AND revoked_at IS NULL', [hash(provided)]);
    if (!result.rowCount) return res.status(401).json({ error: 'Token dispositivo non valido o revocato' });
    req.auth = { kind: 'device', id: result.rows[0].id };
    void pool.query('UPDATE device_tokens SET last_used_at = NOW() WHERE id = $1', [result.rows[0].id]);
    next();
  } catch (error) { next(error); }
}
const ownerOnly = (req, res, next) => req.auth?.kind === 'owner' ? next() : res.status(403).json({ error: 'Operazione riservata al proprietario' });

const pairingIpLimit = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Troppi tentativi di associazione. Riprova tra qualche minuto.' } });
// PostgreSQL makes this a true account-scoped limit even if the service is scaled horizontally.
async function consumeGlobalPairingAttempt(client) { const result = await client.query(`INSERT INTO pairing_attempt_limits (scope, window_started_at, attempts) VALUES ('default', NOW(), 1) ON CONFLICT (scope) DO UPDATE SET window_started_at = CASE WHEN pairing_attempt_limits.window_started_at < NOW() - INTERVAL '10 minutes' THEN NOW() ELSE pairing_attempt_limits.window_started_at END, attempts = CASE WHEN pairing_attempt_limits.window_started_at < NOW() - INTERVAL '10 minutes' THEN 1 ELSE pairing_attempt_limits.attempts + 1 END RETURNING attempts`); return result.rows[0].attempts <= PAIRING_GLOBAL_LIMIT; }
async function consumeCodeAttempt(client, codeHash) { const result = await client.query(`INSERT INTO pairing_code_attempts (code_hash, attempts) VALUES ($1, 1) ON CONFLICT (code_hash) DO UPDATE SET attempts = pairing_code_attempts.attempts + 1, last_attempt_at = NOW() RETURNING attempts`, [codeHash]); return result.rows[0].attempts <= PAIRING_CODE_MAX_ATTEMPTS; }
app.post('/api/pair', pairingIpLimit, async (req, res, next) => {
  const code = String(req.body?.code || '').replace(/\D/g, '');
  const label = String(req.body?.label || 'Telefono').trim().slice(0, 80) || 'Telefono';
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Inserisci il codice di sei cifre.' });
  // Persist failed attempts outside the token transaction: a rollback must never erase throttling.
  const codeHash = hash(code);
  if (!await consumeGlobalPairingAttempt(pool)) return res.status(429).json({ error: 'Limite globale di associazioni raggiunto. Riprova tra qualche minuto.' });
  if (!await consumeCodeAttempt(pool, codeHash)) return res.status(429).json({ error: 'Numero massimo di tentativi per questo codice raggiunto.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`UPDATE pairing_codes SET used_at = NOW() WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING code_hash`, [codeHash]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Codice non valido, già usato o scaduto.' }); }
    const token = randomToken();
    await client.query('INSERT INTO device_tokens (id, token_hash, label) VALUES ($1,$2,$3)', [crypto.randomUUID(), hash(token), label]);
    await client.query('COMMIT');
    res.json({ token, apiUrl: PUBLIC_API_URL });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});
app.use('/api', authenticate);

async function readAll(client = pool) {
  const [sessions, state] = await Promise.all([
    client.query('SELECT payload FROM workout_sessions ORDER BY started_at DESC'),
    client.query('SELECT completed_workout_ids FROM training_state WHERE singleton = TRUE'),
  ]);
  return {
    logs: sessions.rows.map(row => row.payload),
    completedWorkoutIds: state.rows[0]?.completed_workout_ids || [],
  };
}

app.get('/api/sync', async (_req, res, next) => {
  try { res.json(await readAll()); } catch (error) { next(error); }
});

app.post('/api/sync', async (req, res, next) => {
  const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];
  const completedWorkoutIds = Array.isArray(req.body?.completedWorkoutIds)
    ? [...new Set(req.body.completedWorkoutIds.filter(value => typeof value === 'string').map(value => value.slice(0, 200)))]
    : [];
  if (logs.length > 2000 || !logs.every(validLog)) return res.status(400).json({ error: 'Dati allenamento non validi' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const log of logs) {
      await client.query(`
        INSERT INTO workout_sessions (
          id, workout_id, workout_title, started_at, ended_at, duration_seconds, status,
          run_repetitions, total_distance_meters, average_pace_seconds_per_km, payload
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO UPDATE SET
          workout_id = EXCLUDED.workout_id,
          workout_title = EXCLUDED.workout_title,
          started_at = EXCLUDED.started_at,
          ended_at = COALESCE(EXCLUDED.ended_at, workout_sessions.ended_at),
          duration_seconds = COALESCE(EXCLUDED.duration_seconds, workout_sessions.duration_seconds),
          status = CASE
            WHEN workout_sessions.status = 'completato' OR EXCLUDED.status = 'completato' THEN 'completato'
            WHEN workout_sessions.status = 'interrotto' OR EXCLUDED.status = 'interrotto' THEN 'interrotto'
            ELSE 'in_corso'
          END,
          run_repetitions = COALESCE(EXCLUDED.run_repetitions, workout_sessions.run_repetitions),
          total_distance_meters = COALESCE(EXCLUDED.total_distance_meters, workout_sessions.total_distance_meters),
          average_pace_seconds_per_km = COALESCE(EXCLUDED.average_pace_seconds_per_km, workout_sessions.average_pace_seconds_per_km),
          payload = CASE
            WHEN workout_sessions.status = 'completato' THEN workout_sessions.payload
            WHEN EXCLUDED.status = 'completato' THEN EXCLUDED.payload
            WHEN workout_sessions.status = 'interrotto' THEN workout_sessions.payload
            WHEN EXCLUDED.status = 'interrotto' THEN EXCLUDED.payload
            ELSE EXCLUDED.payload
          END,
          updated_at = NOW()
      `, [
        log.id, log.workoutId, log.workoutTitle, log.startedAt, log.endedAt ?? null,
        Number.isFinite(log.durationSeconds) ? log.durationSeconds : null, log.status,
        log.runRepetitions ? JSON.stringify(log.runRepetitions) : null,
        Number.isFinite(log.totalDistanceMeters) ? log.totalDistanceMeters : null,
        Number.isFinite(log.averagePaceSecondsPerKm) ? log.averagePaceSecondsPerKm : null,
        JSON.stringify(log),
      ]);
    }
    await client.query(`
      UPDATE training_state SET completed_workout_ids = (
        SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
        FROM jsonb_array_elements_text(completed_workout_ids || $1::jsonb)
      ), updated_at = NOW() WHERE singleton = TRUE
    `, [JSON.stringify(completedWorkoutIds)]);
    await client.query('COMMIT');
    res.json(await readAll());
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

app.post('/api/pairings', ownerOnly, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM pairing_codes WHERE expires_at < NOW() OR used_at IS NOT NULL');
    await pool.query(`DELETE FROM pairing_code_attempts WHERE last_attempt_at < NOW() - INTERVAL '1 hour'`);
    let code = ''; let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      code = randomCode();
      try { await pool.query(`INSERT INTO pairing_codes (code_hash, expires_at) VALUES ($1, NOW() + INTERVAL '10 minutes')`, [hash(code)]); inserted = true; }
      catch (error) { if (error.code !== '23505') throw error; }
    }
    if (!inserted) throw new Error('Impossibile generare un codice');
    const apiUrl = PUBLIC_API_URL;
    const pairingUrl = PAIRING_APP_URL ? (() => { const url = new URL(PAIRING_APP_URL); url.searchParams.set('pairing', code); url.searchParams.set('api', apiUrl); return url.toString(); })() : null;
    res.status(201).json({ code, expiresAt: new Date(Date.now() + 600000).toISOString(), pairingUrl });
  } catch (error) { next(error); }
});
app.get('/api/devices', ownerOnly, async (_req, res, next) => {
  try { const { rows } = await pool.query('SELECT id,label,created_at,last_used_at,revoked_at FROM device_tokens ORDER BY created_at DESC'); res.json({ devices: rows.map(row => ({ id: row.id, label: row.label, createdAt: row.created_at, lastUsedAt: row.last_used_at, revokedAt: row.revoked_at })) }); } catch (error) { next(error); }
});
app.delete('/api/devices/:id', ownerOnly, async (req, res, next) => {
  try { const result = await pool.query('UPDATE device_tokens SET revoked_at=NOW() WHERE id=$1 AND revoked_at IS NULL', [req.params.id]); if (!result.rowCount) return res.status(404).json({ error: 'Dispositivo non trovato o già revocato' }); res.status(204).end(); } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Errore interno del servizio' });
});

await initializeDatabase();
app.listen(PORT, '0.0.0.0', () => console.log(`Scatto Forza Sync API attiva sulla porta ${PORT}`));
