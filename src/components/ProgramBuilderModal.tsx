import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  CreditCard,
  Dumbbell,
  Footprints,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CoachDirectoryEntry,
  DisciplineItem,
  EventPaymentMode,
  ExerciseCategory,
  ExerciseLibraryItem,
  MemberScheduleSession,
  ScheduledExerciseItem,
  VALIDATION_LIMITS,
} from '../types';
import {
  createMemberScheduleSession,
  updateMemberScheduleSession,
} from '../services/firestoreService';
import {
  formatPriceEuros,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '../utils/dateAndValidation';
import {
  getCoachCustomSessionPriceCents,
  hasCoachCustomSessionPrice,
} from '../utils/coachPricingHelpers';
import {
  clampExerciseParams,
  doesExerciseMatchGoal,
  estimateSessionExercisesMinutes,
  formatExerciseParamsSummary,
  getExerciseCategoryMeta,
  STARTER_EXERCISES,
} from '../utils/exerciseLibrary';

export interface ProgramMemberCandidate {
  email: string;
  emailKey: string;
  name: string;
  goal?: string;
  fitnessLevel?: string;
}

interface UnifiedExerciseOption {
  id: string;
  name: string;
  category: ExerciseCategory;
  targetObjectives: string[];
  description: string;
  intensityHint?: string;
  defaultParams: {
    repetitions: number;
    durationSeconds: number;
    setsOrRounds: number;
    intraSetPauseSeconds: number;
    restBetweenRoundsSeconds: number;
  };
  isPresetOnly: boolean;
}

interface ProgramBuilderModalProps {
  coachUid: string;
  coachName: string;
  coachDirectory: CoachDirectoryEntry[];
  isPrimaryCoach?: boolean;
  disciplines: DisciplineItem[];
  exercises: ExerciseLibraryItem[];
  memberCandidates: ProgramMemberCandidate[];
  initialMember?: ProgramMemberCandidate | null;
  editingSession?: MemberScheduleSession | null;
  initialExercises?: ScheduledExerciseItem[];
  onClose: () => void;
  onSaved?: (message: string, targetDate?: Date) => void;
}

const DURATION_PRESETS = [20, 30, 45, 60, 75, 90, 120];

function fitnessLevelLabel(level?: string): string {
  if (level === 'beginner') return 'Débutant';
  if (level === 'intermediate') return 'Intermédiaire';
  if (level === 'advanced') return 'Avancé';
  return '';
}

export function ProgramBuilderModal({
  coachUid,
  coachName,
  coachDirectory,
  isPrimaryCoach = false,
  disciplines,
  exercises,
  memberCandidates,
  initialMember = null,
  editingSession = null,
  initialExercises = [],
  onClose,
  onSaved,
}: ProgramBuilderModalProps) {
  const defaultMemberEmail =
    editingSession?.memberEmail ||
    initialMember?.email ||
    memberCandidates[0]?.email ||
    '';

  const [selectedMemberEmail, setSelectedMemberEmail] =
    useState(defaultMemberEmail);

  useEffect(() => {
    if (
      !editingSession &&
      !initialMember &&
      !selectedMemberEmail &&
      memberCandidates.length > 0
    ) {
      setSelectedMemberEmail(memberCandidates[0].email);
    }
  }, [editingSession, initialMember, selectedMemberEmail, memberCandidates]);

  const selectedMember = useMemo(() => {
    const clean = selectedMemberEmail.trim().toLowerCase();
    const fromList = memberCandidates.find(
      (m) => m.email.trim().toLowerCase() === clean
    );
    if (fromList) return fromList;
    if (initialMember && initialMember.email.trim().toLowerCase() === clean) {
      return initialMember;
    }
    if (editingSession) {
      return {
        email: editingSession.memberEmail,
        emailKey: editingSession.memberEmailKey,
        name: editingSession.memberName,
        goal: editingSession.objective || '',
      };
    }
    return null;
  }, [selectedMemberEmail, memberCandidates, initialMember, editingSession]);

  const [title, setTitle] = useState(
    editingSession?.title ||
      (initialExercises.length === 1
        ? `Programme · ${initialExercises[0].name}`
        : 'Programme personnalisé')
  );
  const [objective, setObjective] = useState(
    editingSession?.objective ?? selectedMember?.goal ?? ''
  );
  const [discipline, setDiscipline] = useState(
    editingSession?.discipline || disciplines[0]?.name || 'Renforcement'
  );
  const [sessionDate, setSessionDate] = useState(() =>
    editingSession
      ? toLocalDateInputValue(editingSession.startAt.toDate())
      : toLocalDateInputValue(new Date())
  );
  const [sessionTime, setSessionTime] = useState(() =>
    editingSession ? toLocalTimeInputValue(editingSession.startAt.toDate()) : '18:00'
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(() => {
    if (editingSession) return editingSession.durationMinutes;
    if (initialExercises.length > 0) {
      return estimateSessionExercisesMinutes(initialExercises);
    }
    return 45;
  });
  const [location, setLocation] = useState(editingSession?.location || '');
  const [coachRefUid, setCoachRefUid] = useState(
    editingSession?.coachUid ?? coachUid
  );
  const selectedCoachEntry = useMemo(
    () => coachDirectory.find((c) => c.uid === coachRefUid) ?? null,
    [coachDirectory, coachRefUid]
  );
  const [priceTouched, setPriceTouched] = useState<boolean>(
    Boolean(editingSession)
  );
  const [notes, setNotes] = useState(editingSession?.notes || '');
  const [isPaid, setIsPaid] = useState<boolean>(() =>
    editingSession ? Boolean(editingSession.isPaid) : true
  );
  const [priceEuros, setPriceEuros] = useState<string>(() => {
    if (editingSession?.priceCents && editingSession.priceCents >= 100) {
      return (editingSession.priceCents / 100).toFixed(2);
    }
    const initialCoach = coachDirectory.find(
      (c) => c.uid === (editingSession?.coachUid ?? coachUid)
    );
    return (
      getCoachCustomSessionPriceCents(initialCoach?.pricing) / 100
    ).toFixed(2);
  });
  const [paymentMode, setPaymentMode] = useState<EventPaymentMode>(
    editingSession?.paymentMode ?? 'both'
  );
  const [markPaid, setMarkPaid] = useState<boolean>(false);
  const [programExercises, setProgramExercises] = useState<
    ScheduledExerciseItem[]
  >(() => editingSession?.exercises ?? initialExercises);

  const handleCoachRefChange = (nextCoachUid: string) => {
    setCoachRefUid(nextCoachUid);
    if (!editingSession && !priceTouched) {
      const nextCoach = coachDirectory.find((c) => c.uid === nextCoachUid);
      setPriceEuros(
        (getCoachCustomSessionPriceCents(nextCoach?.pricing) / 100).toFixed(2)
      );
    }
  };

  // Library browser filters
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryCategory, setLibraryCategory] = useState<
    'all' | ExerciseCategory
  >('all');
  const [matchGoalOnly, setMatchGoalOnly] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mergedLibrary = useMemo<UnifiedExerciseOption[]>(() => {
    const dbNames = new Set(exercises.map((e) => e.name.trim().toLowerCase()));
    const dbIds = new Set(exercises.map((e) => e.id));
    const list: UnifiedExerciseOption[] = exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      category: ex.category,
      targetObjectives: ex.targetObjectives,
      description: ex.description,
      intensityHint: ex.intensityHint,
      defaultParams: ex.defaultParams,
      isPresetOnly: false,
    }));
    for (const tpl of STARTER_EXERCISES) {
      if (
        !dbIds.has(tpl.presetId) &&
        !dbNames.has(tpl.name.trim().toLowerCase())
      ) {
        list.push({
          id: tpl.presetId,
          name: tpl.name,
          category: tpl.category,
          targetObjectives: tpl.targetObjectives,
          description: tpl.description,
          intensityHint: tpl.intensityHint,
          defaultParams: tpl.defaultParams,
          isPresetOnly: true,
        });
      }
    }
    return list;
  }, [exercises]);

  const effectiveGoalText = useMemo(
    () => (objective || selectedMember?.goal || '').trim(),
    [objective, selectedMember]
  );

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return mergedLibrary.filter((ex) => {
      if (libraryCategory !== 'all' && ex.category !== libraryCategory) {
        return false;
      }
      if (matchGoalOnly && effectiveGoalText) {
        if (!doesExerciseMatchGoal(ex, effectiveGoalText)) {
          return false;
        }
      }
      if (q) {
        const hay = `${ex.name} ${ex.description} ${ex.targetObjectives.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    mergedLibrary,
    libraryCategory,
    matchGoalOnly,
    effectiveGoalText,
    librarySearch,
  ]);

  const disciplineOptions = useMemo(() => {
    const names = disciplines.map((d) => d.name);
    if (names.length === 0) {
      return ['Renforcement', 'Course à pied', 'HIIT', 'Mobilité', 'Cardio'];
    }
    if (discipline && !names.includes(discipline)) {
      return [discipline, ...names];
    }
    return names;
  }, [disciplines, discipline]);

  const estimatedMinutes = useMemo(
    () => estimateSessionExercisesMinutes(programExercises),
    [programExercises]
  );

  const handleSelectMember = (email: string) => {
    setSelectedMemberEmail(email);
    const found = memberCandidates.find(
      (m) => m.email.trim().toLowerCase() === email.trim().toLowerCase()
    );
    if (found?.goal && !editingSession) {
      setObjective(found.goal);
    }
  };

  const handleAddExercise = (ex: UnifiedExerciseOption) => {
    if (programExercises.length >= VALIDATION_LIMITS.SESSION_EXERCISES_MAX) {
      setError(
        `Maximum ${VALIDATION_LIMITS.SESSION_EXERCISES_MAX} exercices par séance.`
      );
      return;
    }
    setError(null);
    const nextItem: ScheduledExerciseItem = {
      exerciseId: ex.id,
      name: ex.name,
      category: ex.category,
      ...clampExerciseParams(ex.defaultParams),
      notes: ex.intensityHint || '',
    };
    const nextList = [...programExercises, nextItem];
    setProgramExercises(nextList);
    if (!editingSession) {
      setDurationMinutes(estimateSessionExercisesMinutes(nextList));
    }
  };

  const handleUpdateItemField = <K extends keyof ScheduledExerciseItem>(
    index: number,
    field: K,
    value: ScheduledExerciseItem[K]
  ) => {
    setProgramExercises((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const handleMoveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= programExercises.length) return;
    setProgramExercises((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleDuplicateItem = (index: number) => {
    if (programExercises.length >= VALIDATION_LIMITS.SESSION_EXERCISES_MAX) {
      return;
    }
    setProgramExercises((prev) => {
      const copy = { ...prev[index] };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setProgramExercises((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetEmail =
      editingSession?.memberEmail || selectedMember?.email || selectedMemberEmail;
    const targetName =
      editingSession?.memberName ||
      selectedMember?.name ||
      targetEmail.split('@')[0] ||
      'Adhérent';

    if (!targetEmail || !VALIDATION_LIMITS.EMAIL_REGEX.test(targetEmail.trim())) {
      setError('Veuillez sélectionner un adhérent valide.');
      return;
    }

    if (!sessionDate || !sessionTime) {
      setError('Veuillez renseigner la date et l’heure de la séance.');
      return;
    }

    const [yStr, mStr, dStr] = sessionDate.split('-');
    const [hhStr, mmStr] = sessionTime.split(':');
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
      setError('Date ou heure invalide.');
      return;
    }

    let priceCents = 0;
    if (isPaid) {
      const parsedPrice = Number(priceEuros.replace(',', '.'));
      if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
        setError(
          'Pour un programme payant, saisissez un tarif d’au moins 1,00 € (ou sélectionnez « Offert / gratuit »).'
        );
        return;
      }
      priceCents = Math.min(
        VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS,
        Math.round(parsedPrice * 100)
      );
    }

    const effectiveCoachUid = isPrimaryCoach
      ? coachRefUid.trim() || coachUid
      : editingSession?.coachUid || coachUid;
    const selectedCoach = coachDirectory.find((c) => c.uid === effectiveCoachUid);
    const resolvedCoachUid = effectiveCoachUid;
    const resolvedCoachName =
      selectedCoach?.displayName ||
      (resolvedCoachUid === coachUid ? coachName : editingSession?.coachName || '');

    setSaving(true);
    try {
      if (editingSession) {
        const switchedToPaid = !editingSession.isPaid && isPaid;
        await updateMemberScheduleSession(editingSession.id, {
          title,
          discipline,
          notes,
          location,
          startDate,
          durationMinutes,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          objective,
          exercises: programExercises,
          isPaid,
          priceCents,
          paymentMode,
          ...(switchedToPaid
            ? { paymentStatus: 'pending' as const, paymentMethod: 'onsite' as const }
            : {}),
          completed: editingSession.completed,
        });
        onSaved?.(
          `Programme « ${title} » mis à jour pour ${targetName}.`,
          startDate
        );
      } else {
        await createMemberScheduleSession({
          memberEmail: targetEmail,
          memberName: targetName,
          title,
          discipline,
          notes,
          location,
          startDate,
          durationMinutes,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          objective,
          exercises: programExercises,
          isPaid,
          priceCents,
          paymentMode,
          markPaid: isPaid ? markPaid : false,
          createdByUid: coachUid,
          createdByRole: 'coach',
        });
        onSaved?.(
          isPaid
            ? `Programme personnalisé payant envoyé à ${targetName}. Une notification lui a été transmise.`
            : `Programme personnalisé offert envoyé à ${targetName}. Une notification lui a été transmise.`,
          startDate
        );
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer ce programme.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="program-builder-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5 backdrop-blur-xs"
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="program-builder-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                {editingSession
                  ? 'Modifier le programme personnalisé'
                  : 'Préparer un programme personnalisé'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Sélectionnez les exercices selon les objectifs de l’adhérent et
                ajustez répétitions, durée, tours, pause et repos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le constructeur de programme"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-slate-200 overflow-y-auto lg:grid-cols-12 lg:divide-x lg:divide-y-0 dark:divide-slate-800">
            {/* Left Column: Exercise Library Picker (5 cols) */}
            <div className="flex flex-col bg-slate-50/40 p-4 sm:p-5 lg:col-span-5 lg:overflow-y-auto dark:bg-slate-950/30">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-slate-900 dark:text-white">
                  <BookOpen
                    className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <span>Bibliothèque d’exercices</span>
                </h3>
                <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                  {filteredLibrary.length} exercice
                  {filteredLibrary.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Search */}
              <div className="relative mt-3">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Rechercher squat, VMA, gainage..."
                  className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Category filters */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Tous' },
                    { id: 'strength', label: 'Renforcement' },
                    { id: 'running', label: 'Running' },
                    { id: 'mobility', label: 'Mobilité' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setLibraryCategory(cat.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      libraryCategory === cat.id
                        ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Goal filter */}
              {effectiveGoalText && (
                <button
                  type="button"
                  onClick={() => setMatchGoalOnly((prev) => !prev)}
                  className={`mt-2.5 inline-flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    matchGoalOnly
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Sparkles
                      className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <span className="truncate font-medium">
                      Adapter à l’objectif : {effectiveGoalText}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] font-bold uppercase">
                    {matchGoalOnly ? 'Actif' : 'Filtrer'}
                  </span>
                </button>
              )}

              {/* Library cards list */}
              <div className="mt-3 space-y-2.5 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                {filteredLibrary.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Aucun exercice ne correspond à ce filtre.
                  </div>
                ) : (
                  filteredLibrary.map((ex) => {
                    const meta = getExerciseCategoryMeta(ex.category);
                    const isRecommended =
                      Boolean(effectiveGoalText) &&
                      doesExerciseMatchGoal(ex, effectiveGoalText);
                    const addedCount = programExercises.filter(
                      (p) => p.exerciseId === ex.id
                    ).length;

                    return (
                      <div
                        key={ex.id}
                        className={`rounded-xl border bg-white p-3 transition-colors dark:bg-slate-900 ${
                          isRecommended
                            ? 'border-emerald-200 dark:border-emerald-900/70'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
                              >
                                {ex.category === 'running' ? (
                                  <Footprints
                                    className="h-2.5 w-2.5"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Dumbbell
                                    className="h-2.5 w-2.5"
                                    aria-hidden="true"
                                  />
                                )}
                                {meta.shortLabel}
                              </span>
                              {isRecommended && (
                                <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  <Target
                                    className="h-2.5 w-2.5"
                                    aria-hidden="true"
                                  />
                                  Ciblé
                                </span>
                              )}
                            </div>
                            <p className="mt-1 font-display text-xs font-bold text-slate-900 dark:text-white">
                              {ex.name}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAddExercise(ex)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                          >
                            {addedCount > 0 ? (
                              <>
                                <Check className="h-3 w-3" aria-hidden="true" />
                                <span>+{addedCount}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="h-3 w-3" aria-hidden="true" />
                                <span>Ajouter</span>
                              </>
                            )}
                          </button>
                        </div>

                        <p className="mt-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {formatExerciseParamsSummary(ex.defaultParams)}
                        </p>

                        {ex.targetObjectives.length > 0 && (
                          <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-400">
                            Objectifs : {ex.targetObjectives.join(' · ')}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Member + Session Metadata + Configurable Exercises (7 cols) */}
            <div className="space-y-4 p-4 sm:p-5 lg:col-span-7 lg:overflow-y-auto">
              {/* Member & Objective Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="pb-member"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Adhérent destinataire *
                    </label>
                    {editingSession || initialMember ? (
                      <div className="mt-1 flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        <UserCheck
                          className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {selectedMember?.name ||
                            editingSession?.memberName ||
                            selectedMemberEmail}
                        </span>
                      </div>
                    ) : memberCandidates.length > 0 ? (
                      <select
                        id="pb-member"
                        value={selectedMemberEmail}
                        onChange={(e) => handleSelectMember(e.target.value)}
                        required
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">Sélectionner un adhérent...</option>
                        {memberCandidates.map((m) => (
                          <option key={m.emailKey} value={m.email}>
                            {m.name} ({m.email})
                            {m.goal ? ` · ${m.goal}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <input
                          id="pb-member"
                          type="email"
                          required
                          value={selectedMemberEmail}
                          onChange={(e) => setSelectedMemberEmail(e.target.value)}
                          placeholder="email.adherent@exemple.fr"
                          className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Aucun adhérent répertorié pour l’instant : saisissez directement l’adresse email de l’adhérent ou créez sa fiche dans l’onglet Adhérents.
                        </p>
                      </div>
                    )}
                    {selectedMember && (selectedMember.goal || selectedMember.fitnessLevel) && (
                      <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                        {selectedMember.goal
                          ? `Objectif profil : ${selectedMember.goal}`
                          : ''}
                        {selectedMember.goal && selectedMember.fitnessLevel
                          ? ' · '
                          : ''}
                        {selectedMember.fitnessLevel
                          ? `Niveau : ${fitnessLevelLabel(selectedMember.fitnessLevel)}`
                          : ''}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="pb-objective"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Objectif du programme
                    </label>
                    <input
                      id="pb-objective"
                      type="text"
                      maxLength={VALIDATION_LIMITS.SESSION_OBJECTIVE_MAX}
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Ex. 10 km sous 45 min, Renforcement dos..."
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="pb-title"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Titre de la séance *
                    </label>
                    <input
                      id="pb-title"
                      type="text"
                      required
                      minLength={VALIDATION_LIMITS.TITLE_MIN}
                      maxLength={VALIDATION_LIMITS.TITLE_MAX}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex. Séance Renforcement + VMA"
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pb-discipline"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Discipline *
                    </label>
                    <select
                      id="pb-discipline"
                      value={discipline}
                      onChange={(e) => setDiscipline(e.target.value)}
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {disciplineOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="pb-date"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Date *
                    </label>
                    <input
                      id="pb-date"
                      type="date"
                      required
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pb-time"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Heure de début *
                    </label>
                    <input
                      id="pb-time"
                      type="time"
                      required
                      value={sessionTime}
                      onChange={(e) => setSessionTime(e.target.value)}
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <label
                        htmlFor="pb-duration"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Durée (min) *
                      </label>
                      {programExercises.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDurationMinutes(estimatedMinutes)}
                          className="text-[10px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
                        >
                          Est. ~{estimatedMinutes} min
                        </button>
                      )}
                    </div>
                    <select
                      id="pb-duration"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {!DURATION_PRESETS.includes(durationMinutes) && (
                        <option value={durationMinutes}>
                          {durationMinutes} min
                        </option>
                      )}
                      {DURATION_PRESETS.map((min) => (
                        <option key={min} value={min}>
                          {min} min
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Exercises in Program */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Exercices du programme ({programExercises.length}/
                    {VALIDATION_LIMITS.SESSION_EXERCISES_MAX})
                  </h3>
                  {programExercises.length > 0 && (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      Charge estimée : ~{estimatedMinutes} min
                    </span>
                  )}
                </div>

                {programExercises.length === 0 ? (
                  <div className="mt-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-400">
                    Cliquez sur <strong>+ Ajouter</strong> dans la bibliothèque à
                    gauche pour intégrer et paramétrer vos exercices de
                    renforcement ou de running.
                  </div>
                ) : (
                  <div className="mt-2.5 space-y-3">
                    {programExercises.map((item, idx) => {
                      const meta = getExerciseCategoryMeta(item.category);
                      return (
                        <div
                          key={`${item.exerciseId}-${idx}`}
                          className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 font-mono text-[11px] font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                                {idx + 1}
                              </span>
                              <span
                                className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
                              >
                                {meta.shortLabel}
                              </span>
                              <span className="truncate font-display text-sm font-bold text-slate-900 dark:text-white">
                                {item.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveItem(idx, -1)}
                                aria-label="Monter l’exercice"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 dark:border-slate-700 dark:text-slate-400 cursor-pointer"
                              >
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === programExercises.length - 1}
                                onClick={() => handleMoveItem(idx, 1)}
                                aria-label="Descendre l’exercice"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 dark:border-slate-700 dark:text-slate-400 cursor-pointer"
                              >
                                <ArrowDown
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateItem(idx)}
                                aria-label="Dupliquer l’exercice"
                                title="Dupliquer"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 cursor-pointer"
                              >
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                aria-label="Retirer l’exercice"
                                title="Retirer"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {/* 5 Numeric Parameters */}
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Répétitions
                              </label>
                              <input
                                type="number"
                                min={VALIDATION_LIMITS.EXERCISE_REPS_MIN}
                                max={VALIDATION_LIMITS.EXERCISE_REPS_MAX}
                                value={item.repetitions}
                                onChange={(e) =>
                                  handleUpdateItemField(
                                    idx,
                                    'repetitions',
                                    Math.min(
                                      VALIDATION_LIMITS.EXERCISE_REPS_MAX,
                                      Math.max(
                                        VALIDATION_LIMITS.EXERCISE_REPS_MIN,
                                        Math.round(Number(e.target.value) || 0)
                                      )
                                    )
                                  )
                                }
                                className="mt-1 min-h-[34px] w-full rounded-md border border-slate-300 bg-slate-50 px-2 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Durée (sec)
                              </label>
                              <input
                                type="number"
                                min={VALIDATION_LIMITS.EXERCISE_DURATION_MIN}
                                max={VALIDATION_LIMITS.EXERCISE_DURATION_MAX}
                                value={item.durationSeconds}
                                onChange={(e) =>
                                  handleUpdateItemField(
                                    idx,
                                    'durationSeconds',
                                    Math.min(
                                      VALIDATION_LIMITS.EXERCISE_DURATION_MAX,
                                      Math.max(
                                        VALIDATION_LIMITS.EXERCISE_DURATION_MIN,
                                        Math.round(Number(e.target.value) || 0)
                                      )
                                    )
                                  )
                                }
                                className="mt-1 min-h-[34px] w-full rounded-md border border-slate-300 bg-slate-50 px-2 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Nb tours
                              </label>
                              <input
                                type="number"
                                min={VALIDATION_LIMITS.EXERCISE_ROUNDS_MIN}
                                max={VALIDATION_LIMITS.EXERCISE_ROUNDS_MAX}
                                value={item.setsOrRounds}
                                onChange={(e) =>
                                  handleUpdateItemField(
                                    idx,
                                    'setsOrRounds',
                                    Math.min(
                                      VALIDATION_LIMITS.EXERCISE_ROUNDS_MAX,
                                      Math.max(
                                        VALIDATION_LIMITS.EXERCISE_ROUNDS_MIN,
                                        Math.round(Number(e.target.value) || 1)
                                      )
                                    )
                                  )
                                }
                                className="mt-1 min-h-[34px] w-full rounded-md border border-slate-300 bg-slate-50 px-2 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Pause (sec)
                              </label>
                              <input
                                type="number"
                                min={VALIDATION_LIMITS.EXERCISE_PAUSE_MIN}
                                max={VALIDATION_LIMITS.EXERCISE_PAUSE_MAX}
                                value={item.intraSetPauseSeconds}
                                onChange={(e) =>
                                  handleUpdateItemField(
                                    idx,
                                    'intraSetPauseSeconds',
                                    Math.min(
                                      VALIDATION_LIMITS.EXERCISE_PAUSE_MAX,
                                      Math.max(
                                        VALIDATION_LIMITS.EXERCISE_PAUSE_MIN,
                                        Math.round(Number(e.target.value) || 0)
                                      )
                                    )
                                  )
                                }
                                className="mt-1 min-h-[34px] w-full rounded-md border border-slate-300 bg-slate-50 px-2 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Repos (sec)
                              </label>
                              <input
                                type="number"
                                min={VALIDATION_LIMITS.EXERCISE_REST_MIN}
                                max={VALIDATION_LIMITS.EXERCISE_REST_MAX}
                                value={item.restBetweenRoundsSeconds}
                                onChange={(e) =>
                                  handleUpdateItemField(
                                    idx,
                                    'restBetweenRoundsSeconds',
                                    Math.min(
                                      VALIDATION_LIMITS.EXERCISE_REST_MAX,
                                      Math.max(
                                        VALIDATION_LIMITS.EXERCISE_REST_MIN,
                                        Math.round(Number(e.target.value) || 0)
                                      )
                                    )
                                  )
                                }
                                className="mt-1 min-h-[34px] w-full rounded-md border border-slate-300 bg-slate-50 px-2 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              />
                            </div>
                          </div>

                          <div className="mt-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-center">
                            <input
                              type="text"
                              maxLength={
                                VALIDATION_LIMITS.SESSION_EXERCISE_NOTES_MAX
                              }
                              value={item.notes}
                              onChange={(e) =>
                                handleUpdateItemField(idx, 'notes', e.target.value)
                              }
                              placeholder="Consigne / charge / allure (ex. 12 kg, 90% VMA...)"
                              className="min-h-[34px] flex-1 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
                            />
                            <span className="shrink-0 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                              {formatExerciseParamsSummary(item)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Optional location & general notes */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="pb-coach"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Coach référent
                  </label>
                  {isPrimaryCoach ? (
                    <select
                      id="pb-coach"
                      value={coachRefUid}
                      onChange={(e) => handleCoachRefChange(e.target.value)}
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {coachName &&
                        !coachDirectory.some((c) => c.uid === coachUid) && (
                          <option value={coachUid}>{coachName}</option>
                        )}
                      {coachDirectory.map((c) => (
                        <option key={c.uid} value={c.uid}>
                          {c.displayName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      id="pb-coach"
                      className="mt-1 flex min-h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                    >
                      {coachName || editingSession?.coachName || 'Coach'}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="pb-location"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Lieu (optionnel)
                  </label>
                  <input
                    id="pb-location"
                    type="text"
                    maxLength={VALIDATION_LIMITS.LOCATION_MAX}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ex. Piste, Salle, Domicile..."
                    className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="pb-notes"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Consignes générales de la séance (échauffement / retour au calme)
                </label>
                <textarea
                  id="pb-notes"
                  rows={2}
                  maxLength={VALIDATION_LIMITS.SCHEDULE_NOTES_MAX}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex. 10 min d’échauffement progressif avant le bloc principal..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Pricing: Free (offert) or Paid */}
              <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CreditCard
                      className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Tarification du programme personnalisé
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Programme gratuit ou payant"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-200/80 p-1 dark:bg-slate-900"
                  >
                    <button
                      type="button"
                      onClick={() => setIsPaid(false)}
                      className={`min-h-[28px] rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                        !isPaid
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      Offert (gratuit)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPaid(true)}
                      className={`min-h-[28px] rounded-md px-2.5 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                        isPaid
                          ? 'bg-emerald-700 text-white shadow-xs dark:bg-emerald-600'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      Payant
                    </button>
                  </div>
                </div>

                {isPaid ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="pb-price"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                        >
                          Tarif (€) *
                        </label>
                        <input
                          id="pb-price"
                          type="number"
                          min={1}
                          max={2000}
                          step="0.50"
                          required
                          value={priceEuros}
                          onChange={(e) => {
                            setPriceTouched(true);
                            setPriceEuros(e.target.value);
                          }}
                          className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                        {hasCoachCustomSessionPrice(selectedCoachEntry?.pricing) && (
                          <button
                            type="button"
                            onClick={() => {
                              setPriceEuros(
                                (
                                  getCoachCustomSessionPriceCents(
                                    selectedCoachEntry?.pricing
                                  ) / 100
                                ).toFixed(2)
                              );
                              setPriceTouched(false);
                            }}
                            className="mt-1 text-left text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
                          >
                            Tarif de {selectedCoachEntry?.displayName || coachName} :{' '}
                            {formatPriceEuros(
                              getCoachCustomSessionPriceCents(
                                selectedCoachEntry?.pricing
                              )
                            )}
                          </button>
                        )}
                      </div>
                      <div>
                        <label
                          htmlFor="pb-pay-mode"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                        >
                          Mode de règlement *
                        </label>
                        <select
                          id="pb-pay-mode"
                          value={paymentMode}
                          onChange={(e) =>
                            setPaymentMode(e.target.value as EventPaymentMode)
                          }
                          className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="both">Carte en ligne ou sur place</option>
                          <option value="online">Carte en ligne uniquement</option>
                          <option value="onsite">Sur place uniquement</option>
                        </select>
                      </div>
                    </div>
                    {!editingSession && (
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={markPaid}
                          onChange={(e) => setMarkPaid(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                        />
                        <span>L’adhérent a déjà réglé sur place (débloquer immédiatement)</span>
                      </label>
                    )}
                  </>
                ) : (
                  <p className="rounded-lg border border-emerald-200/70 bg-white/80 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800/60 dark:bg-slate-900/60 dark:text-emerald-200">
                    Programme offert : aucun paiement demandé à l’adhérent (accès immédiat aux exercices).
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Le programme apparaîtra automatiquement dans l’espace{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                Mon suivi → Planning de la semaine
              </strong>{' '}
              de l’adhérent.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                {saving
                  ? 'Enregistrement...'
                  : editingSession
                    ? 'Enregistrer le programme'
                    : 'Ajouter au planning de l’adhérent'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
