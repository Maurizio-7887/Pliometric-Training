export type MoveKind = 'warmup' | 'pogo' | 'squat' | 'broad' | 'lateral' | 'split' | 'bounds' | 'feet' | 'sprint' | 'calf' | 'cooldown';

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
}

export interface RunSessionSummary {
  startedAt: string;
  endedAt: string;
  targetMeters: number;
  recoverySeconds: number;
  repetitions: RunRepResult[];
}

export interface SessionLog {
  id: string;
  workoutId: string;
  workoutTitle: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  status: 'in_corso' | 'completato';
  runRepetitions?: RunRepResult[];
  totalDistanceMeters?: number;
  averagePaceSecondsPerKm?: number;
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
