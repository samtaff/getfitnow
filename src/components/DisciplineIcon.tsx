import {
  Bike,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Mountain,
  Music,
  Target,
  Timer,
  Trophy,
  Volleyball,
  Waves,
  Zap,
} from 'lucide-react';
import { DisciplineIconKey, DisciplineItem } from '../types';
import { getDisciplineIconKey } from '../utils/disciplineColors';

interface DisciplineIconProps {
  iconKey?: DisciplineIconKey;
  disciplineName?: string;
  catalog?: DisciplineItem[];
  className?: string;
}

function RunningShoeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 16.5v-4.2c0-.7.4-1.3 1-1.6l1.3-.6c.6-.3 1.3-.1 1.7.4.8 1 2.2 1.3 3.3.6l1.5-.9c.5-.3 1.1-.1 1.4.3l2.2 2.7c.7.8 1.6 1.3 2.7 1.5l1.3.2c1 .2 1.6 1 1.6 1.9v.7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1.5Z" />
      <path d="M3 16h18" />
      <path d="m12.8 11.4 1.3-1" />
      <path d="m14.4 13 1.3-1" />
    </svg>
  );
}

function BoxingGloveIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 17V9.5A4.5 4.5 0 0 1 11.5 5h3A4.5 4.5 0 0 1 19 9.5V13a4 4 0 0 1-4 4H7Z" />
      <path d="M7 12H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2" />
      <path d="M7 17h10v3a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-3Z" />
    </svg>
  );
}

function YogaPoseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="5.5" r="2" />
      <path d="M12 9v5.5" />
      <path d="M6.5 12.5c1.5-1.5 3.4-2.2 5.5-2.2s4 .7 5.5 2.2" />
      <path d="M5 18.5c1.5-2 4-3 7-3s5.5 1 7 3" />
      <path d="M8 18.5h8" />
    </svg>
  );
}

export function DisciplineIcon({
  iconKey,
  disciplineName = '',
  catalog = [],
  className = 'h-3.5 w-3.5',
}: DisciplineIconProps) {
  const resolvedKey =
    iconKey ?? getDisciplineIconKey(disciplineName, catalog);

  switch (resolvedKey) {
    case 'dumbbell':
      return <Dumbbell className={className} aria-hidden="true" />;
    case 'running-shoe':
      return <RunningShoeIcon className={className} />;
    case 'flame':
      return <Flame className={className} aria-hidden="true" />;
    case 'yoga':
      return <YogaPoseIcon className={className} />;
    case 'bike':
      return <Bike className={className} aria-hidden="true" />;
    case 'waves':
      return <Waves className={className} aria-hidden="true" />;
    case 'boxing':
      return <BoxingGloveIcon className={className} />;
    case 'heart-pulse':
      return <HeartPulse className={className} aria-hidden="true" />;
    case 'zap':
      return <Zap className={className} aria-hidden="true" />;
    case 'mountain':
      return <Mountain className={className} aria-hidden="true" />;
    case 'music':
      return <Music className={className} aria-hidden="true" />;
    case 'ball':
      return <Volleyball className={className} aria-hidden="true" />;
    case 'timer':
      return <Timer className={className} aria-hidden="true" />;
    case 'footprints':
      return <Footprints className={className} aria-hidden="true" />;
    case 'trophy':
      return <Trophy className={className} aria-hidden="true" />;
    case 'target':
    default:
      return <Target className={className} aria-hidden="true" />;
  }
}
