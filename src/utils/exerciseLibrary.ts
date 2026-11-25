import {
  ExerciseCategory,
  ExerciseParams,
  ScheduledExerciseItem,
  VALIDATION_LIMITS,
} from '../types';

export interface StarterExerciseTemplate {
  presetId: string;
  name: string;
  category: ExerciseCategory;
  targetObjectives: string[];
  description: string;
  defaultParams: ExerciseParams;
  intensityHint?: string;
}

export const EXERCISE_OBJECTIVE_OPTIONS: string[] = [
  'Force & Tonus',
  'Perte de poids',
  'Endurance running',
  'Vitesse & VMA',
  'Gainage & Posture',
  'Prévention blessures',
  'Remise en forme',
  'Explosivité',
];

export function getExerciseCategoryMeta(category: ExerciseCategory): {
  label: string;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (category) {
    case 'strength':
      return {
        label: 'Renforcement musculaire',
        shortLabel: 'Renforcement',
        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-300',
        dotClass: 'bg-amber-500',
      };
    case 'running':
      return {
        label: 'Running spécifique',
        shortLabel: 'Running',
        badgeClass:
          'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/80 dark:bg-sky-950/50 dark:text-sky-300',
        dotClass: 'bg-sky-500',
      };
    case 'mobility':
      return {
        label: 'Mobilité & Prévention',
        shortLabel: 'Mobilité',
        badgeClass:
          'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800/80 dark:bg-violet-950/50 dark:text-violet-300',
        dotClass: 'bg-violet-500',
      };
  }
}

export const STARTER_EXERCISES: StarterExerciseTemplate[] = [
  // --- RENFORCEMENT MUSCULAIRE ---
  {
    presetId: 'preset-squats-gobelet',
    name: 'Squats gobelet',
    category: 'strength',
    targetObjectives: ['Force & Tonus', 'Perte de poids', 'Explosivité'],
    description:
      'Pieds largeur épaules, buste droit, descente contrôlée jusqu’à la parallèle puis poussée dynamique sur les talons.',
    defaultParams: {
      repetitions: 12,
      durationSeconds: 0,
      setsOrRounds: 4,
      intraSetPauseSeconds: 0,
      restBetweenRoundsSeconds: 75,
    },
    intensityHint: 'Charge modérée · Tempo 3-1-1',
  },
  {
    presetId: 'preset-fentes-marchees',
    name: 'Fentes alternées dynamiques',
    category: 'strength',
    targetObjectives: [
      'Force & Tonus',
      'Endurance running',
      'Prévention blessures',
    ],
    description:
      'Grand pas vers l’avant ou en marchant, genou arrière proche du sol, stabilité du bassin sur toute la répétition.',
    defaultParams: {
      repetitions: 16,
      durationSeconds: 0,
      setsOrRounds: 3,
      intraSetPauseSeconds: 10,
      restBetweenRoundsSeconds: 60,
    },
    intensityHint: 'Poids de corps ou haltères légers',
  },
  {
    presetId: 'preset-pompes-controlees',
    name: 'Pompes classiques ou inclinées',
    category: 'strength',
    targetObjectives: ['Force & Tonus', 'Remise en forme', 'Gainage & Posture'],
    description:
      'Corps aligné des chevilles aux épaules, coudes à 45°, poitrine frôlant le sol ou le support incliné.',
    defaultParams: {
      repetitions: 12,
      durationSeconds: 0,
      setsOrRounds: 4,
      intraSetPauseSeconds: 0,
      restBetweenRoundsSeconds: 60,
    },
    intensityHint: '2 rép en réserve',
  },
  {
    presetId: 'preset-gainage-planche',
    name: 'Gainage planche frontale',
    category: 'strength',
    targetObjectives: [
      'Gainage & Posture',
      'Prévention blessures',
      'Remise en forme',
    ],
    description:
      'Appui sur avant-bras, bassin neutre, fessiers et sangle abdominale engagés sans creuser le bas du dos.',
    defaultParams: {
      repetitions: 0,
      durationSeconds: 45,
      setsOrRounds: 4,
      intraSetPauseSeconds: 0,
      restBetweenRoundsSeconds: 45,
    },
    intensityHint: 'Respiration fluide continue',
  },
  {
    presetId: 'preset-gainage-lateral',
    name: 'Gainage latéral (droite / gauche)',
    category: 'strength',
    targetObjectives: ['Gainage & Posture', 'Prévention blessures'],
    description:
      'Alignement strict épaule-bassin-cheville, maintien actif du moyen fessier indispensable pour la foulée.',
    defaultParams: {
      repetitions: 0,
      durationSeconds: 35,
      setsOrRounds: 3,
      intraSetPauseSeconds: 10,
      restBetweenRoundsSeconds: 45,
    },
    intensityHint: '35 s par côté',
  },
  {
    presetId: 'preset-pont-fessier-unilateral',
    name: 'Pont fessier unilatéral (Hip Thrust)',
    category: 'strength',
    targetObjectives: [
      'Force & Tonus',
      'Endurance running',
      'Prévention blessures',
    ],
    description:
      'Poussée sur un talon, extension complète de la hanche avec maintien 1 seconde en haut pour renforcer la chaîne postérieure.',
    defaultParams: {
      repetitions: 12,
      durationSeconds: 0,
      setsOrRounds: 3,
      intraSetPauseSeconds: 10,
      restBetweenRoundsSeconds: 60,
    },
    intensityHint: '12 rép par jambe',
  },
  {
    presetId: 'preset-rowing-elastique',
    name: 'Rowing haltères ou élastique',
    category: 'strength',
    targetObjectives: ['Force & Tonus', 'Gainage & Posture', 'Remise en forme'],
    description:
      'Dos plat incliné à 45°, tirage vers les hanches en resserrant les omoplates pour ouvrir la cage thoracique.',
    defaultParams: {
      repetitions: 12,
      durationSeconds: 0,
      setsOrRounds: 4,
      intraSetPauseSeconds: 0,
      restBetweenRoundsSeconds: 60,
    },
    intensityHint: 'Contrôle excentrique 2 s',
  },
  {
    presetId: 'preset-souleve-terre-roumain',
    name: 'Soulevé de terre roumain',
    category: 'strength',
    targetObjectives: ['Force & Tonus', 'Prévention blessures', 'Explosivité'],
    description:
      'Charnière de hanche avec genoux légèrement fléchis, étirement contrôlé des ischio-jambiers puis retour puissant.',
    defaultParams: {
      repetitions: 10,
      durationSeconds: 0,
      setsOrRounds: 4,
      intraSetPauseSeconds: 0,
      restBetweenRoundsSeconds: 75,
    },
    intensityHint: 'Dos neutre permanent',
  },
  {
    presetId: 'preset-chaise-isometrique',
    name: 'Chaise isométrique murale',
    category: 'strength',
    targetObjectives: ['Force & Tonus', 'Perte de poids', 'Endurance running'],
    description:
      'Dos plaqué au mur, cuisses parallèles au sol, maintien isométrique pour l’endurance des quadriceps.',
    defaultParams: {
      repetitions: 0,
      durationSeconds: 45,
      setsOrRounds: 3,
      intraSetPauseSeconds: 0,
      restBetweenRoundsSeconds: 60,
    },
    intensityHint: 'Angle genou 90°',
  },

  // --- RUNNING SPECIFIQUE ---
  {
    presetId: 'preset-vma-30-30',
    name: 'Fractionné VMA 30/30',
    category: 'running',
    targetObjectives: ['Vitesse & VMA', 'Perte de poids', 'Endurance running'],
    description:
      'Blocs de 30 s d’effort soutenu à 100 % VMA suivis de 30 s de récupération active en trot léger.',
    defaultParams: {
      repetitions: 10,
      durationSeconds: 30,
      setsOrRounds: 2,
      intraSetPauseSeconds: 30,
      restBetweenRoundsSeconds: 180,
    },
    intensityHint: '95–105 % VMA · 2 blocs de 10',
  },
  {
    presetId: 'preset-gammes-montees-genoux',
    name: 'Gammes : Montées de genoux',
    category: 'running',
    targetObjectives: ['Vitesse & VMA', 'Explosivité', 'Prévention blessures'],
    description:
      'Travail de fréquence et d’attaque médio-pied, genoux montés à hauteur de hanche, bras actifs à 90°.',
    defaultParams: {
      repetitions: 0,
      durationSeconds: 25,
      setsOrRounds: 4,
      intraSetPauseSeconds: 20,
      restBetweenRoundsSeconds: 60,
    },
    intensityHint: 'Appuis courts et dynamiques',
  },
  {
    presetId: 'preset-gammes-talons-fesses',
    name: 'Gammes : Talons-fesses dynamiques',
    category: 'running',
    targetObjectives: ['Vitesse & VMA', 'Prévention blessures'],
    description:
      'Cycle arrière rapide sans projeter les genoux vers l’arrière, buste légèrement incliné vers l’avant.',
    defaultParams: {
      repetitions: 0,
      durationSeconds: 25,
      setsOrRounds: 4,
      intraSetPauseSeconds: 20,
      restBetweenRoundsSeconds: 60,
    },
    intensityHint: 'Cadence élevée',
  },
  {
    presetId: 'preset-foulees-bondissantes',
    name: 'Foulées bondissantes (Skipping)',
    category: 'running',
    targetObjectives: ['Explosivité', 'Vitesse & VMA', 'Force & Tonus'],
    description:
      'Projection vers l’avant et le haut avec extension complète de la cheville et du genou arrière.',
    defaultParams: {
      repetitions: 10,
      durationSeconds: 20,
      setsOrRounds: 4,
      intraSetPauseSeconds: 30,
      restBetweenRoundsSeconds: 90,
    },
    intensityHint: '10 bonds amples par série',
  },
  {
    presetId: 'preset-cotes-courtes',
    name: 'Sprint en côte courte (15 s)',
    category: 'running',
    targetObjectives: ['Explosivité', 'Vitesse & VMA', 'Force & Tonus'],
    description:
      'Montée dynamique sur pente de 6 à 8 % pour développer la puissance musculaire de poussée et l’économie de course.',
    defaultParams: {
      repetitions: 6,
      durationSeconds: 15,
      setsOrRounds: 2,
      intraSetPauseSeconds: 45,
      restBetweenRoundsSeconds: 180,
    },
    intensityHint: 'Retour en marchant / trot très lent',
  },
  {
    presetId: 'preset-allure-seuil',
    name: 'Travail d’allure seuil (Tempo)',
    category: 'running',
    targetObjectives: ['Endurance running', 'Vitesse & VMA'],
    description:
      'Maintien d’une allure soutenue mais contrôlée (82–88 % FCM / allure semi-marathon) avec régularité.',
    defaultParams: {
      repetitions: 0,
      durationSeconds: 480,
      setsOrRounds: 3,
      intraSetPauseSeconds: 0,
      restBetweenRoundsSeconds: 120,
    },
    intensityHint: '3 × 8 min au seuil · Récup 2 min',
  },
  {
    presetId: 'preset-footing-z2',
    name: 'Footing endurance fondamentale (Z2)',
    category: 'running',
    targetObjectives: ['Endurance running', 'Perte de poids', 'Remise en forme'],
    description:
      'Course continue à aisance respiratoire (capacité à tenir une conversation) pour développer la filière aérobie.',
    defaultParams: {
      repetitions: 0,
      durationSeconds: 1800,
      setsOrRounds: 1,
      intraSetPauseSeconds: 0,
      restBetweenRoundsSeconds: 0,
    },
    intensityHint: '65–75 % FCM · Zone 2',
  },

  // --- MOBILITE & PREVENTION ---
  {
    presetId: 'preset-proprioception-cheville',
    name: 'Proprioception cheville unipodale',
    category: 'mobility',
    targetObjectives: ['Prévention blessures', 'Endurance running'],
    description:
      'Équilibre sur un pied (genou déverrouillé), maintien de la voûte plantaire, progression possible yeux fermés.',
    defaultParams: {
      repetitions: 0,
      durationSeconds: 40,
      setsOrRounds: 3,
      intraSetPauseSeconds: 15,
      restBetweenRoundsSeconds: 45,
    },
    intensityHint: '40 s par pied',
  },
  {
    presetId: 'preset-mobilite-hanches',
    name: 'Mobilité hanches & psoas actif',
    category: 'mobility',
    targetObjectives: [
      'Prévention blessures',
      'Gainage & Posture',
      'Remise en forme',
    ],
    description:
      'Transitions contrôlées en fente basse et rotations thoraciques pour libérer l’extension de hanche.',
    defaultParams: {
      repetitions: 10,
      durationSeconds: 30,
      setsOrRounds: 2,
      intraSetPauseSeconds: 10,
      restBetweenRoundsSeconds: 30,
    },
    intensityHint: 'Amplitude progressive sans à-coups',
  },
];

export function formatSecondsCompact(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe === 0) return '0 s';
  if (safe < 60) return `${safe} s`;
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem === 0 ? `${mins} min` : `${mins} min ${rem} s`;
}

export function formatExerciseParamsSummary(params: {
  repetitions: number;
  durationSeconds: number;
  setsOrRounds: number;
  intraSetPauseSeconds: number;
  restBetweenRoundsSeconds: number;
}): string {
  const parts: string[] = [];
  parts.push(`${params.setsOrRounds} tour${params.setsOrRounds > 1 ? 's' : ''}`);
  if (params.repetitions > 0 && params.durationSeconds > 0) {
    parts.push(`${params.repetitions} × ${formatSecondsCompact(params.durationSeconds)}`);
  } else if (params.repetitions > 0) {
    parts.push(`${params.repetitions} rép.`);
  } else if (params.durationSeconds > 0) {
    parts.push(formatSecondsCompact(params.durationSeconds));
  }
  if (params.intraSetPauseSeconds > 0) {
    parts.push(`Pause ${formatSecondsCompact(params.intraSetPauseSeconds)}`);
  }
  if (params.restBetweenRoundsSeconds > 0) {
    parts.push(`Repos ${formatSecondsCompact(params.restBetweenRoundsSeconds)}`);
  }
  return parts.join(' · ');
}

export function estimateSingleExerciseSeconds(item: {
  repetitions: number;
  durationSeconds: number;
  setsOrRounds: number;
  intraSetPauseSeconds: number;
  restBetweenRoundsSeconds: number;
}): number {
  const rounds = Math.max(1, item.setsOrRounds);
  const workPerRound =
    item.durationSeconds > 0
      ? item.repetitions > 0 && item.durationSeconds <= 120
        ? item.repetitions * item.durationSeconds
        : item.durationSeconds
      : Math.max(20, item.repetitions * 3);
  const intraPausePerRound =
    item.intraSetPauseSeconds > 0 && item.repetitions > 1
      ? item.intraSetPauseSeconds * Math.max(1, item.repetitions - 1)
      : item.intraSetPauseSeconds;
  const totalWorkAndPause = (workPerRound + intraPausePerRound) * rounds;
  const totalRest = Math.max(0, rounds - 1) * item.restBetweenRoundsSeconds;
  return totalWorkAndPause + totalRest;
}

export function estimateSessionExercisesMinutes(
  items: ScheduledExerciseItem[]
): number {
  if (items.length === 0) return 45;
  const totalSec = items.reduce(
    (sum, item) => sum + estimateSingleExerciseSeconds(item),
    0
  );
  // Add ~60s transition between exercises
  const withTransitions = totalSec + Math.max(0, items.length - 1) * 60;
  const rawMinutes = Math.max(
    VALIDATION_LIMITS.DURATION_MIN,
    Math.ceil(withTransitions / 60)
  );
  return Math.min(VALIDATION_LIMITS.DURATION_MAX, rawMinutes);
}

export function clampExerciseParams(raw: Partial<ExerciseParams>): ExerciseParams {
  const toInt = (val: unknown, fallback: number, min: number, max: number) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    repetitions: toInt(
      raw.repetitions,
      10,
      VALIDATION_LIMITS.EXERCISE_REPS_MIN,
      VALIDATION_LIMITS.EXERCISE_REPS_MAX
    ),
    durationSeconds: toInt(
      raw.durationSeconds,
      0,
      VALIDATION_LIMITS.EXERCISE_DURATION_MIN,
      VALIDATION_LIMITS.EXERCISE_DURATION_MAX
    ),
    setsOrRounds: toInt(
      raw.setsOrRounds,
      3,
      VALIDATION_LIMITS.EXERCISE_ROUNDS_MIN,
      VALIDATION_LIMITS.EXERCISE_ROUNDS_MAX
    ),
    intraSetPauseSeconds: toInt(
      raw.intraSetPauseSeconds,
      0,
      VALIDATION_LIMITS.EXERCISE_PAUSE_MIN,
      VALIDATION_LIMITS.EXERCISE_PAUSE_MAX
    ),
    restBetweenRoundsSeconds: toInt(
      raw.restBetweenRoundsSeconds,
      60,
      VALIDATION_LIMITS.EXERCISE_REST_MIN,
      VALIDATION_LIMITS.EXERCISE_REST_MAX
    ),
  };
}

export function doesExerciseMatchGoal(
  exercise: {
    targetObjectives: string[];
    category: ExerciseCategory;
    name: string;
    description?: string;
  },
  goalText: string
): boolean {
  const g = goalText.trim().toLowerCase();
  if (!g) return false;

  const haystack = [
    exercise.name,
    exercise.description ?? '',
    ...exercise.targetObjectives,
  ]
    .join(' ')
    .toLowerCase();

  // Direct objective match
  if (
    exercise.targetObjectives.some(
      (obj) =>
        g.includes(obj.toLowerCase()) || obj.toLowerCase().includes(g)
    )
  ) {
    return true;
  }

  // Keyword groups in French
  const tokens = g.split(/[\s,;/+()-]+/).filter((t) => t.length >= 3);
  if (tokens.some((t) => haystack.includes(t))) {
    return true;
  }

  const runningKeywords = [
    'run',
    'course',
    'courir',
    '10km',
    '10 km',
    '5km',
    'semi',
    'marathon',
    'trail',
    'vma',
    'chrono',
    'cardio',
    'endurance',
    'vitesse',
  ];
  const strengthKeywords = [
    'muscle',
    'muscu',
    'renfo',
    'force',
    'tonus',
    'tonif',
    'masse',
    'dos',
    'abdo',
    'gainage',
    'poids',
    'minceur',
    'forme',
  ];
  const mobilityKeywords = [
    'soupl',
    'mobil',
    'blessure',
    'reprise',
    'cheville',
    'genou',
    'posture',
    'rehab',
  ];

  if (
    exercise.category === 'running' &&
    runningKeywords.some((k) => g.includes(k))
  ) {
    return true;
  }
  if (
    exercise.category === 'strength' &&
    strengthKeywords.some((k) => g.includes(k))
  ) {
    return true;
  }
  if (
    exercise.category === 'mobility' &&
    mobilityKeywords.some((k) => g.includes(k))
  ) {
    return true;
  }

  return false;
}
