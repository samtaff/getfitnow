import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronDown,
  Crown,
  Dumbbell,
  Flame,
  Medal,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { DisciplineItem } from '../types';
import { formatFrenchDateShort } from '../utils/dateAndValidation';
import {
  DISCIPLINE_COLOR_PRESETS,
  getDisciplineStyle,
} from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import {
  BadgeCategory,
  DisciplineBadgeGroup,
  MemberBadgeItem,
  MemberBadgesSummary,
} from '../utils/memberBadges';

interface MemberBadgesCardProps {
  summary: MemberBadgesSummary;
  disciplines?: DisciplineItem[];
  compact?: boolean;
  defaultExpanded?: boolean;
  forceExpandNonce?: number;
  highlightedBadgeIds?: string[];
  title?: string;
  subtitle?: string;
}

type BadgeFilterTab = 'all' | BadgeCategory;

function getMilestoneIcon(target: number) {
  if (target >= 500) return Crown;
  if (target >= 100) return Trophy;
  if (target >= 25) return Medal;
  if (target >= 5) return Award;
  return Target;
}

function getStreakIcon(target: number) {
  if (target >= 15) return Flame;
  if (target >= 7) return Zap;
  return Flame;
}

function formatCountShort(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

export function MemberBadgesCard({
  summary,
  disciplines = [],
  compact = false,
  defaultExpanded = false,
  forceExpandNonce = 0,
  highlightedBadgeIds = [],
  title = 'Mes badges & récompenses',
  subtitle,
}: MemberBadgesCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<BadgeFilterTab>('all');
  const [expandedDisciplines, setExpandedDisciplines] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (forceExpandNonce > 0) {
      setExpanded(true);
    }
  }, [forceExpandNonce]);

  const highlightedSet = useMemo(
    () => new Set(highlightedBadgeIds),
    [highlightedBadgeIds]
  );

  const unlockedMilestoneBadges = useMemo(
    () => summary.milestoneBadges.filter((b) => b.unlocked),
    [summary.milestoneBadges]
  );

  const unlockedStreakBadges = useMemo(
    () => summary.streakBadges.filter((b) => b.unlocked),
    [summary.streakBadges]
  );

  const unlockedDisciplineGroups = useMemo<DisciplineBadgeGroup[]>(
    () =>
      summary.disciplineGroups
        .filter((g) => g.unlockedCount > 0)
        .map((g) => ({
          ...g,
          badges: g.badges.filter((b) => b.unlocked),
        }))
        .filter((g) => g.badges.length > 0),
    [summary.disciplineGroups]
  );

  // Auto-expand discipline groups that contain newly unlocked highlighted badges
  useEffect(() => {
    if (highlightedBadgeIds.length === 0) return;
    const toOpen: Record<string, boolean> = {};
    unlockedDisciplineGroups.forEach((group) => {
      if (group.badges.some((b) => highlightedSet.has(b.id))) {
        toOpen[group.key] = true;
      }
    });
    if (Object.keys(toOpen).length > 0) {
      setExpandedDisciplines((prev) => ({ ...prev, ...toOpen }));
    }
  }, [highlightedBadgeIds, highlightedSet, unlockedDisciplineGroups]);

  const visibleMilestoneBadges =
    activeTab === 'all' || activeTab === 'milestone'
      ? unlockedMilestoneBadges
      : [];
  const visibleStreakBadges =
    activeTab === 'all' || activeTab === 'streak'
      ? unlockedStreakBadges
      : [];
  const visibleDisciplineGroups =
    activeTab === 'all' || activeTab === 'discipline'
      ? unlockedDisciplineGroups
      : [];

  const collapsedSummaryText = useMemo(() => {
    if (summary.unlockedCount === 0) {
      return 'Aucun badge validé pour le moment · Ils apparaîtront au fil des paliers franchis';
    }
    const parts: string[] = [
      `${summary.unlockedCount} badge${summary.unlockedCount > 1 ? 's' : ''} validé${summary.unlockedCount > 1 ? 's' : ''}`,
    ];
    if (summary.currentStreakDays > 0) {
      parts.push(`Série : ${summary.currentStreakDays} j`);
    } else if (summary.bestStreakDays > 0) {
      parts.push(`Meilleure série : ${summary.bestStreakDays} j`);
    }
    return parts.join(' · ');
  }, [summary]);

  const resolveDisciplinePreset = (
    colorKey?: string,
    disciplineName?: string
  ) => {
    if (
      colorKey &&
      DISCIPLINE_COLOR_PRESETS[
        colorKey as keyof typeof DISCIPLINE_COLOR_PRESETS
      ]
    ) {
      return DISCIPLINE_COLOR_PRESETS[
        colorKey as keyof typeof DISCIPLINE_COLOR_PRESETS
      ];
    }
    return getDisciplineStyle(disciplineName ?? '', disciplines);
  };

  const renderBadgeCard = (
    badge: MemberBadgeItem,
    options?: { insideDisciplineGroup?: boolean }
  ) => {
    const isHighlighted = highlightedSet.has(badge.id);
    const insideGroup = Boolean(options?.insideDisciplineGroup);

    const disciplinePreset =
      badge.category === 'discipline'
        ? resolveDisciplinePreset(
            badge.disciplineColorKey,
            badge.disciplineName ?? badge.title
          )
        : null;

    const IconComponent =
      badge.category === 'milestone'
        ? getMilestoneIcon(badge.target)
        : badge.category === 'streak'
          ? getStreakIcon(badge.target)
          : getMilestoneIcon(badge.target) ?? Dumbbell;

    const unlockedDateText = badge.unlockedAt
      ? formatFrenchDateShort(badge.unlockedAt)
      : '';

    const displayTitle =
      insideGroup && badge.shortTitle ? badge.shortTitle : badge.title;

    return (
      <div
        key={badge.id}
        className={`flex flex-col justify-between gap-2.5 rounded-lg border p-3.5 transition-colors ${
          isHighlighted
            ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500/30 dark:border-emerald-500 dark:bg-emerald-950/50 dark:ring-emerald-400/30'
            : 'border-emerald-200 bg-emerald-50/45 dark:border-emerald-800/80 dark:bg-emerald-950/25'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
              badge.category === 'discipline' && disciplinePreset
                ? `${disciplinePreset.softBg} ${disciplinePreset.border} ${disciplinePreset.text}`
                : badge.category === 'streak'
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-emerald-200 bg-emerald-100/80 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
            }`}
          >
            <IconComponent className="h-4 w-4" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold leading-snug text-slate-900 dark:text-white">
                {displayTitle}
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {isHighlighted ? 'Nouveau' : 'Validé'}
              </span>
            </div>

            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {badge.subtitle}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 capitalize">
              {unlockedDateText ? `Obtenu le ${unlockedDateText}` : 'Validé'}
            </span>
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {`${formatCountShort(badge.target)}/${formatCountShort(badge.target)}`}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-emerald-100 dark:bg-emerald-950">
            <div className="h-full w-full bg-emerald-600 dark:bg-emerald-500" />
          </div>
        </div>
      </div>
    );
  };

  const renderDisciplineGroup = (group: DisciplineBadgeGroup) => {
    const isGroupOpen = Boolean(expandedDisciplines[group.key]);
    const preset = resolveDisciplinePreset(
      group.colorKey,
      group.disciplineName
    );

    return (
      <div key={group.key} className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setExpandedDisciplines((prev) => ({
                ...prev,
                [group.key]: !prev[group.key],
              }))
            }
            aria-expanded={isGroupOpen}
            className="flex flex-1 items-center gap-3 text-left min-w-0 cursor-pointer"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${preset.softBg} ${preset.border} ${preset.text}`}
            >
              <DisciplineIcon
                disciplineName={group.disciplineName}
                catalog={disciplines}
                className="h-4 w-4"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {group.disciplineName}
                </p>
                <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {group.unlockedCount} badge{group.unlockedCount > 1 ? 's' : ''} validé{group.unlockedCount > 1 ? 's' : ''}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {formatCountShort(group.validatedCount)} séance
                {group.validatedCount > 1 ? 's' : ''} validée
                {group.validatedCount > 1 ? 's' : ''}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setExpandedDisciplines((prev) => ({
                ...prev,
                [group.key]: !prev[group.key],
              }))
            }
            aria-expanded={isGroupOpen}
            aria-label={
              isGroupOpen
                ? `Replier les badges ${group.disciplineName}`
                : `Déplier les badges ${group.disciplineName}`
            }
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                isGroupOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>
        </div>

        {isGroupOpen && (
          <div
            className={`mt-3.5 grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-3.5 dark:border-slate-800 ${
              compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'
            }`}
          >
            {group.badges.map((badge) =>
              renderBadgeCard(badge, { insideDisciplineGroup: true })
            )}
          </div>
        )}
      </div>
    );
  };

  const hasVisibleBadgesInTab =
    visibleMilestoneBadges.length > 0 ||
    visibleStreakBadges.length > 0 ||
    visibleDisciplineGroups.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div
        className={
          expanded
            ? 'border-b border-slate-100 pb-4 dark:border-slate-800'
            : ''
        }
      >
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="member-badges-details"
            className="flex flex-1 items-start gap-3 text-left min-w-0 cursor-pointer"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Trophy className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {subtitle ?? collapsedSummaryText}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="member-badges-details"
            aria-label={
              expanded ? 'Replier les badges' : 'Déplier les badges'
            }
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>
        </div>

        {expanded && (
          <div className="mt-3 flex flex-wrap items-center">
            <div
              role="group"
              aria-label="Filtrer les catégories de badges"
              className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
            >
              {(
                [
                  {
                    id: 'all',
                    label: `Tous (${summary.unlockedCount})`,
                  },
                  {
                    id: 'milestone',
                    label: `Événements (${unlockedMilestoneBadges.length})`,
                  },
                  {
                    id: 'streak',
                    label: `Séries (${unlockedStreakBadges.length})`,
                  },
                  {
                    id: 'discipline',
                    label: `Disciplines (${summary.unlockedDisciplineBadgesCount})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {expanded && (
        <div id="member-badges-details" className="mt-4 space-y-5">
          {/* Compact Achievement Summary Strip */}
          <div className="grid grid-cols-1 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/70 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-3">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Badges validés
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {summary.unlockedCount}
              </p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Série en cours / Record
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {summary.currentStreakDays} j
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {' '}
                  · record {summary.bestStreakDays} j
                </span>
              </p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Disciplines validées
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {summary.unlockedDisciplinesCount}
              </p>
            </div>
          </div>

          {highlightedSet.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100">
              <Sparkles
                className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>
                {highlightedSet.size === 1
                  ? 'Nouveau badge débloqué grâce à votre dernière validation !'
                  : `${highlightedSet.size} nouveaux badges débloqués grâce à votre dernière validation !`}
              </span>
            </div>
          )}

          {!hasVisibleBadgesInTab ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-800">
              <Trophy
                className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600"
                aria-hidden="true"
              />
              <p className="mt-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                {summary.unlockedCount === 0
                  ? 'Aucun badge validé pour le moment'
                  : 'Aucun badge validé dans cette catégorie pour le moment'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Les badges et récompenses apparaîtront ici automatiquement au fur et à mesure des paliers franchis.
              </p>
            </div>
          ) : (
            <>
              {/* Category 1: Paliers d'événements validés */}
              {visibleMilestoneBadges.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Paliers d’événements validés
                    </h4>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatCountShort(summary.totalValidatedEvents)} validé
                      {summary.totalValidatedEvents > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div
                    className={`grid grid-cols-1 gap-2.5 ${
                      compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'
                    }`}
                  >
                    {visibleMilestoneBadges.map((b) => renderBadgeCard(b))}
                  </div>
                </div>
              )}

              {/* Category 2: Enchaînements (séries consécutives) */}
              {visibleStreakBadges.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Enchaînements consécutifs
                    </h4>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      Record : {summary.bestStreakDays} j d’affilée
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {visibleStreakBadges.map((b) => renderBadgeCard(b))}
                  </div>
                </div>
              )}

              {/* Category 3: Badges par discipline validés */}
              {visibleDisciplineGroups.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Paliers par discipline validés
                    </h4>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {summary.unlockedDisciplineBadgesCount} validé
                      {summary.unlockedDisciplineBadgesCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {visibleDisciplineGroups.map(renderDisciplineGroup)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
