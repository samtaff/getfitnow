import { useState } from 'react';
import {
  Ban,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  Dumbbell,
  Footprints,
  MessageSquare,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  MemberCoachAckNotification,
  MemberNotification,
  MemberProgramNotification,
} from '../types';
import {
  formatFrenchDateShort,
  formatFrenchTime,
} from '../utils/dateAndValidation';

interface MemberNotificationsBarProps {
  notifications: MemberNotification[];
  programNotifications?: MemberProgramNotification[];
  coachAckNotifications?: MemberCoachAckNotification[];
  reviewedRegIds?: Set<string>;
  nowMs?: number;
  panelOpen: boolean;
  onClosePanel: () => void;
  onValidateSession: (registrationId: string) => Promise<void>;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onDelete: (notificationId: string) => void;
  onMarkProgramRead?: (notificationId: string) => void;
  onDeleteProgramNotification?: (notificationId: string) => void;
  onOpenProgramNotification?: (notification: MemberProgramNotification) => void;
  onMarkCoachAckRead?: (conversationId: string) => void;
  onOpenCoachAckMessage?: (ack: MemberCoachAckNotification) => void;
  onOpenMyTracking: () => void;
  onOpenReview?: (registrationId: string) => void;
}

export function MemberNotificationsBar({
  notifications,
  programNotifications = [],
  coachAckNotifications = [],
  reviewedRegIds,
  nowMs = Date.now(),
  panelOpen,
  onClosePanel,
  onValidateSession,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onMarkProgramRead,
  onDeleteProgramNotification,
  onOpenProgramNotification,
  onMarkCoachAckRead,
  onOpenCoachAckMessage,
  onOpenMyTracking,
  onOpenReview,
}: MemberNotificationsBarProps) {
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const unread = notifications.filter((n) =>
    n.type === 'event_cancelled' ? !n.read : !n.read && !n.validated
  );
  const unreadCancelled = notifications.filter(
    (n) => n.type === 'event_cancelled' && !n.read
  );
  const unvalidated = notifications.filter(
    (n) => n.type !== 'event_cancelled' && !n.validated
  );
  const unreadPrograms = programNotifications.filter((n) => !n.read);

  const itemsToShow = panelOpen ? notifications : unread;
  const programItemsToShow = panelOpen ? programNotifications : unreadPrograms;

  if (
    itemsToShow.length === 0 &&
    programItemsToShow.length === 0 &&
    coachAckNotifications.length === 0 &&
    !panelOpen
  ) {
    return null;
  }

  const isCancellationAlert =
    unreadCancelled.length > 0 &&
    unvalidated.length === 0 &&
    unreadPrograms.length === 0;
  const isProgramFocused =
    unreadPrograms.length > 0 &&
    unreadCancelled.length === 0 &&
    unvalidated.length === 0;
  const isAckFocused =
    coachAckNotifications.length > 0 &&
    unreadCancelled.length === 0 &&
    unvalidated.length === 0 &&
    unreadPrograms.length === 0;
  const hasAnyUnread =
    unread.length > 0 ||
    unreadPrograms.length > 0 ||
    coachAckNotifications.length > 0;

  const handleValidate = async (notif: MemberNotification) => {
    setErrorMsg(null);
    setValidatingId(notif.id);
    try {
      await onValidateSession(notif.registrationId);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Impossible de valider cette séance pour le moment.'
      );
    } finally {
      setValidatingId(null);
    }
  };

  let headerTitle = 'Notifications adhérent';
  let headerSubtitle =
    'Retrouvez les programmes envoyés par votre coach, les annulations et vos rappels de validation.';

  if (
    unreadPrograms.length > 0 &&
    unreadCancelled.length === 0 &&
    unvalidated.length === 0
  ) {
    headerTitle =
      unreadPrograms.length === 1
        ? unreadPrograms[0].kind === 'program_week'
          ? 'Nouvelle semaine de programme envoyée par votre coach'
          : 'Nouveau programme envoyé par votre coach'
        : `${unreadPrograms.length} nouveaux programmes envoyés par votre coach`;
    headerSubtitle =
      'Consultez votre planning personnalisé dans « Mon suivi » pour découvrir vos séances.';
  } else if (
    unreadPrograms.length > 0 &&
    (unreadCancelled.length > 0 || unvalidated.length > 0)
  ) {
    const parts: string[] = [
      `${unreadPrograms.length} programme${unreadPrograms.length > 1 ? 's' : ''} reçu${unreadPrograms.length > 1 ? 's' : ''}`,
    ];
    if (unreadCancelled.length > 0) {
      parts.push(
        `${unreadCancelled.length} annulation${unreadCancelled.length > 1 ? 's' : ''}`
      );
    }
    if (unvalidated.length > 0) {
      parts.push(
        `${unvalidated.length} séance${unvalidated.length > 1 ? 's' : ''} à valider`
      );
    }
    headerTitle = parts.join(' · ');
    headerSubtitle =
      'Votre coach vous a transmis un programme et d’autres notifications demandent votre attention.';
  } else if (unreadCancelled.length > 0 && unvalidated.length > 0) {
    headerTitle = `${unreadCancelled.length} annulation${unreadCancelled.length > 1 ? 's' : ''} et ${unvalidated.length} séance${unvalidated.length > 1 ? 's' : ''} à valider`;
    headerSubtitle =
      'Un événement auquel vous étiez inscrit a été annulé et des séances terminées attendent votre validation.';
  } else if (unreadCancelled.length > 0) {
    headerTitle =
      unreadCancelled.length === 1
        ? 'Séance annulée par l’animateur'
        : `${unreadCancelled.length} séances annulées par l’animateur`;
    headerSubtitle =
      'Votre inscription a été annulée automatiquement (et remboursée si la séance était payante).';
  } else if (isAckFocused) {
    headerTitle =
      coachAckNotifications.length === 1
        ? 'Inscription prise en compte par votre coach'
        : `${coachAckNotifications.length} confirmations d’inscription reçues`;
    headerSubtitle =
      'Votre coach a confirmé la prise en compte de votre participation à la séance.';
  } else if (unvalidated.length > 0) {
    headerTitle =
      unvalidated.length === 1
        ? 'Séance terminée : pensez à valider votre séance'
        : `${unvalidated.length} séances terminées à valider`;
    headerSubtitle =
      'Confirmez votre participation dès la fin de votre séance pour mettre à jour votre suivi.';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b ${
        isCancellationAlert
          ? 'border-rose-200 bg-rose-50/90 dark:border-rose-900/70 dark:bg-rose-950/40'
          : isProgramFocused
            ? 'border-sky-200 bg-sky-50/90 dark:border-sky-900/70 dark:bg-sky-950/35'
            : isAckFocused
              ? 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-900/70 dark:bg-emerald-950/40'
              : 'border-amber-200 bg-amber-50/90 dark:border-amber-900/70 dark:bg-amber-950/40'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                isCancellationAlert
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/70 dark:text-rose-300'
                  : isProgramFocused
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-300'
                    : isAckFocused
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-300'
              }`}
            >
              {isCancellationAlert ? (
                <Ban className="h-4 w-4" aria-hidden="true" />
              ) : isProgramFocused ? (
                <Footprints className="h-4 w-4" aria-hidden="true" />
              ) : isAckFocused ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <BellRing className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={`font-display text-sm font-bold ${
                  isCancellationAlert
                    ? 'text-rose-950 dark:text-rose-100'
                    : isProgramFocused
                      ? 'text-sky-950 dark:text-sky-100'
                      : isAckFocused
                        ? 'text-emerald-950 dark:text-emerald-100'
                        : 'text-amber-950 dark:text-amber-100'
                }`}
              >
                {headerTitle}
              </p>
              <p
                className={`mt-0.5 text-xs ${
                  isCancellationAlert
                    ? 'text-rose-900/85 dark:text-rose-200/85'
                    : isProgramFocused
                      ? 'text-sky-900/85 dark:text-sky-200/85'
                      : isAckFocused
                        ? 'text-emerald-900/85 dark:text-emerald-200/85'
                        : 'text-amber-900/80 dark:text-amber-200/85'
                }`}
              >
                {headerSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenMyTracking}
              className={`inline-flex min-h-[36px] items-center rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold dark:bg-slate-900 whitespace-nowrap cursor-pointer ${
                isCancellationAlert
                  ? 'border-rose-200 text-rose-950 hover:bg-rose-100/60 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40'
                  : isProgramFocused
                    ? 'border-sky-200 text-sky-950 hover:bg-sky-100/60 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-900/40'
                    : isAckFocused
                      ? 'border-emerald-200 text-emerald-950 hover:bg-emerald-100/60 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/40'
                      : 'border-amber-200 text-amber-950 hover:bg-amber-100/60 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40'
              }`}
            >
              Voir mon suivi
            </button>
            {hasAnyUnread && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold dark:bg-slate-900 whitespace-nowrap cursor-pointer ${
                  isCancellationAlert
                    ? 'border-rose-200 text-rose-950 hover:bg-rose-100/60 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40'
                    : isProgramFocused
                      ? 'border-sky-200 text-sky-950 hover:bg-sky-100/60 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-900/40'
                      : isAckFocused
                        ? 'border-emerald-200 text-emerald-950 hover:bg-emerald-100/60 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/40'
                        : 'border-amber-200 text-amber-950 hover:bg-amber-100/60 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40'
                }`}
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
                className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
            {errorMsg}
          </div>
        )}

        {itemsToShow.length === 0 &&
        programItemsToShow.length === 0 &&
        coachAckNotifications.length === 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200/80 bg-white px-4 py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Aucune notification pour le moment.
          </div>
        ) : (
          <div className="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-0.5">
            {coachAckNotifications.map((ack) => (
              <div
                key={ack.id}
                className="flex flex-col gap-2.5 rounded-lg border border-emerald-300 bg-white px-3.5 py-2.5 shadow-2xs dark:border-emerald-700/70 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      Inscription prise en compte
                    </span>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Coach : {ack.coachName}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {ack.messageText}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onOpenCoachAckMessage && (
                    <button
                      type="button"
                      onClick={() => onOpenCoachAckMessage(ack)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      Voir le message
                    </button>
                  )}
                  {onMarkCoachAckRead && (
                    <button
                      type="button"
                      onClick={() => onMarkCoachAckRead(ack.conversationId)}
                      title="Marquer comme lu"
                      aria-label={`Marquer comme lue la confirmation de ${ack.coachName}`}
                      className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {programItemsToShow.map((pNotif) => {
              const badgeLabel =
                pNotif.kind === 'program_week'
                  ? `Semaine ${pNotif.weekNumber ?? 2} envoyée`
                  : pNotif.kind === 'custom_program'
                    ? 'Séance personnalisée'
                    : 'Nouveau programme';

              return (
                <div
                  key={pNotif.id}
                  className={`flex flex-col gap-2.5 rounded-lg border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
                    pNotif.read
                      ? 'border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80'
                      : 'border-sky-300 bg-white shadow-2xs dark:border-sky-700/80 dark:bg-slate-900'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${
                          pNotif.read
                            ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200'
                        }`}
                      >
                        {pNotif.kind === 'program_week' ? (
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                        ) : pNotif.kind === 'custom_program' ? (
                          <Dumbbell className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <Footprints className="h-3 w-3" aria-hidden="true" />
                        )}
                        {badgeLabel}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {pNotif.title}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums capitalize">
                        <CalendarClock
                          className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
                          aria-hidden="true"
                        />
                        Début {formatFrenchDateShort(pNotif.startDate)}
                      </span>
                      <span>Envoyé par {pNotif.coachName}</span>
                      <span className="text-sky-900 dark:text-sky-300 font-medium">
                        {pNotif.summary}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenProgramNotification) {
                          onOpenProgramNotification(pNotif);
                        } else {
                          onOpenMyTracking();
                        }
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 whitespace-nowrap cursor-pointer"
                    >
                      <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
                      {pNotif.requiresPayment
                        ? 'Voir et régler'
                        : 'Voir mon programme'}
                    </button>

                    {!pNotif.read && onMarkProgramRead && (
                      <button
                        type="button"
                        onClick={() => onMarkProgramRead(pNotif.id)}
                        title="Marquer comme lu"
                        aria-label={`Marquer comme lue la notification pour ${pNotif.title}`}
                        className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}

                    {onDeleteProgramNotification && (
                      <button
                        type="button"
                        onClick={() => onDeleteProgramNotification(pNotif.id)}
                        title="Masquer la notification"
                        aria-label={`Masquer la notification pour ${pNotif.title}`}
                        className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {itemsToShow.map((notif) => {
              const startDate = notif.eventStartAt.toDate();
              const endDate = notif.eventEndAt.toDate();
              const isBusy = validatingId === notif.id;
              const isCancelledNotif = notif.type === 'event_cancelled';

              return (
                <div
                  key={notif.id}
                  className={`flex flex-col gap-2.5 rounded-lg border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
                    isCancelledNotif
                      ? notif.read
                        ? 'border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80'
                        : 'border-rose-300 bg-white shadow-2xs dark:border-rose-700/70 dark:bg-slate-900'
                      : notif.validated || notif.read
                        ? 'border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80'
                        : 'border-amber-300 bg-white shadow-2xs dark:border-amber-700/70 dark:bg-slate-900'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCancelledNotif ? (
                        <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                          <Ban className="h-3 w-3" aria-hidden="true" />
                          Séance annulée
                        </span>
                      ) : notif.validated ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Séance validée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          À valider
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {notif.eventTitle}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums capitalize">
                        <CalendarClock
                          className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
                          aria-hidden="true"
                        />
                        {formatFrenchDateShort(startDate)} ·{' '}
                        {formatFrenchTime(startDate)} –{' '}
                        {formatFrenchTime(endDate)}
                      </span>
                      {isCancelledNotif ? (
                        <span className="text-rose-800 dark:text-rose-300 font-medium">
                          Annulée par l’animateur
                          {notif.coachName ? ` (${notif.coachName})` : ''} · Votre
                          inscription a été annulée
                          {notif.wasPaid
                            ? ' et le remboursement a été enregistré.'
                            : '.'}
                        </span>
                      ) : (
                        !notif.validated && (
                          <span className="text-amber-800 dark:text-amber-300 font-medium">
                            Pensez à valider la séance que vous venez d’effectuer.
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isCancelledNotif && !notif.validated && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleValidate(notif)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {isBusy ? 'Validation...' : 'Valider ma séance'}
                      </button>
                    )}

                    {!isCancelledNotif &&
                      notif.validated &&
                      notif.eventEndAt.toMillis() <= nowMs &&
                      onOpenReview &&
                      !reviewedRegIds?.has(notif.registrationId) && (
                        <button
                          type="button"
                          onClick={() => onOpenReview(notif.registrationId)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/50 whitespace-nowrap cursor-pointer"
                        >
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          Donner mon avis
                        </button>
                      )}

                    {isCancelledNotif && !notif.read && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(notif.id)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-rose-950/50 whitespace-nowrap cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Marquer comme lu
                      </button>
                    )}

                    {!isCancelledNotif && !notif.read && !notif.validated && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(notif.id)}
                        title="Marquer comme lu"
                        aria-label={`Marquer comme lue la notification pour ${notif.eventTitle}`}
                        className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onDelete(notif.id)}
                      title="Supprimer la notification"
                      aria-label={`Supprimer la notification pour ${notif.eventTitle}`}
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
      </div>
    </div>
  );
}
