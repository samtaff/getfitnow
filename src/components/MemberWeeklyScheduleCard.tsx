import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  BellRing,
  BookOpen,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  CreditCard,
  Dumbbell,
  ExternalLink,
  Footprints,
  Gauge,
  Lock,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Receipt,
  SlidersHorizontal,
  Target,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CoachDirectoryEntry,
  DisciplineItem,
  EventPaymentMode,
  ExerciseLibraryItem,
  MemberScheduleSession,
  Registration,
  SportEvent,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';
import {
  createMemberScheduleSession,
  deleteMemberScheduleSession,
  isInternalScheduleOverride,
  payMemberScheduleSession,
  payTrainingProgram,
  toggleMemberScheduleCompleted,
  toggleTrainingProgramSessionCompleted,
  updateMemberScheduleSession,
} from '../services/firestoreService';
import {
  evaluateEventBooking,
  formatFrenchDateLong,
  formatFrenchDateShort,
  formatFrenchTime,
  formatPriceEuros,
  formatTimeRange,
  getEventCoachNames,
  getWeekDays,
  isSameCalendarDay,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '../utils/dateAndValidation';
import {
  getDisciplineIconKey,
  getDisciplineStyle,
} from '../utils/disciplineColors';
import {
  getCoachCustomSessionPriceCents,
  getCoachPricingItems,
  hasAnyCoachPricing,
  hasCoachCustomSessionPrice,
} from '../utils/coachPricingHelpers';
import { ProfileAvatar } from './ProfileAvatar';
import {
  formatExerciseParamsSummary,
  getExerciseCategoryMeta,
} from '../utils/exerciseLibrary';
import {
  GeneratedProgramSession,
  generateRunningProgramSessions,
  getProgramDeliveryProgress,
  ProgramDeliveryProgress,
  RUNNING_DISTANCE_TEMPLATES,
} from '../utils/runningProgramGenerator';
import { DisciplineIcon } from './DisciplineIcon';
import { ProgramBuilderModal } from './ProgramBuilderModal';
import { PayableProgramTarget, ProgramPaymentModal } from './ProgramPaymentModal';
import { RunningProgramBuilderModal } from './RunningProgramBuilderModal';
import { RunningSessionEditorModal } from './RunningSessionEditorModal';
import { VmaTestModal } from './VmaTestModal';

interface MemberWeeklyScheduleCardProps {
  mode: 'member' | 'coach';
  memberEmail: string;
  memberName: string;
  memberGoal?: string;
  memberFitnessLevel?: string;
  currentUserUid: string;
  currentCoachName?: string;
  isPrimaryCoach?: boolean;
  customSessions: MemberScheduleSession[];
  trainingPrograms?: TrainingProgram[];
  registrations: Registration[];
  events: SportEvent[];
  disciplines: DisciplineItem[];
  exercises?: ExerciseLibraryItem[];
  coachDirectory?: CoachDirectoryEntry[];
  nowMs: number;
  compact?: boolean;
  defaultExpanded?: boolean;
  onSelectEvent?: (event: SportEvent) => void;
  onRequestCoachProgram?: (coach?: CoachDirectoryEntry) => void;
}

type ScheduleFilter = 'all' | 'custom' | 'events' | 'programs';

interface WeeklyScheduleEntry {
  id: string;
  kind: 'event' | 'custom' | 'program';
  startDate: Date;
  durationMinutes: number;
  title: string;
  discipline: string;
  location: string;
  coachName: string;
  notes: string;
  attendedOrCompleted: boolean;
  isPast: boolean;
  matchedEvent?: SportEvent | null;
  registration?: Registration;
  customSession?: MemberScheduleSession;
  program?: TrainingProgram;
  programSession?: GeneratedProgramSession;
}

const DURATION_PRESETS = [30, 45, 60, 75, 90, 120];

function getIsoWeekNumber(date: Date): number {
  const temp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatScheduleErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const msg = err.message.trim();
    if (msg.startsWith('{')) {
      try {
        const parsed = JSON.parse(msg) as { error?: string };
        if (parsed.error?.toLowerCase().includes('permission')) {
          return 'Autorisation refusée pour enregistrer cette séance. Vérifiez que vous êtes bien connecté avec votre compte adhérent et réessayez.';
        }
        if (parsed.error) return parsed.error;
      } catch {
        return msg || fallback;
      }
    }
    return msg || fallback;
  }
  return fallback;
}

export function MemberWeeklyScheduleCard({
  mode,
  memberEmail,
  memberName,
  memberGoal = '',
  memberFitnessLevel = '',
  currentUserUid,
  currentCoachName = '',
  isPrimaryCoach = false,
  customSessions,
  trainingPrograms = [],
  registrations,
  events,
  disciplines,
  exercises = [],
  coachDirectory = [],
  nowMs,
  compact = false,
  defaultExpanded = true,
  onSelectEvent,
  onRequestCoachProgram,
}: MemberWeeklyScheduleCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const [compactSelectedDayIso, setCompactSelectedDayIso] = useState<
    string | 'all'
  >('all');

  const formContainerRef = useRef<HTMLFormElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Form modal/inline state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSession, setEditingSession] =
    useState<MemberScheduleSession | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDiscipline, setFormDiscipline] = useState(
    disciplines[0]?.name || 'Renforcement'
  );
  const [formDate, setFormDate] = useState(() =>
    toLocalDateInputValue(new Date())
  );
  const [formTime, setFormTime] = useState('18:00');
  const [formDuration, setFormDuration] = useState<number>(60);
  const [formLocation, setFormLocation] = useState('');
  const [formCoachUid, setFormCoachUid] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsPaid, setFormIsPaid] = useState(false);
  const [formPriceEuros, setFormPriceEuros] = useState('9.00');
  const [formPriceTouched, setFormPriceTouched] = useState(false);
  const [formPaymentMode, setFormPaymentMode] =
    useState<EventPaymentMode>('both');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [coachPricingModalOpen, setCoachPricingModalOpen] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [programBuilderState, setProgramBuilderState] = useState<{
    open: boolean;
    editingSession: MemberScheduleSession | null;
  }>({ open: false, editingSession: null });
  const [runningProgramModalOpen, setRunningProgramModalOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] =
    useState<PayableProgramTarget | null>(null);
  const [vmaTestProgram, setVmaTestProgram] = useState<TrainingProgram | null>(
    null
  );
  const [editingProgramSessionTarget, setEditingProgramSessionTarget] =
    useState<{ programId: string; sessionKey: string } | null>(null);
  const [payingItemId, setPayingItemId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [ackVersion, setAckVersion] = useState(0);

  const memberEmailLower = memberEmail.trim().toLowerCase();
  const weekDays = useMemo(() => getWeekDays(weekAnchor), [weekAnchor]);
  const weekStartMs = weekDays[0].getTime();
  const weekEndMs = new Date(
    weekDays[6].getFullYear(),
    weekDays[6].getMonth(),
    weekDays[6].getDate(),
    23,
    59,
    59,
    999
  ).getTime();
  const weekNumber = useMemo(
    () => getIsoWeekNumber(weekDays[0]),
    [weekDays]
  );

  const today = useMemo(() => new Date(nowMs), [nowMs]);

  const eventsById = useMemo(
    () => new Map(events.map((ev) => [ev.id, ev])),
    [events]
  );

  const coachByUid = useMemo(
    () => new Map(coachDirectory.map((c) => [c.uid, c])),
    [coachDirectory]
  );

  const disciplineOptions = useMemo(() => {
    const names = disciplines.map((d) => d.name);
    if (names.length === 0) {
      return ['Renforcement', 'Course à pied', 'HIIT', 'Mobilité', 'Cardio'];
    }
    if (formDiscipline && !names.includes(formDiscipline)) {
      return [formDiscipline, ...names];
    }
    return names;
  }, [disciplines, formDiscipline]);

  // Self-registered confirmed events for this member
  const selfRegisteredEntries = useMemo<WeeklyScheduleEntry[]>(() => {
    if (!memberEmailLower) return [];
    const list: WeeklyScheduleEntry[] = [];

    registrations.forEach((reg) => {
      if (reg.status !== 'confirmed') return;
      if (reg.isGuest) return;
      if (reg.email.trim().toLowerCase() !== memberEmailLower) return;

      const matchedEvent = eventsById.get(reg.eventId) ?? null;
      if (matchedEvent) {
        const evalInfo = evaluateEventBooking(matchedEvent, nowMs);
        if (
          matchedEvent.status === 'cancelled' ||
          evalInfo.isAutoCancelledNoRegistrants
        ) {
          return;
        }
      }

      const startDate = reg.eventStartAt.toDate();
      const durationMinutes =
        matchedEvent?.durationMinutes ?? reg.eventDurationMinutes ?? 60;
      const endMs = startDate.getTime() + durationMinutes * 60 * 1000;

      list.push({
        id: `event-${reg.id}`,
        kind: 'event',
        startDate,
        durationMinutes,
        title: matchedEvent?.title || reg.eventTitle,
        discipline: matchedEvent?.discipline || 'Événement',
        location: matchedEvent
          ? [matchedEvent.location, matchedEvent.city]
              .filter(Boolean)
              .join(' · ')
          : '',
        coachName: matchedEvent
          ? getEventCoachNames(matchedEvent).join(', ')
          : '',
        notes: matchedEvent?.description || '',
        attendedOrCompleted: Boolean(reg.attended),
        isPast: nowMs >= endMs,
        matchedEvent,
        registration: reg,
      });
    });

    return list;
  }, [registrations, memberEmailLower, eventsById, nowMs]);

  const customEntries = useMemo<WeeklyScheduleEntry[]>(() => {
    return customSessions
      .filter((session) => !isInternalScheduleOverride(session))
      .map((session) => {
      const startDate = session.startAt.toDate();
      const endMs = startDate.getTime() + session.durationMinutes * 60 * 1000;
      return {
        id: `custom-${session.id}`,
        kind: 'custom',
        startDate,
        durationMinutes: session.durationMinutes,
        title: session.title,
        discipline: session.discipline,
        location: session.location,
        coachName: session.coachName,
        notes: session.notes,
        attendedOrCompleted: Boolean(session.completed),
        isPast: nowMs >= endMs,
        customSession: session,
      };
    });
  }, [customSessions, nowMs]);

  const memberPrograms = useMemo(() => {
    if (!memberEmailLower || trainingPrograms.length === 0) return [];
    return trainingPrograms.filter(
      (prog) =>
        prog.memberEmail.trim().toLowerCase() === memberEmailLower ||
        prog.memberEmailKey === memberEmailLower
    );
  }, [trainingPrograms, memberEmailLower]);

  const deliveryByProgramId = useMemo(() => {
    const map = new Map<string, ProgramDeliveryProgress>();
    memberPrograms.forEach((prog) => {
      map.set(prog.id, getProgramDeliveryProgress(prog, nowMs));
    });
    return map;
  }, [memberPrograms, nowMs]);

  const ackStoragePrefix = `gfn_prog_week_ack_${currentUserUid || memberEmailLower || 'anon'}_`;

  const getAcknowledgedWeek = (programId: string): number => {
    try {
      const raw = window.localStorage.getItem(`${ackStoragePrefix}${programId}`);
      const parsed = raw ? Number(raw) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  };

  const acknowledgeProgramWeek = (programId: string, weekNumber: number) => {
    try {
      window.localStorage.setItem(
        `${ackStoragePrefix}${programId}`,
        String(weekNumber)
      );
    } catch {
      // Ignore storage failures in restricted contexts
    }
    setAckVersion((v) => v + 1);
  };

  const newlySentProgramAlerts = useMemo(() => {
    if (mode !== 'member' || memberPrograms.length === 0) return [];
    void ackVersion;
    return memberPrograms
      .map((prog) => {
        const delivery = deliveryByProgramId.get(prog.id);
        if (!delivery || !delivery.hasAccess || delivery.unlockedWeeks < 1) {
          return null;
        }
        const acked = getAcknowledgedWeek(prog.id);
        if (delivery.unlockedWeeks <= acked) return null;
        const unlockedWeekWindow =
          delivery.weeks[delivery.unlockedWeeks - 1] ?? delivery.weeks[0];
        return {
          program: prog,
          delivery,
          unlockedWeekWindow,
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [mode, memberPrograms, deliveryByProgramId, ackVersion, ackStoragePrefix]);

  const upcomingLockedWeeksInView = useMemo(() => {
    if (mode !== 'member' || memberPrograms.length === 0) return [];
    const alerts: {
      program: TrainingProgram;
      delivery: ProgramDeliveryProgress;
      weekNumber: number;
      unlockAtMs: number;
    }[] = [];
    memberPrograms.forEach((prog) => {
      const delivery = deliveryByProgramId.get(prog.id);
      if (!delivery) return;
      const lockedMatchingWeek = delivery.weeks.find((wk) => {
        if (wk.unlocked) return false;
        if (!delivery.hasAccess && wk.weekNumber === 1) return false;
        return wk.lastSessionDate.getTime() >= weekStartMs && wk.firstSessionDate.getTime() <= weekEndMs;
      });
      if (lockedMatchingWeek) {
        alerts.push({
          program: prog,
          delivery,
          weekNumber: lockedMatchingWeek.weekNumber,
          unlockAtMs: lockedMatchingWeek.unlockAtMs,
        });
      }
    });
    return alerts;
  }, [mode, memberPrograms, deliveryByProgramId, weekStartMs, weekEndMs]);

  const programEntries = useMemo<WeeklyScheduleEntry[]>(() => {
    if (memberPrograms.length === 0) return [];
    const list: WeeklyScheduleEntry[] = [];
    memberPrograms.forEach((prog) => {
      const delivery = deliveryByProgramId.get(prog.id);
      const generated = generateRunningProgramSessions(prog);
      generated.forEach((gs) => {
        if (mode === 'member' && delivery) {
          if (!delivery.hasAccess) {
            if (!gs.isVmaTest) return;
          } else if (gs.weekNumber > delivery.unlockedWeeks) {
            return;
          }
        }
        const endMs =
          gs.scheduledDate.getTime() + gs.durationMinutes * 60 * 1000;
        list.push({
          id: `program-${prog.id}-${gs.key}`,
          kind: 'program',
          startDate: gs.scheduledDate,
          durationMinutes: gs.durationMinutes,
          title: gs.title,
          discipline: gs.discipline,
          location: gs.targetPaceLabel,
          coachName: prog.coachName,
          notes: gs.coachNotes,
          attendedOrCompleted: gs.completed,
          isPast: nowMs >= endMs,
          program: prog,
          programSession: gs,
        });
      });
    });
    return list;
  }, [memberPrograms, deliveryByProgramId, mode, nowMs]);

  const allEntries = useMemo(() => {
    const combined = [
      ...selfRegisteredEntries,
      ...customEntries,
      ...programEntries,
    ];
    combined.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return combined;
  }, [selfRegisteredEntries, customEntries, programEntries]);

  const weekEntries = useMemo(() => {
    return allEntries.filter((item) => {
      const ms = item.startDate.getTime();
      if (ms < weekStartMs || ms > weekEndMs) return false;
      if (filter === 'custom' && item.kind !== 'custom') return false;
      if (filter === 'events' && item.kind !== 'event') return false;
      if (filter === 'programs' && item.kind !== 'program') return false;
      return true;
    });
  }, [allEntries, weekStartMs, weekEndMs, filter]);

  const weekCounts = useMemo(() => {
    const inWeekAll = allEntries.filter((item) => {
      const ms = item.startDate.getTime();
      return ms >= weekStartMs && ms <= weekEndMs;
    });
    return {
      total: inWeekAll.length,
      events: inWeekAll.filter((i) => i.kind === 'event').length,
      custom: inWeekAll.filter((i) => i.kind === 'custom').length,
      programs: inWeekAll.filter((i) => i.kind === 'program').length,
    };
  }, [allEntries, weekStartMs, weekEndMs]);

  const entriesByDayIso = useMemo(() => {
    const map = new Map<string, WeeklyScheduleEntry[]>();
    weekDays.forEach((d) => map.set(toLocalDateInputValue(d), []));
    weekEntries.forEach((entry) => {
      const key = toLocalDateInputValue(entry.startDate);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    });
    return map;
  }, [weekDays, weekEntries]);

  const weekRangeLabel = useMemo(() => {
    const startLabel = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
    }).format(weekDays[0]);
    const endLabel = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(weekDays[6]);
    return `${startLabel} – ${endLabel}`;
  }, [weekDays]);

  const focusInlineForm = () => {
    window.setTimeout(() => {
      formContainerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      titleInputRef.current?.focus({ preventScroll: true });
    }, 60);
  };

  const openCreateForm = (targetDate?: Date) => {
    if (mode !== 'coach') return;
    setActionFeedback(null);
    setFormError(null);
    setEditingSession(null);
    setFormTitle('');
    setFormDiscipline(disciplines[0]?.name || 'Renforcement');
    setFormDate(toLocalDateInputValue(targetDate ?? new Date()));
    setFormTime('18:00');
    setFormDuration(60);
    setFormLocation('');
    setFormCoachUid(currentUserUid);
    setFormNotes('');
    setFormIsPaid(false);
    const defaultCoachPricing = coachByUid.get(currentUserUid)?.pricing;
    setFormPriceEuros(
      (getCoachCustomSessionPriceCents(defaultCoachPricing) / 100).toFixed(2)
    );
    setFormPriceTouched(false);
    setFormPaymentMode('both');
    setIsFormOpen(true);
    setExpanded(true);
    focusInlineForm();
  };

  const openEditForm = (session: MemberScheduleSession) => {
    if (mode !== 'coach') return;
    setActionFeedback(null);
    setFormError(null);
    if (
      (session.exercises && session.exercises.length > 0) ||
      Boolean(session.objective)
    ) {
      setIsFormOpen(false);
      setEditingSession(null);
      setProgramBuilderState({ open: true, editingSession: session });
      setExpanded(true);
      return;
    }
    setEditingSession(session);
    const d = session.startAt.toDate();
    setFormTitle(session.title);
    setFormDiscipline(session.discipline);
    setFormDate(toLocalDateInputValue(d));
    setFormTime(toLocalTimeInputValue(d));
    setFormDuration(session.durationMinutes);
    setFormLocation(session.location || '');
    setFormCoachUid(session.coachUid || '');
    setFormNotes(session.notes || '');
    setFormIsPaid(Boolean(session.isPaid));
    setFormPriceEuros(
      session.priceCents && session.priceCents >= 100
        ? (session.priceCents / 100).toFixed(2)
        : '9.00'
    );
    setFormPriceTouched(true);
    setFormPaymentMode(session.paymentMode ?? 'both');
    setIsFormOpen(true);
    setExpanded(true);
    focusInlineForm();
  };

  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (mode !== 'coach') {
      setFormError('Seul un coach peut ajouter ou modifier une séance.');
      return;
    }
    setFormError(null);
    setActionFeedback(null);

    if (!memberEmailLower) {
      setFormError(
        'Votre adresse email de compte est introuvable pour enregistrer cette séance.'
      );
      return;
    }

    if (!formDate || !formTime) {
      setFormError('Veuillez renseigner la date et l’heure de la séance.');
      return;
    }

    const [yStr, mStr, dStr] = formDate.split('-');
    const [hhStr, mmStr] = formTime.split(':');
    const startDate = new Date(
      Number(yStr),
      Number(mStr) - 1,
      Number(dStr),
      Number(hhStr),
      Number(mmStr),
      0,
      0
    );

    if (Number.isNaN(startDate.getTime())) {
      setFormError('Date ou heure invalide.');
      return;
    }

    let resolvedPriceCents = 0;
    if (formIsPaid) {
      const parsedPrice = Number(formPriceEuros.replace(',', '.'));
      if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
        setFormError(
          'Pour une séance payante, saisissez un tarif d’au moins 1,00 € (ou choisissez « Offert / gratuit »).'
        );
        return;
      }
      resolvedPriceCents = Math.min(
        VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS,
        Math.round(parsedPrice * 100)
      );
    }

    const selectedCoach = formCoachUid ? coachByUid.get(formCoachUid) : null;
    const resolvedCoachUid = formCoachUid.trim();
    const resolvedCoachName =
      selectedCoach?.displayName ||
      (mode === 'coach' && resolvedCoachUid === currentUserUid
        ? currentCoachName
        : editingSession?.coachUid === resolvedCoachUid
          ? editingSession.coachName
          : '');

    setFormSaving(true);
    try {
      if (editingSession) {
        const switchedToPaid = !editingSession.isPaid && formIsPaid;
        await updateMemberScheduleSession(editingSession.id, {
          title: formTitle,
          discipline: formDiscipline,
          notes: formNotes,
          location: formLocation,
          startDate,
          durationMinutes: formDuration,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          isPaid: formIsPaid,
          priceCents: resolvedPriceCents,
          paymentMode: formPaymentMode,
          ...(switchedToPaid
            ? { paymentStatus: 'pending' as const, paymentMethod: 'onsite' as const }
            : {}),
          completed: editingSession.completed,
        });
        setActionFeedback({
          type: 'success',
          text: 'Séance personnalisée mise à jour.',
        });
      } else {
        await createMemberScheduleSession({
          memberEmail,
          memberName,
          title: formTitle,
          discipline: formDiscipline,
          notes: formNotes,
          location: formLocation,
          startDate,
          durationMinutes: formDuration,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          isPaid: formIsPaid,
          priceCents: resolvedPriceCents,
          paymentMode: formPaymentMode,
          createdByUid: currentUserUid,
          createdByRole: mode,
        });
        setWeekAnchor(startDate);
        if (filter !== 'all' && filter !== 'custom') {
          setFilter('all');
        }
        if (compact && compactSelectedDayIso !== 'all') {
          setCompactSelectedDayIso(toLocalDateInputValue(startDate));
        }
        setActionFeedback({
          type: 'success',
          text: formIsPaid
            ? `Séance payante (${formatPriceEuros(resolvedPriceCents)}) ajoutée au planning.`
            : 'Séance offerte ajoutée au planning hebdomadaire.',
        });
      }
      setIsFormOpen(false);
      setEditingSession(null);
    } catch (err) {
      setFormError(
        formatScheduleErrorMessage(err, 'Impossible d’enregistrer cette séance.')
      );
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleCompleted = async (session: MemberScheduleSession) => {
    if (
      mode === 'member' &&
      session.createdByRole === 'coach' &&
      session.isPaid &&
      session.paymentStatus !== 'paid'
    ) {
      setPaymentTarget({ kind: 'session', session });
      return;
    }
    setActionFeedback(null);
    setTogglingId(session.id);
    try {
      await toggleMemberScheduleCompleted(session.id, !session.completed);
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: formatScheduleErrorMessage(
          err,
          'Impossible de mettre à jour le statut de la séance.'
        ),
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleProgramSessionCompleted = async (
    program: TrainingProgram,
    sessionKey: string,
    currentlyCompleted: boolean
  ) => {
    const isFree = !program.isPaid || program.paymentStatus === 'free';
    if (mode === 'member' && !isFree && program.paymentStatus !== 'paid') {
      setPaymentTarget({ kind: 'program', program });
      return;
    }
    const idKey = `program-${program.id}-${sessionKey}`;
    setActionFeedback(null);
    setTogglingId(idKey);
    try {
      await toggleTrainingProgramSessionCompleted(
        program,
        sessionKey,
        !currentlyCompleted
      );
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: formatScheduleErrorMessage(
          err,
          'Impossible de mettre à jour cette séance du programme.'
        ),
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleCoachMarkSessionPaid = async (session: MemberScheduleSession) => {
    setActionFeedback(null);
    setPayingItemId(`custom-${session.id}`);
    try {
      await payMemberScheduleSession({
        session,
        method: 'onsite',
        isCoach: true,
      });
      setActionFeedback({
        type: 'success',
        text: `Paiement confirmé pour « ${session.title} ».`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de confirmer le paiement.',
      });
    } finally {
      setPayingItemId(null);
    }
  };

  const handleCoachMarkProgramPaid = async (program: TrainingProgram) => {
    setActionFeedback(null);
    setPayingItemId(`program-${program.id}`);
    try {
      await payTrainingProgram({
        program,
        method: 'onsite',
        isCoach: true,
      });
      setActionFeedback({
        type: 'success',
        text: `Paiement confirmé pour « ${program.title} ». La Semaine 1 vient d’être envoyée à l’adhérent (les semaines suivantes seront envoyées à la fin de chaque semaine) et le test VMA du Jour 1 est débloqué.`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de confirmer le paiement du programme.',
      });
    } finally {
      setPayingItemId(null);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (mode !== 'coach') return;
    setActionFeedback(null);
    setDeletingId(sessionId);
    try {
      await deleteMemberScheduleSession(sessionId);
      setConfirmDeleteId(null);
      setActionFeedback({
        type: 'success',
        text: 'Séance retirée du planning personnalisé.',
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: formatScheduleErrorMessage(
          err,
          'Impossible de supprimer cette séance.'
        ),
      });
    } finally {
      setDeletingId(null);
    }
  };

  const renderEntryCard = (entry: WeeklyScheduleEntry, inDrawerCompact = false) => {
    const style = getDisciplineStyle(entry.discipline, disciplines);
    const iconKey = getDisciplineIconKey(entry.discipline, disciplines);
    const isEvent = entry.kind === 'event';
    const isProgram = entry.kind === 'program';
    const session = entry.customSession;
    const prog = entry.program;
    const progSession = entry.programSession;

    if (isProgram && prog && progSession) {
      const tpl = RUNNING_DISTANCE_TEMPLATES[prog.distance];
      const isFreeProgram = !prog.isPaid || prog.paymentStatus === 'free';
      const isPaid = prog.paymentStatus === 'paid';
      const hasAccess = isFreeProgram || isPaid;
      const isLockedForMember = mode === 'member' && !hasAccess;
      const canToggle = hasAccess || mode === 'coach';

      return (
        <div
          key={entry.id}
          className={`rounded-lg border p-2.5 text-xs transition-colors ${
            progSession.isVmaTest
              ? 'border-sky-300 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/30'
              : 'border-sky-200/90 bg-white dark:border-sky-900/60 dark:bg-slate-900/90'
          } ${entry.attendedOrCompleted ? 'opacity-85' : ''}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Footprints
                className="h-3.5 w-3.5 shrink-0 text-sky-700 dark:text-sky-400"
                aria-hidden="true"
              />
              <span className="truncate font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                {formatTimeRange(entry.startDate, entry.durationMinutes)}
              </span>
            </div>

            {canToggle ? (
              <button
                type="button"
                disabled={togglingId === entry.id}
                onClick={() =>
                  void handleToggleProgramSessionCompleted(
                    prog,
                    progSession.key,
                    progSession.completed
                  )
                }
                title={
                  progSession.completed
                    ? 'Marquer comme à faire'
                    : 'Marquer comme effectuée'
                }
                aria-label={
                  progSession.completed
                    ? `Marquer ${progSession.title} comme à faire`
                    : `Marquer ${progSession.title} comme terminée`
                }
                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap cursor-pointer ${
                  progSession.completed
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                {progSession.completed ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Circle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {inDrawerCompact && (
                  <span>{progSession.completed ? 'Terminée' : 'À faire'}</span>
                )}
              </button>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                <Lock className="h-3 w-3" aria-hidden="true" />
                {formatPriceEuros(prog.priceCents)}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
            <p className="font-mono text-[10px] font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
              Plan {tpl.shortLabel} ·{' '}
              {progSession.isVmaTest
                ? 'Test VMA'
                : `Sem. ${progSession.weekNumber}/${prog.durationWeeks || 12}`}{' '}
              · {progSession.focusLabel}
            </p>
            {mode === 'coach' && (() => {
              const delivery = deliveryByProgramId.get(prog.id);
              const weekWindow =
                progSession.weekNumber >= 1
                  ? delivery?.weeks[progSession.weekNumber - 1]
                  : undefined;
              if (!hasAccess) {
                return (
                  <span className="font-mono text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                    Paiement requis
                  </span>
                );
              }
              if (progSession.isVmaTest) {
                return (
                  <span
                    className={`font-mono text-[9px] font-semibold ${
                      prog.vmaTestStatus === 'completed'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-sky-700 dark:text-sky-400'
                    }`}
                  >
                    {prog.vmaTestStatus === 'completed'
                      ? 'VMA validée'
                      : 'Disponible'}
                  </span>
                );
              }
              if (delivery?.awaitingVma) {
                return (
                  <span className="font-mono text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                    En attente du Test VMA
                  </span>
                );
              }
              if (weekWindow?.unlocked) {
                return (
                  <span className="font-mono text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {isFreeProgram ? 'Envoyée · Offert' : 'Envoyée'}
                  </span>
                );
              }
              if (weekWindow) {
                return (
                  <span className="font-mono text-[9px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                    Envoi le {formatFrenchDateShort(new Date(weekWindow.unlockAtMs))} à {formatFrenchTime(new Date(weekWindow.unlockAtMs))}
                  </span>
                );
              }
              return null;
            })()}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <p
              className={`font-display text-xs font-bold leading-snug text-slate-900 dark:text-white ${
                entry.attendedOrCompleted ? 'line-through decoration-slate-400' : ''
              }`}
            >
              {progSession.title}
            </p>
            {progSession.isCustomized && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Personnalisée
              </span>
            )}
          </div>

          <p className="mt-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {progSession.targetPaceLabel}
          </p>

          {prog.coachName && (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
              <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">Coach : {prog.coachName}</span>
            </p>
          )}

          {isLockedForMember ? (
            <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 dark:border-amber-800/70 dark:bg-amber-950/35">
              <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-950 dark:text-amber-100">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                <span>
                  Programme personnalisé payant ({formatPriceEuros(prog.priceCents)}) : réglez pour accéder au Test VMA, puis recevoir votre Semaine 1 dès validation du test et chaque semaine suivante le {deliveryByProgramId.get(prog.id)?.autoSendLabel ?? 'dimanche à 18h00'}.
                </span>
              </p>
              <button
                type="button"
                onClick={() => setPaymentTarget({ kind: 'program', program: prog })}
                className="inline-flex min-h-[30px] w-full items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
              >
                <CreditCard className="h-3 w-3" aria-hidden="true" />
                <span>Régler {formatPriceEuros(prog.priceCents)}</span>
              </button>
            </div>
          ) : (
            <>
              {!hasAccess && mode === 'coach' && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 dark:border-amber-800/70 dark:bg-amber-950/35">
                  <span className="font-mono text-[10px] font-semibold text-amber-900 dark:text-amber-200 tabular-nums">
                    Paiement en attente · {formatPriceEuros(prog.priceCents)}
                  </span>
                  <button
                    type="button"
                    disabled={payingItemId === `program-${prog.id}`}
                    onClick={() => void handleCoachMarkProgramPaid(prog)}
                    className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                  >
                    {payingItemId === `program-${prog.id}`
                      ? 'Validation...'
                      : 'Valider paiement'}
                  </button>
                </div>
              )}

              {hasAccess && progSession.isVmaTest && prog.vmaTestStatus === 'pending' && (
                <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/80 p-2.5 dark:border-sky-800 dark:bg-sky-950/50">
                  <p className="text-[11px] font-semibold text-sky-950 dark:text-sky-100">
                    Test VMA requis : l’envoi du programme ({prog.durationWeeks || 12} sem.) reste en attente jusqu’à validation. Dès validation, la Semaine 1 est envoyée immédiatement, puis la semaine suivante chaque {deliveryByProgramId.get(prog.id)?.autoSendLabel ?? 'dimanche à 18h00'}.
                  </p>
                  <button
                    type="button"
                    onClick={() => setVmaTestProgram(prog)}
                    className="mt-1.5 inline-flex min-h-[30px] w-full items-center justify-center gap-1.5 rounded-md bg-sky-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 whitespace-nowrap cursor-pointer"
                  >
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {mode === 'coach'
                        ? 'Saisir le test VMA'
                        : 'Passer / saisir mon test VMA'}
                    </span>
                  </button>
                </div>
              )}

              {progSession.exercises.length > 0 && (
                <div className="mt-2 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-800/40">
                  {progSession.exercises.map((ex, idx) => (
                    <div
                      key={`${ex.exerciseId}-${idx}`}
                      className="rounded-md border border-slate-200/80 bg-white px-2 py-1.5 dark:border-slate-700/70 dark:bg-slate-900/90"
                    >
                      <p className="font-semibold text-[11px] leading-snug text-slate-900 dark:text-white">
                        <span className="mr-1 font-mono text-[10px] text-slate-400">
                          {idx + 1}.
                        </span>
                        {ex.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatExerciseParamsSummary(ex)}
                      </p>
                      {ex.notes && (
                        <p className="mt-0.5 text-[10px] italic text-slate-500 dark:text-slate-400">
                          {ex.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {progSession.coachNotes && (
                <p className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                  {progSession.coachNotes}
                </p>
              )}

              {isPaid && !isFreeProgram && mode === 'member' && (
                <div className="mt-2 flex items-center justify-end border-t border-slate-100 pt-1.5 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPaymentTarget({ kind: 'program', program: prog })}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white whitespace-nowrap cursor-pointer"
                  >
                    <Receipt className="h-3 w-3" aria-hidden="true" />
                    <span>Reçu ({formatPriceEuros(prog.priceCents)})</span>
                  </button>
                </div>
              )}

              {mode === 'coach' && (
                <div className="mt-2 flex items-center justify-end border-t border-slate-100 pt-2 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingProgramSessionTarget({
                        programId: prog.id,
                        sessionKey: progSession.key,
                      })
                    }
                    className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200 dark:hover:bg-sky-900/60 whitespace-nowrap cursor-pointer"
                  >
                    <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                    <span>Modifier les exercices</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    const isCoachPaidSession =
      !isEvent &&
      Boolean(session) &&
      session!.createdByRole === 'coach' &&
      Boolean(session!.isPaid);
    const isUnpaidCoachSession =
      isCoachPaidSession && session!.paymentStatus !== 'paid';
    const isLockedCustomForMember = mode === 'member' && isUnpaidCoachSession;

    return (
      <div
        key={entry.id}
        className={`rounded-lg border p-2.5 text-xs transition-colors ${
          isEvent
            ? 'border-emerald-200/90 bg-emerald-50/50 dark:border-emerald-900/70 dark:bg-emerald-950/25'
            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90'
        } ${entry.attendedOrCompleted ? 'opacity-85' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`shrink-0 ${style.text}`} aria-hidden="true">
              <DisciplineIcon
                iconKey={iconKey}
                className="h-3.5 w-3.5"
              />
            </span>
            <span className="truncate font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {formatTimeRange(entry.startDate, entry.durationMinutes)}
            </span>
          </div>

          {!isEvent && session && !isLockedCustomForMember && (
            <button
              type="button"
              disabled={togglingId === session.id}
              onClick={() => void handleToggleCompleted(session)}
              title={
                session.completed
                  ? 'Marquer comme à faire'
                  : 'Marquer comme terminée'
              }
              aria-label={
                session.completed
                  ? `Marquer ${session.title} comme à faire`
                  : `Marquer ${session.title} comme terminée`
              }
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap cursor-pointer ${
                session.completed
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
            >
              {session.completed ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Circle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {inDrawerCompact && (
                <span>{session.completed ? 'Terminée' : 'À faire'}</span>
              )}
            </button>
          )}

          {!isEvent && session && isLockedCustomForMember && (
            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
              <Lock className="h-3 w-3" aria-hidden="true" />
              {formatPriceEuros(session.priceCents ?? 900)}
            </span>
          )}

          {isEvent && (
            <span className="shrink-0 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {entry.attendedOrCompleted ? 'Validée' : 'Inscrit'}
            </span>
          )}
        </div>

        <p
          className={`mt-1 font-display text-xs font-bold leading-snug text-slate-900 dark:text-white ${
            entry.attendedOrCompleted ? 'line-through decoration-slate-400' : ''
          }`}
        >
          {entry.title}
        </p>

        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {entry.discipline}
          {isEvent
            ? ' · Événement inscrit'
            : session?.createdByRole === 'coach'
              ? ` · Programme coach${
                  isCoachPaidSession
                    ? ` · ${
                        session.paymentStatus === 'paid'
                          ? `Réglé ${formatPriceEuros(session.priceCents ?? 900)}`
                          : `À régler ${formatPriceEuros(session.priceCents ?? 900)}`
                      }`
                    : ' · Offert'
                }`
              : ' · Programme perso'}
        </p>

        {(entry.coachName || entry.location) && (
          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {entry.coachName && (
              <p className="flex items-center gap-1 truncate">
                <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">Coach : {entry.coachName}</span>
              </p>
            )}
            {entry.location && (
              <p className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{entry.location}</span>
              </p>
            )}
          </div>
        )}

        {!isEvent && session?.objective && (
          <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Target className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{session.objective}</span>
          </p>
        )}

        {isLockedCustomForMember && session ? (
          <div className="mt-2 space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 dark:border-amber-800/70 dark:bg-amber-950/35">
            <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-950 dark:text-amber-100">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
              <span>
                Séance personnalisée payante ({formatPriceEuros(session.priceCents ?? 900)}) : réglez pour accéder au détail des exercices.
              </span>
            </p>
            <button
              type="button"
              onClick={() => setPaymentTarget({ kind: 'session', session })}
              className="inline-flex min-h-[30px] w-full items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
            >
              <CreditCard className="h-3 w-3" aria-hidden="true" />
              <span>Régler {formatPriceEuros(session.priceCents ?? 900)}</span>
            </button>
          </div>
        ) : (
          <>
            {!isEvent &&
              session &&
              mode === 'coach' &&
              isUnpaidCoachSession && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 dark:border-amber-800/70 dark:bg-amber-950/35">
                  <span className="font-mono text-[10px] font-semibold text-amber-900 dark:text-amber-200 tabular-nums">
                    À régler · {formatPriceEuros(session.priceCents ?? 900)}
                  </span>
                  <button
                    type="button"
                    disabled={payingItemId === `custom-${session.id}`}
                    onClick={() => void handleCoachMarkSessionPaid(session)}
                    className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                  >
                    {payingItemId === `custom-${session.id}`
                      ? 'Confirmation...'
                      : 'Confirmer paiement'}
                  </button>
                </div>
              )}

            {!isEvent && session?.exercises && session.exercises.length > 0 && (
              <div className="mt-2 space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 tabular-nums">
                  {session.exercises.length} exercice
                  {session.exercises.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-1.5">
                  {session.exercises.map((ex, idx) => {
                    const catMeta = getExerciseCategoryMeta(ex.category);
                    return (
                      <div
                        key={`${ex.exerciseId || ex.name}-${idx}`}
                        className="rounded-md border border-slate-200/80 bg-white px-2 py-1.5 dark:border-slate-700/70 dark:bg-slate-900/90"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <p className="min-w-0 font-semibold text-[11px] leading-snug text-slate-900 dark:text-white">
                            <span className="mr-1 font-mono text-[10px] text-slate-400">
                              {idx + 1}.
                            </span>
                            {ex.name}
                          </p>
                          <span
                            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${catMeta.badgeClass}`}
                          >
                            {catMeta.shortLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {formatExerciseParamsSummary(ex)}
                        </p>
                        {ex.notes && (
                          <p className="mt-0.5 text-[10px] italic text-slate-500 dark:text-slate-400">
                            {ex.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!isEvent && entry.notes && (
              <p className="mt-1.5 line-clamp-3 whitespace-pre-line rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                {entry.notes}
              </p>
            )}
          </>
        )}

        {/* Footer actions */}
        {isEvent && entry.matchedEvent && onSelectEvent && (
          <div className="mt-2 flex items-center justify-end border-t border-emerald-200/60 pt-1.5 dark:border-emerald-900/50">
            <button
              type="button"
              onClick={() => onSelectEvent(entry.matchedEvent!)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 whitespace-nowrap cursor-pointer"
            >
              <span>Voir la séance</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        )}

        {!isEvent &&
          session &&
          (mode === 'coach' ||
            (isCoachPaidSession && session.paymentStatus === 'paid')) && (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
              {isCoachPaidSession && session.paymentStatus === 'paid' && (
                <button
                  type="button"
                  onClick={() => setPaymentTarget({ kind: 'session', session })}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 whitespace-nowrap cursor-pointer"
                >
                  <Receipt className="h-3 w-3" aria-hidden="true" />
                  <span>Reçu</span>
                </button>
              )}

              {mode === 'coach' &&
                (confirmDeleteId === session.id ? (
                  <>
                    <button
                      type="button"
                      disabled={deletingId === session.id}
                      onClick={() => void handleDeleteSession(session.id)}
                      className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                    >
                      {deletingId === session.id ? 'Suppr...' : 'Confirmer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditForm(session)}
                      aria-label={`Modifier ${session.title}`}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap cursor-pointer"
                    >
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                      <span>Modifier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(session.id)}
                      aria-label={`Supprimer ${session.title}`}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      <span>Suppr.</span>
                    </button>
                  </>
                ))}
            </div>
          )}
      </div>
    );
  };

  const compactVisibleDays = useMemo(() => {
    if (compactSelectedDayIso === 'all') return weekDays;
    return weekDays.filter(
      (d) => toLocalDateInputValue(d) === compactSelectedDayIso
    );
  }, [weekDays, compactSelectedDayIso]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      {/* Header */}
      <div
        className={`flex items-start justify-between gap-3 ${
          expanded ? 'border-b border-slate-100 pb-4 dark:border-slate-800' : ''
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {mode === 'coach'
                ? 'Planning hebdomadaire personnalisé'
                : 'Mon planning de la semaine'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {mode === 'coach'
                ? 'Programme personnalisé hors événements publics + séances auxquelles l’adhérent s’est inscrit.'
                : 'Retrouvez sur la semaine vos événements inscrits et votre programme personnalisé avec un coach.'}
            </p>
            <p className="mt-1 font-mono text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums">
              Semaine {weekNumber} ({weekRangeLabel}) · {weekCounts.total}{' '}
              séance{weekCounts.total > 1 ? 's' : ''} ({weekCounts.events}{' '}
              événement{weekCounts.events > 1 ? 's' : ''}, {weekCounts.custom}{' '}
              perso, {weekCounts.programs} plan running)
              {memberPrograms.length > 0 && (
                <span className="ml-1.5 font-semibold text-sky-700 dark:text-sky-400">
                  · {memberPrograms.length} programme
                  {memberPrograms.length > 1 ? 's' : ''} running attribué
                  {memberPrograms.length > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={`weekly-schedule-${mode}`}
          aria-label={
            expanded
              ? 'Replier le planning hebdomadaire'
              : 'Déplier le planning hebdomadaire'
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
        <div id={`weekly-schedule-${mode}`} className="mt-4 space-y-4">
          {mode === 'member' && newlySentProgramAlerts.length > 0 && (
            <div className="space-y-2">
              {newlySentProgramAlerts.map(({ program, delivery, unlockedWeekWindow }) => (
                <div
                  key={`sent-alert-${program.id}-${delivery.unlockedWeeks}`}
                  role="status"
                  className="flex flex-col gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <BellRing
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-bold">
                        Semaine {delivery.unlockedWeeks}/{delivery.totalWeeks} envoyée ·{' '}
                        {program.title}
                      </p>
                      <p className="mt-0.5 text-emerald-800 dark:text-emerald-200">
                        {delivery.unlockedWeeks === 1
                          ? 'Test VMA validé : la Semaine 1 est envoyée dans votre planning.'
                          : `Nouvelle semaine disponible : vos séances de la semaine ${delivery.unlockedWeeks} viennent d’être envoyées.`}
                        {delivery.nextWeekNumber && delivery.nextUnlockAtMs
                          ? ` Prochain envoi : Semaine ${delivery.nextWeekNumber} le ${formatFrenchDateLong(new Date(delivery.nextUnlockAtMs))} à ${formatFrenchTime(new Date(delivery.nextUnlockAtMs))}.`
                          : ' Dernière semaine du programme envoyée !'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setFilter('all');
                        setWeekAnchor(unlockedWeekWindow.firstSessionDate);
                        acknowledgeProgramWeek(program.id, delivery.unlockedWeeks);
                      }}
                      className="inline-flex min-h-[32px] items-center rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                    >
                      Voir la semaine {delivery.unlockedWeeks}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        acknowledgeProgramWeek(program.id, delivery.unlockedWeeks)
                      }
                      aria-label="Fermer la notification de semaine envoyée"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/60 cursor-pointer"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {memberPrograms.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/70 dark:bg-sky-950/30 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-sky-950 dark:text-sky-100">
                  <Footprints className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                  <span>
                    {memberPrograms.length === 1
                      ? 'Programme running attribué (envoi semaine par semaine)'
                      : `${memberPrograms.length} programmes running attribués`}
                  </span>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {memberPrograms.map((prog) => {
                  const tpl = RUNNING_DISTANCE_TEMPLATES[prog.distance];
                  const delivery = deliveryByProgramId.get(prog.id);
                  const isFreeProgram = !prog.isPaid || prog.paymentStatus === 'free';
                  const isPaid = prog.paymentStatus === 'paid';
                  const hasAccess = isFreeProgram || isPaid;
                  const totalSessions = prog.durationWeeks * prog.sessionsPerWeek;
                  const doneCount = prog.completedSessionKeys?.length ?? 0;
                  const startDate = prog.startAt.toDate();
                  const currentWeekFirstDate =
                    delivery && delivery.unlockedWeeks > 0
                      ? delivery.weeks[delivery.unlockedWeeks - 1]?.firstSessionDate ?? startDate
                      : startDate;

                  return (
                    <div
                      key={prog.id}
                      className="flex flex-col justify-between gap-2 rounded-lg border border-sky-200/80 bg-white p-2.5 text-xs dark:border-sky-800/70 dark:bg-slate-900/90"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-400 tabular-nums">
                            {tpl.shortLabel} · {prog.durationWeeks} sem. · {prog.sessionsPerWeek} séances/sem. · Jour 1 : {formatFrenchDateShort(startDate)}
                          </p>
                          <p className="mt-0.5 truncate font-display text-xs font-bold text-slate-900 dark:text-white">
                            {prog.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Coach : {prog.coachName} · {doneCount}/{totalSessions} séances
                          </p>
                          {delivery && (
                            <p
                              className={`mt-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                                !delivery.hasAccess || delivery.awaitingVma
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {!delivery.hasAccess
                                ? 'Test VMA puis Semaine 1 dès le paiement'
                                : delivery.awaitingVma
                                  ? `Envoi en attente du Test VMA (Sem. 1 dès validation, puis ${delivery.autoSendShortLabel})`
                                  : delivery.allWeeksReleased
                                    ? `Toutes les semaines envoyées (${delivery.totalWeeks}/${delivery.totalWeeks})`
                                    : `Semaine ${delivery.unlockedWeeks}/${delivery.totalWeeks} envoyée · Sem. ${delivery.nextWeekNumber} le ${formatFrenchDateShort(new Date(delivery.nextUnlockAtMs!))} à ${formatFrenchTime(new Date(delivery.nextUnlockAtMs!))}`}
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 font-mono text-[10px] font-bold tabular-nums ${
                            hasAccess
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {isFreeProgram
                            ? 'Offert · Gratuit'
                            : isPaid
                              ? 'Payé'
                              : `À régler · ${formatPriceEuros(prog.priceCents)}`}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setFilter('all');
                            setWeekAnchor(
                              mode === 'member' && delivery?.awaitingVma
                                ? new Date(nowMs)
                                : delivery && delivery.unlockedWeeks >= 1
                                  ? delivery.weeks[0]?.firstSessionDate ?? startDate
                                  : startDate
                            );
                          }}
                          className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                        >
                          <span>
                            {mode === 'member' && delivery?.awaitingVma
                              ? 'Voir le Test VMA'
                              : 'Voir Semaine 1'}
                          </span>
                        </button>

                        {delivery && delivery.hasAccess && delivery.unlockedWeeks > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setFilter('all');
                              setWeekAnchor(currentWeekFirstDate);
                            }}
                            className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200 whitespace-nowrap cursor-pointer"
                          >
                            <span>Semaine {delivery.unlockedWeeks} (en cours)</span>
                          </button>
                        )}

                        {!hasAccess && mode === 'member' && (
                          <button
                            type="button"
                            onClick={() => setPaymentTarget({ kind: 'program', program: prog })}
                            className="inline-flex min-h-[28px] items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                          >
                            <CreditCard className="h-3 w-3" aria-hidden="true" />
                            <span>Régler {formatPriceEuros(prog.priceCents)}</span>
                          </button>
                        )}

                        {!hasAccess && mode === 'coach' && (
                          <button
                            type="button"
                            disabled={payingItemId === `program-${prog.id}`}
                            onClick={() => void handleCoachMarkProgramPaid(prog)}
                            className="inline-flex min-h-[28px] items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                          >
                            <span>
                              {payingItemId === `program-${prog.id}`
                                ? 'Validation...'
                                : 'Valider paiement'}
                            </span>
                          </button>
                        )}

                        {hasAccess && prog.vmaTestStatus === 'pending' && (
                          <button
                            type="button"
                            onClick={() => setVmaTestProgram(prog)}
                            className="inline-flex min-h-[28px] items-center gap-1 rounded-md bg-sky-700 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-sky-800 whitespace-nowrap cursor-pointer"
                          >
                            <Gauge className="h-3 w-3" aria-hidden="true" />
                            <span>
                              {mode === 'coach' ? 'Saisir VMA' : 'Passer test VMA'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Toolbar: Week Navigation + Source Filter + Actions */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/70">
                <button
                  type="button"
                  onClick={() =>
                    setWeekAnchor(
                      new Date(
                        weekAnchor.getFullYear(),
                        weekAnchor.getMonth(),
                        weekAnchor.getDate() - 7
                      )
                    )
                  }
                  aria-label="Semaine précédente"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setWeekAnchor(new Date())}
                  className="min-h-[32px] rounded-md px-2.5 text-xs font-semibold text-slate-800 hover:bg-white dark:text-slate-100 dark:hover:bg-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Cette semaine
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setWeekAnchor(
                      new Date(
                        weekAnchor.getFullYear(),
                        weekAnchor.getMonth(),
                        weekAnchor.getDate() + 7
                      )
                    )
                  }
                  aria-label="Semaine suivante"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div
                role="group"
                aria-label="Filtrer les séances de la semaine"
                className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
              >
                {(
                  [
                    { id: 'all', label: `Tout (${weekCounts.total})` },
                    {
                      id: 'events',
                      label: `Événements inscrits (${weekCounts.events})`,
                    },
                    {
                      id: 'custom',
                      label: `Séances perso (${weekCounts.custom})`,
                    },
                    {
                      id: 'programs',
                      label: `Programmes 5–42 km (${weekCounts.programs})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`min-h-[30px] rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                      filter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {mode === 'coach' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setActionFeedback(null);
                      setIsFormOpen(false);
                      setRunningProgramModalOpen(true);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Programme 5–42 km</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionFeedback(null);
                      setIsFormOpen(false);
                      setProgramBuilderState({ open: true, editingSession: null });
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Programme (bibliothèque)</span>
                  </button>
                </>
              )}
              {mode === 'member' && onRequestCoachProgram && (
                <button
                  type="button"
                  onClick={() => {
                    if (coachDirectory.length > 0) {
                      setCoachPricingModalOpen(true);
                    } else {
                      onRequestCoachProgram(undefined);
                    }
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageSquare
                    className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <span>Coachs, tarifs &amp; programme</span>
                </button>
              )}
              {mode === 'coach' && (
                <button
                  type="button"
                  onClick={() => {
                    const defaultTarget =
                      today.getTime() >= weekStartMs && today.getTime() <= weekEndMs
                        ? today
                        : weekDays[0];
                    openCreateForm(defaultTarget);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ajouter une séance perso</span>
                </button>
              )}
            </div>
          </div>

          {actionFeedback && (
            <div
              role="status"
              className={`rounded-lg border p-3 text-xs ${
                actionFeedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              {actionFeedback.text}
            </div>
          )}

          {/* Add / Edit Personalized Session Inline Form (Coach-only) */}
          {mode === 'coach' && isFormOpen && (
            <form
              ref={formContainerRef}
              onSubmit={handleSubmitForm}
              className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/20 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5 dark:border-emerald-900/60">
                <div className="flex items-center gap-2 min-w-0">
                  <Dumbbell
                    className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                    {editingSession
                      ? 'Modifier la séance personnalisée'
                      : `Nouvelle séance sur mesure pour ${memberName}`}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingSession(null);
                  }}
                  aria-label="Fermer le formulaire"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`sched-title-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Titre de la séance *
                  </label>
                  <input
                    ref={titleInputRef}
                    id={`sched-title-${mode}`}
                    type="text"
                    required
                    minLength={VALIDATION_LIMITS.TITLE_MIN}
                    maxLength={VALIDATION_LIMITS.TITLE_MAX}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ex. Renforcement haut du corps, Footing Z2..."
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`sched-discipline-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Discipline *
                  </label>
                  <select
                    id={`sched-discipline-${mode}`}
                    value={formDiscipline}
                    onChange={(e) => setFormDiscipline(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {disciplineOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor={`sched-date-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Date *
                  </label>
                  <input
                    id={`sched-date-${mode}`}
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`sched-time-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Heure de début *
                  </label>
                  <input
                    id={`sched-time-${mode}`}
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`sched-duration-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Durée (minutes) *
                  </label>
                  <select
                    id={`sched-duration-${mode}`}
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {DURATION_PRESETS.map((min) => (
                      <option key={min} value={min}>
                        {min} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`sched-coach-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Coach référent (optionnel)
                  </label>
                  <select
                    id={`sched-coach-${mode}`}
                    value={formCoachUid}
                    onChange={(e) => {
                      const nextUid = e.target.value;
                      setFormCoachUid(nextUid);
                      if (!editingSession && !formPriceTouched) {
                        const nextCoach = nextUid ? coachByUid.get(nextUid) : null;
                        setFormPriceEuros(
                          (
                            getCoachCustomSessionPriceCents(nextCoach?.pricing) /
                            100
                          ).toFixed(2)
                        );
                      }
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Programme autonome (sans coach)</option>
                    {mode === 'coach' &&
                      currentCoachName &&
                      !coachDirectory.some((c) => c.uid === currentUserUid) && (
                        <option value={currentUserUid}>
                          {currentCoachName}
                        </option>
                      )}
                    {coachDirectory.map((c) => (
                      <option key={c.uid} value={c.uid}>
                        {c.displayName}
                        {c.specialty ? ` · ${c.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`sched-location-${mode}`}
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Lieu (optionnel)
                  </label>
                  <input
                    id={`sched-location-${mode}`}
                    type="text"
                    maxLength={VALIDATION_LIMITS.LOCATION_MAX}
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Ex. Salle, Domicile, Parc..."
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={`sched-notes-${mode}`}
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Exercices, séries & consignes
                </label>
                <textarea
                  id={`sched-notes-${mode}`}
                  rows={3}
                  maxLength={VALIDATION_LIMITS.SCHEDULE_NOTES_MAX}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex. 4×10 squats gobelet, 3×12 pompes, 20 min cardio modéré..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Optional pricing for quick personalized session */}
              <div className="rounded-lg border border-emerald-200/80 bg-white/80 p-3 dark:border-emerald-900/60 dark:bg-slate-900/50 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <CreditCard className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                    Tarification de la séance
                  </span>
                  <div
                    role="group"
                    aria-label="Séance gratuite ou payante"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-200/80 p-0.5 dark:bg-slate-800"
                  >
                    <button
                      type="button"
                      onClick={() => setFormIsPaid(false)}
                      className={`min-h-[26px] rounded-md px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                        !formIsPaid
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      Offert (gratuit)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormIsPaid(true)}
                      className={`min-h-[26px] rounded-md px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                        formIsPaid
                          ? 'bg-emerald-700 text-white shadow-xs dark:bg-emerald-600'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      Payant
                    </button>
                  </div>
                </div>

                {formIsPaid ? (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`sched-price-${mode}`}
                        className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Tarif (€) *
                      </label>
                      <input
                        id={`sched-price-${mode}`}
                        type="number"
                        min={1}
                        max={2000}
                        step="0.50"
                        required
                        value={formPriceEuros}
                        onChange={(e) => {
                          setFormPriceTouched(true);
                          setFormPriceEuros(e.target.value);
                        }}
                        className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      {(() => {
                        const selCoach = formCoachUid
                          ? coachByUid.get(formCoachUid)
                          : null;
                        if (!hasCoachCustomSessionPrice(selCoach?.pricing)) {
                          return null;
                        }
                        const coachCents = getCoachCustomSessionPriceCents(
                          selCoach?.pricing
                        );
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setFormPriceEuros((coachCents / 100).toFixed(2));
                              setFormPriceTouched(false);
                            }}
                            className="mt-1 text-left text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
                          >
                            Tarif de {selCoach?.displayName || 'ce coach'} :{' '}
                            {formatPriceEuros(coachCents)}
                          </button>
                        );
                      })()}
                    </div>
                    <div>
                      <label
                        htmlFor={`sched-pay-mode-${mode}`}
                        className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Mode de règlement
                      </label>
                      <select
                        id={`sched-pay-mode-${mode}`}
                        value={formPaymentMode}
                        onChange={(e) =>
                          setFormPaymentMode(e.target.value as EventPaymentMode)
                        }
                        className="mt-1 min-h-[36px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="both">Carte en ligne ou sur place</option>
                        <option value="online">Carte en ligne uniquement</option>
                        <option value="onsite">Sur place uniquement</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Séance offerte : accessible immédiatement dans le planning de l’adhérent sans paiement.
                  </p>
                )}
              </div>

              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingSession(null);
                  }}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  {formSaving
                    ? 'Enregistrement...'
                    : editingSession
                      ? 'Enregistrer les modifications'
                      : 'Ajouter au planning'}
                </button>
              </div>
            </form>
          )}

          {mode === 'member' && upcomingLockedWeeksInView.length > 0 && (
            <div className="space-y-2">
              {upcomingLockedWeeksInView.map(({ program, delivery, weekNumber: lockedWk, unlockAtMs }) => {
                const targetAnchorDate =
                  delivery.unlockedWeeks > 0
                    ? delivery.weeks[delivery.unlockedWeeks - 1]?.firstSessionDate ??
                      program.startAt.toDate()
                    : program.startAt.toDate();
                return (
                  <div
                    key={`locked-wk-${program.id}-${lockedWk}`}
                    className="flex flex-col gap-2.5 rounded-xl border border-amber-200 bg-amber-50/75 p-3 text-xs text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/35 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <Lock
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="font-bold">
                          {delivery.awaitingVma
                            ? `Envoi de « ${program.title} » en attente du Test VMA`
                            : `Semaine ${lockedWk}/${delivery.totalWeeks} de « ${program.title} » pas encore envoyée`}
                        </p>
                        <p className="mt-0.5 text-amber-900/90 dark:text-amber-200/90">
                          {!delivery.hasAccess
                            ? `Réglez votre programme (${formatPriceEuros(program.priceCents)}) pour accéder au Test VMA, puis recevoir votre Semaine 1 dès validation du test et chaque semaine suivante le ${delivery.autoSendLabel}.`
                            : delivery.awaitingVma
                              ? `Validez d’abord votre Test VMA pour déclencher l’envoi immédiat de la Semaine 1, puis de la Semaine 2 le ${delivery.autoSendLabel} et ainsi de suite.`
                              : `Elle vous sera envoyée automatiquement le ${formatFrenchDateLong(new Date(unlockAtMs))} à ${formatFrenchTime(new Date(unlockAtMs))}.`}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {!delivery.hasAccess ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPaymentTarget({ kind: 'program', program })
                          }
                          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                        >
                          <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Régler {formatPriceEuros(program.priceCents)}</span>
                        </button>
                      ) : delivery.awaitingVma ? (
                        <button
                          type="button"
                          onClick={() => setVmaTestProgram(program)}
                          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500 whitespace-nowrap cursor-pointer"
                        >
                          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Passer / saisir mon test VMA</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setFilter('all');
                            setWeekAnchor(targetAnchorDate);
                          }}
                          className="inline-flex min-h-[32px] items-center rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100/60 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-100 whitespace-nowrap cursor-pointer"
                        >
                          Revenir à la semaine {delivery.unlockedWeeks}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Weekly Layout */}
          {compact ? (
            <div className="space-y-3">
              {/* Day selector strip for narrow drawer */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCompactSelectedDayIso('all')}
                  className={`min-h-[30px] rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap cursor-pointer ${
                    compactSelectedDayIso === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  Toute la semaine ({weekEntries.length})
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((day) => {
                  const iso = toLocalDateInputValue(day);
                  const count = (entriesByDayIso.get(iso) ?? []).length;
                  const isToday = isSameCalendarDay(day, today);
                  const isSelected = compactSelectedDayIso === iso;
                  const weekdayShort = new Intl.DateTimeFormat('fr-FR', {
                    weekday: 'short',
                  })
                    .format(day)
                    .replace('.', '');
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() =>
                        setCompactSelectedDayIso(isSelected ? 'all' : iso)
                      }
                      className={`flex flex-col items-center rounded-lg border py-1.5 px-1 text-center transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-100'
                          : isToday
                            ? 'border-emerald-300 bg-white text-slate-900 dark:border-emerald-800 dark:bg-slate-900 dark:text-white'
                            : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-semibold uppercase">
                        {weekdayShort}
                      </span>
                      <span className="font-mono text-xs font-bold tabular-nums">
                        {day.getDate()}
                      </span>
                      <span
                        className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                          count > 0
                            ? 'bg-emerald-600 dark:bg-emerald-400'
                            : 'bg-transparent'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2.5">
                {compactVisibleDays.map((day) => {
                  const iso = toLocalDateInputValue(day);
                  const items = entriesByDayIso.get(iso) ?? [];
                  if (
                    compactSelectedDayIso === 'all' &&
                    items.length === 0 &&
                    weekEntries.length > 0
                  ) {
                    return null;
                  }
                  return (
                    <div
                      key={iso}
                      className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30"
                    >
                      <div className="flex items-center justify-between gap-2 pb-2">
                        <span className="text-xs font-bold capitalize text-slate-800 dark:text-slate-200">
                          {formatFrenchDateShort(day)}
                        </span>
                        {mode === 'coach' && (
                          <button
                            type="button"
                            onClick={() => openCreateForm(day)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                            <span>Ajouter</span>
                          </button>
                        )}
                      </div>
                      {items.length === 0 ? (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Aucune séance prévue ce jour.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((item) => renderEntryCard(item, true))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Full 7-Column Desktop Weekly Planner (Mon–Sun) */
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {weekDays.map((day) => {
                const iso = toLocalDateInputValue(day);
                const items = entriesByDayIso.get(iso) ?? [];
                const isToday = isSameCalendarDay(day, today);
                const weekdayLabel = new Intl.DateTimeFormat('fr-FR', {
                  weekday: 'short',
                })
                  .format(day)
                  .replace('.', '');
                const monthLabel = new Intl.DateTimeFormat('fr-FR', {
                  month: 'short',
                }).format(day);

                return (
                  <div
                    key={iso}
                    className={`flex min-h-[190px] flex-col rounded-xl border p-2.5 ${
                      isToday
                        ? 'border-emerald-300 bg-emerald-50/25 dark:border-emerald-800 dark:bg-emerald-950/15'
                        : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 border-b border-slate-200/80 pb-2 dark:border-slate-800">
                      <div className="min-w-0">
                        <p
                          className={`text-[11px] font-bold uppercase tracking-wide ${
                            isToday
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {weekdayLabel}
                          {isToday ? ' · Auj.' : ''}
                        </p>
                        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                          {day.getDate()}{' '}
                          <span className="font-sans text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {monthLabel}
                          </span>
                        </p>
                      </div>

                      {mode === 'coach' && (
                        <button
                          type="button"
                          onClick={() => openCreateForm(day)}
                          aria-label={`Ajouter une séance le ${formatFrenchDateShort(day)}`}
                          title={`Ajouter le ${formatFrenchDateShort(day)}`}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <div className="mt-2.5 flex-1 space-y-2">
                      {items.length === 0 ? (
                        <div className="flex h-full min-h-[92px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200/90 px-2 py-4 text-center dark:border-slate-800">
                          <Clock
                            className="h-4 w-4 text-slate-300 dark:text-slate-600"
                            aria-hidden="true"
                          />
                          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                            Repos / libre
                          </p>
                        </div>
                      ) : (
                        items.map((item) => renderEntryCard(item, false))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Concise legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950" />
                Événements inscrits ({selfRegisteredEntries.length} au total)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800" />
                Séances personnalisées ({customEntries.length} au total)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm border border-sky-300 bg-sky-100 dark:border-sky-700 dark:bg-sky-950" />
                Plans running 5–42 km ({programEntries.length} séances)
              </span>
            </div>
            <span className="font-mono tabular-nums">
              {formatFrenchTime(today)} · Mis à jour en temps réel
            </span>
          </div>
        </div>
      )}

      {mode === 'coach' && programBuilderState.open && (
        <ProgramBuilderModal
          coachUid={currentUserUid}
          coachName={currentCoachName || 'Coach'}
          coachDirectory={coachDirectory}
          isPrimaryCoach={isPrimaryCoach}
          disciplines={disciplines}
          exercises={exercises}
          memberCandidates={[
            {
              email: memberEmail,
              emailKey: memberEmailLower,
              name: memberName,
              goal: memberGoal,
              fitnessLevel: memberFitnessLevel,
            },
          ]}
          initialMember={{
            email: memberEmail,
            emailKey: memberEmailLower,
            name: memberName,
            goal: memberGoal,
            fitnessLevel: memberFitnessLevel,
          }}
          editingSession={programBuilderState.editingSession}
          onClose={() =>
            setProgramBuilderState({ open: false, editingSession: null })
          }
          onSaved={(msg, targetDate) => {
            if (!programBuilderState.editingSession) {
              setWeekAnchor(targetDate ?? new Date());
            }
            setActionFeedback({ type: 'success', text: msg });
          }}
        />
      )}

      {mode === 'coach' && runningProgramModalOpen && (
        <RunningProgramBuilderModal
          coachUid={currentUserUid}
          coachName={currentCoachName || 'Coach'}
          coachDirectory={coachDirectory}
          isPrimaryCoach={isPrimaryCoach}
          memberCandidates={[
            {
              email: memberEmail,
              emailKey: memberEmailLower,
              name: memberName,
              goal: memberGoal,
              fitnessLevel: memberFitnessLevel,
            },
          ]}
          initialMember={{
            email: memberEmail,
            emailKey: memberEmailLower,
            name: memberName,
            goal: memberGoal,
            fitnessLevel: memberFitnessLevel,
          }}
          onClose={() => setRunningProgramModalOpen(false)}
          onSaved={(msg, targetDate) => {
            setWeekAnchor(targetDate ?? new Date());
            setActionFeedback({ type: 'success', text: msg });
          }}
        />
      )}

      {paymentTarget && (
        <ProgramPaymentModal
          target={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onPaid={(msg) => setActionFeedback({ type: 'success', text: msg })}
        />
      )}

      {vmaTestProgram && (
        <VmaTestModal
          program={vmaTestProgram}
          isCoach={mode === 'coach'}
          nowMs={nowMs}
          onClose={() => setVmaTestProgram(null)}
          onSubmitted={(vma) =>
            setActionFeedback({
              type: 'success',
              text: `Test VMA validé (${vma.toFixed(1)} km/h) ! Toutes les allures des ${vmaTestProgram.durationWeeks || 12} semaines sont désormais calculées.`,
            })
          }
        />
      )}

      {mode === 'coach' &&
        editingProgramSessionTarget &&
        (() => {
          const liveProg = trainingPrograms.find(
            (p) => p.id === editingProgramSessionTarget.programId
          );
          if (!liveProg) return null;
          return (
            <RunningSessionEditorModal
              program={liveProg}
              exercises={exercises}
              initialSessionKey={editingProgramSessionTarget.sessionKey}
              onClose={() => setEditingProgramSessionTarget(null)}
              onSaved={(msg) =>
                setActionFeedback({ type: 'success', text: msg })
              }
            />
          );
        })()}

      {mode === 'member' && coachPricingModalOpen && onRequestCoachProgram && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-pricing-directory-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setCoachPricingModalOpen(false)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3
                  id="coach-pricing-directory-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-white"
                >
                  Coachs &amp; tarifs proposés
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Consultez les spécialités et les tarifs propres à chaque coach, puis contactez celui de votre choix.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCoachPricingModalOpen(false)}
                aria-label="Fermer"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {coachDirectory.map((coach) => {
                const pricingItems = getCoachPricingItems(coach.pricing);
                const hasPricing = hasAnyCoachPricing(coach.pricing);
                return (
                  <div
                    key={coach.uid}
                    className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/50 space-y-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <ProfileAvatar
                          name={coach.displayName}
                          photoUrl={coach.photoUrl}
                          size="md"
                        />
                        <div className="min-w-0">
                          <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                            {coach.displayName}
                          </h4>
                          {(coach.specialty || coach.city || coach.region) && (
                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                              {[coach.specialty, coach.city, coach.region]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                          {coach.bio && (
                            <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-2">
                              {coach.bio}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCoachPricingModalOpen(false);
                          onRequestCoachProgram(coach);
                        }}
                        className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Contacter ce coach</span>
                      </button>
                    </div>

                    <div className="border-t border-slate-200/80 pt-3 dark:border-slate-800">
                      {hasPricing ? (
                        <div className="space-y-2">
                          {pricingItems.length > 0 && (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {pricingItems.map((item) => (
                                <div
                                  key={item.key}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                                >
                                  <span className="text-slate-600 dark:text-slate-300 truncate">
                                    {item.label}
                                  </span>
                                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                                    {item.formattedPrice}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {coach.pricing?.pricingNotes?.trim() && (
                            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                              {coach.pricing.pricingNotes.trim()}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Tarifs standards · Discutez directement avec {coach.displayName} pour un devis adapté à vos objectifs.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
