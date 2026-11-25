import { useState } from 'react';
import {
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { CoachNotification, SportEvent } from '../types';
import {
  formatFrenchDateShort,
  formatFrenchTime,
} from '../utils/dateAndValidation';

interface CoachNotificationsBarProps {
  notifications: CoachNotification[];
  events: SportEvent[];
  panelOpen: boolean;
  onClosePanel: () => void;
  onMarkRead: (notificationId: string) => void;
  onAcknowledgeNotification?: (
    notification: CoachNotification
  ) => Promise<{ sent: boolean; messageText: string }>;
  onMarkAllRead: () => void;
  onDelete: (notificationId: string) => void;
  onOpenEventRoster: (eventId: string) => void;
}

export function CoachNotificationsBar({
  notifications,
  events,
  panelOpen,
  onClosePanel,
  onMarkRead,
  onAcknowledgeNotification,
  onMarkAllRead,
  onDelete,
  onOpenEventRoster,
}: CoachNotificationsBarProps) {
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const unread = notifications.filter((n) => !n.read);
  const itemsToShow = panelOpen ? notifications : unread;

  if (itemsToShow.length === 0 && !panelOpen && !feedback) {
    return null;
  }

  const activeEventIds = new Set(events.map((e) => e.id));

  const handleAcknowledgeClick = async (notif: CoachNotification) => {
    setFeedback(null);
    if (!onAcknowledgeNotification) {
      onMarkRead(notif.id);
      return;
    }
    setAcknowledgingId(notif.id);
    try {
      const result = await onAcknowledgeNotification(notif);
      setFeedback({
        type: 'success',
        text: result.sent
          ? `Notification envoyée à ${notif.memberName} : « ${result.messageText} »`
          : `Inscription de ${notif.memberName} marquée comme lue.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’envoyer la notification à l’adhérent.',
      });
    } finally {
      setAcknowledgingId(null);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-emerald-200 bg-emerald-50/90 dark:border-emerald-900/70 dark:bg-emerald-950/50"
    >
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-300">
              <Bell className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold text-emerald-950 dark:text-emerald-100">
                {unread.length > 0
                  ? unread.length === 1
                    ? '1 nouvelle inscription sur votre événement'
                    : `${unread.length} nouvelles inscriptions sur vos événements`
                  : 'Notifications d’inscription'}
              </p>
              <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300/90">
                Vous êtes notifié en temps réel à chaque nouvelle réservation d’adhérent sur vos séances.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {unread.length > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100/60 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-900/40 whitespace-nowrap cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Tout marquer comme lu
              </button>
            )}
            {panelOpen && (
              <button
                type="button"
                onClick={onClosePanel}
                aria-label="Fermer le panneau des notifications"
                className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-emerald-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {itemsToShow.length === 0 ? (
          <div className="mt-3 rounded-lg border border-emerald-200/80 bg-white px-4 py-4 text-center text-xs text-slate-500 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-slate-400">
            Aucune notification d’inscription pour le moment.
          </div>
        ) : (
          <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-0.5">
            {itemsToShow.map((notif) => {
              const eventDate = notif.eventStartAt.toDate();
              const eventStillActive = activeEventIds.has(notif.eventId);
              return (
                <div
                  key={notif.id}
                  className={`flex flex-col gap-2.5 rounded-lg border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
                    notif.read
                      ? 'border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80'
                      : 'border-emerald-300 bg-white shadow-2xs dark:border-emerald-700/70 dark:bg-slate-900'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!notif.read && (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <UserPlus className="h-3 w-3" aria-hidden="true" />
                          Nouvel inscrit
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {notif.memberName}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        ({notif.memberEmail})
                      </span>
                      {notif.invitedByName && (
                        <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                          Invité par {notif.invitedByName}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        Séance : {notif.eventTitle}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums capitalize">
                        <CalendarClock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        {formatFrenchDateShort(eventDate)} à{' '}
                        {formatFrenchTime(eventDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {eventStillActive && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!notif.read) onMarkRead(notif.id);
                          onOpenEventRoster(notif.eventId);
                        }}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 whitespace-nowrap cursor-pointer"
                      >
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        Voir les inscrits
                      </button>
                    )}

                    {!notif.read && (
                      <button
                        type="button"
                        disabled={acknowledgingId === notif.id}
                        onClick={() => void handleAcknowledgeClick(notif)}
                        title="Marquer comme lu et notifier l’adhérent"
                        aria-label={`Marquer comme lue la notification de ${notif.memberName} et notifier l’adhérent`}
                        className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onDelete(notif.id)}
                      title="Supprimer la notification"
                      aria-label={`Supprimer la notification de ${notif.memberName}`}
                      className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {feedback && (
          <div
            className={`mt-2.5 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
              feedback.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                : 'border-emerald-200 bg-white text-emerald-900 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Fermer le message de confirmation"
              className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
