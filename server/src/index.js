import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';

const { Pool } = pg;
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const SYNC_KEY = process.env.SYNC_KEY || '';
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
  `);
}

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
    if (!origin || ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) callback(null, true);
    else callback(new Error('Origine non autorizzata'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: true, legacyHeaders: false }));

// This is intentionally a read-only desktop surface. Its JavaScript asks for SYNC_KEY
// in the browser and uses the existing authenticated /api/sync endpoint for all data.
app.get(['/dashboard', '/dashboard/'], (_req, res) => res.sendFile(dashboardFile));
app.use('/dashboard/assets', express.static(path.join(publicDirectory, 'assets'), { maxAge: '1d' }));

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'postgresql' }); }
  catch { res.status(503).json({ ok: false }); }
});

app.use('/api', (req, res, next) => {
  const provided = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!safeEqual(provided, SYNC_KEY)) return res.status(401).json({ error: 'Chiave personale non valida' });
  next();
});

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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Errore interno del servizio' });
});

await initializeDatabase();
app.listen(PORT, '0.0.0.0', () => console.log(`Scatto Forza Sync API attiva sulla porta ${PORT}`));
