import {
  CustomDiscipline,
  DisciplineColorKey,
  DisciplineIconKey,
  DisciplineItem,
} from '../types';

export interface DisciplineColorPreset {
  key: DisciplineColorKey;
  label: string;
  hex: string;
  borderHex: string;
  softBg: string;
  cardBg: string;
  text: string;
  border: string;
  leftBorder: string;
  swatchBg: string;
}

export const DISCIPLINE_COLOR_KEYS: DisciplineColorKey[] = [
  'rose',
  'orange',
  'teal',
  'sky',
  'violet',
  'emerald',
  'amber',
  'indigo',
  'lime',
  'cyan',
  'fuchsia',
  'blue',
  'pink',
  'slate',
];

export const DISCIPLINE_COLOR_PRESETS: Record<
  DisciplineColorKey,
  DisciplineColorPreset
> = {
  rose: {
    key: 'rose',
    label: 'Framboise',
    hex: '#e11d48',
    borderHex: '#9f1239',
    softBg: 'bg-rose-50 dark:bg-rose-950/60',
    cardBg: 'bg-rose-50/90 hover:bg-rose-100/90 dark:bg-rose-950/45 dark:hover:bg-rose-900/55',
    text: 'text-rose-800 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800/80',
    leftBorder: 'border-l-rose-600 dark:border-l-rose-500',
    swatchBg: 'bg-rose-600',
  },
  orange: {
    key: 'orange',
    label: 'Orange',
    hex: '#ea580c',
    borderHex: '#9a3412',
    softBg: 'bg-orange-50 dark:bg-orange-950/60',
    cardBg: 'bg-orange-50/90 hover:bg-orange-100/90 dark:bg-orange-950/45 dark:hover:bg-orange-900/55',
    text: 'text-orange-800 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-800/80',
    leftBorder: 'border-l-orange-600 dark:border-l-orange-500',
    swatchBg: 'bg-orange-600',
  },
  teal: {
    key: 'teal',
    label: 'Turquoise',
    hex: '#0d9488',
    borderHex: '#115e59',
    softBg: 'bg-teal-50 dark:bg-teal-950/60',
    cardBg: 'bg-teal-50/90 hover:bg-teal-100/90 dark:bg-teal-950/45 dark:hover:bg-teal-900/55',
    text: 'text-teal-800 dark:text-teal-300',
    border: 'border-teal-200 dark:border-teal-800/80',
    leftBorder: 'border-l-teal-600 dark:border-l-teal-500',
    swatchBg: 'bg-teal-600',
  },
  sky: {
    key: 'sky',
    label: 'Bleu ciel',
    hex: '#0284c7',
    borderHex: '#075985',
    softBg: 'bg-sky-50 dark:bg-sky-950/60',
    cardBg: 'bg-sky-50/90 hover:bg-sky-100/90 dark:bg-sky-950/45 dark:hover:bg-sky-900/55',
    text: 'text-sky-800 dark:text-sky-300',
    border: 'border-sky-200 dark:border-sky-800/80',
    leftBorder: 'border-l-sky-600 dark:border-l-sky-500',
    swatchBg: 'bg-sky-600',
  },
  violet: {
    key: 'violet',
    label: 'Violet',
    hex: '#7c3aed',
    borderHex: '#5b21b6',
    softBg: 'bg-violet-50 dark:bg-violet-950/60',
    cardBg: 'bg-violet-50/90 hover:bg-violet-100/90 dark:bg-violet-950/45 dark:hover:bg-violet-900/55',
    text: 'text-violet-800 dark:text-violet-300',
    border: 'border-violet-200 dark:border-violet-800/80',
    leftBorder: 'border-l-violet-600 dark:border-l-violet-500',
    swatchBg: 'bg-violet-600',
  },
  emerald: {
    key: 'emerald',
    label: 'Émeraude',
    hex: '#059669',
    borderHex: '#065f46',
    softBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    cardBg: 'bg-emerald-50/90 hover:bg-emerald-100/90 dark:bg-emerald-950/45 dark:hover:bg-emerald-900/55',
    text: 'text-emerald-800 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800/80',
    leftBorder: 'border-l-emerald-600 dark:border-l-emerald-500',
    swatchBg: 'bg-emerald-600',
  },
  amber: {
    key: 'amber',
    label: 'Ambre',
    hex: '#d97706',
    borderHex: '#92400e',
    softBg: 'bg-amber-50 dark:bg-amber-950/60',
    cardBg: 'bg-amber-50/90 hover:bg-amber-100/90 dark:bg-amber-950/45 dark:hover:bg-amber-900/55',
    text: 'text-amber-800 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800/80',
    leftBorder: 'border-l-amber-600 dark:border-l-amber-500',
    swatchBg: 'bg-amber-600',
  },
  indigo: {
    key: 'indigo',
    label: 'Indigo',
    hex: '#4f46e5',
    borderHex: '#3730a3',
    softBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    cardBg: 'bg-indigo-50/90 hover:bg-indigo-100/90 dark:bg-indigo-950/45 dark:hover:bg-indigo-900/55',
    text: 'text-indigo-800 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800/80',
    leftBorder: 'border-l-indigo-600 dark:border-l-indigo-500',
    swatchBg: 'bg-indigo-600',
  },
  lime: {
    key: 'lime',
    label: 'Vert lime',
    hex: '#65a30d',
    borderHex: '#3f6212',
    softBg: 'bg-lime-50 dark:bg-lime-950/60',
    cardBg: 'bg-lime-50/90 hover:bg-lime-100/90 dark:bg-lime-950/45 dark:hover:bg-lime-900/55',
    text: 'text-lime-800 dark:text-lime-300',
    border: 'border-lime-200 dark:border-lime-800/80',
    leftBorder: 'border-l-lime-600 dark:border-l-lime-500',
    swatchBg: 'bg-lime-600',
  },
  cyan: {
    key: 'cyan',
    label: 'Cyan',
    hex: '#0891b2',
    borderHex: '#155e75',
    softBg: 'bg-cyan-50 dark:bg-cyan-950/60',
    cardBg: 'bg-cyan-50/90 hover:bg-cyan-100/90 dark:bg-cyan-950/45 dark:hover:bg-cyan-900/55',
    text: 'text-cyan-800 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-800/80',
    leftBorder: 'border-l-cyan-600 dark:border-l-cyan-500',
    swatchBg: 'bg-cyan-600',
  },
  fuchsia: {
    key: 'fuchsia',
    label: 'Fuchsia',
    hex: '#c026d3',
    borderHex: '#86198f',
    softBg: 'bg-fuchsia-50 dark:bg-fuchsia-950/60',
    cardBg: 'bg-fuchsia-50/90 hover:bg-fuchsia-100/90 dark:bg-fuchsia-950/45 dark:hover:bg-fuchsia-900/55',
    text: 'text-fuchsia-800 dark:text-fuchsia-300',
    border: 'border-fuchsia-200 dark:border-fuchsia-800/80',
    leftBorder: 'border-l-fuchsia-600 dark:border-l-fuchsia-500',
    swatchBg: 'bg-fuchsia-600',
  },
  blue: {
    key: 'blue',
    label: 'Bleu roi',
    hex: '#2563eb',
    borderHex: '#1e40af',
    softBg: 'bg-blue-50 dark:bg-blue-950/60',
    cardBg: 'bg-blue-50/90 hover:bg-blue-100/90 dark:bg-blue-950/45 dark:hover:bg-blue-900/55',
    text: 'text-blue-800 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800/80',
    leftBorder: 'border-l-blue-600 dark:border-l-blue-500',
    swatchBg: 'bg-blue-600',
  },
  pink: {
    key: 'pink',
    label: 'Rose',
    hex: '#db2777',
    borderHex: '#9d174d',
    softBg: 'bg-pink-50 dark:bg-pink-950/60',
    cardBg: 'bg-pink-50/90 hover:bg-pink-100/90 dark:bg-pink-950/45 dark:hover:bg-pink-900/55',
    text: 'text-pink-800 dark:text-pink-300',
    border: 'border-pink-200 dark:border-pink-800/80',
    leftBorder: 'border-l-pink-600 dark:border-l-pink-500',
    swatchBg: 'bg-pink-600',
  },
  slate: {
    key: 'slate',
    label: 'Ardoise',
    hex: '#475569',
    borderHex: '#1e293b',
    softBg: 'bg-slate-100 dark:bg-slate-800',
    cardBg: 'bg-slate-100/90 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80',
    text: 'text-slate-800 dark:text-slate-200',
    border: 'border-slate-300 dark:border-slate-700',
    leftBorder: 'border-l-slate-600 dark:border-l-slate-400',
    swatchBg: 'bg-slate-600',
  },
};

export interface DisciplineIconPreset {
  key: DisciplineIconKey;
  label: string;
}

export const DISCIPLINE_ICON_KEYS: DisciplineIconKey[] = [
  'dumbbell',
  'running-shoe',
  'flame',
  'yoga',
  'bike',
  'waves',
  'boxing',
  'heart-pulse',
  'zap',
  'mountain',
  'music',
  'ball',
  'timer',
  'footprints',
  'target',
  'trophy',
];

export const DISCIPLINE_ICON_PRESETS: Record<
  DisciplineIconKey,
  DisciplineIconPreset
> = {
  dumbbell: { key: 'dumbbell', label: 'Haltère (Renforcement / Muscu)' },
  'running-shoe': {
    key: 'running-shoe',
    label: 'Chaussure de sport (Running)',
  },
  flame: { key: 'flame', label: 'Flamme (HIIT / Cardio intense)' },
  yoga: { key: 'yoga', label: 'Mobilité / Yoga / Pilates' },
  bike: { key: 'bike', label: 'Vélo / Cyclisme / Spinning' },
  waves: { key: 'waves', label: 'Natation / Aquagym' },
  boxing: { key: 'boxing', label: 'Gant de boxe / Combat' },
  'heart-pulse': { key: 'heart-pulse', label: 'Cardio / Remise en forme' },
  zap: { key: 'zap', label: 'Éclair (Circuit / Explosivité)' },
  mountain: { key: 'mountain', label: 'Montagne (Trail / Randonnée)' },
  music: { key: 'music', label: 'Danse / Zumba / Rythme' },
  ball: { key: 'ball', label: 'Sport collectif / Ballon' },
  timer: { key: 'timer', label: 'Chrono / Fractionné' },
  footprints: { key: 'footprints', label: 'Marche active / Nordique' },
  target: { key: 'target', label: 'Objectif / Coaching' },
  trophy: { key: 'trophy', label: 'Performance / Challenge' },
};

const ICON_KEYWORD_RULES: Array<{
  key: DisciplineIconKey;
  keywords: string[];
}> = [
  {
    key: 'running-shoe',
    keywords: [
      'running',
      'run',
      'course',
      'courir',
      'jogging',
      'jog',
      'marathon',
      'semi',
      'footing',
      'athle',
      '10km',
      'sprint',
      'foulee',
    ],
  },
  {
    key: 'dumbbell',
    keywords: [
      'renforcement',
      'renfo',
      'muscul',
      'force',
      'halter',
      'crossfit',
      'bodypump',
      'body pump',
      'pump',
      'poids',
      'kettle',
      'full body',
      'fullbody',
      'abdo',
      'fessier',
      'caf',
      'sculpt',
      'tonif',
      'gainage',
      'calisthen',
      'street workout',
      'trx',
      'gym',
    ],
  },
  {
    key: 'boxing',
    keywords: [
      'boxe',
      'boxing',
      'combat',
      'kick',
      'mma',
      'muay',
      'thai',
      'karate',
      'judo',
      'taekwondo',
      'self',
      'defense',
      'lutte',
      'savate',
    ],
  },
  {
    key: 'yoga',
    keywords: [
      'yoga',
      'pilates',
      'mobil',
      'stretch',
      'etir',
      'soupl',
      'relax',
      'medit',
      'zen',
      'bien-etre',
      'bien etre',
      'postur',
      'respir',
      'dos',
    ],
  },
  {
    key: 'bike',
    keywords: [
      'velo',
      'cycl',
      'vtt',
      'rpm',
      'spinning',
      'biking',
      'bike',
      'gravel',
    ],
  },
  {
    key: 'waves',
    keywords: [
      'natation',
      'aqua',
      'swim',
      'piscine',
      'nage',
      'surf',
      'aviron',
      'paddle',
      'kayak',
      'triathlon',
    ],
  },
  {
    key: 'flame',
    keywords: ['hiit', 'tabata', 'bootcamp', 'boot camp', 'brul', 'intense', 'metabolic'],
  },
  {
    key: 'zap',
    keywords: ['circuit', 'plyo', 'explos', 'agilit', 'hyrox', 'cross training', 'crosstraining'],
  },
  {
    key: 'mountain',
    keywords: ['trail', 'rando', 'montagne', 'escalade', 'grimpe', 'bloc', 'trek', 'alpin', 'outdoor'],
  },
  {
    key: 'footprints',
    keywords: ['marche', 'walk', 'nordique', 'nordic', 'step'],
  },
  {
    key: 'music',
    keywords: ['danse', 'dance', 'zumba', 'aerobic', 'bodyjam', 'salsa', 'hip hop', 'barre'],
  },
  {
    key: 'ball',
    keywords: ['foot', 'basket', 'volley', 'hand', 'rugby', 'tennis', 'padel', 'squash', 'badminton', 'collectif', 'golf'],
  },
  {
    key: 'timer',
    keywords: ['fraction', 'interval', 'chrono', 'vma', 'seuil'],
  },
  {
    key: 'heart-pulse',
    keywords: ['cardio', 'fitness', 'fit', 'sante', 'forme', 'remise', 'endurance'],
  },
  {
    key: 'trophy',
    keywords: ['compet', 'perform', 'challenge', 'defi'],
  },
];

function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isValidDisciplineIconKey(
  value: unknown
): value is DisciplineIconKey {
  return (
    typeof value === 'string' &&
    Boolean(DISCIPLINE_ICON_PRESETS[value as DisciplineIconKey])
  );
}

export function inferDisciplineIconKey(
  disciplineName: string
): DisciplineIconKey {
  const normalized = normalizeForMatch(disciplineName);
  if (!normalized) return 'target';

  for (const rule of ICON_KEYWORD_RULES) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      return rule.key;
    }
  }
  return 'target';
}

export function pickNextUnusedColorKey(
  existingDisciplines: Array<{ colorKey: DisciplineColorKey }>,
  preferredKey?: DisciplineColorKey
): DisciplineColorKey {
  const usedCounts = new Map<DisciplineColorKey, number>();
  DISCIPLINE_COLOR_KEYS.forEach((key) => usedCounts.set(key, 0));

  for (const disc of existingDisciplines) {
    if (DISCIPLINE_COLOR_PRESETS[disc.colorKey]) {
      usedCounts.set(disc.colorKey, (usedCounts.get(disc.colorKey) ?? 0) + 1);
    }
  }

  if (
    preferredKey &&
    DISCIPLINE_COLOR_PRESETS[preferredKey] &&
    (usedCounts.get(preferredKey) ?? 0) === 0
  ) {
    return preferredKey;
  }

  const firstUnused = DISCIPLINE_COLOR_KEYS.find(
    (key) => (usedCounts.get(key) ?? 0) === 0
  );
  if (firstUnused) {
    return firstUnused;
  }

  // All palette colors are already used at least once: pick the least-used vibrant color first
  let bestKey: DisciplineColorKey = DISCIPLINE_COLOR_KEYS[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const key of DISCIPLINE_COLOR_KEYS) {
    const count = usedCounts.get(key) ?? 0;
    if (count < bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey;
}

export function slugifyDiscipline(name: string): string {
  const normalized = normalizeForMatch(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  if (normalized.length >= 2) {
    return normalized;
  }
  return `disc-${Math.abs(hashString(name)).toString(36)}`;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return hash;
}

export function buildDisciplineCatalog(
  customDisciplines: CustomDiscipline[]
): DisciplineItem[] {
  const map = new Map<string, DisciplineItem>();

  for (const custom of customDisciplines) {
    const cleanName = custom.name.trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    map.set(key, {
      id: custom.id,
      name: cleanName,
      colorKey: DISCIPLINE_COLOR_PRESETS[custom.colorKey]
        ? custom.colorKey
        : 'indigo',
      iconKey: isValidDisciplineIconKey(custom.iconKey)
        ? custom.iconKey
        : inferDisciplineIconKey(cleanName),
      customDoc: custom,
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  );
}

export function getDisciplineStyle(
  disciplineName: string,
  catalog: DisciplineItem[] = []
): DisciplineColorPreset {
  const clean = (disciplineName || '').trim().toLowerCase();
  const fromCatalog = catalog.find(
    (item) => item.name.trim().toLowerCase() === clean
  );
  if (fromCatalog) {
    return (
      DISCIPLINE_COLOR_PRESETS[fromCatalog.colorKey] ??
      DISCIPLINE_COLOR_PRESETS.emerald
    );
  }

  const fallbackPool = DISCIPLINE_COLOR_KEYS.filter((k) => k !== 'slate');
  const idx = Math.abs(hashString(clean || 'sport')) % fallbackPool.length;
  return DISCIPLINE_COLOR_PRESETS[fallbackPool[idx]];
}

export function getDisciplineIconKey(
  disciplineName: string,
  catalog: DisciplineItem[] = []
): DisciplineIconKey {
  const clean = (disciplineName || '').trim().toLowerCase();
  const fromCatalog = catalog.find(
    (item) => item.name.trim().toLowerCase() === clean
  );
  if (fromCatalog && isValidDisciplineIconKey(fromCatalog.iconKey)) {
    return fromCatalog.iconKey;
  }
  return inferDisciplineIconKey(disciplineName);
}
