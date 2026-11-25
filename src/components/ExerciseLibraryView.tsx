import { FormEvent, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  CalendarPlus,
  CreditCard,
  Dumbbell,
  Footprints,
  Gauge,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import {
  CoachDirectoryEntry,
  DisciplineItem,
  ExerciseCategory,
  ExerciseLibraryItem,
  ExerciseParams,
  MemberScheduleSession,
  RunningDistanceKey,
  ScheduledExerciseItem,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';
import {
  createExercise,
  deleteExercise,
  deleteTrainingProgram,
  payTrainingProgram,
  seedStarterExercises,
  updateExercise,
} from '../services/firestoreService';
import {
  formatFrenchDateShort,
  formatFrenchTime,
  formatPriceEuros,
} from '../utils/dateAndValidation';
import {
  getCoachRunningProgramPriceCents,
  hasCoachCustomRunningPrice,
} from '../utils/coachPricingHelpers';
import {
  clampExerciseParams,
  EXERCISE_OBJECTIVE_OPTIONS,
  formatSecondsCompact,
  getExerciseCategoryMeta,
  STARTER_EXERCISES,
} from '../utils/exerciseLibrary';
import {
  computeTargetRacePaceSecPerKm,
  computeVmaPaceZones,
  formatDurationHMS,
  formatPaceMinPerKm,
  getProgramDeliveryProgress,
  getProgramPhases,
  getProgramRunnerLevelLabel,
  RUNNING_DISTANCE_LIST,
  RUNNING_DISTANCE_TEMPLATES,
} from '../utils/runningProgramGenerator';
import {
  ProgramBuilderModal,
  ProgramMemberCandidate,
} from './ProgramBuilderModal';
import { RunningProgramBuilderModal } from './RunningProgramBuilderModal';
import { RunningSessionEditorModal } from './RunningSessionEditorModal';
import { VmaTestModal } from './VmaTestModal';

interface ExerciseLibraryViewProps {
  coachUid: string;
  coachName: string;
  coachDirectory: CoachDirectoryEntry[];
  isPrimaryCoach?: boolean;
  disciplines: DisciplineItem[];
  exercises: ExerciseLibraryItem[];
  memberCandidates: ProgramMemberCandidate[];
  trainingPrograms?: TrainingProgram[];
  memberSchedules?: MemberScheduleSession[];
  nowMs?: number;
  onOpenCoachPricing?: () => void;
}

interface DisplayExerciseRow {
  id: string;
  name: string;
  category: ExerciseCategory;
  targetObjectives: string[];
  description: string;
  defaultParams: ExerciseParams;
  intensityHint?: string;
  isStored: boolean;
  isPreset?: boolean;
  storedDoc?: ExerciseLibraryItem;
}

const DEFAULT_PARAMS: ExerciseParams = {
  repetitions: 12,
  durationSeconds: 0,
  setsOrRounds: 4,
  intraSetPauseSeconds: 0,
  restBetweenRoundsSeconds: 60,
};

export function ExerciseLibraryView({
  coachUid,
  coachName,
  coachDirectory,
  isPrimaryCoach = false,
  disciplines,
  exercises,
  memberCandidates,
  trainingPrograms = [],
  memberSchedules = [],
  nowMs = Date.now(),
  onOpenCoachPricing,
}: ExerciseLibraryViewProps) {
  const myCoachDirectoryEntry = useMemo(
    () => coachDirectory.find((c) => c.uid === coachUid) ?? null,
    [coachDirectory, coachUid]
  );
  const [libraryTab, setLibraryTab] = useState<'exercises' | 'programs'>(
    'exercises'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | ExerciseCategory
  >('all');
  const [objectiveFilter, setObjectiveFilter] = useState<string>('all');

  const [seeding, setSeeding] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Add / Edit Exercise Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DisplayExerciseRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] =
    useState<ExerciseCategory>('strength');
  const [formObjectives, setFormObjectives] = useState<string[]>([
    'Force & Tonus',
  ]);
  const [customObjectiveInput, setCustomObjectiveInput] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIntensity, setFormIntensity] = useState('');
  const [formParams, setFormParams] = useState<ExerciseParams>(DEFAULT_PARAMS);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Program Builder Modal
  const [programModalOpen, setProgramModalOpen] = useState(false);
  const [programInitialExercises, setProgramInitialExercises] = useState<
    ScheduledExerciseItem[]
  >([]);

  // Running 12-week Programs (5km, 10km, 21km, 42km)
  const [programSearch, setProgramSearch] = useState('');
  const [programStatusFilter, setProgramStatusFilter] = useState<
    'all' | 'awaiting_payment' | 'awaiting_vma' | 'active' | 'completed'
  >('all');
  const [runningModalOpen, setRunningModalOpen] = useState(false);
  const [runningInitialDistance, setRunningInitialDistance] =
    useState<RunningDistanceKey>('10km');
  const [editingRunningProgram, setEditingRunningProgram] =
    useState<TrainingProgram | null>(null);
  const [vmaTestProgram, setVmaTestProgram] = useState<TrainingProgram | null>(
    null
  );
  const [editingSessionsProgramTarget, setEditingSessionsProgramTarget] =
    useState<{ programId: string; sessionKey?: string } | null>(null);
  const [payingProgramId, setPayingProgramId] = useState<string | null>(null);
  const [confirmDeleteProgramId, setConfirmDeleteProgramId] = useState<
    string | null
  >(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(
    null
  );

  const mergedRows = useMemo<DisplayExerciseRow[]>(() => {
    const dbIds = new Set(exercises.map((e) => e.id));
    const dbNames = new Set(exercises.map((e) => e.name.trim().toLowerCase()));

    const rows: DisplayExerciseRow[] = exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      category: ex.category,
      targetObjectives: ex.targetObjectives,
      description: ex.description,
      defaultParams: ex.defaultParams,
      intensityHint: ex.intensityHint,
      isStored: true,
      isPreset: ex.isPreset,
      storedDoc: ex,
    }));

    for (const tpl of STARTER_EXERCISES) {
      if (
        !dbIds.has(tpl.presetId) &&
        !dbNames.has(tpl.name.trim().toLowerCase())
      ) {
        rows.push({
          id: tpl.presetId,
          name: tpl.name,
          category: tpl.category,
          targetObjectives: tpl.targetObjectives,
          description: tpl.description,
          defaultParams: tpl.defaultParams,
          intensityHint: tpl.intensityHint,
          isStored: false,
          isPreset: true,
        });
      }
    }

    rows.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    });

    return rows;
  }, [exercises]);

  const unimportedCount = useMemo(
    () => mergedRows.filter((r) => !r.isStored).length,
    [mergedRows]
  );

  const allObjectiveOptions = useMemo(() => {
    const set = new Set<string>(EXERCISE_OBJECTIVE_OPTIONS);
    mergedRows.forEach((r) =>
      r.targetObjectives.forEach((obj) => set.add(obj))
    );
    return Array.from(set);
  }, [mergedRows]);

  const counts = useMemo(() => {
    return {
      total: mergedRows.length,
      strength: mergedRows.filter((r) => r.category === 'strength').length,
      running: mergedRows.filter((r) => r.category === 'running').length,
      mobility: mergedRows.filter((r) => r.category === 'mobility').length,
    };
  }, [mergedRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedRows.filter((row) => {
      if (categoryFilter !== 'all' && row.category !== categoryFilter) {
        return false;
      }
      if (
        objectiveFilter !== 'all' &&
        !row.targetObjectives.some(
          (o) => o.toLowerCase() === objectiveFilter.toLowerCase()
        )
      ) {
        return false;
      }
      if (q) {
        const hay = `${row.name} ${row.description} ${row.intensityHint ?? ''} ${row.targetObjectives.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedRows, categoryFilter, objectiveFilter, searchQuery]);

  const openCreateExercise = (defaultCategory: ExerciseCategory = 'strength') => {
    setFeedback(null);
    setFormError(null);
    setEditingRow(null);
    setFormName('');
    setFormCategory(defaultCategory);
    setFormObjectives(
      defaultCategory === 'running'
        ? ['Endurance running', 'Vitesse & VMA']
        : ['Force & Tonus']
    );
    setCustomObjectiveInput('');
    setFormDescription('');
    setFormIntensity('');
    setFormParams(
      defaultCategory === 'running'
        ? {
            repetitions: 8,
            durationSeconds: 30,
            setsOrRounds: 2,
            intraSetPauseSeconds: 30,
            restBetweenRoundsSeconds: 120,
          }
        : DEFAULT_PARAMS
    );
    setFormOpen(true);
  };

  const openEditExercise = (row: DisplayExerciseRow) => {
    setFeedback(null);
    setFormError(null);
    setEditingRow(row);
    setFormName(row.name);
    setFormCategory(row.category);
    setFormObjectives(row.targetObjectives);
    setCustomObjectiveInput('');
    setFormDescription(row.description);
    setFormIntensity(row.intensityHint ?? '');
    setFormParams(row.defaultParams);
    setFormOpen(true);
  };

  const toggleFormObjective = (obj: string) => {
    setFormObjectives((prev) => {
      const exists = prev.some((o) => o.toLowerCase() === obj.toLowerCase());
      if (exists) {
        return prev.filter((o) => o.toLowerCase() !== obj.toLowerCase());
      }
      if (prev.length >= VALIDATION_LIMITS.EXERCISE_OBJECTIVES_MAX_COUNT) {
        return prev;
      }
      return [...prev, obj];
    });
  };

  const handleAddCustomObjective = () => {
    const clean = customObjectiveInput
      .trim()
      .slice(0, VALIDATION_LIMITS.EXERCISE_OBJECTIVE_MAX);
    if (!clean) return;
    if (
      !formObjectives.some((o) => o.toLowerCase() === clean.toLowerCase()) &&
      formObjectives.length < VALIDATION_LIMITS.EXERCISE_OBJECTIVES_MAX_COUNT
    ) {
      setFormObjectives((prev) => [...prev, clean]);
    }
    setCustomObjectiveInput('');
  };

  const handleSubmitExercise = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFeedback(null);

    const clamped = clampExerciseParams(formParams);
    setFormSaving(true);
    try {
      if (editingRow && editingRow.isStored) {
        await updateExercise(editingRow.id, {
          name: formName,
          category: formCategory,
          targetObjectives: formObjectives,
          description: formDescription,
          defaultParams: clamped,
          intensityHint: formIntensity,
          isPreset: editingRow.isPreset,
        });
        setFeedback({
          type: 'success',
          text: `Exercice « ${formName.trim()} » mis à jour.`,
        });
      } else {
        await createExercise({
          name: formName,
          category: formCategory,
          targetObjectives: formObjectives,
          description: formDescription,
          defaultParams: clamped,
          intensityHint: formIntensity,
          isPreset: Boolean(editingRow && !editingRow.isStored),
          customId:
            editingRow && !editingRow.isStored ? editingRow.id : undefined,
          coachUid,
        });
        setFeedback({
          type: 'success',
          text:
            editingRow && !editingRow.isStored
              ? `Exercice « ${formName.trim()} » personnalisé et enregistré dans votre bibliothèque.`
              : `Nouvel exercice « ${formName.trim()} » ajouté à la bibliothèque.`,
        });
      }
      setFormOpen(false);
      setEditingRow(null);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer cet exercice.'
      );
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteExercise = async (id: string, name: string) => {
    setFeedback(null);
    setDeletingId(id);
    try {
      await deleteExercise(id);
      setConfirmDeleteId(null);
      setFeedback({
        type: 'success',
        text: `Exercice « ${name} » supprimé de la bibliothèque.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer cet exercice.',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSeedStarterCatalog = async () => {
    setFeedback(null);
    setSeeding(true);
    try {
      const added = await seedStarterExercises(coachUid, exercises);
      setFeedback({
        type: 'success',
        text:
          added > 0
            ? `${added} exercice${added > 1 ? 's' : ''} du catalogue de base importé${added > 1 ? 's' : ''} (Renforcement & Running).`
            : 'Tous les exercices de base sont déjà présents dans votre bibliothèque.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’importer le catalogue de base.',
      });
    } finally {
      setSeeding(false);
    }
  };

  const handleOpenProgramWithExercise = (row?: DisplayExerciseRow) => {
    if (row) {
      setProgramInitialExercises([
        {
          exerciseId: row.id,
          name: row.name,
          category: row.category,
          ...clampExerciseParams(row.defaultParams),
          notes: row.intensityHint || '',
        },
      ]);
    } else {
      setProgramInitialExercises([]);
    }
    setProgramModalOpen(true);
  };

  const openRunningBuilder = (
    distance: RunningDistanceKey = '10km',
    editing: TrainingProgram | null = null
  ) => {
    setFeedback(null);
    setRunningInitialDistance(distance);
    setEditingRunningProgram(editing);
    setRunningModalOpen(true);
  };

  const handleConfirmProgramPayment = async (program: TrainingProgram) => {
    setFeedback(null);
    setPayingProgramId(program.id);
    try {
      await payTrainingProgram({
        program,
        method: 'onsite',
        isCoach: true,
      });
      setFeedback({
        type: 'success',
        text: `Paiement de ${formatPriceEuros(program.priceCents)} validé pour ${program.memberName}. La Semaine 1 vient d’être envoyée (les semaines suivantes suivront à la fin de chaque semaine) et le test VMA Jour 1 est ouvert.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de valider le paiement de ce programme.',
      });
    } finally {
      setPayingProgramId(null);
    }
  };

  const handleDeleteTrainingProgram = async (program: TrainingProgram) => {
    setFeedback(null);
    setDeletingProgramId(program.id);
    try {
      await deleteTrainingProgram(program.id);
      setConfirmDeleteProgramId(null);
      setFeedback({
        type: 'success',
        text: `Programme « ${program.title} » supprimé pour ${program.memberName}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer ce programme.',
      });
    } finally {
      setDeletingProgramId(null);
    }
  };

  const coachCustomSessions = useMemo(
    () => memberSchedules.filter((s) => s.createdByRole === 'coach'),
    [memberSchedules]
  );

  const filteredTrainingPrograms = useMemo(() => {
    const q = programSearch.trim().toLowerCase();
    return trainingPrograms.filter((prog) => {
      if (programStatusFilter !== 'all' && prog.status !== programStatusFilter) {
        return false;
      }
      if (q) {
        const hay = `${prog.memberName} ${prog.memberEmail} ${prog.title} ${prog.distance}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [trainingPrograms, programSearch, programStatusFilter]);

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span>Bibliothèque d’exercices & Programmes sur mesure</span>
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
              Exercices de renforcement & running
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Paramétrez chaque exercice (répétitions, durée, tours, pause,
              repos), ajoutez vos propres exercices et préparez un programme
              adapté aux objectifs de chaque adhérent.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {libraryTab === 'exercises' && unimportedCount > 0 && (
              <button
                type="button"
                disabled={seeding}
                onClick={() => void handleSeedStarterCatalog()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span>
                  {seeding
                    ? 'Import...'
                    : `Catalogue de base (${unimportedCount})`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openCreateExercise('strength')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Nouvel exercice</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenProgramWithExercise()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              <span>Séance sur mesure</span>
            </button>

            <button
              type="button"
              onClick={() => openRunningBuilder('10km', null)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Footprints className="h-4 w-4" aria-hidden="true" />
              <span>Programme 5–42 km (12 sem.)</span>
            </button>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div
            role="tablist"
            aria-label="Sections de la bibliothèque"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={libraryTab === 'exercises'}
              onClick={() => setLibraryTab('exercises')}
              className={`inline-flex min-h-[36px] items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                libraryTab === 'exercises'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Dumbbell className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Exercices ({counts.total})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={libraryTab === 'programs'}
              onClick={() => setLibraryTab('programs')}
              className={`inline-flex min-h-[36px] items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                libraryTab === 'programs'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Footprints className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Programmes attribués ({trainingPrograms.length + coachCustomSessions.length})
              </span>
            </button>
          </div>

          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            {libraryTab === 'exercises'
              ? `${counts.strength} renfo · ${counts.running} running · ${counts.mobility} mobilité`
              : `${trainingPrograms.filter((p) => !p.isPaid || p.paymentStatus === 'free').length} offert(s) · ${trainingPrograms.filter((p) => p.isPaid && p.paymentStatus === 'paid').length} réglé(s) · ${trainingPrograms.filter((p) => p.vmaTestStatus === 'completed').length} VMA évaluée(s)`}
          </p>
        </div>

        {libraryTab === 'exercises' && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Total bibliothèque
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {counts.total}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/60 px-3.5 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/25">
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                Renforcement musculaire
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-amber-900 dark:text-amber-200 tabular-nums">
                {counts.strength}
              </p>
            </div>
            <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 px-3.5 py-2.5 dark:border-sky-900/60 dark:bg-sky-950/25">
              <p className="text-[11px] font-medium text-sky-800 dark:text-sky-300">
                Running spécifique
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-sky-900 dark:text-sky-200 tabular-nums">
                {counts.running}
              </p>
            </div>
            <div className="rounded-lg border border-violet-200/80 bg-violet-50/60 px-3.5 py-2.5 dark:border-violet-900/60 dark:bg-violet-950/25">
              <p className="text-[11px] font-medium text-violet-800 dark:text-violet-300">
                Mobilité & Prévention
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-violet-900 dark:text-violet-200 tabular-nums">
                {counts.mobility}
              </p>
            </div>
          </div>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-xl border p-3.5 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {libraryTab === 'programs' ? (
        <div className="space-y-6">
          {/* 4 Race Templates Grid */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Modèles spécifiques (5 km, 10 km, 21 km, 42 km)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Durée adaptée au niveau (Débutant / Régulier &amp; Expérimenté) · 3 séances/sem. par défaut (paramétrable de 2 à 6) · Test VMA Jour 1.
                </p>
              </div>
              {onOpenCoachPricing && (
                <button
                  type="button"
                  onClick={onOpenCoachPricing}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Configurer mes tarifs</span>
                </button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {RUNNING_DISTANCE_LIST.map((tpl) => {
                const defaultPhases = getProgramPhases(tpl.key, tpl.regularWeeks);
                const resolvedPriceCents = getCoachRunningProgramPriceCents(
                  myCoachDirectoryEntry?.pricing,
                  tpl.key
                );
                const isCustomCoachPrice = hasCoachCustomRunningPrice(
                  myCoachDirectoryEntry?.pricing,
                  tpl.key
                );
                return (
                  <div
                    key={tpl.key}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                          {tpl.shortLabel}
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {formatPriceEuros(resolvedPriceCents)}
                          {isCustomCoachPrice ? ' · Mon tarif' : ''}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                        {tpl.beginnerWeeks} sem. (débutant) · {tpl.regularWeeks} sem. (régulier / exp.)
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                        {tpl.defaultSessionsPerWeek} séances/sem. par défaut
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {tpl.tagline}
                      </p>
                      <div className="mt-3 space-y-1 border-t border-slate-200/80 pt-2.5 dark:border-slate-800">
                        {defaultPhases.map((phase) => (
                          <p
                            key={phase}
                            className="text-[11px] text-slate-600 dark:text-slate-400"
                          >
                            {phase}
                          </p>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openRunningBuilder(tpl.key, null)}
                      className="mt-4 inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Configurer pour un adhérent</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Assigned Programs List */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Programmes attribués aux adhérents ({trainingPrograms.length})
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Suivez le règlement, le test VMA du Jour 1 et la progression du cycle.
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={programSearch}
                    onChange={(e) => setProgramSearch(e.target.value)}
                    placeholder="Rechercher adhérent, distance..."
                    className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <select
                  value={programStatusFilter}
                  onChange={(e) =>
                    setProgramStatusFilter(
                      e.target.value as
                        | 'all'
                        | 'awaiting_payment'
                        | 'awaiting_vma'
                        | 'active'
                        | 'completed'
                    )
                  }
                  aria-label="Filtrer par statut de programme"
                  className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-auto"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="awaiting_payment">Paiement en attente</option>
                  <option value="awaiting_vma">Test VMA Jour 1 en attente</option>
                  <option value="active">Actifs</option>
                  <option value="completed">Terminés</option>
                </select>
              </div>
            </div>

            {filteredTrainingPrograms.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {trainingPrograms.length === 0
                    ? 'Aucun programme 5–42 km attribué pour le moment'
                    : 'Aucun programme ne correspond à votre recherche'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Sélectionnez une distance ci-dessus pour préparer un plan personnalisé adapté au niveau.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredTrainingPrograms.map((prog) => {
                  const tpl = RUNNING_DISTANCE_TEMPLATES[prog.distance];
                  const totalSessions = prog.durationWeeks * prog.sessionsPerWeek;
                  const doneCount = prog.completedSessionKeys?.length ?? 0;
                  const pct =
                    totalSessions > 0
                      ? Math.min(100, Math.round((doneCount / totalSessions) * 100))
                      : 0;
                  const targetPace = computeTargetRacePaceSecPerKm(
                    prog.distance,
                    prog.targetTimeSeconds
                  );
                  const zones =
                    prog.vmaTestStatus === 'completed' && prog.vmaKmh > 0
                      ? computeVmaPaceZones(
                          prog.vmaKmh,
                          prog.distance,
                          prog.targetTimeSeconds
                        )
                      : null;
                  const delivery = getProgramDeliveryProgress(prog, nowMs);

                  return (
                    <div
                      key={prog.id}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400 break-words">
                              {tpl.shortLabel}
                              {prog.level ? ` (${getProgramRunnerLevelLabel(prog.level)})` : ''} ·{' '}
                              {prog.durationWeeks} sem. · {prog.sessionsPerWeek} séances/sem.
                            </p>
                            <h4 className="mt-0.5 font-display text-base font-bold text-slate-900 dark:text-white truncate">
                              {prog.memberName}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {prog.title} · {prog.memberEmail}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-1.5 sm:block sm:shrink-0 sm:rounded-none sm:bg-transparent sm:p-0 sm:text-right dark:bg-slate-900/60 dark:sm:bg-transparent">
                            {(() => {
                              const isFreeProgram = !prog.isPaid || prog.paymentStatus === 'free';
                              const isPaid = prog.paymentStatus === 'paid';
                              return (
                                <p
                                  className={`font-mono text-xs font-bold tabular-nums leading-snug ${
                                    isFreeProgram || isPaid
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-amber-700 dark:text-amber-400'
                                  }`}
                                >
                                  {isFreeProgram
                                    ? 'Offert · Gratuit'
                                    : isPaid
                                      ? `Payé · ${formatPriceEuros(prog.priceCents)}`
                                      : `À régler · ${formatPriceEuros(prog.priceCents)}`}
                                </p>
                              );
                            })()}
                            <p className="sm:mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums leading-snug">
                              Démarrage : {formatFrenchDateShort((prog.desiredStartAt ?? prog.startAt).toDate())}
                            </p>
                          </div>
                        </div>

                        {/* Objective + VMA metrics */}
                        <div className="mt-3 grid grid-cols-1 gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/60 sm:grid-cols-2">
                          <div>
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                              <Timer className="h-3 w-3" aria-hidden="true" />
                              Objectif chrono
                            </p>
                            <p className="mt-0.5 font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                              {formatDurationHMS(prog.targetTimeSeconds)} ·{' '}
                              {formatPaceMinPerKm(targetPace)}
                            </p>
                          </div>

                          <div>
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                              <Gauge className="h-3 w-3" aria-hidden="true" />
                              Test VMA (Jour 1)
                            </p>
                            <p
                              className={`mt-0.5 font-mono text-xs font-bold tabular-nums ${
                                zones
                                  ? 'text-sky-700 dark:text-sky-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {zones
                                ? `${zones.vmaKmh.toFixed(1)} km/h · Seuil ${formatPaceMinPerKm(zones.seuilSecPerKm)}`
                                : 'En attente du test'}
                            </p>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                            <span>Progression du cycle</span>
                            <span className="font-mono font-semibold tabular-nums">
                              {doneCount} / {totalSessions} séances ({pct}%)
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div
                              className="h-full bg-emerald-600 transition-all dark:bg-emerald-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {/* Progressive week-by-week delivery status */}
                        <div className="mt-3 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Envoi progressif :{' '}
                              {!delivery.hasAccess
                                ? 'en attente du paiement'
                                : delivery.awaitingVma
                                  ? 'en attente du Test VMA'
                                  : delivery.allWeeksReleased
                                    ? `${delivery.totalWeeks}/${delivery.totalWeeks} sem. envoyées`
                                    : `Sem. ${delivery.unlockedWeeks}/${delivery.totalWeeks} envoyée`}
                            </span>
                            {delivery.hasAccess && delivery.awaitingVma ? (
                              <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
                                Sem. 1 dès validation · puis {delivery.autoSendShortLabel}
                              </span>
                            ) : (
                              delivery.hasAccess &&
                              delivery.nextWeekNumber &&
                              delivery.nextUnlockAtMs && (
                                <span className="font-mono text-[10px] text-sky-700 dark:text-sky-400 tabular-nums">
                                  Sem. {delivery.nextWeekNumber} le{' '}
                                  {formatFrenchDateShort(new Date(delivery.nextUnlockAtMs))} à{' '}
                                  {formatFrenchTime(new Date(delivery.nextUnlockAtMs))}
                                </span>
                              )
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {delivery.weeks.map((wk) => (
                              <span
                                key={wk.weekNumber}
                                title={
                                  !delivery.hasAccess
                                    ? `Semaine ${wk.weekNumber} : en attente du paiement`
                                    : delivery.awaitingVma
                                      ? wk.weekNumber === 1
                                        ? 'Semaine 1 : envoyée dès validation du Test VMA'
                                        : `Semaine ${wk.weekNumber} : en attente (envoyée le ${delivery.autoSendLabel} après validation du Test VMA)`
                                      : wk.unlocked
                                        ? `Semaine ${wk.weekNumber} envoyée`
                                        : `Semaine ${wk.weekNumber} : envoi auto le ${formatFrenchDateShort(new Date(wk.unlockAtMs))} à ${formatFrenchTime(new Date(wk.unlockAtMs))}`
                                }
                                className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                                  wk.unlocked
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                    : 'bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                S{wk.weekNumber}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-3.5 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between dark:border-slate-800">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {prog.isPaid && prog.paymentStatus !== 'paid' && prog.paymentStatus !== 'free' && (
                            <button
                              type="button"
                              disabled={payingProgramId === prog.id}
                              onClick={() => void handleConfirmProgramPayment(prog)}
                              className="inline-flex min-h-[32px] items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <CreditCard className="h-3 w-3" aria-hidden="true" />
                              <span>
                                {payingProgramId === prog.id
                                  ? 'Validation...'
                                  : 'Valider paiement'}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setVmaTestProgram(prog)}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Activity className="h-3 w-3" aria-hidden="true" />
                            <span>
                              {prog.vmaTestStatus === 'completed'
                                ? 'Modifier VMA'
                                : 'Saisir VMA'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setEditingSessionsProgramTarget({
                                programId: prog.id,
                                sessionKey: `w${Math.max(1, delivery.currentWeekNumber)}-s1`,
                              })
                            }
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                            <span>
                              Séances &amp; exercices
                              {(prog.sessionOverrides?.length ?? 0) > 0
                                ? ` (${prog.sessionOverrides?.length})`
                                : ''}
                            </span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {confirmDeleteProgramId === prog.id ? (
                            <>
                              <button
                                type="button"
                                disabled={deletingProgramId === prog.id}
                                onClick={() => void handleDeleteTrainingProgram(prog)}
                                className="min-h-[32px] rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                              >
                                {deletingProgramId === prog.id
                                  ? 'Suppr...'
                                  : 'Confirmer'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteProgramId(null)}
                                className="min-h-[32px] rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                Annuler
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  openRunningBuilder(prog.distance, prog)
                                }
                                className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Pencil className="h-3 w-3" aria-hidden="true" />
                                <span>Modifier</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteProgramId(prog.id)}
                                aria-label={`Supprimer le programme de ${prog.memberName}`}
                                className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assigned Custom Sessions ("Séance sur mesure") */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Séances sur mesure attribuées ({coachCustomSessions.length})
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Séances personnalisées créées depuis la bibliothèque et visibles dans le planning de chaque adhérent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenProgramWithExercise()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 whitespace-nowrap cursor-pointer"
              >
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Nouvelle séance sur mesure</span>
              </button>
            </div>

            {coachCustomSessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Aucune séance sur mesure attribuée pour le moment.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {coachCustomSessions.map((sess) => {
                  const isPaid = !sess.isPaid || sess.paymentStatus === 'paid';
                  return (
                    <div
                      key={sess.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {sess.discipline} · {formatFrenchDateShort(sess.startAt.toDate())}
                          </p>
                          <h4 className="mt-0.5 truncate font-display text-sm font-bold text-slate-900 dark:text-white">
                            {sess.title}
                          </h4>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {sess.memberName} ({sess.memberEmail})
                          </p>
                        </div>
                        <span
                          className={`shrink-0 font-mono text-[11px] font-bold tabular-nums ${
                            isPaid
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {sess.isPaid
                            ? isPaid
                              ? `Payé · ${formatPriceEuros(sess.priceCents ?? 900)}`
                              : `À régler · ${formatPriceEuros(sess.priceCents ?? 900)}`
                            : 'Offert · Gratuit'}
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                        {sess.exercises?.length ?? 0} exercice
                        {(sess.exercises?.length ?? 0) > 1 ? 's' : ''} ·{' '}
                        {sess.durationMinutes} min
                        {sess.objective ? ` · ${sess.objective}` : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Search & Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un exercice (ex. Squat, VMA, Fentes, Gainage, Côte...)"
              className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Tous (${counts.total})` },
                {
                  id: 'strength',
                  label: `Renforcement (${counts.strength})`,
                },
                { id: 'running', label: `Running (${counts.running})` },
                { id: 'mobility', label: `Mobilité (${counts.mobility})` },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  categoryFilter === cat.id
                    ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Objective Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Objectif :
          </span>
          <button
            type="button"
            onClick={() => setObjectiveFilter('all')}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
              objectiveFilter === 'all'
                ? 'bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            Tous
          </button>
          {allObjectiveOptions.map((obj) => (
            <button
              key={obj}
              type="button"
              onClick={() => setObjectiveFilter(obj)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                objectiveFilter === obj
                  ? 'bg-emerald-100 font-semibold text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {obj}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise Cards Grid */}
      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="font-display text-base font-bold text-slate-900 dark:text-white">
            Aucun exercice trouvé
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Modifiez les filtres ou créez un nouvel exercice personnalisé.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredRows.map((row) => {
            const meta = getExerciseCategoryMeta(row.category);
            return (
              <div
                key={row.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}
                    >
                      {row.category === 'running' ? (
                        <Footprints className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Dumbbell className="h-3 w-3" aria-hidden="true" />
                      )}
                      {meta.label}
                    </span>

                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {row.isStored ? 'Enregistré' : 'Modèle de base'}
                    </span>
                  </div>

                  <h3 className="mt-2.5 font-display text-base font-bold text-slate-900 dark:text-white">
                    {row.name}
                  </h3>

                  {row.intensityHint && (
                    <p className="mt-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      {row.intensityHint}
                    </p>
                  )}

                  {row.description && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {row.description}
                    </p>
                  )}

                  {row.targetObjectives.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {row.targetObjectives.map((obj) => (
                        <span
                          key={obj}
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {obj}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 5 Configurable Default Parameters Grid */}
                  <div className="mt-3.5 grid grid-cols-5 gap-1.5 rounded-lg border border-slate-100 bg-slate-50/80 p-2 text-center dark:border-slate-800 dark:bg-slate-950/60">
                    <div>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">
                        Rép.
                      </p>
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                        {row.defaultParams.repetitions > 0
                          ? row.defaultParams.repetitions
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">
                        Durée
                      </p>
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                        {row.defaultParams.durationSeconds > 0
                          ? formatSecondsCompact(
                              row.defaultParams.durationSeconds
                            )
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">
                        Tours
                      </p>
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                        {row.defaultParams.setsOrRounds}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">
                        Pause
                      </p>
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatSecondsCompact(
                          row.defaultParams.intraSetPauseSeconds
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold uppercase text-slate-400">
                        Repos
                      </p>
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatSecondsCompact(
                          row.defaultParams.restBetweenRoundsSeconds
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleOpenProgramWithExercise(row)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 cursor-pointer"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>+ Programme</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {confirmDeleteId === row.id ? (
                      <>
                        <button
                          type="button"
                          disabled={deletingId === row.id}
                          onClick={() =>
                            void handleDeleteExercise(row.id, row.name)
                          }
                          className="rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                        >
                          {deletingId === row.id ? 'Suppr...' : 'Confirmer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditExercise(row)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          <span>
                            {row.isStored ? 'Modifier' : 'Personnaliser'}
                          </span>
                        </button>
                        {row.isStored && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(row.id)}
                            aria-label={`Supprimer ${row.name}`}
                            className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1.5 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-300 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Add / Edit Exercise Modal */}
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exercise-form-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div>
                <h3
                  id="exercise-form-title"
                  className="font-display text-lg font-bold text-slate-900 dark:text-white"
                >
                  {editingRow
                    ? editingRow.isStored
                      ? 'Modifier l’exercice'
                      : 'Personnaliser & enregistrer l’exercice'
                    : 'Ajouter un nouvel exercice'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Définissez la catégorie, les objectifs ciblés et les
                  paramètres par défaut.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditingRow(null);
                }}
                aria-label="Fermer"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmitExercise} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="ex-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Nom de l’exercice *
                  </label>
                  <input
                    id="ex-name"
                    type="text"
                    required
                    minLength={VALIDATION_LIMITS.EXERCISE_NAME_MIN}
                    maxLength={VALIDATION_LIMITS.EXERCISE_NAME_MAX}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ex. Squat bulgare, Fractionné 200m..."
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ex-category"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Catégorie *
                  </label>
                  <select
                    id="ex-category"
                    value={formCategory}
                    onChange={(e) =>
                      setFormCategory(e.target.value as ExerciseCategory)
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="strength">Renforcement musculaire</option>
                    <option value="running">Running spécifique</option>
                    <option value="mobility">Mobilité & Prévention</option>
                  </select>
                </div>
              </div>

              {/* Target Objectives */}
              <div>
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Objectifs ciblés (max {VALIDATION_LIMITS.EXERCISE_OBJECTIVES_MAX_COUNT})
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {allObjectiveOptions.map((obj) => {
                    const active = formObjectives.some(
                      (o) => o.toLowerCase() === obj.toLowerCase()
                    );
                    return (
                      <button
                        key={obj}
                        type="button"
                        onClick={() => toggleFormObjective(obj)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {obj}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    maxLength={VALIDATION_LIMITS.EXERCISE_OBJECTIVE_MAX}
                    value={customObjectiveInput}
                    onChange={(e) => setCustomObjectiveInput(e.target.value)}
                    placeholder="Ajouter un objectif personnalisé (ex. Prépa Trail)..."
                    className="min-h-[36px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomObjective}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    + Ajouter
                  </button>
                </div>
              </div>

              {/* 5 Default Parameters */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Paramètres par défaut de l’exercice
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Modifiables ensuite exercice par exercice dans chaque
                  programme adhérent.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <label
                      htmlFor="ex-reps"
                      className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Répétitions
                    </label>
                    <input
                      id="ex-reps"
                      type="number"
                      min={VALIDATION_LIMITS.EXERCISE_REPS_MIN}
                      max={VALIDATION_LIMITS.EXERCISE_REPS_MAX}
                      value={formParams.repetitions}
                      onChange={(e) =>
                        setFormParams((p) => ({
                          ...p,
                          repetitions: Math.round(Number(e.target.value) || 0),
                        }))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-[10px] text-slate-400">
                      0 si au temps
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="ex-duration"
                      className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Durée (sec)
                    </label>
                    <input
                      id="ex-duration"
                      type="number"
                      min={VALIDATION_LIMITS.EXERCISE_DURATION_MIN}
                      max={VALIDATION_LIMITS.EXERCISE_DURATION_MAX}
                      value={formParams.durationSeconds}
                      onChange={(e) =>
                        setFormParams((p) => ({
                          ...p,
                          durationSeconds: Math.round(
                            Number(e.target.value) || 0
                          ),
                        }))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-[10px] text-slate-400">
                      {formParams.durationSeconds > 0
                        ? formatSecondsCompact(formParams.durationSeconds)
                        : '0 si aux rép.'}
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="ex-rounds"
                      className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Nb tours *
                    </label>
                    <input
                      id="ex-rounds"
                      type="number"
                      required
                      min={VALIDATION_LIMITS.EXERCISE_ROUNDS_MIN}
                      max={VALIDATION_LIMITS.EXERCISE_ROUNDS_MAX}
                      value={formParams.setsOrRounds}
                      onChange={(e) =>
                        setFormParams((p) => ({
                          ...p,
                          setsOrRounds: Math.max(
                            1,
                            Math.round(Number(e.target.value) || 1)
                          ),
                        }))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ex-pause"
                      className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Pause (sec)
                    </label>
                    <input
                      id="ex-pause"
                      type="number"
                      min={VALIDATION_LIMITS.EXERCISE_PAUSE_MIN}
                      max={VALIDATION_LIMITS.EXERCISE_PAUSE_MAX}
                      value={formParams.intraSetPauseSeconds}
                      onChange={(e) =>
                        setFormParams((p) => ({
                          ...p,
                          intraSetPauseSeconds: Math.round(
                            Number(e.target.value) || 0
                          ),
                        }))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-[10px] text-slate-400">
                      Intra-tour
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="ex-rest"
                      className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Repos (sec)
                    </label>
                    <input
                      id="ex-rest"
                      type="number"
                      min={VALIDATION_LIMITS.EXERCISE_REST_MIN}
                      max={VALIDATION_LIMITS.EXERCISE_REST_MAX}
                      value={formParams.restBetweenRoundsSeconds}
                      onChange={(e) =>
                        setFormParams((p) => ({
                          ...p,
                          restBetweenRoundsSeconds: Math.round(
                            Number(e.target.value) || 0
                          ),
                        }))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-[10px] text-slate-400">
                      Entre tours
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ex-intensity"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Repère d’intensité / charge / allure (optionnel)
                </label>
                <input
                  id="ex-intensity"
                  type="text"
                  maxLength={VALIDATION_LIMITS.EXERCISE_INTENSITY_MAX}
                  value={formIntensity}
                  onChange={(e) => setFormIntensity(e.target.value)}
                  placeholder="Ex. 95% VMA, Charge modérée, Zone 2..."
                  className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="ex-desc"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Consignes techniques & exécution
                </label>
                <textarea
                  id="ex-desc"
                  rows={3}
                  maxLength={VALIDATION_LIMITS.EXERCISE_DESCRIPTION_MAX}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Placement, rythme, respiration, points de vigilance..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingRow(null);
                  }}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="min-h-[38px] rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  {formSaving
                    ? 'Enregistrement...'
                    : editingRow && editingRow.isStored
                      ? 'Enregistrer'
                      : 'Ajouter à la bibliothèque'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Program Builder Modal */}
      {programModalOpen && (
        <ProgramBuilderModal
          coachUid={coachUid}
          coachName={coachName}
          coachDirectory={coachDirectory}
          isPrimaryCoach={isPrimaryCoach}
          disciplines={disciplines}
          exercises={exercises}
          memberCandidates={memberCandidates}
          initialExercises={programInitialExercises}
          onClose={() => setProgramModalOpen(false)}
          onSaved={(msg) => {
            setLibraryTab('programs');
            setFeedback({
              type: 'success',
              text: msg,
            });
          }}
        />
      )}

      {/* Running 12-Week Program Builder Modal */}
      {runningModalOpen && (
        <RunningProgramBuilderModal
          coachUid={coachUid}
          coachName={coachName}
          coachDirectory={coachDirectory}
          isPrimaryCoach={isPrimaryCoach}
          memberCandidates={memberCandidates}
          initialDistance={runningInitialDistance}
          editingProgram={editingRunningProgram}
          onClose={() => {
            setRunningModalOpen(false);
            setEditingRunningProgram(null);
          }}
          onSaved={(msg) => {
            setLibraryTab('programs');
            setFeedback({
              type: 'success',
              text: msg,
            });
          }}
        />
      )}

      {/* Coach Day 1 VMA Entry Modal */}
      {vmaTestProgram && (
        <VmaTestModal
          program={vmaTestProgram}
          isCoach
          nowMs={nowMs}
          onClose={() => setVmaTestProgram(null)}
          onSubmitted={(vma) =>
            setFeedback({
              type: 'success',
              text: `VMA de ${vma.toFixed(1)} km/h enregistrée pour ${vmaTestProgram.memberName}. Les allures des ${vmaTestProgram.durationWeeks || 12} semaines sont calibrées.`,
            })
          }
        />
      )}

      {/* Program Sessions & Exercises Editor Modal */}
      {editingSessionsProgramTarget &&
        (() => {
          const liveProg = trainingPrograms.find(
            (p) => p.id === editingSessionsProgramTarget.programId
          );
          if (!liveProg) return null;
          return (
            <RunningSessionEditorModal
              program={liveProg}
              exercises={exercises}
              initialSessionKey={editingSessionsProgramTarget.sessionKey}
              onClose={() => setEditingSessionsProgramTarget(null)}
              onSaved={(msg) =>
                setFeedback({
                  type: 'success',
                  text: msg,
                })
              }
            />
          );
        })()}
    </div>
  );
}
