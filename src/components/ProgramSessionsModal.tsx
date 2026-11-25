import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  CheckCircle2,
  Circle,
  Clock,
  Footprints,
  Gauge,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ExerciseCategory,
  ExerciseLibraryItem,
  MemberScheduleSession,
  ScheduledExerciseItem,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';
import {
  buildEffectiveProgramSessions,
  EffectiveProgramSession,
  resetTrainingProgramSessionOverride,
  saveTrainingProgramSessionOverride,
} from '../services/firestoreService';
import {
  formatFrenchDateLong,
  formatFrenchDateShort,
  formatFrenchTime,
  formatTimeRange,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '../utils/dateAndValidation';
import {
  clampExerciseParams,
  formatExerciseParamsSummary,
  getExerciseCategoryMeta,
  STARTER_EXERCISES,
} from '../utils/exerciseLibrary';
import {
  getProgramDeliveryProgress,
  getProgramRunnerLevelLabel,
  RUNNING_DISTANCE_TEMPLATES,
} from '../utils/runningProgramGenerator';

interface ProgramSessionsModalProps {
  program: TrainingProgram;
  memberSchedules: MemberScheduleSession[];
  exercises?: ExerciseLibraryItem[];
  coachUid: string;
  nowMs: number;
  initialSessionKey?: string | null;
  onClose: () => void;
  onUpdated?: (message: string) => void;
}

const DURATION_PRESETS = [20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240];

function formatModalError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const raw = err.message.trim();
  if (!raw) return fallback;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error?.toLowerCase().includes('permission')) {
        return 'Autorisation refusée par Firestore : vérifiez que vous êtes connecté avec votre compte administrateur.';
      }
      if (parsed.error) return parsed.error;
    } catch {
      return raw;
    }
  }
  return raw;
}

export function ProgramSessionsModal({
  program,
  memberSchedules,
  exercises = [],
  coachUid,
  nowMs,
  initialSessionKey = null,
  onClose,
  onUpdated,
}: ProgramSessionsModalProps) {
  const tpl = RUNNING_DISTANCE_TEMPLATES[program.distance];
  const delivery = useMemo(
    () => getProgramDeliveryProgress(program, nowMs),
    [program, nowMs]
  );

  const effectiveSessions = useMemo(
    () => buildEffectiveProgramSessions(program, memberSchedules, nowMs),
    [program, memberSchedules, nowMs]
  );

  const [selectedWeekFilter, setSelectedWeekFilter] = useState<'all' | number>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Editor state
  const initialSessionToEdit = useMemo(() => {
    if (!initialSessionKey) return null;
    return effectiveSessions.find((s) => s.key === initialSessionKey) ?? null;
  }, [initialSessionKey, effectiveSessions]);

  const [editingSessionKey, setEditingSessionKey] = useState<string | null>(
    initialSessionToEdit?.key ?? null
  );
  const [editTitle, setEditTitle] = useState(
    initialSessionToEdit?.title ?? ''
  );
  const [editDateStr, setEditDateStr] = useState(() =>
    initialSessionToEdit
      ? toLocalDateInputValue(initialSessionToEdit.coachPlannedDate)
      : toLocalDateInputValue(new Date())
  );
  const [editTimeStr, setEditTimeStr] = useState(() =>
    initialSessionToEdit
      ? toLocalTimeInputValue(initialSessionToEdit.coachPlannedDate)
      : '18:00'
  );
  const [editDuration, setEditDuration] = useState<number>(
    initialSessionToEdit?.durationMinutes ?? 45
  );
  const [editPaceLabel, setEditPaceLabel] = useState(
    initialSessionToEdit?.targetPaceLabel ?? ''
  );
  const [editNotes, setEditNotes] = useState(
    initialSessionToEdit?.coachNotes ?? ''
  );
  const [editExercises, setEditExercises] = useState<ScheduledExerciseItem[]>(
    () => (initialSessionToEdit?.exercises ? [...initialSessionToEdit.exercises] : [])
  );
  const [libraryPickId, setLibraryPickId] = useState('');
  const [saving, setSaving] = useState(false);
  const [resettingKey, setResettingKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const editingSession = useMemo(
    () =>
      editingSessionKey
        ? effectiveSessions.find((s) => s.key === editingSessionKey) ?? null
        : null,
    [editingSessionKey, effectiveSessions]
  );

  const libraryOptions = useMemo(() => {
    const byName = new Set<string>();
    const list: {
      id: string;
      name: string;
      category: ExerciseCategory;
      defaultParams: ScheduledExerciseItem;
    }[] = [];

    exercises.forEach((ex) => {
      byName.add(ex.name.trim().toLowerCase());
      list.push({
        id: ex.id,
        name: ex.name,
        category: ex.category,
        defaultParams: {
          exerciseId: ex.id,
          name: ex.name,
          category: ex.category,
          ...clampExerciseParams(ex.defaultParams),
          notes: ex.intensityHint || '',
        },
      });
    });

    STARTER_EXERCISES.forEach((tplEx) => {
      if (byName.has(tplEx.name.trim().toLowerCase())) return;
      list.push({
        id: tplEx.presetId,
        name: tplEx.name,
        category: tplEx.category,
        defaultParams: {
          exerciseId: tplEx.presetId,
          name: tplEx.name,
          category: tplEx.category,
          ...clampExerciseParams(tplEx.defaultParams),
          notes: tplEx.intensityHint || '',
        },
      });
    });

    return list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [exercises]);

  const startEditingSession = (sess: EffectiveProgramSession) => {
    setFeedback(null);
    setFormError(null);
    setEditingSessionKey(sess.key);
    setEditTitle(sess.title);
    setEditDateStr(toLocalDateInputValue(sess.coachPlannedDate));
    setEditTimeStr(toLocalTimeInputValue(sess.coachPlannedDate));
    setEditDuration(sess.durationMinutes);
    setEditPaceLabel(sess.targetPaceLabel);
    setEditNotes(sess.coachNotes);
    setEditExercises(sess.exercises.map((ex) => ({ ...ex })));
    setLibraryPickId('');
  };

  const cancelEditing = () => {
    setEditingSessionKey(null);
    setFormError(null);
  };

  const handleAddExerciseFromLibrary = (selectedId: string) => {
    if (!selectedId) return;
    const found = libraryOptions.find((o) => o.id === selectedId);
    if (!found) return;
    if (editExercises.length >= VALIDATION_LIMITS.SESSION_EXERCISES_MAX) {
      setFormError(
        `Maximum ${VALIDATION_LIMITS.SESSION_EXERCISES_MAX} exercices par séance.`
      );
      return;
    }
    setEditExercises((prev) => [...prev, { ...found.defaultParams }]);
    setLibraryPickId('');
  };

  const handleAddBlankExercise = () => {
    if (editExercises.length >= VALIDATION_LIMITS.SESSION_EXERCISES_MAX) {
      setFormError(
        `Maximum ${VALIDATION_LIMITS.SESSION_EXERCISES_MAX} exercices par séance.`
      );
      return;
    }
    setEditExercises((prev) => [
      ...prev,
      {
        exerciseId: `custom-${Date.now().toString(36)}`,
        name: 'Nouveau bloc d’entraînement',
        category: 'running',
        repetitions: 1,
        durationSeconds: 600,
        setsOrRounds: 1,
        intraSetPauseSeconds: 0,
        restBetweenRoundsSeconds: 60,
        notes: '',
      },
    ]);
  };

  const handleUpdateExercise = (
    idx: number,
    patch: Partial<ScheduledExerciseItem>
  ) => {
    setEditExercises((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    );
  };

  const handleMoveExercise = (idx: number, dir: -1 | 1) => {
    setEditExercises((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const handleRemoveExercise = (idx: number) => {
    setEditExercises((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveSession = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    setFormError(null);
    setFeedback(null);

    if (!editDateStr || !editTimeStr) {
      setFormError('Veuillez renseigner la date et l’heure de la séance.');
      return;
    }

    const [y, m, d] = editDateStr.split('-').map(Number);
    const [hh, mm] = editTimeStr.split(':').map(Number);
    const startDate = new Date(y, m - 1, d, hh, mm, 0, 0);
    if (Number.isNaN(startDate.getTime())) {
      setFormError('Date ou heure invalide.');
      return;
    }

    const cleanTitle = editTitle.trim();
    if (cleanTitle.length < VALIDATION_LIMITS.TITLE_MIN) {
      setFormError(
        `Le titre doit contenir au moins ${VALIDATION_LIMITS.TITLE_MIN} caractères.`
      );
      return;
    }

    setSaving(true);
    try {
      await saveTrainingProgramSessionOverride({
        program,
        sessionKey: editingSession.key,
        title: cleanTitle,
        targetPaceLabel: editPaceLabel,
        coachNotes: editNotes,
        startDate,
        durationMinutes: editDuration,
        exercises: editExercises,
        coachUid,
        existingOverrideDoc: editingSession.coachEditOverrideDoc,
      });
      const label = editingSession.isVmaTest
        ? 'Test VMA'
        : `S${editingSession.weekNumber}-${editingSession.sessionIndexInWeek}`;
      const msg = `Séance ${label} « ${cleanTitle} » mise à jour.`;
      setFeedback({ type: 'success', text: msg });
      onUpdated?.(msg);
      setEditingSessionKey(null);
    } catch (err) {
      setFormError(
        formatModalError(err, 'Impossible d’enregistrer les modifications de cette séance.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResetSession = async (sess: EffectiveProgramSession) => {
    if (!sess.coachEditOverrideDoc) return;
    setFormError(null);
    setFeedback(null);
    setResettingKey(sess.key);
    try {
      await resetTrainingProgramSessionOverride(sess.coachEditOverrideDoc.id);
      const label = sess.isVmaTest
        ? 'Test VMA'
        : `S${sess.weekNumber}-${sess.sessionIndexInWeek}`;
      const msg = `Séance ${label} rétablie à sa configuration initiale.`;
      setFeedback({ type: 'success', text: msg });
      onUpdated?.(msg);
      if (editingSessionKey === sess.key) {
        setEditingSessionKey(null);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: formatModalError(
          err,
          'Impossible de réinitialiser cette séance.'
        ),
      });
    } finally {
      setResettingKey(null);
    }
  };

  const weekNumbers = useMemo(() => {
    const set = new Set<number>();
    effectiveSessions.forEach((s) => set.add(s.weekNumber));
    return Array.from(set).sort((a, b) => a - b);
  }, [effectiveSessions]);

  const sessionsByWeek = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map = new Map<number, EffectiveProgramSession[]>();

    effectiveSessions.forEach((sess) => {
      if (
        selectedWeekFilter !== 'all' &&
        sess.weekNumber !== selectedWeekFilter
      ) {
        return;
      }
      if (q) {
        const haystack = [
          sess.title,
          sess.phaseLabel,
          sess.focusLabel,
          sess.coachNotes,
          sess.targetPaceLabel,
          ...sess.exercises.map((ex) => `${ex.name} ${ex.notes}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return;
      }
      const list = map.get(sess.weekNumber) ?? [];
      list.push(sess);
      map.set(sess.weekNumber, list);
    });

    return map;
  }, [effectiveSessions, selectedWeekFilter, searchQuery]);

  const totalEditedCount = useMemo(
    () => effectiveSessions.filter((s) => s.isEditedByCoach).length,
    [effectiveSessions]
  );

  const visibleWeeks = useMemo(
    () => Array.from(sessionsByWeek.entries()).sort((a, b) => a[0] - b[0]),
    [sessionsByWeek]
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="program-sessions-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/75 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-400">
              <Footprints className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="program-sessions-modal-title"
                className="truncate font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                {editingSession
                  ? editingSession.isVmaTest
                    ? 'Modifier · Test VMA'
                    : `Modifier · Sem. ${editingSession.weekNumber} Séance ${editingSession.sessionIndexInWeek}`
                  : `Toutes les séances · ${program.title}`}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {program.memberName} ({program.memberEmail}) · {tpl.shortLabel} ·{' '}
                {getProgramRunnerLevelLabel(program.level ?? 'regular')} ·{' '}
                {effectiveSessions.filter((s) => !s.isVmaTest).length} séances sur{' '}
                {program.durationWeeks} sem. (+ Test VMA)
                {program.vmaTestStatus === 'completed'
                  ? ` · VMA ${program.vmaKmh.toFixed(1)} km/h`
                  : ' · Test VMA en attente'}
                {totalEditedCount > 0 &&
                  ` · ${totalEditedCount} personnalisée${totalEditedCount > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {feedback && (
          <div
            role="status"
            className={`mx-5 mt-3 rounded-lg border p-3 text-xs ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {editingSession ? (
          /* Single Session Editor View */
          <form
            onSubmit={handleSaveSession}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-xs dark:border-sky-800/70 dark:bg-sky-950/35">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-bold text-sky-800 dark:text-sky-300">
                    {editingSession.isVmaTest
                      ? 'Séance préalable · Test VMA (Effectuable n’importe quel jour)'
                      : `Semaine ${editingSession.weekNumber}/${program.durationWeeks} · Séance ${editingSession.sessionIndexInWeek} · ${editingSession.phaseLabel}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                    Date initiale du plan : {formatFrenchDateLong(editingSession.originalScheduledDate)}
                  </p>
                  {editingSession.isMovedByMember && (
                    <p className="mt-1 inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300">
                      <ArrowRightLeft className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>
                        L’adhérent a déplacé cette séance au{' '}
                        {formatFrenchDateLong(editingSession.scheduledDate)}.
                      </span>
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                >
                  Retour à la liste
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="ps-edit-title"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Titre de la séance *
                  </label>
                  <input
                    id="ps-edit-title"
                    type="text"
                    required
                    minLength={VALIDATION_LIMITS.TITLE_MIN}
                    maxLength={VALIDATION_LIMITS.TITLE_MAX}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ps-edit-pace"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Allure / Zone cible
                  </label>
                  <input
                    id="ps-edit-pace"
                    type="text"
                    maxLength={VALIDATION_LIMITS.LOCATION_MAX}
                    value={editPaceLabel}
                    onChange={(e) => setEditPaceLabel(e.target.value)}
                    placeholder="Ex. EF 64–72% VMA : 5'45 – 6'10/km"
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="ps-edit-date"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Date prévue *
                  </label>
                  <input
                    id="ps-edit-date"
                    type="date"
                    required
                    value={editDateStr}
                    onChange={(e) => setEditDateStr(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ps-edit-time"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Heure *
                  </label>
                  <input
                    id="ps-edit-time"
                    type="time"
                    required
                    value={editTimeStr}
                    onChange={(e) => setEditTimeStr(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ps-edit-duration"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Durée (minutes) *
                  </label>
                  <select
                    id="ps-edit-duration"
                    value={
                      DURATION_PRESETS.includes(editDuration)
                        ? editDuration
                        : DURATION_PRESETS.reduce((prev, curr) =>
                            Math.abs(curr - editDuration) <
                            Math.abs(prev - editDuration)
                              ? curr
                              : prev
                          )
                    }
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {DURATION_PRESETS.map((min) => (
                      <option key={min} value={min}>
                        {min} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ps-edit-notes"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Consignes personnalisées du coach
                </label>
                <textarea
                  id="ps-edit-notes"
                  rows={3}
                  maxLength={VALIDATION_LIMITS.SCHEDULE_NOTES_MAX}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Consignes spécifiques, sensations ciblées, hydratation..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Exercises block editor */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Contenu & exercices de la séance ({editExercises.length}/
                    {VALIDATION_LIMITS.SESSION_EXERCISES_MAX})
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Ajouter un exercice depuis la bibliothèque"
                      value={libraryPickId}
                      onChange={(e) => handleAddExerciseFromLibrary(e.target.value)}
                      className="min-h-[34px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">+ Ajouter depuis la bibliothèque...</option>
                      {libraryOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddBlankExercise}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Bloc libre</span>
                    </button>
                  </div>
                </div>

                {editExercises.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Aucun exercice détaillé dans cette séance. Ajoutez un bloc libre ou sélectionnez un exercice dans la bibliothèque.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {editExercises.map((ex, idx) => (
                      <div
                        key={`${ex.exerciseId}-${idx}`}
                        className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-400">
                              #{idx + 1}
                            </span>
                            <input
                              type="text"
                              required
                              minLength={VALIDATION_LIMITS.EXERCISE_NAME_MIN}
                              maxLength={VALIDATION_LIMITS.EXERCISE_NAME_MAX}
                              value={ex.name}
                              onChange={(e) =>
                                handleUpdateExercise(idx, { name: e.target.value })
                              }
                              aria-label={`Nom de l'exercice ${idx + 1}`}
                              className="min-h-[34px] min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                            <select
                              value={ex.category}
                              onChange={(e) =>
                                handleUpdateExercise(idx, {
                                  category: e.target.value as ExerciseCategory,
                                })
                              }
                              aria-label={`Catégorie de l'exercice ${idx + 1}`}
                              className="min-h-[34px] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                              <option value="running">Course</option>
                              <option value="strength">Renfo</option>
                              <option value="mobility">Mobilité</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveExercise(idx, -1)}
                              aria-label="Monter l'exercice"
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === editExercises.length - 1}
                              onClick={() => handleMoveExercise(idx, 1)}
                              aria-label="Descendre l'exercice"
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveExercise(idx)}
                              aria-label="Supprimer l'exercice"
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              Séries / Tours
                            </label>
                            <input
                              type="number"
                              min={VALIDATION_LIMITS.EXERCISE_ROUNDS_MIN}
                              max={VALIDATION_LIMITS.EXERCISE_ROUNDS_MAX}
                              value={ex.setsOrRounds}
                              onChange={(e) =>
                                handleUpdateExercise(idx, {
                                  setsOrRounds: Math.max(
                                    1,
                                    Math.min(50, Math.round(Number(e.target.value) || 1))
                                  ),
                                })
                              }
                              className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              Répétitions
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={VALIDATION_LIMITS.EXERCISE_REPS_MAX}
                              value={ex.repetitions}
                              onChange={(e) =>
                                handleUpdateExercise(idx, {
                                  repetitions: Math.max(
                                    0,
                                    Math.min(500, Math.round(Number(e.target.value) || 0))
                                  ),
                                })
                              }
                              className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              Durée (sec)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={VALIDATION_LIMITS.EXERCISE_DURATION_MAX}
                              value={ex.durationSeconds}
                              onChange={(e) =>
                                handleUpdateExercise(idx, {
                                  durationSeconds: Math.max(
                                    0,
                                    Math.min(7200, Math.round(Number(e.target.value) || 0))
                                  ),
                                })
                              }
                              className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              Récup bloc (sec)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={VALIDATION_LIMITS.EXERCISE_PAUSE_MAX}
                              value={ex.intraSetPauseSeconds}
                              onChange={(e) =>
                                handleUpdateExercise(idx, {
                                  intraSetPauseSeconds: Math.max(
                                    0,
                                    Math.min(600, Math.round(Number(e.target.value) || 0))
                                  ),
                                })
                              }
                              className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                              Repos tour (sec)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={VALIDATION_LIMITS.EXERCISE_REST_MAX}
                              value={ex.restBetweenRoundsSeconds}
                              onChange={(e) =>
                                handleUpdateExercise(idx, {
                                  restBetweenRoundsSeconds: Math.max(
                                    0,
                                    Math.min(1800, Math.round(Number(e.target.value) || 0))
                                  ),
                                })
                              }
                              className="mt-0.5 min-h-[32px] w-full rounded border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </div>
                        </div>

                        <input
                          type="text"
                          maxLength={VALIDATION_LIMITS.SESSION_EXERCISE_NOTES_MAX}
                          value={ex.notes}
                          onChange={(e) =>
                            handleUpdateExercise(idx, { notes: e.target.value })
                          }
                          placeholder="Allure ou consigne de l’exercice (optionnel)..."
                          className="min-h-[32px] w-full rounded border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                  {formError}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/75 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
              <div>
                {editingSession.isEditedByCoach && (
                  <button
                    type="button"
                    disabled={resettingKey === editingSession.key}
                    onClick={() => void handleResetSession(editingSession)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200 disabled:opacity-60 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {resettingKey === editingSession.key
                        ? 'Réinitialisation...'
                        : 'Rétablir la séance d’origine'}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[38px] rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer la séance'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* All Weeks & All Sessions Overview */
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Filter toolbar */}
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher une séance, un exercice, une phase..."
                    className="min-h-[36px] w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  {program.sessionsPerWeek} séances/sem. · {program.durationWeeks} semaines
                </span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedWeekFilter('all')}
                  className={`min-h-[28px] shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                    selectedWeekFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  Toutes ({effectiveSessions.length})
                </button>
                {weekNumbers.map((wk) => (
                  <button
                    key={wk}
                    type="button"
                    onClick={() => setSelectedWeekFilter(wk)}
                    className={`min-h-[28px] shrink-0 rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums cursor-pointer ${
                      selectedWeekFilter === wk
                        ? 'bg-sky-700 text-white dark:bg-sky-600'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {wk === 0 ? 'Test VMA' : `Sem. ${wk}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Weeks & Sessions list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {visibleWeeks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Aucune séance ne correspond à ce filtre.
                </div>
              ) : (
                visibleWeeks.map(([weekNum, weekSessions]) => {
                  const isVmaGroup = weekNum === 0;
                  const weekWindow = !isVmaGroup
                    ? delivery.weeks[weekNum - 1]
                    : undefined;
                  const phaseLabel = weekSessions[0]?.phaseLabel ?? '';
                  return (
                    <div
                      key={weekNum}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-950/35 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2 dark:border-slate-800">
                        <div>
                          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                            {isVmaGroup
                              ? 'Séance préalable · Test VMA (Effectuable n’importe quel jour)'
                              : `Semaine ${weekNum}/${program.durationWeeks}${
                                  phaseLabel ? ` · ${phaseLabel}` : ''
                                }`}
                          </h3>
                        </div>
                        {isVmaGroup ? (
                          <span
                            className={`font-mono text-[11px] font-semibold tabular-nums ${
                              !delivery.hasAccess
                                ? 'text-amber-700 dark:text-amber-400'
                                : program.vmaTestStatus === 'completed'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-sky-700 dark:text-sky-400'
                            }`}
                          >
                            {!delivery.hasAccess
                              ? 'Paiement requis'
                              : program.vmaTestStatus === 'completed'
                                ? 'Test VMA validé'
                                : 'Disponible dès maintenant'}
                          </span>
                        ) : (
                          weekWindow && (
                            <span
                              className={`font-mono text-[11px] font-semibold tabular-nums ${
                                !delivery.hasAccess
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : delivery.awaitingVma
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : weekWindow.unlocked
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {!delivery.hasAccess
                                ? 'Paiement requis'
                                : delivery.awaitingVma
                                  ? weekNum === 1
                                    ? 'En attente · envoyée dès validation du Test VMA'
                                    : `En attente du Test VMA (puis ${delivery.autoSendLabel})`
                                  : weekWindow.unlocked
                                    ? 'Envoyée à l’adhérent'
                                    : `Envoi prévu le ${formatFrenchDateShort(new Date(weekWindow.unlockAtMs))} à ${formatFrenchTime(new Date(weekWindow.unlockAtMs))}`}
                            </span>
                          )
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                        {weekSessions.map((sess) => (
                          <div
                            key={sess.key}
                            className={`flex flex-col justify-between gap-2.5 rounded-xl border bg-white p-3.5 text-xs dark:bg-slate-900 ${
                              sess.isEditedByCoach
                                ? 'border-sky-300 dark:border-sky-700'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-900 dark:bg-sky-950 dark:text-sky-200 tabular-nums">
                                    {sess.isVmaTest
                                      ? 'VMA'
                                      : `S${sess.weekNumber}·${sess.sessionIndexInWeek}`}
                                  </span>
                                  <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                                    {formatFrenchDateShort(sess.scheduledDate)} ·{' '}
                                    {formatTimeRange(
                                      sess.scheduledDate,
                                      sess.durationMinutes
                                    )}
                                  </span>
                                </div>

                                <span
                                  className={`inline-flex items-center gap-1 font-mono text-[10px] font-semibold ${
                                    sess.completed
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {sess.completed ? (
                                    <CheckCircle2
                                      className="h-3 w-3"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Circle className="h-3 w-3" aria-hidden="true" />
                                  )}
                                  {sess.completed ? 'Effectuée' : 'À faire'}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                {sess.isVmaTest && (
                                  <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                                    <Gauge className="h-3 w-3" aria-hidden="true" />
                                    Test VMA
                                  </span>
                                )}
                                {sess.isEditedByCoach && (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                                    Modifiée par le coach
                                  </span>
                                )}
                                {sess.isMovedByMember && (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                    <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
                                    Déplacée par {program.memberName}
                                  </span>
                                )}
                              </div>

                              <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                                {sess.title}
                              </p>

                              {sess.targetPaceLabel && (
                                <p className="text-[11px] font-medium text-sky-800 dark:text-sky-300">
                                  {sess.targetPaceLabel}
                                </p>
                              )}

                              <p className="flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                <span>{sess.durationMinutes} min</span>
                                <span>· {sess.focusLabel}</span>
                              </p>

                              {sess.exercises.length > 0 && (
                                <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-800/40">
                                  {sess.exercises.map((ex, idx) => {
                                    const meta = getExerciseCategoryMeta(ex.category);
                                    return (
                                      <div key={`${ex.exerciseId}-${idx}`} className="text-[11px]">
                                        <div className="flex items-center justify-between gap-1.5">
                                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                                            {idx + 1}. {ex.name}
                                          </span>
                                          <span
                                            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${meta.badgeClass}`}
                                          >
                                            {meta.shortLabel}
                                          </span>
                                        </div>
                                        <p className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                                          {formatExerciseParamsSummary(ex)}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {sess.coachNotes && (
                                <p className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
                                  {sess.coachNotes}
                                </p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                                <UserCheck className="h-3 w-3" aria-hidden="true" />
                                {program.coachName}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {sess.isEditedByCoach && (
                                  <button
                                    type="button"
                                    disabled={resettingKey === sess.key}
                                    onClick={() => void handleResetSession(sess)}
                                    className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                                  >
                                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                    <span>Rétablir</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => startEditingSession(sess)}
                                  className="inline-flex min-h-[28px] items-center gap-1 rounded-md bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
                                >
                                  <Pencil className="h-3 w-3" aria-hidden="true" />
                                  <span>Modifier</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50/75 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
