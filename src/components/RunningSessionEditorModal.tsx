import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Copy,
  Dumbbell,
  Footprints,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  ExerciseCategory,
  ExerciseLibraryItem,
  ScheduledExerciseItem,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';
import {
  clearTrainingProgramSessionOverride,
  saveProgramSessionExercisesOverride,
} from '../services/firestoreService';
import { formatFrenchDateShort } from '../utils/dateAndValidation';
import {
  formatExerciseParamsSummary,
  getExerciseCategoryMeta,
  STARTER_EXERCISES,
} from '../utils/exerciseLibrary';
import {
  estimateExercisesDurationMinutes,
  GeneratedProgramSession,
  generateRunningProgramSessions,
  RUNNING_DISTANCE_TEMPLATES,
} from '../utils/runningProgramGenerator';

interface UnifiedLibraryOption {
  id: string;
  name: string;
  category: ExerciseCategory;
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

interface RunningSessionEditorModalProps {
  program: TrainingProgram;
  exercises: ExerciseLibraryItem[];
  initialSessionKey?: string;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

function cloneExercises(items: ScheduledExerciseItem[]): ScheduledExerciseItem[] {
  return items.map((ex) => ({ ...ex }));
}

function serializeDraft(
  title: string,
  durationMinutes: number,
  coachNotes: string,
  items: ScheduledExerciseItem[]
): string {
  return JSON.stringify({
    title: title.trim(),
    durationMinutes,
    coachNotes: coachNotes.trim(),
    items,
  });
}

export function RunningSessionEditorModal({
  program,
  exercises,
  initialSessionKey,
  onClose,
  onSaved,
}: RunningSessionEditorModalProps) {
  const generatedSessions = useMemo(
    () =>
      generateRunningProgramSessions(program).filter((s) => s.weekNumber >= 1),
    [program]
  );

  const initialKey = useMemo(() => {
    if (
      initialSessionKey &&
      generatedSessions.some((s) => s.key === initialSessionKey)
    ) {
      return initialSessionKey;
    }
    return generatedSessions[0]?.key ?? 'w1-s1';
  }, [initialSessionKey, generatedSessions]);

  const [selectedSessionKey, setSelectedSessionKey] =
    useState<string>(initialKey);

  const activeSession: GeneratedProgramSession | undefined = useMemo(
    () =>
      generatedSessions.find((s) => s.key === selectedSessionKey) ??
      generatedSessions[0],
    [generatedSessions, selectedSessionKey]
  );

  const totalWeeks = program.durationWeeks || 12;
  const [selectedWeek, setSelectedWeek] = useState<number>(
    activeSession?.weekNumber ?? 1
  );

  const sessionsInWeek = useMemo(
    () => generatedSessions.filter((s) => s.weekNumber === selectedWeek),
    [generatedSessions, selectedWeek]
  );

  // Form draft for the active session
  const [sessionTitle, setSessionTitle] = useState<string>(
    activeSession?.title ?? ''
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(
    activeSession?.durationMinutes ?? 45
  );
  const [coachNotes, setCoachNotes] = useState<string>(
    activeSession?.coachNotes ?? ''
  );
  const [sessionExercises, setSessionExercises] = useState<
    ScheduledExerciseItem[]
  >(() => cloneExercises(activeSession?.exercises ?? []));

  const [baselineSnapshot, setBaselineSnapshot] = useState<string>(() =>
    serializeDraft(
      activeSession?.title ?? '',
      activeSession?.durationMinutes ?? 45,
      activeSession?.coachNotes ?? '',
      activeSession?.exercises ?? []
    )
  );

  // Sync draft when activeSession changes (either after switching key or after Firestore update)
  useEffect(() => {
    if (!activeSession) return;
    setSelectedWeek(activeSession.weekNumber);
    setSessionTitle(activeSession.title);
    setDurationMinutes(activeSession.durationMinutes);
    setCoachNotes(activeSession.coachNotes);
    const cloned = cloneExercises(activeSession.exercises);
    setSessionExercises(cloned);
    setBaselineSnapshot(
      serializeDraft(
        activeSession.title,
        activeSession.durationMinutes,
        activeSession.coachNotes,
        cloned
      )
    );
    setReplacingIndex(null);
  }, [
    activeSession?.key,
    activeSession?.title,
    activeSession?.durationMinutes,
    activeSession?.coachNotes,
    activeSession?.exercises,
    activeSession?.isCustomized,
  ]);

  const isDirty = useMemo(
    () =>
      serializeDraft(
        sessionTitle,
        durationMinutes,
        coachNotes,
        sessionExercises
      ) !== baselineSnapshot,
    [sessionTitle, durationMinutes, coachNotes, sessionExercises, baselineSnapshot]
  );

  // Library search, category & mobile view toggle
  const [mobilePane, setMobilePane] = useState<'session' | 'library'>('session');
  const [libSearch, setLibSearch] = useState('');
  const [libCategory, setLibCategory] = useState<'all' | ExerciseCategory>('all');
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [keepReplacedParams, setKeepReplacedParams] = useState<boolean>(false);

  // Quick custom exercise creator
  const [customFormOpen, setCustomFormOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] =
    useState<ExerciseCategory>('running');
  const [customReps, setCustomReps] = useState(8);
  const [customDurationSec, setCustomDurationSec] = useState(30);
  const [customRounds, setCustomRounds] = useState(2);
  const [customPauseSec, setCustomPauseSec] = useState(20);
  const [customRestSec, setCustomRestSec] = useState(90);
  const [customNotes, setCustomNotes] = useState('');

  // Pending navigation prompt if user switches session while dirty
  const [pendingSwitchKey, setPendingSwitchKey] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const unifiedLibrary = useMemo<UnifiedLibraryOption[]>(() => {
    const storedMap = new Map<string, UnifiedLibraryOption>();
    for (const ex of exercises) {
      storedMap.set(ex.name.trim().toLowerCase(), {
        id: ex.id,
        name: ex.name,
        category: ex.category,
        description: ex.description,
        intensityHint: ex.intensityHint,
        defaultParams: ex.defaultParams,
        isPresetOnly: false,
      });
    }
    const result: UnifiedLibraryOption[] = Array.from(storedMap.values());
    for (const preset of STARTER_EXERCISES) {
      const key = preset.name.trim().toLowerCase();
      if (!storedMap.has(key)) {
        result.push({
          id: preset.presetId,
          name: preset.name,
          category: preset.category,
          description: preset.description,
          intensityHint: preset.intensityHint,
          defaultParams: preset.defaultParams,
          isPresetOnly: true,
        });
      }
    }
    return result;
  }, [exercises]);

  const filteredLibrary = useMemo(() => {
    const q = libSearch.trim().toLowerCase();
    return unifiedLibrary.filter((item) => {
      if (libCategory !== 'all' && item.category !== libCategory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.intensityHint ?? '').toLowerCase().includes(q)
      );
    });
  }, [unifiedLibrary, libSearch, libCategory]);

  const estimatedMinutes = useMemo(
    () => estimateExercisesDurationMinutes(sessionExercises),
    [sessionExercises]
  );

  const handleRequestSessionSwitch = (nextKey: string) => {
    if (nextKey === selectedSessionKey) return;
    setFeedback(null);
    if (isDirty) {
      setPendingSwitchKey(nextKey);
      return;
    }
    setSelectedSessionKey(nextKey);
  };

  const handleSelectWeek = (weekNum: number) => {
    setSelectedWeek(weekNum);
    const firstInWeek = generatedSessions.find((s) => s.weekNumber === weekNum);
    if (firstInWeek) {
      handleRequestSessionSwitch(firstInWeek.key);
    }
  };

  const buildScheduledFromLibrary = (
    option: UnifiedLibraryOption
  ): ScheduledExerciseItem => ({
    exerciseId: option.id,
    name: option.name,
    category: option.category,
    repetitions: option.defaultParams.repetitions,
    durationSeconds: option.defaultParams.durationSeconds,
    setsOrRounds: option.defaultParams.setsOrRounds,
    intraSetPauseSeconds: option.defaultParams.intraSetPauseSeconds,
    restBetweenRoundsSeconds: option.defaultParams.restBetweenRoundsSeconds,
    notes: option.intensityHint ?? '',
  });

  const handlePickFromLibrary = (option: UnifiedLibraryOption) => {
    setFeedback(null);
    if (replacingIndex !== null && replacingIndex < sessionExercises.length) {
      const current = sessionExercises[replacingIndex];
      const replacement: ScheduledExerciseItem = keepReplacedParams
        ? {
            ...current,
            exerciseId: option.id,
            name: option.name,
            category: option.category,
          }
        : buildScheduledFromLibrary(option);
      setSessionExercises((prev) =>
        prev.map((item, idx) => (idx === replacingIndex ? replacement : item))
      );
      setReplacingIndex(null);
      setMobilePane('session');
      return;
    }

    if (sessionExercises.length >= VALIDATION_LIMITS.SESSION_EXERCISES_MAX) {
      setFeedback({
        type: 'error',
        text: `Maximum ${VALIDATION_LIMITS.SESSION_EXERCISES_MAX} exercices par séance.`,
      });
      return;
    }
    setSessionExercises((prev) => [...prev, buildScheduledFromLibrary(option)]);
    setMobilePane('session');
  };

  const handleAddOrReplaceCustomExercise = () => {
    const cleanName = customName.trim().slice(0, VALIDATION_LIMITS.EXERCISE_NAME_MAX);
    if (cleanName.length < VALIDATION_LIMITS.EXERCISE_NAME_MIN) {
      setFeedback({
        type: 'error',
        text: 'Le nom de l’exercice libre doit contenir au moins 2 caractères.',
      });
      return;
    }
    const newItem: ScheduledExerciseItem = {
      exerciseId: `custom-${Date.now().toString(36)}`,
      name: cleanName,
      category: customCategory,
      repetitions: Math.min(
        VALIDATION_LIMITS.EXERCISE_REPS_MAX,
        Math.max(VALIDATION_LIMITS.EXERCISE_REPS_MIN, Math.round(customReps || 0))
      ),
      durationSeconds: Math.min(
        VALIDATION_LIMITS.EXERCISE_DURATION_MAX,
        Math.max(
          VALIDATION_LIMITS.EXERCISE_DURATION_MIN,
          Math.round(customDurationSec || 0)
        )
      ),
      setsOrRounds: Math.min(
        VALIDATION_LIMITS.EXERCISE_ROUNDS_MAX,
        Math.max(
          VALIDATION_LIMITS.EXERCISE_ROUNDS_MIN,
          Math.round(customRounds || 1)
        )
      ),
      intraSetPauseSeconds: Math.min(
        VALIDATION_LIMITS.EXERCISE_PAUSE_MAX,
        Math.max(
          VALIDATION_LIMITS.EXERCISE_PAUSE_MIN,
          Math.round(customPauseSec || 0)
        )
      ),
      restBetweenRoundsSeconds: Math.min(
        VALIDATION_LIMITS.EXERCISE_REST_MAX,
        Math.max(
          VALIDATION_LIMITS.EXERCISE_REST_MIN,
          Math.round(customRestSec || 0)
        )
      ),
      notes: customNotes.trim().slice(0, VALIDATION_LIMITS.SESSION_EXERCISE_NOTES_MAX),
    };

    if (replacingIndex !== null && replacingIndex < sessionExercises.length) {
      const current = sessionExercises[replacingIndex];
      const finalItem = keepReplacedParams
        ? {
            ...current,
            exerciseId: newItem.exerciseId,
            name: newItem.name,
            category: newItem.category,
          }
        : newItem;
      setSessionExercises((prev) =>
        prev.map((item, idx) => (idx === replacingIndex ? finalItem : item))
      );
      setReplacingIndex(null);
    } else {
      if (sessionExercises.length >= VALIDATION_LIMITS.SESSION_EXERCISES_MAX) {
        setFeedback({
          type: 'error',
          text: `Maximum ${VALIDATION_LIMITS.SESSION_EXERCISES_MAX} exercices par séance.`,
        });
        return;
      }
      setSessionExercises((prev) => [...prev, newItem]);
    }

    setCustomName('');
    setCustomNotes('');
    setCustomFormOpen(false);
    setMobilePane('session');
  };

  const handleUpdateExerciseField = <K extends keyof ScheduledExerciseItem>(
    idx: number,
    field: K,
    value: ScheduledExerciseItem[K]
  ) => {
    setSessionExercises((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const handleMoveExercise = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= sessionExercises.length) return;
    setSessionExercises((prev) => {
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next;
    });
    if (replacingIndex === idx) setReplacingIndex(target);
  };

  const handleDuplicateExercise = (idx: number) => {
    if (sessionExercises.length >= VALIDATION_LIMITS.SESSION_EXERCISES_MAX) return;
    setSessionExercises((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, { ...prev[idx] });
      return next;
    });
  };

  const handleRemoveExercise = (idx: number) => {
    setSessionExercises((prev) => prev.filter((_, i) => i !== idx));
    if (replacingIndex === idx) {
      setReplacingIndex(null);
    } else if (replacingIndex !== null && replacingIndex > idx) {
      setReplacingIndex(replacingIndex - 1);
    }
  };

  const handleStartReplace = (idx: number) => {
    setReplacingIndex((prev) => (prev === idx ? null : idx));
    setMobilePane('library');
  };

  const saveCurrentSession = async (): Promise<boolean> => {
    if (!activeSession) return false;
    setFeedback(null);

    const cleanTitle = sessionTitle.trim();
    if (cleanTitle.length < VALIDATION_LIMITS.TITLE_MIN) {
      setFeedback({
        type: 'error',
        text: 'Le titre de la séance doit contenir au moins 2 caractères.',
      });
      return false;
    }

    for (const ex of sessionExercises) {
      if (ex.name.trim().length < VALIDATION_LIMITS.EXERCISE_NAME_MIN) {
        setFeedback({
          type: 'error',
          text: 'Chaque exercice doit avoir un nom d’au moins 2 caractères.',
        });
        return false;
      }
    }

    setSaving(true);
    try {
      await saveProgramSessionExercisesOverride({
        program,
        sessionKey: activeSession.key,
        title: cleanTitle,
        durationMinutes,
        coachNotes,
        exercises: sessionExercises,
      });
      const snapshot = serializeDraft(
        cleanTitle,
        durationMinutes,
        coachNotes,
        sessionExercises
      );
      setBaselineSnapshot(snapshot);
      const msg = `Séance S${activeSession.weekNumber}·#${activeSession.sessionIndexInWeek} (« ${cleanTitle} ») enregistrée.`;
      setFeedback({ type: 'success', text: msg });
      onSaved?.(msg);
      return true;
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’enregistrer les modifications de la séance.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await saveCurrentSession();
  };

  const handleResetToDefault = async () => {
    if (!activeSession) return;
    setResetting(true);
    setFeedback(null);
    try {
      await clearTrainingProgramSessionOverride({
        program,
        sessionKey: activeSession.key,
      });
      const msg = `Séance S${activeSession.weekNumber}·#${activeSession.sessionIndexInWeek} réinitialisée selon le plan d’origine.`;
      setFeedback({ type: 'success', text: msg });
      onSaved?.(msg);
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de réinitialiser cette séance.',
      });
    } finally {
      setResetting(false);
    }
  };

  const tpl = RUNNING_DISTANCE_TEMPLATES[program.distance];
  const customizedCount = program.sessionOverrides?.length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="running-session-editor-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
              <Footprints className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="running-session-editor-title"
                className="font-display text-base font-bold text-slate-900 dark:text-white truncate sm:text-lg"
              >
                Personnaliser les séances · {program.memberName}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                {program.title} · {tpl.shortLabel} ({totalWeeks} sem. ·{' '}
                {program.sessionsPerWeek} séances/sem.)
                {customizedCount > 0
                  ? ` · ${customizedCount} séance(s) personnalisée(s)`
                  : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Week & Session Navigator */}
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60 space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1">
              Semaines :
            </span>
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((wk) => {
              const hasCustomInWeek = generatedSessions.some(
                (s) => s.weekNumber === wk && s.isCustomized
              );
              const isSelected = selectedWeek === wk;
              return (
                <button
                  key={wk}
                  type="button"
                  onClick={() => handleSelectWeek(wk)}
                  className={`relative inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-[11px] font-bold transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-500 dark:bg-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>S{wk}</span>
                  {hasCustomInWeek && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isSelected ? 'bg-amber-300' : 'bg-amber-500'
                      }`}
                      title="Contient au moins une séance personnalisée"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1">
              Séances S{selectedWeek} :
            </span>
            {sessionsInWeek.map((sess) => {
              const active = sess.key === activeSession?.key;
              return (
                <button
                  key={sess.key}
                  type="button"
                  onClick={() => handleRequestSessionSwitch(sess.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left text-[11px] transition-colors cursor-pointer ${
                    active
                      ? 'border-sky-600 bg-sky-600 font-semibold text-white'
                      : 'border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span className="font-mono font-bold">
                    #{sess.sessionIndexInWeek}
                  </span>
                  <span className="max-w-[170px] truncate">{sess.title}</span>
                  <span
                    className={`font-mono text-[10px] ${
                      active ? 'text-sky-100' : 'text-slate-400'
                    }`}
                  >
                    ({sess.exercises.length} ex.)
                  </span>
                  {sess.isCustomized && (
                    <span
                      className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                        active
                          ? 'bg-amber-400/25 text-amber-100'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}
                    >
                      Modifiée
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {pendingSwitchKey && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              <span className="font-medium">
                Vous avez des modifications non enregistrées sur la séance actuelle.
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const ok = await saveCurrentSession();
                    if (ok && pendingSwitchKey) {
                      setSelectedSessionKey(pendingSwitchKey);
                      setPendingSwitchKey(null);
                    }
                  }}
                  className="rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 cursor-pointer"
                >
                  Enregistrer et changer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextKey = pendingSwitchKey;
                    setPendingSwitchKey(null);
                    if (nextKey) setSelectedSessionKey(nextKey);
                  }}
                  className="rounded-md border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-amber-200 cursor-pointer"
                >
                  Ignorer
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSwitchKey(null)}
                  className="rounded-md px-2 py-1 text-[11px] text-slate-600 hover:text-slate-900 dark:text-slate-300 cursor-pointer"
                >
                  Rester
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile pane switcher */}
        <div className="flex border-b border-slate-200 bg-white px-5 py-2 lg:hidden dark:border-slate-800 dark:bg-slate-900">
          <div className="grid w-full grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMobilePane('session')}
              className={`min-h-[34px] rounded-md px-3 text-xs font-semibold cursor-pointer ${
                mobilePane === 'session'
                  ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Séance ({sessionExercises.length} ex.)
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('library')}
              className={`min-h-[34px] rounded-md px-3 text-xs font-semibold cursor-pointer ${
                mobilePane === 'library'
                  ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {replacingIndex !== null
                ? 'Choisir remplaçant'
                : 'Bibliothèque (+)'}
            </button>
          </div>
        </div>

        {/* Main Body */}
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
            {/* LEFT PANE: Exercise Library + Quick Custom */}
            <aside
              className={`flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 lg:col-span-5 lg:border-b-0 lg:border-r dark:border-slate-800 dark:bg-slate-950/50 ${
                mobilePane === 'library' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              <div className="border-b border-slate-200 p-4 space-y-2.5 dark:border-slate-800">
                {replacingIndex !== null && sessionExercises[replacingIndex] && (
                  <div className="rounded-lg border border-sky-300 bg-sky-50 p-2.5 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-snug">
                        Remplacer l’exercice #{replacingIndex + 1} : «{' '}
                        {sessionExercises[replacingIndex].name} »
                      </p>
                      <button
                        type="button"
                        onClick={() => setReplacingIndex(null)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/60 cursor-pointer"
                      >
                        Annuler
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={keepReplacedParams}
                        onChange={(e) => setKeepReplacedParams(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-sky-400 text-sky-600 focus:ring-sky-600"
                      />
                      <span>
                        Conserver les paramètres actuels (rép., durée, tours, pause, repos)
                      </span>
                    </label>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Bibliothèque d’exercices
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomFormOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    <span>{customFormOpen ? 'Fermer libre' : 'Exercice libre'}</span>
                  </button>
                </div>

                {customFormOpen && (
                  <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-2 dark:border-emerald-900 dark:bg-slate-900">
                    <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                      {replacingIndex !== null
                        ? `Remplacer #${replacingIndex + 1} par un exercice sur mesure`
                        : 'Créer et ajouter un exercice sur mesure'}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        type="text"
                        maxLength={VALIDATION_LIMITS.EXERCISE_NAME_MAX}
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Nom de l'exercice..."
                        className="sm:col-span-2 min-h-[34px] rounded-md border border-slate-300 bg-slate-50 px-2.5 text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <select
                        value={customCategory}
                        onChange={(e) =>
                          setCustomCategory(e.target.value as ExerciseCategory)
                        }
                        className="min-h-[34px] rounded-md border border-slate-300 bg-slate-50 px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="running">Running</option>
                        <option value="strength">Renforcement</option>
                        <option value="mobility">Mobilité</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      <div>
                        <label className="block text-[9px] font-semibold uppercase text-slate-500">
                          Rép.
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={customReps}
                          onChange={(e) =>
                            setCustomReps(Math.max(0, Number(e.target.value) || 0))
                          }
                          className="mt-0.5 min-h-[30px] w-full rounded border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold uppercase text-slate-500">
                          Durée(s)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={7200}
                          value={customDurationSec}
                          onChange={(e) =>
                            setCustomDurationSec(
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="mt-0.5 min-h-[30px] w-full rounded border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold uppercase text-slate-500">
                          Tours
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={customRounds}
                          onChange={(e) =>
                            setCustomRounds(
                              Math.max(1, Number(e.target.value) || 1)
                            )
                          }
                          className="mt-0.5 min-h-[30px] w-full rounded border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold uppercase text-slate-500">
                          Pause(s)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={600}
                          value={customPauseSec}
                          onChange={(e) =>
                            setCustomPauseSec(
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="mt-0.5 min-h-[30px] w-full rounded border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-semibold uppercase text-slate-500">
                          Repos(s)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={1800}
                          value={customRestSec}
                          onChange={(e) =>
                            setCustomRestSec(
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="mt-0.5 min-h-[30px] w-full rounded border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-semibold dark:border-slate-700 dark:bg-slate-800"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={VALIDATION_LIMITS.SESSION_EXERCISE_NOTES_MAX}
                        value={customNotes}
                        onChange={(e) => setCustomNotes(e.target.value)}
                        placeholder="Consigne / allure (optionnel)..."
                        className="min-h-[32px] flex-1 rounded-md border border-slate-300 bg-slate-50 px-2 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleAddOrReplaceCustomExercise}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-md bg-emerald-700 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {replacingIndex !== null ? 'Remplacer' : 'Ajouter'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={libSearch}
                    onChange={(e) => setLibSearch(e.target.value)}
                    placeholder="Rechercher un exercice (VMA, squat, gainage...)"
                    className="min-h-[36px] w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: 'all', label: 'Tous' },
                      { key: 'running', label: 'Running' },
                      { key: 'strength', label: 'Renforcement' },
                      { key: 'mobility', label: 'Mobilité' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setLibCategory(cat.key)}
                      className={`min-h-[28px] rounded-md border px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer ${
                        libCategory === cat.key
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-500 dark:bg-emerald-600'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-3.5">
                {filteredLibrary.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Aucun exercice trouvé pour ce filtre.
                  </p>
                ) : (
                  filteredLibrary.map((opt) => {
                    const meta = getExerciseCategoryMeta(opt.category);
                    return (
                      <div
                        key={opt.id}
                        className="flex items-start justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
                            >
                              {meta.shortLabel}
                            </span>
                            <p className="font-display text-xs font-bold text-slate-900 dark:text-white truncate">
                              {opt.name}
                            </p>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {formatExerciseParamsSummary(opt.defaultParams)}
                          </p>
                          {opt.intensityHint && (
                            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {opt.intensityHint}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePickFromLibrary(opt)}
                          className={`inline-flex min-h-[30px] shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer ${
                            replacingIndex !== null
                              ? 'bg-sky-600 hover:bg-sky-700'
                              : 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                          }`}
                        >
                          {replacingIndex !== null ? (
                            <>
                              <RefreshCw className="h-3 w-3" aria-hidden="true" />
                              <span>Remplacer</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" aria-hidden="true" />
                              <span>Ajouter</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            {/* RIGHT PANE: Session Details & Editable Exercises */}
            <div
              className={`min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5 lg:col-span-7 space-y-4 ${
                mobilePane === 'session' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              {activeSession && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                        Semaine {activeSession.weekNumber} · Séance{' '}
                        {activeSession.sessionIndexInWeek} ·{' '}
                        {formatFrenchDateShort(activeSession.scheduledDate)}
                      </span>
                      <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {activeSession.focusLabel}
                      </span>
                      {activeSession.isCustomized && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Personnalisée
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      {activeSession.targetPaceLabel}
                    </p>
                  </div>

                  {activeSession.isCustomized && (
                    <button
                      type="button"
                      disabled={resetting || saving}
                      onClick={() => void handleResetToDefault()}
                      className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>
                        {resetting
                          ? 'Réinitialisation...'
                          : 'Réinitialiser d’origine'}
                      </span>
                    </button>
                  )}
                </div>
              )}

              {/* Session Title, Duration & Coach Notes */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-3">
                  <label
                    htmlFor="rse-title"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Titre de la séance *
                  </label>
                  <input
                    id="rse-title"
                    type="text"
                    required
                    minLength={VALIDATION_LIMITS.TITLE_MIN}
                    maxLength={VALIDATION_LIMITS.TITLE_MAX}
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1">
                    <label
                      htmlFor="rse-duration"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Durée (min)
                    </label>
                    {sessionExercises.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDurationMinutes(estimatedMinutes)}
                        className="text-[10px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
                      >
                        ~{estimatedMinutes}m
                      </button>
                    )}
                  </div>
                  <input
                    id="rse-duration"
                    type="number"
                    min={VALIDATION_LIMITS.DURATION_MIN}
                    max={VALIDATION_LIMITS.DURATION_MAX}
                    value={durationMinutes}
                    onChange={(e) =>
                      setDurationMinutes(
                        Math.min(
                          VALIDATION_LIMITS.DURATION_MAX,
                          Math.max(
                            VALIDATION_LIMITS.DURATION_MIN,
                            Math.round(Number(e.target.value) || 45)
                          )
                        )
                      )
                    }
                    className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-sm font-bold text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Exercises List */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-slate-900 dark:text-white">
                    <Dumbbell className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>
                      Exercices de la séance ({sessionExercises.length}/
                      {VALIDATION_LIMITS.SESSION_EXERCISES_MAX})
                    </span>
                  </h3>
                  {sessionExercises.length > 0 && (
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      Charge estimée : ~{estimatedMinutes} min
                    </span>
                  )}
                </div>

                {sessionExercises.length === 0 ? (
                  <div className="mt-2.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-400">
                    Aucun exercice dans cette séance. Utilisez{' '}
                    <strong>+ Ajouter</strong> ou <strong>Exercice libre</strong>{' '}
                    dans la bibliothèque pour composer les exercices.
                  </div>
                ) : (
                  <div className="mt-2.5 space-y-3">
                    {sessionExercises.map((item, idx) => {
                      const isBeingReplaced = replacingIndex === idx;
                      return (
                        <div
                          key={`${item.exerciseId}-${idx}`}
                          className={`rounded-xl border p-3.5 transition-colors ${
                            isBeingReplaced
                              ? 'border-sky-500 bg-sky-50/40 ring-2 ring-sky-500/20 dark:border-sky-500 dark:bg-sky-950/25'
                              : 'border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 font-mono text-[11px] font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                                {idx + 1}
                              </span>
                              <select
                                value={item.category}
                                aria-label={`Catégorie de l'exercice ${idx + 1}`}
                                onChange={(e) =>
                                  handleUpdateExerciseField(
                                    idx,
                                    'category',
                                    e.target.value as ExerciseCategory
                                  )
                                }
                                className="min-h-[30px] rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              >
                                <option value="running">Running</option>
                                <option value="strength">Renforcement</option>
                                <option value="mobility">Mobilité</option>
                              </select>
                              <input
                                type="text"
                                minLength={VALIDATION_LIMITS.EXERCISE_NAME_MIN}
                                maxLength={VALIDATION_LIMITS.EXERCISE_NAME_MAX}
                                value={item.name}
                                aria-label={`Nom de l'exercice ${idx + 1}`}
                                onChange={(e) =>
                                  handleUpdateExerciseField(
                                    idx,
                                    'name',
                                    e.target.value
                                  )
                                }
                                className="min-h-[32px] min-w-[140px] flex-1 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 font-display text-xs font-bold text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              />
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveExercise(idx, -1)}
                                aria-label="Monter l’exercice"
                                title="Monter"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 dark:border-slate-700 dark:text-slate-400 cursor-pointer"
                              >
                                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === sessionExercises.length - 1}
                                onClick={() => handleMoveExercise(idx, 1)}
                                aria-label="Descendre l’exercice"
                                title="Descendre"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-35 dark:border-slate-700 dark:text-slate-400 cursor-pointer"
                              >
                                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartReplace(idx)}
                                title={
                                  isBeingReplaced
                                    ? 'Annuler le remplacement'
                                    : 'Remplacer par un autre exercice'
                                }
                                className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold cursor-pointer ${
                                  isBeingReplaced
                                    ? 'border-sky-600 bg-sky-600 text-white'
                                    : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                                }`}
                              >
                                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                                <span className="hidden sm:inline">
                                  {isBeingReplaced ? 'En cours...' : 'Remplacer'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateExercise(idx)}
                                aria-label="Dupliquer l’exercice"
                                title="Dupliquer"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 cursor-pointer"
                              >
                                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveExercise(idx)}
                                aria-label="Supprimer l’exercice"
                                title="Supprimer"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {/* 5 Parameters: reps, duration, rounds/tours, pause, rest */}
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
                                  handleUpdateExerciseField(
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
                                  handleUpdateExerciseField(
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
                                  handleUpdateExerciseField(
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
                                  handleUpdateExerciseField(
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
                                  handleUpdateExerciseField(
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
                                handleUpdateExerciseField(
                                  idx,
                                  'notes',
                                  e.target.value
                                )
                              }
                              placeholder="Consigne / allure / charge (ex. 95% VMA, récupération active...)"
                              className="min-h-[32px] flex-1 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
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

              {/* Session Coach Notes */}
              <div>
                <label
                  htmlFor="rse-notes"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Consignes générales de la séance
                </label>
                <textarea
                  id="rse-notes"
                  rows={2}
                  maxLength={VALIDATION_LIMITS.SCHEDULE_NOTES_MAX}
                  value={coachNotes}
                  onChange={(e) => setCoachNotes(e.target.value)}
                  placeholder="Échauffement, sensations recherchées, retour au calme..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {feedback && (
                <div
                  className={`rounded-lg border p-3 text-xs font-medium ${
                    feedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                      : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                  }`}
                >
                  {feedback.text}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isDirty
                ? 'Modifications en cours non enregistrées.'
                : 'Les changements sont immédiatement visibles dans le planning de l’adhérent.'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {saving ? 'Enregistrement...' : 'Enregistrer la séance'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
