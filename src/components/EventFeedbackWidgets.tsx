import { FormEvent, useEffect, useState } from 'react';
import { Heart, MessageSquare, Pencil, Star, Trash2 } from 'lucide-react';
import { EventReview, VALIDATION_LIMITS } from '../types';

export function computeAverageRating(reviews: EventReview[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

interface EventLikeButtonProps {
  likesCount: number;
  isLiked: boolean;
  busy?: boolean;
  compact?: boolean;
  onToggle: () => void;
}

export function EventLikeButton({
  likesCount,
  isLiked,
  busy = false,
  compact = false,
  onToggle,
}: EventLikeButtonProps) {
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={isLiked}
      aria-label={
        isLiked
          ? `Retirer mon J'aime (${likesCount})`
          : `Aimer cet événement (${likesCount})`
      }
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-60 ${
        compact
          ? 'min-h-[32px] px-2.5 py-1 text-xs font-medium'
          : 'min-h-[38px] px-3 py-1.5 text-xs font-semibold'
      } ${
        isLiked
          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/60'
          : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50/60 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300'
      }`}
    >
      <Heart
        className={`h-3.5 w-3.5 shrink-0 ${
          isLiked ? 'fill-rose-600 text-rose-600 dark:fill-rose-400 dark:text-rose-400' : ''
        }`}
        aria-hidden="true"
      />
      {!compact && <span>{isLiked ? 'Aimé' : 'J’aime'}</span>}
      <span className="font-mono tabular-nums">{likesCount}</span>
    </button>
  );
}

export function EventRatingSummaryBadge({
  reviews,
  compact = false,
}: {
  reviews: EventReview[];
  compact?: boolean;
}) {
  const avg = computeAverageRating(reviews);
  if (avg === null) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
      title={`Note moyenne ${avg.toFixed(1)}/5 sur ${reviews.length} avis`}
    >
      <Star
        className="h-3 w-3 fill-amber-500 text-amber-500 shrink-0"
        aria-hidden="true"
      />
      <span className="font-mono font-semibold tabular-nums">
        {avg.toFixed(1)}
      </span>
      <span className="text-amber-800/80 dark:text-amber-300/80">
        ({reviews.length})
      </span>
    </span>
  );
}

interface EventReviewFormProps {
  existingReview?: EventReview | null;
  submitting: boolean;
  deleting?: boolean;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel?: () => void;
}

export function EventReviewForm({
  existingReview,
  submitting,
  deleting = false,
  onSubmit,
  onDelete,
  onCancel,
}: EventReviewFormProps) {
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 5);
  const [comment, setComment] = useState<string>(existingReview?.comment ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setRating(existingReview?.rating ?? 5);
    setComment(existingReview?.comment ?? '');
    setErrorMsg(null);
    setConfirmDelete(false);
  }, [existingReview?.id, existingReview?.rating, existingReview?.comment]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = comment.trim();
    if (rating < 1 || rating > 5) {
      setErrorMsg('Veuillez choisir une note de 1 à 5 étoiles.');
      return;
    }
    if (trimmed.length < VALIDATION_LIMITS.REVIEW_COMMENT_MIN) {
      setErrorMsg(
        `Votre commentaire doit contenir au moins ${VALIDATION_LIMITS.REVIEW_COMMENT_MIN} caractères.`
      );
      return;
    }
    try {
      await onSubmit(rating, trimmed);
    } catch (err) {
      let msg = 'Impossible d’enregistrer votre avis pour le moment.';
      if (err instanceof Error) {
        if (err.message.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(err.message) as { error?: string };
            if (parsed.error?.toLowerCase().includes('permission')) {
              msg =
                'Autorisation refusée. Vérifiez que la séance est bien terminée et que vous y êtes inscrit.';
            } else if (parsed.error) {
              msg = parsed.error;
            }
          } catch {
            msg = err.message;
          }
        } else {
          msg = err.message;
        }
      }
      setErrorMsg(msg);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-800/80 dark:bg-emerald-950/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-900 dark:text-white">
          {existingReview ? 'Modifier mon avis' : 'Donner mon avis sur la séance'}
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Note de la séance">
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= rating;
            return (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
                aria-pressed={rating === star}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-amber-100/70 dark:hover:bg-amber-900/40 cursor-pointer"
              >
                <Star
                  className={`h-4 w-4 ${
                    active
                      ? 'fill-amber-400 text-amber-500'
                      : 'text-slate-300 dark:text-slate-600'
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
          <span className="ml-1 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
            {rating}/5
          </span>
        </div>
      </div>

      <div>
        <textarea
          rows={3}
          required
          minLength={VALIDATION_LIMITS.REVIEW_COMMENT_MIN}
          maxLength={VALIDATION_LIMITS.REVIEW_COMMENT_MAX}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Partagez votre ressenti sur l’ambiance, l’intensité, l’organisation ou l’animateur..."
          aria-label="Votre commentaire sur l’événement"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Minimum {VALIDATION_LIMITS.REVIEW_COMMENT_MIN} caractères</span>
          <span className="font-mono tabular-nums">
            {comment.length}/{VALIDATION_LIMITS.REVIEW_COMMENT_MAX}
          </span>
        </div>
      </div>

      {errorMsg && (
        <p role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-400">
          {errorMsg}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {existingReview && onDelete && !confirmDelete && (
            <button
              type="button"
              disabled={submitting || deleting}
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/50 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Supprimer
            </button>
          )}
          {existingReview && onDelete && confirmDelete && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onDelete()}
                className="min-h-[34px] rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Suppression...' : 'Confirmer'}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="min-h-[34px] rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
              >
                Non
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              disabled={submitting || deleting}
              onClick={onCancel}
              className="min-h-[36px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Annuler
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || deleting}
            className="min-h-[36px] rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
          >
            {submitting
              ? 'Enregistrement...'
              : existingReview
                ? 'Mettre à jour'
                : 'Publier mon avis'}
          </button>
        </div>
      </div>
    </form>
  );
}

interface EventReviewsSectionProps {
  reviews: EventReview[];
  currentUserUid?: string | null;
  canModerate?: boolean;
  canWriteReview: boolean;
  myReview?: EventReview | null;
  onSubmitReview?: (rating: number, comment: string) => Promise<void>;
  onDeleteReview?: (reviewId: string) => Promise<void>;
}

export function EventReviewsSection({
  reviews,
  currentUserUid,
  canModerate = false,
  canWriteReview,
  myReview,
  onSubmitReview,
  onDeleteReview,
}: EventReviewsSectionProps) {
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const avg = computeAverageRating(reviews);

  const handleSave = async (rating: number, comment: string) => {
    if (!onSubmitReview) return;
    setSubmitting(true);
    try {
      await onSubmitReview(rating, comment);
      setEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: string) => {
    if (!onDeleteReview) return;
    setDeletingId(reviewId);
    try {
      await onDeleteReview(reviewId);
      setConfirmDeleteId(null);
      setEditing(false);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Avis & commentaires des participants ({reviews.length})
          </h3>
        </div>
        {avg !== null && <EventRatingSummaryBadge reviews={reviews} />}
      </div>

      {canWriteReview && onSubmitReview && (!myReview || editing) && (
        <EventReviewForm
          existingReview={myReview}
          submitting={submitting}
          deleting={Boolean(myReview && deletingId === myReview.id)}
          onSubmit={handleSave}
          onDelete={
            myReview && onDeleteReview
              ? () => handleDelete(myReview.id)
              : undefined
          }
          onCancel={myReview ? () => setEditing(false) : undefined}
        />
      )}

      {canWriteReview && myReview && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-xs dark:border-emerald-800/80 dark:bg-emerald-950/30">
          <span className="font-medium text-emerald-900 dark:text-emerald-200">
            Vous avez déjà laissé un avis sur cette séance.
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-white cursor-pointer"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Modifier mon avis
          </button>
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3.5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
          {canWriteReview
            ? 'Aucun avis pour le moment. Soyez le premier participant à partager votre ressenti !'
            : 'Aucun avis publié pour cette séance pour le moment.'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {reviews.map((rev) => {
            const isMine = Boolean(currentUserUid && rev.authorUid === currentUserUid);
            const canRemove = Boolean(onDeleteReview && (isMine || canModerate));
            const dateObj = rev.updatedAt?.toDate?.() ?? rev.createdAt?.toDate?.();
            return (
              <li
                key={rev.id}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {rev.authorName}
                    </span>
                    {isMine && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                        Votre avis
                      </span>
                    )}
                    <div
                      className="flex items-center gap-0.5"
                      aria-label={`Note ${rev.rating} sur 5`}
                    >
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-3 w-3 ${
                            s <= rev.rating
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-slate-300 dark:text-slate-600'
                          }`}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {dateObj && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {new Intl.DateTimeFormat('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        }).format(dateObj)}
                      </span>
                    )}
                    {canRemove && confirmDeleteId !== rev.id && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(rev.id)}
                        aria-label={`Supprimer l’avis de ${rev.authorName}`}
                        className="text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                  {rev.comment}
                </p>
                {canRemove && confirmDeleteId === rev.id && (
                  <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-slate-200 pt-2 dark:border-slate-700">
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">
                      Supprimer cet avis ?
                    </span>
                    <button
                      type="button"
                      disabled={deletingId === rev.id}
                      onClick={() => void handleDelete(rev.id)}
                      className="min-h-[28px] rounded bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                    >
                      {deletingId === rev.id ? '...' : 'Oui'}
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === rev.id}
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-[28px] rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                    >
                      Non
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
