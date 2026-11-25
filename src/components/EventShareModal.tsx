import { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  Maximize2,
  Share2,
  X,
} from 'lucide-react';
import { DisciplineItem, SportEvent } from '../types';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';
import {
  formatEventPrice,
  formatFrenchDateShort,
  formatTimeRange,
  getSafeEventCoverImageSrc,
  normalizeCoverImagePosition,
} from '../utils/dateAndValidation';
import {
  buildEventShareContent,
  buildSocialShareTargets,
  copyTextToClipboard,
  SocialShareTarget,
} from '../utils/shareHelpers';
import { EventImageLightbox } from './EventImageLightbox';

interface EventShareModalProps {
  event: SportEvent;
  disciplines?: DisciplineItem[];
  onClose: () => void;
}

function SocialNetworkIcon({ id }: { id: SocialShareTarget['id'] }) {
  switch (id) {
    case 'facebook':
      return (
        <svg
          className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5h1.6V4.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V11H7.7v3h2.6v8h3.2z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg
          className="h-4 w-4 text-pink-600 dark:text-pink-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg
          className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case 'email':
      return (
        <Mail
          className="h-4 w-4 text-slate-600 dark:text-slate-300 shrink-0"
          aria-hidden="true"
        />
      );
  }
}

export function EventShareModal({
  event,
  disciplines = [],
  onClose,
}: EventShareModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [instagramCopied, setInstagramCopied] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);

  const shareContent = useMemo(() => buildEventShareContent(event), [event]);
  const targets = useMemo(() => buildSocialShareTargets(event), [event]);
  const discStyle = getDisciplineStyle(event.discipline, disciplines);
  const startDate = event.startAt.toDate();

  const canUseNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(shareContent.url);
    if (ok) {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyFullMessage = async () => {
    const ok = await copyTextToClipboard(
      `${shareContent.fullMessage}\n${shareContent.url}`
    );
    if (ok) {
      setCopiedText(true);
      window.setTimeout(() => setCopiedText(false), 2500);
    }
  };

  const handleInstagramShare = async () => {
    const ok = await copyTextToClipboard(
      `${shareContent.fullMessage}\n${shareContent.url}`
    );
    if (ok) {
      setInstagramCopied(true);
      window.setTimeout(() => setInstagramCopied(false), 4500);
    }
  };

  const handleNativeShare = async () => {
    if (!canUseNativeShare) return;
    setNativeError(null);
    try {
      await navigator.share({
        title: shareContent.title,
        text: shareContent.summary,
        url: shareContent.url,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setNativeError(
        'Le partage système n’est pas disponible dans cette fenêtre. Utilisez un réseau ci-dessous ou copiez le lien.'
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-share-modal-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />

        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="event-share-modal-title"
                className="font-display text-base font-bold text-slate-900 dark:text-white"
              >
                Partager cette séance
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Invitez vos amis ou votre communauté sur les réseaux sociaux.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre de partage"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          {/* Event Preview Card */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/50">
            {(() => {
              const coverSrc = getSafeEventCoverImageSrc(event.coverImageUrl);
              if (!coverSrc) return null;
              return (
                <button
                  type="button"
                  onClick={() => setImageLightboxOpen(true)}
                  aria-label={`Agrandir le visuel de ${event.title}`}
                  className="group relative block aspect-[16/7] w-full overflow-hidden border-b border-slate-200 bg-slate-900 dark:border-slate-800 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
                >
                  <img
                    src={coverSrc}
                    alt={event.title}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    style={{
                      objectPosition: normalizeCoverImagePosition(
                        event.coverImagePosition
                      ),
                    }}
                  />
                  <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-950/65 px-2 py-1 text-[11px] font-medium text-white/95 backdrop-blur-xs transition-colors group-hover:bg-slate-950/85">
                    <Maximize2 className="h-3 w-3" aria-hidden="true" />
                    Agrandir
                  </span>
                </button>
              );
            })()}
            <div className="p-3.5">
            <div className="flex flex-wrap items-center gap-2">
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
              <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                {formatEventPrice(event)}
              </span>
            </div>
            <h3 className="mt-1.5 font-display text-sm font-bold text-slate-900 dark:text-white">
              {event.title}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1 font-mono tabular-nums capitalize">
                <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {formatFrenchDateShort(startDate)} ·{' '}
                {formatTimeRange(startDate, event.durationMinutes)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {event.city}
              </span>
            </div>
            </div>
          </div>

          {canUseNativeShare && (
            <button
              type="button"
              onClick={() => void handleNativeShare()}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Partager via mon appareil…
            </button>
          )}

          {nativeError && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {nativeError}
            </p>
          )}

          {/* Social Network Links (rendered as anchors, never window.open) */}
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Réseaux sociaux & messageries
            </p>
            <div className="grid grid-cols-2 gap-2">
              {targets.map((target) => (
                <a
                  key={target.id}
                  href={target.href}
                  target={target.external ? '_blank' : undefined}
                  rel={target.external ? 'noopener noreferrer' : undefined}
                  onClick={
                    target.id === 'instagram'
                      ? () => void handleInstagramShare()
                      : undefined
                  }
                  className="inline-flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-700/70"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <SocialNetworkIcon id={target.id} />
                    <span className="truncate">{target.label}</span>
                  </span>
                  {target.external && (
                    <ExternalLink
                      className="h-3 w-3 shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                  )}
                </a>
              ))}
            </div>
            {instagramCopied && (
              <p className="mt-2 rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-[11px] font-medium text-pink-900 dark:border-pink-800/60 dark:bg-pink-950/40 dark:text-pink-200">
                Message et lien copiés ! Collez-les directement dans votre story, publication ou message Instagram.
              </p>
            )}
          </div>

          {/* Direct Link + Invitation Text Copy */}
          <div className="space-y-2.5 border-t border-slate-100 pt-3.5 dark:border-slate-800">
            <div>
              <label
                htmlFor="event-share-link-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Lien direct de l’événement
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="event-share-link-input"
                  type="text"
                  readOnly
                  value={shareContent.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-[40px] flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-700 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    copiedLink
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Copié
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Copier
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleCopyFullMessage()}
              className={`inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                copiedText
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {copiedText ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Message d’invitation copié (prêt pour Instagram, SMS…)
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copier le message d’invitation complet
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {imageLightboxOpen && getSafeEventCoverImageSrc(event.coverImageUrl) && (
        <EventImageLightbox
          src={getSafeEventCoverImageSrc(event.coverImageUrl)!}
          title={event.title}
          onClose={() => setImageLightboxOpen(false)}
        />
      )}
    </div>
  );
}
