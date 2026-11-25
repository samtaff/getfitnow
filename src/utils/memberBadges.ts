import {
  DisciplineItem,
  EventReview,
  Registration,
  SportEvent,
} from '../types';
import { getDisciplineStyle } from './disciplineColors';

export const MILESTONE_THRESHOLDS = [
  1, 5, 10, 25, 50, 100, 250, 500, 1000,
] as const;

export const STREAK_THRESHOLDS = [3, 7, 15, 30] as const;

export type BadgeCategory = 'milestone' | 'streak' | 'discipline';

export interface MemberBadgeItem {
  id: string;
  category: BadgeCategory;
  title: string;
  shortTitle?: string;
  subtitle: string;
  target: number;
  current: number;
  progressPct: number;
  unlocked: boolean;
  unlockedAt: Date | null;
  disciplineName?: string;
  disciplineColorKey?: string;
}

export interface DisciplineBadgeGroup {
  key: string;
  disciplineName: string;
  colorKey: string;
  validatedCount: number;
  unlockedCount: number;
  totalCount: number;
  nextBadge: MemberBadgeItem | null;
  badges: MemberBadgeItem[];
}

export interface MemberBadgesSummary {
  totalValidatedEvents: number;
  bestStreakDays: number;
  currentStreakDays: number;
  unlockedDisciplinesCount: number;
  totalDisciplinesCount: number;
  unlockedDisciplineBadgesCount: number;
  totalDisciplineBadgesCount: number;
  milestoneBadges: MemberBadgeItem[];
  streakBadges: MemberBadgeItem[];
  disciplineGroups: DisciplineBadgeGroup[];
  disciplineBadges: MemberBadgeItem[];
  allBadges: MemberBadgeItem[];
  unlockedBadges: MemberBadgeItem[];
  unlockedCount: number;
  totalCount: number;
  nextMilestoneBadge: MemberBadgeItem | null;
  nextStreakBadge: MemberBadgeItem | null;
}

const MILESTONE_LABELS: Record<number, { title: string; subtitle: string }> = {
  1: {
    title: '1er événement validé',
    subtitle: 'Premier pas accompli',
  },
  5: {
    title: '5e événement validé',
    subtitle: 'Élan lancé',
  },
  10: {
    title: '10e événement validé',
    subtitle: 'Habitué régulier',
  },
  25: {
    title: '25e événement validé',
    subtitle: 'Assiduité confirmée',
  },
  50: {
    title: '50e événement validé',
    subtitle: 'Pilier du club',
  },
  100: {
    title: '100e événement validé',
    subtitle: 'Centurion sportif',
  },
  250: {
    title: '250e événement validé',
    subtitle: 'Athlète d’élite',
  },
  500: {
    title: '500e événement validé',
    subtitle: 'Légende du club',
  },
  1000: {
    title: '1 000e événement validé',
    subtitle: 'Maître absolu',
  },
};

const STREAK_LABELS: Record<number, { title: string; subtitle: string }> = {
  3: {
    title: 'Série de 3 jours',
    subtitle: '3 événements validés en 3 jours d’affilée',
  },
  7: {
    title: 'Série de 7 jours',
    subtitle: '7 événements validés en 7 jours d’affilée',
  },
  15: {
    title: 'Série de 15 jours',
    subtitle: '15 événements validés en 15 jours d’affilée',
  },
  30: {
    title: 'Série de 30 jours',
    subtitle: '30 événements validés en 30 jours d’affilée',
  },
};

function formatNumberFr(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function formatOrdinalEventFr(threshold: number): string {
  return threshold === 1
    ? '1er événement'
    : `${formatNumberFr(threshold)}e événement`;
}

function toLocalDayIndex(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
}

export interface ComputeMemberBadgesInput {
  registrations: Registration[];
  events: SportEvent[];
  disciplines?: DisciplineItem[];
  memberEmail?: string | null;
  reviewsByRegId?: Map<string, EventReview>;
  nowMs?: number;
}

export function computeMemberBadges({
  registrations,
  events,
  disciplines = [],
  memberEmail,
  reviewsByRegId,
  nowMs = Date.now(),
}: ComputeMemberBadgesInput): MemberBadgesSummary {
  const emailLower = (memberEmail ?? '').trim().toLowerCase();
  const eventsById = new Map(events.map((ev) => [ev.id, ev]));

  // Filter strictly to this member's validated registrations (preserving already-attended
  // sessions if an admin later cancels/deletes the event or removes the registrant)
  const validatedRegs = registrations
    .filter((reg) => {
      if (!reg.attended) return false;
      const isConfirmed = reg.status === 'confirmed';
      const isPreservedByAdmin =
        reg.cancelledBy === 'admin' || Boolean(reg.isArchivedStat);
      if (!isConfirmed && !isPreservedByAdmin) return false;
      if (emailLower && reg.email.trim().toLowerCase() !== emailLower) {
        return false;
      }
      const matchedEvent = eventsById.get(reg.eventId) ?? null;
      if (
        matchedEvent?.status === 'cancelled' &&
        !isPreservedByAdmin &&
        !reg.attended
      ) {
        return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      const diff = a.eventStartAt.toMillis() - b.eventStartAt.toMillis();
      if (diff !== 0) return diff;
      const aUpd = a.updatedAt?.toMillis?.() ?? a.eventStartAt.toMillis();
      const bUpd = b.updatedAt?.toMillis?.() ?? b.eventStartAt.toMillis();
      return aUpd - bUpd;
    });

  const totalValidatedEvents = validatedRegs.length;

  // 1. Global milestone badges (1, 5, 10, 25, 50, 100, 250, 500, 1000)
  const milestoneBadges: MemberBadgeItem[] = MILESTONE_THRESHOLDS.map(
    (threshold) => {
      const unlocked = totalValidatedEvents >= threshold;
      const unlockingReg = unlocked ? validatedRegs[threshold - 1] : null;
      const label = MILESTONE_LABELS[threshold] ?? {
        title: `${formatOrdinalEventFr(threshold)} validé`,
        subtitle: `${formatNumberFr(threshold)} événements validés`,
      };
      const current = Math.min(totalValidatedEvents, threshold);
      return {
        id: `milestone-${threshold}`,
        category: 'milestone',
        title: label.title,
        subtitle: label.subtitle,
        target: threshold,
        current,
        progressPct: Math.min(100, Math.round((current / threshold) * 100)),
        unlocked,
        unlockedAt: unlockingReg ? unlockingReg.eventStartAt.toDate() : null,
      };
    }
  );

  // 2. Consecutive-day streak badges (3, 7, 15, 30)
  const dayDateMap = new Map<number, Date>();
  validatedRegs.forEach((reg) => {
    const startDate = reg.eventStartAt.toDate();
    const dayIdx = toLocalDayIndex(startDate);
    if (!dayDateMap.has(dayIdx)) {
      dayDateMap.set(dayIdx, startDate);
    }
  });

  const sortedDayIndices = Array.from(dayDateMap.keys()).sort((a, b) => a - b);
  let bestStreakDays = 0;
  let runningStreak = 0;
  const streakUnlockDates = new Map<number, Date>();

  for (let i = 0; i < sortedDayIndices.length; i += 1) {
    const idx = sortedDayIndices[i];
    if (i > 0 && idx === sortedDayIndices[i - 1] + 1) {
      runningStreak += 1;
    } else {
      runningStreak = 1;
    }
    if (runningStreak > bestStreakDays) {
      bestStreakDays = runningStreak;
    }
    STREAK_THRESHOLDS.forEach((threshold) => {
      if (runningStreak >= threshold && !streakUnlockDates.has(threshold)) {
        const unlockDate = dayDateMap.get(idx) ?? null;
        if (unlockDate) {
          streakUnlockDates.set(threshold, unlockDate);
        }
      }
    });
  }

  const todayIndex = toLocalDayIndex(new Date(nowMs));
  const upToTodayIndices = sortedDayIndices.filter((idx) => idx <= todayIndex);
  let currentStreakDays = 0;
  if (upToTodayIndices.length > 0) {
    const lastIdx = upToTodayIndices[upToTodayIndices.length - 1];
    if (lastIdx >= todayIndex - 1) {
      currentStreakDays = 1;
      for (let i = upToTodayIndices.length - 1; i > 0; i -= 1) {
        if (upToTodayIndices[i] - upToTodayIndices[i - 1] === 1) {
          currentStreakDays += 1;
        } else {
          break;
        }
      }
    }
  }

  const streakBadges: MemberBadgeItem[] = STREAK_THRESHOLDS.map((threshold) => {
    const unlocked = bestStreakDays >= threshold;
    const label = STREAK_LABELS[threshold] ?? {
      title: `Série de ${threshold} jours`,
      subtitle: `${threshold} événements en ${threshold} jours d’affilée`,
    };
    const current = unlocked
      ? threshold
      : Math.min(Math.max(currentStreakDays, bestStreakDays), threshold);
    return {
      id: `streak-${threshold}`,
      category: 'streak',
      title: label.title,
      subtitle: label.subtitle,
      target: threshold,
      current,
      progressPct: Math.min(100, Math.round((current / threshold) * 100)),
      unlocked,
      unlockedAt: streakUnlockDates.get(threshold) ?? null,
    };
  });

  // 3. Per-discipline milestone badges (1, 5, 10, 25, 50, 100, 250, 500, 1000 per discipline)
  interface DisciplineBucket {
    displayName: string;
    regs: Registration[];
    colorKey: string;
  }

  const disciplineMap = new Map<string, DisciplineBucket>();

  // Seed with club discipline catalog (automatically covers existing & newly added disciplines)
  disciplines.forEach((disc) => {
    const cleanName = disc.name.trim();
    if (!cleanName) return;
    const key = cleanName.toLowerCase();
    disciplineMap.set(key, {
      displayName: cleanName,
      regs: [],
      colorKey: disc.colorKey,
    });
  });

  // Include any disciplines present on active events even if not in catalog
  events.forEach((ev) => {
    if (ev.status === 'cancelled') return;
    const cleanName = (ev.discipline ?? '').trim();
    if (!cleanName) return;
    const key = cleanName.toLowerCase();
    if (!disciplineMap.has(key)) {
      const style = getDisciplineStyle(cleanName, disciplines);
      disciplineMap.set(key, {
        displayName: cleanName,
        regs: [],
        colorKey: style.key,
      });
    }
  });

  // Group member's validated registrations chronologically per discipline
  validatedRegs.forEach((reg) => {
    const matchedEvent = eventsById.get(reg.eventId) ?? null;
    const rawDiscipline =
      matchedEvent?.discipline?.trim() ||
      reg.discipline?.trim() ||
      reviewsByRegId?.get(reg.id)?.discipline?.trim() ||
      '';
    if (!rawDiscipline) return;
    const key = rawDiscipline.toLowerCase();
    let bucket = disciplineMap.get(key);
    if (!bucket) {
      const style = getDisciplineStyle(rawDiscipline, disciplines);
      bucket = {
        displayName: rawDiscipline,
        regs: [],
        colorKey: style.key,
      };
      disciplineMap.set(key, bucket);
    }
    bucket.regs.push(reg);
  });

  const disciplineGroups: DisciplineBadgeGroup[] = Array.from(
    disciplineMap.entries()
  )
    .sort(([, a], [, b]) => {
      if (b.regs.length !== a.regs.length) return b.regs.length - a.regs.length;
      return a.displayName.localeCompare(b.displayName, 'fr', {
        sensitivity: 'base',
      });
    })
    .map(([key, bucket]) => {
      const validatedCount = bucket.regs.length;
      const badges: MemberBadgeItem[] = MILESTONE_THRESHOLDS.map(
        (threshold) => {
          const unlocked = validatedCount >= threshold;
          const unlockingReg = unlocked ? bucket.regs[threshold - 1] : null;
          const current = Math.min(validatedCount, threshold);
          const ordinalLabel = formatOrdinalEventFr(threshold);
          const meta = MILESTONE_LABELS[threshold];
          return {
            id: `discipline-${key}-${threshold}`,
            category: 'discipline',
            title: `${ordinalLabel} · ${bucket.displayName}`,
            shortTitle: ordinalLabel,
            subtitle: meta
              ? `${meta.subtitle} · ${bucket.displayName}`
              : `${ordinalLabel} validé en ${bucket.displayName}`,
            target: threshold,
            current,
            progressPct: Math.min(100, Math.round((current / threshold) * 100)),
            unlocked,
            unlockedAt: unlockingReg
              ? unlockingReg.eventStartAt.toDate()
              : null,
            disciplineName: bucket.displayName,
            disciplineColorKey: bucket.colorKey,
          };
        }
      );

      const unlockedCount = badges.filter((b) => b.unlocked).length;
      return {
        key,
        disciplineName: bucket.displayName,
        colorKey: bucket.colorKey,
        validatedCount,
        unlockedCount,
        totalCount: badges.length,
        nextBadge: badges.find((b) => !b.unlocked) ?? null,
        badges,
      };
    });

  const disciplineBadges: MemberBadgeItem[] = disciplineGroups.flatMap(
    (g) => g.badges
  );

  const allBadges: MemberBadgeItem[] = [
    ...milestoneBadges,
    ...streakBadges,
    ...disciplineBadges,
  ];
  const unlockedBadges = allBadges.filter((b) => b.unlocked);

  const nextMilestoneBadge =
    milestoneBadges.find((b) => !b.unlocked) ?? null;
  const nextStreakBadge = streakBadges.find((b) => !b.unlocked) ?? null;

  return {
    totalValidatedEvents,
    bestStreakDays,
    currentStreakDays,
    unlockedDisciplinesCount: disciplineGroups.filter(
      (g) => g.validatedCount > 0
    ).length,
    totalDisciplinesCount: disciplineGroups.length,
    unlockedDisciplineBadgesCount: disciplineBadges.filter((b) => b.unlocked)
      .length,
    totalDisciplineBadgesCount: disciplineBadges.length,
    milestoneBadges,
    streakBadges,
    disciplineGroups,
    disciplineBadges,
    allBadges,
    unlockedBadges,
    unlockedCount: unlockedBadges.length,
    totalCount: allBadges.length,
    nextMilestoneBadge,
    nextStreakBadge,
  };
}

export function getNewlyUnlockedBadges(
  before: MemberBadgesSummary,
  after: MemberBadgesSummary
): MemberBadgeItem[] {
  const beforeUnlockedIds = new Set(before.unlockedBadges.map((b) => b.id));
  return after.unlockedBadges.filter((b) => !beforeUnlockedIds.has(b.id));
}
