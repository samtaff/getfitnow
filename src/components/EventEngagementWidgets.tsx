import { FormEvent, MouseEvent, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  Heart,
  MessageSquare,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import {
  EventRatingSummary,
  EventReview,
  Registration,
  VALIDATION_LIMITS,
} from '../types';
import { formatFrenchDateShort } from '../utils/dateAndValidation';

interface EventLikeButtonProps {
  count: number;
  liked: boolean;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  eventTitle?: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function EventLikeButton({
  count,
  liked,
  loading = false,
  disabled = false,
  compact = false,
  eventTitle,
  onClick,
}: EventLikeButtonProps) {
  const safeCount = Math.max(0, Math.round(count));
  const actionLabel = liked
    ? `Retirer mon j’aime${eventTitle ? ` pour ${eventTitle}` : ''} (${safeCount})`
    : `Aimer cette séance${eventTitle ? ` : ${eventTitle}` : ''} (${safeCount})`;

  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-pressed={liked}
      aria-label={actionLabel}
      title={liked ? 'Retirer mon j’aime' : 'Aimer cette séance'}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-60 ${
        compact
          ? 'min-h-[34px] px-2.5 py-1 text-xs'
          : 'min-h-[38px] px-3 py-1.5 text-xs'
      } ${
        liked
          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800/80 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/50'
          : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:text-rose-300'
      }`}
    >
      <Heart
        className={`h-3.5 w-3.5 shrink-0 transition-transform ${
          liked ? 'fill-current scale-105' : ''
        }`}
        aria-hidden="true"
      />
      {!compact && <span>{liked ? 'Aimé' : 'J’aime'}</span>}
      <span className="font-mono font-semibold tabular-nums">{safeCount}</span>
    </button>
  );
}

interface EventShareButtonProps {
  compact?: boolean;
  eventTitle?: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function EventShareButton({
  compact = false,
  eventTitle,
  onClick,
}: EventShareButtonProps) {
  const label = eventTitle
    ? `Partager l’événement ${eventTitle} sur les réseaux sociaux`
    : 'Partager cet événement sur les réseaux sociaux';

  return (
    <button
      type="button"
      aria-label={label}
      title="Partager sur les réseaux sociaux"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50/70 hover:text-emerald-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300 whitespace-nowrap shrink-0 cursor-pointer ${
        compact ? 'h-[34px] w-[34px]' : 'min-h-[38px] px-3 py-1.5 text-xs'
      }`}
    >
      <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {!compact && <span className="hidden sm:inline">Partager</span>}
    </button>
  );
}

interface EventRatingInlineProps {
  summary?: EventRatingSummary | null;
  className?: string;
}

export function EventRatingInline({
  summary,
  className = '',
}: EventRatingInlineProps) {
  if (!summary || summary.count <= 0) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0 ${className}`}
    >
      <Star
        className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
        aria-hidden="true"
      />
      <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
        {summary.averageRating.toFixed(1)}
      </span>
      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
        ({summary.count} avis)
      </span>
    </span>
  );
}

export function StarRatingDisplay({
  rating,
  size = 'sm',
}: {
  rating: number;
  size?: 'sm' | 'md';
}) {
  const iconClass = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));

  return (
    <div
      className="inline-flex items-center gap-0.5"
      aria-label={`Note : ${clamped} sur 5`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={`${iconClass} ${
            value <= clamped
              ? 'fill-amber-400 text-amber-500'
              : 'text-slate-300 dark:text-slate-600'
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

interface EventReviewComposerProps {
  initialRating?: number;
  initialComment?: string;
  isEditing?: boolean;
  submitting?: boolean;
  errorMsg?: string | null;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onCancel?: () => void;
}

export function EventReviewComposer({
  initialRating = 5,
  initialComment = '',
  isEditing = false,
  submitting = false,
  errorMsg,
  onSubmit,
  onCancel,
}: EventReviewComposerProps) {
  const [rating, setRating] = useState<number>(initialRating || 5);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState<string>(initialComment);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setRating(initialRating || 5);
  }, [initialRating]);

  useEffect(() => {
    setComment(initialComment);
  }, [initialComment]);

  const activeStars = hoveredRating ?? rating;
  const displayedError = localError || errorMsg || null;
  const trimmedLength = comment.trim().length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (
      rating < VALIDATION_LIMITS.REVIEW_RATING_MIN ||
      rating > VALIDATION_LIMITS.REVIEW_RATING_MAX
    ) {
      setLocalError('Veuillez sélectionner une note entre 1 et 5 étoiles.');
      return;
    }
    if (trimmedLength < VALIDATION_LIMITS.REVIEW_COMMENT_MIN) {
      setLocalError(
        `Votre commentaire doit contenir au moins ${VALIDATION_LIMITS.REVIEW_COMMENT_MIN} caractères.`
      );
      return;
    }
    await onSubmit(rating, comment.trim());
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-700 dark:bg-slate-800/60"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          {isEditing ? 'Modifier votre avis' : 'Votre avis sur cette séance'}
        </span>
        <div
          className="inline-flex items-center gap-1"
          role="radiogroup"
          aria-label="Attribuer une note sur 5"
        >
          {[1, 2, 3, 4, 5].map((starValue) => {
            const filled = starValue <= activeStars;
            return (
              <button
                key={starValue}
                type="button"
                role="radio"
                aria-checked={rating === starValue}
                aria-label={`${starValue} étoile${starValue > 1 ? 's' : ''} sur 5`}
                onMouseEnter={() => setHoveredRating(starValue)}
                onMouseLeave={() => setHoveredRating(null)}
                onClick={() => setRating(starValue)}
                className="flex h-9 w-9 items-center justify-center rounded-md transition-transform hover:scale-105 cursor-pointer"
              >
                <Star
                  className={`h-5 w-5 ${
                    filled
                      ? 'fill-amber-400 text-amber-500'
                      : 'text-slate-300 dark:text-slate-600'
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
          <span className="ml-1 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
            {rating}/5
          </span>
        </div>
      </div>

      <div>
        <textarea
          rows={3}
          maxLength={VALIDATION_LIMITS.REVIEW_COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Partagez votre ressenti sur l’intensité, le coaching, l’ambiance..."
          aria-label="Commentaire sur la séance"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Visible publiquement (prénom et initiale uniquement).</span>
          <span className="font-mono tabular-nums">
            {comment.length}/{VALIDATION_LIMITS.REVIEW_COMMENT_MAX}
          </span>
        </div>
      </div>

      {displayedError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400"
            aria-hidden="true"
          />
          <span>{displayedError}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-[38px] rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
        >
          {submitting
            ? 'Publication...'
            : isEditing
              ? 'Mettre à jour mon avis'
              : 'Publier mon avis'}
        </button>
      </div>
    </form>
  );
}

interface EventReviewsSectionProps {
  reviews: EventReview[];
  summary?: EventRatingSummary | null;
  currentUserUid?: string | null;
  isCoach?: boolean;
  eligibleRegistration?: Registration | null;
  myReview?: EventReview | null;
  onSubmitReview?: (
    registration: Registration,
    rating: number,
    comment: string
  ) => Promise<void>;
  onDeleteReview?: (reviewId: string) => Promise<void>;
  emptyMessage?: string;
}

function formatReviewDateLabel(review: EventReview): {
  label: string;
  edited: boolean;
} {
  const createdMs = review.createdAt?.toMillis?.() ?? 0;
  const updatedMs = review.updatedAt?.toMillis?.() ?? createdMs;
  const edited = createdMs > 0 && updatedMs - createdMs > 5000;
  const dateObj =
    (review.updatedAt ?? review.createdAt)?.toDate?.() ?? new Date();
  return {
    label: formatFrenchDateShort(dateObj),
    edited,
  };
}

export function EventReviewsSection({
  reviews,
  summary,
  currentUserUid,
  isCoach = false,
  eligibleRegistration,
  myReview,
  onSubmitReview,
  onDeleteReview,
  emptyMessage = 'Aucun avis publié sur cette séance pour le moment.',
}: EventReviewsSectionProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canCompose = Boolean(eligibleRegistration && onSubmitReview);
  const showComposer = canCompose && (composerOpen || !myReview);

  const handleComposerSubmit = async (rating: number, comment: string) => {
    if (!eligibleRegistration || !onSubmitReview) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmitReview(eligibleRegistration, rating, comment);
      setComposerOpen(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer votre avis pour le moment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!onDeleteReview) return;
    setDeleteError(null);
    setDeletingId(reviewId);
    try {
      await onDeleteReview(reviewId);
      setConfirmDeleteId(null);
      setComposerOpen(false);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Impossible de supprimer cet avis pour le moment.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare
            className="h-4 w-4 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Avis & commentaires des participants
          </h3>
        </div>
        {summary && summary.count > 0 && <EventRatingInline summary={summary} />}
      </div>

      {showComposer && eligibleRegistration && (
        <EventReviewComposer
          initialRating={myReview?.rating ?? 5}
          initialComment={myReview?.comment ?? ''}
          isEditing={Boolean(myReview)}
          submitting={submitting}
          errorMsg={submitError}
          onSubmit={handleComposerSubmit}
          onCancel={myReview ? () => setComposerOpen(false) : undefined}
        />
      )}

      {deleteError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
        >
          {deleteError}
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {emptyMessage}
        </p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {reviews.map((review) => {
            const isAuthor =
              Boolean(currentUserUid) && review.authorUid === currentUserUid;
            const canDelete = Boolean(onDeleteReview) && (isAuthor || isCoach);
            const dateMeta = formatReviewDateLabel(review);
            const isConfirmingDelete = confirmDeleteId === review.id;
            const isDeleting = deletingId === review.id;

            return (
              <div key={review.id} className="space-y-1.5 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {review.authorName}
                      </span>
                      {isAuthor && (
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          · Vous
                        </span>
                      )}
                      <span className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums capitalize">
                        {dateMeta.label}
                        {dateMeta.edited ? ' (modifié)' : ''}
                      </span>
                    </div>
                    <div className="mt-1">
                      <StarRatingDisplay rating={review.rating} />
                    </div>
                  </div>

                  {(isAuthor || canDelete) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAuthor && canCompose && !composerOpen && (
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitError(null);
                            setComposerOpen(true);
                          }}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <Edit3 className="h-3 w-3" aria-hidden="true" />
                          Modifier
                        </button>
                      )}
                      {canDelete && !isConfirmingDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDeleteId(review.id);
                          }}
                          aria-label={`Supprimer l’avis de ${review.authorName}`}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          Supprimer
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line break-words">
                  {review.comment}
                </p>

                {isConfirmingDelete && canDelete && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs dark:border-rose-900 dark:bg-rose-950/50">
                    <span className="text-rose-900 dark:text-rose-200">
                      Confirmer la suppression de cet avis ?
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => void handleDelete(review.id)}
                        className="min-h-[30px] rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                      >
                        {isDeleting ? 'Suppression...' : 'Confirmer'}
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setConfirmDeleteId(null)}
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
      )}
    </div>
  );
}
