import { SportEvent } from '../types';
import {
  formatEventCoachesLabel,
  formatEventPrice,
  formatFrenchDateLong,
  formatTimeRange,
} from './dateAndValidation';

export function buildEventShareUrl(eventId: string): string {
  if (typeof window === 'undefined') {
    return `?event=${encodeURIComponent(eventId)}`;
  }
  try {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('event', eventId);
    return url.toString();
  } catch {
    return `${window.location.origin}${window.location.pathname}?event=${encodeURIComponent(eventId)}`;
  }
}

export function buildEventShareContent(event: SportEvent): {
  title: string;
  summary: string;
  fullMessage: string;
  url: string;
} {
  const startDate = event.startAt.toDate();
  const dateLabel = formatFrenchDateLong(startDate);
  const timeLabel = formatTimeRange(startDate, event.durationMinutes);
  const priceLabel = formatEventPrice(event);
  const coachLabel = formatEventCoachesLabel(event);
  const placeLabel = [event.location, event.city, event.region]
    .filter(Boolean)
    .join(', ');
  const url = buildEventShareUrl(event.id);

  const title = `${event.title} (${event.discipline}) — GetFitNow Event`;
  const summary = `${event.title} · ${event.discipline} le ${dateLabel} (${timeLabel}) à ${event.city} (${priceLabel})`;
  const fullMessage = [
    `🏋️ ${event.title} (${event.discipline})`,
    `📅 ${dateLabel} · ${timeLabel} (${event.durationMinutes} min)`,
    `📍 ${placeLabel}`,
    `👤 ${coachLabel}`,
    `💶 Tarif : ${priceLabel}`,
    '',
    'Rejoins-moi et réserve ta place sur GetFitNow Event :',
  ].join('\n');

  return { title, summary, fullMessage, url };
}

export interface SocialShareTarget {
  id: 'facebook' | 'instagram' | 'whatsapp' | 'email';
  label: string;
  href: string;
  external: boolean;
}

export function buildSocialShareTargets(
  event: SportEvent
): SocialShareTarget[] {
  const { title, summary, fullMessage, url } = buildEventShareContent(event);

  return [
    {
      id: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(summary)}`,
      external: true,
    },
    {
      id: 'instagram',
      label: 'Instagram',
      href: 'https://www.instagram.com/',
      external: true,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${fullMessage}\n${url}`)}`,
      external: true,
    },
    {
      id: 'email',
      label: 'E-mail',
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${fullMessage}\n\n${url}`)}`,
      external: false,
    },
  ];
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
