import { FormEvent, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronDown,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  History,
  LogOut,
  MapPin,
  Maximize2,
  MessageSquare,
  Palette,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  DisciplineColorKey,
  DisciplineIconKey,
  DisciplineItem,
  EventRatingSummary,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  createCustomDiscipline,
  deleteCustomDiscipline,
  deleteEvent,
  seedDemoEvents,
  updateCustomDisciplineColor,
  updateCustomDisciplineIcon,
} from '../services/firestoreService';
import {
  evaluateEventBooking,
  exportCsv,
  formatBookingCutoffLabel,
  formatCapacityCompact,
  formatEventCoachesLabel,
  formatEventPrice,
  formatExternalUrlLabel,
  formatFrenchDateShort,
  formatPaymentModeLabel,
  formatPriceEuros,
  formatTimeRange,
  getEventCoachNames,
  getSafeEventCoverImageSrc,
  getSafeExternalHref,
  normalizeCoverImagePosition,
} from '../utils/dateAndValidation';
import {
  DISCIPLINE_COLOR_KEYS,
  DISCIPLINE_COLOR_PRESETS,
  DISCIPLINE_ICON_KEYS,
  DISCIPLINE_ICON_PRESETS,
  getDisciplineStyle,
  inferDisciplineIconKey,
  pickNextUnusedColorKey,
} from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import { EventRatingInline, EventShareButton } from './EventEngagementWidgets';
import { EventImageLightbox } from './EventImageLightbox';

interface CoachEventsViewProps {
  coachUid: string;
  coachEmail: string;
  coachName: string;
  events: SportEvent[];
  registrations: Registration[];
  disciplines: DisciplineItem[];
  nowMs: number;
  ratingSummaryByEventId?: Map<string, EventRatingSummary>;
  isCoachAdmin?: boolean;
  pendingCoachRequestsCount?: number;
  onOpenCoachesAdmin?: () => void;
  onSignOut: () => void;
  onCreateEvent: () => void;
  onEditEvent: (event: SportEvent) => void;
  onDuplicateEvent: (event: SportEvent) => void;
  onOpenRoster: (event: SportEvent, initialTab?: 'roster' | 'reviews') => void;
  onShareEvent?: (event: SportEvent) => void;
}

export function CoachEventsView({
  coachUid,
  coachEmail,
  coachName,
  events,
  registrations,
  disciplines,
  nowMs,
  ratingSummaryByEventId,
  isCoachAdmin = false,
  pendingCoachRequestsCount = 0,
  onOpenCoachesAdmin,
  onSignOut,
  onCreateEvent,
  onEditEvent,
  onDuplicateEvent,
  onOpenRoster,
  onShareEvent,
}: CoachEventsViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [eventActionFeedback, setEventActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [pastEventsExpanded, setPastEventsExpanded] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    title: string;
  } | null>(null);

  // Discipline management drawer/panel
  const [showDisciplinesPanel, setShowDisciplinesPanel] = useState(false);
  const [newDiscName, setNewDiscName] = useState('');
  const [manualDiscColor, setManualDiscColor] =
    useState<DisciplineColorKey | null>(null);
  const [manualDiscIcon, setManualDiscIcon] =
    useState<DisciplineIconKey | null>(null);
  const [editingIconDiscId, setEditingIconDiscId] = useState<string | null>(
    null
  );
  const [confirmDeleteDiscId, setConfirmDeleteDiscId] = useState<string | null>(
    null
  );
  const [discBusy, setDiscBusy] = useState(false);
  const [discFeedback, setDiscFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const usedDisciplineColorKeys = new Set(disciplines.map((d) => d.colorKey));
  const selectedNewDiscColor =
    manualDiscColor ?? pickNextUnusedColorKey(disciplines);
  const selectedNewDiscIcon =
    manualDiscIcon ?? inferDisciplineIconKey(newDiscName);

  const handleConfirmDelete = async (ev: SportEvent) => {
    setEventActionFeedback(null);
    setActionBusyId(ev.id);
    try {
      const result = await deleteEvent(ev.id);
      setConfirmDeleteId(null);
      if (result.notificationsSent > 0) {
        setEventActionFeedback({
          type: 'success',
          text: `La séance « ${ev.title} » a été supprimée. ${result.notificationsSent} notification${
            result.notificationsSent > 1 ? 's ont été envoyées' : ' a été envoyée'
          } aux adhérents inscrits.`,
        });
      } else {
        setEventActionFeedback({
          type: 'success',
          text: `La séance « ${ev.title} » a été supprimée et retirée du planning.`,
        });
      }
    } catch (err) {
      setEventActionFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer cet événement pour le moment.',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDemoEvents(coachUid, coachName);
    } finally {
      setSeeding(false);
    }
  };

  const handleAddDiscipline = async (e: FormEvent) => {
    e.preventDefault();
    setDiscFeedback(null);
    setDiscBusy(true);
    try {
      const added = await createCustomDiscipline({
        name: newDiscName,
        colorKey: selectedNewDiscColor,
        iconKey: selectedNewDiscIcon,
        coachUid,
        existingDisciplines: disciplines,
      });
      setNewDiscName('');
      setManualDiscColor(null);
      setManualDiscIcon(null);
      setDiscFeedback({
        type: 'success',
        text: `Discipline « ${added} » ajoutée au planning.`,
      });
    } catch (err) {
      setDiscFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’ajouter cette discipline.',
      });
    } finally {
      setDiscBusy(false);
    }
  };

  const getCollectedCents = (eventId: string): number =>
    registrations
      .filter(
        (r) =>
          r.eventId === eventId &&
          r.status === 'confirmed' &&
          r.paymentStatus === 'paid' &&
          typeof r.amountCents === 'number'
      )
      .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);

  const handleExportEvents = () => {
    exportCsv(
      'evenements-sportifs.csv',
      [
        'Titre',
        'Discipline',
        'Date',
        'Horaire',
        'Ville',
        'Région',
        'Lieu',
        'Animateur(s)',
        'Tarif',
        'Mode paiement',
        'Encaissé (€)',
        'Inscrits',
        'Capacité',
        'Statut',
      ],
      events.map((ev) => {
        const regCount = registrations.filter(
          (r) => r.eventId === ev.id && r.status === 'confirmed'
        ).length;
        const effectiveEvent =
          ev.registeredCount === regCount
            ? ev
            : { ...ev, registeredCount: regCount };
        return [
          ev.title,
          ev.discipline,
          formatFrenchDateShort(ev.startAt.toDate()),
          formatTimeRange(ev.startAt.toDate(), ev.durationMinutes),
          ev.city || '',
          ev.region || '',
          ev.location,
          getEventCoachNames(ev).join(', ') || ev.coachName,
          formatEventPrice(ev),
          ev.isPaid ? formatPaymentModeLabel(ev.paymentMode) : 'Gratuit',
          ev.isPaid ? formatPriceEuros(getCollectedCents(ev.id)) : '0 €',
          String(regCount),
          ev.isUnlimitedCapacity ? 'Illimité' : String(ev.maxCapacity),
          evaluateEventBooking(effectiveEvent, nowMs).statusLabel,
        ];
      })
    );
  };

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const upcoming: SportEvent[] = [];
    const past: SportEvent[] = [];
    events.forEach((ev) => {
      const endMs = ev.startAt.toMillis() + ev.durationMinutes * 60 * 1000;
      if (endMs <= nowMs) {
        past.push(ev);
      } else {
        upcoming.push(ev);
      }
    });
    upcoming.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
    past.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
    return { upcomingEvents: upcoming, pastEvents: past };
  }, [events, nowMs]);

  const renderMobileEventCard = (ev: SportEvent) => {
    const discStyle = getDisciplineStyle(ev.discipline, disciplines);
    const regCount = registrations.filter(
      (r) => r.eventId === ev.id && r.status === 'confirmed'
    ).length;
    const effectiveEvent =
      ev.registeredCount === regCount
        ? ev
        : { ...ev, registeredCount: regCount };
    const evalInfo = evaluateEventBooking(effectiveEvent, nowMs);
    const presentCount = registrations.filter(
      (r) =>
        r.eventId === ev.id &&
        r.status === 'confirmed' &&
        r.attended
    ).length;

    const coverImageSrc = getSafeEventCoverImageSrc(ev.coverImageUrl);
    const coverImagePosition = normalizeCoverImagePosition(
      ev.coverImagePosition
    );

    return (
      <div
        key={ev.id}
        className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 ${discStyle.leftBorder} bg-white dark:border-slate-800 dark:bg-slate-900`}
      >
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
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold capitalize text-slate-500 dark:text-slate-400">
              {formatFrenchDateShort(ev.startAt.toDate())} ·{' '}
              <span className="font-mono tabular-nums">
                {formatTimeRange(ev.startAt.toDate(), ev.durationMinutes)}
              </span>
            </p>
            <h3 className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white">
              {ev.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
              >
                <DisciplineIcon
                  disciplineName={ev.discipline}
                  catalog={disciplines}
                  className="h-3 w-3 shrink-0"
                />
                {ev.discipline}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {ev.durationMinutes} min
              </span>
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                  ev.isPaid
                    ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                {formatEventPrice(ev)}
              </span>
            </div>
            {ev.isPaid && (
              <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {formatPaymentModeLabel(ev.paymentMode)} · Encaissé :{' '}
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatPriceEuros(getCollectedCents(ev.id))}
                </span>
              </p>
            )}
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
              <UserCheck
                className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              <span>{formatEventCoachesLabel(ev)}</span>
            </p>
            {(() => {
              const safeExternalUrl = getSafeExternalHref(ev.externalUrl);
              if (!safeExternalUrl) return null;
              return (
                <p className="mt-1">
                  <a
                    href={safeExternalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{formatExternalUrlLabel(safeExternalUrl)}</span>
                  </a>
                </p>
              );
            })()}
          </div>
          <div className="shrink-0 text-right">
            <span
              className={`text-xs font-semibold ${
                evalInfo.state === 'open'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : evalInfo.state === 'closed'
                    ? 'text-amber-700 dark:text-amber-400'
                    : evalInfo.state === 'full' || evalInfo.state === 'cancelled'
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {evalInfo.statusLabel}
            </span>
            {evalInfo.isAutoCancelledNoRegistrants ? (
              <p className="mt-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                Pas d’inscrit à cette séance
              </p>
            ) : evalInfo.cutoffMinutes > 0 && evalInfo.state !== 'cancelled' ? (
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Clôture {formatBookingCutoffLabel(evalInfo.cutoffMinutes)} avant
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <MapPin
              className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <span className="truncate">
              {ev.city ? `${ev.city}${ev.region ? ` (${ev.region})` : ''} — ` : ''}
              {ev.location}
            </span>
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <EventRatingInline summary={ratingSummaryByEventId?.get(ev.id)} />
            <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
              {formatCapacityCompact(effectiveEvent)}
              {regCount > 0 && ` (${presentCount} prés.)`}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenRoster(effectiveEvent, 'roster')}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Inscrits ({regCount})
          </button>
          <button
            type="button"
            onClick={() => onOpenRoster(ev, 'reviews')}
            title="Consulter les avis"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Avis ({ratingSummaryByEventId?.get(ev.id)?.count ?? 0})
          </button>

          {evalInfo.state !== 'cancelled' && onShareEvent && (
            <EventShareButton
              compact
              eventTitle={ev.title}
              onClick={() => onShareEvent(ev)}
            />
          )}

          <button
            type="button"
            onClick={() => onDuplicateEvent(ev)}
            title="Dupliquer sur une autre date"
            aria-label={`Dupliquer ${ev.title}`}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => onEditEvent(ev)}
            aria-label={`Modifier ${ev.title}`}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
          >
            <Edit3 className="h-4 w-4" aria-hidden="true" />
          </button>

          {confirmDeleteId === ev.id ? (
            <div className="flex w-full flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/70 p-2.5 dark:border-rose-900/70 dark:bg-rose-950/40">
              <p className="text-xs text-rose-950 dark:text-rose-100">
                Supprimer cette séance ?{' '}
                {regCount > 0
                  ? `${regCount} adhérent${regCount > 1 ? 's inscrits recevront' : ' inscrit recevra'} une notification.`
                  : 'Aucun inscrit à notifier.'}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={actionBusyId === ev.id}
                  onClick={() => void handleConfirmDelete(ev)}
                  className="min-h-[38px] flex-1 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                >
                  {actionBusyId === ev.id
                    ? 'Suppression...'
                    : regCount > 0
                      ? 'Supprimer & notifier'
                      : 'Confirmer la suppression'}
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === ev.id}
                  onClick={() => setConfirmDeleteId(null)}
                  className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                >
                  Non
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(ev.id)}
              title="Supprimer la séance et notifier les inscrits"
              aria-label={`Supprimer ${ev.title} et notifier les inscrits`}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        </div>
      </div>
    );
  };

  const renderDesktopEventRow = (ev: SportEvent) => {
    const discStyle = getDisciplineStyle(ev.discipline, disciplines);
    const regCount = registrations.filter(
      (r) => r.eventId === ev.id && r.status === 'confirmed'
    ).length;
    const effectiveEvent =
      ev.registeredCount === regCount
        ? ev
        : { ...ev, registeredCount: regCount };
    const evalInfo = evaluateEventBooking(effectiveEvent, nowMs);
    const presentCount = registrations.filter(
      (r) =>
        r.eventId === ev.id &&
        r.status === 'confirmed' &&
        r.attended
    ).length;

    return (
      <tr key={ev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top whitespace-nowrap">
          <p className="font-medium capitalize text-slate-900 dark:text-white">
            {formatFrenchDateShort(ev.startAt.toDate())}
          </p>
          <p className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatTimeRange(ev.startAt.toDate(), ev.durationMinutes)}
          </p>
        </td>

        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top min-w-[200px]">
          <p className="font-semibold text-slate-900 dark:text-white">
            {ev.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
            >
              <DisciplineIcon
                disciplineName={ev.discipline}
                catalog={disciplines}
                className="h-3 w-3 shrink-0"
              />
              {ev.discipline}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {ev.durationMinutes} min
            </span>
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                ev.isPaid
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              }`}
            >
              {formatEventPrice(ev)}
            </span>
          </div>
          {ev.isPaid && (
            <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {formatPaymentModeLabel(ev.paymentMode)} · Encaissé :{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {formatPriceEuros(getCollectedCents(ev.id))}
              </span>
            </p>
          )}
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <UserCheck
              className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500"
              aria-hidden="true"
            />
            <span>{formatEventCoachesLabel(ev)}</span>
          </p>
          {(() => {
            const safeExternalUrl = getSafeExternalHref(ev.externalUrl);
            if (!safeExternalUrl) return null;
            return (
              <p className="mt-1">
                <a
                  href={safeExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{formatExternalUrlLabel(safeExternalUrl)}</span>
                </a>
              </p>
            );
          })()}
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
            <EventRatingInline summary={ratingSummaryByEventId?.get(ev.id)} />
          </div>
        </td>

        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top text-xs text-slate-600 dark:text-slate-300 max-w-[160px] lg:max-w-[210px]">
          {ev.city && (
            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
              {ev.city}
              {ev.region ? ` · ${ev.region}` : ''}
            </p>
          )}
          <p className="truncate">{ev.location}</p>
        </td>

        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top text-right font-mono tabular-nums whitespace-nowrap">
          <p className="font-semibold text-slate-900 dark:text-white">
            {formatCapacityCompact(effectiveEvent)}
          </p>
          {regCount > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {presentCount} présent{presentCount > 1 ? 's' : ''}
            </p>
          )}
        </td>

        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top">
          <span
            className={`block whitespace-nowrap text-xs font-semibold ${
              evalInfo.state === 'open'
                ? 'text-emerald-700 dark:text-emerald-400'
                : evalInfo.state === 'closed'
                  ? 'text-amber-700 dark:text-amber-400'
                  : evalInfo.state === 'full' || evalInfo.state === 'cancelled'
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {evalInfo.statusLabel}
          </span>
          {evalInfo.isAutoCancelledNoRegistrants ? (
            <span className="mt-0.5 block text-[11px] font-medium text-rose-600 dark:text-rose-400">
              Pas d’inscrit à cette séance
            </span>
          ) : evalInfo.cutoffMinutes > 0 && evalInfo.state !== 'cancelled' ? (
            <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
              Clôture {formatBookingCutoffLabel(evalInfo.cutoffMinutes)} avant
            </span>
          ) : null}
        </td>

        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top">
          <div className="flex flex-wrap items-center justify-end gap-1.5 xl:flex-nowrap">
            <button
              type="button"
              onClick={() => onOpenRoster(effectiveEvent, 'roster')}
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Inscrits
            </button>

            <button
              type="button"
              onClick={() => onOpenRoster(ev, 'reviews')}
              title="Consulter les avis"
              className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              Avis ({ratingSummaryByEventId?.get(ev.id)?.count ?? 0})
            </button>

            {evalInfo.state !== 'cancelled' && onShareEvent && (
              <EventShareButton
                compact
                eventTitle={ev.title}
                onClick={() => onShareEvent(ev)}
              />
            )}

            <button
              type="button"
              onClick={() => onDuplicateEvent(ev)}
              title="Dupliquer sur une autre date"
              aria-label={`Dupliquer ${ev.title}`}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onEditEvent(ev)}
              title="Modifier"
              aria-label={`Modifier ${ev.title}`}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
            >
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            {confirmDeleteId === ev.id ? (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={actionBusyId === ev.id}
                  onClick={() => void handleConfirmDelete(ev)}
                  title={
                    regCount > 0
                      ? `Supprimer la séance et notifier les ${regCount} inscrit(s)`
                      : 'Supprimer la séance'
                  }
                  className="min-h-[34px] rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                >
                  {actionBusyId === ev.id
                    ? 'Envoi...'
                    : regCount > 0
                      ? `Suppr. (${regCount} notif.)`
                      : 'Suppr.'}
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === ev.id}
                  onClick={() => setConfirmDeleteId(null)}
                  className="min-h-[34px] rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                >
                  Non
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteId(ev.id)}
                title="Supprimer la séance et notifier les inscrits"
                aria-label={`Supprimer ${ev.title} et notifier les inscrits`}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Workspace Toolbar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Gestion des événements sportifs
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Connecté en tant que coach ({coachEmail}) · Gérez vos créneaux, disciplines, couleurs et listes d’inscrits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowDisciplinesPanel((prev) => !prev)}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium cursor-pointer ${
              showDisciplinesPanel
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Palette className="h-3.5 w-3.5" aria-hidden="true" />
            Disciplines ({disciplines.length})
          </button>

          <button
            type="button"
            onClick={handleExportEvents}
            disabled={events.length === 0}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exporter CSV
          </button>

          <button
            type="button"
            onClick={onCreateEvent}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvel événement
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Déconnexion
          </button>
        </div>
      </div>

      {/* Collapsible Disciplines & Color Coding Panel */}
      {showDisciplinesPanel && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 space-y-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Disciplines sportives & code couleur
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Ajoutez de nouvelles disciplines ou personnalisez la couleur appliquée dans le calendrier, la liste et sur Google Maps.
              </p>
            </div>
          </div>

          {/* Add custom discipline form */}
          <form
            onSubmit={handleAddDiscipline}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-800/50"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="new-discipline-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Ajouter une discipline *
                </label>
                <input
                  id="new-discipline-name"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.DISCIPLINE_MIN}
                  maxLength={VALIDATION_LIMITS.DISCIPLINE_MAX}
                  value={newDiscName}
                  onChange={(e) => setNewDiscName(e.target.value)}
                  placeholder="Ex. CrossFit, Yoga Vinyasa, Boxe anglaise..."
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <button
                type="submit"
                disabled={discBusy}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 shrink-0 cursor-pointer"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {discBusy ? 'Ajout...' : 'Ajouter la discipline'}
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Code couleur :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {DISCIPLINE_COLOR_PRESETS[selectedNewDiscColor].label}
                  </strong>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {!manualDiscColor && !usedDisciplineColorKeys.has(selectedNewDiscColor)
                    ? 'Couleur disponible attribuée automatiquement'
                    : usedDisciplineColorKeys.has(selectedNewDiscColor)
                      ? 'Couleur déjà utilisée par une autre discipline'
                      : 'Couleur disponible'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {DISCIPLINE_COLOR_KEYS.map((key) => {
                  const preset = DISCIPLINE_COLOR_PRESETS[key];
                  const selected = selectedNewDiscColor === key;
                  const isUsed = usedDisciplineColorKeys.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setManualDiscColor(key)}
                      title={`${preset.label}${isUsed ? ' (déjà utilisée)' : ' (disponible)'}`}
                      aria-label={`Choisir la couleur ${preset.label}${isUsed ? ' (déjà utilisée)' : ''}`}
                      className={`relative flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-transform ${preset.swatchBg} ${
                        selected
                          ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-slate-900 scale-105'
                          : isUsed
                            ? 'opacity-45 hover:opacity-90'
                            : 'opacity-85 hover:opacity-100'
                      }`}
                    >
                      {selected && (
                        <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Picto de la discipline :{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {DISCIPLINE_ICON_PRESETS[selectedNewDiscIcon].label}
                  </strong>
                </span>
                {!manualDiscIcon && newDiscName.trim().length >= 2 && (
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Suggestion automatique
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {DISCIPLINE_ICON_KEYS.map((iconKey) => {
                  const meta = DISCIPLINE_ICON_PRESETS[iconKey];
                  const selected = selectedNewDiscIcon === iconKey;
                  const activePreset =
                    DISCIPLINE_COLOR_PRESETS[selectedNewDiscColor];
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => setManualDiscIcon(iconKey)}
                      title={meta.label}
                      aria-label={`Picto ${meta.label}`}
                      aria-pressed={selected}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border cursor-pointer transition-colors ${
                        selected
                          ? `${activePreset.softBg} ${activePreset.border} ${activePreset.text} ring-2 ring-slate-900/20 dark:ring-white/25`
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                      }`}
                    >
                      <DisciplineIcon iconKey={iconKey} className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {discFeedback && (
              <p
                className={`text-xs font-medium ${
                  discFeedback.type === 'success'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {discFeedback.text}
              </p>
            )}
          </form>

          {/* Disciplines alphabetical list */}
          {disciplines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
              Aucune discipline enregistrée pour le moment. Ajoutez votre première discipline ci-dessus.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Liste des disciplines (ordre alphabétique) :
              </p>
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {disciplines.map((item) => {
                  const preset = DISCIPLINE_COLOR_PRESETS[item.colorKey];
                  const isConfirming = confirmDeleteDiscId === item.id;
                  const isEditingIcon = editingIconDiscId === item.id;
                  return (
                    <li
                      key={item.id}
                      className={`border-l-4 p-3.5 ${preset.leftBorder}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${preset.softBg} ${preset.border} ${preset.text}`}
                            title={DISCIPLINE_ICON_PRESETS[item.iconKey].label}
                          >
                            <DisciplineIcon
                              iconKey={item.iconKey}
                              className="h-4 w-4"
                            />
                          </span>
                          <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {item.name}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:justify-end">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {DISCIPLINE_COLOR_KEYS.map((key) => {
                              const c = DISCIPLINE_COLOR_PRESETS[key];
                              const active = item.colorKey === key;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() =>
                                    void updateCustomDisciplineColor({
                                      name: item.name,
                                      slug: item.id,
                                      colorKey: key,
                                      iconKey: item.iconKey,
                                      coachUid,
                                    })
                                  }
                                  title={`Appliquer ${c.label} à ${item.name}`}
                                  aria-label={`Couleur ${c.label} pour ${item.name}`}
                                  className={`h-5 w-5 rounded-sm cursor-pointer ${c.swatchBg} ${
                                    active
                                      ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-slate-100 dark:ring-offset-slate-900'
                                      : 'opacity-55 hover:opacity-100'
                                  }`}
                                />
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setEditingIconDiscId((prev) =>
                                prev === item.id ? null : item.id
                              )
                            }
                            aria-expanded={isEditingIcon}
                            title={`Changer le picto de ${item.name}`}
                            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium cursor-pointer ${
                              isEditingIcon
                                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                                : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                            }`}
                          >
                            <DisciplineIcon
                              iconKey={item.iconKey}
                              className="h-3.5 w-3.5"
                            />
                            Picto
                          </button>

                          {isConfirming ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteCustomDiscipline(item.id);
                                  setConfirmDeleteDiscId(null);
                                }}
                                className="min-h-[32px] rounded-md bg-rose-600 px-2.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                              >
                                Supprimer
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteDiscId(null)}
                                className="min-h-[32px] rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDiscId(item.id)}
                              title={`Supprimer ${item.name}`}
                              aria-label={`Supprimer la discipline ${item.name}`}
                              className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Supprimer
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditingIcon && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <span className="mr-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            Choisir un picto :
                          </span>
                          {DISCIPLINE_ICON_KEYS.map((iconKey) => {
                            const meta = DISCIPLINE_ICON_PRESETS[iconKey];
                            const active = item.iconKey === iconKey;
                            return (
                              <button
                                key={iconKey}
                                type="button"
                                onClick={async () => {
                                  await updateCustomDisciplineIcon({
                                    name: item.name,
                                    slug: item.id,
                                    colorKey: item.colorKey,
                                    iconKey,
                                    coachUid,
                                  });
                                  setEditingIconDiscId(null);
                                }}
                                title={meta.label}
                                aria-label={`${meta.label} pour ${item.name}`}
                                className={`flex h-8 w-8 items-center justify-center rounded-md border cursor-pointer transition-colors ${
                                  active
                                    ? `${preset.softBg} ${preset.border} ${preset.text} ring-2 ring-slate-900/20 dark:ring-white/25`
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                                }`}
                              >
                                <DisciplineIcon
                                  iconKey={iconKey}
                                  className="h-4 w-4"
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {isCoachAdmin && pendingCoachRequestsCount > 0 && onOpenCoachesAdmin && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/45 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 text-sm text-amber-950 dark:text-amber-100">
            <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <span>
              <strong>
                {pendingCoachRequestsCount} demande
                {pendingCoachRequestsCount > 1 ? 's' : ''} en attente
              </strong>{' '}
              de validation administrateur (accès coach ou nomination).
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenCoachesAdmin}
            className="min-h-[40px] rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Examiner les demandes
          </button>
        </div>
      )}

      {eventActionFeedback && (
        <div
          role="status"
          className={`mt-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
            eventActionFeedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
          }`}
        >
          <span>{eventActionFeedback.text}</span>
          <button
            type="button"
            onClick={() => setEventActionFeedback(null)}
            className="shrink-0 font-semibold underline cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Content */}
      {events.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900 sm:p-12">
          <CalendarPlus className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <h3 className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-white">
            Aucun événement sportif programmé
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Créez votre première séance sportive ou générez un planning d’exemple pour démarrer immédiatement.
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onCreateEvent}
              className="min-h-[44px] rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
            >
              + Créer ma première séance
            </button>
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 cursor-pointer"
            >
              {seeding ? 'Création en cours...' : 'Générer 5 séances d’exemple'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {upcomingEvents.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Aucun événement sportif à venir
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Planifiez une nouvelle séance ou dépliez vos événements passés ci-dessous.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card List (< md) */}
              <div className="mt-5 space-y-3 md:hidden">
                {upcomingEvents.map(renderMobileEventCard)}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="mt-6 hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-3 lg:px-4 lg:py-3.5 whitespace-nowrap">Date & Horaire</th>
                        <th className="px-3 py-3 lg:px-4 lg:py-3.5">Séance & Discipline</th>
                        <th className="px-3 py-3 lg:px-4 lg:py-3.5">Ville & Lieu</th>
                        <th className="px-3 py-3 lg:px-4 lg:py-3.5 text-right whitespace-nowrap">Inscrits</th>
                        <th className="px-3 py-3 lg:px-4 lg:py-3.5 whitespace-nowrap">Statut</th>
                        <th className="px-3 py-3 lg:px-4 lg:py-3.5 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {upcomingEvents.map(renderDesktopEventRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Collapsible Past Events Section */}
          {pastEvents.length > 0 && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => setPastEventsExpanded((prev) => !prev)}
                  aria-expanded={pastEventsExpanded}
                  aria-controls="coach-past-events-body"
                  className="flex flex-1 items-center gap-3 text-left min-w-0 cursor-pointer"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <History className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Événements passés ({pastEvents.length})
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {pastEventsExpanded
                        ? 'Séances dont la date est passée — cliquez pour replier'
                        : 'Séances dont la date est passée — cliquez pour déplier'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPastEventsExpanded((prev) => !prev)}
                  aria-expanded={pastEventsExpanded}
                  aria-controls="coach-past-events-body"
                  aria-label={
                    pastEventsExpanded
                      ? 'Replier les événements passés'
                      : 'Déplier les événements passés'
                  }
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      pastEventsExpanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {pastEventsExpanded && (
                <div
                  id="coach-past-events-body"
                  className="border-t border-slate-100 p-3 dark:border-slate-800 sm:p-4"
                >
                  {/* Mobile Past Events (< md) */}
                  <div className="space-y-3 md:hidden">
                    {pastEvents.map(renderMobileEventCard)}
                  </div>

                  {/* Desktop Past Events Table (>= md) */}
                  <div className="hidden overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 md:block">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                          <tr>
                            <th className="px-3 py-3 lg:px-4 lg:py-3.5 whitespace-nowrap">Date & Horaire</th>
                            <th className="px-3 py-3 lg:px-4 lg:py-3.5">Séance & Discipline</th>
                            <th className="px-3 py-3 lg:px-4 lg:py-3.5">Ville & Lieu</th>
                            <th className="px-3 py-3 lg:px-4 lg:py-3.5 text-right whitespace-nowrap">Inscrits</th>
                            <th className="px-3 py-3 lg:px-4 lg:py-3.5 whitespace-nowrap">Statut</th>
                            <th className="px-3 py-3 lg:px-4 lg:py-3.5 text-right whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {pastEvents.map(renderDesktopEventRow)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
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
