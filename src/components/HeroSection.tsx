import { ArrowDownRight } from 'lucide-react';
import { SportEvent } from '../types';

interface HeroSectionProps {
  events: SportEvent[];
  nowMs: number;
  isCoach: boolean;
  coachPhotoUrl?: string | null;
  coachName?: string | null;
  onExploreCalendar: () => void;
  onOpenCoachSpace: () => void;
  onOpenMemberProfile?: () => void;
}

export function HeroSection({
  isCoach,
  onExploreCalendar,
  onOpenCoachSpace,
  onOpenMemberProfile,
}: HeroSectionProps) {
  return (
    <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {/* Hero header content */}
        <div className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 sm:text-sm">
              GetFitNow Event · Coaching sportif collectif et personnalisé
            </p>
            <h1
              className="mt-2 max-w-3xl font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]"
              style={{ textWrap: 'balance' }}
            >
              Réservez vos séances sportives et suivez votre progression
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-4 sm:text-base">
              Consultez le calendrier par ville, région et discipline, visualisez les séances du jour sur la carte et réservez votre place en quelques clics jusqu’au début de la séance.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={onExploreCalendar}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap shrink-0 cursor-pointer sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              Voir le calendrier des séances
              <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={
                isCoach
                  ? onOpenCoachSpace
                  : onOpenMemberProfile || onOpenCoachSpace
              }
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
            >
              {isCoach ? 'Ouvrir le suivi adhérents' : 'Mon suivi & profil'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
