import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  List,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageSquare,
  Search,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  Discipline,
  DisciplineItem,
  EventRatingSummary,
  SportEvent,
} from '../types';
import {
  canMemberMessageEventCoach,
  evaluateEventBooking,
  formatEventCoachesLabel,
  formatEventPrice,
  formatExternalUrlLabel,
  formatFrenchDateShort,
  formatFrenchTime,
  formatPaymentModeLabel,
  formatTimeRange,
  getEventCoachNames,
  getSafeEventCoverImageSrc,
  getSafeExternalHref,
  isSameCalendarDay,
  normalizeCoverImagePosition,
} from '../utils/dateAndValidation';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import { EventsOverviewMap } from './EventLocationMap';
import {
  EventRatingInline,
  EventShareButton,
} from './EventEngagementWidgets';
import { EventImageLightbox } from './EventImageLightbox';

interface SessionsListViewProps {
  events: SportEvent[];
  disciplines: DisciplineItem[];
  nowMs: number;
  isCoach: boolean;
  isCoachAdmin?: boolean;
  registeredEventIds?: Set<string>;
  onShareEvent?: (event: SportEvent) => void;
  ratingSummaryByEventId?: Map<string, EventRatingSummary>;
  loading: boolean;
  hasMapsApiKey: boolean;
  onSelectEvent: (event: SportEvent) => void;
  onMessageCoach?: (event: SportEvent) => void;
}

type StatusFilter = 'upcoming' | 'today' | 'open' | 'all';

export function SessionsListView({
  events,
  disciplines,
  nowMs,
  isCoach,
  isCoachAdmin = false,
  registeredEventIds,
  onShareEvent,
  ratingSummaryByEventId,
  loading,
  hasMapsApiKey,
  onSelectEvent,
  onMessageCoach,
}: SessionsListViewProps) {
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('upcoming');
  const [disciplineFilter, setDisciplineFilter] = useState<'all' | Discipline>(
    'all'
  );
  const [displayMode, setDisplayMode] = useState<'list' | 'map'>('list');
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    title: string;
  } | null>(null);

  const disciplineOptions = useMemo(() => {
    const map = new Map<string, string>();
    disciplines.forEach((d) => map.set(d.name.toLowerCase(), d.name));
    events.forEach((ev) => {
      if (ev.discipline?.trim()) {
        const key = ev.discipline.trim().toLowerCase();
        if (!map.has(key)) map.set(key, ev.discipline.trim());
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
  }, [disciplines, events]);

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev) => {
      if (ev.city?.trim()) set.add(ev.city.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [events]);

  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((ev) => {
      if (ev.region?.trim()) set.add(ev.region.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [events]);

  const availableLocationSuggestions = useMemo(() => {
    return Array.from(new Set([...availableCities, ...availableRegions])).sort(
      (a, b) => a.localeCompare(b, 'fr')
    );
  }, [availableCities, availableRegions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cq = cityFilter.trim().toLowerCase();
    const rq = regionFilter.trim().toLowerCase();
    const todayDate = new Date(nowMs);
    return events.filter((ev) => {
      if (disciplineFilter !== 'all' && ev.discipline !== disciplineFilter) {
        return false;
      }
      if (rq && (ev.region || '').trim().toLowerCase() !== rq) {
        return false;
      }
      if (cq) {
        const cityMatch = ev.city.toLowerCase().includes(cq);
        const regionMatch = (ev.region || '').toLowerCase().includes(cq);
        if (!cityMatch && !regionMatch) return false;
      }
      if (q) {
        const coachesText = getEventCoachNames(ev).join(' ');
        const hay = `${ev.title} ${ev.discipline} ${ev.location} ${ev.city} ${ev.region || ''} ${ev.coachName} ${coachesText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const evalInfo = evaluateEventBooking(ev, nowMs, {
        hideRegisteredCount: !isCoach,
      });
      if (statusFilter === 'upcoming') {
        return ev.startAt.toMillis() > nowMs;
      }
      if (statusFilter === 'today') {
        return isSameCalendarDay(ev.startAt.toDate(), todayDate);
      }
      if (statusFilter === 'open') {
        return evalInfo.state === 'open';
      }
      return true;
    });
  }, [events, search, cityFilter, regionFilter, statusFilter, disciplineFilter, nowMs, isCoach]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Toutes les séances sportives
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Recherchez par ville ou région, localisez sur la carte et réservez votre place jusqu’au début de la séance ou selon la clôture définie par le coach.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          {/* City or Region Search */}
          <div className="relative w-full sm:w-56">
            <MapPin
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="Ville ou région..."
              aria-label="Rechercher par ville ou région"
              list="sessions-locations-list"
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <datalist id="sessions-locations-list">
              {availableLocationSuggestions.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>

          {/* Text Search */}
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Séance, lieu, animateur..."
              aria-label="Rechercher une séance"
              className="min-h-[44px] w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Filters & View Mode Switch */}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Filtrer par disponibilité"
          className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
        >
          {(
            [
              { id: 'upcoming', label: 'À venir' },
              { id: 'today', label: 'Aujourd’hui' },
              { id: 'open', label: 'Ouvertes' },
              { id: 'all', label: 'Historique' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            aria-label="Filtrer par région"
            className="min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:flex-none"
          >
            <option value="">Toutes les régions</option>
            {availableRegions.map((reg) => (
              <option key={reg} value={reg}>
                {reg}
              </option>
            ))}
          </select>

          <select
            value={disciplineFilter}
            onChange={(e) =>
              setDisciplineFilter(e.target.value as 'all' | Discipline)
            }
            aria-label="Filtrer par discipline"
            className="min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:flex-none"
          >
            <option value="all">Toutes les disciplines</option>
            {disciplineOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <div
            role="group"
            aria-label="Affichage liste ou carte"
            className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          >
            <button
              type="button"
              onClick={() => setDisplayMode('list')}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                displayMode === 'list'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Liste
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('map')}
              className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                displayMode === 'map'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Carte
            </button>
          </div>
        </div>
      </div>

      {/* Quick City Selector */}
      {availableCities.length > 1 && (
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0 mr-1">
            Villes :
          </span>
          <button
            type="button"
            onClick={() => setCityFilter('')}
            className={`min-h-[34px] rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              cityFilter.trim() === ''
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Toutes
          </button>
          {availableCities.map((city) => {
            const active =
              cityFilter.trim().toLowerCase() === city.toLowerCase();
            return (
              <button
                key={city}
                type="button"
                onClick={() => setCityFilter(active ? '' : city)}
                className={`min-h-[34px] rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {city}
              </button>
            );
          })}
        </div>
      )}

      {/* Sessions Content */}
      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-52 animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900 sm:p-12">
          <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
            {events.length === 0
              ? 'Aucune séance sportive publiée pour le moment'
              : 'Aucune séance ne correspond à votre recherche'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {events.length === 0
              ? 'Un animateur publiera prochainement de nouveaux créneaux sportifs.'
              : 'Essayez une autre ville ou région, affichez l’historique ou réinitialisez vos filtres.'}
          </p>
          {events.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCityFilter('');
                setRegionFilter('');
                setDisciplineFilter('all');
                setStatusFilter('upcoming');
              }}
              className="mt-4 min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : displayMode === 'map' ? (
        <div className="mt-6 space-y-4">
          <EventsOverviewMap
            events={filtered}
            disciplines={disciplines}
            hasMapsApiKey={hasMapsApiKey}
            onSelectEvent={onSelectEvent}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Touchez un repère sur la carte pour consulter les détails de la séance et réserver votre place.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ev) => {
            const evalInfo = evaluateEventBooking(ev, nowMs, {
              hideRegisteredCount: !isCoach,
            });
            const discStyle = getDisciplineStyle(ev.discipline, disciplines);
            const startDate = ev.startAt.toDate();
            const coverImageSrc = getSafeEventCoverImageSrc(ev.coverImageUrl);
            const coverImagePosition = normalizeCoverImagePosition(
              ev.coverImagePosition
            );

            return (
              <article
                key={ev.id}
                className={`flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 border-l-4 ${discStyle.leftBorder} bg-white transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700`}
              >
                <div>
                  {coverImageSrc && (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxImage({ src: coverImageSrc, title: ev.title })
                      }
                      aria-label={`Agrandir le visuel de ${ev.title}`}
                      className="group relative block aspect-[16/7] w-full overflow-hidden border-b border-slate-200/80 bg-slate-900 dark:border-slate-800 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
                    >
                      <img
                        src={coverImageSrc}
                        alt={ev.title}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        style={{ objectPosition: coverImagePosition }}
                        loading="lazy"
                      />
                      <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-950/65 px-2 py-1 text-[11px] font-medium text-white/95 backdrop-blur-xs transition-colors group-hover:bg-slate-950/85">
                        <Maximize2 className="h-3 w-3" aria-hidden="true" />
                        Agrandir
                      </span>
                    </button>
                  )}
                  <div className="p-4 pb-0 sm:p-5 sm:pb-0">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold shrink-0 ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                      >
                        <DisciplineIcon
                          disciplineName={ev.discipline}
                          catalog={disciplines}
                          className="h-3 w-3 shrink-0"
                        />
                        {ev.discipline}
                      </span>
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums shrink-0 ${
                          ev.isPaid
                            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        }`}
                      >
                        {formatEventPrice(ev)}
                      </span>
                      {registeredEventIds?.has(ev.id) && (
                        <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                          Inscrit
                        </span>
                      )}
                      <span className="font-mono tabular-nums">
                        {ev.durationMinutes} min
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 font-semibold shrink-0 ${
                        evalInfo.state === 'open'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : evalInfo.state === 'closed'
                            ? 'text-amber-700 dark:text-amber-400'
                            : evalInfo.state === 'full' ||
                                evalInfo.state === 'cancelled'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {evalInfo.state === 'open' && (
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {evalInfo.state === 'closed' && (
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {(evalInfo.state === 'full' ||
                        evalInfo.state === 'cancelled') && (
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {evalInfo.statusLabel}
                    </span>
                  </div>

                  <h3 className="mt-2 font-display text-lg font-bold text-slate-900 dark:text-white">
                    {ev.title}
                  </h3>

                  {ratingSummaryByEventId?.get(ev.id) && (
                    <div className="mt-1">
                      <EventRatingInline
                        summary={ratingSummaryByEventId.get(ev.id)}
                      />
                    </div>
                  )}

                  {ev.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                      {ev.description}
                    </p>
                  )}

                  <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                      <span className="capitalize">
                        {formatFrenchDateShort(startDate)} ·{' '}
                        {formatTimeRange(startDate, ev.durationMinutes)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {ev.location} · <strong className="text-slate-900 dark:text-white">{ev.city}</strong>
                        {ev.region ? ` (${ev.region})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                      <span className="truncate">{formatEventCoachesLabel(ev)}</span>
                    </div>
                    {(() => {
                      const safeExternalUrl = getSafeExternalHref(ev.externalUrl);
                      if (!safeExternalUrl) return null;
                      return (
                        <div className="flex items-center gap-2">
                          <ExternalLink className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                          <a
                            href={safeExternalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                          >
                            {formatExternalUrlLabel(safeExternalUrl)}
                          </a>
                        </div>
                      );
                    })()}
                  </div>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-4">
                  {ev.isPaid && (
                    <p className="mb-1.5 font-mono text-[11px] text-amber-800 dark:text-amber-300 tabular-nums">
                      Tarif : {formatEventPrice(ev)} · {formatPaymentModeLabel(ev.paymentMode)}
                    </p>
                  )}
                  <p
                    className={`mb-2.5 text-xs ${
                      evalInfo.state === 'cancelled'
                        ? 'font-medium text-rose-700 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {evalInfo.helperText}
                  </p>
                  {(() => {
                    const hasSpots =
                      evalInfo.isUnlimited || (evalInfo.remainingSpots ?? 0) > 0;
                    const canBookFromCard =
                      hasSpots && evalInfo.state === 'open';
                    const isClosedBeforeStart =
                      (evalInfo.state === 'closed' ||
                        (evalInfo.state === 'cancelled' &&
                          evalInfo.isAutoCancelledNoRegistrants)) &&
                      nowMs < evalInfo.startMs;
                    const showClosedMessageCta =
                      !isCoach &&
                      Boolean(onMessageCoach) &&
                      isClosedBeforeStart &&
                      canMemberMessageEventCoach(ev, nowMs, evalInfo);
                    return (
                      <div className="space-y-2">
                        {showClosedMessageCta && (
                          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            Message à l’animateur possible jusqu’à {formatFrenchTime(startDate)}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {evalInfo.state !== 'cancelled' && onShareEvent && (
                            <EventShareButton
                              compact
                              eventTitle={ev.title}
                              onClick={() => onShareEvent(ev)}
                            />
                          )}
                          {showClosedMessageCta && onMessageCoach && (
                            <button
                              type="button"
                              onClick={() => onMessageCoach(ev)}
                              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-emerald-700 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50 cursor-pointer"
                            >
                              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                              Écrire à l’animateur
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectEvent(ev)}
                            className={`flex-1 min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                              canBookFromCard
                                ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                            }`}
                          >
                            {evalInfo.state === 'open' && hasSpots
                              ? ev.isPaid
                                ? `Réserver (${formatEventPrice(ev)})`
                                : 'Réserver & voir la carte'
                              : evalInfo.state === 'cancelled'
                                ? 'Séance annulée · Voir détails'
                                : 'Voir la carte et détails'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {lightboxImage && (
        <EventImageLightbox
          src={lightboxImage.src}
          title={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </section>
  );
}
