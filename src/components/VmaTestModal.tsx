import { FormEvent, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Gauge, Info, X } from 'lucide-react';
import { TrainingProgram, VALIDATION_LIMITS } from '../types';
import { submitTrainingProgramVmaTest } from '../services/firestoreService';
import {
  computeVmaFromTest,
  computeVmaPaceZones,
  formatDurationHMS,
  formatPaceMinPerKm,
  formatPreferredDaysShort,
  getProgramAutoSendConfig,
  paceSecToKmh,
  RUNNING_DISTANCE_TEMPLATES,
} from '../utils/runningProgramGenerator';

interface VmaTestModalProps {
  program: TrainingProgram;
  isCoach?: boolean;
  nowMs?: number;
  onClose: () => void;
  onSubmitted?: (vmaKmh: number) => void;
}

export function VmaTestModal({
  program,
  onClose,
  onSubmitted,
}: VmaTestModalProps) {
  const [inputMode, setInputMode] = useState<'demicooper' | 'direct'>(
    program.vmaTestDistanceMeters > 0 ? 'demicooper' : 'demicooper'
  );
  const [distanceMeters, setDistanceMeters] = useState<number>(
    program.vmaTestDistanceMeters > 0 ? program.vmaTestDistanceMeters : 1200
  );
  const [durationSeconds, setDurationSeconds] = useState<number>(
    program.vmaTestDurationSeconds > 0 ? program.vmaTestDurationSeconds : 360
  );
  const [directVmaKmh, setDirectVmaKmh] = useState<string>(
    program.vmaKmh > 0 ? String(program.vmaKmh) : '12.0'
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tpl = RUNNING_DISTANCE_TEMPLATES[program.distance];
  const chosenDaysLabel = formatPreferredDaysShort(
    program.preferredDays,
    program.sessionsPerWeek
  );
  const autoSendConfig = getProgramAutoSendConfig(program);

  const computedVma = useMemo(() => {
    if (inputMode === 'direct') {
      const parsed = Number(directVmaKmh.replace(',', '.'));
      if (!Number.isFinite(parsed)) return 0;
      return Math.round(parsed * 10) / 10;
    }
    return computeVmaFromTest(distanceMeters, durationSeconds);
  }, [inputMode, directVmaKmh, distanceMeters, durationSeconds]);

  const isVmaValid =
    computedVma >= VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH &&
    computedVma <= VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH;

  const previewZones = useMemo(() => {
    if (!isVmaValid) return null;
    return computeVmaPaceZones(
      computedVma,
      program.distance,
      program.targetTimeSeconds
    );
  }, [isVmaValid, computedVma, program.distance, program.targetTimeSeconds]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isVmaValid) {
      setError(
        `La VMA doit être comprise entre ${VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH} et ${VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH} km/h.`
      );
      return;
    }

    setSaving(true);
    try {
      const savedVma = await submitTrainingProgramVmaTest({
        program,
        distanceMeters: inputMode === 'demicooper' ? distanceMeters : undefined,
        durationSeconds:
          inputMode === 'demicooper' ? durationSeconds : undefined,
        directVmaKmh: inputMode === 'direct' ? computedVma : undefined,
      });
      onSubmitted?.(savedVma);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer le test VMA.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vma-test-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-400">
              <Gauge className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="vma-test-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                Test VMA · Effectuable n’importe quel jour
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {program.title} · Objectif {tpl.shortLabel} en{' '}
                {formatDurationHMS(program.targetTimeSeconds)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre du test VMA"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/80 p-3.5 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-100">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden="true" />
            <p>
              Seule la séance <strong>Test VMA</strong> peut être effectuée n’importe quel jour.
              Tant que ce test n’est pas validé, l’envoi du programme reste en attente.
              Dès validation, vous recevez immédiatement la <strong>Semaine 1</strong> (jours choisis :{' '}
              <strong>{chosenDaysLabel}</strong>), puis la Semaine 2 le <strong>{autoSendConfig.label}</strong> et ainsi de suite chaque {autoSendConfig.label}.
            </p>
          </div>

          {/* Protocol explainer */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
            <p className="font-bold text-slate-900 dark:text-white">
              Protocole Demi-Cooper (6 minutes)
            </p>
            <p className="mt-1 leading-relaxed">
              Après 15 min d’échauffement souple, courez la plus grande distance possible pendant
              6 minutes à allure régulière. Votre VMA calibre automatiquement toutes vos séances
              des {program.durationWeeks || 12} semaines.
            </p>
          </div>

          {/* Mode switch */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setInputMode('demicooper')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                inputMode === 'demicooper'
                  ? 'border-sky-600 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Calculer depuis distance & durée
            </button>
            <button
              type="button"
              onClick={() => setInputMode('direct')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${
                inputMode === 'direct'
                  ? 'border-sky-600 bg-sky-50 text-sky-900 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Saisir la VMA (km/h) directement
            </button>
          </div>

          {inputMode === 'demicooper' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="vma-distance"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Distance parcourue (mètres) *
                </label>
                <input
                  id="vma-distance"
                  type="number"
                  min={400}
                  max={5000}
                  step={10}
                  required
                  value={distanceMeters}
                  onChange={(e) =>
                    setDistanceMeters(Math.max(0, Math.round(Number(e.target.value) || 0)))
                  }
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm font-semibold text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Ex. 1200 m en 6 min = 12.0 km/h · 1500 m = 15.0 km/h
                </span>
              </div>

              <div>
                <label
                  htmlFor="vma-duration"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Durée du test (secondes) *
                </label>
                <input
                  id="vma-duration"
                  type="number"
                  min={180}
                  max={1800}
                  step={30}
                  required
                  value={durationSeconds}
                  onChange={(e) =>
                    setDurationSeconds(Math.max(60, Math.round(Number(e.target.value) || 360)))
                  }
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm font-semibold text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  360 sec = 6 min (Demi-Cooper standard)
                </span>
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor="vma-direct"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                VMA mesurée (km/h) *
              </label>
              <input
                id="vma-direct"
                type="number"
                min={VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH}
                max={VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH}
                step="0.1"
                required
                value={directVmaKmh}
                onChange={(e) => setDirectVmaKmh(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm font-semibold text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}

          {/* Computed Pace Zones Preview */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Allures calculées pour les {program.durationWeeks || 12} semaines
                </span>
              </div>
              <span className="font-mono text-base font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                {isVmaValid ? `VMA ${computedVma.toFixed(1)} km/h` : 'VMA invalide'}
              </span>
            </div>

            {previewZones ? (
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  {
                    label: 'EF Z2 (65–72%)',
                    pace: `${formatPaceMinPerKm(previewZones.efMinSecPerKm)} – ${formatPaceMinPerKm(previewZones.efMaxSecPerKm)}`,
                    sub: 'Footing & sorties longues',
                  },
                  {
                    label: 'Seuil (86%)',
                    pace: formatPaceMinPerKm(previewZones.seuilSecPerKm),
                    sub: `${paceSecToKmh(previewZones.seuilSecPerKm)} km/h`,
                  },
                  {
                    label: `Allure ${tpl.shortLabel}`,
                    pace: formatPaceMinPerKm(
                      program.distance === '5km'
                        ? previewZones.as5SecPerKm
                        : program.distance === '10km'
                          ? previewZones.as10SecPerKm
                          : program.distance === '21km'
                            ? previewZones.as21SecPerKm
                            : previewZones.as42SecPerKm
                    ),
                    sub: `Obj. chrono ${formatPaceMinPerKm(previewZones.targetRacePaceSecPerKm)}`,
                  },
                  {
                    label: 'VMA 100%',
                    pace: formatPaceMinPerKm(previewZones.vma100SecPerKm),
                    sub: `${previewZones.vmaKmh.toFixed(1)} km/h`,
                  },
                ].map((z) => (
                  <div
                    key={z.label}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {z.label}
                    </p>
                    <p className="mt-0.5 font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                      {z.pace}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-emerald-700 dark:text-emerald-400">
                      {z.sub}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
                Renseignez une valeur produisant une VMA entre 6.0 et 26.0 km/h.
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !isVmaValid}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {saving
                ? 'Calcul des allures...'
                : 'Valider la VMA & générer les allures'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
