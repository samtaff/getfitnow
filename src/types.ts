import { Timestamp } from 'firebase/firestore';

export type Discipline = string;

export type DisciplineColorKey =
  | 'emerald'
  | 'orange'
  | 'sky'
  | 'violet'
  | 'rose'
  | 'teal'
  | 'amber'
  | 'indigo'
  | 'lime'
  | 'slate'
  | 'cyan'
  | 'fuchsia'
  | 'blue'
  | 'pink';

export type DisciplineIconKey =
  | 'dumbbell'
  | 'running-shoe'
  | 'flame'
  | 'yoga'
  | 'bike'
  | 'waves'
  | 'boxing'
  | 'heart-pulse'
  | 'zap'
  | 'mountain'
  | 'music'
  | 'ball'
  | 'timer'
  | 'footprints'
  | 'target'
  | 'trophy';

export interface CustomDiscipline {
  id: string;
  name: string;
  slug: string;
  colorKey: DisciplineColorKey;
  iconKey?: DisciplineIconKey;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DisciplineItem {
  id: string;
  name: string;
  colorKey: DisciplineColorKey;
  iconKey: DisciplineIconKey;
  customDoc?: CustomDiscipline;
}

export type EventStatus = 'published' | 'cancelled';
export type EventCancelReason = 'manual' | 'no_registrants' | '';
export type RegistrationStatus = 'confirmed' | 'cancelled';
export type FollowUpStatus = 'active' | 'to_follow_up' | 'paused';
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type EventPaymentMode = 'online' | 'onsite' | 'both';
export type PaymentStatus = 'free' | 'paid' | 'pending' | 'refunded';
export type PaymentMethod = 'free' | 'card' | 'onsite';

export const VALIDATION_LIMITS = {
  TITLE_MIN: 2,
  TITLE_MAX: 100,
  DISCIPLINE_MIN: 2,
  DISCIPLINE_MAX: 50,
  DESCRIPTION_MAX: 600,
  EVENT_URL_MAX: 500,
  EVENT_COVER_IMAGE_MAX: 200000,
  EVENT_COVER_POSITION_MAX: 20,
  LOCATION_MIN: 2,
  LOCATION_MAX: 120,
  CITY_MIN: 2,
  CITY_MAX: 80,
  REGION_MAX: 80,
  COACH_NAME_MIN: 2,
  COACH_NAME_MAX: 200,
  SINGLE_COACH_NAME_MAX: 80,
  COACHES_PER_EVENT_MAX: 10,
  DURATION_MIN: 15,
  DURATION_MAX: 240,
  CAPACITY_MIN: 1,
  CAPACITY_MAX: 200,
  GUESTS_PER_BOOKING_MAX: 10,
  PRICE_MIN_CENTS: 100,
  PRICE_MAX_CENTS: 100000,
  PAYMENT_REF_MAX: 64,
  FIRST_NAME_MIN: 1,
  FIRST_NAME_MAX: 60,
  LAST_NAME_MIN: 1,
  LAST_NAME_MAX: 60,
  EMAIL_MIN: 5,
  EMAIL_MAX: 120,
  PHONE_MAX: 30,
  GOAL_MAX: 120,
  NOTES_MAX: 1000,
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 80,
  REQUEST_MESSAGE_MAX: 500,
  SPECIALTY_MAX: 120,
  CERTIFICATIONS_MAX: 200,
  BIO_MAX: 600,
  PRICING_NOTES_MAX: 300,
  PHOTO_URL_MAX: 80000,
  BIRTH_DATE_MAX: 10,
  BIRTH_DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  BOOKING_CUTOFF_MINUTES_MIN: 0,
  BOOKING_CUTOFF_MINUTES_MAX: 10080, // 7 jours avant le début
  ENDED_EVENT_RETENTION_DAYS: 30,
  ENDED_EVENT_RETENTION_MS: 30 * 24 * 60 * 60 * 1000, // 30 jours après la fin
  REVIEW_COMMENT_MIN: 3,
  REVIEW_COMMENT_MAX: 800,
  REVIEW_RATING_MIN: 1,
  REVIEW_RATING_MAX: 5,
  REVIEW_AUTHOR_NAME_MIN: 2,
  REVIEW_AUTHOR_NAME_MAX: 80,
  MESSAGE_TEXT_MIN: 1,
  MESSAGE_TEXT_MAX: 1500,
  MESSAGE_PREVIEW_MAX: 240,
  SCHEDULE_NOTES_MAX: 600,
  EXERCISE_NAME_MIN: 2,
  EXERCISE_NAME_MAX: 100,
  EXERCISE_DESCRIPTION_MAX: 500,
  EXERCISE_INTENSITY_MAX: 80,
  EXERCISE_OBJECTIVE_MAX: 60,
  EXERCISE_OBJECTIVES_MAX_COUNT: 8,
  EXERCISE_REPS_MIN: 0,
  EXERCISE_REPS_MAX: 500,
  EXERCISE_DURATION_MIN: 0,
  EXERCISE_DURATION_MAX: 7200,
  EXERCISE_ROUNDS_MIN: 1,
  EXERCISE_ROUNDS_MAX: 50,
  EXERCISE_PAUSE_MIN: 0,
  EXERCISE_PAUSE_MAX: 600,
  EXERCISE_REST_MIN: 0,
  EXERCISE_REST_MAX: 1800,
  SESSION_EXERCISES_MAX: 25,
  SESSION_EXERCISE_NOTES_MAX: 240,
  SESSION_OBJECTIVE_MAX: 120,
  PROGRAM_DURATION_WEEKS: 12,
  PROGRAM_DURATION_WEEKS_MIN: 8,
  PROGRAM_DURATION_WEEKS_MAX: 16,
  PROGRAM_DEFAULT_SESSIONS_PER_WEEK: 3,
  PROGRAM_SESSIONS_PER_WEEK_MIN: 2,
  PROGRAM_SESSIONS_PER_WEEK_MAX: 6,
  PROGRAM_PRICE_MIN_CENTS: 100,
  PROGRAM_PRICE_MAX_CENTS: 200000,
  PROGRAM_VMA_MIN_KMH: 6,
  PROGRAM_VMA_MAX_KMH: 26,
  PROGRAM_TARGET_TIME_MIN_SEC: 600,
  PROGRAM_TARGET_TIME_MAX_SEC: 36000,
  PROGRAM_COMPLETED_KEYS_MAX: 100,
  PROGRAM_OVERRIDES_MAX: 100,
} as const;

export interface SportEvent {
  id: string;
  title: string;
  discipline: Discipline;
  description: string;
  externalUrl?: string;
  coverImageUrl?: string;
  coverImagePosition?: string;
  location: string;
  city: string;
  region: string;
  hasCoords: boolean;
  lat: number;
  lng: number;
  coachName: string;
  coachNames?: string[];
  coachUids?: string[];
  startAt: Timestamp;
  durationMinutes: number;
  isUnlimitedCapacity: boolean;
  maxCapacity: number;
  registeredCount: number;
  lastRegId: string;
  likesCount?: number;
  lastLikeId?: string;
  status: EventStatus;
  cancelReason?: EventCancelReason;
  bookingCutoffMinutes?: number;
  disableAutoClose?: boolean;
  isPaid?: boolean;
  priceCents?: number;
  currency?: 'EUR';
  paymentMode?: EventPaymentMode;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Registration {
  id: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: Timestamp;
  eventDurationMinutes?: number;
  eventEndAt?: Timestamp;
  firstName: string;
  lastName: string;
  email: string;
  emailKey: string;
  attended: boolean;
  memberValidated?: boolean;
  status: RegistrationStatus;
  amountCents?: number;
  currency?: 'EUR';
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  cardBrand?: string;
  cardLast4?: string;
  paidAt?: Timestamp | null;
  isGuest?: boolean;
  invitedByEmail?: string;
  invitedByEmailKey?: string;
  invitedByName?: string;
  discipline?: string;
  isArchivedStat?: boolean;
  cancelledBy?: 'member' | 'admin';
  eventCancelled?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GuestInput {
  firstName: string;
  lastName: string;
  email: string;
}

export interface PaymentRecord {
  id: string;
  registrationId: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: Timestamp;
  memberEmail: string;
  memberEmailKey: string;
  memberName: string;
  amountCents: number;
  currency: 'EUR';
  method: 'card' | 'onsite';
  status: 'paid' | 'pending' | 'refunded';
  reference: string;
  cardBrand: string;
  cardLast4: string;
  paidAt: Timestamp | null;
  isGuest?: boolean;
  payerEmail?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberProfile {
  id: string;
  emailKey: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  goal: string;
  birthDate?: string;
  fitnessLevel?: FitnessLevel | '';
  notes: string;
  followUpStatus: FollowUpStatus;
  photoUrl?: string;
  referentCoachUid?: string;
  referentCoachName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberAggregate {
  emailKey: string;
  email: string;
  firstName: string;
  lastName: string;
  profile: MemberProfile | null;
  registrations: Registration[];
  totalRegistrations: number;
  attendedCount: number;
  pastRegistrationsCount: number;
  upcomingRegistrationsCount: number;
  attendanceRate: number | null;
  lastSessionDate: Date | null;
  nextSessionDate: Date | null;
}

export type CoachRole = 'coach' | 'coach_admin';
export type CoachAdminRequestStatus = 'none' | 'pending' | 'rejected';
export type CoachAccessRequestStatus = 'pending' | 'approved' | 'rejected';
export type CoachInviteStatus = 'pending' | 'disabled' | 'claimed';
export type CoachAccessResolution = 'active' | 'disabled' | 'none';

export interface CoachPricing {
  groupSessionPriceCents?: number;
  customSessionPriceCents?: number;
  program5kmPriceCents?: number;
  program10kmPriceCents?: number;
  program21kmPriceCents?: number;
  program42kmPriceCents?: number;
  pricingNotes?: string;
}

export interface CoachAdminUser {
  id: string;
  uid: string;
  email: string;
  emailKey: string;
  displayName: string;
  phone?: string;
  specialty?: string;
  city?: string;
  region?: string;
  certifications?: string;
  bio?: string;
  photoUrl?: string;
  pricing?: CoachPricing;
  role: CoachRole;
  adminRequestStatus?: CoachAdminRequestStatus;
  active: boolean;
  isPrimary: boolean;
  createdByUid: string;
  createdByEmail: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CoachAccessRequest {
  id: string;
  uid: string;
  email: string;
  emailKey: string;
  displayName: string;
  message: string;
  status: CoachAccessRequestStatus;
  reviewedByEmail: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CoachAdminInvite {
  id: string;
  email: string;
  emailKey: string;
  displayName: string;
  role: CoachRole;
  status: CoachInviteStatus;
  invitedByUid: string;
  invitedByEmail: string;
  claimedByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type BookingAvailabilityState =
  | 'open'
  | 'full'
  | 'closed'
  | 'past'
  | 'cancelled';

export type AppSection =
  | 'calendar'
  | 'sessions'
  | 'member-profile'
  | 'messages'
  | 'members'
  | 'manage'
  | 'coaches';

export interface CoachNotification {
  id: string;
  coachUid: string;
  type: 'new_registration';
  eventId: string;
  eventTitle: string;
  eventStartAt: Timestamp;
  registrationId: string;
  memberName: string;
  memberEmail: string;
  invitedByName?: string;
  read: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type MemberNotificationType = 'validate_session' | 'event_cancelled';

export interface MemberNotification {
  id: string;
  registrationId: string;
  eventId: string;
  eventTitle: string;
  eventStartAt: Timestamp;
  eventEndAt: Timestamp;
  memberEmail: string;
  memberEmailKey: string;
  type: MemberNotificationType;
  coachName?: string;
  wasPaid?: boolean;
  read: boolean;
  validated: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberCoachAckNotification {
  id: string;
  conversationId: string;
  coachUid: string;
  coachName: string;
  messageText: string;
  createdAtMs: number;
  conversation: Conversation;
}

export type MemberProgramNotificationKind =
  | 'running_program'
  | 'custom_program'
  | 'program_week';

export interface MemberProgramNotification {
  id: string;
  kind: MemberProgramNotificationKind;
  title: string;
  coachName: string;
  coachUid: string;
  summary: string;
  priceCents: number;
  isFree: boolean;
  requiresPayment: boolean;
  weekNumber?: number;
  durationWeeks?: number;
  startDate: Date;
  createdAtMs: number;
  read: boolean;
  programId?: string;
  scheduleSessionId?: string;
}

export interface EventLike {
  id: string;
  eventId: string;
  userId: string;
  createdAt: Timestamp;
}

export interface EventReview {
  id: string;
  eventId: string;
  registrationId: string;
  emailKey: string;
  authorUid: string;
  authorName: string;
  eventTitle: string;
  discipline: string;
  eventStartAt: Timestamp;
  rating: number;
  comment: string;
  status: 'published';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventRatingSummary {
  averageRating: number;
  count: number;
}

export interface CoachDirectoryEntry {
  id: string;
  uid: string;
  displayName: string;
  specialty?: string;
  city?: string;
  region?: string;
  bio?: string;
  photoUrl?: string;
  pricing?: CoachPricing;
  active: boolean;
  isPrimary?: boolean;
  updatedAt: Timestamp;
}

export type ConversationSenderRole = 'coach' | 'member';

export interface Conversation {
  id: string;
  coachUid: string;
  coachName: string;
  coachPhotoUrl?: string;
  memberEmail: string;
  memberEmailKey: string;
  memberName: string;
  memberPhotoUrl?: string;
  memberUid: string;
  lastMessageText: string;
  lastMessageSenderRole: ConversationSenderRole;
  lastMessageSenderUid: string;
  lastMessageAt: Timestamp;
  coachUnreadCount: number;
  memberUnreadCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  coachUid: string;
  memberEmail: string;
  senderUid: string;
  senderEmail: string;
  senderName: string;
  senderRole: ConversationSenderRole;
  text: string;
  contextEventId?: string;
  contextEventTitle?: string;
  likedByCoach?: boolean;
  likedByMember?: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface PendingMessageTarget {
  coachUid: string;
  coachName?: string;
  coachPhotoUrl?: string;
  memberEmail: string;
  memberEmailKey?: string;
  memberName?: string;
  memberPhotoUrl?: string;
  contextEventId?: string;
  contextEventTitle?: string;
}

export type ExerciseCategory = 'strength' | 'running' | 'mobility';

export interface ExerciseParams {
  repetitions: number;
  durationSeconds: number;
  setsOrRounds: number;
  intraSetPauseSeconds: number;
  restBetweenRoundsSeconds: number;
}

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  category: ExerciseCategory;
  targetObjectives: string[];
  description: string;
  defaultParams: ExerciseParams;
  intensityHint?: string;
  isPreset?: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ScheduledExerciseItem {
  exerciseId: string;
  name: string;
  category: ExerciseCategory;
  repetitions: number;
  durationSeconds: number;
  setsOrRounds: number;
  intraSetPauseSeconds: number;
  restBetweenRoundsSeconds: number;
  notes: string;
}

export interface MemberScheduleSession {
  id: string;
  memberEmail: string;
  memberEmailKey: string;
  memberName: string;
  title: string;
  discipline: Discipline;
  notes: string;
  location: string;
  startAt: Timestamp;
  durationMinutes: number;
  coachUid: string;
  coachName: string;
  objective?: string;
  exercises?: ScheduledExerciseItem[];
  isPaid?: boolean;
  priceCents?: number;
  currency?: 'EUR';
  paymentMode?: EventPaymentMode;
  paymentStatus?: 'free' | 'paid' | 'pending';
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  cardBrand?: string;
  cardLast4?: string;
  paidAt?: Timestamp | null;
  createdByUid: string;
  createdByRole: 'coach' | 'member';
  completed: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RunningDistanceKey = '5km' | '10km' | '21km' | '42km';
export type ProgramRunnerLevel = 'beginner' | 'regular' | 'experienced';
export type TrainingProgramStatus =
  | 'awaiting_payment'
  | 'awaiting_vma'
  | 'active'
  | 'completed';
export type VmaTestStatus = 'pending' | 'completed';

export interface RunningPaceZones {
  vmaKmh: number;
  efMinSecPerKm: number;
  efMaxSecPerKm: number;
  as42SecPerKm: number;
  as21SecPerKm: number;
  seuilSecPerKm: number;
  as10SecPerKm: number;
  as5SecPerKm: number;
  vma100SecPerKm: number;
  vma105SecPerKm: number;
  targetRacePaceSecPerKm: number;
}

export interface ProgramSessionOverride {
  sessionKey: string;
  title: string;
  durationMinutes: number;
  coachNotes: string;
  exercises: ScheduledExerciseItem[];
  updatedAtMs: number;
}

export interface TrainingProgram {
  id: string;
  memberEmail: string;
  memberEmailKey: string;
  memberName: string;
  title: string;
  distance: RunningDistanceKey;
  level?: ProgramRunnerLevel;
  durationWeeks: number;
  sessionsPerWeek: number;
  preferredDays: number[];
  targetTimeSeconds: number;
  startAt: Timestamp;
  desiredStartAt?: Timestamp;
  autoSendDay?: number;
  autoSendTime?: string;
  vmaTestStatus: VmaTestStatus;
  vmaKmh: number;
  vmaTestDistanceMeters: number;
  vmaTestDurationSeconds: number;
  vmaTestedAt?: Timestamp | null;
  completedSessionKeys: string[];
  sessionOverrides?: ProgramSessionOverride[];
  notes: string;
  coachUid: string;
  coachName: string;
  isPaid: boolean;
  priceCents: number;
  currency: 'EUR';
  paymentMode: EventPaymentMode;
  paymentStatus: 'free' | 'pending' | 'paid';
  paymentMethod: '' | 'free' | 'card' | 'onsite';
  paymentReference: string;
  cardBrand: string;
  cardLast4: string;
  paidAt?: Timestamp | null;
  status: TrainingProgramStatus;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

