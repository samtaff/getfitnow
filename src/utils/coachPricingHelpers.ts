import { CoachPricing, RunningDistanceKey, VALIDATION_LIMITS } from '../types';
import { formatPriceEuros } from './dateAndValidation';
import { RUNNING_DISTANCE_TEMPLATES } from './runningProgramGenerator';

export const DEFAULT_CUSTOM_SESSION_PRICE_CENTS = 900;
export const DEFAULT_GROUP_SESSION_PRICE_CENTS = 1500;

function normalizePriceCentsValue(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  const rounded = Math.round(raw);
  if (rounded <= 0) return 0;
  return Math.min(
    VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS,
    Math.max(VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS, rounded)
  );
}

export function sanitizeCoachPricing(
  input?: CoachPricing | null
): CoachPricing {
  return {
    groupSessionPriceCents: normalizePriceCentsValue(
      input?.groupSessionPriceCents
    ),
    customSessionPriceCents: normalizePriceCentsValue(
      input?.customSessionPriceCents
    ),
    program5kmPriceCents: normalizePriceCentsValue(
      input?.program5kmPriceCents
    ),
    program10kmPriceCents: normalizePriceCentsValue(
      input?.program10kmPriceCents
    ),
    program21kmPriceCents: normalizePriceCentsValue(
      input?.program21kmPriceCents
    ),
    program42kmPriceCents: normalizePriceCentsValue(
      input?.program42kmPriceCents
    ),
    pricingNotes: (input?.pricingNotes ?? '')
      .trim()
      .slice(0, VALIDATION_LIMITS.PRICING_NOTES_MAX),
  };
}

export function areCoachPricingsEqual(
  a?: CoachPricing | null,
  b?: CoachPricing | null
): boolean {
  const sa = sanitizeCoachPricing(a);
  const sb = sanitizeCoachPricing(b);
  return (
    sa.groupSessionPriceCents === sb.groupSessionPriceCents &&
    sa.customSessionPriceCents === sb.customSessionPriceCents &&
    sa.program5kmPriceCents === sb.program5kmPriceCents &&
    sa.program10kmPriceCents === sb.program10kmPriceCents &&
    sa.program21kmPriceCents === sb.program21kmPriceCents &&
    sa.program42kmPriceCents === sb.program42kmPriceCents &&
    sa.pricingNotes === sb.pricingNotes
  );
}

export function getCoachRunningProgramPriceCents(
  pricing: CoachPricing | undefined | null,
  distance: RunningDistanceKey
): number {
  const raw =
    distance === '5km'
      ? pricing?.program5kmPriceCents
      : distance === '10km'
        ? pricing?.program10kmPriceCents
        : distance === '21km'
          ? pricing?.program21kmPriceCents
          : pricing?.program42kmPriceCents;
  if (typeof raw === 'number' && raw >= VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS) {
    return Math.min(VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS, Math.round(raw));
  }
  return RUNNING_DISTANCE_TEMPLATES[distance].defaultPriceCents;
}

export function hasCoachCustomRunningPrice(
  pricing: CoachPricing | undefined | null,
  distance: RunningDistanceKey
): boolean {
  const raw =
    distance === '5km'
      ? pricing?.program5kmPriceCents
      : distance === '10km'
        ? pricing?.program10kmPriceCents
        : distance === '21km'
          ? pricing?.program21kmPriceCents
          : pricing?.program42kmPriceCents;
  return (
    typeof raw === 'number' && raw >= VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS
  );
}

export function getCoachCustomSessionPriceCents(
  pricing: CoachPricing | undefined | null
): number {
  const raw = pricing?.customSessionPriceCents;
  if (typeof raw === 'number' && raw >= VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS) {
    return Math.min(VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS, Math.round(raw));
  }
  return DEFAULT_CUSTOM_SESSION_PRICE_CENTS;
}

export function hasCoachCustomSessionPrice(
  pricing: CoachPricing | undefined | null
): boolean {
  return (
    typeof pricing?.customSessionPriceCents === 'number' &&
    pricing.customSessionPriceCents >= VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS
  );
}

export function getCoachGroupSessionPriceCents(
  pricing: CoachPricing | undefined | null
): number {
  const raw = pricing?.groupSessionPriceCents;
  if (typeof raw === 'number' && raw >= VALIDATION_LIMITS.PRICE_MIN_CENTS) {
    return Math.min(VALIDATION_LIMITS.PRICE_MAX_CENTS, Math.round(raw));
  }
  return DEFAULT_GROUP_SESSION_PRICE_CENTS;
}

export function hasCoachGroupSessionPrice(
  pricing: CoachPricing | undefined | null
): boolean {
  return (
    typeof pricing?.groupSessionPriceCents === 'number' &&
    pricing.groupSessionPriceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS
  );
}

export function formatCentsForInput(
  cents?: number | null,
  decimals: 'auto' | 'fixed2' = 'auto'
): string {
  if (typeof cents !== 'number' || cents <= 0) return '';
  const euros = cents / 100;
  if (decimals === 'fixed2') {
    return euros.toFixed(2);
  }
  return Number.isInteger(euros) ? String(euros) : euros.toFixed(2);
}

export function parseOptionalEurosInputToCents(
  raw: string,
  fieldLabel: string
): number {
  const clean = raw.trim().replace(',', '.');
  if (!clean) return 0;
  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} : veuillez saisir un montant valide en euros.`);
  }
  if (parsed === 0) return 0;
  const cents = Math.round(parsed * 100);
  if (cents < VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS) {
    throw new Error(
      `${fieldLabel} : le tarif minimum est de 1,00 € (ou laissez vide si non défini).`
    );
  }
  if (cents > VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS) {
    throw new Error(
      `${fieldLabel} : le tarif maximum autorisé est de 2 000,00 €.`
    );
  }
  return cents;
}

export interface CoachPricingBadgeItem {
  key: string;
  label: string;
  shortLabel: string;
  priceCents: number;
  formattedPrice: string;
}

export function getCoachPricingItems(
  pricing?: CoachPricing | null
): CoachPricingBadgeItem[] {
  if (!pricing) return [];
  const candidates: {
    key: string;
    label: string;
    shortLabel: string;
    cents?: number;
  }[] = [
    {
      key: 'group',
      label: 'Séance collective',
      shortLabel: 'Séance coll.',
      cents: pricing.groupSessionPriceCents,
    },
    {
      key: 'custom',
      label: 'Séance sur mesure',
      shortLabel: 'Sur mesure',
      cents: pricing.customSessionPriceCents,
    },
    {
      key: '5km',
      label: 'Programme 5 km',
      shortLabel: 'Plan 5 km',
      cents: pricing.program5kmPriceCents,
    },
    {
      key: '10km',
      label: 'Programme 10 km',
      shortLabel: 'Plan 10 km',
      cents: pricing.program10kmPriceCents,
    },
    {
      key: '21km',
      label: 'Semi-marathon 21 km',
      shortLabel: 'Plan 21 km',
      cents: pricing.program21kmPriceCents,
    },
    {
      key: '42km',
      label: 'Marathon 42 km',
      shortLabel: 'Plan 42 km',
      cents: pricing.program42kmPriceCents,
    },
  ];

  return candidates
    .filter(
      (item): item is typeof item & { cents: number } =>
        typeof item.cents === 'number' &&
        item.cents >= VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS
    )
    .map((item) => ({
      key: item.key,
      label: item.label,
      shortLabel: item.shortLabel,
      priceCents: item.cents,
      formattedPrice: formatPriceEuros(item.cents),
    }));
}

export function hasAnyCoachPricing(pricing?: CoachPricing | null): boolean {
  return (
    getCoachPricingItems(pricing).length > 0 ||
    Boolean(pricing?.pricingNotes?.trim())
  );
}
