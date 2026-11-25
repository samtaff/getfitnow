import { FormEvent, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileDown,
  Lock,
  MapPin,
  Maximize2,
  MessageSquare,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  DisciplineItem,
  EventRatingSummary,
  EventReview,
  GuestInput,
  MemberProfile,
  PaymentMethod,
  PaymentStatus,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  GuestRegistrationResult,
  PartialGuestBookingError,
  deleteEventReview,
  registerEventWithGuests,
  upsertEventReview,
} from '../services/firestoreService';
import {
  canMemberMessageEventCoach,
  downloadEventIcs,
  evaluateEventBooking,
  formatEventCoachesLabel,
  formatEventPrice,
  formatExternalUrlLabel,
  formatFrenchDateLong,
  formatFrenchTime,
  formatPaymentModeLabel,
  formatPriceEuros,
  formatTimeRange,
  getRegistrationPaymentBadgeInfo,
  getSafeEventCoverImageSrc,
  getSafeExternalHref,
  normalizeCoverImagePosition,
} from '../utils/dateAndValidation';
import {
  detectCardBrand,
  downloadPaymentReceipt,
  formatCardExpiryInput,
  formatCardNumberInput,
  sanitizeCardDigits,
  validateCardCvc,
  validateCardExpiry,
  validateLuhn,
} from '../utils/paymentHelpers';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import { EventLocationMap } from './EventLocationMap';
import { EmailPasswordAuthForm } from './EmailPasswordAuthForm';
import {
  EventRatingInline,
  EventReviewsSection,
  EventShareButton,
} from './EventEngagementWidgets';
import { EventImageLightbox } from './EventImageLightbox';

interface BookingGuestRow extends GuestInput {
  id: string;
}

interface BookingModalProps {
  event: SportEvent;
  disciplines?: DisciplineItem[];
  nowMs: number;
  isSignedIn: boolean;
  isCoach: boolean;
  isCoachAdmin?: boolean;
  hasMapsApiKey: boolean;
  memberProfile?: MemberProfile | null;
  userEmail?: string | null;
  userDisplayName?: string | null;
  authError?: string | null;
  existingRegistration?: Registration | null;
  invitedGuestRegistrations?: Registration[];
  isEventActive?: boolean;
  currentUserUid?: string | null;
  onShareEvent?: (event: SportEvent) => void;
  eventReviews?: EventReview[];
  ratingSummary?: EventRatingSummary | null;
  eligibleReviewRegistration?: Registration | null;
  onValidateSession?: (registration: Registration) => Promise<void>;
  onCancelRegistration?: (registration: Registration) => Promise<void>;
  onMemberEmailAuthSuccess?: (user: User, intent?: 'book' | 'message') => void;
  onClose: () => void;
  onOpenCoachRoster: (event: SportEvent) => void;
  onOpenMemberTracking?: () => void;
  onOpenCoachRegistrations?: () => void;
  onDuplicateEvent?: (event: SportEvent) => void;
  onMessageCoach?: (event: SportEvent) => void;
  initialMessageAuthStep?: boolean;
}

export function BookingModal({
  event,
  disciplines = [],
  nowMs,
  isSignedIn,
  isCoach,
  isCoachAdmin = false,
  hasMapsApiKey,
  memberProfile,
  userEmail,
  userDisplayName,
  authError,
  existingRegistration,
  invitedGuestRegistrations = [],
  isEventActive = true,
  currentUserUid,
  onShareEvent,
  eventReviews = [],
  ratingSummary,
  eligibleReviewRegistration,
  onValidateSession,
  onCancelRegistration,
  onMemberEmailAuthSuccess,
  onClose,
  onOpenCoachRoster,
  onOpenMemberTracking,
  onOpenCoachRegistrations,
  onDuplicateEvent,
  onMessageCoach,
  initialMessageAuthStep = false,
}: BookingModalProps) {
  const nameParts = (userDisplayName || '').trim().split(/\s+/).filter(Boolean);
  const initialFirst =
    memberProfile?.firstName || nameParts[0] || '';
  const initialLast =
    memberProfile?.lastName ||
    (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
  const initialEmail =
    (!isCoachAdmin && userEmail ? userEmail : memberProfile?.email || userEmail) ||
    '';

  const isPaidEvent =
    Boolean(event.isPaid) &&
    typeof event.priceCents === 'number' &&
    event.priceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS;
  const priceLabel = formatEventPrice(event);
  const allowedMode = event.paymentMode ?? 'online';

  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [email, setEmail] = useState(initialEmail);
  const [guests, setGuests] = useState<BookingGuestRow[]>([]);
  const [showAddGuestsForm, setShowAddGuestsForm] = useState(false);
  const [additionalGuests, setAdditionalGuests] = useState<BookingGuestRow[]>([]);
  const [addingGuests, setAddingGuests] = useState(false);
  const [guestSuccessMsg, setGuestSuccessMsg] = useState<string | null>(null);
  const [confirmingCancelGuestId, setConfirmingCancelGuestId] = useState<string | null>(null);
  const [cancellingGuestId, setCancellingGuestId] = useState<string | null>(null);
  const [selectedPayMethod, setSelectedPayMethod] = useState<'card' | 'onsite'>(
    () => (allowedMode === 'onsite' ? 'onsite' : 'card')
  );
  const [cardHolder, setCardHolder] = useState(() =>
    `${initialFirst} ${initialLast}`.trim()
  );
  const cardHolderTouchedRef = useRef(false);
  const errorAlertRef = useRef<HTMLDivElement | null>(null);
  const guestRowCounterRef = useRef(0);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [showAuthStep, setShowAuthStep] = useState(() =>
    Boolean(initialMessageAuthStep && !isSignedIn && !isCoach)
  );
  const [authIntent, setAuthIntent] = useState<'book' | 'message'>(() =>
    initialMessageAuthStep && !isSignedIn && !isCoach ? 'message' : 'book'
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelledFeedback, setCancelledFeedback] = useState<string | null>(null);
  const [validatingSession, setValidatingSession] = useState(false);
  const [validationSessionError, setValidationSessionError] = useState<string | null>(null);
  const [confirmedMember, setConfirmedMember] = useState<{
    registrationId: string;
    firstName: string;
    lastName: string;
    email: string;
    amountCents: number;
    totalAmountCents: number;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    paymentReference: string;
    cardBrand: string;
    cardLast4: string;
    guests: GuestRegistrationResult[];
  } | null>(null);

  useEffect(() => {
    setSelectedPayMethod(allowedMode === 'onsite' ? 'onsite' : 'card');
  }, [event.id, allowedMode]);

  useEffect(() => {
    if (!isSignedIn) return;
    if (memberProfile) {
      setFirstName((prev) => prev || memberProfile.firstName || '');
      setLastName((prev) => {
        if (!prev || prev === 'GetFitNow') {
          return memberProfile.lastName || prev;
        }
        return prev;
      });
      setEmail((prev) =>
        !isCoachAdmin && userEmail ? userEmail : prev || memberProfile.email || ''
      );
      const full = `${memberProfile.firstName || ''} ${memberProfile.lastName || ''}`.trim();
      if (full && !cardHolderTouchedRef.current) {
        setCardHolder((prev) => prev || full);
      }
      return;
    }
    const parts = (userDisplayName || '').trim().split(/\s+/).filter(Boolean);
    if (parts[0]) {
      setFirstName((prev) => prev || parts[0]);
    }
    if (parts.length > 1) {
      const rest = parts.slice(1).join(' ');
      setLastName((prev) => (!prev || prev === 'GetFitNow' ? rest : prev));
    }
    if (userDisplayName && !cardHolderTouchedRef.current) {
      setCardHolder((prev) => prev || userDisplayName.trim());
    }
    if (userEmail) {
      setEmail((prev) => (!isCoachAdmin ? userEmail : prev || userEmail));
    }
  }, [isSignedIn, isCoachAdmin, memberProfile, userDisplayName, userEmail]);

  useEffect(() => {
    if (cardHolderTouchedRef.current) return;
    const combined = `${firstName} ${lastName}`.trim();
    if (combined) {
      setCardHolder(combined);
    }
  }, [firstName, lastName]);

  const evaluation = evaluateEventBooking(event, nowMs, {
    hideRegisteredCount: !isCoach,
  });
  const hasAvailableSpots =
    evaluation.isUnlimited || (evaluation.remainingSpots ?? 0) > 0;
  const canBookInModal =
    hasAvailableSpots && evaluation.state === 'open';
  const canMessageCoachNow =
    !isCoach && canMemberMessageEventCoach(event, nowMs, evaluation);
  const isClosedBeforeStart =
    (evaluation.state === 'closed' ||
      (evaluation.state === 'cancelled' &&
        evaluation.isAutoCancelledNoRegistrants)) &&
    nowMs < evaluation.startMs;
  const discStyle = getDisciplineStyle(event.discipline, disciplines);
  const startDate = event.startAt.toDate();
  const cutoffDate = new Date(evaluation.cutoffMs);
  const hasEventEnded = nowMs >= evaluation.endMs;
  const coverImageSrc = getSafeEventCoverImageSrc(event.coverImageUrl);
  const coverImagePosition = normalizeCoverImagePosition(event.coverImagePosition);

  const cardDigits = sanitizeCardDigits(cardNumber);
  const cardBrand = detectCardBrand(cardDigits);

  const unitPriceCents = isPaidEvent ? Math.round(event.priceCents ?? 0) : 0;
  const maxGuestsInitial = evaluation.isUnlimited
    ? VALIDATION_LIMITS.GUESTS_PER_BOOKING_MAX
    : Math.min(
        VALIDATION_LIMITS.GUESTS_PER_BOOKING_MAX,
        Math.max(0, (evaluation.remainingSpots ?? 0) - 1)
      );
  const maxAdditionalGuests = evaluation.isUnlimited
    ? VALIDATION_LIMITS.GUESTS_PER_BOOKING_MAX
    : Math.min(
        VALIDATION_LIMITS.GUESTS_PER_BOOKING_MAX,
        Math.max(0, evaluation.remainingSpots ?? 0)
      );
  const totalBookingParticipants = 1 + guests.length;
  const totalBookingPriceCents = unitPriceCents * totalBookingParticipants;
  const totalBookingPriceLabel = formatPriceEuros(totalBookingPriceCents);
  const totalAddGuestsPriceCents = unitPriceCents * additionalGuests.length;
  const totalAddGuestsPriceLabel = formatPriceEuros(totalAddGuestsPriceCents);

  const createEmptyGuestRow = (): BookingGuestRow => {
    guestRowCounterRef.current += 1;
    return {
      id: `guest-${guestRowCounterRef.current}`,
      firstName: '',
      lastName: '',
      email: '',
    };
  };

  const handleAddGuestRow = (isAdditional = false) => {
    setErrorMsg(null);
    setGuestSuccessMsg(null);
    if (isAdditional) {
      setAdditionalGuests((prev) =>
        prev.length >= maxAdditionalGuests ? prev : [...prev, createEmptyGuestRow()]
      );
    } else {
      setGuests((prev) =>
        prev.length >= maxGuestsInitial ? prev : [...prev, createEmptyGuestRow()]
      );
    }
  };

  const handleUpdateGuestRow = (
    id: string,
    field: keyof GuestInput,
    value: string,
    isAdditional = false
  ) => {
    const updater = (prev: BookingGuestRow[]) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row));
    if (isAdditional) {
      setAdditionalGuests(updater);
    } else {
      setGuests(updater);
    }
  };

  const handleRemoveGuestRow = (id: string, isAdditional = false) => {
    const updater = (prev: BookingGuestRow[]) =>
      prev.filter((row) => row.id !== id);
    if (isAdditional) {
      setAdditionalGuests(updater);
    } else {
      setGuests(updater);
    }
  };

  const handleFillTestCard = () => {
    const holder = `${firstName} ${lastName}`.trim() || 'Camille Laurent';
    setCardHolder(holder);
    setCardNumber('4242 4242 4242 4242');
    setCardExpiry('12/28');
    setCardCvc('123');
    setErrorMsg(null);
  };

  const formatFirestoreActionError = (
    err: unknown,
    fallback: string,
    permissionFallback: string
  ): string => {
    if (err instanceof Error) {
      if (err.message.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string };
          if (parsed.error?.toLowerCase().includes('permission')) {
            return permissionFallback;
          }
          if (parsed.error) return parsed.error;
        } catch {
          return err.message;
        }
      }
      return err.message;
    }
    return fallback;
  };

  const handleCancelRegistration = async (targetReg: Registration) => {
    if (!onCancelRegistration) return;
    setErrorMsg(null);
    setGuestSuccessMsg(null);
    setCancelling(true);
    try {
      await onCancelRegistration(targetReg);
      const isPaid =
        targetReg.paymentStatus === 'paid' &&
        (targetReg.amountCents ?? 0) > 0;
      setConfirmingCancel(false);
      setConfirmedMember(null);
      setCancelledFeedback(
        isPaid
          ? `Votre inscription a été annulée et votre place a été libérée. Le remboursement de ${formatPriceEuros(targetReg.amountCents ?? 0)} a été enregistré.`
          : 'Votre inscription a bien été annulée et votre place a été libérée.'
      );
    } catch (err) {
      const message = formatFirestoreActionError(
        err,
        'Impossible d’annuler votre inscription pour le moment.',
        nowMs >= startDate.getTime()
          ? 'L’annulation n’est plus autorisée car la séance a déjà commencé.'
          : 'Autorisation refusée lors de l’annulation. Vérifiez que vous êtes bien connecté avec le compte utilisé pour cette inscription.'
      );
      setErrorMsg(message);
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelGuestRegistration = async (guestReg: Registration) => {
    if (!onCancelRegistration) return;
    setErrorMsg(null);
    setGuestSuccessMsg(null);
    setCancellingGuestId(guestReg.id);
    try {
      await onCancelRegistration(guestReg);
      const isPaid =
        guestReg.paymentStatus === 'paid' &&
        (guestReg.amountCents ?? 0) > 0;
      setConfirmingCancelGuestId(null);
      setGuestSuccessMsg(
        isPaid
          ? `L’inscription de ${guestReg.firstName} ${guestReg.lastName} a été annulée (${formatPriceEuros(guestReg.amountCents ?? 0)} remboursé).`
          : `L’inscription de ${guestReg.firstName} ${guestReg.lastName} a été annulée et sa place libérée.`
      );
    } catch (err) {
      const message = formatFirestoreActionError(
        err,
        'Impossible d’annuler cet invité pour le moment.',
        nowMs >= startDate.getTime()
          ? 'L’annulation n’est plus autorisée car la séance a déjà commencé.'
          : 'Autorisation refusée lors de l’annulation de cet invité.'
      );
      setErrorMsg(message);
    } finally {
      setCancellingGuestId(null);
    }
  };

  const showValidationError = (message: string, fieldId?: string) => {
    setErrorMsg(message);
    window.setTimeout(() => {
      if (fieldId) {
        const el = document.getElementById(fieldId);
        if (el) {
          el.focus({ preventScroll: false });
        }
      }
      errorAlertRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 10);
  };

  const validateGuestList = (
    rows: BookingGuestRow[],
    hostEmailLower: string,
    idPrefix: string
  ): GuestInput[] | null => {
    const cleaned: GuestInput[] = [];
    const seenEmails = new Set<string>();
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const gFirst = row.firstName.trim();
      const gLast = row.lastName.trim();
      const gEmail = row.email.trim().toLowerCase();
      if (!gFirst) {
        showValidationError(
          `Veuillez renseigner le prénom de l’invité ${i + 1}.`,
          `${idPrefix}-first-${row.id}`
        );
        return null;
      }
      if (!gLast) {
        showValidationError(
          `Veuillez renseigner le nom de l’invité ${i + 1}.`,
          `${idPrefix}-last-${row.id}`
        );
        return null;
      }
      if (!VALIDATION_LIMITS.EMAIL_REGEX.test(gEmail)) {
        showValidationError(
          `Veuillez saisir une adresse email valide pour l’invité ${i + 1}.`,
          `${idPrefix}-email-${row.id}`
        );
        return null;
      }
      if (gEmail === hostEmailLower) {
        showValidationError(
          `L’invité ${i + 1} ne peut pas utiliser votre propre adresse email (${gEmail}).`,
          `${idPrefix}-email-${row.id}`
        );
        return null;
      }
      if (seenEmails.has(gEmail)) {
        showValidationError(
          `L’adresse email « ${gEmail} » est déjà saisie pour un autre invité.`,
          `${idPrefix}-email-${row.id}`
        );
        return null;
      }
      seenEmails.add(gEmail);
      cleaned.push({ firstName: gFirst, lastName: gLast, email: gEmail });
    }
    return cleaned;
  };

  const validateCardFieldsIfNeeded = (prefix: string): boolean => {
    if (!isPaidEvent || selectedPayMethod !== 'card') return true;
    if (cardHolder.trim().length < 2) {
      showValidationError(
        'Veuillez saisir le nom du titulaire de la carte.',
        `${prefix}-card-holder`
      );
      return false;
    }
    if (!validateLuhn(cardDigits)) {
      showValidationError(
        'Numéro de carte invalide. Vérifiez les 15 ou 16 chiffres saisis.',
        `${prefix}-card-number`
      );
      return false;
    }
    if (!validateCardExpiry(cardExpiry)) {
      showValidationError(
        'Date d’expiration invalide ou dépassée (format MM/AA).',
        `${prefix}-card-expiry`
      );
      return false;
    }
    if (!validateCardCvc(cardCvc, cardBrand)) {
      showValidationError(
        'Code de sécurité CVC invalide (3 ou 4 chiffres).',
        `${prefix}-card-cvc`
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanFirst) {
      showValidationError('Veuillez renseigner votre prénom.', 'booking-first-name');
      return;
    }
    if (!cleanLast) {
      showValidationError('Veuillez renseigner votre nom.', 'booking-last-name');
      return;
    }
    if (!VALIDATION_LIMITS.EMAIL_REGEX.test(cleanEmail)) {
      showValidationError('Veuillez saisir une adresse email valide.', 'booking-email');
      return;
    }

    const validatedGuests = validateGuestList(
      guests,
      cleanEmail,
      'booking-guest'
    );
    if (!validatedGuests) return;

    if (!validateCardFieldsIfNeeded('booking')) return;

    setSubmitting(true);
    try {
      const result = await registerEventWithGuests({
        event,
        firstName: cleanFirst,
        lastName: cleanLast,
        email: cleanEmail,
        guests: validatedGuests,
        skipSelf: false,
        bypassCutoffAsCoach: isCoachAdmin,
        payment: isPaidEvent
          ? selectedPayMethod === 'card'
            ? {
                method: 'card',
                cardBrand,
                cardLast4: cardDigits.slice(-4),
              }
            : { method: 'onsite' }
          : { method: 'free' },
      });
      if (!result.primary) {
        throw new Error('Impossible de finaliser votre inscription.');
      }
      setConfirmingCancel(false);
      setCancelledFeedback(null);
      setConfirmedMember({
        registrationId: result.primary.registrationId,
        firstName: cleanFirst,
        lastName: cleanLast,
        email: cleanEmail,
        amountCents: result.primary.amountCents,
        totalAmountCents: result.totalAmountCents,
        paymentStatus: result.primary.paymentStatus,
        paymentMethod: result.primary.paymentMethod,
        paymentReference: result.primary.paymentReference,
        cardBrand: result.primary.cardBrand,
        cardLast4: result.primary.cardLast4,
        guests: result.guests,
      });
    } catch (err) {
      if (err instanceof PartialGuestBookingError) {
        const succeededEmails = new Set(
          err.guests.map((g) => g.email.trim().toLowerCase())
        );
        if (err.primary) {
          setGuests((prev) =>
            prev.filter((row) => !succeededEmails.has(row.email.trim().toLowerCase()))
          );
          setAdditionalGuests(
            guests.filter((row) => !succeededEmails.has(row.email.trim().toLowerCase()))
          );
          setShowAddGuestsForm(true);
        }
        showValidationError(err.message);
        return;
      }
      const message = formatFirestoreActionError(
        err,
        'Une erreur est survenue lors de votre inscription.',
        'Impossible de confirmer votre inscription (autorisation refusée). Vérifiez que vous utilisez l’email de votre compte connecté.'
      );
      showValidationError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAdditionalGuests = async (e: FormEvent) => {
    e.preventDefault();
    if (!existingRegistration) return;
    setErrorMsg(null);
    setGuestSuccessMsg(null);

    if (additionalGuests.length === 0) {
      showValidationError('Veuillez ajouter au moins un invité.');
      return;
    }

    const hostEmail = existingRegistration.email.trim().toLowerCase();
    const validatedGuests = validateGuestList(
      additionalGuests,
      hostEmail,
      'additional-guest'
    );
    if (!validatedGuests) return;

    if (!validateCardFieldsIfNeeded('additional')) return;

    setAddingGuests(true);
    try {
      const result = await registerEventWithGuests({
        event,
        firstName: existingRegistration.firstName,
        lastName: existingRegistration.lastName,
        email: hostEmail,
        guests: validatedGuests,
        skipSelf: true,
        bypassCutoffAsCoach: isCoachAdmin,
        payment: isPaidEvent
          ? selectedPayMethod === 'card'
            ? {
                method: 'card',
                cardBrand,
                cardLast4: cardDigits.slice(-4),
              }
            : { method: 'onsite' }
          : { method: 'free' },
      });
      setAdditionalGuests([]);
      setShowAddGuestsForm(false);
      setGuestSuccessMsg(
        result.guests.length === 1
          ? `Votre invité(e) ${result.guests[0].firstName} ${result.guests[0].lastName} a bien été inscrit(e).`
          : `Vos ${result.guests.length} invités ont bien été inscrits à la séance.`
      );
    } catch (err) {
      if (err instanceof PartialGuestBookingError) {
        const succeededEmails = new Set(
          err.guests.map((g) => g.email.trim().toLowerCase())
        );
        setAdditionalGuests((prev) =>
          prev.filter((row) => !succeededEmails.has(row.email.trim().toLowerCase()))
        );
        showValidationError(err.message);
        return;
      }
      const message = formatFirestoreActionError(
        err,
        'Impossible d’inscrire vos invités pour le moment.',
        'Autorisation refusée lors de l’inscription des invités.'
      );
      showValidationError(message);
    } finally {
      setAddingGuests(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 dark:bg-slate-950/75 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile sheet drag affordance */}
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />

        {/* Header */}
        <div
          className={`overflow-hidden border-b border-slate-200 border-t-4 dark:border-slate-800 ${discStyle.leftBorder.replace('border-l-', 'border-t-')} sm:rounded-t-xl`}
        >
          {coverImageSrc && (
            <div className="relative aspect-[16/7] min-h-[150px] max-h-[240px] w-full overflow-hidden border-b border-slate-200/80 bg-slate-900 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setImageLightboxOpen(true)}
                aria-label={`Agrandir le visuel de ${event.title}`}
                className="group block h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
              >
                <img
                  src={coverImageSrc}
                  alt={event.title}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  style={{ objectPosition: coverImagePosition }}
                />
                <span className="pointer-events-none absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-slate-950/65 px-2 py-1 text-[11px] font-medium text-white/95 backdrop-blur-xs transition-colors group-hover:bg-slate-950/85">
                  <Maximize2 className="h-3 w-3" aria-hidden="true" />
                  Agrandir
                </span>
              </button>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-950/45 to-transparent" />
              <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                {evaluation.state !== 'cancelled' && onShareEvent && (
                  <EventShareButton
                    eventTitle={event.title}
                    onClick={() => onShareEvent(event)}
                  />
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer la fenêtre"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/90 text-slate-700 shadow-sm backdrop-blur-xs hover:bg-white hover:text-slate-950 dark:bg-slate-900/85 dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-4 p-4 sm:p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                >
                  <DisciplineIcon
                    disciplineName={event.discipline}
                    catalog={disciplines}
                    className="h-3 w-3 shrink-0"
                  />
                  {event.discipline}
                </span>
                <span>
                  {event.city} · {formatEventCoachesLabel(event)}
                </span>
                {hasEventEnded && ratingSummary && (
                  <EventRatingInline summary={ratingSummary} />
                )}
              </div>
              <h2
                id="booking-modal-title"
                className="mt-1.5 font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl"
              >
                {event.title}
              </h2>
            </div>
            {!coverImageSrc && (
              <div className="flex items-center gap-2 shrink-0">
                {evaluation.state !== 'cancelled' && onShareEvent && (
                  <EventShareButton
                    eventTitle={event.title}
                    onClick={() => onShareEvent(event)}
                  />
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fermer la fenêtre"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white shrink-0 cursor-pointer"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200 sm:p-4">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
              <span className="capitalize font-medium">
                {formatFrenchDateLong(startDate)}
              </span>
            </div>
            <div className="pl-6 font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
              Horaire : {formatTimeRange(startDate, event.durationMinutes)} ({event.durationMinutes} min) ·{' '}
              {evaluation.state === 'cancelled'
                ? evaluation.isAutoCancelledNoRegistrants
                  ? 'Inscriptions clôturées — pas d’inscrit à cette séance, séance annulée'
                  : 'Inscriptions clôturées : séance annulée'
                : evaluation.state === 'past'
                  ? 'Inscriptions fermées'
                  : evaluation.state === 'closed'
                    ? `Inscriptions clôturées (${formatFrenchTime(cutoffDate)})`
                    : evaluation.cutoffMinutes > 0
                      ? `Clôture à ${formatFrenchTime(cutoffDate)}`
                      : `Inscriptions ouvertes jusqu’à ${formatFrenchTime(startDate)}`}
            </div>
            <div className="pl-6">
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${
                  evaluation.state === 'open'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : evaluation.state === 'closed'
                      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : evaluation.state === 'cancelled' || evaluation.state === 'full'
                        ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {evaluation.statusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
              <span>
                {event.location} · <strong className="text-slate-900 dark:text-white">{event.city}</strong>
                {event.region ? ` (${event.region})` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <UserCheck className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
              <span>{formatEventCoachesLabel(event)}</span>
            </div>
            <div className="flex items-center justify-between gap-2.5 border-t border-slate-200/80 pt-2.5 dark:border-slate-700/80">
              <div className="flex items-center gap-2.5">
                <CreditCard className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Tarif de la séance
                  {isPaidEvent ? ` · ${formatPaymentModeLabel(allowedMode)}` : ''}
                </span>
              </div>
              <span
                className={`font-mono text-sm font-bold tabular-nums ${
                  isPaidEvent
                    ? 'text-slate-900 dark:text-white'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {priceLabel}
              </span>
            </div>
          </div>

          {event.description && (
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {event.description}
            </p>
          )}

          {(() => {
            const safeExternalUrl = getSafeExternalHref(event.externalUrl);
            if (!safeExternalUrl) return null;
            return (
              <a
                href={safeExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100/80 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    Lien associé : {formatExternalUrlLabel(safeExternalUrl)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold underline underline-offset-2">
                  Ouvrir
                </span>
              </a>
            );
          })()}

          {/* Interactive Event Location Map */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Emplacement de l’événement
            </h3>
            <EventLocationMap
              event={event}
              disciplines={disciplines}
              hasMapsApiKey={hasMapsApiKey}
            />
          </div>

          {isCoach && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="space-y-0.5">
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">
                  {isCoachAdmin ? 'Mode administrateur actif' : 'Mode coach actif'}
                </span>
                <span className="block font-mono text-xs font-semibold text-slate-900 tabular-nums dark:text-white">
                  {evaluation.capacityLabel}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {onDuplicateEvent && (
                  <button
                    type="button"
                    onClick={() => onDuplicateEvent(event)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white underline underline-offset-2 cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Dupliquer sur une autre date
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenCoachRoster(event)}
                  className="min-h-[36px] text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
                >
                  Voir les inscrits & pointage ({event.registeredCount})
                </button>
              </div>
            </div>
          )}

          {isSignedIn &&
            canMessageCoachNow &&
            onMessageCoach && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/60">
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {isClosedBeforeStart
                    ? `Inscriptions clôturées — vous pouvez contacter l’animateur jusqu’à ${formatFrenchTime(startDate)}.`
                    : 'Une question sur cette séance ?'}
                </span>
                <button
                  type="button"
                  onClick={() => onMessageCoach(event)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  Écrire à l’animateur
                </button>
              </div>
            )}

          {/* Confirmation Screen */}
          {confirmedMember ? (
            (() => {
              const targetRegForCancel: Registration =
                existingRegistration && existingRegistration.status === 'confirmed'
                  ? existingRegistration
                  : {
                      id: confirmedMember.registrationId,
                      eventId: event.id,
                      eventTitle: event.title,
                      eventStartAt: event.startAt,
                      eventDurationMinutes: event.durationMinutes,
                      firstName: confirmedMember.firstName,
                      lastName: confirmedMember.lastName,
                      email: confirmedMember.email,
                      emailKey: '',
                      attended: false,
                      status: 'confirmed',
                      amountCents: confirmedMember.amountCents,
                      currency: 'EUR',
                      paymentStatus: confirmedMember.paymentStatus,
                      paymentMethod: confirmedMember.paymentMethod,
                      paymentReference: confirmedMember.paymentReference,
                      cardBrand: confirmedMember.cardBrand,
                      cardLast4: confirmedMember.cardLast4,
                      createdAt: Timestamp.now(),
                      updatedAt: Timestamp.now(),
                    };
              const isOwnConfirmedEmail =
                Boolean(userEmail) &&
                confirmedMember.email.trim().toLowerCase() ===
                  (userEmail ?? '').trim().toLowerCase();
              const canCancelConfirmedHere =
                Boolean(onCancelRegistration) &&
                isSignedIn &&
                isOwnConfirmedEmail &&
                !targetRegForCancel.attended &&
                nowMs < startDate.getTime() &&
                evaluation.state !== 'cancelled';

              return (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/50 sm:p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 text-emerald-700 dark:text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-base font-bold text-emerald-950 dark:text-emerald-100">
                        {confirmedMember.totalAmountCents > 0
                          ? confirmedMember.paymentStatus === 'paid'
                            ? 'Réservation et paiement confirmés'
                            : 'Réservation confirmée · À régler sur place'
                          : confirmedMember.guests.length > 0
                            ? `Réservation gratuite confirmée (${1 + confirmedMember.guests.length} places)`
                            : 'Réservation gratuite confirmée'}
                      </h3>
                      <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
                        Merci {confirmedMember.firstName} {confirmedMember.lastName}. Votre place est enregistrée pour cette séance ({confirmedMember.email}).
                      </p>
                      {confirmedMember.guests.length > 0 && (
                        <div className="mt-3 rounded-lg border border-emerald-200/80 bg-white/80 p-3 text-xs text-slate-700 dark:border-emerald-800/80 dark:bg-slate-900/70 dark:text-slate-200 space-y-1.5">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            Invités inscrits ({confirmedMember.guests.length})
                          </p>
                          <ul className="space-y-1">
                            {confirmedMember.guests.map((g) => (
                              <li
                                key={g.registrationId}
                                className="flex flex-wrap items-center justify-between gap-2"
                              >
                                <span>
                                  {g.firstName} {g.lastName}{' '}
                                  <span className="text-slate-500 dark:text-slate-400">
                                    ({g.email})
                                  </span>
                                </span>
                                {g.paymentReference && (
                                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                    Réf. {g.paymentReference}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {confirmedMember.totalAmountCents > 0 && (
                        <div className="mt-3 rounded-lg border border-emerald-200/80 bg-white/80 p-3 text-xs text-slate-700 dark:border-emerald-800/80 dark:bg-slate-900/70 dark:text-slate-200 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span>
                              Montant total ({1 + confirmedMember.guests.length}{' '}
                              place{confirmedMember.guests.length > 0 ? 's' : ''})
                            </span>
                            <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                              {formatPriceEuros(confirmedMember.totalAmountCents)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>Règlement</span>
                            <span className="font-medium">
                              {confirmedMember.paymentMethod === 'card'
                                ? `Carte ${confirmedMember.cardBrand} •••• ${confirmedMember.cardLast4} (Payé)`
                                : 'Sur place auprès de l’animateur'}
                            </span>
                          </div>
                          {confirmedMember.paymentReference && (
                            <div className="flex items-center justify-between gap-2">
                              <span>Référence</span>
                              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {confirmedMember.paymentReference}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {confirmingCancel && canCancelConfirmedHere && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3.5 dark:border-rose-900 dark:bg-slate-900">
                      <p className="text-xs text-slate-800 dark:text-slate-200">
                        <strong>Confirmer l’annulation de votre inscription ?</strong> Votre place sera immédiatement libérée.
                        {confirmedMember.paymentStatus === 'paid' &&
                        confirmedMember.amountCents > 0
                          ? ` Le règlement de ${formatPriceEuros(confirmedMember.amountCents)} sera marqué comme remboursé.`
                          : ''}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={() => void handleCancelRegistration(targetRegForCancel)}
                          className="min-h-[38px] rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                        >
                          {cancelling ? 'Annulation...' : 'Confirmer l’annulation'}
                        </button>
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={() => setConfirmingCancel(false)}
                          className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          Conserver ma place
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => downloadEventIcs(event)}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                    >
                      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                      Ajouter à mon agenda (.ics)
                    </button>
                    {confirmedMember.amountCents > 0 && confirmedMember.paymentReference && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadPaymentReceipt({
                            event,
                            memberName: `${confirmedMember.firstName} ${confirmedMember.lastName}`.trim(),
                            memberEmail: confirmedMember.email,
                            amountCents: confirmedMember.amountCents,
                            method:
                              confirmedMember.paymentMethod === 'card'
                                ? 'card'
                                : 'onsite',
                            status:
                              confirmedMember.paymentStatus === 'paid'
                                ? 'paid'
                                : 'pending',
                            reference: confirmedMember.paymentReference,
                            cardBrand: confirmedMember.cardBrand,
                            cardLast4: confirmedMember.cardLast4,
                          })
                        }
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 cursor-pointer"
                      >
                        <FileDown className="h-4 w-4" aria-hidden="true" />
                        Télécharger le reçu
                      </button>
                    )}
                    {onOpenMemberTracking && (
                      <button
                        type="button"
                        onClick={onOpenMemberTracking}
                        className="min-h-[44px] rounded-lg border border-emerald-700 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 cursor-pointer"
                      >
                        Voir dans Mon suivi
                      </button>
                    )}
                    {!onOpenMemberTracking && onOpenCoachRegistrations && (
                      <button
                        type="button"
                        onClick={onOpenCoachRegistrations}
                        className="min-h-[44px] rounded-lg border border-emerald-700 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 cursor-pointer"
                      >
                        Voir mes inscriptions
                      </button>
                    )}
                    {canCancelConfirmedHere && !confirmingCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setConfirmingCancel(true);
                        }}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/50 cursor-pointer"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Annuler mon inscription
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="min-h-[44px] rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100/60 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-900/40 cursor-pointer"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              );
            })()
          ) : isSignedIn && existingRegistration && existingRegistration.status === 'confirmed' ? (
            (() => {
              const payInfo = getRegistrationPaymentBadgeInfo(existingRegistration);
              const hasPaidReceipt =
                typeof existingRegistration.amountCents === 'number' &&
                existingRegistration.amountCents > 0 &&
                Boolean(existingRegistration.paymentReference);
              const canCancelHere =
                Boolean(onCancelRegistration) &&
                !existingRegistration.attended &&
                nowMs < startDate.getTime() &&
                evaluation.state !== 'cancelled';

              return (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/50 sm:p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      className="mt-0.5 h-5 w-5 text-emerald-700 dark:text-emerald-400 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-base font-bold text-emerald-950 dark:text-emerald-100">
                        Vous êtes déjà inscrit à cette séance
                      </h3>
                      <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
                        Place réservée pour {existingRegistration.firstName} {existingRegistration.lastName} ({existingRegistration.email}).
                      </p>
                      {(existingRegistration.amountCents ?? 0) > 0 && (
                        <div className="mt-3 rounded-lg border border-emerald-200/80 bg-white/80 p-3 text-xs text-slate-700 dark:border-emerald-800/80 dark:bg-slate-900/70 dark:text-slate-200 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span>Montant</span>
                            <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                              {payInfo.amountLabel}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>Statut</span>
                            <span className="font-medium">{payInfo.label}</span>
                          </div>
                          {existingRegistration.paymentReference && (
                            <div className="flex items-center justify-between gap-2">
                              <span>Référence</span>
                              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {existingRegistration.paymentReference}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {invitedGuestRegistrations.length > 0 && (
                    <div className="mt-3 rounded-lg border border-emerald-200/80 bg-white/85 p-3 text-xs text-slate-700 dark:border-emerald-800/80 dark:bg-slate-900/75 dark:text-slate-200 space-y-2">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Personnes invitées ({invitedGuestRegistrations.length})
                      </p>
                      <div className="space-y-2">
                        {invitedGuestRegistrations.map((guestReg) => {
                          const guestPayInfo = getRegistrationPaymentBadgeInfo(guestReg);
                          const canCancelGuest =
                            Boolean(onCancelRegistration) &&
                            !guestReg.attended &&
                            nowMs < startDate.getTime() &&
                            evaluation.state !== 'cancelled';
                          const isConfirmingGuestCancel =
                            confirmingCancelGuestId === guestReg.id;
                          const isCancellingGuest = cancellingGuestId === guestReg.id;
                          return (
                            <div
                              key={guestReg.id}
                              className="rounded-md border border-slate-200/80 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/50"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-900 dark:text-white">
                                    {guestReg.firstName} {guestReg.lastName}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {guestReg.email}
                                    {(guestReg.amountCents ?? 0) > 0
                                      ? ` · ${guestPayInfo.label}`
                                      : ''}
                                  </p>
                                </div>
                                {canCancelGuest && !isConfirmingGuestCancel && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setErrorMsg(null);
                                      setGuestSuccessMsg(null);
                                      setConfirmingCancelGuestId(guestReg.id);
                                    }}
                                    className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/50 cursor-pointer"
                                  >
                                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                    Annuler
                                  </button>
                                )}
                              </div>
                              {isConfirmingGuestCancel && canCancelGuest && (
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                                  <span className="text-[11px] text-slate-700 dark:text-slate-300">
                                    Libérer la place de {guestReg.firstName} ?
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={isCancellingGuest}
                                      onClick={() =>
                                        void handleCancelGuestRegistration(guestReg)
                                      }
                                      className="min-h-[30px] rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                                    >
                                      {isCancellingGuest ? 'Annulation...' : 'Confirmer'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isCancellingGuest}
                                      onClick={() => setConfirmingCancelGuestId(null)}
                                      className="min-h-[30px] rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                                    >
                                      Non
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {guestSuccessMsg && (
                    <div
                      role="status"
                      className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-300 bg-white p-3 text-xs text-emerald-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                      <span>{guestSuccessMsg}</span>
                    </div>
                  )}

                  {errorMsg && (
                    <div
                      ref={errorAlertRef}
                      role="alert"
                      className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {showAddGuestsForm && canBookInModal && (
                    <form
                      onSubmit={handleSubmitAdditionalGuests}
                      noValidate
                      className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-white p-3.5 dark:border-emerald-800 dark:bg-slate-900"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                            Inviter une ou plusieurs personnes
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Renseignez le prénom, nom et email de chaque invité.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={additionalGuests.length >= maxAdditionalGuests}
                          onClick={() => handleAddGuestRow(true)}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 cursor-pointer"
                        >
                          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          Ajouter un invité
                        </button>
                      </div>

                      {additionalGuests.map((guest, idx) => (
                        <div
                          key={guest.id}
                          className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                              Invité {idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveGuestRow(guest.id, true)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              Retirer
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              id={`additional-guest-first-${guest.id}`}
                              type="text"
                              required
                              maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                              value={guest.firstName}
                              onChange={(e) =>
                                handleUpdateGuestRow(guest.id, 'firstName', e.target.value, true)
                              }
                              placeholder="Prénom *"
                              aria-label={`Prénom de l’invité ${idx + 1}`}
                              className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <input
                              id={`additional-guest-last-${guest.id}`}
                              type="text"
                              required
                              maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                              value={guest.lastName}
                              onChange={(e) =>
                                handleUpdateGuestRow(guest.id, 'lastName', e.target.value, true)
                              }
                              placeholder="Nom *"
                              aria-label={`Nom de l’invité ${idx + 1}`}
                              className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                          </div>
                          <input
                            id={`additional-guest-email-${guest.id}`}
                            type="email"
                            required
                            maxLength={VALIDATION_LIMITS.EMAIL_MAX}
                            value={guest.email}
                            onChange={(e) =>
                              handleUpdateGuestRow(guest.id, 'email', e.target.value, true)
                            }
                            placeholder="Adresse email de l’invité *"
                            aria-label={`Adresse email de l’invité ${idx + 1}`}
                            className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                        </div>
                      ))}

                      {isPaidEvent && additionalGuests.length > 0 && (
                        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                              Règlement ({additionalGuests.length} invité
                              {additionalGuests.length > 1 ? 's' : ''})
                            </span>
                            <span className="font-mono text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                              Total : {totalAddGuestsPriceLabel}
                            </span>
                          </div>
                          {allowedMode === 'both' && (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => setSelectedPayMethod('card')}
                                className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                                  selectedPayMethod === 'card'
                                    ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                                    : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                                }`}
                              >
                                <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                                Carte en ligne
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedPayMethod('onsite')}
                                className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                                  selectedPayMethod === 'onsite'
                                    ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                                    : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                                }`}
                              >
                                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                                Sur place
                              </button>
                            </div>
                          )}
                          {selectedPayMethod === 'card' ? (
                            <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                  Carte ({cardBrand})
                                </span>
                                <button
                                  type="button"
                                  onClick={handleFillTestCard}
                                  className="text-[11px] font-semibold text-emerald-700 underline dark:text-emerald-400 cursor-pointer"
                                >
                                  Remplir carte test
                                </button>
                              </div>
                              <input
                                id="additional-card-holder"
                                type="text"
                                required
                                value={cardHolder}
                                onChange={(e) => {
                                  cardHolderTouchedRef.current = true;
                                  setCardHolder(e.target.value);
                                }}
                                placeholder="Titulaire de la carte *"
                                className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              />
                              <input
                                id="additional-card-number"
                                type="text"
                                inputMode="numeric"
                                required
                                maxLength={19}
                                value={cardNumber}
                                onChange={(e) =>
                                  setCardNumber(formatCardNumberInput(e.target.value))
                                }
                                placeholder="Numéro de carte *"
                                className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  id="additional-card-expiry"
                                  type="text"
                                  inputMode="numeric"
                                  required
                                  maxLength={5}
                                  value={cardExpiry}
                                  onChange={(e) =>
                                    setCardExpiry(formatCardExpiryInput(e.target.value))
                                  }
                                  placeholder="MM/AA *"
                                  className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                                <input
                                  id="additional-card-cvc"
                                  type="password"
                                  inputMode="numeric"
                                  required
                                  maxLength={4}
                                  value={cardCvc}
                                  onChange={(e) =>
                                    setCardCvc(
                                      e.target.value.replace(/\D/g, '').slice(0, 4)
                                    )
                                  }
                                  placeholder="CVC *"
                                  className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-amber-900 dark:text-amber-200">
                              À régler sur place : <strong>{totalAddGuestsPriceLabel}</strong>
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={addingGuests}
                          onClick={() => {
                            setShowAddGuestsForm(false);
                            setAdditionalGuests([]);
                            setErrorMsg(null);
                          }}
                          className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          Fermer
                        </button>
                        <button
                          type="submit"
                          disabled={addingGuests || additionalGuests.length === 0}
                          className="min-h-[36px] rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                        >
                          {addingGuests
                            ? 'Enregistrement...'
                            : isPaidEvent && selectedPayMethod === 'card'
                              ? `Payer ${totalAddGuestsPriceLabel} et inscrire`
                              : `Inscrire (${additionalGuests.length} invité${additionalGuests.length > 1 ? 's' : ''})`}
                        </button>
                      </div>
                    </form>
                  )}

                  {confirmingCancel && canCancelHere && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-white p-3.5 dark:border-rose-900 dark:bg-slate-900">
                      <p className="text-xs text-slate-800 dark:text-slate-200">
                        <strong>Confirmer l’annulation de votre inscription ?</strong> Votre place sera immédiatement libérée.
                        {existingRegistration.paymentStatus === 'paid' &&
                        (existingRegistration.amountCents ?? 0) > 0
                          ? ` Le règlement de ${formatPriceEuros(existingRegistration.amountCents ?? 0)} sera marqué comme remboursé.`
                          : ''}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={() => void handleCancelRegistration(existingRegistration)}
                          className="min-h-[38px] rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                        >
                          {cancelling ? 'Annulation...' : 'Confirmer l’annulation'}
                        </button>
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={() => setConfirmingCancel(false)}
                          className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          Conserver ma place
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                    {canBookInModal &&
                      maxAdditionalGuests > 0 &&
                      !showAddGuestsForm && (
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg(null);
                            setGuestSuccessMsg(null);
                            setShowAddGuestsForm(true);
                            if (additionalGuests.length === 0) {
                              setAdditionalGuests([createEmptyGuestRow()]);
                            }
                          }}
                          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 cursor-pointer"
                        >
                          <UserPlus className="h-4 w-4" aria-hidden="true" />
                          Inviter une personne
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => downloadEventIcs(event)}
                      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                    >
                      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                      Ajouter à mon agenda (.ics)
                    </button>
                    {hasPaidReceipt && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadPaymentReceipt({
                            event,
                            memberName: `${existingRegistration.firstName} ${existingRegistration.lastName}`.trim(),
                            memberEmail: existingRegistration.email,
                            amountCents: existingRegistration.amountCents ?? 0,
                            method:
                              existingRegistration.paymentMethod === 'onsite'
                                ? 'onsite'
                                : 'card',
                            status:
                              payInfo.status === 'paid' ||
                              payInfo.status === 'refunded'
                                ? payInfo.status
                                : 'pending',
                            reference: existingRegistration.paymentReference ?? '',
                            cardBrand: existingRegistration.cardBrand,
                            cardLast4: existingRegistration.cardLast4,
                          })
                        }
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 cursor-pointer"
                      >
                        <FileDown className="h-4 w-4" aria-hidden="true" />
                        Télécharger le reçu
                      </button>
                    )}
                    {onOpenMemberTracking && (
                      <button
                        type="button"
                        onClick={onOpenMemberTracking}
                        className="min-h-[44px] rounded-lg border border-emerald-700 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 cursor-pointer"
                      >
                        Voir dans Mon suivi
                      </button>
                    )}
                    {!onOpenMemberTracking && onOpenCoachRegistrations && (
                      <button
                        type="button"
                        onClick={onOpenCoachRegistrations}
                        className="min-h-[44px] rounded-lg border border-emerald-700 bg-white px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-600 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 cursor-pointer"
                      >
                        Voir mes inscriptions
                      </button>
                    )}
                    {canCancelHere && !confirmingCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setConfirmingCancel(true);
                        }}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/50 cursor-pointer"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Annuler mon inscription
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="min-h-[44px] rounded-lg border border-emerald-300 bg-white px-4 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100/60 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-900/40 cursor-pointer"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              );
            })()
          ) : cancelledFeedback ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 sm:p-5">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Inscription annulée
              </h3>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {cancelledFeedback}
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {canBookInModal && isEventActive && (
                  <button
                    type="button"
                    onClick={() => setCancelledFeedback(null)}
                    className="min-h-[42px] rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                  >
                    Me réinscrire
                  </button>
                )}
                {onOpenMemberTracking && (
                  <button
                    type="button"
                    onClick={onOpenMemberTracking}
                    className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Voir dans Mon suivi
                  </button>
                )}
                {!onOpenMemberTracking && onOpenCoachRegistrations && (
                  <button
                    type="button"
                    onClick={onOpenCoachRegistrations}
                    className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Voir mes inscriptions
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : canBookInModal && !isSignedIn ? (
            <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              {!showAuthStep ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      {isPaidEvent
                        ? `Inscription · ${priceLabel}`
                        : 'Inscription gratuite'}
                    </h3>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {evaluation.helperText}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {isPaidEvent
                      ? `Pour réserver votre place (${priceLabel} — ${formatPaymentModeLabel(allowedMode).toLowerCase()}) et retrouver votre reçu dans votre suivi personnel, connectez-vous ou créez votre profil adhérent.`
                      : 'Pour réserver votre place et la retrouver dans votre suivi personnel, connectez-vous ou créez votre profil adhérent.'}
                  </p>
                  <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Fermer
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthIntent('book');
                        setShowAuthStep(true);
                      }}
                      className="min-h-[44px] rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                    >
                      {isPaidEvent
                        ? `S’inscrire (${priceLabel})`
                        : 'S’inscrire à cette séance'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                        Identifiez-vous pour vous inscrire
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                        Connectez-vous ou créez un compte, puis confirmez votre inscription.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAuthStep(false)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shrink-0 cursor-pointer"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Retour
                    </button>
                  </div>
                  <EmailPasswordAuthForm
                    audience="member"
                    externalError={authError}
                    onSuccess={(signedInUser) =>
                      onMemberEmailAuthSuccess?.(signedInUser, 'book')
                    }
                  />
                </div>
              )}
            </div>
          ) : canBookInModal ? (
            <form onSubmit={handleSubmit} noValidate className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  {isPaidEvent
                    ? `Inscription & paiement · ${priceLabel}`
                    : 'Inscription gratuite'}
                </h3>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {evaluation.helperText}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="booking-first-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Prénom *
                  </label>
                  <input
                    id="booking-first-name"
                    type="text"
                    required
                    maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Camille"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="booking-last-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Nom *
                  </label>
                  <input
                    id="booking-last-name"
                    type="text"
                    required
                    maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Laurent"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="booking-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Adresse email *
                </label>
                <input
                  id="booking-email"
                  type="email"
                  required
                  readOnly={!isCoachAdmin && Boolean(userEmail)}
                  maxLength={VALIDATION_LIMITS.EMAIL_MAX}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="camille.laurent@exemple.fr"
                  className={`mt-1 min-h-[44px] w-full rounded-lg border px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 ${
                    !isCoachAdmin && Boolean(userEmail)
                      ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                      : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500'
                  }`}
                />
                {!isCoachAdmin && Boolean(userEmail) ? (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {isCoach
                      ? 'Email de votre compte coach connecté — retrouvez vos inscriptions dans votre espace coach.'
                      : 'Email de votre profil connecté — la réservation apparaîtra dans Mon suivi.'}
                  </p>
                ) : isCoachAdmin && Boolean(userEmail) ? (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Prérempli avec votre email coach (modifiable si vous inscrivez un tiers).
                  </p>
                ) : null}
              </div>

              {/* Accompanying Guests Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Inviter une ou plusieurs personnes (optionnel)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Renseignez le prénom, nom et email de chaque accompagnant.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={guests.length >= maxGuestsInitial}
                    onClick={() => handleAddGuestRow(false)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50 cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Ajouter un invité
                  </button>
                </div>

                {maxGuestsInitial === 0 && guests.length === 0 && (
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Il ne reste qu’une seule place disponible pour cette séance : il n’est plus possible d’ajouter d’invité.
                  </p>
                )}

                {guests.map((guest, idx) => (
                  <div
                    key={guest.id}
                    className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        Invité {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveGuestRow(guest.id, false)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Retirer
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`booking-guest-first-${guest.id}`}
                          className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          Prénom *
                        </label>
                        <input
                          id={`booking-guest-first-${guest.id}`}
                          type="text"
                          required
                          maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                          value={guest.firstName}
                          onChange={(e) =>
                            handleUpdateGuestRow(guest.id, 'firstName', e.target.value, false)
                          }
                          placeholder="Prénom de l’invité"
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`booking-guest-last-${guest.id}`}
                          className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          Nom *
                        </label>
                        <input
                          id={`booking-guest-last-${guest.id}`}
                          type="text"
                          required
                          maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                          value={guest.lastName}
                          onChange={(e) =>
                            handleUpdateGuestRow(guest.id, 'lastName', e.target.value, false)
                          }
                          placeholder="Nom de l’invité"
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor={`booking-guest-email-${guest.id}`}
                        className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                      >
                        Adresse email *
                      </label>
                      <input
                        id={`booking-guest-email-${guest.id}`}
                        type="email"
                        required
                        maxLength={VALIDATION_LIMITS.EMAIL_MAX}
                        value={guest.email}
                        onChange={(e) =>
                          handleUpdateGuestRow(guest.id, 'email', e.target.value, false)
                        }
                        placeholder="invite@exemple.fr"
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {isPaidEvent && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3.5 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Mode de règlement
                      {guests.length > 0
                        ? ` (${totalBookingParticipants} places × ${priceLabel})`
                        : ''}
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      Total : {totalBookingPriceLabel}
                    </span>
                  </div>

                  {allowedMode === 'both' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPayMethod('card')}
                        className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                          selectedPayMethod === 'card'
                            ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                        Payer en ligne (carte)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPayMethod('onsite')}
                        className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                          selectedPayMethod === 'onsite'
                            ? 'border-emerald-700 bg-emerald-700 text-white dark:border-emerald-600 dark:bg-emerald-600'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Wallet className="h-4 w-4" aria-hidden="true" />
                        Régler sur place
                      </button>
                    </div>
                  )}

                  {selectedPayMethod === 'card' ? (
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                          <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                          Paiement par carte ({cardBrand})
                        </span>
                        <button
                          type="button"
                          onClick={handleFillTestCard}
                          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
                        >
                          Remplir carte test
                        </button>
                      </div>

                      <div>
                        <label
                          htmlFor="booking-card-holder"
                          className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          Titulaire de la carte *
                        </label>
                        <input
                          id="booking-card-holder"
                          type="text"
                          required
                          autoComplete="cc-name"
                          value={cardHolder}
                          onChange={(e) => {
                            cardHolderTouchedRef.current = true;
                            setCardHolder(e.target.value);
                          }}
                          placeholder="Camille Laurent"
                          className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="booking-card-number"
                          className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                        >
                          Numéro de carte *
                        </label>
                        <input
                          id="booking-card-number"
                          type="text"
                          inputMode="numeric"
                          required
                          autoComplete="cc-number"
                          maxLength={19}
                          value={cardNumber}
                          onChange={(e) =>
                            setCardNumber(formatCardNumberInput(e.target.value))
                          }
                          placeholder="4242 4242 4242 4242"
                          className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="booking-card-expiry"
                            className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                          >
                            Expiration (MM/AA) *
                          </label>
                          <input
                            id="booking-card-expiry"
                            type="text"
                            inputMode="numeric"
                            required
                            autoComplete="cc-exp"
                            maxLength={5}
                            value={cardExpiry}
                            onChange={(e) =>
                              setCardExpiry(formatCardExpiryInput(e.target.value))
                            }
                            placeholder="12/28"
                            className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="booking-card-cvc"
                            className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                          >
                            CVC *
                          </label>
                          <input
                            id="booking-card-cvc"
                            type="password"
                            inputMode="numeric"
                            required
                            autoComplete="cc-csc"
                            maxLength={4}
                            value={cardCvc}
                            onChange={(e) =>
                              setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))
                            }
                            placeholder="123"
                            className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Validation locale sécurisée : seuls les 4 derniers chiffres et le réseau sont conservés sur votre reçu (aucun numéro complet ni CVC n’est enregistré).
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200">
                      {guests.length > 0
                        ? `${totalBookingParticipants} places sont réservées immédiatement. Vous réglerez `
                        : 'Votre place est réservée immédiatement. Vous réglerez '}
                      <strong>{totalBookingPriceLabel}</strong> sur place directement auprès de l’animateur le jour de la séance.
                    </div>
                  )}
                </div>
              )}

              {errorMsg && (
                <div
                  ref={errorAlertRef}
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  {submitting
                    ? isPaidEvent && selectedPayMethod === 'card'
                      ? 'Paiement en cours...'
                      : 'Enregistrement...'
                    : isPaidEvent
                      ? selectedPayMethod === 'card'
                        ? `Payer ${totalBookingPriceLabel} et confirmer`
                        : `Réserver (${totalBookingPriceLabel} sur place)`
                      : guests.length > 0
                        ? `Confirmer (${totalBookingParticipants} places)`
                        : 'Confirmer mon inscription'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div
                className={`rounded-xl border p-4 ${
                  evaluation.state === 'cancelled'
                    ? 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100'
                    : evaluation.state === 'closed'
                      ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-100'
                      : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-sm font-bold">
                      {evaluation.statusLabel}
                    </h3>
                    <p className="mt-1 text-sm">
                      {evaluation.helperText}
                    </p>
                  </div>
                </div>

                {canMessageCoachNow && (
                  <div className="mt-3 flex flex-col gap-2.5 border-t border-current/15 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-relaxed opacity-90">
                      {isClosedBeforeStart
                        ? `Vous pouvez malgré tout envoyer un message à l’animateur jusqu’au début de la séance (${formatFrenchTime(startDate)}).`
                        : `Vous pouvez contacter l’animateur jusqu’au début de la séance (${formatFrenchTime(startDate)}).`}
                    </p>
                    {isSignedIn && onMessageCoach ? (
                      <button
                        type="button"
                        onClick={() => onMessageCoach(event)}
                        className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        Envoyer un message à l’animateur
                      </button>
                    ) : !isSignedIn && !showAuthStep ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthIntent('message');
                          setShowAuthStep(true);
                        }}
                        className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        Se connecter pour écrire à l’animateur
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {canMessageCoachNow &&
                !isSignedIn &&
                showAuthStep &&
                authIntent === 'message' && (
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                          Identifiez-vous pour écrire à l’animateur
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                          Connectez-vous ou créez votre profil adhérent pour envoyer un message jusqu’à {formatFrenchTime(startDate)}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAuthStep(false);
                          setAuthIntent('book');
                        }}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shrink-0 cursor-pointer"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        Retour
                      </button>
                    </div>
                    <EmailPasswordAuthForm
                      audience="member"
                      externalError={authError}
                      onSuccess={(signedInUser) =>
                        onMemberEmailAuthSuccess?.(signedInUser, 'message')
                      }
                    />
                  </div>
                )}
            </div>
          )}

          {/* Reviews & Comments Section: visible & actionable only once session ended and validated */}
          {hasEventEnded && evaluation.state !== 'cancelled' && (
            <>
              {!isCoach &&
              existingRegistration?.status === 'confirmed' &&
              !existingRegistration.attended ? (
                <div className="space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 dark:border-amber-800/80 dark:bg-amber-950/40 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-0.5 text-xs text-amber-950 dark:text-amber-100">
                      <p className="font-semibold">
                        Séance terminée — validation requise
                      </p>
                      <p className="text-amber-900/85 dark:text-amber-200/85">
                        Validez votre séance pour laisser un avis et consulter les commentaires des participants.
                      </p>
                    </div>
                    {onValidateSession ? (
                      <button
                        type="button"
                        disabled={validatingSession}
                        onClick={async () => {
                          setValidationSessionError(null);
                          setValidatingSession(true);
                          try {
                            await onValidateSession(existingRegistration);
                          } catch (err) {
                            setValidationSessionError(
                              formatFirestoreActionError(
                                err,
                                'Impossible de valider cette séance pour le moment.',
                                'La validation n’a pas encore été autorisée (vérifiez que la séance est bien terminée).'
                              )
                            );
                          } finally {
                            setValidatingSession(false);
                          }
                        }}
                        className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {validatingSession ? 'Validation...' : 'Valider ma séance'}
                      </button>
                    ) : (
                      onOpenMemberTracking && (
                        <button
                          type="button"
                          onClick={onOpenMemberTracking}
                          className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
                        >
                          Valider dans Mon suivi
                        </button>
                      )
                    )}
                  </div>
                  {validationSessionError && (
                    <div
                      role="alert"
                      className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
                    >
                      {validationSessionError}
                    </div>
                  )}
                </div>
              ) : (
                (eventReviews.length > 0 ||
                  Boolean(eligibleReviewRegistration) ||
                  isCoach) && (
                  <EventReviewsSection
                    reviews={eventReviews}
                    summary={ratingSummary}
                    currentUserUid={currentUserUid}
                    isCoach={isCoach}
                    eligibleRegistration={eligibleReviewRegistration}
                    myReview={
                      (currentUserUid
                        ? eventReviews.find((r) => r.authorUid === currentUserUid)
                        : undefined) ??
                      (eligibleReviewRegistration
                        ? eventReviews.find(
                            (r) =>
                              r.registrationId === eligibleReviewRegistration.id
                          )
                        : undefined) ??
                      null
                    }
                    onSubmitReview={
                      currentUserUid
                        ? async (reg, rating, comment) => {
                            await upsertEventReview({
                              registration: reg,
                              matchedEvent: event,
                              authorUid: currentUserUid,
                              rating,
                              comment,
                              fallbackDisplayName: userDisplayName,
                            });
                          }
                        : undefined
                    }
                    onDeleteReview={
                      currentUserUid
                        ? (reviewId) => deleteEventReview(reviewId)
                        : undefined
                    }
                  />
                )
              )}
            </>
          )}
        </div>
      </div>

      {imageLightboxOpen && coverImageSrc && (
        <EventImageLightbox
          src={coverImageSrc}
          title={event.title}
          onClose={() => setImageLightboxOpen(false)}
        />
      )}
    </div>
  );
}
