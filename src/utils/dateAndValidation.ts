import {
  BookingAvailabilityState,
  EventPaymentMode,
  FitnessLevel,
  PaymentStatus,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';

export function getEventCoachNames(
  event: Pick<SportEvent, 'coachName' | 'coachNames'>
): string[] {
  if (Array.isArray(event.coachNames) && event.coachNames.length > 0) {
    const cleaned = event.coachNames
      .map((name) => name.trim())
      .filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }
  const split = (event.coachName || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return split.length > 0 ? split : [];
}

export function formatEventCoachesLabel(
  event: Pick<SportEvent, 'coachName' | 'coachNames'>
): string {
  const names = getEventCoachNames(event);
  if (names.length === 0) return 'Animateur';
  if (names.length === 1) return `Animateur : ${names[0]}`;
  return `Animateurs : ${names.join(', ')}`;
}

export function getEventCoachFirstName(
  event: Pick<SportEvent, 'coachName' | 'coachNames' | 'coachUids'> | null | undefined,
  actingCoachUid?: string | null,
  fallbackCoachName?: string | null
): string {
  let targetName = '';
  if (event) {
    const names = getEventCoachNames(event);
    if (
      actingCoachUid &&
      Array.isArray(event.coachUids) &&
      event.coachUids.length > 0
    ) {
      const idx = event.coachUids.indexOf(actingCoachUid);
      if (idx >= 0 && names[idx]) {
        targetName = names[idx];
      }
    }
    if (!targetName && names.length > 0) {
      targetName = names[0];
    }
  }
  if (!targetName && fallbackCoachName) {
    targetName = fallbackCoachName.trim();
  }
  const firstToken = targetName.trim().split(/\s+/)[0] || '';
  return firstToken || 'Votre coach';
}

export function buildRegistrationAckMessage(coachFirstName: string): string {
  return `${coachFirstName} a bien pris en compte l'inscription. À tout à l'heure pour la séance.`;
}

export function isRegistrationAckMessage(text?: string | null): boolean {
  if (!text) return false;
  return text.toLowerCase().includes("a bien pris en compte l'inscription");
}

export function getRegistrationEndMs(
  reg: Registration,
  matchedEvent?: SportEvent | null
): number {
  if (matchedEvent) {
    return (
      matchedEvent.startAt.toMillis() +
      matchedEvent.durationMinutes * 60 * 1000
    );
  }
  if (reg.eventEndAt) {
    return reg.eventEndAt.toMillis();
  }
  if (
    typeof reg.eventDurationMinutes === 'number' &&
    reg.eventDurationMinutes > 0
  ) {
    return reg.eventStartAt.toMillis() + reg.eventDurationMinutes * 60 * 1000;
  }
  return reg.eventStartAt.toMillis();
}

export function normalizeBookingCutoffMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded <= VALIDATION_LIMITS.BOOKING_CUTOFF_MINUTES_MIN) return 0;
  if (rounded >= VALIDATION_LIMITS.BOOKING_CUTOFF_MINUTES_MAX) {
    return VALIDATION_LIMITS.BOOKING_CUTOFF_MINUTES_MAX;
  }
  return rounded;
}

export function formatBookingCutoffLabel(minutes: number): string {
  const safe = normalizeBookingCutoffMinutes(minutes);
  if (safe === 0) return 'au début de la séance';
  if (safe < 60) return `${safe} min`;
  if (safe % 1440 === 0) {
    const days = safe / 1440;
    return `${days} jour${days > 1 ? 's' : ''}`;
  }
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${String(mins).padStart(2, '0')}`;
}

export interface BookingEvaluation {
  state: BookingAvailabilityState;
  isAutoCancelledNoRegistrants: boolean;
  isUnlimited: boolean;
  remainingSpots: number | null;
  startMs: number;
  endMs: number;
  cutoffMinutes: number;
  cutoffMs: number;
  msUntilCutoff: number;
  msUntilStart: number;
  statusLabel: string;
  helperText: string;
  capacityLabel: string;
}

export function evaluateEventBooking(
  event: SportEvent,
  nowMs: number = Date.now(),
  options?: { hideRegisteredCount?: boolean }
): BookingEvaluation {
  const hideRegisteredCount = Boolean(options?.hideRegisteredCount);
  const startMs = event.startAt.toMillis();
  const endMs = startMs + event.durationMinutes * 60 * 1000;
  const cutoffMinutes = normalizeBookingCutoffMinutes(event.bookingCutoffMinutes);
  const cutoffMs = startMs - cutoffMinutes * 60 * 1000;
  const msUntilCutoff = cutoffMs - nowMs;
  const msUntilStart = startMs - nowMs;
  const isUnlimited = Boolean(event.isUnlimitedCapacity);
  const remainingSpots = isUnlimited
    ? null
    : Math.max(0, event.maxCapacity - event.registeredCount);

  const isClosedZeroRegistrants =
    event.status === 'published' &&
    cutoffMinutes > 0 &&
    nowMs >= cutoffMs &&
    event.registeredCount === 0;

  const isAutoCancelledNoRegistrants =
    (event.status === 'cancelled' && event.cancelReason === 'no_registrants') ||
    isClosedZeroRegistrants;

  const capacityLabel = hideRegisteredCount
    ? isAutoCancelledNoRegistrants
      ? 'Pas d’inscrit · Séance annulée'
      : event.status === 'cancelled'
        ? 'Séance annulée'
        : isUnlimited
          ? 'Places illimitées'
          : (remainingSpots ?? 0) <= 0
            ? 'Séance complète'
            : nowMs >= startMs || (remainingSpots ?? 0) <= 3
              ? 'Places limitées'
              : 'Places disponibles'
    : isUnlimited
      ? `${event.registeredCount} inscrit${event.registeredCount > 1 ? 's' : ''} · Places illimitées`
      : `${event.registeredCount}/${event.maxCapacity} inscrits · ${remainingSpots} place${(remainingSpots ?? 0) > 1 ? 's' : ''} restante${(remainingSpots ?? 0) > 1 ? 's' : ''}`;

  if (isAutoCancelledNoRegistrants) {
    const cutoffDate = new Date(cutoffMs);
    const cutoffTimeLabel = formatFrenchTime(cutoffDate);
    return {
      state: 'cancelled',
      isAutoCancelledNoRegistrants: true,
      isUnlimited,
      remainingSpots,
      startMs,
      endMs,
      cutoffMinutes,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: 'Inscriptions clôturées · Séance annulée',
      helperText:
        isClosedZeroRegistrants
          ? `Inscriptions clôturées (${formatBookingCutoffLabel(cutoffMinutes)} avant le début, à ${cutoffTimeLabel}) — pas d’inscrit à cette séance, séance annulée.`
          : 'Inscriptions clôturées — pas d’inscrit à cette séance, séance annulée.',
      capacityLabel,
    };
  }

  if (event.status === 'cancelled') {
    return {
      state: 'cancelled',
      isAutoCancelledNoRegistrants: false,
      isUnlimited,
      remainingSpots,
      startMs,
      endMs,
      cutoffMinutes,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: 'Inscriptions clôturées · Séance annulée',
      helperText: 'Inscriptions clôturées : séance annulée.',
      capacityLabel,
    };
  }

  if (nowMs >= startMs) {
    return {
      state: 'past',
      isAutoCancelledNoRegistrants: false,
      isUnlimited,
      remainingSpots,
      startMs,
      endMs,
      cutoffMinutes,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: nowMs < endMs ? 'En cours' : 'Terminée',
      helperText:
        nowMs < endMs
          ? 'Inscriptions fermées — la séance est actuellement en cours.'
          : 'Inscriptions fermées — cette séance est terminée.',
      capacityLabel,
    };
  }

  if (cutoffMinutes > 0 && nowMs >= cutoffMs) {
    const cutoffDate = new Date(cutoffMs);
    const cutoffTimeLabel = formatFrenchTime(cutoffDate);
    return {
      state: 'closed',
      isAutoCancelledNoRegistrants: false,
      isUnlimited,
      remainingSpots,
      startMs,
      endMs,
      cutoffMinutes,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: 'Inscriptions clôturées',
      helperText: `Inscriptions clôturées (${formatBookingCutoffLabel(cutoffMinutes)} avant le début, à ${cutoffTimeLabel}).`,
      capacityLabel,
    };
  }

  if (!isUnlimited && (remainingSpots ?? 0) <= 0) {
    return {
      state: 'full',
      isAutoCancelledNoRegistrants: false,
      isUnlimited,
      remainingSpots: 0,
      startMs,
      endMs,
      cutoffMinutes,
      cutoffMs,
      msUntilCutoff,
      msUntilStart,
      statusLabel: 'Complet',
      helperText: 'Toutes les places disponibles ont été réservées.',
      capacityLabel,
    };
  }

  const startTimeLabel = formatFrenchTime(new Date(startMs));
  const cutoffTimeLabel = formatFrenchTime(new Date(cutoffMs));
  const helperText =
    cutoffMinutes > 0
      ? `Inscriptions ouvertes · Clôture ${formatBookingCutoffLabel(cutoffMinutes)} avant le début (${cutoffTimeLabel}, ${formatDurationRemaining(msUntilCutoff)} restant).`
      : `Inscriptions ouvertes jusqu’au début de la séance à ${startTimeLabel} (${formatDurationRemaining(msUntilStart)} restant).`;

  return {
    state: 'open',
    isAutoCancelledNoRegistrants: false,
    isUnlimited,
    remainingSpots,
    startMs,
    endMs,
    cutoffMinutes,
    cutoffMs,
    msUntilCutoff,
    msUntilStart,
    statusLabel: 'Inscriptions ouvertes',
    helperText,
    capacityLabel,
  };
}

export function canMemberMessageEventCoach(
  event: SportEvent,
  nowMs: number = Date.now(),
  evaluation?: BookingEvaluation
): boolean {
  const hasCoachTarget = Boolean(event.coachUids?.[0] || event.createdBy);
  if (!hasCoachTarget) return false;
  const evalInfo = evaluation ?? evaluateEventBooking(event, nowMs);
  if (nowMs >= evalInfo.startMs) return false;
  if (evalInfo.state === 'cancelled' && !evalInfo.isAutoCancelledNoRegistrants) {
    return false;
  }
  return true;
}

export function formatCapacityCompact(event: SportEvent): string {
  if (event.isUnlimitedCapacity) {
    return `${event.registeredCount} · Illimité`;
  }
  return `${event.registeredCount}/${event.maxCapacity}`;
}

export function formatDurationRemaining(ms: number): string {
  if (ms <= 0) return '0 min';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}j ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `${minutes} min`;
}

export function formatFrenchTime(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatFrenchDateShort(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatFrenchDateLong(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatTimeRange(start: Date, durationMinutes: number): string {
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return `${formatFrenchTime(start)} – ${formatFrenchTime(end)}`;
}

export function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toLocalTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getMonthDaysGrid(year: number, monthIndex: number): Date[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startDayOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - startDayOffset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i
      )
    );
  }
  return days;
}

export function getWeekDays(anchorDate: Date): Date[] {
  const dayOffset = (anchorDate.getDay() + 6) % 7;
  const monday = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate() - dayOffset
  );
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    );
  }
  return days;
}

export async function hashEmailKey(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 24);
}

export function downloadEventIcs(event: SportEvent): void {
  const start = event.startAt.toDate();
  const end = new Date(start.getTime() + event.durationMinutes * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const escapeIcs = (text: string) =>
    text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const safeExternalUrl = getSafeExternalHref(event.externalUrl);
  const fullLocation = [event.location, event.city, event.region]
    .filter(Boolean)
    .join(', ');
  const baseDescription = `${event.description || 'Séance sportive'} — ${formatEventCoachesLabel(event)}`;
  const fullDescription = safeExternalUrl
    ? `${baseDescription}\nLien : ${safeExternalUrl}`
    : baseDescription;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GetFitNow Event//FR',
    'BEGIN:VEVENT',
    `UID:${event.id}@getfitnow-event`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeIcs(`${event.title} (${event.discipline})`)}`,
    `LOCATION:${escapeIcs(fullLocation)}`,
    `DESCRIPTION:${escapeIcs(fullDescription)}`,
    ...(safeExternalUrl ? [`URL:${safeExternalUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const icsContent = icsLines.join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `seance-${event.id}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCsv(filename: string, headers: string[], rows: string[][]): void {
  const escapeCell = (val: string) => {
    const safe = val.replace(/"/g, '""');
    return `"${safe}"`;
  };
  const csvLines = [
    headers.map(escapeCell).join(';'),
    ...rows.map((r) => r.map(escapeCell).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatPriceEuros(priceCents: number): string {
  const safeCents = Math.max(0, Math.round(priceCents));
  if (safeCents === 0) return '0 €';
  const isWhole = safeCents % 100 === 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

export function formatEventPrice(
  event: Pick<SportEvent, 'isPaid' | 'priceCents'>
): string {
  if (event.isPaid && typeof event.priceCents === 'number' && event.priceCents > 0) {
    return formatPriceEuros(event.priceCents);
  }
  return 'Gratuit';
}

export function formatPaymentModeLabel(mode?: EventPaymentMode): string {
  if (mode === 'onsite') return 'Sur place';
  if (mode === 'both') return 'Carte ou sur place';
  return 'Carte en ligne';
}

export function getRegistrationPaymentBadgeInfo(
  reg: Pick<
    Registration,
    'amountCents' | 'paymentStatus' | 'paymentMethod' | 'cardBrand' | 'cardLast4'
  >
): {
  status: PaymentStatus;
  label: string;
  shortLabel: string;
  amountLabel: string;
} {
  const amount = typeof reg.amountCents === 'number' ? reg.amountCents : 0;
  const amountLabel = amount > 0 ? formatPriceEuros(amount) : 'Gratuit';
  const status: PaymentStatus =
    reg.paymentStatus ?? (amount > 0 ? 'pending' : 'free');

  if (status === 'free' || amount <= 0) {
    return {
      status: 'free',
      label: 'Gratuit',
      shortLabel: 'Gratuit',
      amountLabel: 'Gratuit',
    };
  }

  if (status === 'paid') {
    const cardDetails =
      reg.paymentMethod === 'card' && reg.cardLast4
        ? ` · ${reg.cardBrand || 'CB'} •••• ${reg.cardLast4}`
        : reg.paymentMethod === 'onsite'
          ? ' · Sur place'
          : '';
    return {
      status: 'paid',
      label: `Payé (${amountLabel})${cardDetails}`,
      shortLabel: `Payé · ${amountLabel}`,
      amountLabel,
    };
  }

  if (status === 'refunded') {
    return {
      status: 'refunded',
      label: `Remboursé (${amountLabel})`,
      shortLabel: `Remboursé · ${amountLabel}`,
      amountLabel,
    };
  }

  return {
    status: 'pending',
    label: `À régler sur place (${amountLabel})`,
    shortLabel: `Sur place · ${amountLabel}`,
    amountLabel,
  };
}

export const FITNESS_LEVEL_OPTIONS: ReadonlyArray<{
  value: FitnessLevel;
  label: string;
  shortLabel: string;
  frequency: string;
}> = [
  {
    value: 'beginner',
    label: 'Débutant (0/1 fois par semaine)',
    shortLabel: 'Débutant (0/1×/sem.)',
    frequency: '0/1 fois par semaine',
  },
  {
    value: 'intermediate',
    label: 'Intermédiaire (2/4 fois par semaine)',
    shortLabel: 'Intermédiaire (2/4×/sem.)',
    frequency: '2/4 fois par semaine',
  },
  {
    value: 'advanced',
    label: 'Avancé (5 fois et + par semaine)',
    shortLabel: 'Avancé (5+×/sem.)',
    frequency: '5 fois et + par semaine',
  },
];

export function formatFitnessLevelLabel(
  level?: FitnessLevel | '' | null,
  short = false
): string {
  if (!level) return '';
  const match = FITNESS_LEVEL_OPTIONS.find((opt) => opt.value === level);
  if (!match) return '';
  return short ? match.shortLabel : match.label;
}

export function isValidBirthDateString(birthDate?: string | null): boolean {
  const clean = (birthDate ?? '').trim();
  if (!clean) return false;
  if (!VALIDATION_LIMITS.BIRTH_DATE_REGEX.test(clean)) return false;
  const [yStr, mStr, dStr] = clean.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false;
  }
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return parsed.getTime() <= todayMidnight.getTime();
}

export function calculateAgeFromBirthDate(
  birthDate?: string | null,
  referenceDate: Date = new Date()
): number | null {
  const clean = (birthDate ?? '').trim();
  if (!isValidBirthDateString(clean)) return null;
  const [yStr, mStr, dStr] = clean.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  let age = referenceDate.getFullYear() - year;
  const currentMonth = referenceDate.getMonth() + 1;
  const currentDay = referenceDate.getDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }
  if (age < 0 || age > 125) return null;
  return age;
}

export function formatBirthDateFrench(birthDate?: string | null): string {
  const clean = (birthDate ?? '').trim();
  if (!isValidBirthDateString(clean)) return '';
  const [yStr, mStr, dStr] = clean.split('-');
  const date = new Date(Number(yStr), Number(mStr) - 1, Number(dStr));
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatPublicAuthorName(
  firstName?: string | null,
  lastName?: string | null,
  fallbackDisplayName?: string | null
): string {
  const first = (firstName ?? '').trim();
  const last = (lastName ?? '').trim();
  let candidate = '';
  if (first && last) {
    candidate = `${first} ${last.charAt(0).toUpperCase()}.`;
  } else if (first) {
    candidate = first;
  } else if (fallbackDisplayName && fallbackDisplayName.trim()) {
    const parts = fallbackDisplayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      candidate = `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
    } else {
      candidate = parts[0];
    }
  }
  const clean = candidate
    .trim()
    .slice(0, VALIDATION_LIMITS.REVIEW_AUTHOR_NAME_MAX);
  return clean.length >= VALIDATION_LIMITS.REVIEW_AUTHOR_NAME_MIN
    ? clean
    : 'Adhérent';
}

export function normalizeEventExternalUrl(raw?: string | null): {
  url: string;
  error?: string;
} {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { url: '' };
  }
  if (/\s/.test(trimmed)) {
    return {
      url: '',
      error: 'Le lien ne doit pas contenir d’espaces.',
    };
  }
  if (trimmed.startsWith('/')) {
    return {
      url: '',
      error: 'Veuillez saisir une adresse web complète commençant par https:// ou http://.',
    };
  }

  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  if (hasExplicitScheme && !/^https?:\/\//i.test(trimmed)) {
    return {
      url: '',
      error: 'Le lien doit utiliser le protocole https:// ou http://.',
    };
  }

  const candidate = hasExplicitScheme ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        url: '',
        error: 'Le lien doit utiliser le protocole https:// ou http://.',
      };
    }
    if (
      !parsed.hostname ||
      !parsed.hostname.includes('.') ||
      parsed.hostname.startsWith('.') ||
      parsed.hostname.endsWith('.')
    ) {
      return {
        url: '',
        error: 'Veuillez saisir une adresse web valide (ex. https://exemple.fr).',
      };
    }
    const finalUrl = parsed.href;
    if (finalUrl.length > VALIDATION_LIMITS.EVENT_URL_MAX || /\s/.test(finalUrl)) {
      return {
        url: '',
        error: `Le lien ne doit pas dépasser ${VALIDATION_LIMITS.EVENT_URL_MAX} caractères.`,
      };
    }
    return { url: finalUrl };
  } catch {
    return {
      url: '',
      error: 'Veuillez saisir une adresse web valide (ex. https://exemple.fr).',
    };
  }
}

export function getSafeExternalHref(raw?: string | null): string | null {
  const trimmed = (raw ?? '').trim();
  if (
    !trimmed ||
    trimmed.length > VALIDATION_LIMITS.EVENT_URL_MAX ||
    /\s/.test(trimmed)
  ) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function formatExternalUrlLabel(safeHref: string): string {
  try {
    const parsed = new URL(safeHref);
    const host = parsed.hostname.replace(/^www\./i, '');
    const path =
      parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    const combined = `${host}${path}`;
    return combined.length > 42 ? `${combined.slice(0, 39)}…` : combined;
  } catch {
    return 'Voir le lien';
  }
}

export function getSafeEventCoverImageSrc(raw?: string | null): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed.length > VALIDATION_LIMITS.EVENT_COVER_IMAGE_MAX) {
    return null;
  }
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  return getSafeExternalHref(trimmed);
}

export function parseCoverImagePosition(raw?: string | null): {
  x: number;
  y: number;
} {
  const match = (raw ?? '').trim().match(/^(\d{1,3})%\s+(\d{1,3})%$/);
  if (!match) {
    return { x: 50, y: 50 };
  }
  const x = Math.max(0, Math.min(100, Math.round(Number(match[1]))));
  const y = Math.max(0, Math.min(100, Math.round(Number(match[2]))));
  return { x, y };
}

export function normalizeCoverImagePosition(raw?: string | null): string {
  const { x, y } = parseCoverImagePosition(raw);
  return `${x}% ${y}%`;
}

