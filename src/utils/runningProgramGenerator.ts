import {
  ExerciseCategory,
  ProgramRunnerLevel,
  ProgramSessionOverride,
  RunningDistanceKey,
  RunningPaceZones,
  ScheduledExerciseItem,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';

export const PROGRAM_RUNNER_LEVEL_OPTIONS: {
  value: ProgramRunnerLevel;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    value: 'beginner',
    label: 'Débutant',
    shortLabel: 'Débutant',
    description: 'Progression progressive sur une durée étendue',
  },
  {
    value: 'regular',
    label: 'Régulier',
    shortLabel: 'Régulier',
    description: 'Pratique régulière (2 à 4 séances/sem.)',
  },
  {
    value: 'experienced',
    label: 'Expérimenté',
    shortLabel: 'Expérimenté',
    description: 'Coureur confirmé, cycle dynamique',
  },
];

export const PROGRAM_DURATION_BY_DISTANCE_AND_LEVEL: Record<
  RunningDistanceKey,
  Record<ProgramRunnerLevel, number>
> = {
  '5km': { beginner: 10, regular: 8, experienced: 8 },
  '10km': { beginner: 12, regular: 10, experienced: 10 },
  '21km': { beginner: 14, regular: 12, experienced: 12 },
  '42km': { beginner: 16, regular: 14, experienced: 14 },
};

export function getProgramDurationWeeks(
  distance: RunningDistanceKey,
  level: ProgramRunnerLevel = 'regular'
): number {
  const byDist = PROGRAM_DURATION_BY_DISTANCE_AND_LEVEL[distance];
  return byDist[level] ?? byDist.regular;
}

export function inferProgramLevelFromDuration(
  distance: RunningDistanceKey,
  durationWeeks?: number | null
): ProgramRunnerLevel {
  if (!durationWeeks) return 'regular';
  const beginnerWeeks = PROGRAM_DURATION_BY_DISTANCE_AND_LEVEL[distance].beginner;
  return durationWeeks >= beginnerWeeks ? 'beginner' : 'regular';
}

export function mapFitnessLevelToProgramLevel(
  fitnessLevel?: string | null
): ProgramRunnerLevel {
  if (fitnessLevel === 'beginner') return 'beginner';
  if (fitnessLevel === 'advanced') return 'experienced';
  return 'regular';
}

export function getProgramRunnerLevelLabel(
  level?: ProgramRunnerLevel | null
): string {
  if (level === 'beginner') return 'Débutant';
  if (level === 'regular') return 'Régulier';
  if (level === 'experienced') return 'Expérimenté';
  return '';
}

export interface RunningDistanceTemplate {
  key: RunningDistanceKey;
  label: string;
  shortLabel: string;
  distanceKm: number;
  beginnerWeeks: number;
  regularWeeks: number;
  defaultTargetTimeSeconds: number;
  defaultSessionsPerWeek: number;
  defaultPriceCents: number;
  tagline: string;
  phaseTitles: [string, string, string, string];
}

export const RUNNING_DISTANCE_TEMPLATES: Record<
  RunningDistanceKey,
  RunningDistanceTemplate
> = {
  '5km': {
    key: '5km',
    label: 'Programme 5 km',
    shortLabel: '5 km',
    distanceKm: 5,
    beginnerWeeks: 10,
    regularWeeks: 8,
    defaultTargetTimeSeconds: 25 * 60, // 25 min (5:00/km)
    defaultSessionsPerWeek: VALIDATION_LIMITS.PROGRAM_DEFAULT_SESSIONS_PER_WEEK,
    defaultPriceCents: 3900,
    tagline: 'Vitesse, VMA courte et soutien à l’allure 5 km (8 à 10 semaines).',
    phaseTitles: [
      'Test VMA, socle aérobie & foulée',
      'Développement VMA & tolérance lactique',
      'Blocs à allure spécifique AS5',
      'Affûtage & Course 5 km',
    ],
  },
  '10km': {
    key: '10km',
    label: 'Programme 10 km',
    shortLabel: '10 km',
    distanceKm: 10,
    beginnerWeeks: 12,
    regularWeeks: 10,
    defaultTargetTimeSeconds: 50 * 60, // 50 min (5:00/km)
    defaultSessionsPerWeek: VALIDATION_LIMITS.PROGRAM_DEFAULT_SESSIONS_PER_WEEK,
    defaultPriceCents: 4900,
    tagline: 'Équilibre VMA, seuil et résistance spécifique 10 km (10 à 12 semaines).',
    phaseTitles: [
      'Test VMA, endurance & renforcement runner',
      'VMA longue & travail au seuil',
      'Allure spécifique AS10 & rappels VMA',
      'Affûtage & Course 10 km',
    ],
  },
  '21km': {
    key: '21km',
    label: 'Programme 21 km (Semi-marathon)',
    shortLabel: '21 km',
    distanceKm: 21.1,
    beginnerWeeks: 14,
    regularWeeks: 12,
    defaultTargetTimeSeconds: 115 * 60, // 1h55
    defaultSessionsPerWeek: VALIDATION_LIMITS.PROGRAM_DEFAULT_SESSIONS_PER_WEEK,
    defaultPriceCents: 6900,
    tagline: 'Endurance fondamentale, seuil prolongé et allure semi AS21 (12 à 14 semaines).',
    phaseTitles: [
      'Test VMA, volume progressif & gainage',
      'Seuil tempo & sorties longues',
      'Allure spécifique AS21 sous fatigue',
      'Affûtage & Semi-marathon',
    ],
  },
  '42km': {
    key: '42km',
    label: 'Programme 42 km (Marathon)',
    shortLabel: '42 km',
    distanceKm: 42.195,
    beginnerWeeks: 16,
    regularWeeks: 14,
    defaultTargetTimeSeconds: 4 * 3600, // 4h00
    defaultSessionsPerWeek: VALIDATION_LIMITS.PROGRAM_DEFAULT_SESSIONS_PER_WEEK,
    defaultPriceCents: 8900,
    tagline: 'Volume aérobie, robustesse musculaire et maîtrise de l’allure AS42 (14 à 16 semaines).',
    phaseTitles: [
      'Test VMA, endurance & PPG protectrice',
      'Montée en volume & blocs AS42',
      'Pic de charge spécifique Marathon',
      'Affûtage & Marathon',
    ],
  },
};

export function getProgramPhaseBounds(durationWeeks: number): {
  p1End: number;
  p2End: number;
  p3End: number;
  totalWeeks: number;
} {
  const totalWeeks = Math.min(
    VALIDATION_LIMITS.PROGRAM_DURATION_WEEKS_MAX,
    Math.max(VALIDATION_LIMITS.PROGRAM_DURATION_WEEKS_MIN, Math.round(durationWeeks) || 10)
  );
  const preRace = totalWeeks - 1;
  const p1End = Math.max(2, Math.round(preRace / 3));
  const p2End = Math.max(p1End + 2, p1End + Math.ceil((preRace - p1End) / 2));
  const p3End = preRace;
  return { p1End, p2End, p3End, totalWeeks };
}

export function getProgramPhases(
  distance: RunningDistanceKey,
  durationWeeks: number
): [string, string, string, string] {
  const titles = RUNNING_DISTANCE_TEMPLATES[distance].phaseTitles;
  const { p1End, p2End, p3End, totalWeeks } = getProgramPhaseBounds(durationWeeks);
  return [
    `Sem. 1–${p1End} · ${titles[0]}`,
    `Sem. ${p1End + 1}–${p2End} · ${titles[1]}`,
    p2End + 1 === p3End
      ? `Sem. ${p3End} · ${titles[2]}`
      : `Sem. ${p2End + 1}–${p3End} · ${titles[2]}`,
    `Sem. ${totalWeeks} · ${titles[3]}`,
  ];
}

export const RUNNING_DISTANCE_LIST: RunningDistanceTemplate[] = [
  RUNNING_DISTANCE_TEMPLATES['5km'],
  RUNNING_DISTANCE_TEMPLATES['10km'],
  RUNNING_DISTANCE_TEMPLATES['21km'],
  RUNNING_DISTANCE_TEMPLATES['42km'],
];

export const WEEKDAY_OPTIONS: { day: number; short: string; label: string }[] = [
  { day: 1, short: 'Lun', label: 'Lundi' },
  { day: 2, short: 'Mar', label: 'Mardi' },
  { day: 3, short: 'Mer', label: 'Mercredi' },
  { day: 4, short: 'Jeu', label: 'Jeudi' },
  { day: 5, short: 'Ven', label: 'Vendredi' },
  { day: 6, short: 'Sam', label: 'Samedi' },
  { day: 7, short: 'Dim', label: 'Dimanche' },
];

export function getDefaultPreferredDays(sessionsPerWeek: number): number[] {
  switch (sessionsPerWeek) {
    case 2:
      return [2, 6]; // Mar, Sam
    case 3:
      return [2, 4, 7]; // Mar, Jeu, Dim
    case 4:
      return [2, 4, 6, 7]; // Mar, Jeu, Sam, Dim
    case 5:
      return [1, 2, 4, 6, 7]; // Lun, Mar, Jeu, Sam, Dim
    case 6:
      return [1, 2, 3, 4, 6, 7]; // Lun..Jeu, Sam, Dim
    default:
      return [2, 4, 7];
  }
}

export function normalizePreferredDays(
  preferredDays: number[],
  sessionsPerWeek: number
): number[] {
  const clampedCount = Math.min(
    VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN,
      Math.round(sessionsPerWeek) || 3
    )
  );
  const validUnique = Array.from(
    new Set(
      preferredDays
        .map((d) => Math.round(d))
        .filter((d) => d >= 1 && d <= 7)
    )
  ).sort((a, b) => a - b);

  if (validUnique.length === clampedCount) {
    return validUnique;
  }
  if (validUnique.length > clampedCount) {
    return validUnique.slice(0, clampedCount);
  }
  const fallback = getDefaultPreferredDays(clampedCount);
  const merged = Array.from(new Set([...validUnique, ...fallback])).sort(
    (a, b) => a - b
  );
  if (merged.length >= clampedCount) {
    return merged.slice(0, clampedCount);
  }
  for (let d = 1; d <= 7 && merged.length < clampedCount; d += 1) {
    if (!merged.includes(d)) merged.push(d);
  }
  return merged.sort((a, b) => a - b);
}

export function formatPreferredDaysShort(
  preferredDays: number[],
  sessionsPerWeek?: number
): string {
  const days =
    sessionsPerWeek !== undefined
      ? normalizePreferredDays(preferredDays, sessionsPerWeek)
      : Array.from(
          new Set(
            preferredDays
              .map((d) => Math.round(d))
              .filter((d) => d >= 1 && d <= 7)
          )
        ).sort((a, b) => a - b);
  return days
    .map((d) => WEEKDAY_OPTIONS.find((w) => w.day === d)?.short ?? '')
    .filter(Boolean)
    .join(', ');
}

export function formatDurationHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}${
      seconds > 0 ? `:${String(seconds).padStart(2, '0')}` : ''
    }`;
  }
  return `${minutes}m${String(seconds).padStart(2, '0')}`;
}

export function formatPaceMinPerKm(secPerKm: number): string {
  const safe = Math.max(120, Math.round(secPerKm));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}'${String(sec).padStart(2, '0')}"/km`;
}

export function paceSecToKmh(secPerKm: number): number {
  if (secPerKm <= 0) return 0;
  return Math.round((3600 / secPerKm) * 10) / 10;
}

export function kmhToSecPerKm(kmh: number): number {
  if (kmh <= 0) return 360;
  return Math.round(3600 / kmh);
}

export function computeTargetRacePaceSecPerKm(
  distance: RunningDistanceKey,
  targetTimeSeconds: number
): number {
  const tpl = RUNNING_DISTANCE_TEMPLATES[distance];
  return Math.round(targetTimeSeconds / tpl.distanceKm);
}

/**
 * Calcul VMA depuis test terrain (ex. Demi-Cooper 6 min = distanceMeters / 100).
 * Généralisé pour n'importe quelle durée en secondes :
 * VMA (km/h) = (distanceMeters / 1000) / (durationSeconds / 3600)
 */
export function computeVmaFromTest(
  distanceMeters: number,
  durationSeconds: number
): number {
  if (distanceMeters <= 0 || durationSeconds <= 0) return 0;
  const raw = (distanceMeters / 1000) / (durationSeconds / 3600);
  return Math.round(raw * 10) / 10;
}

export function computeVmaPaceZones(
  vmaKmh: number,
  distance: RunningDistanceKey,
  targetTimeSeconds: number
): RunningPaceZones {
  const safeVma = Math.min(
    VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH,
    Math.max(VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH, vmaKmh)
  );
  const targetRacePaceSecPerKm = computeTargetRacePaceSecPerKm(
    distance,
    targetTimeSeconds
  );

  return {
    vmaKmh: Math.round(safeVma * 10) / 10,
    efMinSecPerKm: kmhToSecPerKm(safeVma * 0.72),
    efMaxSecPerKm: kmhToSecPerKm(safeVma * 0.64),
    as42SecPerKm: kmhToSecPerKm(safeVma * 0.78),
    as21SecPerKm: kmhToSecPerKm(safeVma * 0.83),
    seuilSecPerKm: kmhToSecPerKm(safeVma * 0.86),
    as10SecPerKm: kmhToSecPerKm(safeVma * 0.9),
    as5SecPerKm: kmhToSecPerKm(safeVma * 0.94),
    vma100SecPerKm: kmhToSecPerKm(safeVma * 1.0),
    vma105SecPerKm: kmhToSecPerKm(safeVma * 1.05),
    targetRacePaceSecPerKm,
  };
}

export type ProgramFocusZone =
  | 'vma_test'
  | 'ef'
  | 'vma_short'
  | 'vma_long'
  | 'threshold'
  | 'race_pace'
  | 'long_run'
  | 'strength_hills'
  | 'race_day';

export interface GeneratedProgramSession {
  key: string; // e.g. 'w1-s1'
  programId: string;
  weekNumber: number; // 1..durationWeeks
  sessionIndexInWeek: number; // 1..sessionsPerWeek
  phaseLabel: string;
  scheduledDate: Date;
  durationMinutes: number;
  title: string;
  discipline: string;
  focusZone: ProgramFocusZone;
  focusLabel: string;
  isVmaTest: boolean;
  isRaceDay: boolean;
  targetPaceLabel: string;
  targetPaceRangeLabel: string;
  coachNotes: string;
  exercises: ScheduledExerciseItem[];
  completed: boolean;
  isCustomized?: boolean;
}

export function estimateExercisesDurationMinutes(
  exercises: ScheduledExerciseItem[]
): number {
  if (!exercises.length) return 45;
  let totalSeconds = 0;
  for (const item of exercises) {
    const workPerSet =
      item.durationSeconds > 0
        ? item.durationSeconds
        : Math.max(15, item.repetitions * 4);
    const pausePerSet =
      item.intraSetPauseSeconds > 0 ? item.intraSetPauseSeconds : 0;
    const rounds = Math.max(1, item.setsOrRounds || 1);
    const roundsRest =
      rounds > 1 ? (rounds - 1) * (item.restBetweenRoundsSeconds || 0) : 0;
    totalSeconds += rounds * (workPerSet + pausePerSet) + roundsRest + 45;
  }
  const minutes = Math.round(totalSeconds / 60);
  return Math.min(
    VALIDATION_LIMITS.DURATION_MAX,
    Math.max(VALIDATION_LIMITS.DURATION_MIN, minutes || 30)
  );
}

function makeEx(
  exerciseId: string,
  name: string,
  category: ExerciseCategory,
  repetitions: number,
  durationSeconds: number,
  setsOrRounds: number,
  intraSetPauseSeconds: number,
  restBetweenRoundsSeconds: number,
  notes: string
): ScheduledExerciseItem {
  return {
    exerciseId,
    name,
    category,
    repetitions,
    durationSeconds,
    setsOrRounds,
    intraSetPauseSeconds,
    restBetweenRoundsSeconds,
    notes,
  };
}

function toIsoWeekday(date: Date): number {
  const js = date.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js; // 1=Mon..7=Sun
}

function addDaysAtHour(base: Date, daysOffset: number, hour = 18, minute = 0): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + daysOffset,
    hour,
    minute,
    0,
    0
  );
}

function toStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function resolveProgramStartAnchor(
  program: Pick<TrainingProgram, 'startAt' | 'desiredStartAt' | 'vmaTestStatus' | 'vmaTestedAt'>,
  nowMs: number = Date.now()
): Date {
  const rawDesired =
    program.desiredStartAt?.toDate?.() ??
    program.startAt?.toDate?.() ??
    new Date(nowMs);
  const desiredDay = toStartOfDay(rawDesired);

  if (program.vmaTestStatus === 'completed' && program.vmaTestedAt?.toDate) {
    const vmaDoneDay = toStartOfDay(program.vmaTestedAt.toDate());
    const dayAfterVma = addDaysAtHour(vmaDoneDay, 1, 0, 0);
    return dayAfterVma.getTime() > desiredDay.getTime() ? dayAfterVma : desiredDay;
  }

  const todayStart = toStartOfDay(new Date(nowMs));
  const tomorrow = addDaysAtHour(todayStart, 1, 0, 0);
  return tomorrow.getTime() > desiredDay.getTime() ? tomorrow : desiredDay;
}

function computeWeekDates(
  programAnchorDate: Date,
  sessionsPerWeek: number,
  preferredDays: number[],
  durationWeeks: number
): Date[][] {
  const normalizedDays = normalizePreferredDays(preferredDays, sessionsPerWeek);
  const preferredSet = new Set(normalizedDays);
  const anchorDay = toStartOfDay(programAnchorDate);

  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  let daysOffset = 0;
  const maxScanDays = durationWeeks * 14 + 30;

  while (weeks.length < durationWeeks && daysOffset < maxScanDays) {
    const candidateDay = addDaysAtHour(anchorDay, daysOffset, 0, 0);
    const isoDay = toIsoWeekday(candidateDay);
    if (preferredSet.has(isoDay)) {
      currentWeek.push(
        addDaysAtHour(anchorDay, daysOffset, isoDay >= 6 ? 9 : 18, 0)
      );
      if (currentWeek.length === normalizedDays.length) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    daysOffset += 1;
  }

  return weeks;
}

function getPhaseForWeek(
  distance: RunningDistanceKey,
  weekNumber: number,
  durationWeeks: number
): string {
  const phases = getProgramPhases(distance, durationWeeks);
  const { p1End, p2End, p3End } = getProgramPhaseBounds(durationWeeks);
  if (weekNumber <= p1End) return phases[0];
  if (weekNumber <= p2End) return phases[1];
  if (weekNumber <= p3End) return phases[2];
  return phases[3];
}

function paceInfoForZone(
  zone: ProgramFocusZone,
  distance: RunningDistanceKey,
  zones: RunningPaceZones | null,
  durationWeeks: number
): { label: string; range: string } {
  if (zone === 'vma_test') {
    return {
      label: 'Allure maximale soutenue sur 6 min · Effectuable n’importe quel jour',
      range: `Calibre vos allures des ${durationWeeks} semaines`,
    };
  }
  if (!zones) {
    return {
      label: 'Allure calibrée après le Test VMA',
      range: 'En attente du Test VMA',
    };
  }

  switch (zone) {
    case 'ef':
      return {
        label: `EF 64–72% VMA : ${formatPaceMinPerKm(zones.efMinSecPerKm)} – ${formatPaceMinPerKm(zones.efMaxSecPerKm)}`,
        range: `${formatPaceMinPerKm(zones.efMinSecPerKm)} à ${formatPaceMinPerKm(zones.efMaxSecPerKm)}`,
      };
    case 'vma_short':
      return {
        label: `VMA 100–105% : ${formatPaceMinPerKm(zones.vma105SecPerKm)} – ${formatPaceMinPerKm(zones.vma100SecPerKm)}`,
        range: `${paceSecToKmh(zones.vma100SecPerKm)}–${paceSecToKmh(zones.vma105SecPerKm)} km/h`,
      };
    case 'vma_long':
      return {
        label: `VMA 95–100% : ${formatPaceMinPerKm(zones.vma100SecPerKm)} – ${formatPaceMinPerKm(zones.as5SecPerKm)}`,
        range: `${formatPaceMinPerKm(zones.vma100SecPerKm)} à ${formatPaceMinPerKm(zones.as5SecPerKm)}`,
      };
    case 'threshold':
      return {
        label: `Seuil 85–88% VMA : ${formatPaceMinPerKm(zones.seuilSecPerKm)}`,
        range: `${paceSecToKmh(zones.seuilSecPerKm)} km/h · Effort soutenu contrôlé`,
      };
    case 'race_pace': {
      const specificPace =
        distance === '5km'
          ? zones.as5SecPerKm
          : distance === '10km'
            ? zones.as10SecPerKm
            : distance === '21km'
              ? zones.as21SecPerKm
              : zones.as42SecPerKm;
      return {
        label: `Allure spéc. ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel} : ${formatPaceMinPerKm(specificPace)} (Obj. ${formatPaceMinPerKm(zones.targetRacePaceSecPerKm)})`,
        range: `VMA ${distance === '5km' ? '94%' : distance === '10km' ? '90%' : distance === '21km' ? '83%' : '78%'}`,
      };
    }
    case 'long_run': {
      const endPace =
        distance === '42km'
          ? zones.as42SecPerKm
          : distance === '21km'
            ? zones.as21SecPerKm
            : zones.efMinSecPerKm;
      return {
        label: `EF ${formatPaceMinPerKm(zones.efMaxSecPerKm)} → Fin ${formatPaceMinPerKm(endPace)}`,
        range: 'Endurance progressive',
      };
    }
    case 'strength_hills':
      return {
        label: `EF ${formatPaceMinPerKm(zones.efMinSecPerKm)} + Côtes / Renforcement`,
        range: 'Puissance & prévention blessures',
      };
    case 'race_day':
      return {
        label: `Allure objectif : ${formatPaceMinPerKm(zones.targetRacePaceSecPerKm)} (VMA ${zones.vmaKmh.toFixed(1)} km/h)`,
        range: `Objectif chrono ${formatDurationHMS(zones.targetRacePaceSecPerKm * RUNNING_DISTANCE_TEMPLATES[distance].distanceKm)}`,
      };
    default:
      return { label: '', range: '' };
  }
}

function buildVmaTestWorkout(): {
  title: string;
  focusZone: ProgramFocusZone;
  focusLabel: string;
  durationMinutes: number;
  isVmaTest: boolean;
  isRaceDay: boolean;
  coachNotes: string;
  exercises: ScheduledExerciseItem[];
} {
  return {
    title: 'Test VMA · Demi-Cooper 6 min',
    focusZone: 'vma_test',
    focusLabel: 'Évaluation VMA · N’importe quel jour',
    durationMinutes: 45,
    isVmaTest: true,
    isRaceDay: false,
    coachNotes:
      'Séance préalable effectuable n’importe quel jour : échauffez-vous 15 min puis parcourez la plus grande distance possible en 6 minutes à allure régulière. Enregistrez votre résultat : le programme démarrera ensuite selon les jours choisis.',
    exercises: [
      makeEx(
        'run-ef-warmup',
        'Échauffement progressif + gammes (talons-fesses, montées de genoux)',
        'running',
        1,
        900,
        1,
        0,
        120,
        'Footing souple aisé + 3 accélérations progressives de 15 sec.'
      ),
      makeEx(
        'run-vma-test-6min',
        'Test VMA Demi-Cooper 6 min (effort maximal régulier)',
        'running',
        1,
        360,
        1,
        0,
        300,
        'Mesurez précisément la distance (mètres) en 6 min : VMA = distance ÷ 100.'
      ),
      makeEx(
        'mob-cooldown',
        'Retour au calme + mobilité hanches & mollets',
        'mobility',
        1,
        480,
        1,
        0,
        0,
        'Trot très lent 8 min puis étirements légers.'
      ),
    ],
  };
}

function buildWorkoutForSlot(params: {
  distance: RunningDistanceKey;
  weekNumber: number;
  durationWeeks: number;
  slotIndex: number; // 0-based within week
  sessionsPerWeek: number;
  zones: RunningPaceZones | null;
}): {
  title: string;
  focusZone: ProgramFocusZone;
  focusLabel: string;
  durationMinutes: number;
  isVmaTest: boolean;
  isRaceDay: boolean;
  coachNotes: string;
  exercises: ScheduledExerciseItem[];
} {
  const { distance, weekNumber, durationWeeks, slotIndex, sessionsPerWeek, zones } = params;

  // RACE WEEK (Final Week, Last Session) = JOUR DE COURSE
  if (weekNumber === durationWeeks && slotIndex === sessionsPerWeek - 1) {
    const raceLabel = RUNNING_DISTANCE_TEMPLATES[distance].shortLabel;
    const paceStr = zones
      ? formatPaceMinPerKm(zones.targetRacePaceSecPerKm)
      : 'allure objectif';
    return {
      title: `Jour J · Course objectif ${raceLabel}`,
      focusZone: 'race_day',
      focusLabel: `Course ${raceLabel}`,
      durationMinutes:
        distance === '42km'
          ? 240
          : distance === '21km'
            ? 135
            : distance === '10km'
              ? 75
              : 55,
      isVmaTest: false,
      isRaceDay: true,
      coachNotes: `Semaine d’affûtage accomplie : partez prudemment au premier kilomètre puis calez-vous sur ${paceStr}.`,
      exercises: [
        makeEx(
          'mob-race-warmup',
          'Échauffement d’avant-course & activation',
          'mobility',
          1,
          600,
          1,
          0,
          180,
          '10 min footing léger + 3 lignes droites progressives.'
        ),
        makeEx(
          'run-race-goal',
          `Course officielle ${raceLabel} à allure cible`,
          'running',
          1,
          distance === '5km'
            ? 1500
            : distance === '10km'
              ? 3000
              : distance === '21km'
                ? 6900
                : 7200,
          1,
          0,
          0,
          `Allure cible : ${paceStr}. Gérez l’hydratation et la cadence.`
        ),
      ],
    };
  }

  // Final race week taper sessions (before race day)
  if (weekNumber === durationWeeks) {
    if (slotIndex === 0) {
      const pace = zones ? formatPaceMinPerKm(zones.efMinSecPerKm) : 'EF Z2';
      return {
        title: 'Affûtage · Footing souple & rappels d’allure',
        focusZone: 'race_pace',
        focusLabel: 'Affûtage & Jus',
        durationMinutes: 35,
        isVmaTest: false,
        isRaceDay: false,
        coachNotes:
          'Volume réduit de 50% pour arriver frais le jour J tout en gardant la tonicité neuromusculaire.',
        exercises: [
          makeEx(
            'run-ef-taper',
            'Footing d’endurance fondamentale',
            'running',
            1,
            1200,
            1,
            0,
            60,
            `Allure très confortable (${pace}).`
          ),
          makeEx(
            'run-strides-taper',
            'Lignes droites à allure spécifique',
            'running',
            4,
            30,
            1,
            60,
            0,
            zones
              ? `4 × 30 sec à ${formatPaceMinPerKm(zones.targetRacePaceSecPerKm)} sans fatigue.`
              : '4 × 30 sec fluides et relâchées.'
          ),
        ],
      };
    }
    return {
      title: 'Affûtage · Activation courte & mobilité',
      focusZone: 'ef',
      focusLabel: 'Activation pré-course',
      durationMinutes: 25,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes: 'Footing très léger la veille ou l’avant-veille pour délier les jambes.',
      exercises: [
        makeEx(
          'run-shakeout',
          'Footing de décrassage très souple',
          'running',
          1,
          900,
          1,
          0,
          60,
          zones
            ? `Rester plus lent que ${formatPaceMinPerKm(zones.efMinSecPerKm)}.`
            : 'Allure conversationnelle.'
        ),
        makeEx(
          'mob-hips-ankles',
          'Mobilité chevilles, hanches & étirements actifs',
          'mobility',
          10,
          45,
          2,
          15,
          60,
          'Zéro courbature avant la course.'
        ),
      ],
    };
  }

  // Assign session roles within a normal week (Weeks 1..durationWeeks-1)
  // Slot mapping depending on sessionsPerWeek (2..6)
  const { p1End, p2End } = getProgramPhaseBounds(durationWeeks);
  type Role = 'quality_vma' | 'race_or_threshold' | 'long_run' | 'ef_strength' | 'ef_recovery';
  let role: Role = 'ef_recovery';

  if (sessionsPerWeek === 2) {
    role = slotIndex === 0 ? (weekNumber % 2 === 1 ? 'quality_vma' : 'race_or_threshold') : 'long_run';
  } else if (sessionsPerWeek === 3) {
    if (slotIndex === 0) role = 'quality_vma';
    else if (slotIndex === 1) role = weekNumber > p1End ? 'race_or_threshold' : 'ef_strength';
    else role = 'long_run';
  } else if (sessionsPerWeek === 4) {
    if (slotIndex === 0) role = 'quality_vma';
    else if (slotIndex === 1) role = 'ef_strength';
    else if (slotIndex === 2) role = 'race_or_threshold';
    else role = 'long_run';
  } else if (sessionsPerWeek === 5) {
    if (slotIndex === 0) role = 'quality_vma';
    else if (slotIndex === 1) role = 'ef_recovery';
    else if (slotIndex === 2) role = 'race_or_threshold';
    else if (slotIndex === 3) role = 'ef_strength';
    else role = 'long_run';
  } else {
    // 6 sessions/week
    if (slotIndex === 0) role = 'quality_vma';
    else if (slotIndex === 1) role = 'ef_recovery';
    else if (slotIndex === 2) role = 'race_or_threshold';
    else if (slotIndex === 3) role = 'ef_strength';
    else if (slotIndex === 4) role = 'ef_recovery';
    else role = 'long_run';
  }

  const progressionIndex = Math.round(
    ((weekNumber - 1) / Math.max(1, durationWeeks - 2)) * 10
  ); // 0..10 scaled to program duration
  const isRecoveryWeek = weekNumber % 4 === 0 && weekNumber < durationWeeks - 1;

  if (role === 'quality_vma') {
    const isShortVma = distance === '5km' || weekNumber <= p1End + 1;
    const reps = isShortVma
      ? isRecoveryWeek
        ? 6
        : Math.min(12, 7 + Math.floor(progressionIndex / 2))
      : isRecoveryWeek
        ? 5
        : Math.min(8, 5 + Math.floor(progressionIndex / 3));
    const workSec = isShortVma ? 30 : 90;
    const pauseSec = isShortVma ? 30 : 60;
    const rounds = isShortVma ? 2 : 1;
    const paceLabel = zones
      ? formatPaceMinPerKm(
          isShortVma ? zones.vma100SecPerKm : zones.as5SecPerKm
        )
      : isShortVma
        ? '100% VMA'
        : '95% VMA';

    return {
      title: isShortVma
        ? `Fractionné VMA · ${rounds}×(${reps}×30"/30")`
        : `VMA longue · ${reps}×${workSec === 90 ? '400m / 1m30' : '2 min'}`,
      focusZone: isShortVma ? 'vma_short' : 'vma_long',
      focusLabel: isShortVma ? 'VMA courte 100%' : 'VMA longue 95%',
      durationMinutes: 50,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes: `Séance clé de vitesse aérobie. Allure cible du bloc : ${paceLabel}.`,
      exercises: [
        makeEx(
          'run-warmup-vma',
          'Échauffement Z2 + éducatifs de course',
          'running',
          1,
          900,
          1,
          0,
          120,
          zones
            ? `15 min EF (${formatPaceMinPerKm(zones.efMaxSecPerKm)}) + montées de genoux.`
            : '15 min footing souple + gammes.'
        ),
        makeEx(
          'run-vma-intervals',
          isShortVma
            ? 'Fractionné VMA 30/30 (efforts rapides / trot léger)'
            : 'Répétitions VMA soutenue',
          'running',
          reps,
          workSec,
          rounds,
          pauseSec,
          180,
          `Allure cible : ${paceLabel}. Régularité sur chaque répétition.`
        ),
        makeEx(
          'run-cooldown-vma',
          'Retour au calme en footing lent',
          'running',
          1,
          480,
          1,
          0,
          0,
          '8 min souples pour relancer la récupération.'
        ),
      ],
    };
  }

  if (role === 'race_or_threshold') {
    const isSpecificPhase = weekNumber >= p2End - 1;
    const specificPace = zones
      ? formatPaceMinPerKm(
          distance === '5km'
            ? zones.as5SecPerKm
            : distance === '10km'
              ? zones.as10SecPerKm
              : distance === '21km'
                ? zones.as21SecPerKm
                : zones.as42SecPerKm
        )
      : `Allure ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`;

    const blockSec =
      distance === '5km'
        ? 240
        : distance === '10km'
          ? 360
          : distance === '21km'
            ? 600
            : 900;
    const rounds = isRecoveryWeek ? 2 : isSpecificPhase ? 3 : 2;
    const titlePrefix = isSpecificPhase
      ? `Allure spécifique ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`
      : 'Seuil & Tempo contrôlé';

    return {
      title: `${titlePrefix} · ${rounds}×${Math.round(blockSec / 60)} min`,
      focusZone: isSpecificPhase ? 'race_pace' : 'threshold',
      focusLabel: isSpecificPhase
        ? `Allure ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`
        : 'Seuil 86% VMA',
      durationMinutes: distance === '42km' ? 75 : 60,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes: isSpecificPhase
        ? `Calage précis du rythme de course (${specificPace}).`
        : `Travail au seuil ventilatoire (${zones ? formatPaceMinPerKm(zones.seuilSecPerKm) : '86% VMA'}).`,
      exercises: [
        makeEx(
          'run-warmup-threshold',
          'Échauffement progressif en endurance',
          'running',
          1,
          900,
          1,
          0,
          90,
          zones
            ? `15 min à ${formatPaceMinPerKm(zones.efMaxSecPerKm)}.`
            : '15 min en aisance respiratoire.'
        ),
        makeEx(
          'run-specific-blocks',
          isSpecificPhase
            ? `Blocs à allure ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`
            : 'Blocs continus au seuil',
          'running',
          1,
          blockSec,
          rounds,
          0,
          120,
          isSpecificPhase
            ? `Maintenir ${specificPace} avec relâchement du haut du corps.`
            : `Maintenir ${zones ? formatPaceMinPerKm(zones.seuilSecPerKm) : '86% VMA'}.`
        ),
        makeEx(
          'run-cooldown-threshold',
          'Retour au calme EF',
          'running',
          1,
          480,
          1,
          0,
          0,
          '8 min très souples.'
        ),
      ],
    };
  }

  if (role === 'ef_strength') {
    return {
      title: 'Footing EF + Renforcement spécifique runner',
      focusZone: 'strength_hills',
      focusLabel: 'Endurance & PPG',
      durationMinutes: 50,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes:
        'Améliore l’économie de foulée et protège genoux, hanches et tendons d’Achille.',
      exercises: [
        makeEx(
          'run-ef-pre-ppg',
          'Footing souple en endurance fondamentale',
          'running',
          1,
          1500,
          1,
          0,
          90,
          zones
            ? `Zone EF : ${formatPaceMinPerKm(zones.efMinSecPerKm)} – ${formatPaceMinPerKm(zones.efMaxSecPerKm)}.`
            : 'Allure confortable (parler facilement).'
        ),
        makeEx(
          'str-fentes-runner',
          'Fentes marchées & montées de genou dynamiques',
          'strength',
          12,
          0,
          3,
          20,
          60,
          '12 reps par jambe, buste droit.'
        ),
        makeEx(
          'str-gainage-core',
          'Gainage planche + pont fessier unipodal',
          'strength',
          1,
          45,
          3,
          15,
          45,
          'Stabilité du bassin pour une foulée efficace.'
        ),
        makeEx(
          'str-mollets-plyo',
          'Élévations mollets excentriques sur marche',
          'strength',
          15,
          0,
          3,
          15,
          45,
          'Descente lente en 3 sec pour prévenir les tendinites.'
        ),
      ],
    };
  }

  if (role === 'long_run') {
    const baseMinutes =
      distance === '5km'
        ? 45
        : distance === '10km'
          ? 60
          : distance === '21km'
            ? 75
            : 95;
    const maxAdded = distance === '42km' ? 75 : distance === '21km' ? 35 : 20;
    const addedMinutes = isRecoveryWeek
      ? 0
      : Math.min(
          maxAdded,
          Math.round((weekNumber / Math.max(1, durationWeeks - 1)) * maxAdded)
        );
    const totalMin = baseMinutes + addedMinutes;
    const finishSpecificMin =
      weekNumber >= Math.ceil(durationWeeks / 2)
        ? Math.min(25, 10 + Math.round((weekNumber / durationWeeks) * 12))
        : 0;
    const efMin = totalMin - finishSpecificMin;

    return {
      title: `Sortie longue · ${totalMin} min${finishSpecificMin > 0 ? ' (fin progressive)' : ''}`,
      focusZone: 'long_run',
      focusLabel: 'Sortie longue',
      durationMinutes: totalMin,
      isVmaTest: false,
      isRaceDay: false,
      coachNotes:
        'Pilier de l’endurance aérobie : partez sans excès de vitesse en EF Z2.',
      exercises: [
        makeEx(
          'run-long-ef',
          'Bloc principal en Endurance Fondamentale (Z2)',
          'running',
          1,
          efMin * 60,
          1,
          0,
          0,
          zones
            ? `Rester entre ${formatPaceMinPerKm(zones.efMinSecPerKm)} et ${formatPaceMinPerKm(zones.efMaxSecPerKm)}.`
            : 'Allure douce, respiration nasale/aisée.'
        ),
        ...(finishSpecificMin > 0
          ? [
              makeEx(
                'run-long-finish',
                `Final progressif à allure ${RUNNING_DISTANCE_TEMPLATES[distance].shortLabel}`,
                'running',
                1,
                finishSpecificMin * 60,
                1,
                0,
                0,
                zones
                  ? `Accélération contrôlée vers ${formatPaceMinPerKm(
                      distance === '42km'
                        ? zones.as42SecPerKm
                        : distance === '21km'
                          ? zones.as21SecPerKm
                          : zones.seuilSecPerKm
                    )}.`
                  : 'Terminez avec un rythme dynamique sans sprint.'
              ),
            ]
          : []),
      ],
    };
  }

  // ef_recovery
  return {
    title: 'Footing d’assimilation en Endurance Fondamentale',
    focusZone: 'ef',
    focusLabel: 'Endurance Z2',
    durationMinutes: 40,
    isVmaTest: false,
    isRaceDay: false,
    coachNotes: 'Séance d’assimilation pure pour développer la capillarisation sans fatigue.',
    exercises: [
      makeEx(
        'run-ef-recovery',
        'Footing continu facile en Z2',
        'running',
        1,
        2100,
        1,
        0,
        0,
        zones
          ? `Allure stricte : ${formatPaceMinPerKm(zones.efMinSecPerKm)} – ${formatPaceMinPerKm(zones.efMaxSecPerKm)}.`
          : 'Allure très facile.'
      ),
      makeEx(
        'mob-recovery',
        'Mobilité douce & relâchement',
        'mobility',
        8,
        30,
        2,
        15,
        30,
        'Respiration profonde.'
      ),
    ],
  };
}

export function generateRunningProgramSessions(
  program: TrainingProgram,
  nowMs: number = Date.now()
): GeneratedProgramSession[] {
  const durationWeeks = Math.min(
    VALIDATION_LIMITS.PROGRAM_DURATION_WEEKS_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_DURATION_WEEKS_MIN,
      Math.round(
        program.durationWeeks ||
          getProgramDurationWeeks(program.distance, program.level ?? 'regular')
      )
    )
  );
  const sessionsPerWeek = Math.min(
    VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN,
      program.sessionsPerWeek || VALIDATION_LIMITS.PROGRAM_DEFAULT_SESSIONS_PER_WEEK
    )
  );
  const programAnchor = resolveProgramStartAnchor(program, nowMs);
  const weekDates = computeWeekDates(
    programAnchor,
    sessionsPerWeek,
    program.preferredDays || getDefaultPreferredDays(sessionsPerWeek),
    durationWeeks
  );

  const zones =
    program.vmaTestStatus === 'completed' && program.vmaKmh >= VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH
      ? computeVmaPaceZones(
          program.vmaKmh,
          program.distance,
          program.targetTimeSeconds
        )
      : null;

  const completedSet = new Set(program.completedSessionKeys || []);
  const overrideMap = new Map<string, ProgramSessionOverride>();
  if (Array.isArray(program.sessionOverrides)) {
    for (const ov of program.sessionOverrides) {
      if (ov && typeof ov.sessionKey === 'string' && ov.sessionKey.trim()) {
        overrideMap.set(ov.sessionKey.trim(), ov);
      }
    }
  }
  const sessions: GeneratedProgramSession[] = [];

  // Standalone preliminary VMA test session (can be done on ANY day before the program starts)
  const vmaWorkout = buildVmaTestWorkout();
  const vmaPaceInfo = paceInfoForZone(
    'vma_test',
    program.distance,
    zones,
    durationWeeks
  );
  const vmaDefaultDate =
    program.vmaTestStatus === 'completed' && program.vmaTestedAt?.toDate
      ? program.vmaTestedAt.toDate()
      : addDaysAtHour(toStartOfDay(new Date(nowMs)), 0, 9, 0);

  sessions.push({
    key: 'vma-test',
    programId: program.id,
    weekNumber: 0,
    sessionIndexInWeek: 0,
    phaseLabel: 'Séance préalable · Test VMA (Effectuable n’importe quel jour)',
    scheduledDate: vmaDefaultDate,
    durationMinutes: vmaWorkout.durationMinutes,
    title: vmaWorkout.title,
    discipline: 'Course à pied',
    focusZone: vmaWorkout.focusZone,
    focusLabel: vmaWorkout.focusLabel,
    isVmaTest: true,
    isRaceDay: false,
    targetPaceLabel: vmaPaceInfo.label,
    targetPaceRangeLabel: vmaPaceInfo.range,
    coachNotes: vmaWorkout.coachNotes,
    exercises: vmaWorkout.exercises,
    completed: program.vmaTestStatus === 'completed',
  });

  for (let w = 0; w < durationWeeks; w += 1) {
    const weekNumber = w + 1;
    const dates = weekDates[w];
    const phaseLabel = getPhaseForWeek(program.distance, weekNumber, durationWeeks);

    for (let s = 0; s < dates.length; s += 1) {
      const key = `w${weekNumber}-s${s + 1}`;
      const workout = buildWorkoutForSlot({
        distance: program.distance,
        weekNumber,
        durationWeeks,
        slotIndex: s,
        sessionsPerWeek: dates.length,
        zones,
      });
      const paceInfo = paceInfoForZone(
        workout.focusZone,
        program.distance,
        zones,
        durationWeeks
      );
      const override = overrideMap.get(key);

      sessions.push({
        key,
        programId: program.id,
        weekNumber,
        sessionIndexInWeek: s + 1,
        phaseLabel,
        scheduledDate: dates[s],
        durationMinutes:
          override &&
          typeof override.durationMinutes === 'number' &&
          override.durationMinutes >= VALIDATION_LIMITS.DURATION_MIN &&
          override.durationMinutes <= VALIDATION_LIMITS.DURATION_MAX
            ? override.durationMinutes
            : workout.durationMinutes,
        title:
          override && override.title?.trim()
            ? override.title.trim()
            : workout.title,
        discipline: 'Course à pied',
        focusZone: workout.focusZone,
        focusLabel: workout.focusLabel,
        isVmaTest: workout.isVmaTest,
        isRaceDay: workout.isRaceDay,
        targetPaceLabel: paceInfo.label,
        targetPaceRangeLabel: paceInfo.range,
        coachNotes:
          override && typeof override.coachNotes === 'string'
            ? override.coachNotes
            : workout.coachNotes,
        exercises: override
          ? (override.exercises || []).map((ex) => ({ ...ex }))
          : workout.exercises,
        completed: completedSet.has(key),
        isCustomized: Boolean(override),
      });
    }
  }

  return sessions;
}

export const DEFAULT_AUTO_SEND_DAY = 7; // Dimanche (1=Lun..7=Dim)
export const DEFAULT_AUTO_SEND_TIME = '18:00';

const AUTO_SEND_DAY_FULL_NAMES: Record<number, string> = {
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
  7: 'dimanche',
};

const AUTO_SEND_DAY_SHORT_NAMES: Record<number, string> = {
  1: 'lun.',
  2: 'mar.',
  3: 'mer.',
  4: 'jeu.',
  5: 'ven.',
  6: 'sam.',
  7: 'dim.',
};

export const AUTO_SEND_WEEKDAY_OPTIONS: { day: number; label: string }[] = [
  { day: 7, label: 'Dimanche (par défaut)' },
  { day: 1, label: 'Lundi' },
  { day: 2, label: 'Mardi' },
  { day: 3, label: 'Mercredi' },
  { day: 4, label: 'Jeudi' },
  { day: 5, label: 'Vendredi' },
  { day: 6, label: 'Samedi' },
];

export function normalizeAutoSendDay(day?: number | null): number {
  if (typeof day === 'number' && Number.isFinite(day)) {
    const rounded = Math.round(day);
    if (rounded >= 1 && rounded <= 7) return rounded;
  }
  return DEFAULT_AUTO_SEND_DAY;
}

export function parseAutoSendTime(timeStr?: string | null): {
  hour: number;
  minute: number;
  normalized: string;
  frenchLabel: string;
} {
  const match = (timeStr ?? '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (
      Number.isInteger(h) &&
      Number.isInteger(m) &&
      h >= 0 &&
      h <= 23 &&
      m >= 0 &&
      m <= 59
    ) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      return {
        hour: h,
        minute: m,
        normalized: `${hh}:${mm}`,
        frenchLabel: `${hh}h${mm}`,
      };
    }
  }
  return {
    hour: 18,
    minute: 0,
    normalized: DEFAULT_AUTO_SEND_TIME,
    frenchLabel: '18h00',
  };
}

export function formatAutoSendLabel(
  day?: number | null,
  timeStr?: string | null,
  short = false
): string {
  const safeDay = normalizeAutoSendDay(day);
  const parsedTime = parseAutoSendTime(timeStr);
  if (short) {
    return `${AUTO_SEND_DAY_SHORT_NAMES[safeDay] ?? 'dim.'} ${parsedTime.frenchLabel}`;
  }
  return `${AUTO_SEND_DAY_FULL_NAMES[safeDay] ?? 'dimanche'} à ${parsedTime.frenchLabel}`;
}

export function getProgramAutoSendConfig(
  program?: Pick<TrainingProgram, 'autoSendDay' | 'autoSendTime'> | null
): {
  day: number;
  time: string;
  hour: number;
  minute: number;
  frenchTime: string;
  label: string;
  shortLabel: string;
} {
  const day = normalizeAutoSendDay(program?.autoSendDay);
  const parsed = parseAutoSendTime(program?.autoSendTime);
  return {
    day,
    time: parsed.normalized,
    hour: parsed.hour,
    minute: parsed.minute,
    frenchTime: parsed.frenchLabel,
    label: formatAutoSendLabel(day, parsed.normalized, false),
    shortLabel: formatAutoSendLabel(day, parsed.normalized, true),
  };
}

function getSendDateBeforeDate(
  date: Date,
  targetIsoDay: number,
  hour: number,
  minute: number
): Date {
  const startOfDay = toStartOfDay(date);
  const isoDay = toIsoWeekday(startOfDay); // 1=Mon..7=Sun
  const delta = (isoDay - targetIsoDay + 7) % 7;
  const candidate = addDaysAtHour(startOfDay, -delta, hour, minute);
  if (candidate.getTime() > date.getTime()) {
    return addDaysAtHour(startOfDay, -(delta || 7), hour, minute);
  }
  return candidate;
}

function getNextSendDateAfter(
  ms: number,
  targetIsoDay: number,
  hour: number,
  minute: number
): Date {
  const ref = new Date(ms);
  const refDayStart = toStartOfDay(ref);
  const targetJsDay = targetIsoDay % 7; // 0=Sun..6=Sat
  const daysUntil = (targetJsDay - ref.getDay() + 7) % 7;
  const candidate = addDaysAtHour(refDayStart, daysUntil, hour, minute);
  if (candidate.getTime() <= ms) {
    return addDaysAtHour(refDayStart, daysUntil + 7, hour, minute);
  }
  return candidate;
}

export interface ProgramWeekWindow {
  weekNumber: number; // 1..durationWeeks
  startAtMs: number;
  endAtMs: number;
  unlockAtMs: number;
  unlocked: boolean;
  firstSessionDate: Date;
  lastSessionDate: Date;
}

export interface ProgramDeliveryProgress {
  isPaid: boolean;
  isFree: boolean;
  hasAccess: boolean;
  awaitingVma: boolean;
  autoSendDay: number;
  autoSendTime: string;
  autoSendLabel: string;
  autoSendShortLabel: string;
  totalWeeks: number;
  unlockedWeeks: number;
  currentWeekNumber: number;
  nextWeekNumber: number | null;
  nextUnlockAtMs: number | null;
  allWeeksReleased: boolean;
  weeks: ProgramWeekWindow[];
}

export function getProgramDeliveryProgress(
  program: TrainingProgram,
  nowMs: number = Date.now()
): ProgramDeliveryProgress {
  const autoSend = getProgramAutoSendConfig(program);
  const totalWeeks = Math.min(
    VALIDATION_LIMITS.PROGRAM_DURATION_WEEKS_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_DURATION_WEEKS_MIN,
      Math.round(
        program.durationWeeks ||
          getProgramDurationWeeks(program.distance, program.level ?? 'regular')
      )
    )
  );
  const sessionsPerWeek = Math.min(
    VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN,
      program.sessionsPerWeek || VALIDATION_LIMITS.PROGRAM_DEFAULT_SESSIONS_PER_WEEK
    )
  );
  const programAnchor = resolveProgramStartAnchor(program, nowMs);
  const weekDates = computeWeekDates(
    programAnchor,
    sessionsPerWeek,
    program.preferredDays || getDefaultPreferredDays(sessionsPerWeek),
    totalWeeks
  );

  const isFree = !program.isPaid || program.paymentStatus === 'free';
  const isPaid = Boolean(program.isPaid) && program.paymentStatus === 'paid';
  const hasAccess = isFree || isPaid;
  const vmaCompleted = program.vmaTestStatus === 'completed';
  const awaitingVma = !vmaCompleted;
  const paidMs = isFree
    ? programAnchor.getTime()
    : (program.paidAt?.toMillis?.() ?? programAnchor.getTime());
  const vmaDoneMs =
    program.vmaTestedAt?.toMillis?.() ??
    program.updatedAt?.toMillis?.() ??
    paidMs;
  const week1ReleaseMs = Math.max(paidMs, vmaDoneMs);

  let week2SendDate: Date | null = null;
  if (vmaCompleted && totalWeeks >= 2 && weekDates[1]?.[0]) {
    const firstSendAfterVma = getNextSendDateAfter(
      week1ReleaseMs,
      autoSend.day,
      autoSend.hour,
      autoSend.minute
    );
    const sendBeforeWeek2 = getSendDateBeforeDate(
      weekDates[1][0],
      autoSend.day,
      autoSend.hour,
      autoSend.minute
    );
    week2SendDate =
      sendBeforeWeek2.getTime() > firstSendAfterVma.getTime()
        ? sendBeforeWeek2
        : firstSendAfterVma;
  }

  const weeks: ProgramWeekWindow[] = [];

  for (let w = 1; w <= totalWeeks; w += 1) {
    const idx = w - 1;
    const dates = weekDates[idx];
    const firstSessionDate = dates[0];
    const lastSessionDate = dates[dates.length - 1];

    const startAtMs = toStartOfDay(firstSessionDate).getTime();
    const endAtMs = new Date(
      lastSessionDate.getFullYear(),
      lastSessionDate.getMonth(),
      lastSessionDate.getDate(),
      23,
      59,
      59,
      999
    ).getTime();

    const unlockAtMs = !vmaCompleted
      ? startAtMs
      : w === 1
        ? week1ReleaseMs
        : week2SendDate
          ? addDaysAtHour(
              week2SendDate,
              (w - 2) * 7,
              autoSend.hour,
              autoSend.minute
            ).getTime()
          : startAtMs;

    const unlocked =
      hasAccess && vmaCompleted && (w === 1 || nowMs >= unlockAtMs);

    weeks.push({
      weekNumber: w,
      startAtMs,
      endAtMs,
      unlockAtMs,
      unlocked,
      firstSessionDate,
      lastSessionDate,
    });
  }

  const unlockedWeeks =
    hasAccess && vmaCompleted ? weeks.filter((wk) => wk.unlocked).length : 0;
  const allWeeksReleased =
    hasAccess && vmaCompleted && unlockedWeeks >= totalWeeks;
  const nextLocked =
    hasAccess && vmaCompleted ? weeks.find((wk) => !wk.unlocked) ?? null : null;

  return {
    isPaid,
    isFree,
    hasAccess,
    awaitingVma,
    autoSendDay: autoSend.day,
    autoSendTime: autoSend.time,
    autoSendLabel: autoSend.label,
    autoSendShortLabel: autoSend.shortLabel,
    totalWeeks,
    unlockedWeeks,
    currentWeekNumber: unlockedWeeks,
    nextWeekNumber: !hasAccess || awaitingVma ? 1 : nextLocked ? nextLocked.weekNumber : null,
    nextUnlockAtMs:
      hasAccess && vmaCompleted && nextLocked ? nextLocked.unlockAtMs : null,
    allWeeksReleased,
    weeks,
  };
}

