import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, PieChart } from 'lucide-react';
import { Registration, SportEvent } from '../types';

export type RegularityPeriod = 'week' | 'month' | 'year';

interface MemberRegularityChartProps {
  registrations: Registration[];
  events?: SportEvent[];
  nowMs: number;
  memberEmail?: string;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  onExploreCalendar?: () => void;
}

type SliceKey = 'validated' | 'registered' | 'cancelled';

interface PieSliceDatum {
  key: SliceKey;
  label: string;
  description: string;
  count: number;
  percentage: number;
  fillLight: string;
  fillDark: string;
  swatchClass: string;
  textClass: string;
}

const PERIOD_LABELS: Record<RegularityPeriod, string> = {
  week: 'Semaine',
  month: 'Mois',
  year: 'Année',
};

function getPeriodRange(
  period: RegularityPeriod,
  offset: number,
  referenceMs: number
): { startMs: number; endMs: number; label: string } {
  const ref = new Date(referenceMs);

  if (period === 'week') {
    const day = ref.getDay(); // 0 = Sun, 1 = Mon, ...
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(
      ref.getFullYear(),
      ref.getMonth(),
      ref.getDate() + diffToMonday + offset * 7,
      0,
      0,
      0,
      0
    );
    const end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 7,
      0,
      0,
      0,
      0
    );
    const endDisplay = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + 6
    );

    const sameMonth = start.getMonth() === endDisplay.getMonth();
    const sameYear = start.getFullYear() === endDisplay.getFullYear();

    let label: string;
    if (sameMonth && sameYear) {
      const monthYear = new Intl.DateTimeFormat('fr-FR', {
        month: 'short',
        year: 'numeric',
      }).format(endDisplay);
      label = `${start.getDate()} – ${endDisplay.getDate()} ${monthYear}`;
    } else if (sameYear) {
      const startFmt = new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
      }).format(start);
      const endFmt = new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(endDisplay);
      label = `${startFmt} – ${endFmt}`;
    } else {
      const fmt = new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      label = `${fmt.format(start)} – ${fmt.format(endDisplay)}`;
    }

    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label,
    };
  }

  if (period === 'month') {
    const start = new Date(ref.getFullYear(), ref.getMonth() + offset, 1, 0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, 0);
    const rawLabel = new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
    }).format(start);
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    return {
      startMs: start.getTime(),
      endMs: end.getTime(),
      label,
    };
  }

  const targetYear = ref.getFullYear() + offset;
  const start = new Date(targetYear, 0, 1, 0, 0, 0, 0);
  const end = new Date(targetYear + 1, 0, 1, 0, 0, 0, 0);
  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    label: String(targetYear),
  };
}

function allocatePercentages(counts: number[]): number[] {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total === 0) return counts.map(() => 0);

  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map((val) => Math.floor(val));
  let remainder = 100 - floors.reduce((sum, f) => sum + f, 0);

  const ranked = exact
    .map((val, idx) => ({ idx, frac: val - floors[idx], count: counts[idx] }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < ranked.length && remainder > 0; i++) {
    floors[ranked[i].idx] += 1;
    remainder -= 1;
  }

  return floors;
}

function describePieWedge(
  cx: number,
  cy: number,
  radius: number,
  startAngleRad: number,
  endAngleRad: number
): string {
  const x1 = cx + radius * Math.cos(startAngleRad);
  const y1 = cy + radius * Math.sin(startAngleRad);
  const x2 = cx + radius * Math.cos(endAngleRad);
  const y2 = cy + radius * Math.sin(endAngleRad);
  const largeArcFlag = endAngleRad - startAngleRad > Math.PI ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${x1.toFixed(3)} ${y1.toFixed(3)}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`,
    'Z',
  ].join(' ');
}

export function MemberRegularityChart({
  registrations,
  events = [],
  nowMs,
  memberEmail,
  title = 'Régularité de l’adhérent',
  subtitle = 'Répartition des événements inscrits, validés et annulés sur la période.',
  compact = false,
  collapsible = false,
  defaultExpanded = false,
  onExploreCalendar,
}: MemberRegularityChartProps) {
  const [expanded, setExpanded] = useState(
    collapsible ? defaultExpanded : true
  );
  const [period, setPeriod] = useState<RegularityPeriod>('month');
  const [offset, setOffset] = useState(0);
  const [activeSlice, setActiveSlice] = useState<SliceKey | null>(null);
  const isBodyVisible = !collapsible || expanded;

  const eventsById = useMemo(
    () => new Map(events.map((ev) => [ev.id, ev])),
    [events]
  );

  const periodRange = useMemo(
    () => getPeriodRange(period, offset, nowMs),
    [period, offset, nowMs]
  );

  const stats = useMemo(() => {
    const cleanEmail = (memberEmail ?? '').trim().toLowerCase();
    let validatedCount = 0;
    let registeredCount = 0;
    let cancelledCount = 0;

    registrations.forEach((reg) => {
      if (cleanEmail && reg.email.trim().toLowerCase() !== cleanEmail) {
        return;
      }
      const startMs = reg.eventStartAt.toMillis();
      if (startMs < periodRange.startMs || startMs >= periodRange.endMs) {
        return;
      }
      const matchedEvent = eventsById.get(reg.eventId);
      const isAdminCancelled =
        reg.cancelledBy === 'admin' || matchedEvent?.status === 'cancelled';

      if (isAdminCancelled) {
        if (reg.attended) {
          validatedCount += 1;
        } else if (reg.isArchivedStat && !reg.eventCancelled) {
          registeredCount += 1;
        }
        return;
      }

      if (reg.status === 'cancelled') {
        cancelledCount += 1;
      } else if (reg.attended) {
        validatedCount += 1;
      } else {
        registeredCount += 1;
      }
    });

    const total = validatedCount + registeredCount + cancelledCount;
    const [pctValidated, pctRegistered, pctCancelled] = allocatePercentages([
      validatedCount,
      registeredCount,
      cancelledCount,
    ]);

    const slices: PieSliceDatum[] = [
      {
        key: 'validated',
        label: 'Validés',
        description: 'Séances effectuées et validées',
        count: validatedCount,
        percentage: pctValidated,
        fillLight: '#059669',
        fillDark: '#10b981',
        swatchClass: 'bg-emerald-600 dark:bg-emerald-500',
        textClass: 'text-emerald-700 dark:text-emerald-400',
      },
      {
        key: 'registered',
        label: 'Inscrits',
        description: 'Inscriptions confirmées en attente de validation',
        count: registeredCount,
        percentage: pctRegistered,
        fillLight: '#0284c7',
        fillDark: '#38bdf8',
        swatchClass: 'bg-sky-600 dark:bg-sky-400',
        textClass: 'text-sky-700 dark:text-sky-400',
      },
      {
        key: 'cancelled',
        label: 'Annulés',
        description: 'Désinscriptions ou séances annulées',
        count: cancelledCount,
        percentage: pctCancelled,
        fillLight: '#e11d48',
        fillDark: '#fb7185',
        swatchClass: 'bg-rose-600 dark:bg-rose-400',
        textClass: 'text-rose-700 dark:text-rose-400',
      },
    ];

    return { total, slices };
  }, [registrations, eventsById, memberEmail, periodRange.startMs, periodRange.endMs]);

  const nonZeroSlices = useMemo(
    () => stats.slices.filter((s) => s.count > 0),
    [stats.slices]
  );

  const pieGeometry = useMemo(() => {
    const cx = 110;
    const cy = 110;
    const radius = compact ? 84 : 90;
    const labelRadius = compact ? 52 : 56;
    let cursor = -Math.PI / 2;

    return nonZeroSlices.map((slice) => {
      const angle = (slice.count / stats.total) * Math.PI * 2;
      const startAngle = cursor;
      const endAngle = cursor + angle;
      const midAngle = startAngle + angle / 2;
      cursor = endAngle;

      return {
        ...slice,
        isFullCircle: nonZeroSlices.length === 1,
        path: describePieWedge(cx, cy, radius, startAngle, endAngle),
        cx,
        cy,
        radius,
        labelX: cx + labelRadius * Math.cos(midAngle),
        labelY: cy + labelRadius * Math.sin(midAngle),
      };
    });
  }, [nonZeroSlices, stats.total, compact]);

  const handleSelectPeriod = (nextPeriod: RegularityPeriod) => {
    setPeriod(nextPeriod);
    setOffset(0);
    setActiveSlice(null);
  };

  const chartSizeClass = compact ? 'h-40 w-40' : 'h-44 w-44 sm:h-48 sm:w-48';

  const ariaChartSummary =
    stats.total === 0
      ? `Aucun événement sur la période ${periodRange.label}.`
      : `Répartition sur ${periodRange.label} (${stats.total} événement${stats.total > 1 ? 's' : ''}) : ${stats.slices
          .map((s) => `${s.label} ${s.count} (${s.percentage}%)`)
          .join(', ')}.`;

  return (
    <div
      className={
        collapsible
          ? 'rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900'
          : 'border-b border-slate-100 pb-5 mb-5 dark:border-slate-800'
      }
    >
      {/* Header + Period Controls */}
      <div
        className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${
          collapsible && isBodyVisible
            ? 'border-b border-slate-100 pb-3.5 dark:border-slate-800'
            : ''
        }`}
      >
        {collapsible ? (
          <div className="flex w-full items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-controls="member-regularity-chart-body"
              className="flex flex-1 items-start gap-3 text-left min-w-0 cursor-pointer"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <PieChart className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {title}
                </h4>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {subtitle}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-controls="member-regularity-chart-body"
              aria-label={
                expanded ? 'Replier la régularité' : 'Déplier la régularité'
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
        ) : (
          <>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PieChart
                  className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {title}
                </h4>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <div
                role="group"
                aria-label="Échelle de régularité"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
              >
                {(['week', 'month', 'year'] as RegularityPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSelectPeriod(p)}
                    className={`min-h-[32px] rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      period === p
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {isBodyVisible && (
        <div id="member-regularity-chart-body">
          {collapsible && (
            <div className="mt-3 flex flex-wrap items-center">
              <div
                role="group"
                aria-label="Échelle de régularité"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
              >
                {(['week', 'month', 'year'] as RegularityPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSelectPeriod(p)}
                    className={`min-h-[32px] rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      period === p
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          )}

      {/* Period Navigator */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOffset((v) => v - 1)}
            aria-label="Période précédente"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="min-w-[132px] text-center font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
            {periodRange.label}
          </span>
          <button
            type="button"
            onClick={() => setOffset((v) => v + 1)}
            aria-label="Période suivante"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>

          {offset !== 0 && (
            <button
              type="button"
              onClick={() => setOffset(0)}
              className="ml-1 min-h-[30px] rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
            >
              Actuelle
            </button>
          )}
        </div>

        <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
          Total : {stats.total} événement{stats.total > 1 ? 's' : ''}
        </span>
      </div>

      {/* Pie Chart + Percentage Breakdown */}
      {stats.total === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-4 py-4 sm:flex-row sm:items-center sm:gap-6">
          <svg
            viewBox="0 0 220 220"
            role="img"
            aria-label={ariaChartSummary}
            className={`${chartSizeClass} shrink-0`}
          >
            <circle
              cx="110"
              cy="110"
              r={compact ? 84 : 90}
              className="fill-slate-100 stroke-slate-200 dark:fill-slate-800/80 dark:stroke-slate-700"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <text
              x="110"
              y="106"
              textAnchor="middle"
              className="fill-slate-500 dark:fill-slate-400 font-mono text-lg font-bold"
            >
              0
            </text>
            <text
              x="110"
              y="126"
              textAnchor="middle"
              className="fill-slate-400 dark:fill-slate-500 text-[11px] font-medium"
            >
              événement
            </text>
          </svg>

          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Aucun événement sur cette période
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Aucune inscription, validation ou annulation enregistrée pour{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {periodRange.label}
              </span>
              .
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              {period !== 'year' && (
                <button
                  type="button"
                  onClick={() => handleSelectPeriod('year')}
                  className="min-h-[34px] rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Afficher l’année
                </button>
              )}
              {onExploreCalendar && (
                <button
                  type="button"
                  onClick={onExploreCalendar}
                  className="min-h-[34px] rounded-md bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                >
                  Explorer le calendrier
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
          {/* Pie Chart SVG (Camembert) */}
          <div className="relative shrink-0">
            <svg
              viewBox="0 0 220 220"
              role="img"
              aria-label={ariaChartSummary}
              className={`${chartSizeClass} select-none overflow-visible`}
            >
              {pieGeometry.map((slice) => {
                const isDimmed =
                  activeSlice !== null && activeSlice !== slice.key;
                const isFocused = activeSlice === slice.key;

                return (
                  <g
                    key={slice.key}
                    tabIndex={0}
                    role="button"
                    aria-label={`${slice.label} : ${slice.count} (${slice.percentage}%)`}
                    onMouseEnter={() => setActiveSlice(slice.key)}
                    onMouseLeave={() => setActiveSlice(null)}
                    onFocus={() => setActiveSlice(slice.key)}
                    onBlur={() => setActiveSlice(null)}
                    onClick={() =>
                      setActiveSlice((prev) =>
                        prev === slice.key ? null : slice.key
                      )
                    }
                    className="cursor-pointer outline-none transition-opacity duration-150"
                    style={{
                      opacity: isDimmed ? 0.45 : 1,
                      transform: isFocused ? 'scale(1.03)' : 'scale(1)',
                      transformOrigin: '110px 110px',
                      transition: 'transform 150ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease',
                    }}
                  >
                    {slice.isFullCircle ? (
                      <circle
                        cx={slice.cx}
                        cy={slice.cy}
                        r={slice.radius}
                        fill={slice.fillLight}
                        className="stroke-white dark:stroke-slate-900"
                        strokeWidth="2.5"
                      />
                    ) : (
                      <path
                        d={slice.path}
                        fill={slice.fillLight}
                        className="stroke-white dark:stroke-slate-900"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                      />
                    )}

                    {slice.percentage >= 10 && (
                      <text
                        x={slice.isFullCircle ? slice.cx : slice.labelX}
                        y={slice.isFullCircle ? slice.cy + 5 : slice.labelY + 4}
                        textAnchor="middle"
                        className="pointer-events-none fill-white font-mono text-[13px] font-bold"
                        style={{
                          textShadow: '0 1px 2px rgba(15, 23, 42, 0.35)',
                        }}
                      >
                        {slice.percentage}%
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Breakdown Legend */}
          <div className="w-full flex-1 divide-y divide-slate-100 dark:divide-slate-800">
            {stats.slices.map((slice) => {
              const isHighlighted = activeSlice === slice.key;
              return (
                <button
                  key={slice.key}
                  type="button"
                  onMouseEnter={() =>
                    slice.count > 0 ? setActiveSlice(slice.key) : undefined
                  }
                  onMouseLeave={() => setActiveSlice(null)}
                  onFocus={() =>
                    slice.count > 0 ? setActiveSlice(slice.key) : undefined
                  }
                  onBlur={() => setActiveSlice(null)}
                  onClick={() =>
                    slice.count > 0
                      ? setActiveSlice((prev) =>
                          prev === slice.key ? null : slice.key
                        )
                      : undefined
                  }
                  className={`flex w-full items-center justify-between gap-3 py-2.5 px-2 text-left transition-colors rounded-md ${
                    slice.count > 0 ? 'cursor-pointer' : 'cursor-default opacity-70'
                  } ${
                    isHighlighted
                      ? 'bg-slate-50 dark:bg-slate-800/70'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className={`mt-1 h-3 w-3 shrink-0 rounded-xs ${slice.swatchClass}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">
                        {slice.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {slice.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2.5 shrink-0 font-mono tabular-nums">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {slice.count}
                    </span>
                    <span className={`min-w-[3.25rem] text-right text-sm font-bold ${slice.textClass}`}>
                      {slice.percentage}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
}
