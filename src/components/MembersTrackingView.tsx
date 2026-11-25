import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  Download,
  History,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { BOOTSTRAPPED_COACH_EMAIL } from '../firebase';
import {
  CoachAdminUser,
  CoachDirectoryEntry,
  DisciplineItem,
  ExerciseLibraryItem,
  FitnessLevel,
  FollowUpStatus,
  MemberAggregate,
  MemberProfile,
  MemberScheduleSession,
  Registration,
  SportEvent,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';
import {
  assignMemberReferentCoach,
  createManualMember,
  deleteMemberCompletely,
  mergeRegistrationsWithArchivedStats,
  resolveDefaultPrimaryCoach,
  toggleRegistrationAttendance,
  upsertMemberProfile,
} from '../services/firestoreService';
import {
  FITNESS_LEVEL_OPTIONS,
  calculateAgeFromBirthDate,
  exportCsv,
  formatBirthDateFrench,
  formatFitnessLevelLabel,
  formatFrenchDateShort,
  formatFrenchTime,
  toLocalDateInputValue,
} from '../utils/dateAndValidation';
import { PhotoUploadField, ProfileAvatar } from './ProfileAvatar';
import { MemberRegularityChart } from './MemberRegularityChart';
import { MemberBadgesCard } from './MemberBadgesCard';
import { MemberWeeklyScheduleCard } from './MemberWeeklyScheduleCard';
import { computeMemberBadges } from '../utils/memberBadges';

interface MembersTrackingViewProps {
  coachEmail: string;
  currentCoachUid?: string;
  currentCoachName?: string;
  isPrimaryBootstrapped?: boolean;
  coachAdmins?: CoachAdminUser[];
  coachDirectory?: CoachDirectoryEntry[];
  events: SportEvent[];
  registrations: Registration[];
  memberProfiles: MemberProfile[];
  allMemberProfiles?: MemberProfile[];
  memberSchedules?: MemberScheduleSession[];
  trainingPrograms?: TrainingProgram[];
  disciplines?: DisciplineItem[];
  exercises?: ExerciseLibraryItem[];
  nowMs: number;
  unreadMessagesByMemberKey?: Map<string, number>;
  initialSelectedMemberKey?: string | null;
  onConsumeInitialSelectedMemberKey?: () => void;
  onMessageMember?: (member: MemberAggregate) => void;
  onSignOut: () => void;
}

const FOLLOW_UP_LABELS: Record<FollowUpStatus, string> = {
  active: 'Actif',
  to_follow_up: 'À relancer',
  paused: 'En pause',
};

export function MembersTrackingView({
  coachEmail,
  currentCoachUid = '',
  currentCoachName = '',
  isPrimaryBootstrapped = false,
  coachAdmins = [],
  coachDirectory = [],
  events,
  registrations,
  memberProfiles,
  allMemberProfiles,
  memberSchedules = [],
  trainingPrograms = [],
  disciplines = [],
  exercises = [],
  nowMs,
  unreadMessagesByMemberKey,
  initialSelectedMemberKey,
  onConsumeInitialSelectedMemberKey,
  onMessageMember,
  onSignOut,
}: MembersTrackingViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FollowUpStatus>('all');
  const [selectedMemberKey, setSelectedMemberKey] = useState<string | null>(
    null
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const coachIdentitySets = useMemo(() => {
    const emails = new Set<string>([
      BOOTSTRAPPED_COACH_EMAIL.trim().toLowerCase(),
    ]);
    const emailKeys = new Set<string>();
    if (coachEmail.trim()) {
      emails.add(coachEmail.trim().toLowerCase());
    }
    coachAdmins.forEach((a) => {
      if (a.email?.trim()) emails.add(a.email.trim().toLowerCase());
      if (a.emailKey?.trim()) emailKeys.add(a.emailKey.trim());
    });
    return { emails, emailKeys };
  }, [coachAdmins, coachEmail]);

  const defaultPrimaryCoach = useMemo(
    () => resolveDefaultPrimaryCoach(coachDirectory, coachAdmins),
    [coachDirectory, coachAdmins]
  );

  const coachOptions = useMemo(() => {
    const byUid = new Map<
      string,
      { uid: string; displayName: string; isPrimary?: boolean }
    >();
    coachDirectory.forEach((c) => {
      if (!c.active || !c.uid) return;
      byUid.set(c.uid, {
        uid: c.uid,
        displayName: c.displayName || 'Coach GetFitNow',
        isPrimary: c.isPrimary,
      });
    });
    coachAdmins.forEach((a) => {
      if (!a.active || !a.uid || byUid.has(a.uid)) return;
      byUid.set(a.uid, {
        uid: a.uid,
        displayName: a.displayName || a.email || 'Coach GetFitNow',
        isPrimary: a.isPrimary,
      });
    });
    if (currentCoachUid && !byUid.has(currentCoachUid)) {
      byUid.set(currentCoachUid, {
        uid: currentCoachUid,
        displayName: currentCoachName || coachEmail || 'Mon compte coach',
        isPrimary: isPrimaryBootstrapped,
      });
    }
    return Array.from(byUid.values()).sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.displayName.localeCompare(b.displayName, 'fr', {
        sensitivity: 'base',
      });
    });
  }, [
    coachDirectory,
    coachAdmins,
    currentCoachUid,
    currentCoachName,
    coachEmail,
    isPrimaryBootstrapped,
  ]);

  const statsRegistrations = useMemo(
    () =>
      mergeRegistrationsWithArchivedStats(registrations, memberSchedules, {
        events,
      }),
    [registrations, memberSchedules, events]
  );

  // Aggregate coach's own members strictly (David Frosio sees his + unassigned registrants;
  // other coaches ONLY see members explicitly attached to their UID)
  const members = useMemo<MemberAggregate[]>(() => {
    const sourceAllProfiles = allMemberProfiles ?? memberProfiles;
    const reassignedKeys = new Set<string>();
    const reassignedEmails = new Set<string>();
    sourceAllProfiles.forEach((p) => {
      if (p.referentCoachUid && p.referentCoachUid !== currentCoachUid) {
        if (p.emailKey) reassignedKeys.add(p.emailKey);
        if (p.email?.trim()) reassignedEmails.add(p.email.trim().toLowerCase());
      }
    });

    const profileMap = new Map<string, MemberProfile>();
    memberProfiles.forEach((p) => {
      const cleanEmail = (p.email ?? '').trim().toLowerCase();
      if (
        coachIdentitySets.emailKeys.has(p.emailKey) ||
        (cleanEmail && coachIdentitySets.emails.has(cleanEmail))
      ) {
        return;
      }
      const isAttachedToMe = isPrimaryBootstrapped
        ? !p.referentCoachUid || p.referentCoachUid === currentCoachUid
        : p.referentCoachUid === currentCoachUid;
      if (!isAttachedToMe) {
        return;
      }
      profileMap.set(p.emailKey, p);
    });

    const grouped = new Map<string, Registration[]>();
    statsRegistrations.forEach((reg) => {
      if (reg.status !== 'confirmed' && reg.status !== 'cancelled') return;
      const cleanEmail = (reg.email ?? '').trim().toLowerCase();
      if (
        coachIdentitySets.emailKeys.has(reg.emailKey) ||
        (cleanEmail && coachIdentitySets.emails.has(cleanEmail))
      ) {
        return;
      }
      if (!isPrimaryBootstrapped) {
        // Non-primary coaches ONLY match registrations for their already-attached members
        if (!profileMap.has(reg.emailKey)) {
          return;
        }
      } else if (
        reassignedKeys.has(reg.emailKey) ||
        (cleanEmail && reassignedEmails.has(cleanEmail))
      ) {
        return;
      }
      const list = grouped.get(reg.emailKey) ?? [];
      list.push(reg);
      grouped.set(reg.emailKey, list);
    });

    const allKeys = isPrimaryBootstrapped
      ? new Set<string>([...profileMap.keys(), ...grouped.keys()])
      : new Set<string>([...profileMap.keys()]);

    const result: MemberAggregate[] = [];
    allKeys.forEach((key) => {
      const profile = profileMap.get(key) ?? null;
      const regs = (grouped.get(key) ?? []).slice().sort(
        (a, b) => b.eventStartAt.toMillis() - a.eventStartAt.toMillis()
      );
      if (!profile && regs.length === 0) {
        return;
      }
      const liveRegs = regs.filter((r) => !r.isArchivedStat);
      const latestReg = liveRegs[0] ?? regs[0];
      const email = profile?.email || latestReg?.email || '';
      const cleanEmail = email.trim().toLowerCase();
      if (
        coachIdentitySets.emailKeys.has(key) ||
        (cleanEmail && coachIdentitySets.emails.has(cleanEmail))
      ) {
        return;
      }
      const firstName = profile?.firstName || latestReg?.firstName || '';
      const lastName = profile?.lastName || latestReg?.lastName || '';

      const selfCancelledRegs = regs.filter(
        (r) => r.status === 'cancelled' && r.cancelledBy !== 'admin'
      );
      const activeConfirmedRegs = regs.filter(
        (r) => r.status === 'confirmed' && r.cancelledBy !== 'admin'
      );
      const adminRemovedPreservedRegs = regs.filter(
        (r) => r.isArchivedStat && !r.eventCancelled
      );
      const adminCancelledAttendedRegs = regs.filter(
        (r) => r.cancelledBy === 'admin' && !r.isArchivedStat && r.attended
      );

      const pastConfirmedRegs = activeConfirmedRegs.filter(
        (r) => r.eventStartAt.toMillis() <= nowMs
      );
      const liveUpcomingRegs = activeConfirmedRegs.filter(
        (r) => !r.isArchivedStat && r.eventStartAt.toMillis() > nowMs
      );
      const attendedCount = regs.filter((r) => r.attended).length;

      // Self-cancellations count in member stats; admin removals/cancellations leave member stats unchanged
      const totalRegistrations =
        activeConfirmedRegs.filter((r) => !r.isArchivedStat).length +
        selfCancelledRegs.length +
        adminRemovedPreservedRegs.length +
        adminCancelledAttendedRegs.length;

      const pastEffectiveCount =
        pastConfirmedRegs.length +
        selfCancelledRegs.length +
        adminRemovedPreservedRegs.filter(
          (r) => r.eventStartAt.toMillis() <= nowMs
        ).length +
        adminCancelledAttendedRegs.length;

      const attendanceRate =
        pastEffectiveCount > 0
          ? Math.min(100, Math.round((attendedCount / pastEffectiveCount) * 100))
          : null;

      const lastSession =
        [
          ...pastConfirmedRegs,
          ...selfCancelledRegs,
          ...adminRemovedPreservedRegs.filter(
            (r) => r.eventStartAt.toMillis() <= nowMs
          ),
          ...adminCancelledAttendedRegs,
        ].sort((a, b) => b.eventStartAt.toMillis() - a.eventStartAt.toMillis())[0]
          ?.eventStartAt.toDate() ?? null;
      const nextSession =
        liveUpcomingRegs[liveUpcomingRegs.length - 1]?.eventStartAt.toDate() ??
        null;

      result.push({
        emailKey: key,
        email,
        firstName,
        lastName,
        profile,
        registrations: regs,
        totalRegistrations,
        attendedCount,
        pastRegistrationsCount: pastEffectiveCount,
        upcomingRegistrationsCount: liveUpcomingRegs.length,
        attendanceRate,
        lastSessionDate: lastSession,
        nextSessionDate: nextSession,
      });
    });

    return result.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
        'fr'
      )
    );
  }, [
    statsRegistrations,
    memberProfiles,
    allMemberProfiles,
    currentCoachUid,
    isPrimaryBootstrapped,
    coachIdentitySets,
    nowMs,
  ]);

  const existingEmailKeys = useMemo(
    () =>
      new Set(
        (allMemberProfiles ?? memberProfiles).map((m) => m.emailKey)
      ),
    [allMemberProfiles, memberProfiles]
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const currentStatus: FollowUpStatus =
        m.profile?.followUpStatus ?? 'active';
      if (statusFilter !== 'all' && currentStatus !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = `${m.firstName} ${m.lastName} ${m.email} ${m.profile?.goal ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, search, statusFilter]);

  useEffect(() => {
    if (!initialSelectedMemberKey) return;
    setSelectedMemberKey(initialSelectedMemberKey);
    onConsumeInitialSelectedMemberKey?.();
  }, [initialSelectedMemberKey, onConsumeInitialSelectedMemberKey]);

  const selectedMember = useMemo(
    () => members.find((m) => m.emailKey === selectedMemberKey) ?? null,
    [members, selectedMemberKey]
  );

  const selectedMemberAllRegistrations = useMemo(() => {
    if (!selectedMember) return [];
    return statsRegistrations.filter((r) => r.emailKey === selectedMember.emailKey);
  }, [statsRegistrations, selectedMember]);

  const selectedMemberLiveRegistrations = useMemo(() => {
    if (!selectedMember) return [];
    return registrations.filter((r) => r.emailKey === selectedMember.emailKey);
  }, [registrations, selectedMember]);

  const selectedMemberScheduleSessions = useMemo(() => {
    if (!selectedMember) return [];
    const emailLower = selectedMember.email.trim().toLowerCase();
    return memberSchedules.filter(
      (s) =>
        s.memberEmailKey === selectedMember.emailKey ||
        (emailLower && s.memberEmail.trim().toLowerCase() === emailLower)
    );
  }, [memberSchedules, selectedMember]);

  const selectedMemberTrainingPrograms = useMemo(() => {
    if (!selectedMember) return [];
    const emailLower = selectedMember.email.trim().toLowerCase();
    return trainingPrograms.filter(
      (p) =>
        p.memberEmailKey === selectedMember.emailKey ||
        (emailLower && p.memberEmail.trim().toLowerCase() === emailLower)
    );
  }, [trainingPrograms, selectedMember]);

  const stats = useMemo(() => {
    const total = members.length;
    const toFollowUp = members.filter(
      (m) => m.profile?.followUpStatus === 'to_follow_up'
    ).length;
    const withPast = members.filter((m) => m.attendanceRate !== null);
    const avgAttendance =
      withPast.length > 0
        ? Math.round(
            withPast.reduce((sum, m) => sum + (m.attendanceRate ?? 0), 0) /
              withPast.length
          )
        : null;
    const upcomingTotal = members.reduce(
      (sum, m) => sum + m.upcomingRegistrationsCount,
      0
    );
    return { total, toFollowUp, avgAttendance, upcomingTotal };
  }, [members]);

  const handleDeleteMember = async (member: MemberAggregate) => {
    setFeedback(null);
    setDeletingKey(member.emailKey);
    try {
      await deleteMemberCompletely({
        emailKey: member.emailKey,
        email: member.email,
        registrations,
        events,
        coachUid: currentCoachUid,
        isPrimaryBootstrapped,
      });
      if (selectedMemberKey === member.emailKey) {
        setSelectedMemberKey(null);
      }
      setConfirmDeleteKey(null);
      setFeedback({
        type: 'success',
        text: `Toutes les informations de l’adhérent ${member.firstName} ${member.lastName} ont été supprimées de la base de données. Il pourra se réinscrire ultérieurement.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer cet adhérent.',
      });
    } finally {
      setDeletingKey(null);
    }
  };

  const handleExportMembers = () => {
    exportCsv(
      'suivi-adherents.csv',
      [
        'Nom',
        'Prénom',
        'Email',
        'Téléphone',
        'Date de naissance',
        'Âge',
        'Niveau sportif',
        'Statut suivi',
        'Objectif',
        'Total séances',
        'Présences',
        'Notes',
      ],
      filteredMembers.map((m) => {
        const age = calculateAgeFromBirthDate(m.profile?.birthDate);
        return [
          m.lastName,
          m.firstName,
          m.email,
          m.profile?.phone ?? '',
          formatBirthDateFrench(m.profile?.birthDate),
          age !== null ? `${age} ans` : '',
          formatFitnessLevelLabel(m.profile?.fitnessLevel),
          FOLLOW_UP_LABELS[m.profile?.followUpStatus ?? 'active'],
          m.profile?.goal ?? '',
          String(m.totalRegistrations),
          String(m.attendedCount),
          m.profile?.notes ?? '',
        ];
      })
    );
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Suivi des adhérents
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Vos adhérents rattachés ({currentCoachName || coachEmail}) · Ajoutez, suivez ou réaffectez un adhérent à un coach.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un adhérent
          </button>

          <button
            type="button"
            onClick={handleExportMembers}
            disabled={filteredMembers.length === 0}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exporter CSV
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Déconnexion
          </button>
        </div>
      </div>

      {/* 4-Column Summary Strip */}
      <div className="mt-6 grid grid-cols-2 divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Adhérents enregistrés
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {stats.total}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Réservations à venir
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {stats.upcomingTotal}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Assiduité moyenne
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {stats.avgAttendance !== null ? `${stats.avgAttendance}%` : '—'}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Profils à relancer
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
            {stats.toFollowUp}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-5 rounded-xl border p-3.5 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Search + Status Filter */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Filtrer par statut de suivi"
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
        >
          {(
            [
              { id: 'all', label: 'Tous' },
              { id: 'active', label: 'Actifs' },
              { id: 'to_follow_up', label: 'À relancer' },
              { id: 'paused', label: 'En pause' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[32px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom, email, objectif..."
            aria-label="Rechercher un adhérent"
            className="min-h-[40px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          />
        </div>
      </div>

      {/* Members Table / Mobile Cards */}
      {filteredMembers.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center sm:p-12">
          <UserCheck className="mx-auto h-9 w-9 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <h3 className="mt-3 font-display text-base font-bold text-slate-900 dark:text-white">
            Aucun adhérent trouvé
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ajoutez un adhérent manuellement ou attendez qu’un participant s’inscrive à une séance via le calendrier.
          </p>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Ajouter un adhérent
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Member Cards (< md) */}
          <div className="mt-5 space-y-3 md:hidden">
            {filteredMembers.map((member) => {
              const followStatus: FollowUpStatus =
                member.profile?.followUpStatus ?? 'active';
              const memberAge = calculateAgeFromBirthDate(member.profile?.birthDate);
              const memberLevelShort = formatFitnessLevelLabel(
                member.profile?.fitnessLevel,
                true
              );

              return (
                <div
                  key={member.emailKey}
                  onClick={() => setSelectedMemberKey(member.emailKey)}
                  className="cursor-pointer rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 active:bg-slate-50 dark:active:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <ProfileAvatar
                        name={`${member.firstName} ${member.lastName}`}
                        photoUrl={member.profile?.photoUrl}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                          {member.firstName} {member.lastName}
                          {memberAge !== null && (
                            <span className="ml-1.5 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                              · {memberAge} ans
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        followStatus === 'active'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : followStatus === 'to_follow_up'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {FOLLOW_UP_LABELS[followStatus]}
                    </span>
                  </div>

                  {(memberLevelShort || member.profile?.goal) && (
                    <div className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {memberLevelShort && (
                        <p className="font-medium text-emerald-700 dark:text-emerald-400">
                          Niveau : {memberLevelShort}
                        </p>
                      )}
                      {member.profile?.goal && (
                        <p className="truncate">
                          Objectif : {member.profile.goal}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-mono tabular-nums">
                      {member.totalRegistrations} séances · {member.attendedCount}{' '}
                      prés.
                      {member.attendanceRate !== null &&
                        ` (${member.attendanceRate}%)`}
                    </span>

                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onMessageMember && member.email && (
                        <button
                          type="button"
                          onClick={() => onMessageMember(member)}
                          aria-label={`Envoyer un message à ${member.firstName} ${member.lastName}`}
                          className="relative inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 cursor-pointer"
                        >
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Message</span>
                          {(unreadMessagesByMemberKey?.get(member.emailKey) ?? 0) > 0 && (
                            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                              {unreadMessagesByMemberKey?.get(member.emailKey)}
                            </span>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedMemberKey(member.emailKey)}
                        className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                      >
                        Fiche
                      </button>

                      {confirmDeleteKey === member.emailKey ? (
                        <>
                          <button
                            type="button"
                            disabled={deletingKey === member.emailKey}
                            onClick={() => void handleDeleteMember(member)}
                            className="min-h-[38px] rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                          >
                            Suppr.
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(null)}
                            className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Non
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(member.emailKey)}
                          aria-label={`Supprimer ${member.firstName} ${member.lastName}`}
                          className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="mt-5 hidden overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3.5">Adhérent</th>
                    <th className="px-4 py-3.5">Âge & Niveau</th>
                    <th className="px-4 py-3.5">Objectif</th>
                    <th className="px-4 py-3.5 text-right">Réservations</th>
                    <th className="px-4 py-3.5 text-right">Présences</th>
                    <th className="px-4 py-3.5">Prochaine / Dernière séance</th>
                    <th className="px-4 py-3.5">Suivi</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredMembers.map((member) => {
                    const followStatus: FollowUpStatus =
                      member.profile?.followUpStatus ?? 'active';
                    const memberAge = calculateAgeFromBirthDate(
                      member.profile?.birthDate
                    );
                    const memberLevelShort = formatFitnessLevelLabel(
                      member.profile?.fitnessLevel,
                      true
                    );

                    return (
                      <tr
                        key={member.emailKey}
                        onClick={() => setSelectedMemberKey(member.emailKey)}
                        className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <ProfileAvatar
                              name={`${member.firstName} ${member.lastName}`}
                              photoUrl={member.profile?.photoUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {member.firstName} {member.lastName}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <div className="space-y-0.5">
                            <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                              {memberAge !== null ? `${memberAge} ans` : 'Âge —'}
                            </p>
                            <p className="text-slate-600 dark:text-slate-300">
                              {memberLevelShort || 'Niveau non renseigné'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300 max-w-[180px] truncate">
                          {member.profile?.goal || 'Non renseigné'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {member.totalRegistrations}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {member.attendedCount}
                          {member.attendanceRate !== null && (
                            <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                              ({member.attendanceRate}%)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                          {member.nextSessionDate ? (
                            <span className="font-medium text-emerald-700 dark:text-emerald-400 capitalize">
                              À venir : {formatFrenchDateShort(member.nextSessionDate)}
                            </span>
                          ) : member.lastSessionDate ? (
                            <span className="capitalize">
                              Dernière : {formatFrenchDateShort(member.lastSessionDate)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`text-xs font-semibold ${
                              followStatus === 'active'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : followStatus === 'to_follow_up'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {FOLLOW_UP_LABELS[followStatus]}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            {onMessageMember && member.email && (
                              <button
                                type="button"
                                onClick={() => onMessageMember(member)}
                                title={`Envoyer un message à ${member.firstName} ${member.lastName}`}
                                aria-label={`Envoyer un message à ${member.firstName} ${member.lastName}`}
                                className="relative inline-flex h-[34px] items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300 cursor-pointer"
                              >
                                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                                {(unreadMessagesByMemberKey?.get(member.emailKey) ?? 0) > 0 && (
                                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                                    {unreadMessagesByMemberKey?.get(member.emailKey)}
                                  </span>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedMemberKey(member.emailKey)}
                              className="min-h-[34px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Ouvrir
                            </button>

                            {confirmDeleteKey === member.emailKey ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={deletingKey === member.emailKey}
                                  onClick={() => void handleDeleteMember(member)}
                                  className="min-h-[34px] rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                                >
                                  Suppr.
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(null)}
                                  className="min-h-[34px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                                >
                                  Non
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(member.emailKey)}
                                title="Supprimer cet adhérent"
                                aria-label={`Supprimer ${member.firstName} ${member.lastName}`}
                                className="flex h-[34px] w-[34px] items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <AddMemberModal
          existingEmailKeys={existingEmailKeys}
          coachEmails={coachIdentitySets.emails}
          coachOptions={coachOptions}
          currentCoachUid={currentCoachUid}
          currentCoachName={currentCoachName || coachEmail}
          defaultPrimaryCoach={defaultPrimaryCoach}
          onClose={() => setIsAddModalOpen(false)}
          onCreated={(emailKey, fullName, referentCoachUid, referentCoachName) => {
            setIsAddModalOpen(false);
            const belongsToMe =
              referentCoachUid === currentCoachUid ||
              (isPrimaryBootstrapped && !referentCoachUid);
            if (belongsToMe) {
              setSelectedMemberKey(emailKey);
              setFeedback({
                type: 'success',
                text: `L’adhérent ${fullName} a été ajouté et rattaché à votre suivi.`,
              });
            } else {
              setFeedback({
                type: 'success',
                text: `L’adhérent ${fullName} a été créé et rattaché à ${referentCoachName}.`,
              });
            }
          }}
        />
      )}

      {/* Member Detail & Coaching Follow-up Drawer */}
      {selectedMember && (
        <MemberDetailDrawer
          key={selectedMember.emailKey}
          member={selectedMember}
          allRegistrations={selectedMemberAllRegistrations}
          liveRegistrations={selectedMemberLiveRegistrations}
          memberScheduleSessions={selectedMemberScheduleSessions}
          memberTrainingPrograms={selectedMemberTrainingPrograms}
          currentCoachUid={currentCoachUid}
          currentCoachName={currentCoachName}
          isPrimaryBootstrapped={isPrimaryBootstrapped}
          coachDirectory={coachDirectory}
          coachOptions={coachOptions}
          defaultPrimaryCoach={defaultPrimaryCoach}
          events={events}
          disciplines={disciplines}
          exercises={exercises}
          nowMs={nowMs}
          unreadMessagesCount={
            unreadMessagesByMemberKey?.get(selectedMember.emailKey) ?? 0
          }
          onMessageMember={
            onMessageMember && selectedMember.email
              ? () => {
                  const target = selectedMember;
                  setSelectedMemberKey(null);
                  onMessageMember(target);
                }
              : undefined
          }
          onMemberReassigned={(targetMember, nextCoachUid, nextCoachName) => {
            if (nextCoachUid !== currentCoachUid) {
              setSelectedMemberKey(null);
              setFeedback({
                type: 'success',
                text: `${targetMember.firstName} ${targetMember.lastName} est désormais rattaché(e) à ${nextCoachName}.`,
              });
            }
          }}
          deleting={deletingKey === selectedMember.emailKey}
          onDelete={() => void handleDeleteMember(selectedMember)}
          onClose={() => setSelectedMemberKey(null)}
        />
      )}
    </section>
  );
}

interface CoachOptionItem {
  uid: string;
  displayName: string;
  isPrimary?: boolean;
}

interface AddMemberModalProps {
  existingEmailKeys: Set<string>;
  coachEmails: Set<string>;
  coachOptions: CoachOptionItem[];
  currentCoachUid: string;
  currentCoachName: string;
  defaultPrimaryCoach: { uid: string; displayName: string };
  onClose: () => void;
  onCreated: (
    emailKey: string,
    fullName: string,
    referentCoachUid: string,
    referentCoachName: string
  ) => void;
}

function AddMemberModal({
  existingEmailKeys,
  coachEmails,
  coachOptions,
  currentCoachUid,
  currentCoachName,
  defaultPrimaryCoach,
  onClose,
  onCreated,
}: AddMemberModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel | ''>('');
  const [goal, setGoal] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpStatus>('active');
  const [referentCoachUid, setReferentCoachUid] = useState(
    currentCoachUid || defaultPrimaryCoach.uid || coachOptions[0]?.uid || ''
  );
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayIso = useMemo(() => toLocalDateInputValue(new Date()), []);
  const computedAge = useMemo(
    () => calculateAgeFromBirthDate(birthDate),
    [birthDate]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && coachEmails.has(cleanEmail)) {
      setError(
        'Cette adresse email appartient à un coach de l’application. Les coachs sont gérés séparément dans l’onglet Coachs.'
      );
      return;
    }
    const chosenUid = (
      referentCoachUid ||
      currentCoachUid ||
      defaultPrimaryCoach.uid
    ).trim();
    const chosenOption = coachOptions.find((c) => c.uid === chosenUid);
    const chosenName =
      chosenOption?.displayName ||
      (chosenUid === currentCoachUid ? currentCoachName : '') ||
      defaultPrimaryCoach.displayName ||
      'David Frosio';

    setSaving(true);
    try {
      const emailKey = await createManualMember({
        firstName,
        lastName,
        email,
        phone,
        goal,
        birthDate,
        fitnessLevel,
        notes,
        followUpStatus,
        photoUrl,
        referentCoachUid: chosenUid,
        referentCoachName: chosenName,
        existingEmailKeys,
      });
      onCreated(
        emailKey,
        `${firstName.trim()} ${lastName.trim()}`,
        chosenUid,
        chosenName
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’ajouter cet adhérent.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 dark:bg-slate-950/75 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-4 sm:p-6">
          <div>
            <h2
              id="add-member-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl"
            >
              Ajouter un adhérent
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Créez manuellement une fiche adhérent dans votre suivi coaching.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6"
        >
          <PhotoUploadField
            label="Photo de profil de l’adhérent"
            name={`${firstName} ${lastName}`.trim() || 'Adhérent'}
            photoUrl={photoUrl}
            onChange={setPhotoUrl}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="add-member-firstname"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Prénom *
              </label>
              <input
                id="add-member-firstname"
                type="text"
                required
                minLength={VALIDATION_LIMITS.FIRST_NAME_MIN}
                maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ex. Camille"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="add-member-lastname"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nom *
              </label>
              <input
                id="add-member-lastname"
                type="text"
                required
                minLength={VALIDATION_LIMITS.LAST_NAME_MIN}
                maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ex. Durand"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="add-member-email"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Adresse email *
            </label>
            <input
              id="add-member-email"
              type="email"
              required
              maxLength={VALIDATION_LIMITS.EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="camille.durand@exemple.fr"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="add-member-phone"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Téléphone
              </label>
              <input
                id="add-member-phone"
                type="tel"
                maxLength={VALIDATION_LIMITS.PHONE_MAX}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="add-member-status"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Statut de suivi
              </label>
              <select
                id="add-member-status"
                value={followUpStatus}
                onChange={(e) =>
                  setFollowUpStatus(e.target.value as FollowUpStatus)
                }
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="active">Actif</option>
                <option value="to_follow_up">À relancer</option>
                <option value="paused">En pause</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <label
                htmlFor="add-member-birthdate"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Date de naissance
              </label>
              <input
                id="add-member-birthdate"
                type="date"
                min="1900-01-01"
                max={todayIso}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="sm:col-span-4">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Âge (auto)
              </span>
              <div className="mt-1 flex min-h-[44px] items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {computedAge !== null ? `${computedAge} ans` : '—'}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="add-member-fitness-level"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Niveau sportif
            </label>
            <select
              id="add-member-fitness-level"
              value={fitnessLevel}
              onChange={(e) =>
                setFitnessLevel(e.target.value as FitnessLevel | '')
              }
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="">Sélectionner un niveau</option>
              {FITNESS_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="add-member-goal"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Objectif sportif
            </label>
            <input
              id="add-member-goal"
              type="text"
              maxLength={VALIDATION_LIMITS.GOAL_MAX}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ex. Remise en forme, endurance..."
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="add-member-referent-coach"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Coach référent (rattachement)
            </label>
            <select
              id="add-member-referent-coach"
              value={referentCoachUid}
              onChange={(e) => setReferentCoachUid(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
            >
              {coachOptions.map((c) => (
                <option key={c.uid} value={c.uid}>
                  {c.displayName}
                  {c.isPrimary ? ' (Administrateur)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Seul le coach référent choisi pourra voir et gérer cet adhérent dans son espace.
            </p>
          </div>

          <div>
            <label
              htmlFor="add-member-notes"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Notes de coaching
            </label>
            <textarea
              id="add-member-notes"
              rows={3}
              maxLength={VALIDATION_LIMITS.NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Antécédents, préférences, disponibilités..."
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Création...' : 'Créer la fiche adhérent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface MemberDetailDrawerProps {
  member: MemberAggregate;
  allRegistrations: Registration[];
  liveRegistrations: Registration[];
  memberScheduleSessions: MemberScheduleSession[];
  memberTrainingPrograms: TrainingProgram[];
  currentCoachUid: string;
  currentCoachName: string;
  isPrimaryBootstrapped: boolean;
  coachDirectory: CoachDirectoryEntry[];
  coachOptions: CoachOptionItem[];
  defaultPrimaryCoach: { uid: string; displayName: string };
  events: SportEvent[];
  disciplines: DisciplineItem[];
  exercises?: ExerciseLibraryItem[];
  nowMs: number;
  unreadMessagesCount?: number;
  onMessageMember?: () => void;
  onMemberReassigned?: (
    member: MemberAggregate,
    nextCoachUid: string,
    nextCoachName: string
  ) => void;
  deleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}

function MemberDetailDrawer({
  member,
  allRegistrations,
  liveRegistrations,
  memberScheduleSessions,
  memberTrainingPrograms,
  currentCoachUid,
  currentCoachName,
  isPrimaryBootstrapped,
  coachDirectory,
  coachOptions,
  defaultPrimaryCoach,
  events,
  disciplines,
  exercises = [],
  nowMs,
  unreadMessagesCount = 0,
  onMessageMember,
  onMemberReassigned,
  deleting,
  onDelete,
  onClose,
}: MemberDetailDrawerProps) {
  const [firstName, setFirstName] = useState(member.firstName);
  const [lastName, setLastName] = useState(member.lastName);
  const [phone, setPhone] = useState(member.profile?.phone ?? '');
  const [birthDate, setBirthDate] = useState(member.profile?.birthDate ?? '');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel | ''>(
    member.profile?.fitnessLevel ?? ''
  );
  const [goal, setGoal] = useState(member.profile?.goal ?? '');
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpStatus>(
    member.profile?.followUpStatus ?? 'active'
  );
  const [notes, setNotes] = useState(member.profile?.notes ?? '');
  const [photoUrl, setPhotoUrl] = useState(member.profile?.photoUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedReferentUid, setSelectedReferentUid] = useState(
    member.profile?.referentCoachUid ||
      defaultPrimaryCoach.uid ||
      currentCoachUid
  );
  const [reassignSaving, setReassignSaving] = useState(false);
  const [reassignFeedback, setReassignFeedback] = useState<string | null>(null);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    setFirstName(member.firstName);
    setLastName(member.lastName);
    setPhone(member.profile?.phone ?? '');
    setBirthDate(member.profile?.birthDate ?? '');
    setFitnessLevel(member.profile?.fitnessLevel ?? '');
    setGoal(member.profile?.goal ?? '');
    setFollowUpStatus(member.profile?.followUpStatus ?? 'active');
    setNotes(member.profile?.notes ?? '');
    setPhotoUrl(member.profile?.photoUrl ?? '');
    setSelectedReferentUid(
      member.profile?.referentCoachUid ||
        defaultPrimaryCoach.uid ||
        currentCoachUid
    );
    setReassignFeedback(null);
    setReassignError(null);
  }, [
    member.emailKey,
    member.firstName,
    member.lastName,
    member.profile?.phone,
    member.profile?.birthDate,
    member.profile?.fitnessLevel,
    member.profile?.goal,
    member.profile?.followUpStatus,
    member.profile?.notes,
    member.profile?.photoUrl,
    member.profile?.referentCoachUid,
    defaultPrimaryCoach.uid,
    currentCoachUid,
  ]);

  const todayIso = useMemo(() => toLocalDateInputValue(new Date()), []);
  const computedAge = useMemo(
    () => calculateAgeFromBirthDate(birthDate),
    [birthDate]
  );
  const headerLevelLabel = useMemo(
    () => formatFitnessLevelLabel(fitnessLevel, true),
    [fitnessLevel]
  );
  const memberBadgesSummary = useMemo(
    () =>
      computeMemberBadges({
        registrations: allRegistrations,
        events,
        disciplines,
        memberEmail: member.email,
        nowMs,
      }),
    [allRegistrations, events, disciplines, member.email, nowMs]
  );

  const currentReferentName = useMemo(() => {
    const uid = member.profile?.referentCoachUid;
    if (uid) {
      const matched = coachOptions.find((c) => c.uid === uid);
      if (matched) return matched.displayName;
      if (member.profile?.referentCoachName) {
        return member.profile.referentCoachName;
      }
    }
    return defaultPrimaryCoach.displayName || 'David Frosio';
  }, [
    member.profile?.referentCoachUid,
    member.profile?.referentCoachName,
    coachOptions,
    defaultPrimaryCoach.displayName,
  ]);

  const handleAssignReferentCoach = async () => {
    const targetOption = coachOptions.find((c) => c.uid === selectedReferentUid);
    const nextUid = (selectedReferentUid || defaultPrimaryCoach.uid).trim();
    const nextName =
      targetOption?.displayName ||
      defaultPrimaryCoach.displayName ||
      'David Frosio';
    if (!nextUid) {
      setReassignError('Sélectionnez un coach référent valide.');
      return;
    }
    setReassignSaving(true);
    setReassignFeedback(null);
    setReassignError(null);
    try {
      await assignMemberReferentCoach({
        emailKey: member.emailKey,
        email: member.email,
        firstName: firstName.trim() || member.firstName,
        lastName: lastName.trim() || member.lastName,
        existingProfile: member.profile,
        coachUid: nextUid,
        coachName: nextName,
      });
      setReassignFeedback(`Rattaché(e) à ${nextName}.`);
      onMemberReassigned?.(member, nextUid, nextName);
    } catch (err) {
      setReassignError(
        err instanceof Error
          ? err.message
          : 'Impossible de modifier le coach référent.'
      );
    } finally {
      setReassignSaving(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    setSaveError(null);
    try {
      await upsertMemberProfile({
        emailKey: member.emailKey,
        email: member.email,
        firstName: firstName.trim() || member.firstName,
        lastName: lastName.trim() || member.lastName,
        phone,
        goal,
        birthDate,
        fitnessLevel,
        notes,
        followUpStatus,
        photoUrl,
        referentCoachUid:
          member.profile?.referentCoachUid ||
          defaultPrimaryCoach.uid ||
          currentCoachUid,
        referentCoachName:
          member.profile?.referentCoachName ||
          defaultPrimaryCoach.displayName ||
          'David Frosio',
        exists: Boolean(member.profile),
      });
      setSavedNotice(true);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer la fiche de suivi.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-drawer-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 dark:bg-slate-950/75 backdrop-blur-xs sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        className="flex h-[92dvh] w-full max-w-xl flex-col rounded-t-2xl border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl sm:h-full sm:rounded-none sm:border-t-0 sm:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex items-center gap-3.5 min-w-0">
            <ProfileAvatar
              name={`${member.firstName} ${member.lastName}`}
              photoUrl={photoUrl}
              size="lg"
            />
            <div className="min-w-0">
              <h2
                id="member-drawer-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl truncate"
              >
                {member.firstName} {member.lastName}
              </h2>
              <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                {member.email}
                {computedAge !== null ? ` · ${computedAge} ans` : ''}
                {headerLevelLabel ? ` · ${headerLevelLabel}` : ''}
              </p>
              <p className="mt-1.5 font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                {member.totalRegistrations} séance
                {member.totalRegistrations > 1 ? 's' : ''} réservée
                {member.totalRegistrations > 1 ? 's' : ''} · {member.attendedCount}{' '}
                présence{member.attendedCount > 1 ? 's' : ''} confirmée
                {member.attendedCount > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fiche adhérent"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6">
          {onMessageMember && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-800/80 dark:bg-emerald-950/35">
              <div className="text-xs text-emerald-950 dark:text-emerald-100">
                <p className="font-semibold">
                  Échanger en direct avec {member.firstName}
                </p>
                <p className="text-emerald-800/85 dark:text-emerald-200/80">
                  Posez vos questions de suivi ou partagez des consignes.
                </p>
              </div>
              <button
                type="button"
                onClick={onMessageMember}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Envoyer un message</span>
                {unreadMessagesCount > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums">
                    {unreadMessagesCount}
                  </span>
                )}
              </button>
            </div>
          )}
          {/* Referent Coach Assignment Card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <p className="font-bold text-slate-900 dark:text-white">
                  Coach référent &amp; rattachement
                </p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  Actuellement rattaché à{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {currentReferentName}
                  </span>
                </p>
              </div>
            </div>

            {coachOptions.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  aria-label="Choisir le coach référent pour cet adhérent"
                  value={selectedReferentUid}
                  onChange={(e) => {
                    setSelectedReferentUid(e.target.value);
                    setReassignFeedback(null);
                    setReassignError(null);
                  }}
                  className="min-h-[38px] flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-slate-100"
                >
                  {coachOptions.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.displayName}
                      {c.isPrimary ? ' (Administrateur)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    reassignSaving ||
                    !selectedReferentUid ||
                    (Boolean(member.profile?.referentCoachUid) &&
                      selectedReferentUid === member.profile?.referentCoachUid)
                  }
                  onClick={() => void handleAssignReferentCoach()}
                  className="min-h-[38px] shrink-0 rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 cursor-pointer"
                >
                  {reassignSaving
                    ? 'Rattachement...'
                    : 'Rattacher à ce coach'}
                </button>
              </div>
            )}

            {reassignFeedback && (
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {reassignFeedback}
              </p>
            )}
            {reassignError && (
              <p className="text-xs text-rose-700 dark:text-rose-300">
                {reassignError}
              </p>
            )}
          </div>

          {/* Coaching Profile Form */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
            <div
              className={`flex items-start justify-between gap-3 ${
                profileExpanded
                  ? 'border-b border-slate-100 pb-3.5 dark:border-slate-800'
                  : ''
              }`}
            >
              <button
                type="button"
                onClick={() => setProfileExpanded((prev) => !prev)}
                aria-expanded={profileExpanded}
                aria-controls="member-drawer-profile-form"
                className="flex flex-1 items-start gap-3 text-left min-w-0 cursor-pointer"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Informations & suivi du coach
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                    Statut : {FOLLOW_UP_LABELS[followUpStatus]}
                    {headerLevelLabel ? ` · ${headerLevelLabel}` : ''}
                    {goal.trim() ? ` · ${goal.trim()}` : ''}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProfileExpanded((prev) => !prev)}
                aria-expanded={profileExpanded}
                aria-controls="member-drawer-profile-form"
                aria-label={
                  profileExpanded
                    ? 'Replier les informations et le suivi du coach'
                    : 'Déplier les informations et le suivi du coach'
                }
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    profileExpanded ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>
            </div>

            {profileExpanded && (
              <form
                id="member-drawer-profile-form"
                onSubmit={handleSave}
                className="mt-4 space-y-4"
              >

            <PhotoUploadField
              label="Photo de profil de l’adhérent"
              name={`${firstName} ${lastName}`.trim() || member.email}
              photoUrl={photoUrl}
              onChange={setPhotoUrl}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="member-firstname"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Prénom *
                </label>
                <input
                  id="member-firstname"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.FIRST_NAME_MIN}
                  maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="member-lastname"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Nom *
                </label>
                <input
                  id="member-lastname"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.LAST_NAME_MIN}
                  maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="member-status"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Statut de suivi
                </label>
                <select
                  id="member-status"
                  value={followUpStatus}
                  onChange={(e) =>
                    setFollowUpStatus(e.target.value as FollowUpStatus)
                  }
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="active">Actif</option>
                  <option value="to_follow_up">À relancer</option>
                  <option value="paused">En pause</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="member-phone"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Téléphone
                </label>
                <input
                  id="member-phone"
                  type="tel"
                  maxLength={VALIDATION_LIMITS.PHONE_MAX}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="06 12 34 56 78"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-8">
                <label
                  htmlFor="member-birthdate"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Date de naissance
                </label>
                <input
                  id="member-birthdate"
                  type="date"
                  min="1900-01-01"
                  max={todayIso}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-4">
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Âge (auto)
                </span>
                <div className="mt-1 flex min-h-[44px] items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {computedAge !== null ? `${computedAge} ans` : '—'}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="member-fitness-level"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Niveau sportif
              </label>
              <select
                id="member-fitness-level"
                value={fitnessLevel}
                onChange={(e) =>
                  setFitnessLevel(e.target.value as FitnessLevel | '')
                }
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="">Non renseigné</option>
                {FITNESS_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="member-goal"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Objectif sportif
              </label>
              <input
                id="member-goal"
                type="text"
                maxLength={VALIDATION_LIMITS.GOAL_MAX}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Ex. Remise en forme, préparation semi-marathon..."
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="member-notes"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Notes de séance, antécédents & progression
              </label>
              <textarea
                id="member-notes"
                rows={4}
                maxLength={VALIDATION_LIMITS.NOTES_MAX}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Genou gauche sensible, progresse vite sur les kettlebells..."
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {saveError && (
              <p className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-800 dark:text-rose-200">
                {saveError}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              {savedNotice ? (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Fiche de suivi enregistrée.
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-60 cursor-pointer"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer le suivi'}
              </button>
            </div>
              </form>
            )}
          </div>

          {/* Weekly Personal Schedule + Regularity Pie Chart + Badges + History */}
          <div className="space-y-4">
            {member.email && currentCoachUid && (
              <MemberWeeklyScheduleCard
                mode="coach"
                memberEmail={member.email}
                memberName={`${member.firstName} ${member.lastName}`.trim() || member.email}
                memberGoal={member.profile?.goal ?? ''}
                memberFitnessLevel={member.profile?.fitnessLevel ?? ''}
                currentUserUid={currentCoachUid}
                currentCoachName={currentCoachName}
                isPrimaryCoach={isPrimaryBootstrapped}
                customSessions={memberScheduleSessions}
                trainingPrograms={memberTrainingPrograms}
                registrations={liveRegistrations}
                events={events}
                disciplines={disciplines}
                exercises={exercises}
                coachDirectory={coachDirectory}
                nowMs={nowMs}
                compact
                defaultExpanded={false}
              />
            )}

            <MemberRegularityChart
              registrations={allRegistrations}
              events={events}
              nowMs={nowMs}
              compact
              collapsible
              title="Régularité de l’adhérent"
              subtitle="Événements inscrits, validés et annulés par semaine, mois ou année."
            />

            <MemberBadgesCard
              summary={memberBadgesSummary}
              disciplines={disciplines}
              compact
              title="Badges & récompenses obtenus"
            />

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
              <div
                className={`flex items-start justify-between gap-3 ${
                  historyExpanded
                    ? 'border-b border-slate-100 pb-3.5 dark:border-slate-800'
                    : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setHistoryExpanded((prev) => !prev)}
                  aria-expanded={historyExpanded}
                  aria-controls="member-drawer-history-panel"
                  className="flex flex-1 items-start gap-3 text-left min-w-0 cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <History className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      Historique des séances ({member.registrations.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {(() => {
                        const historyAttendedCount = member.registrations.filter(
                          (r) => r.attended
                        ).length;
                        const historyUpcomingCount = member.registrations.filter(
                          (r) =>
                            r.status === 'confirmed' &&
                            r.cancelledBy !== 'admin' &&
                            !r.isArchivedStat &&
                            r.eventStartAt.toMillis() > nowMs
                        ).length;
                        const historyCancelledCount = member.registrations.filter(
                          (r) => r.status === 'cancelled' || r.cancelledBy === 'admin'
                        ).length;
                        const parts = [
                          `${historyAttendedCount} présence${historyAttendedCount > 1 ? 's' : ''} confirmée${historyAttendedCount > 1 ? 's' : ''}`,
                        ];
                        if (historyUpcomingCount > 0) {
                          parts.push(`${historyUpcomingCount} à venir`);
                        }
                        if (historyCancelledCount > 0) {
                          parts.push(
                            `${historyCancelledCount} annulée${historyCancelledCount > 1 ? 's' : ''}`
                          );
                        }
                        return parts.join(' · ');
                      })()}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryExpanded((prev) => !prev)}
                  aria-expanded={historyExpanded}
                  aria-controls="member-drawer-history-panel"
                  aria-label={
                    historyExpanded
                      ? 'Replier l’historique des séances'
                      : 'Déplier l’historique des séances'
                  }
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      historyExpanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {historyExpanded && (
                <div id="member-drawer-history-panel" className="mt-4">
                  {member.registrations.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Aucune séance réservée pour le moment.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {member.registrations.map((reg) => {
                        const startDate = reg.eventStartAt.toDate();
                        const matchedEvent =
                          events.find((ev) => ev.id === reg.eventId) ?? null;
                        const isAdminCancelled =
                          reg.cancelledBy === 'admin' ||
                          matchedEvent?.status === 'cancelled';
                        const isMemberCancelled =
                          reg.status === 'cancelled' && !isAdminCancelled;
                        const isCancelled = isAdminCancelled || isMemberCancelled;
                        const isUpcoming =
                          !isCancelled &&
                          !reg.isArchivedStat &&
                          startDate.getTime() > nowMs;
                        const isPastParticipated = !isCancelled && !isUpcoming;

                        return (
                          <div
                            key={reg.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-slate-900 dark:text-white truncate">
                                  {reg.eventTitle}
                                </p>
                                {isUpcoming && (
                                  <span className="inline-flex items-center rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                                    Participe
                                  </span>
                                )}
                                {isPastParticipated && (
                                  <span className="inline-flex items-center rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                    A participé
                                  </span>
                                )}
                                {isMemberCancelled && (
                                  <span className="inline-flex items-center rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 text-[11px] font-semibold text-rose-800 dark:text-rose-300">
                                    Annulé par l’adhérent
                                  </span>
                                )}
                                {isAdminCancelled && (
                                  <span className="inline-flex items-center rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                                    Annulé par l’administrateur
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums capitalize">
                                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                {formatFrenchDateShort(startDate)} ·{' '}
                                {formatFrenchTime(startDate)}
                                {isUpcoming && (
                                  <span className="text-emerald-700 dark:text-emerald-400 font-sans font-semibold normal-case">
                                    · À venir
                                  </span>
                                )}
                                {isAdminCancelled && reg.attended && (
                                  <span className="text-emerald-700 dark:text-emerald-400 font-sans font-semibold normal-case">
                                    · Présence conservée
                                  </span>
                                )}
                              </p>
                            </div>

                            {!isCancelled && !reg.isArchivedStat && (
                              <button
                                type="button"
                                onClick={() =>
                                  void toggleRegistrationAttendance(
                                    reg.id,
                                    !reg.attended
                                  )
                                }
                                className={`inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-md border px-3 py-1 text-xs font-semibold cursor-pointer ${
                                  reg.attended
                                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                {reg.attended ? 'Présent' : 'Pointer'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Delete Member Section */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/35 p-4">
              <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                Suppression de l’adhérent
              </h4>
              <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                Efface totalement toutes ses données de la base de données (fiche, inscriptions, paiements et notifications). Il pourra se réinscrire ultérieurement comme un nouvel adhérent.
              </p>

              {confirmDelete ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={onDelete}
                    className="min-h-[40px] rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                  >
                    {deleting ? 'Suppression...' : 'Confirmer la suppression'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/60 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Supprimer cet adhérent
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
