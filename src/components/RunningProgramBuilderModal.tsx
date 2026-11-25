import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Clock,
  CreditCard,
  Footprints,
  Gauge,
  Timer,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CoachDirectoryEntry,
  EventPaymentMode,
  ProgramRunnerLevel,
  RunningDistanceKey,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';
import {
  createTrainingProgram,
  updateTrainingProgramConfig,
} from '../services/firestoreService';
import {
  formatPriceEuros,
  toLocalDateInputValue,
} from '../utils/dateAndValidation';
import {
  getCoachRunningProgramPriceCents,
  hasCoachCustomRunningPrice,
} from '../utils/coachPricingHelpers';
import {
  AUTO_SEND_WEEKDAY_OPTIONS,
  computeTargetRacePaceSecPerKm,
  DEFAULT_AUTO_SEND_DAY,
  DEFAULT_AUTO_SEND_TIME,
  formatAutoSendLabel,
  formatDurationHMS,
  formatPaceMinPerKm,
  formatPreferredDaysShort,
  getDefaultPreferredDays,
  getProgramDurationWeeks,
  getProgramPhases,
  getProgramRunnerLevelLabel,
  inferProgramLevelFromDuration,
  mapFitnessLevelToProgramLevel,
  normalizePreferredDays,
  PROGRAM_RUNNER_LEVEL_OPTIONS,
  RUNNING_DISTANCE_LIST,
  RUNNING_DISTANCE_TEMPLATES,
  WEEKDAY_OPTIONS,
} from '../utils/runningProgramGenerator';
import { ProgramMemberCandidate } from './ProgramBuilderModal';

interface RunningProgramBuilderModalProps {
  coachUid: string;
  coachName: string;
  coachDirectory: CoachDirectoryEntry[];
  isPrimaryCoach?: boolean;
  memberCandidates: ProgramMemberCandidate[];
  initialMember?: ProgramMemberCandidate | null;
  initialDistance?: RunningDistanceKey;
  editingProgram?: TrainingProgram | null;
  onClose: () => void;
  onSaved?: (message: string, targetDate?: Date) => void;
}

function splitSecondsToHMS(totalSeconds: number): {
  h: number;
  m: number;
  s: number;
} {
  const safe = Math.max(0, Math.round(totalSeconds));
  return {
    h: Math.floor(safe / 3600),
    m: Math.floor((safe % 3600) / 60),
    s: safe % 60,
  };
}

function formatRunningProgramError(err: unknown): string {
  const fallback = 'Impossible d’enregistrer le programme running.';
  if (!(err instanceof Error)) return fallback;
  const raw = err.message.trim();
  if (!raw) return fallback;

  let extracted = raw;
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) extracted = parsed.error;
    } catch {
      extracted = raw;
    }
  }

  const lower = extracted.toLowerCase();
  if (
    lower.includes('permission') ||
    lower.includes('insufficient permissions')
  ) {
    return 'Autorisation refusée par Firestore : vérifiez que vous êtes bien connecté avec votre compte coach vérifié (davidfrosio@hotmail.fr ou coach actif).';
  }

  return extracted;
}

export function RunningProgramBuilderModal({
  coachUid,
  coachName,
  coachDirectory,
  isPrimaryCoach = false,
  memberCandidates,
  initialMember = null,
  initialDistance = '10km',
  editingProgram = null,
  onClose,
  onSaved,
}: RunningProgramBuilderModalProps) {
  const defaultMemberEmail =
    editingProgram?.memberEmail ||
    initialMember?.email ||
    memberCandidates[0]?.email ||
    '';

  const [selectedMemberEmail, setSelectedMemberEmail] =
    useState(defaultMemberEmail);

  useEffect(() => {
    if (
      !editingProgram &&
      !initialMember &&
      !selectedMemberEmail &&
      memberCandidates.length > 0
    ) {
      setSelectedMemberEmail(memberCandidates[0].email);
    }
  }, [editingProgram, initialMember, selectedMemberEmail, memberCandidates]);

  const selectedMember = useMemo(() => {
    const clean = selectedMemberEmail.trim().toLowerCase();
    const fromList = memberCandidates.find(
      (m) => m.email.trim().toLowerCase() === clean
    );
    if (fromList) return fromList;
    if (initialMember && initialMember.email.trim().toLowerCase() === clean) {
      return initialMember;
    }
    if (editingProgram) {
      return {
        email: editingProgram.memberEmail,
        emailKey: editingProgram.memberEmailKey,
        name: editingProgram.memberName,
      };
    }
    return null;
  }, [selectedMemberEmail, memberCandidates, initialMember, editingProgram]);

  const [distance, setDistance] = useState<RunningDistanceKey>(
    editingProgram?.distance ?? initialDistance
  );
  const tpl = RUNNING_DISTANCE_TEMPLATES[distance];

  const [runnerLevel, setRunnerLevel] = useState<ProgramRunnerLevel>(() => {
    if (editingProgram) {
      return (
        editingProgram.level ??
        inferProgramLevelFromDuration(
          editingProgram.distance,
          editingProgram.durationWeeks
        )
      );
    }
    return mapFitnessLevelToProgramLevel(initialMember?.fitnessLevel);
  });
  const [levelTouched, setLevelTouched] = useState(Boolean(editingProgram));
  const [titleTouched, setTitleTouched] = useState(Boolean(editingProgram));

  const durationWeeks = getProgramDurationWeeks(distance, runnerLevel);

  const [title, setTitle] = useState(
    editingProgram?.title || `${tpl.label} · ${durationWeeks} semaines`
  );
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(
    editingProgram?.sessionsPerWeek ?? tpl.defaultSessionsPerWeek
  );
  const [preferredDays, setPreferredDays] = useState<number[]>(
    editingProgram?.preferredDays ??
      getDefaultPreferredDays(tpl.defaultSessionsPerWeek)
  );

  // Sync suggested level from selected member's fitness profile when creating (if not overridden)
  useEffect(() => {
    if (editingProgram || levelTouched || !selectedMember?.fitnessLevel) return;
    const mapped = mapFitnessLevelToProgramLevel(selectedMember.fitnessLevel);
    setRunnerLevel(mapped);
    if (!titleTouched) {
      const nextWeeks = getProgramDurationWeeks(distance, mapped);
      setTitle(`${RUNNING_DISTANCE_TEMPLATES[distance].label} · ${nextWeeks} semaines`);
    }
  }, [editingProgram, levelTouched, titleTouched, selectedMember, distance]);

  const initialHMS = splitSecondsToHMS(
    editingProgram?.targetTimeSeconds ?? tpl.defaultTargetTimeSeconds
  );
  const [targetHours, setTargetHours] = useState<number>(initialHMS.h);
  const [targetMinutes, setTargetMinutes] = useState<number>(initialHMS.m);
  const [targetSeconds, setTargetSeconds] = useState<number>(initialHMS.s);

  const [startDateStr, setStartDateStr] = useState<string>(() =>
    editingProgram
      ? toLocalDateInputValue(
          (editingProgram.desiredStartAt ?? editingProgram.startAt).toDate()
        )
      : toLocalDateInputValue(new Date())
  );
  const [autoSendDay, setAutoSendDay] = useState<number>(
    () => editingProgram?.autoSendDay ?? DEFAULT_AUTO_SEND_DAY
  );
  const [autoSendTime, setAutoSendTime] = useState<string>(
    () => editingProgram?.autoSendTime ?? DEFAULT_AUTO_SEND_TIME
  );
  const autoSendLabel = formatAutoSendLabel(autoSendDay, autoSendTime);

  const [coachRefUid, setCoachRefUid] = useState<string>(
    editingProgram?.coachUid || coachUid
  );
  const selectedCoachEntry = useMemo(
    () => coachDirectory.find((c) => c.uid === coachRefUid) ?? null,
    [coachDirectory, coachRefUid]
  );
  const [priceTouched, setPriceTouched] = useState<boolean>(
    Boolean(editingProgram)
  );

  const [isPaid, setIsPaid] = useState<boolean>(() =>
    editingProgram ? Boolean(editingProgram.isPaid) : true
  );
  const [priceEuros, setPriceEuros] = useState<string>(() => {
    if (editingProgram?.priceCents && editingProgram.priceCents >= 100) {
      return (editingProgram.priceCents / 100).toFixed(2);
    }
    const initialCoach = coachDirectory.find(
      (c) => c.uid === (editingProgram?.coachUid || coachUid)
    );
    const resolved = getCoachRunningProgramPriceCents(
      initialCoach?.pricing,
      editingProgram?.distance ?? initialDistance
    );
    return (resolved / 100).toFixed(2);
  });
  const [paymentMode, setPaymentMode] = useState<EventPaymentMode>(
    editingProgram?.paymentMode ?? 'both'
  );
  const [markPaid, setMarkPaid] = useState<boolean>(false);

  const [notes, setNotes] = useState<string>(editingProgram?.notes || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetTotalSeconds =
    Math.max(0, targetHours) * 3600 +
    Math.max(0, targetMinutes) * 60 +
    Math.max(0, targetSeconds);

  const targetPaceSecPerKm = useMemo(
    () =>
      computeTargetRacePaceSecPerKm(
        distance,
        Math.max(
          VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MIN_SEC,
          targetTotalSeconds
        )
      ),
    [distance, targetTotalSeconds]
  );

  const phasesPreview = useMemo(
    () => getProgramPhases(distance, durationWeeks),
    [distance, durationWeeks]
  );

  const handleDistanceChange = (nextDist: RunningDistanceKey) => {
    if (editingProgram) return;
    setDistance(nextDist);
    const nextTpl = RUNNING_DISTANCE_TEMPLATES[nextDist];
    const nextWeeks = getProgramDurationWeeks(nextDist, runnerLevel);
    if (!titleTouched) {
      setTitle(`${nextTpl.label} · ${nextWeeks} semaines`);
    }
    setSessionsPerWeek(nextTpl.defaultSessionsPerWeek);
    setPreferredDays(getDefaultPreferredDays(nextTpl.defaultSessionsPerWeek));
    const hms = splitSecondsToHMS(nextTpl.defaultTargetTimeSeconds);
    setTargetHours(hms.h);
    setTargetMinutes(hms.m);
    setTargetSeconds(hms.s);
    if (!priceTouched) {
      const nextPriceCents = getCoachRunningProgramPriceCents(
        selectedCoachEntry?.pricing,
        nextDist
      );
      setPriceEuros((nextPriceCents / 100).toFixed(2));
    }
  };

  const handleCoachChange = (nextCoachUid: string) => {
    setCoachRefUid(nextCoachUid);
    if (!editingProgram && !priceTouched) {
      const nextCoach = coachDirectory.find((c) => c.uid === nextCoachUid);
      const nextPriceCents = getCoachRunningProgramPriceCents(
        nextCoach?.pricing,
        distance
      );
      setPriceEuros((nextPriceCents / 100).toFixed(2));
    }
  };

  const handleLevelChange = (nextLevel: ProgramRunnerLevel) => {
    setRunnerLevel(nextLevel);
    setLevelTouched(true);
    if (!titleTouched) {
      const nextWeeks = getProgramDurationWeeks(distance, nextLevel);
      setTitle(`${tpl.label} · ${nextWeeks} semaines`);
    }
  };

  const handleSessionsPerWeekChange = (count: number) => {
    const clamped = Math.min(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
      Math.max(VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN, count)
    );
    setSessionsPerWeek(clamped);
    setPreferredDays((prev) => normalizePreferredDays(prev, clamped));
  };

  const togglePreferredDay = (day: number) => {
    setPreferredDays((prev) => {
      const exists = prev.includes(day);
      if (exists) {
        if (prev.length <= 1) return prev;
        return prev.filter((d) => d !== day);
      }
      if (prev.length >= sessionsPerWeek) {
        return [...prev.slice(1), day].sort((a, b) => a - b);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetEmail =
      editingProgram?.memberEmail ||
      selectedMember?.email ||
      selectedMemberEmail;
    const targetName =
      editingProgram?.memberName ||
      selectedMember?.name ||
      targetEmail.split('@')[0] ||
      'Adhérent';

    if (!targetEmail || !VALIDATION_LIMITS.EMAIL_REGEX.test(targetEmail.trim())) {
      setError('Veuillez sélectionner un adhérent valide.');
      return;
    }

    if (
      targetTotalSeconds < VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MIN_SEC ||
      targetTotalSeconds > VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MAX_SEC
    ) {
      setError(
        'Veuillez saisir un objectif chronométrique réaliste (entre 10 min et 10h).'
      );
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

    if (!startDateStr) {
      setError('Veuillez sélectionner la date de démarrage souhaitée du programme.');
      return;
    }

    const [y, m, d] = startDateStr.split('-').map(Number);
    // Start of Day 1 (00:00 local) so Day 1 VMA test is immediately unlocked on Day 1
    const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (Number.isNaN(startDate.getTime())) {
      setError('Date de début invalide.');
      return;
    }

    const normalizedDays = normalizePreferredDays(
      preferredDays,
      sessionsPerWeek
    );
    const effectiveCoachUid = isPrimaryCoach
      ? (coachRefUid || coachUid).trim()
      : editingProgram?.coachUid || coachUid;
    const selectedCoach = coachDirectory.find((c) => c.uid === effectiveCoachUid);
    const resolvedCoachUid = effectiveCoachUid;
    const resolvedCoachName =
      selectedCoach?.displayName || coachName || 'Coach';

    setSaving(true);
    try {
      if (editingProgram) {
        await updateTrainingProgramConfig(editingProgram.id, {
          title,
          distance,
          level: runnerLevel,
          sessionsPerWeek,
          preferredDays: normalizedDays,
          targetTimeSeconds: targetTotalSeconds,
          startDate,
          autoSendDay,
          autoSendTime,
          notes,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          isPaid,
          priceCents,
          paymentMode,
          existingProgram: editingProgram,
        });
        onSaved?.(
          `Programme « ${title} » (${durationWeeks} semaines) mis à jour pour ${targetName}.`,
          startDate
        );
      } else {
        await createTrainingProgram({
          memberEmail: targetEmail,
          memberName: targetName,
          title,
          distance,
          level: runnerLevel,
          sessionsPerWeek,
          preferredDays: normalizedDays,
          targetTimeSeconds: targetTotalSeconds,
          startDate,
          autoSendDay,
          autoSendTime,
          notes,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          isPaid,
          priceCents,
          paymentMode,
          markPaid: isPaid ? markPaid : false,
          createdByUid: coachUid,
        });
        onSaved?.(
          `Programme ${tpl.shortLabel} sur ${durationWeeks} semaines (${getProgramRunnerLevelLabel(runnerLevel)} · ${isPaid ? formatPriceEuros(priceCents) : 'Offert / gratuit'}) envoyé à ${targetName}. Une notification a été transmise à l’adhérent.`,
          startDate
        );
      }
      onClose();
    } catch (err) {
      setError(formatRunningProgramError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="running-program-builder-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-400">
              <Footprints className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="running-program-builder-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                {editingProgram
                  ? `Modifier le programme ${tpl.shortLabel} (${durationWeeks} sem.)`
                  : `Créer un programme running (${durationWeeks} semaines)`}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Plan spécifique 5 km, 10 km, 21 km ou 42 km · Durée adaptée au niveau · Test VMA effectuable n’importe quel jour
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

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Distance selector (5km, 10km, 21km, 42km) */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Distance cible *
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {RUNNING_DISTANCE_LIST.map((item) => {
                  const active = distance === item.key;
                  const itemWeeks = getProgramDurationWeeks(item.key, runnerLevel);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled={Boolean(editingProgram)}
                      onClick={() => handleDistanceChange(item.key)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        editingProgram ? 'opacity-80 cursor-default' : 'cursor-pointer'
                      } ${
                        active
                          ? 'border-sky-600 bg-sky-50/80 text-sky-950 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                      }`}
                    >
                      <p className="font-mono text-base font-bold tabular-nums">
                        {item.shortLabel}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {itemWeeks} sem. · {formatPriceEuros(item.defaultPriceCents)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Runner level selector (Débutant / Régulier / Expérimenté) */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Niveau du coureur (adapte la durée du cycle) *
                </span>
                <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                  Durée retenue : {durationWeeks} semaines
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PROGRAM_RUNNER_LEVEL_OPTIONS.map((opt) => {
                  const active = runnerLevel === opt.value;
                  const optWeeks = getProgramDurationWeeks(distance, opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleLevelChange(opt.value)}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/55 dark:text-emerald-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold">{opt.label}</span>
                        <span className="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {optWeeks} sem.
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Member & Title */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rp-member"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Adhérent destinataire *
                </label>
                {editingProgram || initialMember ? (
                  <div className="mt-1 flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <UserCheck
                      className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {selectedMember?.name || selectedMemberEmail}
                    </span>
                  </div>
                ) : memberCandidates.length > 0 ? (
                  <select
                    id="rp-member"
                    required
                    value={selectedMemberEmail}
                    onChange={(e) => setSelectedMemberEmail(e.target.value)}
                    className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Sélectionner un adhérent...</option>
                    {memberCandidates.map((m) => (
                      <option key={m.emailKey} value={m.email}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 space-y-1">
                    <input
                      id="rp-member"
                      type="email"
                      required
                      value={selectedMemberEmail}
                      onChange={(e) => setSelectedMemberEmail(e.target.value)}
                      placeholder="email.adherent@exemple.fr"
                      className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Aucun adhérent répertorié pour l’instant : saisissez directement son email ou ajoutez-le dans Adhérents.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="rp-title"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Intitulé du programme *
                </label>
                <input
                  id="rp-title"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.TITLE_MIN}
                  maxLength={VALIDATION_LIMITS.TITLE_MAX}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                  }}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Objectif temps + Start date (Day 1 VMA) */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2">
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Timer className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  Objectif temps de l’adhérent ({tpl.shortLabel}) *
                </span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="rp-hours"
                      className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400"
                    >
                      Heures
                    </label>
                    <input
                      id="rp-hours"
                      type="number"
                      min={0}
                      max={9}
                      value={targetHours}
                      onChange={(e) =>
                        setTargetHours(Math.max(0, Math.min(9, Math.round(Number(e.target.value) || 0))))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rp-mins"
                      className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400"
                    >
                      Minutes
                    </label>
                    <input
                      id="rp-mins"
                      type="number"
                      min={0}
                      max={59}
                      value={targetMinutes}
                      onChange={(e) =>
                        setTargetMinutes(Math.max(0, Math.min(59, Math.round(Number(e.target.value) || 0))))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rp-secs"
                      className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400"
                    >
                      Sec.
                    </label>
                    <input
                      id="rp-secs"
                      type="number"
                      min={0}
                      max={59}
                      value={targetSeconds}
                      onChange={(e) =>
                        setTargetSeconds(Math.max(0, Math.min(59, Math.round(Number(e.target.value) || 0))))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                  Objectif : {formatDurationHMS(targetTotalSeconds)} · Allure cible :{' '}
                  {formatPaceMinPerKm(targetPaceSecPerKm)}
                </p>
              </div>

              <div>
                <label
                  htmlFor="rp-start-date"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <Gauge className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Démarrage souhaité du programme *
                </label>
                <input
                  id="rp-start-date"
                  type="date"
                  required
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="mt-2 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  Tant que le Test VMA n’est pas validé, l’envoi du programme reste en attente. Dès validation du test, la Semaine 1 est envoyée immédiatement sur les jours choisis ({formatPreferredDaysShort(preferredDays, sessionsPerWeek)}), puis les semaines suivantes chaque {autoSendLabel}.
                </p>
              </div>
            </div>

            {/* Automatic Weekly Send Schedule (default: Sunday 18:00) */}
            <div className="rounded-xl border border-sky-200/80 bg-sky-50/40 p-4 dark:border-sky-900/60 dark:bg-sky-950/20 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                  <Clock className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                  Envoi automatique des semaines suivantes (Sem. 2 à {durationWeeks})
                </span>
                <span className="font-mono text-[11px] font-semibold text-sky-700 dark:text-sky-400">
                  Chaque {autoSendLabel}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="rp-autosend-day"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Jour d’envoi hebdomadaire
                  </label>
                  <select
                    id="rp-autosend-day"
                    value={autoSendDay}
                    onChange={(e) => setAutoSendDay(Number(e.target.value))}
                    className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {AUTO_SEND_WEEKDAY_OPTIONS.map((opt) => (
                      <option key={opt.day} value={opt.day}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="rp-autosend-time"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Heure d’envoi (18h00 par défaut)
                  </label>
                  <input
                    id="rp-autosend-time"
                    type="time"
                    required
                    value={autoSendTime}
                    onChange={(e) =>
                      setAutoSendTime(e.target.value || DEFAULT_AUTO_SEND_TIME)
                    }
                    className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm font-semibold text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Configurable Frequency (2..6 sessions/week, default 3) + Days */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Fréquence hebdomadaire sur {durationWeeks} semaines *
                </span>
                <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {durationWeeks * sessionsPerWeek} séances au total
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleSessionsPerWeekChange(n)}
                    className={`min-h-[36px] rounded-lg border px-3.5 py-1.5 font-mono text-xs font-bold cursor-pointer ${
                      sessionsPerWeek === n
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {n} séances / sem.
                  </button>
                ))}
              </div>

              <div>
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Jours d’entraînement préférés ({preferredDays.length}/{sessionsPerWeek} sélectionnés)
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTIONS.map((w) => {
                    const selected = preferredDays.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => togglePreferredDay(w.day)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                          selected
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {w.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Pricing: Free (offert) or Paid */}
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
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
                    className={`min-h-[30px] rounded-md px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
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
                    className={`min-h-[30px] rounded-md px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
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
                        htmlFor="rp-price"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Tarif du programme (€) *
                      </label>
                      <input
                        id="rp-price"
                        type="number"
                        min={1}
                        max={2000}
                        step="0.01"
                        required
                        value={priceEuros}
                        onChange={(e) => {
                          setPriceTouched(true);
                          setPriceEuros(e.target.value);
                        }}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm font-bold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      {hasCoachCustomRunningPrice(
                        selectedCoachEntry?.pricing,
                        distance
                      ) && (
                        <button
                          type="button"
                          onClick={() => {
                            const customCents = getCoachRunningProgramPriceCents(
                              selectedCoachEntry?.pricing,
                              distance
                            );
                            setPriceEuros((customCents / 100).toFixed(2));
                            setPriceTouched(false);
                          }}
                          className="mt-1 text-left text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
                        >
                          Tarif de {selectedCoachEntry?.displayName || coachName} ({tpl.shortLabel}) :{' '}
                          {formatPriceEuros(
                            getCoachRunningProgramPriceCents(
                              selectedCoachEntry?.pricing,
                              distance
                            )
                          )}
                        </button>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="rp-pay-mode"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Mode de règlement autorisé *
                      </label>
                      <select
                        id="rp-pay-mode"
                        value={paymentMode}
                        onChange={(e) =>
                          setPaymentMode(e.target.value as EventPaymentMode)
                        }
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="both">Carte en ligne ou sur place</option>
                        <option value="online">Carte en ligne uniquement</option>
                        <option value="onsite">Sur place uniquement</option>
                      </select>
                    </div>
                  </div>

                  {!editingProgram && (
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
                  Programme offert : aucun paiement demandé. Seule la séance Test VMA est disponible immédiatement ; l’envoi du programme reste en attente jusqu’à validation du test, puis la Semaine 1 est envoyée immédiatement et les suivantes chaque {autoSendLabel} ({formatPreferredDaysShort(preferredDays, sessionsPerWeek)}).
                </p>
              )}
            </div>

            {/* Coach & Notes */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rp-coach"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Coach référent
                </label>
                {isPrimaryCoach ? (
                  <select
                    id="rp-coach"
                    value={coachRefUid}
                    onChange={(e) => handleCoachChange(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {coachName && !coachDirectory.some((c) => c.uid === coachUid) && (
                      <option value={coachUid}>{coachName}</option>
                    )}
                    {editingProgram?.coachUid &&
                      editingProgram.coachUid !== coachUid &&
                      !coachDirectory.some((c) => c.uid === editingProgram.coachUid) && (
                        <option value={editingProgram.coachUid}>
                          {editingProgram.coachName || 'Coach référent'}
                        </option>
                      )}
                    {coachDirectory.map((c) => (
                      <option key={c.uid} value={c.uid}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div
                    id="rp-coach"
                    className="mt-1 flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
                  >
                    {coachName || editingProgram?.coachName || 'Coach'}
                  </div>
                )}
              </div>
              <div>
                <label
                  htmlFor="rp-notes"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Consignes personnalisées du coach
                </label>
                <input
                  id="rp-notes"
                  type="text"
                  maxLength={VALIDATION_LIMITS.SCHEDULE_NOTES_MAX}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex. Bien respecter l’échauffement avant le test VMA..."
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            {/* 4-Phase dynamic structure preview */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Structure générée sur {durationWeeks} semaines ({tpl.shortLabel} ·{' '}
                {getProgramRunnerLevelLabel(runnerLevel)})
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {phasesPreview.map((p) => (
                  <p
                    key={p}
                    className="rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                {error}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isPaid
                ? `Après paiement : Test VMA disponible. Tant qu’il n’est pas validé, l’envoi reste en attente ; dès validation, Semaine 1 envoyée puis chaque semaine suivante le ${autoSendLabel} (${durationWeeks} sem.).`
                : `Programme offert : Test VMA disponible. Envoi du programme en attente jusqu’à validation du test, puis Semaine 1 immédiate et semaines suivantes chaque ${autoSendLabel} (${durationWeeks} sem.).`}
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
                  : editingProgram
                    ? 'Mettre à jour le programme'
                    : `Créer le programme (${durationWeeks} sem.)`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
