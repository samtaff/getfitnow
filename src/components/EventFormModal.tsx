import { FormEvent, PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, CreditCard, ImagePlus, Link2, Move, Plus, RotateCcw, Trash2, UserCheck, X } from 'lucide-react';
import {
  CoachAdminUser,
  Discipline,
  DisciplineColorKey,
  DisciplineIconKey,
  DisciplineItem,
  EventPaymentMode,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  createCustomDiscipline,
  createEvent,
  deleteCustomDiscipline,
  updateEvent,
} from '../services/firestoreService';
import {
  formatBookingCutoffLabel,
  formatFrenchDateShort,
  formatFrenchTime,
  formatPriceEuros,
  getSafeEventCoverImageSrc,
  normalizeBookingCutoffMinutes,
  normalizeEventExternalUrl,
  parseCoverImagePosition,
  toLocalDateInputValue,
  toLocalTimeInputValue,
} from '../utils/dateAndValidation';
import { processEventCoverImageFile } from '../utils/imageUpload';
import {
  formatCentsForInput,
  getCoachGroupSessionPriceCents,
  hasCoachGroupSessionPrice,
} from '../utils/coachPricingHelpers';
import {
  DISCIPLINE_COLOR_KEYS,
  DISCIPLINE_COLOR_PRESETS,
  DISCIPLINE_ICON_KEYS,
  DISCIPLINE_ICON_PRESETS,
  getDisciplineStyle,
  inferDisciplineIconKey,
  pickNextUnusedColorKey,
} from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import { PlaceAutocompleteInput } from './PlaceAutocompleteInput';
import { ProfileAvatar } from './ProfileAvatar';

interface EventFormModalProps {
  coachUid: string;
  defaultCoachName: string;
  coachAdmins?: CoachAdminUser[];
  disciplines: DisciplineItem[];
  hasMapsApiKey: boolean;
  initialDate?: Date | null;
  editingEvent?: SportEvent | null;
  duplicatingEvent?: SportEvent | null;
  onClose: () => void;
}

interface CoachAssignment {
  uid?: string;
  name: string;
}

export function EventFormModal({
  coachUid,
  defaultCoachName,
  coachAdmins = [],
  disciplines,
  hasMapsApiKey,
  initialDate,
  editingEvent,
  duplicatingEvent,
  onClose,
}: EventFormModalProps) {
  const sourceEvent = editingEvent ?? duplicatingEvent ?? null;
  const isEditing = Boolean(editingEvent);
  const isDuplicating = Boolean(!editingEvent && duplicatingEvent);

  const defaultStart = (() => {
    if (editingEvent) return editingEvent.startAt.toDate();
    if (duplicatingEvent) {
      const d = new Date(duplicatingEvent.startAt.toDate());
      d.setDate(d.getDate() + 7);
      return d;
    }
    if (initialDate) {
      const d = new Date(initialDate);
      d.setHours(18, 30, 0, 0);
      return d;
    }
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(18, 30, 0, 0);
    return d;
  })();

  const [title, setTitle] = useState(sourceEvent?.title ?? '');
  const [discipline, setDiscipline] = useState<Discipline>(
    sourceEvent?.discipline ?? disciplines[0]?.name ?? ''
  );
  const [showNewDiscForm, setShowNewDiscForm] = useState(
    () => disciplines.length === 0
  );
  const [newDiscName, setNewDiscName] = useState('');
  const [manualDiscColor, setManualDiscColor] =
    useState<DisciplineColorKey | null>(null);
  const [manualDiscIcon, setManualDiscIcon] =
    useState<DisciplineIconKey | null>(null);
  const [addingDisc, setAddingDisc] = useState(false);
  const [deletingDisc, setDeletingDisc] = useState(false);
  const [discError, setDiscError] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(toLocalDateInputValue(defaultStart));
  const [timeStr, setTimeStr] = useState(toLocalTimeInputValue(defaultStart));
  const initialCutoffMinutes = sourceEvent
    ? normalizeBookingCutoffMinutes(sourceEvent.bookingCutoffMinutes)
    : 0;
  const presetCutoffValues = [0, 15, 30, 60, 120, 360, 1440];
  const [bookingCutoffMinutes, setBookingCutoffMinutes] = useState<number>(
    initialCutoffMinutes
  );
  const [customCutoffMode, setCustomCutoffMode] = useState<boolean>(
    initialCutoffMinutes > 0 && !presetCutoffValues.includes(initialCutoffMinutes)
  );
  const [customCutoffUnit, setCustomCutoffUnit] = useState<
    'minutes' | 'hours' | 'days'
  >(() => {
    if (initialCutoffMinutes >= 1440 && initialCutoffMinutes % 1440 === 0) {
      return 'days';
    }
    if (initialCutoffMinutes >= 60 && initialCutoffMinutes % 60 === 0) {
      return 'hours';
    }
    return 'minutes';
  });
  const [customCutoffValue, setCustomCutoffValue] = useState<string>(() => {
    if (initialCutoffMinutes === 0) return '45';
    if (initialCutoffMinutes >= 1440 && initialCutoffMinutes % 1440 === 0) {
      return String(initialCutoffMinutes / 1440);
    }
    if (initialCutoffMinutes >= 60 && initialCutoffMinutes % 60 === 0) {
      return String(initialCutoffMinutes / 60);
    }
    return String(initialCutoffMinutes);
  });
  const [durationMinutes, setDurationMinutes] = useState(
    sourceEvent?.durationMinutes ?? 60
  );
  const [isUnlimitedCapacity, setIsUnlimitedCapacity] = useState(
    sourceEvent?.isUnlimitedCapacity ?? false
  );
  const [maxCapacity, setMaxCapacity] = useState(
    sourceEvent && !sourceEvent.isUnlimitedCapacity
      ? sourceEvent.maxCapacity
      : 12
  );
  const [isPaid, setIsPaid] = useState(Boolean(sourceEvent?.isPaid));
  const [priceEurosInput, setPriceEurosInput] = useState(() => {
    if (sourceEvent?.isPaid && typeof sourceEvent.priceCents === 'number' && sourceEvent.priceCents > 0) {
      const euros = sourceEvent.priceCents / 100;
      return Number.isInteger(euros) ? String(euros) : euros.toFixed(2).replace('.', ',');
    }
    const creatorAdmin = coachAdmins.find((a) => a.uid === coachUid);
    if (hasCoachGroupSessionPrice(creatorAdmin?.pricing)) {
      return formatCentsForInput(creatorAdmin?.pricing?.groupSessionPriceCents);
    }
    return '15';
  });
  const [priceTouched, setPriceTouched] = useState(Boolean(sourceEvent));
  const [paymentMode, setPaymentMode] = useState<EventPaymentMode>(
    sourceEvent?.paymentMode ?? 'online'
  );
  const [location, setLocation] = useState(sourceEvent?.location ?? '');
  const [city, setCity] = useState(sourceEvent?.city ?? 'Paris');
  const [region, setRegion] = useState(sourceEvent?.region ?? '');
  const [coords, setCoords] = useState<{
    hasCoords: boolean;
    lat: number;
    lng: number;
  }>({
    hasCoords: sourceEvent?.hasCoords ?? false,
    lat: sourceEvent?.lat ?? 0,
    lng: sourceEvent?.lng ?? 0,
  });
  const activeTeamCoaches = useMemo(
    () => coachAdmins.filter((admin) => admin.active !== false),
    [coachAdmins]
  );

  const [selectedCoaches, setSelectedCoaches] = useState<CoachAssignment[]>(() => {
    const initialNames =
      Array.isArray(sourceEvent?.coachNames) && sourceEvent.coachNames.length > 0
        ? sourceEvent.coachNames
        : sourceEvent?.coachName
          ? sourceEvent.coachName
              .split(',')
              .map((n) => n.trim())
              .filter(Boolean)
          : [defaultCoachName];

    const initialUids = Array.isArray(sourceEvent?.coachUids)
      ? sourceEvent.coachUids
      : [];

    const activeCoachesList = coachAdmins.filter((a) => a.active !== false);

    return initialNames.map((name, idx) => {
      const matchedByName = activeCoachesList.find(
        (a) => a.displayName.trim().toLowerCase() === name.trim().toLowerCase()
      );
      const fallbackUid =
        !sourceEvent && idx === 0
          ? coachUid
          : initialUids[idx] && activeCoachesList.some((a) => a.uid === initialUids[idx])
            ? initialUids[idx]
            : undefined;
      return {
        uid: matchedByName?.uid ?? fallbackUid,
        name: name.trim(),
      };
    });
  });
  const [customCoachName, setCustomCoachName] = useState('');
  const [coachInputError, setCoachInputError] = useState<string | null>(null);
  const [description, setDescription] = useState(
    sourceEvent?.description ?? ''
  );
  const [externalUrl, setExternalUrl] = useState(
    sourceEvent?.externalUrl ?? ''
  );
  const [coverImageUrl, setCoverImageUrl] = useState(
    () => getSafeEventCoverImageSrc(sourceEvent?.coverImageUrl) ?? ''
  );
  const initialCoverPos = parseCoverImagePosition(sourceEvent?.coverImagePosition);
  const [coverPosX, setCoverPosX] = useState(initialCoverPos.x);
  const [coverPosY, setCoverPosY] = useState(initialCoverPos.y);
  const [processingCover, setProcessingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const coverDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    width: number;
    height: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCoverFileSelected = async (file: File | null | undefined) => {
    if (!file) return;
    setCoverError(null);
    setProcessingCover(true);
    try {
      const encoded = await processEventCoverImageFile(file);
      setCoverImageUrl(encoded);
      setCoverPosX(50);
      setCoverPosY(50);
    } catch (err) {
      setCoverError(
        err instanceof Error
          ? err.message
          : 'Impossible d’importer cette image.'
      );
    } finally {
      setProcessingCover(false);
      if (coverFileInputRef.current) {
        coverFileInputRef.current.value = '';
      }
    }
  };

  const handleCoverPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!coverImageUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    coverDragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: coverPosX,
      startY: coverPosY,
      width: rect.width,
      height: rect.height,
    };
  };

  const handleCoverPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = coverDragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    const nextX = Math.max(
      0,
      Math.min(100, Math.round(drag.startX - (dx / drag.width) * 100))
    );
    const nextY = Math.max(
      0,
      Math.min(100, Math.round(drag.startY - (dy / drag.height) * 100))
    );
    setCoverPosX(nextX);
    setCoverPosY(nextY);
  };

  const handleCoverPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (coverDragRef.current) {
      coverDragRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const selectOptions = useMemo(() => {
    const map = new Map<string, string>();
    disciplines.forEach((d) => map.set(d.name.toLowerCase(), d.name));
    if (discipline.trim() && !map.has(discipline.trim().toLowerCase())) {
      map.set(discipline.trim().toLowerCase(), discipline.trim());
    }
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base' })
    );
  }, [disciplines, discipline]);

  const selectedCatalogDiscipline = useMemo(
    () =>
      disciplines.find(
        (d) => d.name.trim().toLowerCase() === discipline.trim().toLowerCase()
      ) ?? null,
    [disciplines, discipline]
  );

  const parsedPreviewStart = useMemo(() => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }, [dateStr, timeStr]);

  const rawCustomMultiplier =
    customCutoffUnit === 'days' ? 1440 : customCutoffUnit === 'hours' ? 60 : 1;
  const parsedCustomNumber = Number(customCutoffValue.replace(',', '.'));
  const rawComputedCutoffMinutes = customCutoffMode
    ? Number.isFinite(parsedCustomNumber)
      ? Math.round(parsedCustomNumber * rawCustomMultiplier)
      : 0
    : bookingCutoffMinutes;
  const effectiveCutoffMinutes = normalizeBookingCutoffMinutes(
    rawComputedCutoffMinutes
  );

  const nowSnapshotMs = Date.now();
  const previewCutoffDate = useMemo(() => {
    if (!parsedPreviewStart || effectiveCutoffMinutes <= 0) return null;
    return new Date(
      parsedPreviewStart.getTime() - effectiveCutoffMinutes * 60 * 1000
    );
  }, [parsedPreviewStart, effectiveCutoffMinutes]);
  const isCustomCutoffPassed = Boolean(
    previewCutoffDate && previewCutoffDate.getTime() <= nowSnapshotMs
  );
  const isStartTimePassed = Boolean(
    parsedPreviewStart && parsedPreviewStart.getTime() <= nowSnapshotMs
  );

  const activeDiscStyle = getDisciplineStyle(discipline, disciplines);
  const usedDisciplineColorKeys = useMemo(
    () => new Set(disciplines.map((d) => d.colorKey)),
    [disciplines]
  );
  const selectedNewDiscColor =
    manualDiscColor ?? pickNextUnusedColorKey(disciplines);
  const selectedNewDiscIcon =
    manualDiscIcon ?? inferDisciplineIconKey(newDiscName);

  const handleAddInlineDiscipline = async () => {
    setDiscError(null);
    setAddingDisc(true);
    try {
      const createdName = await createCustomDiscipline({
        name: newDiscName,
        colorKey: selectedNewDiscColor,
        iconKey: selectedNewDiscIcon,
        coachUid,
        existingDisciplines: disciplines,
      });
      setDiscipline(createdName);
      setNewDiscName('');
      setManualDiscColor(null);
      setManualDiscIcon(null);
      setShowNewDiscForm(false);
    } catch (err) {
      setDiscError(
        err instanceof Error
          ? err.message
          : 'Impossible d’ajouter cette discipline.'
      );
    } finally {
      setAddingDisc(false);
    }
  };

  const handleDeleteSelectedDiscipline = async () => {
    if (!selectedCatalogDiscipline) return;
    setDiscError(null);
    setDeletingDisc(true);
    try {
      await deleteCustomDiscipline(selectedCatalogDiscipline.id);
      const remaining = disciplines.filter(
        (d) => d.id !== selectedCatalogDiscipline.id
      );
      setDiscipline(remaining[0]?.name ?? '');
      if (remaining.length === 0) {
        setShowNewDiscForm(true);
      }
    } catch (err) {
      setDiscError(
        err instanceof Error
          ? err.message
          : 'Impossible de supprimer cette discipline.'
      );
    } finally {
      setDeletingDisc(false);
    }
  };

  const syncPriceForFirstCoach = (nextList: CoachAssignment[]) => {
    if (sourceEvent || priceTouched) return;
    const primaryUid = nextList[0]?.uid || coachUid;
    const primaryAdmin =
      coachAdmins.find((a) => a.uid === primaryUid) ??
      coachAdmins.find((a) => a.uid === coachUid);
    if (hasCoachGroupSessionPrice(primaryAdmin?.pricing)) {
      setPriceEurosInput(
        formatCentsForInput(primaryAdmin?.pricing?.groupSessionPriceCents).replace('.', ',')
      );
    }
  };

  const toggleTeamCoach = (admin: CoachAdminUser) => {
    setCoachInputError(null);
    setSelectedCoaches((prev) => {
      const existsIdx = prev.findIndex(
        (c) =>
          (c.uid && c.uid === admin.uid) ||
          c.name.trim().toLowerCase() === admin.displayName.trim().toLowerCase()
      );
      if (existsIdx >= 0) {
        const next = prev.filter((_, idx) => idx !== existsIdx);
        syncPriceForFirstCoach(next);
        return next;
      }
      if (prev.length >= VALIDATION_LIMITS.COACHES_PER_EVENT_MAX) {
        setCoachInputError(
          `Maximum ${VALIDATION_LIMITS.COACHES_PER_EVENT_MAX} animateurs par événement.`
        );
        return prev;
      }
      const next = [...prev, { uid: admin.uid, name: admin.displayName.trim() }];
      syncPriceForFirstCoach(next);
      return next;
    });
  };

  const handleAddCustomCoach = () => {
    setCoachInputError(null);
    const clean = customCoachName
      .trim()
      .slice(0, VALIDATION_LIMITS.SINGLE_COACH_NAME_MAX);
    if (clean.length < VALIDATION_LIMITS.COACH_NAME_MIN) {
      setCoachInputError('Saisissez au moins 2 caractères pour ajouter un animateur.');
      return;
    }
    if (selectedCoaches.length >= VALIDATION_LIMITS.COACHES_PER_EVENT_MAX) {
      setCoachInputError(
        `Maximum ${VALIDATION_LIMITS.COACHES_PER_EVENT_MAX} animateurs par événement.`
      );
      return;
    }
    const alreadyExists = selectedCoaches.some(
      (c) => c.name.trim().toLowerCase() === clean.toLowerCase()
    );
    if (alreadyExists) {
      setCoachInputError('Cet animateur est déjà ajouté à la séance.');
      return;
    }

    const matchedTeam = activeTeamCoaches.find(
      (a) => a.displayName.trim().toLowerCase() === clean.toLowerCase()
    );
    setSelectedCoaches((prev) => {
      const next = [
        ...prev,
        { uid: matchedTeam?.uid, name: matchedTeam?.displayName.trim() || clean },
      ];
      syncPriceForFirstCoach(next);
      return next;
    });
    setCustomCoachName('');
  };

  const removeCoachAt = (index: number) => {
    setCoachInputError(null);
    setSelectedCoaches((prev) => {
      const next = prev.filter((_, i) => i !== index);
      syncPriceForFirstCoach(next);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (title.trim().length < VALIDATION_LIMITS.TITLE_MIN) {
      setErrorMsg('Le titre doit contenir au moins 2 caractères.');
      return;
    }

    if (
      !discipline.trim() ||
      discipline.trim().length < VALIDATION_LIMITS.DISCIPLINE_MIN
    ) {
      setErrorMsg('Veuillez choisir ou ajouter une discipline.');
      return;
    }

    if (selectedCoaches.length === 0) {
      setErrorMsg('Veuillez sélectionner ou ajouter au moins un animateur pour cette séance.');
      return;
    }

    if (location.trim().length < VALIDATION_LIMITS.LOCATION_MIN) {
      setErrorMsg('Veuillez saisir un lieu ou une adresse valide (2 caractères minimum).');
      return;
    }

    if (city.trim().length < VALIDATION_LIMITS.CITY_MIN) {
      setErrorMsg('Veuillez saisir une ville valide (2 caractères minimum).');
      return;
    }

    const parsedDuration = Number(durationMinutes);
    if (
      !Number.isFinite(parsedDuration) ||
      parsedDuration < VALIDATION_LIMITS.DURATION_MIN ||
      parsedDuration > VALIDATION_LIMITS.DURATION_MAX
    ) {
      setErrorMsg('La durée doit être comprise entre 15 et 240 minutes.');
      return;
    }

    const parsedCapacity = Number(maxCapacity);
    if (
      !isUnlimitedCapacity &&
      (!Number.isFinite(parsedCapacity) ||
        parsedCapacity < VALIDATION_LIMITS.CAPACITY_MIN ||
        parsedCapacity > VALIDATION_LIMITS.CAPACITY_MAX)
    ) {
      setErrorMsg('Le nombre de places doit être compris entre 1 et 200.');
      return;
    }

    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
      setErrorMsg('Veuillez saisir une date et une heure valides.');
      return;
    }
    const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

    const coachNames = selectedCoaches.map((c) => c.name);
    const coachUids = Array.from(
      new Set(
        selectedCoaches
          .map((c) => c.uid)
          .filter((u): u is string => Boolean(u))
      )
    );
    const combinedCoachName = coachNames
      .join(', ')
      .slice(0, VALIDATION_LIMITS.COACH_NAME_MAX);

    let priceCents = 0;
    if (isPaid) {
      const normalizedPrice = priceEurosInput.trim().replace(',', '.');
      const parsedEuros = Number(normalizedPrice);
      priceCents = Math.round(parsedEuros * 100);
      if (
        !normalizedPrice ||
        !Number.isFinite(parsedEuros) ||
        priceCents < VALIDATION_LIMITS.PRICE_MIN_CENTS ||
        priceCents > VALIDATION_LIMITS.PRICE_MAX_CENTS
      ) {
        setErrorMsg(
          'Veuillez saisir un tarif valide entre 1,00 € et 1 000,00 €.'
        );
        return;
      }
    }

    if (
      customCutoffMode &&
      (!Number.isFinite(parsedCustomNumber) ||
        parsedCustomNumber < 0 ||
        rawComputedCutoffMinutes > VALIDATION_LIMITS.BOOKING_CUTOFF_MINUTES_MAX)
    ) {
      setErrorMsg(
        'Le délai personnalisé de clôture doit être compris entre 0 et 7 jours (10 080 minutes).'
      );
      return;
    }

    const { url: normalizedExternalUrl, error: externalUrlError } =
      normalizeEventExternalUrl(externalUrl);
    if (externalUrlError) {
      setErrorMsg(externalUrlError);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title,
        discipline,
        description,
        externalUrl: normalizedExternalUrl,
        coverImageUrl,
        coverImagePosition: `${coverPosX}% ${coverPosY}%`,
        location,
        city,
        region,
        hasCoords: coords.hasCoords,
        lat: coords.lat,
        lng: coords.lng,
        coachName: combinedCoachName,
        coachNames,
        coachUids,
        startDate,
        durationMinutes: Number(durationMinutes),
        isUnlimitedCapacity,
        maxCapacity: isUnlimitedCapacity ? 0 : Number(maxCapacity),
        isPaid,
        priceCents,
        paymentMode,
        bookingCutoffMinutes: effectiveCutoffMinutes,
      };

      if (editingEvent) {
        const canReopenCancelledNoRegistrants =
          editingEvent.status === 'cancelled' &&
          editingEvent.cancelReason === 'no_registrants' &&
          (effectiveCutoffMinutes === 0 ||
            startDate.getTime() - effectiveCutoffMinutes * 60 * 1000 > Date.now());
        const nextStatus = canReopenCancelledNoRegistrants
          ? 'published'
          : editingEvent.status;
        await updateEvent(
          editingEvent.id,
          {
            ...payload,
            hadExternalUrl: Boolean(editingEvent.externalUrl),
            hadCoverImage: Boolean(editingEvent.coverImageUrl),
            status: nextStatus,
          },
          editingEvent.registeredCount
        );
      } else {
        await createEvent(payload, coachUid);
      }
      onClose();
    } catch (err) {
      let friendlyMsg = 'Impossible d’enregistrer l’événement.';
      if (err instanceof Error && err.message) {
        const raw = err.message.trim();
        if (raw.startsWith('{')) {
          try {
            const parsed = JSON.parse(raw) as { error?: string };
            const inner = (parsed.error ?? '').toLowerCase();
            if (inner.includes('quota')) {
              friendlyMsg =
                'Quota Firestore atteint pour aujourd’hui. Réessayez plus tard.';
            } else if (
              inner.includes('permission') ||
              inner.includes('insufficient')
            ) {
              friendlyMsg =
                'L’enregistrement a été refusé par la base de données. Vérifiez que vous êtes connecté avec un compte coach actif et que tous les champs (titre, lieu, image, horaires) sont valides.';
            } else if (parsed.error) {
              friendlyMsg = parsed.error;
            }
          } catch {
            friendlyMsg = raw;
          }
        } else {
          friendlyMsg = raw;
        }
      }
      setErrorMsg(friendlyMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 dark:bg-slate-950/75 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-6">
          <h2
            id="event-form-title"
            className="font-display text-lg font-bold text-slate-900 dark:text-white"
          >
            {isEditing
              ? 'Modifier la séance sportive'
              : isDuplicating
                ? 'Dupliquer la séance sur une autre date'
                : 'Nouvel événement sportif'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-6">
          {isDuplicating && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              Vous dupliquez <strong>{duplicatingEvent?.title}</strong>. Choisissez la nouvelle date (proposée à J+7 par défaut) pour créer une séance indépendante avec 0 inscrit.
            </div>
          )}
          <div>
            <label
              htmlFor="ev-title"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Titre de la séance *
            </label>
            <input
              id="ev-title"
              type="text"
              required
              minLength={VALIDATION_LIMITS.TITLE_MIN}
              maxLength={VALIDATION_LIMITS.TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Circuit Training Métabolique"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Visuel / Image d'en-tête de l'événement */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ImagePlus
                  className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Visuel d’en-tête (optionnel)
                </span>
              </div>
              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                className="sr-only"
                onChange={(e) =>
                  void handleCoverFileSelected(e.target.files?.[0])
                }
              />
              {coverImageUrl && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={processingCover}
                    onClick={() => coverFileInputRef.current?.click()}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Remplacer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCoverImageUrl('');
                      setCoverPosX(50);
                      setCoverPosY(50);
                      setCoverError(null);
                    }}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/70 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/50 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    Supprimer
                  </button>
                </div>
              )}
            </div>

            {!coverImageUrl ? (
              <button
                type="button"
                disabled={processingCover}
                onClick={() => coverFileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleCoverFileSelected(e.dataTransfer.files?.[0]);
                }}
                className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-500/70 dark:hover:bg-emerald-950/20 cursor-pointer"
              >
                <ImagePlus
                  className="h-5 w-5 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {processingCover
                    ? 'Traitement de l’image en cours...'
                    : 'Ajouter une image ou un visuel'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  JPG, PNG ou WebP · Affiché en tête de l’événement et recadrable à votre convenance
                </span>
              </button>
            ) : (
              <div className="space-y-3">
                <div
                  onPointerDown={handleCoverPointerDown}
                  onPointerMove={handleCoverPointerMove}
                  onPointerUp={handleCoverPointerUp}
                  onPointerCancel={handleCoverPointerUp}
                  className="group relative aspect-[16/7] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900 touch-none select-none cursor-grab active:cursor-grabbing dark:border-slate-700"
                  title="Glissez directement sur l’image pour la replacer"
                >
                  <img
                    src={coverImageUrl}
                    alt={title || 'Aperçu du visuel d’en-tête'}
                    draggable={false}
                    className="h-full w-full object-cover pointer-events-none"
                    style={{ objectPosition: `${coverPosX}% ${coverPosY}%` }}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-950/25 to-transparent p-2.5 sm:p-3">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-white/95">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-950/60 px-2 py-0.5 font-medium backdrop-blur-xs">
                        <Move className="h-3 w-3" aria-hidden="true" />
                        Glissez l’image pour la replacer ({coverPosX}% · {coverPosY}%)
                      </span>
                      {title.trim() && (
                        <span className="truncate font-semibold drop-shadow-xs">
                          {title.trim()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    <span className="w-16 shrink-0">Horizontal</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={coverPosX}
                      onChange={(e) => setCoverPosX(Number(e.target.value))}
                      className="h-1.5 w-full accent-emerald-600 cursor-pointer"
                    />
                    <span className="w-9 text-right font-mono tabular-nums">
                      {coverPosX}%
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    <span className="w-16 shrink-0">Vertical</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={coverPosY}
                      onChange={(e) => setCoverPosY(Number(e.target.value))}
                      className="h-1.5 w-full accent-emerald-600 cursor-pointer"
                    />
                    <span className="w-9 text-right font-mono tabular-nums">
                      {coverPosY}%
                    </span>
                  </label>
                </div>

                {(coverPosX !== 50 || coverPosY !== 50) && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setCoverPosX(50);
                        setCoverPosY(50);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Recentrer le visuel
                    </button>
                  </div>
                )}
              </div>
            )}

            {coverError && (
              <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
                {coverError}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="ev-discipline"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Discipline *
              </label>
              <button
                type="button"
                onClick={() => {
                  setDiscError(null);
                  setShowNewDiscForm((prev) => !prev);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {showNewDiscForm ? 'Fermer' : 'Ajouter une discipline'}
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border ${
                  discipline
                    ? `${activeDiscStyle.softBg} ${activeDiscStyle.border} ${activeDiscStyle.text}`
                    : 'border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800'
                }`}
                title={discipline ? `Couleur : ${activeDiscStyle.label}` : undefined}
                aria-hidden="true"
              >
                <DisciplineIcon
                  disciplineName={discipline}
                  catalog={disciplines}
                  className="h-4 w-4"
                />
              </span>
              <select
                id="ev-discipline"
                required
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {selectOptions.length === 0 || !discipline ? (
                  <option value="">
                    {selectOptions.length === 0
                      ? 'Aucune discipline — ajoutez-en une ci-dessous'
                      : 'Choisir une discipline (ordre alphabétique)...'}
                  </option>
                ) : null}
                {selectOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {selectedCatalogDiscipline && (
                <button
                  type="button"
                  disabled={deletingDisc}
                  onClick={() => void handleDeleteSelectedDiscipline()}
                  title={`Supprimer la discipline ${selectedCatalogDiscipline.name}`}
                  aria-label={`Supprimer la discipline ${selectedCatalogDiscipline.name}`}
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {discError && !showNewDiscForm && (
              <p className="mt-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">{discError}</p>
            )}
          </div>

          {showNewDiscForm && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-3 dark:border-emerald-800/80 dark:bg-emerald-950/40">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Nouvelle discipline sportive
              </p>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.DISCIPLINE_MAX}
                  value={newDiscName}
                  onChange={(e) => setNewDiscName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddInlineDiscipline();
                    }
                  }}
                  placeholder="Ex. Boxe, CrossFit, Yoga..."
                  aria-label="Nom de la nouvelle discipline"
                  className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <button
                  type="button"
                  disabled={addingDisc}
                  onClick={() => void handleAddInlineDiscipline()}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg bg-emerald-700 px-3.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {addingDisc ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Couleur :{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {DISCIPLINE_COLOR_PRESETS[selectedNewDiscColor].label}
                    </strong>
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {!manualDiscColor && !usedDisciplineColorKeys.has(selectedNewDiscColor)
                      ? 'Auto (disponible)'
                      : usedDisciplineColorKeys.has(selectedNewDiscColor)
                        ? 'Déjà utilisée'
                        : 'Disponible'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {DISCIPLINE_COLOR_KEYS.map((key) => {
                    const preset = DISCIPLINE_COLOR_PRESETS[key];
                    const selected = selectedNewDiscColor === key;
                    const isUsed = usedDisciplineColorKeys.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setManualDiscColor(key)}
                        title={`${preset.label}${isUsed ? ' (déjà utilisée)' : ' (disponible)'}`}
                        aria-label={`Couleur ${preset.label}${isUsed ? ' (déjà utilisée)' : ''}`}
                        className={`flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-transform ${preset.swatchBg} ${
                          selected
                            ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-slate-900 scale-105'
                            : isUsed
                              ? 'opacity-45 hover:opacity-90'
                              : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        {selected && (
                          <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Picto :{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {DISCIPLINE_ICON_PRESETS[selectedNewDiscIcon].label}
                    </strong>
                  </span>
                  {!manualDiscIcon && newDiscName.trim().length >= 2 && (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      Suggestion auto
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DISCIPLINE_ICON_KEYS.map((iconKey) => {
                    const meta = DISCIPLINE_ICON_PRESETS[iconKey];
                    const selected = selectedNewDiscIcon === iconKey;
                    const activePreset =
                      DISCIPLINE_COLOR_PRESETS[selectedNewDiscColor];
                    return (
                      <button
                        key={iconKey}
                        type="button"
                        onClick={() => setManualDiscIcon(iconKey)}
                        title={meta.label}
                        aria-label={`Picto ${meta.label}`}
                        aria-pressed={selected}
                        className={`flex h-8 w-8 items-center justify-center rounded-md border cursor-pointer transition-colors ${
                          selected
                            ? `${activePreset.softBg} ${activePreset.border} ${activePreset.text} ring-2 ring-slate-900/20 dark:ring-white/25`
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                        }`}
                      >
                        <DisciplineIcon iconKey={iconKey} className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
              {discError && (
                <p className="text-xs font-medium text-rose-700 dark:text-rose-400">{discError}</p>
              )}
            </div>
          )}

          {/* Multi-Coach Assignment */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <UserCheck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                Animateur(s) * ({selectedCoaches.length})
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Tous les animateurs sélectionnés reçoivent les alertes d’inscription
              </span>
            </div>

            {/* Selected coaches */}
            {selectedCoaches.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedCoaches.map((coach, idx) => {
                  const matchedAdmin = coach.uid
                    ? activeTeamCoaches.find((a) => a.uid === coach.uid)
                    : undefined;
                  return (
                    <span
                      key={`${coach.uid || 'custom'}-${coach.name}-${idx}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white py-1 pl-2 pr-1.5 text-xs font-semibold text-slate-800 shadow-2xs dark:border-emerald-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <ProfileAvatar
                        name={coach.name}
                        photoUrl={matchedAdmin?.photoUrl}
                        size="xs"
                      />
                      <span>{coach.name}</span>
                      <button
                        type="button"
                        onClick={() => removeCoachAt(idx)}
                        aria-label={`Retirer ${coach.name}`}
                        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-rose-700 dark:text-rose-400">
                Sélectionnez ou ajoutez au moins un animateur pour cette séance.
              </p>
            )}

            {/* Quick pick from registered team coaches */}
            {activeTeamCoaches.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Équipe d’animateurs enregistrés :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {activeTeamCoaches.map((admin) => {
                    const isSelected = selectedCoaches.some(
                      (c) =>
                        (c.uid && c.uid === admin.uid) ||
                        c.name.trim().toLowerCase() ===
                          admin.displayName.trim().toLowerCase()
                    );
                    return (
                      <button
                        key={admin.uid}
                        type="button"
                        onClick={() => toggleTeamCoach(admin)}
                        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-700 text-white dark:bg-emerald-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        )}
                        <span>{admin.displayName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add extra/guest coach by name */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="ev-coach-custom"
                type="text"
                maxLength={VALIDATION_LIMITS.SINGLE_COACH_NAME_MAX}
                value={customCoachName}
                onChange={(e) => {
                  setCustomCoachName(e.target.value);
                  if (coachInputError) setCoachInputError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomCoach();
                  }
                }}
                placeholder="Ajouter un autre animateur ou co-animateur..."
                aria-label="Nom d’un autre animateur à ajouter"
                className="min-h-[40px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleAddCustomCoach}
                className="inline-flex min-h-[40px] items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Ajouter cet animateur
              </button>
            </div>

            {coachInputError && (
              <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
                {coachInputError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label
                htmlFor="ev-date"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Date *
              </label>
              <input
                id="ev-date"
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="ev-time"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Heure début *
              </label>
              <input
                id="ev-time"
                type="time"
                required
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="ev-duration"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Durée (min) *
              </label>
              <input
                id="ev-duration"
                type="number"
                required
                min={VALIDATION_LIMITS.DURATION_MIN}
                max={VALIDATION_LIMITS.DURATION_MAX}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-mono tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="ev-capacity"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Places max {!isUnlimitedCapacity && '*'}
              </label>
              {isUnlimitedCapacity ? (
                <div className="mt-1 flex min-h-[44px] items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Illimité
                </div>
              ) : (
                <input
                  id="ev-capacity"
                  type="number"
                  required={!isUnlimitedCapacity}
                  min={
                    editingEvent
                      ? Math.max(
                          VALIDATION_LIMITS.CAPACITY_MIN,
                          editingEvent.registeredCount
                        )
                      : VALIDATION_LIMITS.CAPACITY_MIN
                  }
                  max={VALIDATION_LIMITS.CAPACITY_MAX}
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(Number(e.target.value))}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-mono tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              )}
            </div>
          </div>

          {/* Unlimited capacity toggle */}
          <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-800/60 cursor-pointer">
            <input
              type="checkbox"
              checked={isUnlimitedCapacity}
              onChange={(e) => setIsUnlimitedCapacity(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 dark:border-slate-600 dark:bg-slate-900"
            />
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
              Nombre de places illimité (aucune limite de participants)
            </span>
          </label>

          {/* Configurable booking closure offset before session start */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <Clock
                  className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Clôture des inscriptions avant le début
              </span>
              <span className="font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {effectiveCutoffMinutes === 0
                  ? 'Jusqu’au début'
                  : `${formatBookingCutoffLabel(effectiveCutoffMinutes)} avant`}
              </span>
            </div>

            <div
              role="group"
              aria-label="Délai de clôture des inscriptions avant le début de la séance"
              className="flex flex-wrap gap-1.5"
            >
              {(
                [
                  { minutes: 0, label: 'Aucune (au début)' },
                  { minutes: 15, label: '15 min' },
                  { minutes: 30, label: '30 min' },
                  { minutes: 60, label: '1h' },
                  { minutes: 120, label: '2h' },
                  { minutes: 360, label: '6h' },
                  { minutes: 1440, label: '24h' },
                ] as const
              ).map((preset) => {
                const isSelected =
                  !customCutoffMode && bookingCutoffMinutes === preset.minutes;
                return (
                  <button
                    key={preset.minutes}
                    type="button"
                    onClick={() => {
                      setCustomCutoffMode(false);
                      setBookingCutoffMinutes(preset.minutes);
                    }}
                    className={`min-h-[34px] rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomCutoffMode(true)}
                className={`min-h-[34px] rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                  customCutoffMode
                    ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Personnalisée
              </button>
            </div>

            {customCutoffMode && (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="ev-cutoff-value"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Durée avant le début
                  </label>
                  <input
                    id="ev-cutoff-value"
                    type="number"
                    min={0}
                    max={
                      customCutoffUnit === 'days'
                        ? 7
                        : customCutoffUnit === 'hours'
                          ? 168
                          : VALIDATION_LIMITS.BOOKING_CUTOFF_MINUTES_MAX
                    }
                    value={customCutoffValue}
                    onChange={(e) => setCustomCutoffValue(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-mono tabular-nums text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ev-cutoff-unit"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Unité
                  </label>
                  <select
                    id="ev-cutoff-unit"
                    value={customCutoffUnit}
                    onChange={(e) =>
                      setCustomCutoffUnit(
                        e.target.value as 'minutes' | 'hours' | 'days'
                      )
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Heures</option>
                    <option value="days">Jours</option>
                  </select>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-300">
              {effectiveCutoffMinutes === 0 ? (
                <>
                  Les inscriptions restent ouvertes jusqu’au début de la séance
                  {parsedPreviewStart
                    ? ` (${formatFrenchDateShort(parsedPreviewStart)} à ${formatFrenchTime(parsedPreviewStart)})`
                    : ''}
                  . Aucune clôture ni annulation automatique.
                </>
              ) : previewCutoffDate ? (
                <>
                  Clôture prévue le{' '}
                  <strong className="text-slate-900 dark:text-white capitalize">
                    {formatFrenchDateShort(previewCutoffDate)}
                  </strong>{' '}
                  à{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {formatFrenchTime(previewCutoffDate)}
                  </strong>{' '}
                  ({formatBookingCutoffLabel(effectiveCutoffMinutes)} avant le début).
                </>
              ) : (
                `Clôture ${formatBookingCutoffLabel(effectiveCutoffMinutes)} avant le début.`
              )}
            </p>

            {(isCustomCutoffPassed || isStartTimePassed) && (
              <p className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200">
                {isStartTimePassed
                  ? 'L’heure de début choisie est déjà dépassée : la séance sera tout de même enregistrée dans le planning.'
                  : 'Ce délai de clôture est déjà dépassé : sans inscrit, la séance affichera « Inscriptions clôturées · Séance annulée » pour les adhérents (choisissez « Aucune (au début) » pour la laisser ouverte).'}
              </p>
            )}
          </div>

          {/* Pricing & Payment Mode Configuration */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <CreditCard className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                Tarification & paiement
              </span>
              <div
                role="group"
                aria-label="Séance gratuite ou payante"
                className="inline-flex items-center gap-1 rounded-lg bg-slate-200/80 p-1 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => setIsPaid(false)}
                  className={`min-h-[32px] rounded-md px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                    !isPaid
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Gratuit
                </button>
                <button
                  type="button"
                  onClick={() => setIsPaid(true)}
                  className={`min-h-[32px] rounded-md px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="ev-price"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Tarif de la séance (€) *
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="ev-price"
                      type="text"
                      inputMode="decimal"
                      required={isPaid}
                      value={priceEurosInput}
                      onChange={(e) => {
                        setPriceTouched(true);
                        setPriceEurosInput(e.target.value);
                      }}
                      placeholder="15"
                      className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-slate-500 dark:text-slate-400">
                      €
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Entre 1 € et 1 000 € (ex. 15 ou 12,50).
                  </p>
                  {(() => {
                    const primaryCoachUid = selectedCoaches[0]?.uid || coachUid;
                    const primaryAdmin =
                      coachAdmins.find((a) => a.uid === primaryCoachUid) ??
                      coachAdmins.find((a) => a.uid === coachUid);
                    if (!hasCoachGroupSessionPrice(primaryAdmin?.pricing)) {
                      return null;
                    }
                    const coachPriceCents = getCoachGroupSessionPriceCents(
                      primaryAdmin?.pricing
                    );
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setPriceEurosInput(
                            formatCentsForInput(coachPriceCents).replace('.', ',')
                          );
                          setPriceTouched(false);
                        }}
                        className="mt-1 text-left text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
                      >
                        Appliquer le tarif de {primaryAdmin?.displayName || defaultCoachName} :{' '}
                        {formatPriceEuros(coachPriceCents)}
                      </button>
                    );
                  })()}
                </div>

                <div>
                  <label
                    htmlFor="ev-payment-mode"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Mode de règlement accepté
                  </label>
                  <select
                    id="ev-payment-mode"
                    value={paymentMode}
                    onChange={(e) =>
                      setPaymentMode(e.target.value as EventPaymentMode)
                    }
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="online">Carte bancaire en ligne</option>
                    <option value="both">Carte en ligne ou sur place</option>
                    <option value="onsite">Sur place uniquement</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Le suivi des règlements apparaît dans la liste des inscrits.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Séance sans frais d’inscription pour les adhérents.
              </p>
            )}
          </div>

          {/* Location + City + Region */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="ev-location"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Adresse ou lieu précis *
              </label>
              <PlaceAutocompleteInput
                value={location}
                hasMapsApiKey={hasMapsApiKey}
                onChangeText={(val) => {
                  setLocation(val);
                  setCoords({ hasCoords: false, lat: 0, lng: 0 });
                }}
                onSelectPlace={(selected) => {
                  setLocation(selected.location);
                  if (selected.city) setCity(selected.city);
                  if (selected.region) setRegion(selected.region);
                  setCoords({
                    hasCoords: selected.hasCoords,
                    lat: selected.lat,
                    lng: selected.lng,
                  });
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="ev-city"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Ville *
                </label>
                <input
                  id="ev-city"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.CITY_MIN}
                  maxLength={VALIDATION_LIMITS.CITY_MAX}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Paris"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label
                  htmlFor="ev-region"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Région
                </label>
                <input
                  id="ev-region"
                  type="text"
                  maxLength={VALIDATION_LIMITS.REGION_MAX}
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Ex. Île-de-France"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="ev-description"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Description & matériel recommandé
            </label>
            <textarea
              id="ev-description"
              rows={3}
              maxLength={VALIDATION_LIMITS.DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Niveau requis, intensité, bouteille d'eau, serviette..."
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="ev-external-url"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              <Link2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              Lien associé à l’événement (optionnel)
            </label>
            <input
              id="ev-external-url"
              type="text"
              inputMode="url"
              maxLength={VALIDATION_LIMITS.EVENT_URL_MAX}
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://exemple.fr/parcours-ou-infos"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Parcours GPS, billetterie, document PDF ou page d’information (https:// ou http://).
            </p>
          </div>

          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
            Rappel : aucune clôture automatique n’est imposée par défaut. Si vous définissez un délai de clôture et qu’il n’y a aucun inscrit à l’échéance, la séance indiquera « Inscriptions clôturées · Séance annulée » ; dès 1 inscrit, elle reste maintenue au planning. Chaque événement reste affiché puis est supprimé 30 jours après la fin de la séance.
          </p>

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || processingCover}
              className="min-h-[44px] rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 cursor-pointer"
            >
              {submitting
                ? 'Enregistrement...'
                : isEditing
                  ? 'Mettre à jour'
                  : isDuplicating
                    ? 'Créer la copie'
                    : 'Publier la séance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
