import { BellRing, CalendarClock, MapPin, X } from 'lucide-react';
import { DisciplineItem, SportEvent } from '../types';
import {
  evaluateEventBooking,
  formatFrenchDateShort,
  formatTimeRange,
} from '../utils/dateAndValidation';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';

interface CancelledEventsNotifierProps {
  events: SportEvent[];
  activeEventIds?: Set<string>;
  disciplines: DisciplineItem[];
  nowMs: number;
  isCoach?: boolean;
  dismissedIds: Set<string>;
  onDismiss: (eventId: string) => void;
  onDismissAll: (eventIds: string[]) => void;
  onSelectEvent: (event: SportEvent) => void;
}

const RECENT_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;

export function getAutoCancelledNotificationEvents(
  events: SportEvent[],
  nowMs: number
): SportEvent[] {
  return events.filter((ev) => {
    const evalInfo = evaluateEventBooking(ev, nowMs);
    if (!evalInfo.isAutoCancelledNoRegistrants) return false;
    // Notify for upcoming H-1 window and up to 24h after scheduled start
    return nowMs - evalInfo.startMs <= RECENT_CANCEL_WINDOW_MS;
  });
}

export function CancelledEventsNotifier({
  events,
  activeEventIds,
  disciplines,
  nowMs,
  isCoach = false,
  dismissedIds,
  onDismiss,
  onDismissAll,
  onSelectEvent,
}: CancelledEventsNotifierProps) {
  const autoCancelledEvents = getAutoCancelledNotificationEvents(events, nowMs);
  const visibleNotifications = autoCancelledEvents.filter(
    (ev) => !dismissedIds.has(ev.id)
  );

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-rose-200 bg-rose-50/95 dark:border-rose-900/70 dark:bg-rose-950/45"
    >
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/70 dark:text-rose-300">
              <BellRing className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-rose-950 dark:text-rose-100">
                {visibleNotifications.length === 1
                  ? 'Inscriptions clôturées · Séance annulée'
                  : `Inscriptions clôturées · ${visibleNotifications.length} séances annulées`}
              </p>
              <p className="mt-0.5 text-xs text-rose-800 dark:text-rose-300">
                Inscriptions clôturées — pas d’inscrit à cette séance, séance annulée.
              </p>
            </div>
          </div>

          {visibleNotifications.length > 1 && (
            <button
              type="button"
              onClick={() =>
                onDismissAll(visibleNotifications.map((ev) => ev.id))
              }
              className="self-start rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100/60 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-rose-900/40 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Tout masquer
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {visibleNotifications.map((ev) => {
            const discStyle = getDisciplineStyle(ev.discipline, disciplines);
            const startDate = ev.startAt.toDate();
            return (
              <div
                key={ev.id}
                className="flex flex-col gap-2.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2.5 dark:border-rose-900/70 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                      Inscriptions clôturées · Séance annulée
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                    >
                      <DisciplineIcon
                        disciplineName={ev.discipline}
                        catalog={disciplines}
                        className="h-3 w-3 shrink-0"
                      />
                      {ev.discipline}
                    </span>
                    <span className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                      {ev.title}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums capitalize">
                      <CalendarClock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                      {formatFrenchDateShort(startDate)} ·{' '}
                      {formatTimeRange(startDate, ev.durationMinutes)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                      {ev.city} — {ev.location}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeEventIds?.has(ev.id) && (
                    <button
                      type="button"
                      onClick={() => onSelectEvent(ev)}
                      className="min-h-[36px] rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60 whitespace-nowrap cursor-pointer"
                    >
                      Voir la séance
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDismiss(ev.id)}
                    aria-label={`Fermer la notification pour ${ev.title}`}
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
