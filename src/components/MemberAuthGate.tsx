import { useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { EmailPasswordAuthForm } from './EmailPasswordAuthForm';

interface MemberAuthGateProps {
  authLoading: boolean;
  authError: string | null;
  onEmailAuthSuccess: (user: User) => void;
  onCoachAccess: () => void;
  onBackToCalendar?: () => void;
}

export function MemberAuthGate({
  authLoading,
  authError,
  onEmailAuthSuccess,
  onCoachAccess,
  onBackToCalendar,
}: MemberAuthGateProps) {
  const [imgError, setImgError] = useState(false);

  if (authLoading) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-12">
        {/* Left: Member Sign-in (Email/Password) */}
        <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-7 lg:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              GetFitNow Event · Espace Adhérent
            </p>
            <h1
              className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl"
              style={{ textWrap: 'balance' }}
            >
              Connectez-vous à votre profil adhérent pour vos inscriptions et votre suivi
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Connectez-vous avec votre adresse email et votre mot de passe personnel, ou créez un compte en quelques secondes.
            </p>

            <div className="mt-5">
              <EmailPasswordAuthForm
                audience="member"
                externalError={authError}
                onSuccess={onEmailAuthSuccess}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                Calendrier & carte
              </span>
              <span className="inline-flex items-center gap-1">
                <ClipboardCheck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                Suivi personnel
              </span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                Gratuit
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onBackToCalendar && (
                <button
                  type="button"
                  onClick={onBackToCalendar}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Retour au calendrier
                </button>
              )}
              <button
                type="button"
                onClick={onCoachAccess}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                Espace coach
              </button>
            </div>
          </div>
        </div>

        {/* Right: Studio Visual & Highlights */}
        <div className="relative min-h-[240px] bg-slate-900 lg:col-span-5">
          {!imgError ? (
            <img
              src="/src/assets/images/studio_athletic_space_1794517510594.jpg"
              alt="Studio sportif GetFitNow Event"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover lg:absolute lg:inset-0"
            />
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-6 text-slate-300">
              <CalendarDays className="h-10 w-10 text-emerald-400" aria-hidden="true" />
              <span className="mt-2 font-display text-lg font-semibold text-white">
                GetFitNow Event
              </span>
            </div>
          )}

          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent"
          />

          <div className="absolute inset-x-0 bottom-0 space-y-2.5 p-5 text-white sm:p-6">
            <p className="font-mono text-xs uppercase tracking-wider text-emerald-300">
              Accès adhérents
            </p>
            <p className="font-display text-lg font-bold">
              Planification, carte interactive & suivi personnel
            </p>
            <ul className="space-y-1.5 text-xs text-slate-200">
              <li className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                Recherche par ville, région et discipline
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                Inscription en ligne jusqu’au début de la séance
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
