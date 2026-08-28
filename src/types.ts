export type MoveKind = 'warmup' | 'pogo' | 'squat' | 'broad' | 'lateral' | 'split' | 'bounds' | 'feet' | 'sprint' | 'calf' | 'cooldown';
export type SessionStatus = 'in_corso' | 'completato' | 'interrotto';

export interface Exercise {
  id: string;
  name: string;
  kind: MoveKind;
  sets: number;
  prescription: string;
  work: number;
  rest: number;
  instructions: string;
  cues: string[];
  category: string;
  vest?: string;
}

export interface RunRepResult {
  repetition: number;
  distanceMeters: number;
  durationSeconds: number;
  paceSecondsPerKm: number;
  averageSpeedKmh?: number;
  maxSpeedKmh?: number;
}

export interface RunSessionSummary {
  startedAt: string;
  endedAt: string;
  targetMeters: number;
  recoverySeconds: number;
  repetitions: RunRepResult[];
  status: Extract<SessionStatus, 'completato' | 'interrotto'>;
}

export interface PlyoProgress {
  plannedExerciseCount: number;
  completedExerciseCount: number;
  plannedSetCount: number;
  completedSetCount: number;
}

export interface SessionLog {
  id: string;
  workoutId: string;
  workoutTitle: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  status: SessionStatus;
  runRepetitions?: RunRepResult[];
  totalDistanceMeters?: number;
  averagePaceSecondsPerKm?: number;
  plannedExerciseCount?: number;
  completedExerciseCount?: number;
  plannedSetCount?: number;
  completedSetCount?: number;
}

export interface Workout {
  id: string;
  week: number;
  day: number;
  title: string;
  focus: string;
  duration: string;
  intensity: string;
  exercises: Exercise[];
}

export interface TimerCheckpoint { kind: 'plyo'; workoutId: string; startedAt: string; idx: number; setNo: number; phase: 'ready' | 'work' | 'rest'; left: number; savedAt: string; activeMilliseconds?: number; }
export interface RunCheckpoint { kind: 'run'; programId: '400' | '800' | '1000'; phase: 'running' | 'resting'; repNo: number; repDistance: number; repElapsed: number; restLeft: number; repMaxSpeedKmh?: number; completedReps: RunRepResult[]; startedAt: string; savedAt: string; }
export type ActiveSessionCheckpoint = TimerCheckpoint | RunCheckpoint;
