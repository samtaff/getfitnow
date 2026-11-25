import { FormEvent, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  MailCheck,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { sendEmailVerification, User } from 'firebase/auth';
import { BOOTSTRAPPED_COACH_EMAIL } from '../firebase';
import { CoachAccessRequest, CoachAccessResolution, VALIDATION_LIMITS } from '../types';
import { submitCoachAccessRequest } from '../services/firestoreService';
import { formatFrenchDateShort } from '../utils/dateAndValidation';
import { EmailPasswordAuthForm } from './EmailPasswordAuthForm';

interface CoachAuthGateProps {
  user: User | null;
  authLoading: boolean;
  isCoach: boolean;
  coachStatus: CoachAccessResolution;
  myAccessRequest: CoachAccessRequest | null;
  authError: string | null;
  onEmailAuthSuccess: (user: User) => void;
  onSignOut: () => void;
  onBackToCalendar: () => void;
}

export function CoachAuthGate({
  user,
  authLoading,
  isCoach,
  coachStatus,
  myAccessRequest,
  authError,
  onEmailAuthSuccess,
  onSignOut,
  onBackToCalendar,
}: CoachAuthGateProps) {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationActionBusy, setVerificationActionBusy] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  useEffect(() => {
    if (myAccessRequest?.displayName) {
      setDisplayName(myAccessRequest.displayName);
      setMessage(myAccessRequest.message || '');
    } else if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user?.displayName, myAccessRequest?.displayName, myAccessRequest?.message]);

  if (authLoading) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 dark:border-slate-700 dark:border-t-slate-100" />
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Vérification de votre session coach...
        </p>
      </section>
    );
  }

  if (user && coachStatus === 'disabled') {
    return (
      <section className="mx-auto max-w-lg px-4 py-10 sm:py-14">
        <div className="rounded-xl border border-rose-200 bg-white p-6 text-center dark:border-rose-900/80 dark:bg-slate-900 sm:p-8">
          <Ban className="mx-auto h-10 w-10 text-rose-600 dark:text-rose-400" aria-hidden="true" />
          <h2 className="mt-3 font-display text-xl font-bold text-slate-900 dark:text-white">
            Compte coach désactivé
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Vous êtes connecté avec <strong>{user.email}</strong>, mais votre accès coach a été désactivé par un coach administrateur.
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Contactez un coach administrateur actif pour réactiver votre compte.
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[44px] rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
            >
              Changer d’identifiants
            </button>
            <button
              type="button"
              onClick={onBackToCalendar}
              className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Retour à l’accueil
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (user && !isCoach) {
    const isUnverifiedBootstrapped =
      Boolean(user.email) &&
      !user.emailVerified &&
      user.email!.trim().toLowerCase() === BOOTSTRAPPED_COACH_EMAIL.toLowerCase();

    if (isUnverifiedBootstrapped) {
      const handleSendVerification = async () => {
        setVerificationError(null);
        setVerificationSent(false);
        setVerificationActionBusy(true);
        try {
          await sendEmailVerification(user);
          setVerificationSent(true);
        } catch (err) {
          setVerificationError(
            err instanceof Error
              ? err.message
              : 'Impossible d’envoyer l’email de vérification.'
          );
        } finally {
          setVerificationActionBusy(false);
        }
      };

      const handleRefreshVerification = async () => {
        setVerificationError(null);
        setVerificationActionBusy(true);
        try {
          await user.reload();
          if (user.emailVerified) {
            onEmailAuthSuccess(user);
          } else {
            setVerificationError(
              'Votre adresse email n’est pas encore marquée comme vérifiée. Cliquez sur le lien reçu par email puis actualisez.'
            );
          }
        } catch (err) {
          setVerificationError(
            err instanceof Error
              ? err.message
              : 'Impossible de vérifier le statut du compte.'
          );
        } finally {
          setVerificationActionBusy(false);
        }
      };

      return (
        <section className="mx-auto max-w-lg px-4 py-10 sm:py-14">
          <div className="rounded-xl border border-amber-200 bg-white p-6 text-center dark:border-amber-900/70 dark:bg-slate-900 sm:p-8">
            <MailCheck className="mx-auto h-10 w-10 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h2 className="mt-3 font-display text-xl font-bold text-slate-900 dark:text-white">
              Vérification d’email requise
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Vous êtes connecté avec l’email administrateur <strong>{user.email}</strong>, mais votre adresse email n’est pas encore vérifiée. Validez votre email via le lien reçu pour activer vos droits administrateur.
            </p>
            {verificationSent && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span>
                  Email de vérification envoyé à <strong>{user.email}</strong>. Ouvrez le lien reçu puis cliquez sur « Actualiser ».
                </span>
              </div>
            )}
            {verificationError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-left text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{verificationError}</span>
              </div>
            )}
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={verificationActionBusy}
                onClick={() => void handleSendVerification()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Renvoyer l’email de vérification
              </button>
              <button
                type="button"
                disabled={verificationActionBusy}
                onClick={() => void handleRefreshVerification()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                J’ai validé mon email — actualiser
              </button>
              <button
                type="button"
                disabled={verificationActionBusy}
                onClick={onSignOut}
                className="min-h-[40px] rounded-lg px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (myAccessRequest?.status === 'pending') {
      return (
        <section className="mx-auto max-w-lg px-4 py-10 sm:py-14">
          <div className="rounded-xl border border-amber-200 bg-white p-6 text-center dark:border-amber-900/70 dark:bg-slate-900 sm:p-8">
            <Clock className="mx-auto h-10 w-10 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <h2 className="mt-3 font-display text-xl font-bold text-slate-900 dark:text-white">
              Demande d’accès envoyée
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Votre demande d’accès coach pour{' '}
              <strong>{user.email}</strong> a bien été transmise aux coachs administrateurs.
            </p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300 space-y-1.5">
              <p>
                <span className="font-semibold text-slate-800 dark:text-slate-100">Nom :</span>{' '}
                {myAccessRequest.displayName}
              </p>
              {myAccessRequest.createdAt && (
                <p>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Envoyée le :</span>{' '}
                  {formatFrenchDateShort(myAccessRequest.createdAt.toDate())}
                </p>
              )}
              {myAccessRequest.message && (
                <p>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Message :</span>{' '}
                  {myAccessRequest.message}
                </p>
              )}
            </div>
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Dès qu’un coach administrateur validera votre demande, votre espace de gestion s’ouvrira automatiquement.
            </p>
            <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Changer d’identifiants
              </button>
              <button
                type="button"
                onClick={onBackToCalendar}
                className="min-h-[44px] rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
              >
                Retour au calendrier
              </button>
            </div>
          </div>
        </section>
      );
    }

    const isRejected = myAccessRequest?.status === 'rejected';

    const handleSubmitRequest = async (e: FormEvent) => {
      e.preventDefault();
      setSubmitError(null);
      setSubmitting(true);
      try {
        await submitCoachAccessRequest({
          user,
          displayName,
          message,
          isResubmission: isRejected,
        });
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : 'Impossible d’envoyer la demande d’accès.'
        );
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <section className="mx-auto max-w-lg px-4 py-10 sm:py-14">
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="text-center">
            <ShieldCheck
              className="mx-auto h-10 w-10 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="mt-3 font-display text-xl font-bold text-slate-900 dark:text-white">
              Demander un accès coach
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Connecté avec <strong>{user.email}</strong>. Envoyez une demande d’accès aux coachs administrateurs pour gérer les séances et le suivi des adhérents.
            </p>
          </div>

          {isRejected && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Votre précédente demande n’a pas été acceptée. Vous pouvez modifier votre message et soumettre une nouvelle demande.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmitRequest} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="req-display-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nom complet *
              </label>
              <input
                id="req-display-name"
                type="text"
                required
                minLength={VALIDATION_LIMITS.DISPLAY_NAME_MIN}
                maxLength={VALIDATION_LIMITS.DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex. Camille Laurent"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="req-message"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Motif ou spécialité (optionnel)
              </label>
              <textarea
                id="req-message"
                rows={3}
                maxLength={VALIDATION_LIMITS.REQUEST_MESSAGE_MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex. Coach CrossFit & HIIT sur Lyon, demande d’accès pour planifier les séances hebdomadaires."
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            {submitError && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                {submitError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting
                ? 'Envoi en cours...'
                : 'Envoyer la demande aux coachs administrateurs'}
            </button>
          </form>

          <div className="mt-5 flex flex-col items-stretch justify-between gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Changer d’identifiants
            </button>
            <button
              type="button"
              onClick={onBackToCalendar}
              className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Retour au calendrier
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          <h2 className="mt-3 font-display text-xl font-bold text-slate-900 dark:text-white">
            Espace Coach
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Connectez-vous avec votre adresse email et votre mot de passe pour accéder à l’espace coach.
          </p>
        </div>

        <div className="mt-6">
          <EmailPasswordAuthForm
            audience="coach"
            externalError={authError}
            onSuccess={onEmailAuthSuccess}
          />
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4 text-center dark:border-slate-800">
          <button
            type="button"
            onClick={onBackToCalendar}
            className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
          >
            Retour à l’accueil adhérent
          </button>
        </div>
      </div>
    </section>
  );
}
