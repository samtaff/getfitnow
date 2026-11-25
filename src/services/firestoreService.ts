import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  auth,
  BOOTSTRAPPED_COACH_EMAIL,
  buildFirestoreErrorInfo,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  CoachAccessRequest,
  CoachAccessResolution,
  CoachAdminInvite,
  CoachAdminRequestStatus,
  CoachAdminUser,
  CoachDirectoryEntry,
  CoachNotification,
  CoachPricing,
  CoachRole,
  Conversation,
  ConversationSenderRole,
  CustomDiscipline,
  DirectMessage,
  Discipline,
  DisciplineColorKey,
  DisciplineIconKey,
  EventCancelReason,
  EventLike,
  EventPaymentMode,
  EventReview,
  EventStatus,
  ExerciseCategory,
  ExerciseLibraryItem,
  ExerciseParams,
  FitnessLevel,
  FollowUpStatus,
  GuestInput,
  MemberNotification,
  MemberProfile,
  MemberProgramNotification,
  MemberScheduleSession,
  PaymentMethod,
  PaymentRecord,
  PaymentStatus,
  ProgramRunnerLevel,
  ProgramSessionOverride,
  Registration,
  RunningDistanceKey,
  ScheduledExerciseItem,
  SportEvent,
  TrainingProgram,
  TrainingProgramStatus,
  VALIDATION_LIMITS,
  VmaTestStatus,
} from '../types';
import {
  clampExerciseParams,
  STARTER_EXERCISES,
} from '../utils/exerciseLibrary';
import {
  computeVmaFromTest,
  DEFAULT_AUTO_SEND_DAY,
  DEFAULT_AUTO_SEND_TIME,
  GeneratedProgramSession,
  generateRunningProgramSessions,
  getDefaultPreferredDays,
  getProgramDeliveryProgress,
  getProgramDurationWeeks,
  getProgramRunnerLevelLabel,
  inferProgramLevelFromDuration,
  normalizeAutoSendDay,
  normalizePreferredDays,
  parseAutoSendTime,
  RUNNING_DISTANCE_TEMPLATES,
} from '../utils/runningProgramGenerator';
import {
  buildRegistrationAckMessage,
  evaluateEventBooking,
  formatPriceEuros,
  formatPublicAuthorName,
  getEventCoachFirstName,
  getRegistrationEndMs,
  getSafeEventCoverImageSrc,
  getSafeExternalHref,
  hashEmailKey,
  isValidBirthDateString,
  normalizeBookingCutoffMinutes,
  normalizeCoverImagePosition,
  normalizeEventExternalUrl,
} from '../utils/dateAndValidation';
import {
  inferDisciplineIconKey,
  pickNextUnusedColorKey,
  slugifyDiscipline,
} from '../utils/disciplineColors';
import { generatePaymentReference } from '../utils/paymentHelpers';
import {
  areCoachPricingsEqual,
  sanitizeCoachPricing,
} from '../utils/coachPricingHelpers';

export async function resolveCoachSession(user: User | null): Promise<{
  isCoach: boolean;
  status: CoachAccessResolution;
  role: CoachRole | null;
}> {
  if (!user || !user.email) {
    return { isCoach: false, status: 'none', role: null };
  }

  const userEmail = user.email.trim().toLowerCase();
  const isBootstrapped =
    user.emailVerified &&
    userEmail === BOOTSTRAPPED_COACH_EMAIL.toLowerCase();

  if (isBootstrapped) {
    try {
      const adminRef = doc(db, 'admins', user.uid);
      const snap = await getDoc(adminRef);
      const emailKey = await hashEmailKey(userEmail);
      const displayName = (
        user.displayName?.trim() || 'David Frosio'
      ).slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

      if (!snap.exists()) {
        await setDoc(adminRef, {
          uid: user.uid,
          email: userEmail,
          emailKey,
          displayName,
          role: 'coach_admin',
          adminRequestStatus: 'none',
          active: true,
          isPrimary: true,
          createdByUid: user.uid,
          createdByEmail: userEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const data = snap.data() as Partial<CoachAdminUser>;
        if (
          data.active === false ||
          data.role !== 'coach_admin' ||
          data.isPrimary !== true
        ) {
          await updateDoc(adminRef, {
            active: true,
            role: 'coach_admin',
            isPrimary: true,
            adminRequestStatus: 'none',
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.warn('Synchronisation admin principal impossible:', error);
    }
    return { isCoach: true, status: 'active', role: 'coach_admin' };
  }

  try {
    const adminRef = doc(db, 'admins', user.uid);
    const snap = await getDoc(adminRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<CoachAdminUser>;
      if (data.active !== false) {
        const role: CoachRole =
          data.role === 'coach_admin' ? 'coach_admin' : 'coach';
        return { isCoach: true, status: 'active', role };
      }
      return { isCoach: false, status: 'disabled', role: null };
    }

    // Check if this user has a pending email invitation in /adminInvites (requires verified email)
    if (user.emailVerified) {
      const inviteQuery = query(
        collection(db, 'adminInvites'),
        where('email', '==', userEmail)
      );
      const inviteSnap = await getDocs(inviteQuery);
      const pendingInviteDoc = inviteSnap.docs.find((d) => {
        const data = d.data() as Partial<CoachAdminInvite>;
        return data.status === 'pending';
      });

      if (pendingInviteDoc) {
        const invite = pendingInviteDoc.data() as CoachAdminInvite;
        const emailKey = invite.emailKey || (await hashEmailKey(userEmail));
        const displayName = (
          invite.displayName?.trim() ||
          user.displayName?.trim() ||
          userEmail.split('@')[0]
        ).slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
        const claimedRole: CoachRole =
          invite.role === 'coach_admin' ? 'coach_admin' : 'coach';

        const batch = writeBatch(db);
        batch.set(adminRef, {
          uid: user.uid,
          email: userEmail,
          emailKey,
          displayName,
          role: claimedRole,
          adminRequestStatus: 'none',
          active: true,
          isPrimary: false,
          createdByUid: invite.invitedByUid,
          createdByEmail: invite.invitedByEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'adminInvites', pendingInviteDoc.id), {
          status: 'claimed',
          claimedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        return { isCoach: true, status: 'active', role: claimedRole };
      }
    }

    return { isCoach: false, status: 'none', role: null };
  } catch (error) {
    console.warn('Vérification coach impossible:', error);
    return { isCoach: false, status: 'none', role: null };
  }
}

export function subscribeMyAdminStatus(
  uid: string,
  userEmail: string | null | undefined,
  onStatus: (info: {
    status: CoachAccessResolution;
    role: CoachRole | null;
  }) => void
): Unsubscribe {
  if (
    userEmail &&
    auth.currentUser?.uid === uid &&
    auth.currentUser.emailVerified &&
    userEmail.trim().toLowerCase() === BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  ) {
    onStatus({ status: 'active', role: 'coach_admin' });
    return () => {};
  }
  return onSnapshot(
    doc(db, 'admins', uid),
    (snap) => {
      if (!snap.exists()) {
        onStatus({ status: 'none', role: null });
        return;
      }
      const data = snap.data() as Partial<CoachAdminUser>;
      if (data.active === false) {
        onStatus({ status: 'disabled', role: null });
        return;
      }
      const role: CoachRole =
        data.role === 'coach_admin' ? 'coach_admin' : 'coach';
      onStatus({ status: 'active', role });
    },
    (error) => {
      console.warn('Écoute statut coach interrompue:', error);
    }
  );
}

export function subscribeMyCoachAccessRequest(
  uid: string,
  onData: (req: CoachAccessRequest | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'coachAccessRequests', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData({
        id: snap.id,
        ...(snap.data() as Omit<CoachAccessRequest, 'id'>),
      });
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.GET,
          `coachAccessRequests/${uid}`
        );
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeCoachAdmins(
  onData: (admins: CoachAdminUser[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'admins'),
    (snapshot) => {
      const list: CoachAdminUser[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachAdminUser, 'id'>),
      }));
      list.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.displayName.localeCompare(b.displayName, 'fr');
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'admins');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeCoachAccessRequests(
  onData: (requests: CoachAccessRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'coachAccessRequests'),
    (snapshot) => {
      const list: CoachAccessRequest[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachAccessRequest, 'id'>),
      }));
      list.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        const aTime = a.updatedAt?.toMillis?.() ?? 0;
        const bTime = b.updatedAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.LIST,
          'coachAccessRequests'
        );
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeCoachInvites(
  onData: (invites: CoachAdminInvite[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'adminInvites'),
    (snapshot) => {
      const list: CoachAdminInvite[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachAdminInvite, 'id'>),
      }));
      list.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() ?? 0;
        const bTime = b.updatedAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'adminInvites');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function submitCoachAccessRequest(params: {
  user: User;
  displayName: string;
  message: string;
  isResubmission?: boolean;
}): Promise<void> {
  if (!params.user.email) {
    throw new Error('Votre compte doit disposer d’une adresse email.');
  }

  const email = params.user.email.trim().toLowerCase();
  const displayName = params.displayName
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const message = params.message
    .trim()
    .slice(0, VALIDATION_LIMITS.REQUEST_MESSAGE_MAX);

  if (displayName.length < VALIDATION_LIMITS.DISPLAY_NAME_MIN) {
    throw new Error('Veuillez saisir votre nom complet (au moins 2 caractères).');
  }

  const emailKey = await hashEmailKey(email);
  const reqRef = doc(db, 'coachAccessRequests', params.user.uid);

  try {
    if (params.isResubmission) {
      await updateDoc(reqRef, {
        displayName,
        message,
        status: 'pending',
        reviewedByEmail: '',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(reqRef, {
        uid: params.user.uid,
        email,
        emailKey,
        displayName,
        message,
        status: 'pending',
        reviewedByEmail: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      params.isResubmission ? OperationType.UPDATE : OperationType.CREATE,
      `coachAccessRequests/${params.user.uid}`
    );
  }
}

export async function approveCoachAccessRequest(params: {
  request: CoachAccessRequest;
  adminUser: User;
}): Promise<void> {
  const adminEmail = (params.adminUser.email || '').trim().toLowerCase();
  const batch = writeBatch(db);
  const adminRef = doc(db, 'admins', params.request.uid);
  const reqRef = doc(db, 'coachAccessRequests', params.request.id);

  batch.set(adminRef, {
    uid: params.request.uid,
    email: params.request.email.trim().toLowerCase(),
    emailKey: params.request.emailKey,
    displayName: params.request.displayName.slice(
      0,
      VALIDATION_LIMITS.DISPLAY_NAME_MAX
    ),
    role: 'coach',
    adminRequestStatus: 'none',
    active: true,
    isPrimary: false,
    createdByUid: params.adminUser.uid,
    createdByEmail: adminEmail,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(reqRef, {
    status: 'approved',
    reviewedByEmail: adminEmail,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `coachAccessRequests/${params.request.id}`
    );
  }
}

export async function rejectCoachAccessRequest(params: {
  requestId: string;
  adminUser: User;
}): Promise<void> {
  const adminEmail = (params.adminUser.email || '').trim().toLowerCase();
  try {
    await updateDoc(doc(db, 'coachAccessRequests', params.requestId), {
      status: 'rejected',
      reviewedByEmail: adminEmail,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `coachAccessRequests/${params.requestId}`
    );
  }
}

export async function deleteCoachAccessRequest(
  requestId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coachAccessRequests', requestId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `coachAccessRequests/${requestId}`
    );
  }
}

export async function addCoachMember(params: {
  email: string;
  displayName: string;
  adminUser: User;
  existingAdmins: CoachAdminUser[];
  existingRequests: CoachAccessRequest[];
  existingInvites: CoachAdminInvite[];
}): Promise<'activated_existing' | 'approved_request' | 'invited'> {
  const email = params.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const displayName = params.displayName
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

  if (displayName.length < VALIDATION_LIMITS.DISPLAY_NAME_MIN) {
    throw new Error('Veuillez saisir le nom complet du coach (2 caractères min.).');
  }
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(email)) {
    throw new Error('Veuillez saisir une adresse email valide.');
  }
  if (email === BOOTSTRAPPED_COACH_EMAIL.toLowerCase()) {
    throw new Error('Ce compte est déjà le coach administrateur principal.');
  }

  const adminEmail = (params.adminUser.email || '').trim().toLowerCase();

  // 1. Check if already in /admins
  const existingAdmin = params.existingAdmins.find(
    (a) => a.email.toLowerCase() === email
  );
  if (existingAdmin) {
    if (existingAdmin.active) {
      throw new Error('Ce coach est déjà actif dans l’équipe.');
    }
    try {
      await updateDoc(doc(db, 'admins', existingAdmin.id), {
        active: true,
        displayName,
        updatedAt: serverTimestamp(),
      });
      return 'activated_existing';
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `admins/${existingAdmin.id}`
      );
    }
  }

  // 2. Check if a pending/rejected access request already exists for this email (grants standard coach role, NOT admin)
  const existingRequest = params.existingRequests.find(
    (r) => r.email.toLowerCase() === email
  );
  if (existingRequest) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'admins', existingRequest.uid), {
      uid: existingRequest.uid,
      email,
      emailKey: existingRequest.emailKey,
      displayName,
      role: 'coach',
      adminRequestStatus: 'none',
      active: true,
      isPrimary: false,
      createdByUid: params.adminUser.uid,
      createdByEmail: adminEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'coachAccessRequests', existingRequest.id), {
      status: 'approved',
      reviewedByEmail: adminEmail,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
      return 'approved_request';
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `admins/${existingRequest.uid}`
      );
    }
  }

  // 3. Create or re-enable an email invitation in /adminInvites/{emailKey} with role 'coach' (never auto-admin)
  const emailKey = await hashEmailKey(email);
  const existingInvite = params.existingInvites.find((inv) => inv.id === emailKey);
  const inviteRef = doc(db, 'adminInvites', emailKey);

  try {
    if (existingInvite) {
      await updateDoc(inviteRef, {
        displayName,
        role: 'coach',
        status: 'pending',
        invitedByUid: params.adminUser.uid,
        invitedByEmail: adminEmail,
        claimedByUid: '',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(inviteRef, {
        email,
        emailKey,
        displayName,
        role: 'coach',
        status: 'pending',
        invitedByUid: params.adminUser.uid,
        invitedByEmail: adminEmail,
        claimedByUid: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return 'invited';
  } catch (error) {
    handleFirestoreError(
      error,
      existingInvite ? OperationType.UPDATE : OperationType.CREATE,
      `adminInvites/${emailKey}`
    );
  }
}

export async function setCoachRole(params: {
  targetAdmin: CoachAdminUser;
  role: CoachRole;
  adminRequestStatus?: CoachAdminRequestStatus;
  currentAdminUid: string;
}): Promise<void> {
  if (
    params.targetAdmin.isPrimary ||
    params.targetAdmin.email.toLowerCase() ===
      BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  ) {
    throw new Error(
      'Le rôle du coach administrateur principal ne peut pas être modifié.'
    );
  }
  if (
    params.targetAdmin.id === params.currentAdminUid &&
    params.role !== 'coach_admin'
  ) {
    throw new Error(
      'Vous ne pouvez pas retirer vos propres droits d’administrateur.'
    );
  }
  try {
    await updateDoc(doc(db, 'admins', params.targetAdmin.id), {
      role: params.role,
      adminRequestStatus: params.adminRequestStatus ?? 'none',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `admins/${params.targetAdmin.id}`
    );
  }
}

export async function requestCoachAdminPromotion(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'admins', uid), {
      adminRequestStatus: 'pending',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `admins/${uid}`);
  }
}

export async function setCoachAdminActive(params: {
  targetAdmin: CoachAdminUser;
  active: boolean;
}): Promise<void> {
  if (
    params.targetAdmin.isPrimary ||
    params.targetAdmin.email.toLowerCase() ===
      BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  ) {
    throw new Error(
      'Le coach administrateur principal ne peut pas être désactivé.'
    );
  }
  try {
    await updateDoc(doc(db, 'admins', params.targetAdmin.id), {
      active: params.active,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `admins/${params.targetAdmin.id}`
    );
  }
}

export async function deleteCoachAdmin(params: {
  targetAdmin: CoachAdminUser;
  currentAdminUid: string;
}): Promise<void> {
  if (
    params.targetAdmin.isPrimary ||
    params.targetAdmin.email.toLowerCase() ===
      BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  ) {
    throw new Error(
      'Le coach administrateur principal ne peut pas être supprimé.'
    );
  }
  if (params.targetAdmin.id === params.currentAdminUid) {
    throw new Error('Vous ne pouvez pas supprimer votre propre compte.');
  }

  const batch = writeBatch(db);
  batch.delete(doc(db, 'admins', params.targetAdmin.id));
  batch.delete(doc(db, 'coachAccessRequests', params.targetAdmin.uid));
  if (params.targetAdmin.emailKey) {
    batch.delete(doc(db, 'adminInvites', params.targetAdmin.emailKey));
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `admins/${params.targetAdmin.id}`
    );
  }
}

export async function setCoachInviteStatus(params: {
  inviteId: string;
  status: 'pending' | 'disabled';
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'adminInvites', params.inviteId), {
      status: params.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `adminInvites/${params.inviteId}`
    );
  }
}

export async function deleteCoachInvite(inviteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'adminInvites', inviteId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `adminInvites/${inviteId}`
    );
  }
}

export async function updateMyCoachProfile(params: {
  user: User;
  displayName: string;
  phone: string;
  specialty: string;
  city: string;
  region: string;
  certifications: string;
  bio: string;
  photoUrl?: string;
  pricing?: CoachPricing;
}): Promise<void> {
  const displayName = params.displayName
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

  if (displayName.length < VALIDATION_LIMITS.DISPLAY_NAME_MIN) {
    throw new Error('Votre nom d’affichage doit contenir au moins 2 caractères.');
  }

  const sanitizedPricing = sanitizeCoachPricing(params.pricing);
  const adminRef = doc(db, 'admins', params.user.uid);
  const payload = {
    displayName,
    phone: params.phone.trim().slice(0, VALIDATION_LIMITS.PHONE_MAX),
    specialty: params.specialty.trim().slice(0, VALIDATION_LIMITS.SPECIALTY_MAX),
    city: params.city.trim().slice(0, VALIDATION_LIMITS.CITY_MAX),
    region: params.region.trim().slice(0, VALIDATION_LIMITS.REGION_MAX),
    certifications: params.certifications
      .trim()
      .slice(0, VALIDATION_LIMITS.CERTIFICATIONS_MAX),
    bio: params.bio.trim().slice(0, VALIDATION_LIMITS.BIO_MAX),
    photoUrl: (params.photoUrl ?? '').trim().slice(0, VALIDATION_LIMITS.PHOTO_URL_MAX),
    pricing: sanitizedPricing,
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(adminRef);
    const email = (params.user.email || '').trim().toLowerCase();
    const isPrimaryUser =
      email === BOOTSTRAPPED_COACH_EMAIL.toLowerCase() ||
      (snap.exists() && (snap.data() as Partial<CoachAdminUser>).isPrimary === true);
    if (!snap.exists()) {
      const emailKey = await hashEmailKey(email);
      await setDoc(adminRef, {
        uid: params.user.uid,
        email,
        emailKey,
        ...payload,
        role: isPrimaryUser ? 'coach_admin' : 'coach',
        adminRequestStatus: 'none',
        active: true,
        isPrimary: isPrimaryUser,
        createdByUid: params.user.uid,
        createdByEmail: email,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(adminRef, payload);
    }
    await setDoc(doc(db, 'coachDirectory', params.user.uid), {
      uid: params.user.uid,
      displayName,
      specialty: payload.specialty,
      city: payload.city,
      region: payload.region,
      bio: payload.bio,
      photoUrl: payload.photoUrl,
      pricing: sanitizedPricing,
      active: true,
      isPrimary: isPrimaryUser,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `admins/${params.user.uid}`
    );
  }
}

export function subscribeDisciplines(
  onData: (disciplines: CustomDiscipline[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'disciplines'),
    (snapshot) => {
      const list: CustomDiscipline[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CustomDiscipline, 'id'>),
      }));
      list.sort((a, b) =>
        a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
      );
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'disciplines');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createCustomDiscipline(params: {
  name: string;
  colorKey?: DisciplineColorKey;
  iconKey?: DisciplineIconKey;
  coachUid: string;
  existingNames?: string[];
  existingDisciplines?: Array<{ name: string; colorKey: DisciplineColorKey }>;
}): Promise<string> {
  const cleanName = params.name
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);

  if (cleanName.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Le nom de la discipline doit contenir au moins 2 caractères.');
  }

  const allExistingNames = [
    ...(params.existingNames ?? []),
    ...(params.existingDisciplines ?? []).map((d) => d.name),
  ];
  const duplicate = allExistingNames.some(
    (n) => n.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (duplicate) {
    throw new Error('Cette discipline existe déjà dans votre catalogue.');
  }

  const resolvedColorKey =
    params.colorKey ??
    pickNextUnusedColorKey(params.existingDisciplines ?? []);
  const resolvedIconKey = params.iconKey ?? inferDisciplineIconKey(cleanName);

  const slug = slugifyDiscipline(cleanName);
  const discRef = doc(db, 'disciplines', slug);

  try {
    const existingSnap = await getDoc(discRef);
    if (existingSnap.exists()) {
      await updateDoc(discRef, {
        name: cleanName,
        colorKey: resolvedColorKey,
        iconKey: resolvedIconKey,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(discRef, {
        name: cleanName,
        slug,
        colorKey: resolvedColorKey,
        iconKey: resolvedIconKey,
        createdBy: params.coachUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return cleanName;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `disciplines/${slug}`);
  }
}

export async function updateCustomDisciplineColor(params: {
  name: string;
  slug: string;
  colorKey: DisciplineColorKey;
  iconKey?: DisciplineIconKey;
  coachUid: string;
}): Promise<void> {
  const discRef = doc(db, 'disciplines', params.slug);
  const cleanName = params.name.trim().slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);

  try {
    const existingSnap = await getDoc(discRef);
    if (existingSnap.exists()) {
      await updateDoc(discRef, {
        name: cleanName,
        colorKey: params.colorKey,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(discRef, {
        name: cleanName,
        slug: params.slug,
        colorKey: params.colorKey,
        iconKey: params.iconKey ?? inferDisciplineIconKey(cleanName),
        createdBy: params.coachUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `disciplines/${params.slug}`
    );
  }
}

export async function updateCustomDisciplineIcon(params: {
  name: string;
  slug: string;
  colorKey: DisciplineColorKey;
  iconKey: DisciplineIconKey;
  coachUid: string;
}): Promise<void> {
  const discRef = doc(db, 'disciplines', params.slug);
  const cleanName = params.name.trim().slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);

  try {
    const existingSnap = await getDoc(discRef);
    if (existingSnap.exists()) {
      await updateDoc(discRef, {
        name: cleanName,
        iconKey: params.iconKey,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(discRef, {
        name: cleanName,
        slug: params.slug,
        colorKey: params.colorKey,
        iconKey: params.iconKey,
        createdBy: params.coachUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `disciplines/${params.slug}`
    );
  }
}

export async function deleteCustomDiscipline(slug: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'disciplines', slug));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `disciplines/${slug}`);
  }
}

export function subscribeEvents(
  isCoach: boolean,
  onData: (events: SportEvent[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const eventsRef = collection(db, 'events');
  const q = isCoach
    ? eventsRef
    : query(eventsRef, where('status', 'in', ['published', 'cancelled']));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: SportEvent[] = snapshot.docs.map((d) => {
        const raw = d.data() as Partial<SportEvent>;
        const priceCents =
          typeof raw.priceCents === 'number' && raw.priceCents >= 0
            ? Math.round(raw.priceCents)
            : 0;
        const isPaid =
          Boolean(raw.isPaid) && priceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS;
        const paymentMode: EventPaymentMode =
          raw.paymentMode === 'onsite' || raw.paymentMode === 'both'
            ? raw.paymentMode
            : 'online';
        return {
          ...(raw as Omit<SportEvent, 'id'>),
          id: d.id,
          externalUrl: getSafeExternalHref(raw.externalUrl) ?? '',
          coverImageUrl: getSafeEventCoverImageSrc(raw.coverImageUrl) ?? '',
          coverImagePosition: normalizeCoverImagePosition(raw.coverImagePosition),
          city: typeof raw.city === 'string' && raw.city.trim() ? raw.city : 'Paris',
          region: typeof raw.region === 'string' ? raw.region : '',
          isUnlimitedCapacity: Boolean(raw.isUnlimitedCapacity),
          hasCoords: Boolean(raw.hasCoords),
          lat: typeof raw.lat === 'number' ? raw.lat : 0,
          lng: typeof raw.lng === 'number' ? raw.lng : 0,
          isPaid,
          priceCents: isPaid ? priceCents : 0,
          currency: 'EUR',
          paymentMode,
          likesCount:
            typeof raw.likesCount === 'number' && raw.likesCount >= 0
              ? Math.round(raw.likesCount)
              : 0,
          lastLikeId:
            typeof raw.lastLikeId === 'string' && raw.lastLikeId
              ? raw.lastLikeId
              : 'none',
          bookingCutoffMinutes: normalizeBookingCutoffMinutes(
            raw.bookingCutoffMinutes
          ),
          disableAutoClose: Boolean(raw.disableAutoClose),
        };
      });
      list.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'events');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeRegistrations(
  onData: (registrations: Registration[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'registrations'),
    (snapshot) => {
      const list: Registration[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Registration, 'id'>),
      }));
      list.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'registrations');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMembers(
  onData: (members: MemberProfile[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'members'),
    (snapshot) => {
      const list: MemberProfile[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MemberProfile, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'members');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMembersForCoach(params: {
  coachUid: string;
  isPrimaryBootstrapped: boolean;
  onData: (members: MemberProfile[]) => void;
  onError?: (err: Error) => void;
}): Unsubscribe {
  const sourceQuery = params.isPrimaryBootstrapped
    ? collection(db, 'members')
    : query(
        collection(db, 'members'),
        where('referentCoachUid', '==', params.coachUid)
      );
  return onSnapshot(
    sourceQuery,
    (snapshot) => {
      const list: MemberProfile[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MemberProfile, 'id'>),
      }));
      params.onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'members');
      } catch (wrapped) {
        if (params.onError && wrapped instanceof Error) {
          params.onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMyMemberProfile(
  email: string,
  onData: (profile: MemberProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = email.trim().toLowerCase();
  const q = query(collection(db, 'members'), where('email', '==', cleanEmail));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData(null);
        return;
      }
      const d = snapshot.docs[0];
      onData({
        id: d.id,
        ...(d.data() as Omit<MemberProfile, 'id'>),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'members');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMyRegistrations(
  email: string,
  onData: (registrations: Registration[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = email.trim().toLowerCase();
  let ownDocs: Registration[] = [];
  let guestDocs: Registration[] = [];

  const emitMerged = () => {
    const mergedMap = new Map<string, Registration>();
    ownDocs.forEach((r) => mergedMap.set(r.id, r));
    guestDocs.forEach((r) => {
      if (!mergedMap.has(r.id)) {
        mergedMap.set(r.id, r);
      }
    });
    const list = Array.from(mergedMap.values());
    list.sort((a, b) => b.eventStartAt.toMillis() - a.eventStartAt.toMillis());
    onData(list);
  };

  const ownQuery = query(
    collection(db, 'registrations'),
    where('email', '==', cleanEmail)
  );
  const invitedQuery = query(
    collection(db, 'registrations'),
    where('invitedByEmail', '==', cleanEmail)
  );

  const handleSnapshotError = (error: unknown) => {
    try {
      handleFirestoreError(error, OperationType.LIST, 'registrations');
    } catch (wrapped) {
      if (onError && wrapped instanceof Error) {
        onError(wrapped);
      }
    }
  };

  const unsubOwn = onSnapshot(
    ownQuery,
    (snapshot) => {
      ownDocs = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Registration, 'id'>),
      }));
      emitMerged();
    },
    handleSnapshotError
  );

  const unsubInvited = onSnapshot(
    invitedQuery,
    (snapshot) => {
      guestDocs = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Registration, 'id'>),
      }));
      emitMerged();
    },
    handleSnapshotError
  );

  return () => {
    unsubOwn();
    unsubInvited();
  };
}

export interface EventFormInput {
  title: string;
  discipline: Discipline;
  description: string;
  externalUrl?: string;
  hadExternalUrl?: boolean;
  coverImageUrl?: string;
  hadCoverImage?: boolean;
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
  startDate: Date;
  durationMinutes: number;
  isUnlimitedCapacity: boolean;
  maxCapacity: number;
  isPaid?: boolean;
  priceCents?: number;
  paymentMode?: EventPaymentMode;
  status?: EventStatus;
  bookingCutoffMinutes?: number;
  disableAutoClose?: boolean;
}

function normalizeEventPricing(input: EventFormInput): {
  isPaid: boolean;
  priceCents: number;
  currency: 'EUR';
  paymentMode: EventPaymentMode;
} {
  if (!input.isPaid) {
    return {
      isPaid: false,
      priceCents: 0,
      currency: 'EUR',
      paymentMode: 'online',
    };
  }
  const priceCents = Math.round(Number(input.priceCents ?? 0));
  if (
    !Number.isFinite(priceCents) ||
    priceCents < VALIDATION_LIMITS.PRICE_MIN_CENTS ||
    priceCents > VALIDATION_LIMITS.PRICE_MAX_CENTS
  ) {
    throw new Error(
      'Le tarif d’un événement payant doit être compris entre 1,00 € et 1 000,00 €.'
    );
  }
  const paymentMode: EventPaymentMode =
    input.paymentMode === 'onsite' || input.paymentMode === 'both'
      ? input.paymentMode
      : 'online';
  return {
    isPaid: true,
    priceCents,
    currency: 'EUR',
    paymentMode,
  };
}

function normalizeEventCoaches(input: EventFormInput): {
  coachName: string;
  coachNames: string[];
  coachUids: string[];
} {
  const rawNames =
    Array.isArray(input.coachNames) && input.coachNames.length > 0
      ? input.coachNames
      : (input.coachName || '').split(',');

  const seenNames = new Set<string>();
  const coachNames: string[] = [];
  for (const raw of rawNames) {
    const clean = raw
      .trim()
      .slice(0, VALIDATION_LIMITS.SINGLE_COACH_NAME_MAX);
    if (clean.length < VALIDATION_LIMITS.COACH_NAME_MIN) continue;
    const key = clean.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    coachNames.push(clean);
    if (coachNames.length >= VALIDATION_LIMITS.COACHES_PER_EVENT_MAX) break;
  }

  const coachUids = Array.from(
    new Set(
      (input.coachUids ?? [])
        .map((u) => u.trim())
        .filter((u) => /^[a-zA-Z0-9_-]{1,128}$/.test(u))
    )
  ).slice(0, VALIDATION_LIMITS.COACHES_PER_EVENT_MAX);

  const coachName = coachNames
    .join(', ')
    .slice(0, VALIDATION_LIMITS.COACH_NAME_MAX);

  return { coachName, coachNames, coachUids };
}

export async function createEvent(
  input: EventFormInput,
  coachUid: string
): Promise<string> {
  const title = input.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  const discipline = input.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  const description = input.description
    .trim()
    .slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX);
  const { url: externalUrl, error: externalUrlError } =
    normalizeEventExternalUrl(input.externalUrl);
  if (externalUrlError) {
    throw new Error(externalUrlError);
  }
  const location = input.location
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const city = input.city.trim().slice(0, VALIDATION_LIMITS.CITY_MAX);
  const region = (input.region ?? '').trim().slice(0, VALIDATION_LIMITS.REGION_MAX);
  const { coachName, coachNames, coachUids } = normalizeEventCoaches(input);

  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error('Le titre doit contenir au moins 2 caractères.');
  }
  if (discipline.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Veuillez sélectionner ou saisir une discipline valide.');
  }
  if (location.length < VALIDATION_LIMITS.LOCATION_MIN) {
    throw new Error('Le lieu doit contenir au moins 2 caractères.');
  }
  if (city.length < VALIDATION_LIMITS.CITY_MIN) {
    throw new Error('La ville doit contenir au moins 2 caractères.');
  }
  if (coachNames.length === 0 || coachName.length < VALIDATION_LIMITS.COACH_NAME_MIN) {
    throw new Error('Veuillez sélectionner ou ajouter au moins un animateur (2 caractères minimum).');
  }
  if (
    input.durationMinutes < VALIDATION_LIMITS.DURATION_MIN ||
    input.durationMinutes > VALIDATION_LIMITS.DURATION_MAX
  ) {
    throw new Error('La durée doit être comprise entre 15 et 240 minutes.');
  }
  if (
    !input.isUnlimitedCapacity &&
    (input.maxCapacity < VALIDATION_LIMITS.CAPACITY_MIN ||
      input.maxCapacity > VALIDATION_LIMITS.CAPACITY_MAX)
  ) {
    throw new Error('La capacité doit être comprise entre 1 et 200 places.');
  }

  const pricing = normalizeEventPricing(input);

  const coverImageUrl = getSafeEventCoverImageSrc(input.coverImageUrl) ?? '';
  const coverImagePosition = normalizeCoverImagePosition(input.coverImagePosition);

  const rawCreateLat = Number(input.lat);
  const rawCreateLng = Number(input.lng);
  const safeCreateCoords =
    Boolean(input.hasCoords) &&
    Number.isFinite(rawCreateLat) &&
    rawCreateLat >= -90 &&
    rawCreateLat <= 90 &&
    Number.isFinite(rawCreateLng) &&
    rawCreateLng >= -180 &&
    rawCreateLng <= 180;

  const eventRef = doc(collection(db, 'events'));
  try {
    await setDoc(eventRef, {
      title,
      discipline,
      description,
      ...(externalUrl ? { externalUrl } : {}),
      ...(coverImageUrl ? { coverImageUrl, coverImagePosition } : {}),
      location,
      city,
      region,
      hasCoords: safeCreateCoords,
      lat: safeCreateCoords ? rawCreateLat : 0,
      lng: safeCreateCoords ? rawCreateLng : 0,
      coachName,
      coachNames,
      coachUids,
      startAt: Timestamp.fromDate(input.startDate),
      durationMinutes: Math.round(input.durationMinutes),
      isUnlimitedCapacity: Boolean(input.isUnlimitedCapacity),
      maxCapacity: input.isUnlimitedCapacity ? 0 : Math.round(input.maxCapacity),
      registeredCount: 0,
      lastRegId: 'none',
      likesCount: 0,
      lastLikeId: 'none',
      status: 'published',
      cancelReason: '',
      bookingCutoffMinutes: normalizeBookingCutoffMinutes(
        input.bookingCutoffMinutes
      ),
      isPaid: pricing.isPaid,
      priceCents: pricing.priceCents,
      currency: pricing.currency,
      paymentMode: pricing.paymentMode,
      createdBy: coachUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return eventRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `events/${eventRef.id}`);
  }
}

const ALLOWED_EVENT_DOC_KEYS = new Set([
  'title',
  'discipline',
  'description',
  'externalUrl',
  'coverImageUrl',
  'coverImagePosition',
  'location',
  'city',
  'region',
  'hasCoords',
  'lat',
  'lng',
  'coachName',
  'coachNames',
  'coachUids',
  'startAt',
  'durationMinutes',
  'isUnlimitedCapacity',
  'maxCapacity',
  'registeredCount',
  'lastRegId',
  'likesCount',
  'lastLikeId',
  'status',
  'cancelReason',
  'bookingCutoffMinutes',
  'disableAutoClose',
  'isPaid',
  'priceCents',
  'currency',
  'paymentMode',
  'createdBy',
  'createdAt',
  'updatedAt',
]);

export async function updateEvent(
  eventId: string,
  input: EventFormInput,
  currentRegisteredCount: number
): Promise<void> {
  const title = input.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  const discipline = input.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  const description = input.description
    .trim()
    .slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX);
  const { url: externalUrl, error: externalUrlError } =
    normalizeEventExternalUrl(input.externalUrl);
  if (externalUrlError) {
    throw new Error(externalUrlError);
  }
  const location = input.location
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const city = input.city.trim().slice(0, VALIDATION_LIMITS.CITY_MAX);
  const region = (input.region ?? '').trim().slice(0, VALIDATION_LIMITS.REGION_MAX);
  const { coachName, coachNames, coachUids } = normalizeEventCoaches(input);

  const durationMinutes = Math.round(Number(input.durationMinutes));
  const nextMaxCapacity = input.isUnlimitedCapacity
    ? 0
    : Math.round(Number(input.maxCapacity));

  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error('Le titre doit contenir au moins 2 caractères.');
  }
  if (discipline.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Veuillez sélectionner ou saisir une discipline valide.');
  }
  if (location.length < VALIDATION_LIMITS.LOCATION_MIN) {
    throw new Error('Le lieu doit contenir au moins 2 caractères.');
  }
  if (city.length < VALIDATION_LIMITS.CITY_MIN) {
    throw new Error('La ville doit contenir au moins 2 caractères.');
  }
  if (coachNames.length === 0 || coachName.length < VALIDATION_LIMITS.COACH_NAME_MIN) {
    throw new Error('Veuillez sélectionner ou ajouter au moins un animateur (2 caractères minimum).');
  }
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes < VALIDATION_LIMITS.DURATION_MIN ||
    durationMinutes > VALIDATION_LIMITS.DURATION_MAX
  ) {
    throw new Error('La durée doit être comprise entre 15 et 240 minutes.');
  }
  if (
    !input.isUnlimitedCapacity &&
    (!Number.isFinite(nextMaxCapacity) ||
      nextMaxCapacity < VALIDATION_LIMITS.CAPACITY_MIN ||
      nextMaxCapacity > VALIDATION_LIMITS.CAPACITY_MAX)
  ) {
    throw new Error('La capacité doit être comprise entre 1 et 200 places.');
  }

  if (!input.isUnlimitedCapacity && nextMaxCapacity < currentRegisteredCount) {
    throw new Error(
      `La capacité maximale ne peut pas être inférieure au nombre d'inscrits actuels (${currentRegisteredCount}).`
    );
  }

  const pricing = normalizeEventPricing(input);
  const eventRef = doc(db, 'events', eventId);
  const startAtTs = Timestamp.fromDate(input.startDate);
  const eventEndAtTs = Timestamp.fromMillis(
    startAtTs.toMillis() + durationMinutes * 60 * 1000
  );

  const coverImageUrl = getSafeEventCoverImageSrc(input.coverImageUrl) ?? '';
  const coverImagePosition = normalizeCoverImagePosition(input.coverImagePosition);

  let shouldSyncRegistrations = currentRegisteredCount > 0;

  const liveSnap = await getDocFromServer(eventRef).catch(() =>
    getDoc(eventRef).catch(() => null)
  );
  const healFields: Record<string, unknown> = {};
  const liveData: Record<string, unknown> | null = liveSnap?.exists()
    ? (liveSnap.data() as Record<string, unknown>)
    : null;

  if (liveData) {
    const liveRegisteredCount =
      typeof liveData.registeredCount === 'number' &&
      Number.isInteger(liveData.registeredCount) &&
      liveData.registeredCount >= 0
        ? liveData.registeredCount
        : -1;
    const safeTargetCount = Math.max(0, Math.round(currentRegisteredCount));

    if (
      liveRegisteredCount < 0 ||
      (input.isUnlimitedCapacity && liveRegisteredCount > 10000) ||
      (!input.isUnlimitedCapacity && liveRegisteredCount > nextMaxCapacity)
    ) {
      const clampedTarget = Math.min(
        safeTargetCount,
        input.isUnlimitedCapacity ? 10000 : nextMaxCapacity
      );
      healFields.registeredCount = clampedTarget;
      if (clampedTarget === 0) {
        healFields.lastRegId = 'none';
      }
    }

    const validIdRegex = /^[a-zA-Z0-9_-]{1,128}$/;
    if (
      typeof liveData.lastRegId !== 'string' ||
      !validIdRegex.test(liveData.lastRegId)
    ) {
      healFields.lastRegId = 'none';
    }
    if (
      'likesCount' in liveData &&
      (typeof liveData.likesCount !== 'number' ||
        !Number.isInteger(liveData.likesCount) ||
        liveData.likesCount < 0 ||
        liveData.likesCount > 100000)
    ) {
      healFields.likesCount = 0;
    }
    if (
      'lastLikeId' in liveData &&
      (typeof liveData.lastLikeId !== 'string' ||
        !validIdRegex.test(liveData.lastLikeId))
    ) {
      healFields.lastLikeId = 'none';
    }
    if (
      'disableAutoClose' in liveData &&
      typeof liveData.disableAutoClose !== 'boolean'
    ) {
      healFields.disableAutoClose = Boolean(liveData.disableAutoClose);
    }
    if (!externalUrl && !input.hadExternalUrl && 'externalUrl' in liveData) {
      const rawExt = liveData.externalUrl;
      if (
        typeof rawExt !== 'string' ||
        (rawExt.length > 0 && !getSafeExternalHref(rawExt))
      ) {
        healFields.externalUrl = '';
      }
    }
    if (!coverImageUrl && !input.hadCoverImage && 'coverImageUrl' in liveData) {
      const rawCover = liveData.coverImageUrl;
      if (
        typeof rawCover !== 'string' ||
        (rawCover.length > 0 && !getSafeEventCoverImageSrc(rawCover))
      ) {
        healFields.coverImageUrl = '';
      }
    }
    if (
      !coverImageUrl &&
      !input.hadCoverImage &&
      'coverImagePosition' in liveData
    ) {
      const rawPos = liveData.coverImagePosition;
      if (
        typeof rawPos !== 'string' ||
        (rawPos.length > 0 && !/^[0-9]{1,3}% [0-9]{1,3}%$/.test(rawPos))
      ) {
        healFields.coverImagePosition = '50% 50%';
      }
    }

    Object.keys(liveData).forEach((key) => {
      if (!ALLOWED_EVENT_DOC_KEYS.has(key)) {
        healFields[key] = deleteField();
      }
    });

    const liveStartAt = liveData.startAt as Timestamp | undefined;
    const prevStartMs = liveStartAt?.toMillis?.() ?? null;
    const prevTitle = typeof liveData.title === 'string' ? liveData.title : '';
    const prevDuration =
      typeof liveData.durationMinutes === 'number'
        ? liveData.durationMinutes
        : null;
    shouldSyncRegistrations =
      Math.max(currentRegisteredCount, Math.max(0, liveRegisteredCount)) > 0 &&
      (prevTitle !== title ||
        prevStartMs !== startAtTs.toMillis() ||
        prevDuration !== durationMinutes);
  }

  const rawLat = Number(input.lat);
  const rawLng = Number(input.lng);
  const safeHasCoords =
    Boolean(input.hasCoords) &&
    Number.isFinite(rawLat) &&
    rawLat >= -90 &&
    rawLat <= 90 &&
    Number.isFinite(rawLng) &&
    rawLng >= -180 &&
    rawLng <= 180;

  const updatePayload: Record<string, unknown> = {
    title,
    discipline,
    description,
    ...(externalUrl
      ? { externalUrl }
      : input.hadExternalUrl
        ? { externalUrl: '' }
        : {}),
    ...(coverImageUrl
      ? { coverImageUrl, coverImagePosition }
      : input.hadCoverImage
        ? { coverImageUrl: '', coverImagePosition: '50% 50%' }
        : {}),
    ...healFields,
    location,
    city,
    region,
    hasCoords: safeHasCoords,
    lat: safeHasCoords ? rawLat : 0,
    lng: safeHasCoords ? rawLng : 0,
    coachName,
    coachNames,
    coachUids,
    startAt: startAtTs,
    durationMinutes,
    isUnlimitedCapacity: Boolean(input.isUnlimitedCapacity),
    maxCapacity: nextMaxCapacity,
    isPaid: pricing.isPaid,
    priceCents: pricing.priceCents,
    currency: pricing.currency,
    paymentMode: pricing.paymentMode,
    status: input.status ?? 'published',
    cancelReason: (input.status ?? 'published') === 'published' ? '' : 'manual',
    bookingCutoffMinutes: normalizeBookingCutoffMinutes(
      input.bookingCutoffMinutes
    ),
    updatedAt: serverTimestamp(),
  };

  if (liveData) {
    const mergedPreview: Record<string, unknown> = {
      ...liveData,
      ...updatePayload,
    };
    const mergedRegCount = mergedPreview.registeredCount;
    if (
      typeof mergedRegCount !== 'number' ||
      !Number.isInteger(mergedRegCount) ||
      mergedRegCount < 0
    ) {
      throw new Error('Le compteur d’inscrits de cet événement est invalide.');
    }
    if (!input.isUnlimitedCapacity && mergedRegCount > nextMaxCapacity) {
      throw new Error(
        `La capacité maximale (${nextMaxCapacity}) ne peut pas être inférieure au nombre d’inscrits (${mergedRegCount}).`
      );
    }
    if (
      typeof mergedPreview.createdBy !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(mergedPreview.createdBy) ||
      !mergedPreview.createdAt
    ) {
      throw new Error(
        'Métadonnées d’origine (createdBy/createdAt) manquantes sur cet événement.'
      );
    }
    if (
      typeof coverImageUrl === 'string' &&
      coverImageUrl.length > VALIDATION_LIMITS.EVENT_COVER_IMAGE_MAX
    ) {
      throw new Error(
        'Le visuel est trop volumineux pour être enregistré. Choisissez une image plus légère.'
      );
    }
  }

  try {
    await updateDoc(eventRef, updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
  }

  if (shouldSyncRegistrations) {
    try {
      const regSnap = await getDocs(
        query(collection(db, 'registrations'), where('eventId', '==', eventId))
      );
      if (!regSnap.empty) {
        const regBatch = writeBatch(db);
        regSnap.docs.forEach((regDoc) => {
          regBatch.update(regDoc.ref, {
            eventTitle: title,
            eventStartAt: startAtTs,
            eventDurationMinutes: durationMinutes,
            eventEndAt: eventEndAtTs,
            updatedAt: serverTimestamp(),
          });
        });
        await regBatch.commit();
      }
    } catch (syncError) {
      console.warn(
        `Synchronisation des inscriptions différée pour events/${eventId}:`,
        syncError
      );
    }
  }
}

async function notifyMembersOfCancelledEvent(params: {
  eventId: string;
  eventData?: Partial<SportEvent> | null;
  confirmedRegs: Registration[];
}): Promise<number> {
  if (params.confirmedRegs.length === 0) {
    return 0;
  }

  const eventTitleBase = (params.eventData?.title || '').trim();
  const coachName = (params.eventData?.coachName || '')
    .trim()
    .slice(0, VALIDATION_LIMITS.COACH_NAME_MAX);
  const fallbackDuration =
    typeof params.eventData?.durationMinutes === 'number' &&
    params.eventData.durationMinutes >= VALIDATION_LIMITS.DURATION_MIN
      ? Math.round(params.eventData.durationMinutes)
      : 60;

  const confirmedEmails = new Set(
    params.confirmedRegs.map((r) => r.email.trim().toLowerCase())
  );

  interface PendingCancelNotif {
    notifId: string;
    payload: {
      registrationId: string;
      eventId: string;
      eventTitle: string;
      eventStartAt: Timestamp;
      eventEndAt: Timestamp;
      memberEmail: string;
      memberEmailKey: string;
      type: 'event_cancelled';
      coachName?: string;
      wasPaid: boolean;
      read: false;
      validated: false;
    };
  }

  const candidates: PendingCancelNotif[] = [];

  for (const reg of params.confirmedRegs) {
    const startAt = params.eventData?.startAt ?? reg.eventStartAt;
    const durationMin =
      typeof reg.eventDurationMinutes === 'number' && reg.eventDurationMinutes > 0
        ? reg.eventDurationMinutes
        : fallbackDuration;
    const computedEndAt =
      reg.eventEndAt && reg.eventEndAt.toMillis() >= startAt.toMillis()
        ? reg.eventEndAt
        : Timestamp.fromMillis(startAt.toMillis() + durationMin * 60 * 1000);
    const title = (eventTitleBase || reg.eventTitle || 'Séance sportive')
      .trim()
      .slice(0, VALIDATION_LIMITS.TITLE_MAX);
    const safeTitle = title.length >= VALIDATION_LIMITS.TITLE_MIN ? title : 'Séance sportive';
    const wasPaid = reg.paymentStatus === 'paid' && (reg.amountCents ?? 0) > 0;
    const memberEmail = reg.email.trim().toLowerCase();

    candidates.push({
      notifId: `cancel__${reg.id}`,
      payload: {
        registrationId: reg.id,
        eventId: params.eventId,
        eventTitle: safeTitle,
        eventStartAt: startAt,
        eventEndAt: computedEndAt,
        memberEmail,
        memberEmailKey: reg.emailKey,
        type: 'event_cancelled',
        ...(coachName ? { coachName } : {}),
        wasPaid,
        read: false,
        validated: false,
      },
    });

    if (reg.isGuest && reg.invitedByEmail) {
      const hostEmail = reg.invitedByEmail.trim().toLowerCase();
      if (hostEmail && !confirmedEmails.has(hostEmail)) {
        confirmedEmails.add(hostEmail);
        const hostEmailKey = reg.invitedByEmailKey || (await hashEmailKey(hostEmail));
        candidates.push({
          notifId: `cancel__host__${reg.id}`,
          payload: {
            registrationId: reg.id,
            eventId: params.eventId,
            eventTitle: safeTitle,
            eventStartAt: startAt,
            eventEndAt: computedEndAt,
            memberEmail: hostEmail,
            memberEmailKey: hostEmailKey,
            type: 'event_cancelled',
            ...(coachName ? { coachName } : {}),
            wasPaid,
            read: false,
            validated: false,
          },
        });
      }
    }
  }

  const existingChecks = await Promise.all(
    candidates.map(async (item) => {
      const snap = await getDoc(doc(db, 'memberNotifications', item.notifId));
      return snap.exists() ? null : item;
    })
  );
  const toCreate = existingChecks.filter(
    (item): item is PendingCancelNotif => item !== null
  );

  const CHUNK_SIZE = 4;
  for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
    const chunk = toCreate.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ notifId, payload }) => {
      batch.set(doc(db, 'memberNotifications', notifId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return toCreate.length;
}

async function deleteEventLikesForEvent(eventId: string): Promise<void> {
  try {
    const likeSnap = await getDocs(
      query(collection(db, 'eventLikes'), where('eventId', '==', eventId))
    );
    if (likeSnap.empty) return;
    const CHUNK_SIZE = 300;
    for (let i = 0; i < likeSnap.docs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      likeSnap.docs.slice(i, i + CHUNK_SIZE).forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
    }
  } catch (error) {
    console.warn(`Nettoyage des likes différé pour events/${eventId}:`, error);
  }
}

async function archiveAdminCancelledRegistrations(
  regs: Registration[],
  eventData?: Partial<SportEvent> | null
): Promise<void> {
  const actorUid = (auth.currentUser?.uid || '').trim();
  if (!actorUid || regs.length === 0) return;
  try {
    const rawTitle = (eventData?.title || regs[0]?.eventTitle || 'Séance')
      .trim()
      .slice(0, 100);
    const cleanTitle = rawTitle.length >= 2 ? rawTitle : 'Séance';
    const rawDiscipline = (
      eventData?.discipline ||
      regs[0]?.discipline ||
      'Événement'
    )
      .trim()
      .slice(0, 50);
    const cleanDiscipline =
      rawDiscipline.length >= 2 ? rawDiscipline : 'Événement';
    const cleanDuration = Math.min(
      240,
      Math.max(
        15,
        Math.round(
          eventData?.durationMinutes ?? regs[0]?.eventDurationMinutes ?? 60
        )
      )
    );

    const CHUNK_SIZE = 10;
    for (let i = 0; i < regs.length; i += CHUNK_SIZE) {
      const chunk = regs.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (reg) => {
          const cleanEmail = reg.email.trim().toLowerCase();
          if (!cleanEmail || !reg.emailKey) return;
          const statRef = doc(
            db,
            'memberSchedules',
            buildArchivedRegistrationStatDocId(reg.id)
          );
          const buildNotes = (firstMax: number, lastMax: number) =>
            JSON.stringify({
              regId: reg.id,
              eventId: reg.eventId,
              isGuest: Boolean(reg.isGuest),
              firstName: reg.firstName.trim().slice(0, firstMax),
              lastName: reg.lastName.trim().slice(0, lastMax),
              cancelledBy: 'admin',
              eventCancelled: true,
            });
          let cleanNotes = buildNotes(50, 50);
          if (cleanNotes.length > VALIDATION_LIMITS.SCHEDULE_NOTES_MAX) {
            cleanNotes = buildNotes(20, 20).slice(
              0,
              VALIDATION_LIMITS.SCHEDULE_NOTES_MAX
            );
          }
          const cleanMemberName =
            `${reg.firstName} ${reg.lastName}`.trim().slice(0, 125) ||
            cleanEmail.slice(0, 125);
          try {
            const snap = await getDoc(statRef);
            if (snap.exists()) {
              await updateDoc(statRef, {
                notes: cleanNotes,
                completed: Boolean(reg.attended),
                updatedAt: serverTimestamp(),
              });
            } else {
              await setDoc(statRef, {
                memberEmail: cleanEmail,
                memberEmailKey: reg.emailKey,
                memberName: cleanMemberName,
                title: cleanTitle,
                discipline: cleanDiscipline,
                notes: cleanNotes,
                location: '',
                startAt: reg.eventStartAt,
                durationMinutes: cleanDuration,
                coachUid: actorUid,
                coachName: '',
                objective: `${REG_STAT_PREFIX}${reg.id}`.slice(0, 120),
                isPaid: false,
                priceCents: 0,
                createdByUid: actorUid,
                createdByRole: 'coach' as const,
                completed: Boolean(reg.attended),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          } catch (statError) {
            console.warn(
              `archiveAdminCancelledRegistrations skipped for ${reg.id}:`,
              statError
            );
          }
        })
      );
    }
  } catch (error) {
    console.warn('archiveAdminCancelledRegistrations failed:', error);
  }
}

async function cancelRegistrationsAndDeleteEvent(
  eventId: string,
  confirmedRegs: Registration[],
  eventData?: Partial<SportEvent> | null
): Promise<void> {
  await deleteEventLikesForEvent(eventId);
  if (confirmedRegs.length > 0 && eventData?.cancelReason !== 'no_registrants') {
    await archiveAdminCancelledRegistrations(confirmedRegs, eventData);
  }

  const CHUNK_SIZE = 5;
  for (let i = 0; i < confirmedRegs.length; i += CHUNK_SIZE) {
    const chunk = confirmedRegs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const reg of chunk) {
      const regRef = doc(db, 'registrations', reg.id);
      const nextPayStatus =
        reg.paymentStatus === 'paid' ? 'refunded' : reg.paymentStatus;
      batch.update(regRef, {
        status: 'cancelled',
        ...(nextPayStatus ? { paymentStatus: nextPayStatus } : {}),
        updatedAt: serverTimestamp(),
      });
      if (reg.paymentStatus === 'paid') {
        const payRef = doc(db, 'payments', reg.id);
        const paySnap = await getDoc(payRef);
        if (paySnap.exists()) {
          batch.update(payRef, {
            status: 'refunded',
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
    if (i + CHUNK_SIZE >= confirmedRegs.length) {
      batch.delete(doc(db, 'events', eventId));
    }
    await batch.commit();
  }

  if (confirmedRegs.length === 0) {
    await deleteDoc(doc(db, 'events', eventId));
  }
}

export async function toggleEventStatus(
  eventId: string,
  nextStatus: EventStatus,
  cancelReason?: EventCancelReason
): Promise<void> {
  try {
    if (nextStatus === 'cancelled' && cancelReason !== 'no_registrants') {
      const [eventSnap, regSnap] = await Promise.all([
        getDoc(doc(db, 'events', eventId)),
        getDocs(
          query(collection(db, 'registrations'), where('eventId', '==', eventId))
        ),
      ]);
      const eventData = eventSnap.exists()
        ? (eventSnap.data() as Partial<SportEvent>)
        : null;
      const confirmedRegs = regSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Registration, 'id'>) }))
        .filter((r) => r.status === 'confirmed');
      if (confirmedRegs.length > 0) {
        await archiveAdminCancelledRegistrations(confirmedRegs, eventData);
        await notifyMembersOfCancelledEvent({
          eventId,
          eventData,
          confirmedRegs,
        });
      }
    }

    await updateDoc(doc(db, 'events', eventId), {
      status: nextStatus,
      cancelReason:
        nextStatus === 'cancelled' ? (cancelReason ?? 'manual') : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
  }
}

export async function syncEventRegisteredCounter(params: {
  event: SportEvent;
  confirmedCount: number;
  latestRegistrationId?: string;
}): Promise<boolean> {
  const maxAllowed = params.event.isUnlimitedCapacity
    ? 10000
    : Math.max(1, Math.min(200, Math.round(params.event.maxCapacity || 1)));
  const targetCount = Math.max(
    0,
    Math.min(Math.round(params.confirmedCount), maxAllowed)
  );
  const validIdRegex = /^[a-zA-Z0-9_-]{1,128}$/;
  const targetLastRegId =
    targetCount === 0
      ? 'none'
      : params.latestRegistrationId &&
          validIdRegex.test(params.latestRegistrationId)
        ? params.latestRegistrationId
        : params.event.lastRegId && validIdRegex.test(params.event.lastRegId)
          ? params.event.lastRegId
          : 'none';

  if (
    params.event.registeredCount === targetCount &&
    (targetCount > 0 || params.event.lastRegId === 'none')
  ) {
    return false;
  }

  try {
    await updateDoc(doc(db, 'events', params.event.id), {
      registeredCount: targetCount,
      lastRegId: targetLastRegId,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.warn(
      `Synchronisation du compteur différée pour events/${params.event.id}:`,
      error
    );
    return false;
  }
}

export async function autoDeleteCancelledEvent(
  eventId: string
): Promise<boolean> {
  try {
    const [eventSnap, regSnap] = await Promise.all([
      getDoc(doc(db, 'events', eventId)),
      getDocs(
        query(collection(db, 'registrations'), where('eventId', '==', eventId))
      ),
    ]);
    const eventData = eventSnap.exists()
      ? (eventSnap.data() as Partial<SportEvent>)
      : null;
    const confirmedRegs = regSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Registration, 'id'>) }))
      .filter((r) => r.status === 'confirmed');

    if (
      confirmedRegs.length > 0 &&
      eventData?.cancelReason !== 'no_registrants'
    ) {
      await notifyMembersOfCancelledEvent({
        eventId,
        eventData,
        confirmedRegs,
      });
    }

    await cancelRegistrationsAndDeleteEvent(eventId, confirmedRegs, eventData);
    return true;
  } catch (error) {
    console.warn(
      `Suppression automatique d’événement annulé différée pour events/${eventId}:`,
      error
    );
    return false;
  }
}

export async function deleteAutoCancelledEventIfEligible(
  eventId: string,
  isCoachUser: boolean
): Promise<boolean> {
  if (isCoachUser) {
    return autoDeleteCancelledEvent(eventId);
  }
  try {
    const eventRef = doc(db, 'events', eventId);
    const snap = await getDocFromServer(eventRef);
    if (!snap.exists()) return true;
    const ev = parseLiveSportEventSnapshot(
      snap.id,
      snap.data() as Partial<SportEvent>
    );
    const evalInfo = evaluateEventBooking(ev, Date.now());
    if (ev.status === 'cancelled' || evalInfo.isAutoCancelledNoRegistrants) {
      await deleteDoc(eventRef);
      return true;
    }
    return false;
  } catch (error) {
    console.warn(
      `Suppression d’événement annulé différée pour events/${eventId}:`,
      error
    );
    return false;
  }
}

export async function notifyMembersOfEndedEvent(
  event: SportEvent
): Promise<boolean> {
  try {
    if (event.status === 'published' && event.registeredCount > 0) {
      const regSnap = await getDocs(
        query(collection(db, 'registrations'), where('eventId', '==', event.id))
      );

      const pendingNotifs: Array<{
        reg: Registration;
        eventEndAt: Timestamp;
      }> = [];

      const fallbackEndAt = Timestamp.fromMillis(
        event.startAt.toMillis() + event.durationMinutes * 60 * 1000
      );

      for (const regDoc of regSnap.docs) {
        const reg = {
          id: regDoc.id,
          ...(regDoc.data() as Omit<Registration, 'id'>),
        };
        if (reg.status !== 'confirmed' || reg.attended) continue;

        const notifSnap = await getDoc(doc(db, 'memberNotifications', reg.id));
        if (!notifSnap.exists()) {
          pendingNotifs.push({
            reg,
            eventEndAt: reg.eventEndAt ?? fallbackEndAt,
          });
        }
      }

      if (pendingNotifs.length > 0) {
        const batch = writeBatch(db);
        pendingNotifs.forEach(({ reg, eventEndAt }) => {
          batch.set(doc(db, 'memberNotifications', reg.id), {
            registrationId: reg.id,
            eventId: reg.eventId,
            eventTitle: (reg.eventTitle || event.title).slice(
              0,
              VALIDATION_LIMITS.TITLE_MAX
            ),
            eventStartAt: reg.eventStartAt,
            eventEndAt,
            memberEmail: reg.email.trim().toLowerCase(),
            memberEmailKey: reg.emailKey,
            type: 'validate_session',
            read: false,
            validated: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    return true;
  } catch (error) {
    console.warn(
      `Notification de fin de séance différée pour events/${event.id}:`,
      error
    );
    return false;
  }
}

export async function deleteEndedEventAfterRetention(
  event: SportEvent
): Promise<boolean> {
  try {
    if (event.status === 'published') {
      await notifyMembersOfEndedEvent(event);
    }
    await deleteEventLikesForEvent(event.id);
    await deleteDoc(doc(db, 'events', event.id));
    return true;
  } catch (error) {
    console.warn(
      `Suppression automatique après 30 jours différée pour events/${event.id}:`,
      error
    );
    return false;
  }
}

export function subscribeMyMemberNotifications(
  email: string,
  onData: (notifications: MemberNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = email.trim().toLowerCase();
  const q = query(
    collection(db, 'memberNotifications'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: MemberNotification[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MemberNotification, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? a.eventEndAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? b.eventEndAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'memberNotifications');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function ensureSessionValidationNotification(
  reg: Registration,
  fallbackEndMs: number
): Promise<boolean> {
  if (reg.status !== 'confirmed' || reg.attended) return true;
  try {
    const notifRef = doc(db, 'memberNotifications', reg.id);
    const existing = await getDoc(notifRef);
    if (existing.exists()) return true;

    const eventEndAt =
      reg.eventEndAt ?? Timestamp.fromMillis(fallbackEndMs);
    await setDoc(notifRef, {
      registrationId: reg.id,
      eventId: reg.eventId,
      eventTitle: reg.eventTitle.slice(0, VALIDATION_LIMITS.TITLE_MAX),
      eventStartAt: reg.eventStartAt,
      eventEndAt,
      memberEmail: reg.email.trim().toLowerCase(),
      memberEmailKey: reg.emailKey,
      type: 'validate_session',
      read: false,
      validated: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.warn(
      `Création différée de notification fin de séance pour ${reg.id}:`,
      error
    );
    return false;
  }
}

export async function validateMemberSession(
  registration: Registration
): Promise<void> {
  if (registration.status !== 'confirmed') {
    throw new Error('Seule une inscription confirmée peut être validée.');
  }
  if (registration.attended) {
    return;
  }

  const regRef = doc(db, 'registrations', registration.id);
  const notifRef = doc(db, 'memberNotifications', registration.id);
  const batch = writeBatch(db);

  batch.update(regRef, {
    attended: true,
    memberValidated: true,
    updatedAt: serverTimestamp(),
  });

  try {
    const notifSnap = await getDoc(notifRef);
    if (notifSnap.exists()) {
      batch.update(notifRef, {
        validated: true,
        read: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `registrations/${registration.id}`
    );
  }
}

export async function markMemberNotificationRead(
  notificationId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'memberNotifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `memberNotifications/${notificationId}`
    );
  }
}

export async function markAllMemberNotificationsRead(
  notifications: MemberNotification[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  unread.forEach((n) => {
    batch.update(doc(db, 'memberNotifications', n.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'memberNotifications');
  }
}

export async function deleteMemberNotification(
  notificationId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'memberNotifications', notificationId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `memberNotifications/${notificationId}`
    );
  }
}

export function subscribeMyCoachNotifications(
  coachUid: string,
  onData: (notifications: CoachNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'coachNotifications'),
    where('coachUid', '==', coachUid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CoachNotification[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachNotification, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'coachNotifications');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function markCoachNotificationRead(
  notificationId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'coachNotifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `coachNotifications/${notificationId}`
    );
  }
}

export async function acknowledgeCoachRegistrationNotification(params: {
  notification: CoachNotification;
  event?: SportEvent | null;
  coachUid: string;
  coachEmail: string;
  coachName: string;
  coachPhotoUrl?: string;
  memberPhotoUrl?: string;
}): Promise<{ sent: boolean; messageText: string }> {
  await markCoachNotificationRead(params.notification.id);

  const coachFirstName = getEventCoachFirstName(
    params.event,
    params.coachUid,
    params.coachName
  );
  const messageText = buildRegistrationAckMessage(coachFirstName);

  const cleanMemberEmail = params.notification.memberEmail.trim().toLowerCase();
  const cleanCoachEmail = params.coachEmail.trim().toLowerCase();
  if (
    !cleanMemberEmail ||
    !cleanCoachEmail ||
    cleanMemberEmail === cleanCoachEmail
  ) {
    return { sent: false, messageText };
  }

  await sendDirectMessage({
    coachUid: params.coachUid,
    coachName: params.coachName,
    coachPhotoUrl: params.coachPhotoUrl,
    memberEmail: cleanMemberEmail,
    memberName: params.notification.memberName,
    memberPhotoUrl: params.memberPhotoUrl,
    senderUid: params.coachUid,
    senderEmail: cleanCoachEmail,
    senderName: params.coachName,
    senderRole: 'coach',
    text: messageText,
    contextEventId: params.notification.eventId,
    contextEventTitle: params.notification.eventTitle,
  });

  return { sent: true, messageText };
}

export async function markAllCoachNotificationsRead(
  notifications: CoachNotification[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;

  const batch = writeBatch(db);
  unread.forEach((n) => {
    batch.update(doc(db, 'coachNotifications', n.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'coachNotifications');
  }
}

export async function deleteCoachNotification(
  notificationId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'coachNotifications', notificationId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `coachNotifications/${notificationId}`
    );
  }
}

export async function deleteEvent(
  eventId: string
): Promise<{ cancelledRegistrations: number; notificationsSent: number }> {
  try {
    const [eventSnap, regSnap] = await Promise.all([
      getDoc(doc(db, 'events', eventId)),
      getDocs(
        query(collection(db, 'registrations'), where('eventId', '==', eventId))
      ),
    ]);
    const eventData = eventSnap.exists()
      ? (eventSnap.data() as Partial<SportEvent>)
      : null;
    const confirmedRegs = regSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Registration, 'id'>) }))
      .filter((r) => r.status === 'confirmed');

    const notificationsSent =
      confirmedRegs.length > 0
        ? await notifyMembersOfCancelledEvent({
            eventId,
            eventData,
            confirmedRegs,
          })
        : 0;

    await cancelRegistrationsAndDeleteEvent(eventId, confirmedRegs, eventData);
    return {
      cancelledRegistrations: confirmedRegs.length,
      notificationsSent,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `events/${eventId}`);
  }
}

export interface RegisterPaymentInput {
  method: 'free' | 'card' | 'onsite';
  cardBrand?: string;
  cardLast4?: string;
  paymentReference?: string;
  markPaidAsCoach?: boolean;
}

export interface RegisterEventResult {
  registrationId: string;
  emailKey: string;
  amountCents: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  cardBrand: string;
  cardLast4: string;
}

export interface GuestRegistrationResult extends RegisterEventResult {
  firstName: string;
  lastName: string;
  email: string;
}

export interface RegisterEventWithGuestsResult {
  primary: RegisterEventResult | null;
  guests: GuestRegistrationResult[];
  totalAmountCents: number;
}

export class PartialGuestBookingError extends Error {
  primary: RegisterEventResult | null;
  guests: GuestRegistrationResult[];

  constructor(
    message: string,
    primary: RegisterEventResult | null,
    guests: GuestRegistrationResult[]
  ) {
    super(message);
    this.name = 'PartialGuestBookingError';
    this.primary = primary;
    this.guests = guests;
  }
}

function parseLiveSportEventSnapshot(
  id: string,
  raw: Partial<SportEvent>
): SportEvent {
  const priceCents =
    typeof raw.priceCents === 'number' && raw.priceCents >= 0
      ? Math.round(raw.priceCents)
      : 0;
  const isPaid =
    Boolean(raw.isPaid) && priceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS;
  return {
    ...(raw as Omit<SportEvent, 'id'>),
    id,
    externalUrl: getSafeExternalHref(raw.externalUrl) ?? '',
    coverImageUrl: getSafeEventCoverImageSrc(raw.coverImageUrl) ?? '',
    coverImagePosition: normalizeCoverImagePosition(raw.coverImagePosition),
    city: typeof raw.city === 'string' && raw.city.trim() ? raw.city : 'Paris',
    region: typeof raw.region === 'string' ? raw.region : '',
    isUnlimitedCapacity: Boolean(raw.isUnlimitedCapacity),
    hasCoords: Boolean(raw.hasCoords),
    lat: typeof raw.lat === 'number' ? raw.lat : 0,
    lng: typeof raw.lng === 'number' ? raw.lng : 0,
    isPaid,
    priceCents: isPaid ? priceCents : 0,
    currency: 'EUR',
    paymentMode:
      raw.paymentMode === 'onsite' || raw.paymentMode === 'both'
        ? raw.paymentMode
        : 'online',
    likesCount:
      typeof raw.likesCount === 'number' && raw.likesCount >= 0
        ? Math.round(raw.likesCount)
        : 0,
    lastLikeId:
      typeof raw.lastLikeId === 'string' && raw.lastLikeId
        ? raw.lastLikeId
        : 'none',
    bookingCutoffMinutes: normalizeBookingCutoffMinutes(
      raw.bookingCutoffMinutes
    ),
    disableAutoClose: Boolean(raw.disableAutoClose),
  };
}

async function commitSingleParticipantRegistration(params: {
  event: SportEvent;
  firstName: string;
  lastName: string;
  email: string;
  isGuest: boolean;
  invitedByEmail?: string;
  invitedByEmailKey?: string;
  invitedByName?: string;
  bypassCutoffAsCoach?: boolean;
  isPaidEvent: boolean;
  amountCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference: string;
  cardBrand: string;
  cardLast4: string;
  prefetchedHostInvitedRegs?: Array<{ id: string; data: Partial<Registration> }>;
  prefetchedHostPayments?: Array<{ id: string; data: Partial<PaymentRecord> }>;
}): Promise<RegisterEventResult> {
  const email = params.email.trim().toLowerCase().slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const emailKey = await hashEmailKey(email);
  const registrationId = `${params.event.id}__${emailKey}`;

  const findExistingRegistration = async (): Promise<{
    id: string;
    data: Partial<Registration>;
  } | null> => {
    const regRefDirect = doc(db, 'registrations', registrationId);
    if (params.bypassCutoffAsCoach) {
      const snap = await getDocFromServer(regRefDirect);
      return snap.exists()
        ? { id: snap.id, data: snap.data() as Partial<Registration> }
        : null;
    }
    if (params.isGuest) {
      if (params.prefetchedHostInvitedRegs) {
        const cached = params.prefetchedHostInvitedRegs.find(
          (item) => item.id === registrationId
        );
        return cached ?? null;
      }
      const hostEmail = (params.invitedByEmail ?? '').trim().toLowerCase();
      if (!hostEmail) return null;
      const snap = await getDocsFromServer(
        query(
          collection(db, 'registrations'),
          where('invitedByEmail', '==', hostEmail)
        )
      );
      const matched = snap.docs.find((d) => d.id === registrationId);
      return matched
        ? { id: matched.id, data: matched.data() as Partial<Registration> }
        : null;
    }
    const snap = await getDocsFromServer(
      query(collection(db, 'registrations'), where('email', '==', email))
    );
    const matched = snap.docs.find(
      (d) =>
        d.id === registrationId ||
        (d.data() as Partial<Registration>).eventId === params.event.id
    );
    return matched
      ? { id: matched.id, data: matched.data() as Partial<Registration> }
      : null;
  };

  const findExistingPayment = async (
    targetRegistrationId: string
  ): Promise<boolean> => {
    const payRefDirect = doc(db, 'payments', targetRegistrationId);
    if (params.bypassCutoffAsCoach) {
      const snap = await getDocFromServer(payRefDirect);
      return snap.exists();
    }
    if (params.isGuest) {
      if (params.prefetchedHostPayments) {
        return params.prefetchedHostPayments.some(
          (item) =>
            item.id === targetRegistrationId ||
            item.data.registrationId === targetRegistrationId
        );
      }
      const hostEmail = (params.invitedByEmail ?? '').trim().toLowerCase();
      if (!hostEmail) return false;
      const snap = await getDocsFromServer(
        query(collection(db, 'payments'), where('payerEmail', '==', hostEmail))
      );
      return snap.docs.some(
        (d) =>
          d.id === targetRegistrationId ||
          (d.data() as Partial<PaymentRecord>).registrationId ===
            targetRegistrationId
      );
    }
    const snap = await getDocsFromServer(
      query(collection(db, 'payments'), where('memberEmail', '==', email))
    );
    return snap.docs.some(
      (d) =>
        d.id === targetRegistrationId ||
        (d.data() as Partial<PaymentRecord>).registrationId ===
          targetRegistrationId
    );
  };

  const formatPermissionDeniedError = (error: unknown): never => {
    const errInfo = buildFirestoreErrorInfo(
      error,
      OperationType.WRITE,
      `registrations/${registrationId}`
    );
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
      if (params.isGuest) {
        throw new Error(
          `Impossible d’inscrire l’invité(e) ${params.firstName} ${params.lastName} (${email}) : cette adresse email est peut-être déjà inscrite à cette séance.`
        );
      }
      const signedInEmail = auth.currentUser?.email?.trim().toLowerCase() ?? '';
      if (!params.bypassCutoffAsCoach && signedInEmail && signedInEmail !== email) {
        throw new Error(
          `L’adresse email saisie (${email}) doit correspondre à votre compte connecté (${signedInEmail}).`
        );
      }
      throw new Error(
        'Impossible de valider votre inscription pour le moment (autorisation refusée). Vérifiez votre connexion et réessayez.'
      );
    }
    throw new Error(JSON.stringify(errInfo));
  };

  let existingReg: { id: string; data: Partial<Registration> } | null = null;
  try {
    existingReg = await findExistingRegistration();
  } catch (error) {
    formatPermissionDeniedError(error);
  }

  let existingEmail = email;
  if (existingReg) {
    if (existingReg.data.status === 'confirmed') {
      throw new Error(
        params.isGuest
          ? `L’invité(e) « ${email} » est déjà inscrit(e) à cette séance.`
          : 'Cette adresse email est déjà inscrite à cette séance.'
      );
    }
    if (typeof existingReg.data.email === 'string' && existingReg.data.email) {
      existingEmail = existingReg.data.email;
    }
  }

  const targetRegistrationId = existingReg?.id ?? registrationId;
  const batch = writeBatch(db);
  const regRef = doc(db, 'registrations', targetRegistrationId);
  const eventRef = doc(db, 'events', params.event.id);

  const durationMinutes = Math.round(params.event.durationMinutes);
  const eventEndAt = Timestamp.fromMillis(
    params.event.startAt.toMillis() + durationMinutes * 60 * 1000
  );

  const guestFieldsForCreate = params.isGuest
    ? {
        isGuest: true,
        invitedByEmail: params.invitedByEmail,
        invitedByEmailKey: params.invitedByEmailKey,
        invitedByName: (params.invitedByName ?? '').slice(0, 125),
      }
    : {
        isGuest: false,
      };

  const guestFieldsForUpdate = params.isGuest
    ? guestFieldsForCreate
    : {
        isGuest: false,
        invitedByEmail: deleteField(),
        invitedByEmailKey: deleteField(),
        invitedByName: deleteField(),
      };

  const registrationBasePayload = {
    eventId: params.event.id,
    eventTitle: params.event.title.slice(0, VALIDATION_LIMITS.TITLE_MAX),
    eventStartAt: params.event.startAt,
    eventDurationMinutes: durationMinutes,
    eventEndAt,
    firstName: params.firstName,
    lastName: params.lastName,
    email: existingEmail,
    emailKey,
    attended: false,
    memberValidated: false,
    status: 'confirmed',
    amountCents: params.amountCents,
    currency: 'EUR',
    paymentStatus: params.paymentStatus,
    paymentMethod: params.paymentMethod,
    paymentReference: params.paymentReference,
    cardBrand: params.cardBrand,
    cardLast4: params.cardLast4,
    paidAt: params.paymentStatus === 'paid' ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  };

  if (existingReg) {
    batch.update(regRef, {
      ...registrationBasePayload,
      ...guestFieldsForUpdate,
    });
  } else {
    batch.set(regRef, {
      ...registrationBasePayload,
      ...guestFieldsForCreate,
      createdAt: serverTimestamp(),
    });
  }

  if (
    params.isPaidEvent &&
    (params.paymentMethod === 'card' || params.paymentMethod === 'onsite')
  ) {
    const payRef = doc(db, 'payments', targetRegistrationId);
    let existingPayExists = false;
    try {
      existingPayExists = await findExistingPayment(targetRegistrationId);
    } catch (error) {
      formatPermissionDeniedError(error);
    }
    const paymentPayload = {
      eventTitle: params.event.title.slice(0, VALIDATION_LIMITS.TITLE_MAX),
      eventStartAt: params.event.startAt,
      memberName: `${params.firstName} ${params.lastName}`.trim().slice(0, 125),
      amountCents: params.amountCents,
      method: params.paymentMethod,
      status: params.paymentStatus === 'paid' ? 'paid' : 'pending',
      reference: params.paymentReference,
      cardBrand: params.cardBrand,
      cardLast4: params.cardLast4,
      paidAt: params.paymentStatus === 'paid' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    };

    if (existingPayExists) {
      batch.update(payRef, {
        ...paymentPayload,
        ...(params.isGuest
          ? { isGuest: true, payerEmail: params.invitedByEmail }
          : { isGuest: false, payerEmail: deleteField() }),
      });
    } else {
      batch.set(payRef, {
        registrationId: targetRegistrationId,
        eventId: params.event.id,
        memberEmail: email,
        memberEmailKey: emailKey,
        currency: 'EUR',
        ...paymentPayload,
        ...(params.isGuest
          ? { isGuest: true, payerEmail: params.invitedByEmail }
          : { isGuest: false }),
        createdAt: serverTimestamp(),
      });
    }
  }

  batch.update(eventRef, {
    registeredCount: increment(1),
    lastRegId: targetRegistrationId,
    updatedAt: serverTimestamp(),
  });

  const rawCoachUids =
    Array.isArray(params.event.coachUids) && params.event.coachUids.length > 0
      ? params.event.coachUids
      : [params.event.createdBy];
  const targetCoachUids = Array.from(
    new Set(rawCoachUids.map((u) => u.trim()).filter(Boolean))
  ).slice(0, VALIDATION_LIMITS.COACHES_PER_EVENT_MAX);

  targetCoachUids.forEach((targetCoachUid) => {
    const notifRef = doc(collection(db, 'coachNotifications'));
    batch.set(notifRef, {
      coachUid: targetCoachUid,
      type: 'new_registration',
      eventId: params.event.id,
      eventTitle: params.event.title.slice(0, VALIDATION_LIMITS.TITLE_MAX),
      eventStartAt: params.event.startAt,
      registrationId: targetRegistrationId,
      memberName: `${params.firstName} ${params.lastName}`.trim().slice(0, 125),
      memberEmail: email,
      ...(params.isGuest && params.invitedByName
        ? { invitedByName: params.invitedByName.slice(0, 125) }
        : {}),
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
    return {
      registrationId: targetRegistrationId,
      emailKey,
      amountCents: params.amountCents,
      paymentStatus: params.paymentStatus,
      paymentMethod: params.paymentMethod,
      paymentReference: params.paymentReference,
      cardBrand: params.cardBrand,
      cardLast4: params.cardLast4,
    };
  } catch (error) {
    try {
      const latestSnap = await getDocFromServer(eventRef);
      if (latestSnap.exists()) {
        const latestEvent = parseLiveSportEventSnapshot(
          latestSnap.id,
          latestSnap.data() as Partial<SportEvent>
        );
        const latestEval = evaluateEventBooking(latestEvent, Date.now());
        if (
          latestEval.state === 'cancelled' &&
          (!params.bypassCutoffAsCoach || latestEvent.status === 'cancelled')
        ) {
          throw new Error(
            latestEval.isAutoCancelledNoRegistrants
              ? 'Inscriptions clôturées : pas d’inscrit à cette séance, séance annulée.'
              : 'Inscriptions clôturées : séance annulée.'
          );
        }
        if (latestEval.state === 'closed' && !params.bypassCutoffAsCoach) {
          throw new Error(
            'Les inscriptions pour cette séance sont clôturées.'
          );
        }
        if (latestEval.state === 'past' && !params.bypassCutoffAsCoach) {
          throw new Error(
            'Les inscriptions sont fermées : cette séance a déjà commencé.'
          );
        }
        if (latestEval.state === 'full') {
          throw new Error('La dernière place vient d’être réservée.');
        }
      }
      const latestReg = await findExistingRegistration();
      if (latestReg && latestReg.data.status === 'confirmed') {
        throw new Error(
          params.isGuest
            ? `L’invité(e) « ${email} » est déjà inscrit(e) à cette séance.`
            : 'Cette adresse email est déjà inscrite à cette séance.'
        );
      }
    } catch (innerError) {
      if (
        innerError instanceof Error &&
        (innerError.message.includes('clôturées') ||
          innerError.message.includes('fermée') ||
          innerError.message.includes('commencé') ||
          innerError.message.includes('dernière place') ||
          innerError.message.includes('annulé') ||
          innerError.message.includes('déjà inscrit'))
      ) {
        throw innerError;
      }
    }

    return formatPermissionDeniedError(error);
  }
}

export async function registerEventWithGuests(params: {
  event: SportEvent;
  firstName: string;
  lastName: string;
  email: string;
  guests?: GuestInput[];
  skipSelf?: boolean;
  bypassCutoffAsCoach?: boolean;
  payment?: RegisterPaymentInput;
}): Promise<RegisterEventWithGuestsResult> {
  const firstName = params.firstName
    .trim()
    .slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
  const lastName = params.lastName
    .trim()
    .slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);
  const email = params.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  if (firstName.length < VALIDATION_LIMITS.FIRST_NAME_MIN) {
    throw new Error('Veuillez saisir votre prénom.');
  }
  if (lastName.length < VALIDATION_LIMITS.LAST_NAME_MIN) {
    throw new Error('Veuillez saisir votre nom.');
  }
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(email)) {
    throw new Error('Veuillez saisir une adresse email valide.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email || currentUser.isAnonymous) {
    throw new Error(
      'Veuillez vous connecter avec votre compte pour confirmer votre inscription.'
    );
  }

  const rawGuests = params.guests ?? [];
  if (rawGuests.length > VALIDATION_LIMITS.GUESTS_PER_BOOKING_MAX) {
    throw new Error(
      `Vous pouvez ajouter au maximum ${VALIDATION_LIMITS.GUESTS_PER_BOOKING_MAX} invités à la fois.`
    );
  }

  const normalizedGuests: GuestInput[] = [];
  const seenGuestEmails = new Set<string>();
  for (let i = 0; i < rawGuests.length; i += 1) {
    const g = rawGuests[i];
    const gFirst = (g.firstName || '').trim().slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
    const gLast = (g.lastName || '').trim().slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);
    const gEmail = (g.email || '')
      .trim()
      .toLowerCase()
      .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

    if (gFirst.length < VALIDATION_LIMITS.FIRST_NAME_MIN) {
      throw new Error(`Veuillez saisir le prénom de l’invité ${i + 1}.`);
    }
    if (gLast.length < VALIDATION_LIMITS.LAST_NAME_MIN) {
      throw new Error(`Veuillez saisir le nom de l’invité ${i + 1}.`);
    }
    if (!VALIDATION_LIMITS.EMAIL_REGEX.test(gEmail)) {
      throw new Error(
        `Veuillez saisir une adresse email valide pour l’invité ${i + 1}.`
      );
    }
    if (gEmail === email) {
      throw new Error(
        `L’invité ${i + 1} ne peut pas utiliser la même adresse email que vous (${gEmail}).`
      );
    }
    if (seenGuestEmails.has(gEmail)) {
      throw new Error(
        `L’adresse email « ${gEmail} » est saisie plusieurs fois dans vos invités.`
      );
    }
    seenGuestEmails.add(gEmail);
    normalizedGuests.push({
      firstName: gFirst,
      lastName: gLast,
      email: gEmail,
    });
  }

  if (params.skipSelf && normalizedGuests.length === 0) {
    throw new Error('Veuillez ajouter au moins un invité.');
  }

  // Live capacity & status verification before writing any batch
  let liveEvent = params.event;
  try {
    const liveEventSnap = await getDocFromServer(doc(db, 'events', params.event.id));
    if (!liveEventSnap.exists()) {
      throw new Error('Cet événement n’existe plus.');
    }
    liveEvent = parseLiveSportEventSnapshot(
      liveEventSnap.id,
      liveEventSnap.data() as Partial<SportEvent>
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('n’existe plus')) {
      throw err;
    }
  }

  const evaluation = evaluateEventBooking(liveEvent, Date.now());
  if (
    evaluation.state === 'cancelled' &&
    (!params.bypassCutoffAsCoach || liveEvent.status === 'cancelled')
  ) {
    throw new Error(
      evaluation.isAutoCancelledNoRegistrants
        ? 'Inscriptions clôturées : pas d’inscrit à cette séance, séance annulée.'
        : 'Inscriptions clôturées : séance annulée.'
    );
  }
  if (evaluation.state === 'full') {
    throw new Error('Cet événement est complet.');
  }
  if (!params.bypassCutoffAsCoach && evaluation.state === 'closed') {
    throw new Error('Les inscriptions pour cette séance sont clôturées.');
  }
  if (!params.bypassCutoffAsCoach && evaluation.state === 'past') {
    throw new Error(
      'Les inscriptions sont fermées : cet événement est déjà commencé ou terminé.'
    );
  }

  const neededSpots = (params.skipSelf ? 0 : 1) + normalizedGuests.length;
  if (!liveEvent.isUnlimitedCapacity) {
    const remaining = Math.max(0, liveEvent.maxCapacity - liveEvent.registeredCount);
    if (remaining < neededSpots) {
      throw new Error(
        `Il ne reste que ${remaining} place${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''} pour cette séance (vous demandez ${neededSpots} place${neededSpots > 1 ? 's' : ''}).`
      );
    }
  }

  const isPaidEvent =
    Boolean(liveEvent.isPaid) &&
    typeof liveEvent.priceCents === 'number' &&
    liveEvent.priceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS;
  const amountCents = isPaidEvent ? Math.round(liveEvent.priceCents!) : 0;
  const allowedMode: EventPaymentMode = liveEvent.paymentMode ?? 'online';

  let paymentMethod: PaymentMethod = 'free';
  let paymentStatus: PaymentStatus = 'free';
  let cardBrand = '';
  let cardLast4 = '';

  if (isPaidEvent) {
    const requestedMethod = params.payment?.method;
    if (requestedMethod !== 'card' && requestedMethod !== 'onsite') {
      throw new Error(
        'Veuillez choisir un mode de règlement pour cette séance payante.'
      );
    }
    if (
      !params.bypassCutoffAsCoach &&
      requestedMethod === 'card' &&
      allowedMode === 'onsite'
    ) {
      throw new Error('Cette séance se règle uniquement sur place.');
    }
    if (
      !params.bypassCutoffAsCoach &&
      requestedMethod === 'onsite' &&
      allowedMode === 'online'
    ) {
      throw new Error('Cette séance nécessite un règlement par carte en ligne.');
    }

    paymentMethod = requestedMethod;
    if (requestedMethod === 'card') {
      const cleanLast4 = (params.payment?.cardLast4 ?? '')
        .replace(/\D/g, '')
        .slice(-4);
      if (cleanLast4.length !== 4) {
        throw new Error('Informations de carte bancaire incomplètes.');
      }
      cardBrand = (params.payment?.cardBrand ?? 'CB').trim().slice(0, 24);
      cardLast4 = cleanLast4;
      paymentStatus = 'paid';
    } else {
      paymentStatus =
        params.bypassCutoffAsCoach && params.payment?.markPaidAsCoach
          ? 'paid'
          : 'pending';
    }
  }

  const signedInEmail = currentUser.email.trim().toLowerCase();
  const hostEmailKey =
    normalizedGuests.length > 0 ? await hashEmailKey(signedInEmail) : '';
  const hostDisplayName = `${firstName} ${lastName}`.trim().slice(0, 125);

  let prefetchedHostInvitedRegs:
    | Array<{ id: string; data: Partial<Registration> }>
    | undefined;
  let prefetchedHostPayments:
    | Array<{ id: string; data: Partial<PaymentRecord> }>
    | undefined;

  if (normalizedGuests.length > 0 && params.bypassCutoffAsCoach) {
    const guestChecks = await Promise.all(
      normalizedGuests.map(async (guest) => {
        const guestEmailKey = await hashEmailKey(guest.email);
        const guestRegId = `${liveEvent.id}__${guestEmailKey}`;
        const snap = await getDocFromServer(doc(db, 'registrations', guestRegId));
        return { guest, snap };
      })
    );
    for (const { guest, snap } of guestChecks) {
      if (snap.exists() && (snap.data() as Partial<Registration>).status === 'confirmed') {
        throw new Error(
          `L’invité(e) ${guest.firstName} ${guest.lastName} (${guest.email}) est déjà inscrit(e) à cette séance.`
        );
      }
    }
  } else if (normalizedGuests.length > 0 && !params.bypassCutoffAsCoach) {
    const [invitedRegsSnap, hostPaySnap] = await Promise.all([
      getDocsFromServer(
        query(
          collection(db, 'registrations'),
          where('invitedByEmail', '==', signedInEmail)
        )
      ),
      isPaidEvent
        ? getDocsFromServer(
            query(
              collection(db, 'payments'),
              where('payerEmail', '==', signedInEmail)
            )
          )
        : Promise.resolve(null),
    ]);

    prefetchedHostInvitedRegs = invitedRegsSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Partial<Registration>,
    }));
    prefetchedHostPayments = hostPaySnap
      ? hostPaySnap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Partial<PaymentRecord>,
        }))
      : [];

    for (const guest of normalizedGuests) {
      const guestEmailKey = await hashEmailKey(guest.email);
      const guestRegId = `${liveEvent.id}__${guestEmailKey}`;
      const existingInvited = prefetchedHostInvitedRegs.find(
        (item) => item.id === guestRegId
      );
      if (existingInvited && existingInvited.data.status === 'confirmed') {
        throw new Error(
          `L’invité(e) ${guest.firstName} ${guest.lastName} (${guest.email}) est déjà inscrit(e) à cette séance.`
        );
      }
    }
  }

  let primaryResult: RegisterEventResult | null = null;
  if (!params.skipSelf) {
    const primaryRef = isPaidEvent
      ? (
          params.payment?.paymentReference?.trim() ||
          generatePaymentReference('GFN')
        ).slice(0, VALIDATION_LIMITS.PAYMENT_REF_MAX)
      : '';
    primaryResult = await commitSingleParticipantRegistration({
      event: liveEvent,
      firstName,
      lastName,
      email,
      isGuest: false,
      bypassCutoffAsCoach: params.bypassCutoffAsCoach,
      isPaidEvent,
      amountCents,
      paymentMethod,
      paymentStatus,
      paymentReference: primaryRef,
      cardBrand,
      cardLast4,
    });
  }

  const guestResults: GuestRegistrationResult[] = [];
  for (let i = 0; i < normalizedGuests.length; i += 1) {
    const guest = normalizedGuests[i];
    const guestRef = isPaidEvent
      ? generatePaymentReference('GFN').slice(0, VALIDATION_LIMITS.PAYMENT_REF_MAX)
      : '';
    try {
      const res = await commitSingleParticipantRegistration({
        event: liveEvent,
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        isGuest: true,
        invitedByEmail: signedInEmail,
        invitedByEmailKey: hostEmailKey,
        invitedByName: hostDisplayName,
        bypassCutoffAsCoach: params.bypassCutoffAsCoach,
        isPaidEvent,
        amountCents,
        paymentMethod,
        paymentStatus,
        paymentReference: guestRef,
        cardBrand,
        cardLast4,
        prefetchedHostInvitedRegs,
        prefetchedHostPayments,
      });
      guestResults.push({
        ...res,
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
      });
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.message
          : `Impossible d’inscrire l’invité(e) ${guest.firstName} ${guest.lastName}.`;
      if (primaryResult || guestResults.length > 0) {
        const doneParts: string[] = [];
        if (primaryResult) doneParts.push('votre inscription');
        if (guestResults.length > 0) {
          doneParts.push(
            `${guestResults.length} invité${guestResults.length > 1 ? 's' : ''}`
          );
        }
        throw new PartialGuestBookingError(
          `Enregistrement partiel (${doneParts.join(' et ')} confirmé(e)s), mais erreur pour ${guest.firstName} ${guest.lastName} : ${detail}`,
          primaryResult,
          guestResults
        );
      }
      throw err;
    }
  }

  return {
    primary: primaryResult,
    guests: guestResults,
    totalAmountCents:
      (primaryResult ? primaryResult.amountCents : 0) +
      guestResults.reduce((sum, g) => sum + g.amountCents, 0),
  };
}

export async function registerForEvent(params: {
  event: SportEvent;
  firstName: string;
  lastName: string;
  email: string;
  bypassCutoffAsCoach?: boolean;
  payment?: RegisterPaymentInput;
}): Promise<RegisterEventResult> {
  const result = await registerEventWithGuests({
    ...params,
    guests: [],
    skipSelf: false,
  });
  if (!result.primary) {
    throw new Error('Impossible de finaliser votre inscription.');
  }
  return result.primary;
}

export async function cancelMyRegistration(
  registration: Registration
): Promise<void> {
  if (registration.status !== 'confirmed') {
    throw new Error('Cette inscription est déjà annulée.');
  }
  if (registration.attended) {
    throw new Error(
      'Une séance déjà validée ne peut plus être annulée.'
    );
  }
  if (registration.eventStartAt.toMillis() <= Date.now()) {
    throw new Error(
      'Cette séance a déjà commencé : il n’est plus possible d’annuler votre inscription.'
    );
  }

  const regRef = doc(db, 'registrations', registration.id);
  const eventRef = doc(db, 'events', registration.eventId);
  const payRef = doc(db, 'payments', registration.id);

  try {
    const [regSnap, eventSnap] = await Promise.all([
      getDocFromServer(regRef),
      getDocFromServer(eventRef),
    ]);

    if (!regSnap.exists()) {
      throw new Error('Inscription introuvable.');
    }

    const liveReg = regSnap.data() as Partial<Registration>;
    if (liveReg.status !== 'confirmed') {
      throw new Error('Cette inscription est déjà annulée.');
    }
    if (liveReg.attended) {
      throw new Error(
        'Une séance déjà validée ne peut plus être annulée.'
      );
    }

    const regStartMs =
      liveReg.eventStartAt?.toMillis?.() ?? registration.eventStartAt.toMillis();
    const eventData = eventSnap.exists()
      ? (eventSnap.data() as Partial<SportEvent>)
      : null;
    const eventStartMs = eventData?.startAt?.toMillis?.() ?? regStartMs;

    if (Math.min(regStartMs, eventStartMs) <= Date.now()) {
      throw new Error(
        'Cette séance a déjà commencé : il n’est plus possible d’annuler votre inscription.'
      );
    }

    const isPaid = liveReg.paymentStatus === 'paid';
    let shouldRefundPaymentDoc = false;
    if (isPaid) {
      const regEmail = (liveReg.email || registration.email).trim().toLowerCase();
      const signedInEmail = auth.currentUser?.email?.trim().toLowerCase() ?? '';
      const isHostedGuest =
        Boolean(liveReg.isGuest ?? registration.isGuest) &&
        Boolean(signedInEmail) &&
        (liveReg.invitedByEmail || registration.invitedByEmail || '')
          .trim()
          .toLowerCase() === signedInEmail;

      const payQuerySnap = await getDocsFromServer(
        isHostedGuest
          ? query(
              collection(db, 'payments'),
              where('payerEmail', '==', signedInEmail)
            )
          : query(collection(db, 'payments'), where('memberEmail', '==', regEmail))
      );
      const matchedPay = payQuerySnap.docs.find(
        (d) =>
          d.id === registration.id ||
          (d.data() as Partial<PaymentRecord>).registrationId === registration.id
      );
      if (matchedPay && matchedPay.data()?.status === 'paid') {
        shouldRefundPaymentDoc = true;
      }
    }

    const batch = writeBatch(db);
    batch.update(regRef, {
      status: 'cancelled',
      ...(isPaid ? { paymentStatus: 'refunded' } : {}),
      updatedAt: serverTimestamp(),
    });

    if (
      eventData &&
      eventData.status === 'published' &&
      typeof eventData.registeredCount === 'number' &&
      eventData.registeredCount > 0
    ) {
      batch.update(eventRef, {
        registeredCount: increment(-1),
        lastRegId: registration.id,
        updatedAt: serverTimestamp(),
      });
    }

    if (shouldRefundPaymentDoc) {
      batch.update(payRef, {
        status: 'refunded',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('introuvable') ||
        error.message.includes('déjà annulée') ||
        error.message.includes('déjà validée') ||
        error.message.includes('déjà commencé'))
    ) {
      throw error;
    }
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `registrations/${registration.id}`
    );
  }
}

export async function updateRegistrationPaymentStatus(
  registration: Registration,
  nextStatus: 'paid' | 'pending' | 'refunded'
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const paidAtValue = nextStatus === 'paid' ? serverTimestamp() : null;
    batch.update(doc(db, 'registrations', registration.id), {
      paymentStatus: nextStatus,
      paidAt: paidAtValue,
      updatedAt: serverTimestamp(),
    });
    const payRef = doc(db, 'payments', registration.id);
    const paySnap = await getDoc(payRef);
    if (paySnap.exists()) {
      batch.update(payRef, {
        status: nextStatus,
        paidAt: paidAtValue,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `registrations/${registration.id}`
    );
  }
}

export async function toggleRegistrationAttendance(
  registrationId: string,
  attended: boolean
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'registrations', registrationId), {
      attended,
      updatedAt: serverTimestamp(),
    });
    const notifRef = doc(db, 'memberNotifications', registrationId);
    const notifSnap = await getDoc(notifRef);
    if (notifSnap.exists()) {
      batch.update(notifRef, {
        validated: attended,
        ...(attended ? { read: true } : {}),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `registrations/${registrationId}`
    );
  }
}

const REG_STAT_PREFIX = 'GFN_REG_STAT:';

function buildArchivedRegistrationStatDocId(registrationId: string): string {
  const sanitize = (val: string) => val.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `regstat__${sanitize(registrationId)}`.slice(0, 128);
}

export interface RemoveRegistrationOptions {
  isCoachAdmin?: boolean;
  actorUid?: string;
  eventDiscipline?: string;
  eventDurationMinutes?: number;
  memberReferentCoachUid?: string;
  isPrimaryBootstrapped?: boolean;
}

export async function removeRegistration(
  registration: Registration,
  eventRegisteredCount: number,
  options?: RemoveRegistrationOptions
): Promise<void> {
  if (!options?.isCoachAdmin) {
    throw new Error(
      'Seul un administrateur peut supprimer un inscrit à une séance.'
    );
  }

  const actorUid = (options.actorUid || auth.currentUser?.uid || '').trim();
  const regRef = doc(db, 'registrations', registration.id);
  const payRef = doc(db, 'payments', registration.id);
  const eventRef = doc(db, 'events', registration.eventId);
  const statDocId = buildArchivedRegistrationStatDocId(registration.id);
  const statRef = doc(db, 'memberSchedules', statDocId);

  const readLiveDoc = async (ref: ReturnType<typeof doc>) => {
    try {
      return await getDocFromServer(ref);
    } catch {
      try {
        return await getDoc(ref);
      } catch {
        return null;
      }
    }
  };

  const readLiveEventRegs = async () => {
    const q = query(
      collection(db, 'registrations'),
      where('eventId', '==', registration.eventId)
    );
    try {
      return await getDocsFromServer(q);
    } catch {
      try {
        return await getDocs(q);
      } catch {
        return null;
      }
    }
  };

  const [regSnap, paySnap, eventSnap, statSnap, eventRegsSnap] =
    await Promise.all([
      readLiveDoc(regRef),
      readLiveDoc(payRef),
      readLiveDoc(eventRef),
      actorUid ? readLiveDoc(statRef) : Promise.resolve(null),
      readLiveEventRegs(),
    ]);

  const liveRegData = regSnap?.exists()
    ? (regSnap.data() as Partial<Registration>)
    : null;
  const liveRegStatus = liveRegData?.status ?? registration.status;
  const liveAttended = Boolean(
    liveRegData?.attended ?? registration.attended
  );
  const liveEventData = eventSnap?.exists()
    ? (eventSnap.data() as Partial<SportEvent>)
    : null;
  const liveEventCount = liveEventData?.registeredCount ?? eventRegisteredCount;
  const remainingConfirmedDocs = eventRegsSnap
    ? eventRegsSnap.docs.filter(
        (d) =>
          d.id !== registration.id &&
          (d.data() as Partial<Registration>).status === 'confirmed'
      )
    : null;
  const fallbackRemainingCount =
    typeof liveEventCount === 'number' && liveEventCount > 0
      ? liveEventCount - 1
      : 0;
  const rawTargetCount = remainingConfirmedDocs
    ? remainingConfirmedDocs.length
    : fallbackRemainingCount;
  const maxAllowedCount =
    liveEventData &&
    !liveEventData.isUnlimitedCapacity &&
    typeof liveEventData.maxCapacity === 'number' &&
    liveEventData.maxCapacity >= 1
      ? liveEventData.maxCapacity
      : 10000;
  const targetRegisteredCount = Math.max(
    0,
    Math.min(rawTargetCount, maxAllowedCount)
  );
  const nextLastRegId =
    remainingConfirmedDocs !== null
      ? remainingConfirmedDocs[0]?.id || 'none'
      : undefined;
  const shouldSyncEventCounter =
    (eventSnap ? eventSnap.exists() : true) &&
    (remainingConfirmedDocs !== null
      ? liveEventData?.registeredCount !== targetRegisteredCount ||
        liveEventData?.lastRegId === registration.id
      : (regSnap
          ? regSnap.exists() && liveRegStatus !== 'cancelled'
          : registration.status !== 'cancelled') &&
        typeof liveEventCount === 'number' &&
        liveEventCount > 0);
  const eventCounterUpdatePayload =
    nextLastRegId !== undefined
      ? {
          registeredCount: targetRegisteredCount,
          lastRegId: nextLastRegId,
          updatedAt: serverTimestamp(),
        }
      : {
          registeredCount: targetRegisteredCount,
          updatedAt: serverTimestamp(),
        };

  const isPaidPayment =
    (paySnap?.exists() ? paySnap.data()?.status : undefined) === 'paid' ||
    registration.paymentStatus === 'paid';

  const cleanEmail = registration.email.trim().toLowerCase();
  const rawTitle = (
    liveEventData?.title ||
    registration.eventTitle ||
    'Séance'
  )
    .trim()
    .slice(0, 100);
  const cleanTitle = rawTitle.length >= 2 ? rawTitle : 'Séance';
  const rawDiscipline = (
    liveEventData?.discipline ||
    options.eventDiscipline ||
    registration.discipline ||
    'Événement'
  )
    .trim()
    .slice(0, 50);
  const cleanDiscipline =
    rawDiscipline.length >= 2 ? rawDiscipline : 'Événement';
  const cleanDuration = Math.min(
    240,
    Math.max(
      15,
      Math.round(
        liveEventData?.durationMinutes ??
          options.eventDurationMinutes ??
          registration.eventDurationMinutes ??
          60
      )
    )
  );
  const cleanMemberName =
    `${registration.firstName} ${registration.lastName}`
      .trim()
      .slice(0, 125) || cleanEmail.slice(0, 125);
  const targetCoachUid = options.isPrimaryBootstrapped
    ? options.memberReferentCoachUid?.trim() || actorUid
    : actorUid;

  const buildArchiveNotes = (firstNameMax: number, lastNameMax: number) =>
    JSON.stringify({
      regId: registration.id,
      eventId: registration.eventId,
      isGuest: Boolean(registration.isGuest),
      firstName: registration.firstName.trim().slice(0, firstNameMax),
      lastName: registration.lastName.trim().slice(0, lastNameMax),
      cancelledBy: 'admin',
    });
  let cleanNotes = buildArchiveNotes(50, 50);
  if (cleanNotes.length > VALIDATION_LIMITS.SCHEDULE_NOTES_MAX) {
    cleanNotes = buildArchiveNotes(20, 20).slice(
      0,
      VALIDATION_LIMITS.SCHEDULE_NOTES_MAX
    );
  }

  const statAlreadyExists = Boolean(statSnap?.exists());
  const existingStatCoachUid = statSnap?.exists()
    ? String(statSnap.data()?.coachUid ?? '')
    : '';
  const canUpdateExistingStat =
    statAlreadyExists &&
    Boolean(actorUid) &&
    (Boolean(options.isPrimaryBootstrapped) || existingStatCoachUid === actorUid);
  const canCreateArchiveStat =
    Boolean(actorUid) &&
    !statAlreadyExists &&
    liveRegStatus === 'confirmed' &&
    Boolean(cleanEmail) &&
    Boolean(registration.emailKey);

  const statCreatePayload = {
    memberEmail: cleanEmail,
    memberEmailKey: registration.emailKey,
    memberName: cleanMemberName,
    title: cleanTitle,
    discipline: cleanDiscipline,
    notes: cleanNotes,
    location: '',
    startAt: registration.eventStartAt,
    durationMinutes: cleanDuration,
    coachUid: targetCoachUid,
    coachName: '',
    objective: `${REG_STAT_PREFIX}${registration.id}`.slice(0, 120),
    isPaid: false,
    priceCents: 0,
    createdByUid: actorUid,
    createdByRole: 'coach' as const,
    completed: liveAttended,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const statUpdatePayload = {
    notes: cleanNotes,
    completed: liveAttended,
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  if (canCreateArchiveStat) {
    batch.set(statRef, statCreatePayload);
  } else if (canUpdateExistingStat && liveRegStatus === 'confirmed') {
    batch.update(statRef, statUpdatePayload);
  }
  batch.delete(regRef);
  if (paySnap?.exists()) {
    if (isPaidPayment) {
      batch.update(payRef, {
        status: 'refunded',
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.delete(payRef);
    }
  }
  if (shouldSyncEventCounter) {
    batch.update(eventRef, eventCounterUpdatePayload);
  }

  try {
    await batch.commit();
  } catch (batchError) {
    // Fallback: preserve stats first, then delete the registration directly so a
    // legacy/stale payment or event doc does not block removing the participant.
    if (canCreateArchiveStat) {
      try {
        await setDoc(statRef, statCreatePayload);
      } catch (statCreateError) {
        console.warn(
          'removeRegistration: isolated stat archive create skipped:',
          statCreateError
        );
      }
    } else if (canUpdateExistingStat && liveRegStatus === 'confirmed') {
      try {
        await updateDoc(statRef, statUpdatePayload);
      } catch (statUpdateError) {
        console.warn(
          'removeRegistration: isolated stat archive update skipped:',
          statUpdateError
        );
      }
    }

    try {
      await deleteDoc(regRef);
    } catch (regDeleteError) {
      handleFirestoreError(
        regDeleteError ?? batchError,
        OperationType.DELETE,
        `registrations/${registration.id}`
      );
      return;
    }

    if (paySnap?.exists()) {
      try {
        if (isPaidPayment) {
          await updateDoc(payRef, {
            status: 'refunded',
            updatedAt: serverTimestamp(),
          });
        } else {
          await deleteDoc(payRef);
        }
      } catch (payCleanupError) {
        console.warn(
          'removeRegistration: isolated payment cleanup skipped:',
          payCleanupError
        );
      }
    }

    if (shouldSyncEventCounter) {
      try {
        await updateDoc(eventRef, eventCounterUpdatePayload);
      } catch (eventDecrementError) {
        console.warn(
          'removeRegistration: isolated event counter sync skipped:',
          eventDecrementError
        );
      }
    }
  }
}

function normalizeMemberBirthDateAndLevel(
  birthDate?: string,
  fitnessLevel?: FitnessLevel | ''
): { birthDate: string; fitnessLevel: FitnessLevel | '' } {
  const cleanBirthDate = (birthDate ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.BIRTH_DATE_MAX);
  if (cleanBirthDate && !isValidBirthDateString(cleanBirthDate)) {
    throw new Error(
      'Veuillez saisir une date de naissance valide (antérieure ou égale à aujourd’hui).'
    );
  }
  const cleanLevel = (fitnessLevel ?? '') as FitnessLevel | '';
  if (
    cleanLevel !== '' &&
    cleanLevel !== 'beginner' &&
    cleanLevel !== 'intermediate' &&
    cleanLevel !== 'advanced'
  ) {
    throw new Error('Veuillez sélectionner un niveau sportif valide.');
  }
  return {
    birthDate: cleanBirthDate,
    fitnessLevel: cleanLevel,
  };
}

export function resolveDefaultPrimaryCoach(
  coachDirectory: CoachDirectoryEntry[] = [],
  coachAdmins: CoachAdminUser[] = []
): { uid: string; displayName: string } {
  const fromDir =
    coachDirectory.find((c) => c.active && c.isPrimary) ??
    coachDirectory.find(
      (c) =>
        c.active &&
        c.displayName.trim().toLowerCase().includes('david frosio')
    );
  if (fromDir) {
    return {
      uid: fromDir.uid,
      displayName: (fromDir.displayName || 'David Frosio')
        .trim()
        .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    };
  }

  const fromAdmins =
    coachAdmins.find(
      (a) =>
        a.email?.trim().toLowerCase() === BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
    ) ?? coachAdmins.find((a) => a.isPrimary);
  if (fromAdmins) {
    return {
      uid: fromAdmins.uid,
      displayName: (fromAdmins.displayName || 'David Frosio')
        .trim()
        .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    };
  }

  return { uid: '', displayName: 'David Frosio' };
}

async function fetchDefaultPrimaryCoachFromDirectory(): Promise<{
  uid: string;
  displayName: string;
}> {
  try {
    const snap = await getDocs(
      query(collection(db, 'coachDirectory'), where('active', '==', true))
    );
    const entries: CoachDirectoryEntry[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<CoachDirectoryEntry, 'id'>),
    }));
    return resolveDefaultPrimaryCoach(entries);
  } catch {
    return { uid: '', displayName: 'David Frosio' };
  }
}

function sanitizeReferentCoachFields(
  coachUid?: string,
  coachName?: string
): { referentCoachUid: string; referentCoachName: string } | null {
  if (coachUid === undefined && coachName === undefined) return null;
  const rawUid = (coachUid ?? '').trim().slice(0, 128);
  const safeUid =
    rawUid === '' || /^[a-zA-Z0-9_\-]+$/.test(rawUid) ? rawUid : '';
  const safeName = (coachName ?? (safeUid ? 'Coach GetFitNow' : 'David Frosio'))
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  return {
    referentCoachUid: safeUid,
    referentCoachName: safeName,
  };
}

export async function upsertMemberProfile(params: {
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
  exists: boolean;
}): Promise<void> {
  const memberRef = doc(db, 'members', params.emailKey);
  const { birthDate, fitnessLevel } = normalizeMemberBirthDateAndLevel(
    params.birthDate,
    params.fitnessLevel
  );
  const coachFields = sanitizeReferentCoachFields(
    params.referentCoachUid,
    params.referentCoachName
  );
  const cleanPayload: Record<string, unknown> = {
    firstName: params.firstName.trim().slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX),
    lastName: params.lastName.trim().slice(0, VALIDATION_LIMITS.LAST_NAME_MAX),
    email: params.email.trim().toLowerCase().slice(0, VALIDATION_LIMITS.EMAIL_MAX),
    phone: params.phone.trim().slice(0, VALIDATION_LIMITS.PHONE_MAX),
    goal: params.goal.trim().slice(0, VALIDATION_LIMITS.GOAL_MAX),
    birthDate,
    fitnessLevel,
    notes: params.notes.trim().slice(0, VALIDATION_LIMITS.NOTES_MAX),
    followUpStatus: params.followUpStatus,
    photoUrl: (params.photoUrl ?? '').trim().slice(0, VALIDATION_LIMITS.PHOTO_URL_MAX),
  };

  if (coachFields) {
    cleanPayload.referentCoachUid = coachFields.referentCoachUid;
    cleanPayload.referentCoachName = coachFields.referentCoachName;
  } else if (!params.exists) {
    const primary = await fetchDefaultPrimaryCoachFromDirectory();
    cleanPayload.referentCoachUid = primary.uid;
    cleanPayload.referentCoachName = primary.displayName;
  }

  try {
    if (params.exists) {
      await updateDoc(memberRef, {
        ...cleanPayload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(memberRef, {
        emailKey: params.emailKey,
        ...cleanPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      params.exists ? OperationType.UPDATE : OperationType.CREATE,
      `members/${params.emailKey}`
    );
  }
}

export async function assignMemberReferentCoach(params: {
  emailKey: string;
  email: string;
  firstName: string;
  lastName: string;
  existingProfile: MemberProfile | null;
  coachUid: string;
  coachName: string;
}): Promise<void> {
  const cleanUid = params.coachUid.trim().slice(0, 128);
  if (!cleanUid || !/^[a-zA-Z0-9_\-]+$/.test(cleanUid)) {
    throw new Error('Identifiant du coach référent invalide.');
  }
  const cleanCoachName = (params.coachName.trim() || 'Coach GetFitNow').slice(
    0,
    VALIDATION_LIMITS.DISPLAY_NAME_MAX
  );
  const memberRef = doc(db, 'members', params.emailKey);

  try {
    if (params.existingProfile) {
      await updateDoc(memberRef, {
        referentCoachUid: cleanUid,
        referentCoachName: cleanCoachName,
        updatedAt: serverTimestamp(),
      });
    } else {
      const email = params.email.trim().toLowerCase().slice(0, VALIDATION_LIMITS.EMAIL_MAX);
      const firstName = (
        params.firstName.trim() ||
        email.split('@')[0] ||
        'Adhérent'
      ).slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
      const lastName = (params.lastName.trim() || 'GetFitNow').slice(
        0,
        VALIDATION_LIMITS.LAST_NAME_MAX
      );
      await setDoc(memberRef, {
        emailKey: params.emailKey,
        email,
        firstName,
        lastName,
        phone: '',
        goal: '',
        birthDate: '',
        fitnessLevel: '',
        notes: '',
        followUpStatus: 'active',
        photoUrl: '',
        referentCoachUid: cleanUid,
        referentCoachName: cleanCoachName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(
      error,
      params.existingProfile ? OperationType.UPDATE : OperationType.CREATE,
      `members/${params.emailKey}`
    );
  }
}

export async function updateMyReferentCoach(params: {
  user: User;
  coachUid: string;
  coachName: string;
  existingProfile: MemberProfile | null;
}): Promise<void> {
  if (!params.user.email) {
    throw new Error('Vous devez être connecté pour choisir votre coach référent.');
  }
  const cleanUid = params.coachUid.trim().slice(0, 128);
  if (!cleanUid || !/^[a-zA-Z0-9_\-]+$/.test(cleanUid)) {
    throw new Error('Veuillez sélectionner un coach référent valide.');
  }
  const cleanCoachName = (params.coachName.trim() || 'Coach GetFitNow').slice(
    0,
    VALIDATION_LIMITS.DISPLAY_NAME_MAX
  );
  const email = params.user.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  try {
    let targetId = params.existingProfile?.id ?? null;
    if (!targetId) {
      const snap = await getDocs(
        query(collection(db, 'members'), where('email', '==', email))
      );
      if (!snap.empty) {
        targetId = snap.docs[0].id;
      }
    }

    if (targetId) {
      await updateDoc(doc(db, 'members', targetId), {
        referentCoachUid: cleanUid,
        referentCoachName: cleanCoachName,
        updatedAt: serverTimestamp(),
      });
    } else {
      const emailKey = await hashEmailKey(email);
      const resolvedParts = (params.user.displayName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const firstName = (
        resolvedParts[0] ||
        email.split('@')[0] ||
        'Adhérent'
      ).slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
      const lastName = (
        resolvedParts.length > 1 ? resolvedParts.slice(1).join(' ') : 'GetFitNow'
      ).slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);

      await setDoc(doc(db, 'members', emailKey), {
        emailKey,
        email,
        firstName,
        lastName,
        phone: '',
        goal: '',
        birthDate: '',
        fitnessLevel: '',
        notes: '',
        followUpStatus: 'active',
        photoUrl: '',
        referentCoachUid: cleanUid,
        referentCoachName: cleanCoachName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `members/${email}`);
  }
}

export async function backfillUnassignedMembersToPrimaryCoach(params: {
  primaryUid: string;
  primaryName: string;
  members: MemberProfile[];
}): Promise<number> {
  if (!params.primaryUid) return 0;
  const targets = params.members.filter(
    (m) => !m.referentCoachUid || m.referentCoachUid.trim() === ''
  );
  if (targets.length === 0) return 0;

  const cleanName = (params.primaryName.trim() || 'David Frosio').slice(
    0,
    VALIDATION_LIMITS.DISPLAY_NAME_MAX
  );
  let updated = 0;
  const CHUNK_SIZE = 350;
  try {
    for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
      const slice = targets.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      slice.forEach((m) => {
        batch.update(doc(db, 'members', m.id), {
          referentCoachUid: params.primaryUid,
          referentCoachName: cleanName,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      updated += slice.length;
    }
  } catch (error) {
    console.warn('Rattachement par défaut différé:', error);
  }
  return updated;
}

const ensureProfileQueueByEmail = new Map<string, Promise<void>>();

export async function ensureMyMemberProfile(
  user: User,
  syncDisplayName = false
): Promise<void> {
  if (!user.email) return;
  const email = user.email.trim().toLowerCase().slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const previous = ensureProfileQueueByEmail.get(email) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        const existingSnap = await getDocs(
          query(collection(db, 'members'), where('email', '==', email))
        );
        const resolvedName = (
          user.displayName ||
          auth.currentUser?.displayName ||
          ''
        )
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        if (!existingSnap.empty) {
          const existingDoc = existingSnap.docs[0];
          const existingData = existingDoc.data() as Partial<MemberProfile>;
          const pendingPatch: Record<string, unknown> = {};
          if (
            syncDisplayName &&
            resolvedName.length > 0 &&
            existingData.lastName === 'GetFitNow'
          ) {
            pendingPatch.firstName = resolvedName[0].slice(
              0,
              VALIDATION_LIMITS.FIRST_NAME_MAX
            );
            pendingPatch.lastName = (
              resolvedName.length > 1
                ? resolvedName.slice(1).join(' ')
                : existingData.lastName
            ).slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);
          }
          if (!existingData.referentCoachUid) {
            const primary = await fetchDefaultPrimaryCoachFromDirectory();
            if (primary.uid) {
              pendingPatch.referentCoachUid = primary.uid;
              pendingPatch.referentCoachName = primary.displayName;
            }
          }
          if (Object.keys(pendingPatch).length > 0) {
            await updateDoc(doc(db, 'members', existingDoc.id), {
              ...pendingPatch,
              updatedAt: serverTimestamp(),
            });
          }
          return;
        }

        const primary = await fetchDefaultPrimaryCoachFromDirectory();
        const emailKey = await hashEmailKey(email);
        const firstName = (
          resolvedName[0] ||
          email.split('@')[0] ||
          'Adhérent'
        ).slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
        const lastName = (
          resolvedName.length > 1 ? resolvedName.slice(1).join(' ') : 'GetFitNow'
        ).slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);

        await setDoc(doc(db, 'members', emailKey), {
          emailKey,
          email,
          firstName,
          lastName,
          phone: '',
          goal: '',
          birthDate: '',
          fitnessLevel: '',
          notes: '',
          followUpStatus: 'active',
          photoUrl: '',
          referentCoachUid: primary.uid,
          referentCoachName: primary.displayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Initialisation profil adhérent différée:', error);
      }
    });
  ensureProfileQueueByEmail.set(email, next);
  return next;
}

export async function upsertMyMemberProfile(params: {
  user: User;
  firstName: string;
  lastName: string;
  phone: string;
  goal: string;
  birthDate?: string;
  fitnessLevel?: FitnessLevel | '';
  photoUrl: string;
  referentCoachUid?: string;
  referentCoachName?: string;
  existingProfile: MemberProfile | null;
}): Promise<void> {
  if (!params.user.email) {
    throw new Error('Vous devez être connecté pour modifier votre profil.');
  }

  const email = params.user.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const firstName = params.firstName
    .trim()
    .slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
  const lastName = params.lastName
    .trim()
    .slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);

  if (firstName.length < VALIDATION_LIMITS.FIRST_NAME_MIN) {
    throw new Error('Veuillez saisir votre prénom.');
  }
  if (lastName.length < VALIDATION_LIMITS.LAST_NAME_MIN) {
    throw new Error('Veuillez saisir votre nom.');
  }

  const { birthDate, fitnessLevel } = normalizeMemberBirthDateAndLevel(
    params.birthDate,
    params.fitnessLevel
  );

  const coachFields = sanitizeReferentCoachFields(
    params.referentCoachUid,
    params.referentCoachName
  );

  const cleanUpdates: Record<string, unknown> = {
    firstName,
    lastName,
    phone: params.phone.trim().slice(0, VALIDATION_LIMITS.PHONE_MAX),
    goal: params.goal.trim().slice(0, VALIDATION_LIMITS.GOAL_MAX),
    birthDate,
    fitnessLevel,
    photoUrl: params.photoUrl.trim().slice(0, VALIDATION_LIMITS.PHOTO_URL_MAX),
    ...(coachFields ?? {}),
    updatedAt: serverTimestamp(),
  };

  try {
    let targetId = params.existingProfile?.id ?? null;
    if (!targetId) {
      const snap = await getDocs(
        query(collection(db, 'members'), where('email', '==', email))
      );
      if (!snap.empty) {
        targetId = snap.docs[0].id;
      }
    }

    if (targetId) {
      await updateDoc(doc(db, 'members', targetId), cleanUpdates);
    } else {
      const defaultCoach = coachFields
        ? null
        : await fetchDefaultPrimaryCoachFromDirectory();
      const emailKey = await hashEmailKey(email);
      await setDoc(doc(db, 'members', emailKey), {
        emailKey,
        email,
        ...cleanUpdates,
        ...(defaultCoach
          ? {
              referentCoachUid: defaultCoach.uid,
              referentCoachName: defaultCoach.displayName,
            }
          : {}),
        notes: '',
        followUpStatus: 'active',
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `members/${email}`);
  }
}

export async function createManualMember(params: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  goal: string;
  birthDate?: string;
  fitnessLevel?: FitnessLevel | '';
  notes: string;
  followUpStatus: FollowUpStatus;
  photoUrl?: string;
  referentCoachUid?: string;
  referentCoachName?: string;
  existingEmailKeys: Set<string>;
}): Promise<string> {
  const firstName = params.firstName
    .trim()
    .slice(0, VALIDATION_LIMITS.FIRST_NAME_MAX);
  const lastName = params.lastName
    .trim()
    .slice(0, VALIDATION_LIMITS.LAST_NAME_MAX);
  const email = params.email
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  if (firstName.length < VALIDATION_LIMITS.FIRST_NAME_MIN) {
    throw new Error('Veuillez saisir le prénom de l’adhérent.');
  }
  if (lastName.length < VALIDATION_LIMITS.LAST_NAME_MIN) {
    throw new Error('Veuillez saisir le nom de l’adhérent.');
  }
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(email)) {
    throw new Error('Veuillez saisir une adresse email valide.');
  }

  const { birthDate, fitnessLevel } = normalizeMemberBirthDateAndLevel(
    params.birthDate,
    params.fitnessLevel
  );

  const emailKey = await hashEmailKey(email);
  if (params.existingEmailKeys.has(emailKey)) {
    throw new Error(
      'Un adhérent avec cette adresse email existe déjà dans votre répertoire.'
    );
  }

  const memberRef = doc(db, 'members', emailKey);
  try {
    const existingSnap = await getDoc(memberRef);
    if (existingSnap.exists()) {
      throw new Error(
        'Un adhérent avec cette adresse email existe déjà dans le répertoire.'
      );
    }
  } catch (checkErr) {
    const code = (checkErr as { code?: string })?.code ?? '';
    const msg = checkErr instanceof Error ? checkErr.message.toLowerCase() : '';
    if (
      code === 'permission-denied' ||
      msg.includes('permission') ||
      msg.includes('insufficient permissions')
    ) {
      throw new Error(
        'Cet adhérent possède déjà une fiche rattachée à un autre coach. Demandez à l’adhérent de vous choisir comme coach référent depuis son espace ou à son coach actuel de vous le rattacher.'
      );
    }
    if (checkErr instanceof Error && msg.includes('existe déjà')) {
      throw checkErr;
    }
  }

  const coachFields = sanitizeReferentCoachFields(
    params.referentCoachUid,
    params.referentCoachName
  );
  const resolvedCoachFields =
    coachFields ??
    (() => {
      return null;
    })();
  const fallbackPrimary = resolvedCoachFields
    ? null
    : await fetchDefaultPrimaryCoachFromDirectory();

  try {
    await setDoc(memberRef, {
      emailKey,
      email,
      firstName,
      lastName,
      phone: params.phone.trim().slice(0, VALIDATION_LIMITS.PHONE_MAX),
      goal: params.goal.trim().slice(0, VALIDATION_LIMITS.GOAL_MAX),
      birthDate,
      fitnessLevel,
      notes: params.notes.trim().slice(0, VALIDATION_LIMITS.NOTES_MAX),
      followUpStatus: params.followUpStatus,
      photoUrl: (params.photoUrl ?? '').trim().slice(0, VALIDATION_LIMITS.PHOTO_URL_MAX),
      referentCoachUid:
        resolvedCoachFields?.referentCoachUid ?? fallbackPrimary?.uid ?? '',
      referentCoachName:
        resolvedCoachFields?.referentCoachName ??
        fallbackPrimary?.displayName ??
        'David Frosio',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return emailKey;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `members/${emailKey}`);
  }
}

export async function deleteMemberCompletely(params: {
  emailKey: string;
  email?: string;
  registrations: Registration[];
  events: SportEvent[];
  coachUid?: string;
  isPrimaryBootstrapped?: boolean;
}): Promise<void> {
  let failingOp: OperationType = OperationType.GET;
  let failingPath = `members/${params.emailKey}`;
  try {
    const memberDocIds = new Set<string>([params.emailKey]);
    let cleanEmail = (params.email ?? '').trim().toLowerCase();

    failingOp = OperationType.GET;
    failingPath = `members/${params.emailKey}`;
    const directMemberSnap = await getDocFromServer(
      doc(db, 'members', params.emailKey)
    );
    if (directMemberSnap.exists()) {
      const memberEmail = (
        (directMemberSnap.data() as Partial<MemberProfile>).email ?? ''
      )
        .trim()
        .toLowerCase();
      if (!cleanEmail && memberEmail) {
        cleanEmail = memberEmail;
      }
    }

    if (!cleanEmail) {
      const fromPassed = params.registrations.find(
        (r) => r.emailKey === params.emailKey && r.email
      );
      if (fromPassed) {
        cleanEmail = fromPassed.email.trim().toLowerCase();
      }
    }

    const currentCoachUid = (params.coachUid || auth.currentUser?.uid || '').trim();
    const isPrimary = Boolean(params.isPrimaryBootstrapped);

    if (cleanEmail) {
      failingOp = OperationType.LIST;
      failingPath = 'members';
      if (isPrimary || !currentCoachUid) {
        const membersByEmailSnap = await getDocsFromServer(
          query(collection(db, 'members'), where('email', '==', cleanEmail))
        );
        membersByEmailSnap.docs.forEach((d) => memberDocIds.add(d.id));
      } else {
        const membersByCoachSnap = await getDocsFromServer(
          query(
            collection(db, 'members'),
            where('referentCoachUid', '==', currentCoachUid)
          )
        );
        membersByCoachSnap.docs.forEach((d) => {
          const data = d.data() as Partial<MemberProfile>;
          if ((data.email ?? '').trim().toLowerCase() === cleanEmail) {
            memberDocIds.add(d.id);
          }
        });
      }
    }

    failingOp = OperationType.LIST;
    failingPath = 'registrations / payments / notifications';

    const regQueryPromises = [
      getDocsFromServer(
        query(
          collection(db, 'registrations'),
          where('emailKey', '==', params.emailKey)
        )
      ),
    ];
    if (cleanEmail) {
      regQueryPromises.push(
        getDocsFromServer(
          query(collection(db, 'registrations'), where('email', '==', cleanEmail))
        )
      );
    }

    const payQueryPromises = [
      getDocsFromServer(
        query(
          collection(db, 'payments'),
          where('memberEmailKey', '==', params.emailKey)
        )
      ),
    ];
    if (cleanEmail) {
      payQueryPromises.push(
        getDocsFromServer(
          query(collection(db, 'payments'), where('memberEmail', '==', cleanEmail))
        )
      );
    }

    const memberNotifQueryPromises = [
      getDocsFromServer(
        query(
          collection(db, 'memberNotifications'),
          where('memberEmailKey', '==', params.emailKey)
        )
      ),
    ];
    if (cleanEmail) {
      memberNotifQueryPromises.push(
        getDocsFromServer(
          query(
            collection(db, 'memberNotifications'),
            where('memberEmail', '==', cleanEmail)
          )
        )
      );
    }

    const coachNotifQueryPromise = cleanEmail
      ? getDocsFromServer(
          query(
            collection(db, 'coachNotifications'),
            where('memberEmail', '==', cleanEmail)
          )
        )
      : Promise.resolve(null);

    const [regSnaps, paySnaps, memberNotifSnaps, coachNotifSnap] =
      await Promise.all([
        Promise.all(regQueryPromises),
        Promise.all(payQueryPromises),
        Promise.all(memberNotifQueryPromises),
        coachNotifQueryPromise,
      ]);

    const regMap = new Map<string, Partial<Registration>>();
    params.registrations.forEach((r) => {
      if (
        r.emailKey === params.emailKey ||
        (cleanEmail && r.email.trim().toLowerCase() === cleanEmail)
      ) {
        regMap.set(r.id, r);
      }
    });
    regSnaps.forEach((snap) => {
      snap.docs.forEach((d) => {
        regMap.set(d.id, d.data() as Partial<Registration>);
      });
    });

    const paymentDocIds = new Set<string>();
    paySnaps.forEach((snap) => {
      snap.docs.forEach((d) => paymentDocIds.add(d.id));
    });

    // Also verify direct payment/{regId} docs in case any lacked memberEmailKey/memberEmail
    failingOp = OperationType.GET;
    failingPath = 'payments';
    const missingPayChecks = Array.from(regMap.keys())
      .filter((regId) => !paymentDocIds.has(regId))
      .map(async (regId) => {
        const paySnap = await getDocFromServer(doc(db, 'payments', regId));
        if (paySnap.exists()) {
          paymentDocIds.add(paySnap.id);
        }
      });
    await Promise.all(missingPayChecks);

    const memberNotifDocIds = new Set<string>();
    memberNotifSnaps.forEach((snap) => {
      snap.docs.forEach((d) => memberNotifDocIds.add(d.id));
    });

    const coachNotifDocIds = new Set<string>();
    if (coachNotifSnap) {
      coachNotifSnap.docs.forEach((d) => coachNotifDocIds.add(d.id));
    }

    const confirmedCountByEvent = new Map<string, number>();
    regMap.forEach((regData) => {
      if (regData.status === 'confirmed' && regData.eventId) {
        confirmedCountByEvent.set(
          regData.eventId,
          (confirmedCountByEvent.get(regData.eventId) ?? 0) + 1
        );
      }
    });

    const eventDecrements = new Map<string, number>();
    failingOp = OperationType.GET;
    failingPath = 'events';
    await Promise.all(
      Array.from(confirmedCountByEvent.entries()).map(
        async ([eventId, decCount]) => {
          const evSnap = await getDocFromServer(doc(db, 'events', eventId));
          if (!evSnap.exists()) return;
          const liveCount = (evSnap.data() as Partial<SportEvent>).registeredCount;
          if (typeof liveCount === 'number' && liveCount > 0) {
            const actualDec = Math.min(decCount, liveCount);
            if (actualDec > 0) {
              eventDecrements.set(eventId, actualDec);
            }
          }
        }
      )
    );

    type BatchOp = (batch: ReturnType<typeof writeBatch>) => void;
    const ops: BatchOp[] = [];

    eventDecrements.forEach((actualDec, eventId) => {
      ops.push((batch) =>
        batch.update(doc(db, 'events', eventId), {
          registeredCount: increment(-actualDec),
          updatedAt: serverTimestamp(),
        })
      );
    });

    memberDocIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'members', id)));
    });
    regMap.forEach((_regData, id) => {
      ops.push((batch) => batch.delete(doc(db, 'registrations', id)));
    });
    paymentDocIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'payments', id)));
    });
    memberNotifDocIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'memberNotifications', id)));
    });
    coachNotifDocIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'coachNotifications', id)));
    });

    // Respect strict 1-to-1 conversation privacy rules: scope list queries to current coachUid
    const currentUid = auth.currentUser?.uid ?? '';
    if (currentUid) {
      failingOp = OperationType.LIST;
      failingPath = 'conversations';
      const coachConvSnap = await getDocsFromServer(
        query(collection(db, 'conversations'), where('coachUid', '==', currentUid))
      );
      const convIds = new Set<string>();
      coachConvSnap.docs.forEach((d) => {
        const data = d.data() as Partial<Conversation>;
        const convEmail = (data.memberEmail ?? '').trim().toLowerCase();
        if (
          data.memberEmailKey === params.emailKey ||
          (cleanEmail && convEmail === cleanEmail)
        ) {
          convIds.add(d.id);
        }
      });

      await Promise.all(
        Array.from(convIds).map(async (convId) => {
          failingOp = OperationType.LIST;
          failingPath = `conversations/${convId}/messages`;
          const msgsSnap = await getDocsFromServer(
            query(
              collection(db, 'conversations', convId, 'messages'),
              where('coachUid', '==', currentUid)
            )
          );
          msgsSnap.docs.forEach((mDoc) => {
            ops.push((batch) =>
              batch.delete(doc(db, 'conversations', convId, 'messages', mDoc.id))
            );
          });
          ops.push((batch) => batch.delete(doc(db, 'conversations', convId)));
        })
      );
    }

    failingOp = OperationType.LIST;
    failingPath = 'memberSchedules';
    const scheduleIds = new Set<string>();
    if (isPrimary || !currentCoachUid) {
      const scheduleQueryPromises = [
        getDocsFromServer(
          query(
            collection(db, 'memberSchedules'),
            where('memberEmailKey', '==', params.emailKey)
          )
        ),
      ];
      if (cleanEmail) {
        scheduleQueryPromises.push(
          getDocsFromServer(
            query(
              collection(db, 'memberSchedules'),
              where('memberEmail', '==', cleanEmail)
            )
          )
        );
      }
      const scheduleSnaps = await Promise.all(scheduleQueryPromises);
      scheduleSnaps.forEach((snap) => {
        snap.docs.forEach((d) => scheduleIds.add(d.id));
      });
    } else {
      const coachSchedSnap = await getDocsFromServer(
        query(
          collection(db, 'memberSchedules'),
          where('coachUid', '==', currentCoachUid)
        )
      );
      coachSchedSnap.docs.forEach((d) => {
        const data = d.data() as Partial<MemberScheduleSession>;
        const schedEmail = (data.memberEmail ?? '').trim().toLowerCase();
        if (
          data.memberEmailKey === params.emailKey ||
          (cleanEmail && schedEmail === cleanEmail)
        ) {
          scheduleIds.add(d.id);
        }
      });
    }
    scheduleIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'memberSchedules', id)));
    });

    failingOp = OperationType.LIST;
    failingPath = 'trainingPrograms';
    const programIds = new Set<string>();
    if (isPrimary || !currentCoachUid) {
      const programQueryPromises = [
        getDocsFromServer(
          query(
            collection(db, 'trainingPrograms'),
            where('memberEmailKey', '==', params.emailKey)
          )
        ),
      ];
      if (cleanEmail) {
        programQueryPromises.push(
          getDocsFromServer(
            query(
              collection(db, 'trainingPrograms'),
              where('memberEmail', '==', cleanEmail)
            )
          )
        );
      }
      const programSnaps = await Promise.all(programQueryPromises);
      programSnaps.forEach((snap) => {
        snap.docs.forEach((d) => programIds.add(d.id));
      });
    } else {
      const coachProgSnap = await getDocsFromServer(
        query(
          collection(db, 'trainingPrograms'),
          where('coachUid', '==', currentCoachUid)
        )
      );
      coachProgSnap.docs.forEach((d) => {
        const data = d.data() as Partial<TrainingProgram>;
        const progEmail = (data.memberEmail ?? '').trim().toLowerCase();
        if (
          data.memberEmailKey === params.emailKey ||
          (cleanEmail && progEmail === cleanEmail)
        ) {
          programIds.add(d.id);
        }
      });
    }
    programIds.forEach((id) => {
      ops.push((batch) => batch.delete(doc(db, 'trainingPrograms', id)));
    });

    failingOp = OperationType.DELETE;
    failingPath = `members/${params.emailKey}`;
    const CHUNK_SIZE = 350;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const slice = ops.slice(i, i + CHUNK_SIZE);
      slice.forEach((applyOp) => applyOp(batch));
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, failingOp, failingPath);
  }
}

export async function seedDemoEvents(
  coachUid: string,
  coachName: string
): Promise<void> {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  const makeDate = (offsetMs: number, setHour?: number, setMin = 0) => {
    const d = new Date(now + offsetMs);
    if (typeof setHour === 'number') {
      d.setHours(setHour, setMin, 0, 0);
    }
    return d;
  };

  const demos: EventFormInput[] = [
    {
      title: 'HIIT Express & Cardio (Départ imminent)',
      discipline: 'HIIT',
      description:
        'Séance intense de 45 minutes par intervalles courts. Tapis et kettlebells fournis sur place.',
      location: 'Place de la République',
      city: 'Paris',
      region: 'Île-de-France',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(75 * 60 * 1000),
      durationMinutes: 45,
      isUnlimitedCapacity: false,
      maxCapacity: 12,
      bookingCutoffMinutes: 0,
    },
    {
      title: 'Circuit Training Plein Air (Places illimitées)',
      discipline: 'Circuit Training',
      description:
        'Grand rassemblement sportif en extérieur, ouvert à tous sans limite de places.',
      location: 'Parc de la Tête d’Or',
      city: 'Lyon',
      region: 'Auvergne-Rhône-Alpes',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(3.5 * hour),
      durationMinutes: 60,
      isUnlimitedCapacity: true,
      maxCapacity: 0,
    },
    {
      title: 'Renforcement Musculaire & Gainage',
      discipline: 'Renforcement',
      description:
        'Séance orientée posture, sangle abdominale et force fonctionnelle avec haltères et élastiques.',
      location: 'Place de la Bastille',
      city: 'Paris',
      region: 'Île-de-France',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(day, 18, 30),
      durationMinutes: 60,
      isUnlimitedCapacity: false,
      maxCapacity: 10,
    },
    {
      title: 'Mobilité Articulaire & Récupération',
      discipline: 'Mobilité',
      description:
        'Décompression rachidienne, ouverture des hanches et travail respiratoire post-entraînement.',
      location: 'Jardin Public de Bordeaux',
      city: 'Bordeaux',
      region: 'Nouvelle-Aquitaine',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(2 * day, 12, 15),
      durationMinutes: 45,
      isUnlimitedCapacity: false,
      maxCapacity: 15,
    },
    {
      title: 'Sortie Fractionné & Endurance',
      discipline: 'Course à pied',
      description:
        'Échauffement technique, gammes athlétiques et blocs d’allure spécifique en extérieur.',
      location: 'Parc des Buttes-Chaumont',
      city: 'Paris',
      region: 'Île-de-France',
      hasCoords: false,
      lat: 0,
      lng: 0,
      coachName,
      startDate: makeDate(4 * day, 9, 30),
      durationMinutes: 75,
      isUnlimitedCapacity: true,
      maxCapacity: 0,
    },
  ];

  const demoDisciplines: Array<{
    name: string;
    colorKey: DisciplineColorKey;
    iconKey: DisciplineIconKey;
  }> = [
    { name: 'Circuit Training', colorKey: 'violet', iconKey: 'zap' },
    { name: 'Course à pied', colorKey: 'sky', iconKey: 'running-shoe' },
    { name: 'HIIT', colorKey: 'rose', iconKey: 'flame' },
    { name: 'Mobilité', colorKey: 'teal', iconKey: 'yoga' },
    { name: 'Renforcement', colorKey: 'orange', iconKey: 'dumbbell' },
  ];

  for (const d of demoDisciplines) {
    const slug = slugifyDiscipline(d.name);
    const discRef = doc(db, 'disciplines', slug);
    const snap = await getDoc(discRef);
    if (!snap.exists()) {
      await setDoc(discRef, {
        name: d.name,
        slug,
        colorKey: d.colorKey,
        iconKey: d.iconKey,
        createdBy: coachUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  for (const item of demos) {
    await createEvent(
      {
        ...item,
        coachNames: [coachName],
        coachUids: [coachUid],
      },
      coachUid
    );
  }
}

// ---------------------------------------------------------------------------
// Mentions J'aime (/eventLikes) & Avis / Commentaires (/eventReviews)
// ---------------------------------------------------------------------------

export function subscribeMyEventLikes(
  userId: string,
  onData: (likedEventIds: Set<string>) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'eventLikes'),
    where('userId', '==', userId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const next = new Set<string>();
      snapshot.docs.forEach((d) => {
        const data = d.data() as Partial<EventLike>;
        if (typeof data.eventId === 'string' && data.eventId) {
          next.add(data.eventId);
        }
      });
      onData(next);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'eventLikes');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function toggleEventLike(
  event: SportEvent,
  userId: string
): Promise<boolean> {
  if (!userId) {
    throw new Error('Connexion requise pour aimer un événement.');
  }
  if (event.status !== 'published') {
    throw new Error('Impossible d’aimer une séance annulée.');
  }

  const likeId = `${event.id}__${userId}`;
  const eventRef = doc(db, 'events', event.id);
  const likeRef = doc(db, 'eventLikes', likeId);

  try {
    const [eventSnap, likeQuerySnap] = await Promise.all([
      getDocFromServer(eventRef),
      getDocsFromServer(
        query(collection(db, 'eventLikes'), where('userId', '==', userId))
      ),
    ]);

    if (!eventSnap.exists()) {
      throw new Error('Cet événement n’existe plus.');
    }

    const liveEvent = parseLiveSportEventSnapshot(
      eventSnap.id,
      eventSnap.data() as Partial<SportEvent>
    );

    if (liveEvent.status !== 'published') {
      throw new Error('Impossible d’aimer une séance annulée.');
    }

    const existingLikeDoc =
      likeQuerySnap.docs.find(
        (d) =>
          d.id === likeId ||
          (d.data() as Partial<EventLike>).eventId === event.id
      ) ?? null;

    const currentLikes = Math.max(0, liveEvent.likesCount ?? 0);
    const batch = writeBatch(db);

    if (existingLikeDoc) {
      const targetLikeRef = doc(db, 'eventLikes', existingLikeDoc.id);
      if (currentLikes < 1) {
        batch.delete(targetLikeRef);
        await batch.commit();
        return false;
      }
      batch.delete(targetLikeRef);
      batch.update(eventRef, {
        likesCount: currentLikes - 1,
        lastLikeId: existingLikeDoc.id,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    }

    batch.set(likeRef, {
      eventId: event.id,
      userId,
      createdAt: serverTimestamp(),
    });
    batch.update(eventRef, {
      likesCount: currentLikes + 1,
      lastLikeId: likeId,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `eventLikes/${likeId}`);
  }
}

export function subscribePublishedEventReviews(
  onData: (reviews: EventReview[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'eventReviews'),
    where('status', '==', 'published')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: EventReview[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<EventReview, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'eventReviews');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function upsertEventReview(params: {
  registration: Registration;
  matchedEvent?: SportEvent | null;
  authorUid: string;
  rating: number;
  comment: string;
  fallbackDisplayName?: string | null;
}): Promise<void> {
  const { registration, matchedEvent, authorUid } = params;
  if (!authorUid) {
    throw new Error('Connexion requise pour publier un avis.');
  }
  if (registration.status !== 'confirmed') {
    throw new Error('Seule une inscription confirmée permet de laisser un avis.');
  }
  if (matchedEvent && matchedEvent.status === 'cancelled') {
    throw new Error('Impossible de laisser un avis sur une séance annulée.');
  }
  const endMs = getRegistrationEndMs(registration, matchedEvent);
  if (Date.now() < endMs) {
    throw new Error(
      'Les avis et commentaires ne peuvent être laissés qu’à partir de l’heure de fin de la séance.'
    );
  }
  if (!registration.attended) {
    throw new Error(
      'Veuillez d’abord valider votre séance à l’issue de l’événement avant de laisser un avis.'
    );
  }

  const rating = Math.round(Number(params.rating));
  if (
    !Number.isInteger(rating) ||
    rating < VALIDATION_LIMITS.REVIEW_RATING_MIN ||
    rating > VALIDATION_LIMITS.REVIEW_RATING_MAX
  ) {
    throw new Error('Veuillez attribuer une note comprise entre 1 et 5 étoiles.');
  }

  const comment = params.comment
    .trim()
    .slice(0, VALIDATION_LIMITS.REVIEW_COMMENT_MAX);
  if (comment.length < VALIDATION_LIMITS.REVIEW_COMMENT_MIN) {
    throw new Error(
      `Votre commentaire doit contenir au moins ${VALIDATION_LIMITS.REVIEW_COMMENT_MIN} caractères.`
    );
  }

  const authorName = formatPublicAuthorName(
    registration.firstName,
    registration.lastName,
    params.fallbackDisplayName
  );
  const reviewId = registration.id;
  const reviewRef = doc(db, 'eventReviews', reviewId);

  try {
    const existingSnap = await getDoc(reviewRef);
    if (existingSnap.exists()) {
      await updateDoc(reviewRef, {
        rating,
        comment,
        authorName,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const rawTitle = (
      matchedEvent?.title ||
      registration.eventTitle ||
      'Séance sportive'
    )
      .trim()
      .slice(0, VALIDATION_LIMITS.TITLE_MAX);
    const eventTitle =
      rawTitle.length >= VALIDATION_LIMITS.TITLE_MIN
        ? rawTitle
        : 'Séance sportive';

    const rawDiscipline = (matchedEvent?.discipline || 'Coaching')
      .trim()
      .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
    const discipline =
      rawDiscipline.length >= VALIDATION_LIMITS.DISCIPLINE_MIN
        ? rawDiscipline
        : 'Coaching';

    await setDoc(reviewRef, {
      eventId: registration.eventId,
      registrationId: registration.id,
      emailKey: registration.emailKey,
      authorUid,
      authorName,
      eventTitle,
      discipline,
      eventStartAt: registration.eventStartAt,
      rating,
      comment,
      status: 'published',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `eventReviews/${reviewId}`
    );
  }
}

export async function deleteEventReview(reviewId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'eventReviews', reviewId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `eventReviews/${reviewId}`
    );
  }
}

// ---------------------------------------------------------------------------
// Annuaire Coachs (/coachDirectory) & Messagerie directe (/conversations)
// ---------------------------------------------------------------------------

export function subscribeCoachDirectory(
  onData: (coaches: CoachDirectoryEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'coachDirectory'),
    where('active', '==', true)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CoachDirectoryEntry[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CoachDirectoryEntry, 'id'>),
      }));
      list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'coachDirectory');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function syncCoachDirectoryFromAdmins(params: {
  admins: CoachAdminUser[];
  existingDirectory: CoachDirectoryEntry[];
  isCoachAdmin: boolean;
  currentUid?: string | null;
}): Promise<void> {
  const existingByUid = new Map(
    params.existingDirectory.map((entry) => [entry.uid, entry])
  );

  const candidates = params.admins.filter((admin) => {
    if (!params.isCoachAdmin && admin.uid !== params.currentUid) {
      return false;
    }
    const existing = existingByUid.get(admin.uid);
    if (!admin.active && !existing) {
      return false;
    }
    if (!existing) return true;
    return (
      existing.displayName !== admin.displayName ||
      (existing.specialty ?? '') !== (admin.specialty ?? '') ||
      (existing.city ?? '') !== (admin.city ?? '') ||
      (existing.region ?? '') !== (admin.region ?? '') ||
      (existing.bio ?? '') !== (admin.bio ?? '') ||
      (existing.photoUrl ?? '') !== (admin.photoUrl ?? '') ||
      !areCoachPricingsEqual(existing.pricing, admin.pricing) ||
      existing.active !== admin.active ||
      Boolean(existing.isPrimary) !== Boolean(admin.isPrimary)
    );
  });

  if (candidates.length === 0) return;

  try {
    const batch = writeBatch(db);
    candidates.forEach((admin) => {
      batch.set(doc(db, 'coachDirectory', admin.uid), {
        uid: admin.uid,
        displayName: admin.displayName.slice(
          0,
          VALIDATION_LIMITS.DISPLAY_NAME_MAX
        ),
        specialty: (admin.specialty ?? '').slice(
          0,
          VALIDATION_LIMITS.SPECIALTY_MAX
        ),
        city: (admin.city ?? '').slice(0, VALIDATION_LIMITS.CITY_MAX),
        region: (admin.region ?? '').slice(0, VALIDATION_LIMITS.REGION_MAX),
        bio: (admin.bio ?? '').slice(0, VALIDATION_LIMITS.BIO_MAX),
        photoUrl: (admin.photoUrl ?? '').slice(
          0,
          VALIDATION_LIMITS.PHOTO_URL_MAX
        ),
        pricing: sanitizeCoachPricing(admin.pricing),
        active: Boolean(admin.active),
        isPrimary: Boolean(admin.isPrimary),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (error) {
    console.warn('Synchronisation annuaire coach impossible:', error);
  }
}

export function subscribeCoachConversations(
  coachUid: string,
  onData: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('coachUid', '==', coachUid)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Conversation[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Conversation, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.lastMessageAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
        const bMs = b.lastMessageAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'conversations');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMemberConversations(
  memberEmail: string,
  onData: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = memberEmail.trim().toLowerCase();
  const q = query(
    collection(db, 'conversations'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Conversation[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Conversation, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.lastMessageAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
        const bMs = b.lastMessageAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'conversations');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeConversationMessages(params: {
  conversationId: string;
  isCoach: boolean;
  coachUid: string;
  memberEmail: string;
  onData: (messages: DirectMessage[]) => void;
  onError?: (err: Error) => void;
}): Unsubscribe {
  const msgsCollection = collection(
    db,
    'conversations',
    params.conversationId,
    'messages'
  );
  const q = params.isCoach
    ? query(msgsCollection, where('coachUid', '==', params.coachUid))
    : query(
        msgsCollection,
        where('memberEmail', '==', params.memberEmail.trim().toLowerCase())
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: DirectMessage[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<DirectMessage, 'id'>),
      }));
      list.sort((a, b) => {
        const aMs = a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        const bMs = b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
        return aMs - bMs;
      });
      params.onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.LIST,
          `conversations/${params.conversationId}/messages`
        );
      } catch (wrapped) {
        if (params.onError && wrapped instanceof Error) {
          params.onError(wrapped);
        }
      }
    }
  );
}

export async function sendDirectMessage(params: {
  coachUid: string;
  coachName: string;
  coachPhotoUrl?: string;
  memberEmail: string;
  memberName: string;
  memberPhotoUrl?: string;
  senderUid: string;
  senderEmail: string;
  senderName: string;
  senderRole: ConversationSenderRole;
  text: string;
  contextEventId?: string;
  contextEventTitle?: string;
}): Promise<string> {
  const cleanMemberEmail = params.memberEmail
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  const cleanSenderEmail = params.senderEmail
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(cleanMemberEmail)) {
    throw new Error('Adresse email du destinataire invalide.');
  }

  const trimmedText = params.text
    .trim()
    .slice(0, VALIDATION_LIMITS.MESSAGE_TEXT_MAX);
  if (trimmedText.length < VALIDATION_LIMITS.MESSAGE_TEXT_MIN) {
    throw new Error('Veuillez saisir un message avant d’envoyer.');
  }

  const memberEmailKey = await hashEmailKey(cleanMemberEmail);
  const conversationId = `${params.coachUid}__${memberEmailKey}`;
  const previewText =
    trimmedText.length > VALIDATION_LIMITS.MESSAGE_PREVIEW_MAX
      ? `${trimmedText.slice(0, VALIDATION_LIMITS.MESSAGE_PREVIEW_MAX - 1)}…`
      : trimmedText;

  const coachName = (params.coachName.trim() || 'Coach GetFitNow').slice(
    0,
    VALIDATION_LIMITS.DISPLAY_NAME_MAX
  );
  const memberName = (
    params.memberName.trim() ||
    cleanMemberEmail.split('@')[0] ||
    'Adhérent'
  ).slice(0, 125);
  const senderName = (
    params.senderName.trim() ||
    (params.senderRole === 'coach' ? coachName : memberName)
  ).slice(0, 125);
  const coachPhotoUrl = (params.coachPhotoUrl ?? '').slice(
    0,
    VALIDATION_LIMITS.PHOTO_URL_MAX
  );
  const memberPhotoUrl = (params.memberPhotoUrl ?? '').slice(
    0,
    VALIDATION_LIMITS.PHOTO_URL_MAX
  );

  try {
    const existingSnap = await getDocsFromServer(
      params.senderRole === 'coach'
        ? query(
            collection(db, 'conversations'),
            where('coachUid', '==', params.coachUid)
          )
        : query(
            collection(db, 'conversations'),
            where('memberEmail', '==', cleanMemberEmail)
          )
    );
    const existingConv =
      existingSnap.docs.find((d) => d.id === conversationId) ?? null;

    const batch = writeBatch(db);
    const convRef = doc(db, 'conversations', conversationId);
    const msgRef = doc(collection(db, 'conversations', conversationId, 'messages'));

    if (existingConv) {
      if (params.senderRole === 'coach') {
        batch.update(convRef, {
          coachName,
          coachPhotoUrl,
          lastMessageText: previewText,
          lastMessageSenderRole: 'coach',
          lastMessageSenderUid: params.senderUid,
          lastMessageAt: serverTimestamp(),
          coachUnreadCount: 0,
          memberUnreadCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(convRef, {
          memberUid: params.senderUid,
          memberName,
          memberPhotoUrl,
          lastMessageText: previewText,
          lastMessageSenderRole: 'member',
          lastMessageSenderUid: params.senderUid,
          lastMessageAt: serverTimestamp(),
          memberUnreadCount: 0,
          coachUnreadCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      }
    } else {
      batch.set(convRef, {
        coachUid: params.coachUid,
        coachName,
        coachPhotoUrl,
        memberEmail: cleanMemberEmail,
        memberEmailKey,
        memberName,
        memberPhotoUrl,
        memberUid: params.senderRole === 'member' ? params.senderUid : '',
        lastMessageText: previewText,
        lastMessageSenderRole: params.senderRole,
        lastMessageSenderUid: params.senderUid,
        lastMessageAt: serverTimestamp(),
        coachUnreadCount: params.senderRole === 'member' ? 1 : 0,
        memberUnreadCount: params.senderRole === 'coach' ? 1 : 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const cleanContextTitle = (params.contextEventTitle ?? '')
      .trim()
      .slice(0, VALIDATION_LIMITS.TITLE_MAX);
    const includeEventContext =
      Boolean(params.contextEventId?.trim()) && cleanContextTitle.length >= 2;

    batch.set(msgRef, {
      conversationId,
      coachUid: params.coachUid,
      memberEmail: cleanMemberEmail,
      senderUid: params.senderUid,
      senderEmail: cleanSenderEmail,
      senderName,
      senderRole: params.senderRole,
      text: trimmedText,
      ...(includeEventContext
        ? {
            contextEventId: params.contextEventId!.trim(),
            contextEventTitle: cleanContextTitle,
          }
        : {}),
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return conversationId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `conversations/${conversationId}`
    );
  }
}

export async function markConversationAsRead(params: {
  conversationId: string;
  isCoach: boolean;
  currentUid: string;
}): Promise<void> {
  if (!params.conversationId || !params.currentUid) return;
  try {
    const convRef = doc(db, 'conversations', params.conversationId);
    if (params.isCoach) {
      await updateDoc(convRef, {
        coachUnreadCount: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(convRef, {
        memberUnreadCount: 0,
        memberUid: params.currentUid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.warn('Impossible de marquer la conversation comme lue:', error);
  }
}

export async function toggleDirectMessageLike(params: {
  conversationId: string;
  message: DirectMessage;
  isCoach: boolean;
}): Promise<boolean> {
  const currentUid = auth.currentUser?.uid ?? '';
  const actingAsCoach = params.isCoach && params.message.coachUid === currentUid;
  const nextLiked = actingAsCoach
    ? !Boolean(params.message.likedByCoach)
    : !Boolean(params.message.likedByMember);
  const msgRef = doc(
    db,
    'conversations',
    params.conversationId,
    'messages',
    params.message.id
  );
  try {
    await updateDoc(
      msgRef,
      actingAsCoach
        ? { likedByCoach: nextLiked, updatedAt: serverTimestamp() }
        : { likedByMember: nextLiked, updatedAt: serverTimestamp() }
    );
    return nextLiked;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `conversations/${params.conversationId}/messages/${params.message.id}`
    );
  }
}

export async function deleteConversationThread(params: {
  conversation: Conversation;
  currentUid: string;
  currentEmail: string;
}): Promise<void> {
  const convId = params.conversation.id;
  const isThreadCoach = params.conversation.coachUid === params.currentUid;
  const cleanEmail = (params.currentEmail || params.conversation.memberEmail || '')
    .trim()
    .toLowerCase();

  try {
    const msgsCollection = collection(db, 'conversations', convId, 'messages');
    const msgsQuery = isThreadCoach
      ? query(msgsCollection, where('coachUid', '==', params.conversation.coachUid))
      : query(msgsCollection, where('memberEmail', '==', cleanEmail));

    const msgsSnap = await getDocsFromServer(msgsQuery);
    const CHUNK_SIZE = 400;
    const msgDocs = msgsSnap.docs;

    for (let i = 0; i < msgDocs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const slice = msgDocs.slice(i, i + CHUNK_SIZE);
      slice.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    await deleteDoc(doc(db, 'conversations', convId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `conversations/${convId}`
    );
  }
}

// ---------------------------------------------------------------------------
// Planning hebdomadaire personnalisé par adhérent (/memberSchedules)
// ---------------------------------------------------------------------------

const FREE_GIFT_REF_PREFIX = 'OFFERT-';

function isGiftPaymentRef(ref?: string | null): boolean {
  return (
    typeof ref === 'string' &&
    ref.trim().toUpperCase().startsWith(FREE_GIFT_REF_PREFIX)
  );
}

function normalizeMemberScheduleDoc(
  id: string,
  raw: Omit<MemberScheduleSession, 'id'>
): MemberScheduleSession {
  const isGift =
    isGiftPaymentRef(raw.paymentReference) ||
    raw.isPaid === false ||
    raw.paymentStatus === 'free';
  if (isGift) {
    return {
      id,
      ...raw,
      isPaid: false,
      priceCents: 0,
      paymentStatus: 'free',
      paymentMethod: 'free',
      paymentReference: '',
    };
  }
  return {
    id,
    ...raw,
  };
}

export function subscribeAllMemberSchedules(
  onData: (sessions: MemberScheduleSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'memberSchedules'),
    (snapshot) => {
      const list: MemberScheduleSession[] = snapshot.docs.map((d) =>
        normalizeMemberScheduleDoc(
          d.id,
          d.data() as Omit<MemberScheduleSession, 'id'>
        )
      );
      list.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'memberSchedules');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeCoachMemberSchedules(params: {
  coachUid: string;
  isPrimaryBootstrapped: boolean;
  onData: (sessions: MemberScheduleSession[]) => void;
  onError?: (err: Error) => void;
}): Unsubscribe {
  const sourceQuery = params.isPrimaryBootstrapped
    ? collection(db, 'memberSchedules')
    : query(
        collection(db, 'memberSchedules'),
        where('coachUid', '==', params.coachUid)
      );
  return onSnapshot(
    sourceQuery,
    (snapshot) => {
      const list: MemberScheduleSession[] = snapshot.docs.map((d) =>
        normalizeMemberScheduleDoc(
          d.id,
          d.data() as Omit<MemberScheduleSession, 'id'>
        )
      );
      list.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
      params.onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'memberSchedules');
      } catch (wrapped) {
        if (params.onError && wrapped instanceof Error) {
          params.onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMyMemberSchedule(
  memberEmail: string,
  onData: (sessions: MemberScheduleSession[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = memberEmail.trim().toLowerCase();
  const q = query(
    collection(db, 'memberSchedules'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: MemberScheduleSession[] = snapshot.docs.map((d) =>
        normalizeMemberScheduleDoc(
          d.id,
          d.data() as Omit<MemberScheduleSession, 'id'>
        )
      );
      list.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'memberSchedules');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

function sanitizeObjectiveList(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const clean = raw.trim().slice(0, VALIDATION_LIMITS.EXERCISE_OBJECTIVE_MAX);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= VALIDATION_LIMITS.EXERCISE_OBJECTIVES_MAX_COUNT) break;
  }
  return out;
}

function sanitizeScheduledExercises(
  items?: ScheduledExerciseItem[]
): ScheduledExerciseItem[] {
  if (!Array.isArray(items)) return [];
  const out: ScheduledExerciseItem[] = [];
  for (const item of items) {
    const name = (item.name ?? '')
      .trim()
      .slice(0, VALIDATION_LIMITS.EXERCISE_NAME_MAX);
    if (name.length < VALIDATION_LIMITS.EXERCISE_NAME_MIN) continue;
    const rawId = (item.exerciseId ?? 'custom').trim().slice(0, 128);
    const exerciseId = /^[a-zA-Z0-9_\-]+$/.test(rawId) ? rawId : 'custom';
    const category: ExerciseCategory =
      item.category === 'running' || item.category === 'mobility'
        ? item.category
        : 'strength';
    const clamped = clampExerciseParams({
      repetitions: item.repetitions,
      durationSeconds: item.durationSeconds,
      setsOrRounds: item.setsOrRounds,
      intraSetPauseSeconds: item.intraSetPauseSeconds,
      restBetweenRoundsSeconds: item.restBetweenRoundsSeconds,
    });
    out.push({
      exerciseId,
      name,
      category,
      ...clamped,
      notes: (item.notes ?? '')
        .trim()
        .slice(0, VALIDATION_LIMITS.SESSION_EXERCISE_NOTES_MAX),
    });
    if (out.length >= VALIDATION_LIMITS.SESSION_EXERCISES_MAX) break;
  }
  return out;
}

export async function createMemberScheduleSession(params: {
  memberEmail: string;
  memberName: string;
  title: string;
  discipline: string;
  notes: string;
  location: string;
  startDate: Date;
  durationMinutes: number;
  coachUid?: string;
  coachName?: string;
  objective?: string;
  exercises?: ScheduledExerciseItem[];
  isPaid?: boolean;
  priceCents?: number;
  paymentMode?: EventPaymentMode;
  markPaid?: boolean;
  createdByUid: string;
  createdByRole: 'coach' | 'member';
}): Promise<string> {
  if (params.createdByRole !== 'coach') {
    throw new Error('Seul un coach peut ajouter une séance personnalisée.');
  }
  const cleanEmail = params.memberEmail
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(cleanEmail)) {
    throw new Error('Adresse email adhérent invalide.');
  }

  const title = params.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error(
      `Le titre de la séance doit contenir au moins ${VALIDATION_LIMITS.TITLE_MIN} caractères.`
    );
  }

  const discipline = params.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  if (discipline.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Veuillez indiquer une discipline valide.');
  }

  if (Number.isNaN(params.startDate.getTime())) {
    throw new Error('Date et heure de séance invalides.');
  }

  const durationMinutes = Math.min(
    VALIDATION_LIMITS.DURATION_MAX,
    Math.max(
      VALIDATION_LIMITS.DURATION_MIN,
      Math.round(Number(params.durationMinutes) || 45)
    )
  );
  const memberEmailKey = await hashEmailKey(cleanEmail);
  const memberName = (
    params.memberName.trim() ||
    cleanEmail.split('@')[0] ||
    'Adhérent'
  ).slice(0, 125);
  const notes = params.notes
    .trim()
    .slice(0, VALIDATION_LIMITS.SCHEDULE_NOTES_MAX);
  const location = params.location
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const coachUid = (params.coachUid ?? '').trim().slice(0, 128);
  const coachName = (params.coachName ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const objective = (params.objective ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.SESSION_OBJECTIVE_MAX);
  const exercises = sanitizeScheduledExercises(params.exercises);

  const isCoachCreated = params.createdByRole === 'coach';
  const sessionRef = doc(collection(db, 'memberSchedules'));
  try {
    const payload: Record<string, unknown> = {
      memberEmail: cleanEmail,
      memberEmailKey,
      memberName,
      title,
      discipline,
      notes,
      location,
      startAt: Timestamp.fromDate(params.startDate),
      durationMinutes,
      coachUid,
      coachName,
      createdByUid: params.createdByUid,
      createdByRole: params.createdByRole,
      completed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (isCoachCreated) {
      const shouldBePaid =
        params.isPaid !== undefined
          ? Boolean(params.isPaid)
          : params.priceCents !== 0;
      if (!shouldBePaid) {
        // Satisfy live Firestore rules (coach-created memberSchedules require isPaid == true && priceCents >= 100)
        // while marking the session free/offert cleanly via paymentReference prefix OFFERT-.
        payload.isPaid = true;
        payload.priceCents = VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS;
        payload.currency = 'EUR';
        payload.paymentMode = 'both';
        payload.paymentStatus = 'paid';
        payload.paymentMethod = 'onsite';
        payload.paymentReference = generatePaymentReference('OFFERT');
        payload.cardBrand = '';
        payload.cardLast4 = '';
        payload.paidAt = serverTimestamp();
      } else {
        const resolvedPriceCents = Math.min(
          VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS,
          Math.max(
            VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS,
            Math.round(Number(params.priceCents) || 900)
          )
        );
        const resolvedPaymentMode: EventPaymentMode =
          params.paymentMode === 'online' ||
          params.paymentMode === 'onsite' ||
          params.paymentMode === 'both'
            ? params.paymentMode
            : 'both';
        payload.isPaid = true;
        payload.priceCents = resolvedPriceCents;
        payload.currency = 'EUR';
        payload.paymentMode = resolvedPaymentMode;
        payload.paymentStatus = params.markPaid ? 'paid' : 'pending';
        payload.paymentMethod = 'onsite';
        payload.paymentReference = params.markPaid
          ? generatePaymentReference('PGM')
          : '';
        payload.cardBrand = '';
        payload.cardLast4 = '';
        payload.paidAt = params.markPaid ? serverTimestamp() : null;
      }
    }
    if (objective) {
      payload.objective = objective;
    }
    if (exercises.length > 0) {
      payload.exercises = exercises;
    }
    await setDoc(sessionRef, payload);
    return sessionRef.id;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `memberSchedules/${sessionRef.id}`
    );
  }
}

export async function updateMemberScheduleSession(
  sessionId: string,
  params: {
    title: string;
    discipline: string;
    notes: string;
    location: string;
    startDate: Date;
    durationMinutes: number;
    coachUid?: string;
    coachName?: string;
    objective?: string;
    exercises?: ScheduledExerciseItem[];
    isPaid?: boolean;
    priceCents?: number;
    paymentMode?: EventPaymentMode;
    paymentStatus?: 'free' | 'paid' | 'pending';
    paymentMethod?: 'free' | 'card' | 'onsite';
    completed?: boolean;
  }
): Promise<void> {
  const title = params.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error(
      `Le titre de la séance doit contenir au moins ${VALIDATION_LIMITS.TITLE_MIN} caractères.`
    );
  }

  const discipline = params.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  if (discipline.length < VALIDATION_LIMITS.DISCIPLINE_MIN) {
    throw new Error('Veuillez indiquer une discipline valide.');
  }

  if (Number.isNaN(params.startDate.getTime())) {
    throw new Error('Date et heure de séance invalides.');
  }

  const durationMinutes = Math.min(
    VALIDATION_LIMITS.DURATION_MAX,
    Math.max(
      VALIDATION_LIMITS.DURATION_MIN,
      Math.round(Number(params.durationMinutes) || 45)
    )
  );
  const notes = params.notes
    .trim()
    .slice(0, VALIDATION_LIMITS.SCHEDULE_NOTES_MAX);
  const location = params.location
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const coachUid = (params.coachUid ?? '').trim().slice(0, 128);
  const coachName = (params.coachName ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);

  try {
    const payload: Record<string, unknown> = {
      title,
      discipline,
      notes,
      location,
      startAt: Timestamp.fromDate(params.startDate),
      durationMinutes,
      coachUid,
      coachName,
      completed: Boolean(params.completed),
      updatedAt: serverTimestamp(),
    };
    if (params.objective !== undefined) {
      payload.objective = params.objective
        .trim()
        .slice(0, VALIDATION_LIMITS.SESSION_OBJECTIVE_MAX);
    }
    if (params.exercises !== undefined) {
      payload.exercises = sanitizeScheduledExercises(params.exercises);
    }
    if (params.isPaid === false) {
      payload.isPaid = true;
      payload.priceCents = VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS;
      payload.currency = 'EUR';
      payload.paymentMode = 'both';
      payload.paymentStatus = 'paid';
      payload.paymentMethod = 'onsite';
      payload.paymentReference = generatePaymentReference('OFFERT');
      payload.cardBrand = '';
      payload.cardLast4 = '';
      payload.paidAt = serverTimestamp();
    } else {
      if (params.priceCents !== undefined || params.isPaid === true) {
        payload.isPaid = true;
        payload.priceCents = Math.min(
          VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS,
          Math.max(
            VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS,
            Math.round(Number(params.priceCents) || 900)
          )
        );
        payload.currency = 'EUR';
      }
      if (params.paymentMode !== undefined) {
        payload.paymentMode = params.paymentMode;
      }
      if (params.paymentStatus !== undefined) {
        payload.paymentStatus = params.paymentStatus;
        if (params.paymentStatus === 'pending') {
          payload.paymentReference = '';
          payload.cardBrand = '';
          payload.cardLast4 = '';
          payload.paidAt = null;
        }
      }
      if (params.paymentMethod !== undefined) {
        payload.paymentMethod = params.paymentMethod;
      }
    }
    await updateDoc(doc(db, 'memberSchedules', sessionId), payload);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `memberSchedules/${sessionId}`
    );
  }
}

export async function payMemberScheduleSession(params: {
  session: MemberScheduleSession;
  method: 'card' | 'onsite';
  cardBrand?: string;
  cardLast4?: string;
  isCoach?: boolean;
}): Promise<string> {
  const reference =
    params.session.paymentReference?.trim() || generatePaymentReference('PGM');
  try {
    if (params.isCoach) {
      await updateDoc(doc(db, 'memberSchedules', params.session.id), {
        isPaid: true,
        priceCents: Math.max(
          VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS,
          params.session.priceCents ?? 900
        ),
        currency: 'EUR',
        paymentMode: params.session.paymentMode ?? 'both',
        paymentStatus: 'paid',
        paymentMethod:
          params.session.paymentMethod === 'card' ? 'card' : 'onsite',
        paymentReference: reference,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return reference;
    }

    if (params.method === 'card') {
      const cleanLast4 = (params.cardLast4 ?? '').replace(/\D/g, '').slice(-4);
      if (cleanLast4.length !== 4) {
        throw new Error('Numéro de carte bancaire invalide.');
      }
      await updateDoc(doc(db, 'memberSchedules', params.session.id), {
        paymentStatus: 'paid',
        paymentMethod: 'card',
        paymentReference: reference,
        cardBrand: (params.cardBrand ?? 'CB').slice(0, 24),
        cardLast4: cleanLast4,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'memberSchedules', params.session.id), {
        paymentStatus: 'pending',
        paymentMethod: 'onsite',
        paymentReference: reference,
        cardBrand: '',
        cardLast4: '',
        paidAt: null,
        updatedAt: serverTimestamp(),
      });
    }
    return reference;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `memberSchedules/${params.session.id}`
    );
  }
}

export async function toggleMemberScheduleCompleted(
  sessionId: string,
  completed: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'memberSchedules', sessionId), {
      completed,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `memberSchedules/${sessionId}`
    );
  }
}

export type MoveOverrideTarget =
  | { kind: 'prog'; programId: string; sessionKey: string; key: string }
  | { kind: 'sched'; sessionId: string; key: string };

const MOVE_OVERRIDE_PROG_PREFIX = 'GFN_MOVE:prog:';
const MOVE_OVERRIDE_SCHED_PREFIX = 'GFN_MOVE:sched:';

export function parseMoveOverrideTarget(
  session: Pick<MemberScheduleSession, 'id' | 'objective'>
): MoveOverrideTarget | null {
  const obj = (session.objective ?? '').trim();
  if (obj.startsWith(MOVE_OVERRIDE_PROG_PREFIX)) {
    const rest = obj.slice(MOVE_OVERRIDE_PROG_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep > 0) {
      const programId = rest.slice(0, sep).trim();
      const sessionKey = rest.slice(sep + 1).trim();
      if (programId && sessionKey) {
        return {
          kind: 'prog',
          programId,
          sessionKey,
          key: `prog:${programId}:${sessionKey}`,
        };
      }
    }
  }
  if (obj.startsWith(MOVE_OVERRIDE_SCHED_PREFIX)) {
    const sessionId = obj.slice(MOVE_OVERRIDE_SCHED_PREFIX.length).trim();
    if (sessionId) {
      return {
        kind: 'sched',
        sessionId,
        key: `sched:${sessionId}`,
      };
    }
  }
  if (session.id.startsWith('move__p__')) {
    const rest = session.id.slice('move__p__'.length);
    const sep = rest.lastIndexOf('__');
    if (sep > 0) {
      const programId = rest.slice(0, sep).trim();
      const sessionKey = rest.slice(sep + 2).trim();
      if (programId && sessionKey) {
        return {
          kind: 'prog',
          programId,
          sessionKey,
          key: `prog:${programId}:${sessionKey}`,
        };
      }
    }
  }
  if (session.id.startsWith('move__s__')) {
    const sessionId = session.id.slice('move__s__'.length).trim();
    if (sessionId) {
      return {
        kind: 'sched',
        sessionId,
        key: `sched:${sessionId}`,
      };
    }
  }
  return null;
}

export function isMoveOverrideSession(
  session: Pick<MemberScheduleSession, 'id' | 'objective'>
): boolean {
  return parseMoveOverrideTarget(session) !== null;
}

function buildMoveOverrideDocId(
  target:
    | { kind: 'prog'; programId: string; sessionKey: string }
    | { kind: 'sched'; sessionId: string }
): string {
  const sanitize = (val: string) => val.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const raw =
    target.kind === 'prog'
      ? `move__p__${sanitize(target.programId)}__${sanitize(target.sessionKey)}`
      : `move__s__${sanitize(target.sessionId)}`;
  return raw.slice(0, 128);
}

export async function rescheduleMemberSessionDay(params: {
  target:
    | { kind: 'prog'; programId: string; sessionKey: string }
    | { kind: 'sched'; sessionId: string };
  memberEmail: string;
  memberName: string;
  title: string;
  discipline: string;
  durationMinutes: number;
  coachUid?: string;
  coachName?: string;
  newStartDate: Date;
  currentUserUid: string;
  existingOverrideDoc?: MemberScheduleSession | null;
}): Promise<string> {
  if (Number.isNaN(params.newStartDate.getTime())) {
    throw new Error('Date cible invalide.');
  }

  const resolvedUid = (auth.currentUser?.uid || params.currentUserUid || '').trim();
  const cleanEmail = (auth.currentUser?.email || params.memberEmail || '')
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  if (!resolvedUid || !VALIDATION_LIMITS.EMAIL_REGEX.test(cleanEmail)) {
    throw new Error(
      'Compte adhérent non authentifié. Reconnectez-vous puis réessayez.'
    );
  }

  const overrideId = params.existingOverrideDoc?.id || buildMoveOverrideDocId(params.target);
  const objective = (
    params.target.kind === 'prog'
      ? `${MOVE_OVERRIDE_PROG_PREFIX}${params.target.programId}:${params.target.sessionKey}`
      : `${MOVE_OVERRIDE_SCHED_PREFIX}${params.target.sessionId}`
  ).slice(0, VALIDATION_LIMITS.SESSION_OBJECTIVE_MAX);

  const rawTitle = params.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  const title =
    rawTitle.length >= VALIDATION_LIMITS.TITLE_MIN ? rawTitle : 'Séance déplacée';

  const rawDiscipline = params.discipline
    .trim()
    .slice(0, VALIDATION_LIMITS.DISCIPLINE_MAX);
  const discipline =
    rawDiscipline.length >= VALIDATION_LIMITS.DISCIPLINE_MIN
      ? rawDiscipline
      : 'Course à pied';

  const durationMinutes = Math.min(
    VALIDATION_LIMITS.DURATION_MAX,
    Math.max(
      VALIDATION_LIMITS.DURATION_MIN,
      Math.round(Number(params.durationMinutes) || 45)
    )
  );
  const rawCoachUid = (params.coachUid ?? '').trim().slice(0, 128);
  const coachUid = /^[a-zA-Z0-9_\-]+$/.test(rawCoachUid) ? rawCoachUid : '';
  const coachName = (params.coachName ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const memberName = (
    params.memberName.trim() ||
    cleanEmail.split('@')[0] ||
    'Adhérent'
  ).slice(0, 125);
  const notes = 'Séance déplacée par l’adhérent';

  if (
    params.existingOverrideDoc &&
    params.existingOverrideDoc.createdByRole === 'member'
  ) {
    try {
      await updateDoc(doc(db, 'memberSchedules', overrideId), {
        title,
        discipline,
        notes,
        startAt: Timestamp.fromDate(params.newStartDate),
        durationMinutes,
        objective,
        updatedAt: serverTimestamp(),
      });
      return overrideId;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `memberSchedules/${overrideId}`
      );
    }
  }

  try {
    const memberEmailKey = await hashEmailKey(cleanEmail);
    await setDoc(doc(db, 'memberSchedules', overrideId), {
      memberEmail: cleanEmail,
      memberEmailKey,
      memberName,
      title,
      discipline,
      notes,
      location: '',
      startAt: Timestamp.fromDate(params.newStartDate),
      durationMinutes,
      coachUid,
      coachName,
      objective,
      isPaid: false,
      createdByUid: resolvedUid,
      createdByRole: 'member',
      completed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return overrideId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `memberSchedules/${overrideId}`
    );
  }
}

export async function resetMemberSessionDay(overrideDocId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'memberSchedules', overrideDocId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `memberSchedules/${overrideDocId}`
    );
  }
}

export interface ProgramSessionEditOverrideTarget {
  programId: string;
  sessionKey: string;
  key: string;
}

const PROG_EDIT_OVERRIDE_PREFIX = 'GFN_PROG_EDIT:';

export function parseProgramSessionEditOverride(
  session: Pick<MemberScheduleSession, 'id' | 'objective'>
): ProgramSessionEditOverrideTarget | null {
  const obj = (session.objective ?? '').trim();
  if (obj.startsWith(PROG_EDIT_OVERRIDE_PREFIX)) {
    const rest = obj.slice(PROG_EDIT_OVERRIDE_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep > 0) {
      const programId = rest.slice(0, sep).trim();
      const sessionKey = rest.slice(sep + 1).trim();
      if (programId && sessionKey) {
        return {
          programId,
          sessionKey,
          key: `${programId}:${sessionKey}`,
        };
      }
    }
  }
  if (session.id.startsWith('edit__p__')) {
    const rest = session.id.slice('edit__p__'.length);
    const sep = rest.lastIndexOf('__');
    if (sep > 0) {
      const programId = rest.slice(0, sep).trim();
      const sessionKey = rest.slice(sep + 2).trim();
      if (programId && sessionKey) {
        return {
          programId,
          sessionKey,
          key: `${programId}:${sessionKey}`,
        };
      }
    }
  }
  return null;
}

const PROG_NOTIF_ACK_PREFIX = 'GFN_NOTIF_ACK:';

export function parseProgramNotificationAck(
  session: Pick<MemberScheduleSession, 'id' | 'objective'>
): { notifId: string; status: 'read' | 'dismissed' } | null {
  const obj = (session.objective ?? '').trim();
  let notifId = '';
  if (obj.startsWith(PROG_NOTIF_ACK_PREFIX)) {
    notifId = obj.slice(PROG_NOTIF_ACK_PREFIX.length).trim();
  } else if (session.id.startsWith('ack__')) {
    notifId = session.id.slice('ack__'.length).trim();
  }
  if (!notifId) return null;
  const status = (session as Partial<MemberScheduleSession>).notes === 'dismissed'
    ? 'dismissed'
    : 'read';
  return { notifId, status };
}

const PROG_VMA_RESULT_PREFIX = 'GFN_VMA_RESULT:';

function buildProgramVmaResultDocId(programId: string): string {
  const sanitize = (val: string) => val.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `vma__p__${sanitize(programId)}`.slice(0, 128);
}

export function parseProgramVmaResultOverride(
  session: Pick<MemberScheduleSession, 'id' | 'objective' | 'notes' | 'startAt'>
): {
  programId: string;
  vmaKmh: number;
  distanceMeters: number;
  durationSeconds: number;
  testedAt: Timestamp;
} | null {
  const obj = (session.objective ?? '').trim();
  let programId = '';
  if (obj.startsWith(PROG_VMA_RESULT_PREFIX)) {
    programId = obj.slice(PROG_VMA_RESULT_PREFIX.length).trim();
  } else if (session.id.startsWith('vma__p__')) {
    programId = session.id.slice('vma__p__'.length).trim();
  }
  if (!programId) return null;

  const parts = (session.notes ?? '').split('|').map((v) => Number(v.trim()));
  const vmaKmh = parts[0];
  if (
    !Number.isFinite(vmaKmh) ||
    vmaKmh < VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH ||
    vmaKmh > VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH
  ) {
    return null;
  }
  const distanceMeters =
    Number.isFinite(parts[1]) && parts[1] >= 0
      ? Math.min(10000, Math.round(parts[1]))
      : 0;
  const durationSeconds =
    Number.isFinite(parts[2]) && parts[2] >= 0
      ? Math.min(3600, Math.round(parts[2]))
      : 360;
  const testedAt = session.startAt;
  return {
    programId,
    vmaKmh: Math.round(vmaKmh * 10) / 10,
    distanceMeters,
    durationSeconds,
    testedAt,
  };
}

export function mergeTrainingProgramsWithMemberSchedules(
  programs: TrainingProgram[],
  memberSchedules: MemberScheduleSession[]
): TrainingProgram[] {
  if (programs.length === 0 || memberSchedules.length === 0) return programs;
  const vmaByProgramId = new Map<
    string,
    NonNullable<ReturnType<typeof parseProgramVmaResultOverride>>
  >();

  memberSchedules.forEach((sess) => {
    const parsed = parseProgramVmaResultOverride(sess);
    if (!parsed) return;
    const prev = vmaByProgramId.get(parsed.programId);
    if (
      !prev ||
      parsed.testedAt.toMillis() >= prev.testedAt.toMillis()
    ) {
      vmaByProgramId.set(parsed.programId, parsed);
    }
  });

  if (vmaByProgramId.size === 0) return programs;

  return programs.map((prog) => {
    const override = vmaByProgramId.get(prog.id);
    if (!override) return prog;
    const existingMs = prog.vmaTestedAt?.toMillis?.() ?? 0;
    const overrideMs = override.testedAt?.toMillis?.() ?? 0;
    if (prog.vmaTestStatus === 'completed' && existingMs >= overrideMs) {
      return prog;
    }
    return {
      ...prog,
      vmaTestStatus: 'completed',
      vmaKmh: override.vmaKmh,
      vmaTestDistanceMeters: override.distanceMeters,
      vmaTestDurationSeconds: override.durationSeconds,
      vmaTestedAt: override.testedAt,
      status: prog.status === 'awaiting_vma' ? 'active' : prog.status,
    };
  });
}

export function parseArchivedRegistrationStat(
  session: MemberScheduleSession
): Registration | null {
  const obj = (session.objective ?? '').trim();
  const isRegStat =
    obj.startsWith(REG_STAT_PREFIX) || session.id.startsWith('regstat__');
  if (!isRegStat) return null;

  let parsedMeta: {
    regId?: string;
    eventId?: string;
    isGuest?: boolean;
    firstName?: string;
    lastName?: string;
    cancelledBy?: 'member' | 'admin';
    eventCancelled?: boolean;
  } = {};
  try {
    if (session.notes && session.notes.trim().startsWith('{')) {
      parsedMeta = JSON.parse(session.notes) as typeof parsedMeta;
    }
  } catch {
    parsedMeta = {};
  }

  const fallbackRegId = obj.startsWith(REG_STAT_PREFIX)
    ? obj.slice(REG_STAT_PREFIX.length).trim()
    : session.id.slice('regstat__'.length).trim();
  const regId = (parsedMeta.regId || fallbackRegId || session.id).trim();
  const sepIdx = regId.indexOf('__');
  const fallbackEventId = sepIdx > 0 ? regId.slice(0, sepIdx) : regId;
  const eventId = (parsedMeta.eventId || fallbackEventId).trim();
  if (!regId || !eventId || !session.memberEmail) return null;

  const nameParts = (session.memberName || '').trim().split(/\s+/);
  const firstName =
    parsedMeta.firstName?.trim() || nameParts[0] || session.memberEmail;
  const lastName =
    parsedMeta.lastName?.trim() || nameParts.slice(1).join(' ') || '';

  return {
    id: regId,
    eventId,
    eventTitle: session.title,
    eventStartAt: session.startAt,
    eventDurationMinutes: session.durationMinutes,
    firstName,
    lastName,
    email: session.memberEmail,
    emailKey: session.memberEmailKey,
    attended: Boolean(session.completed),
    status: parsedMeta.eventCancelled ? 'cancelled' : 'confirmed',
    isGuest: Boolean(parsedMeta.isGuest),
    discipline: session.discipline,
    isArchivedStat: true,
    cancelledBy: parsedMeta.cancelledBy === 'member' ? 'member' : 'admin',
    eventCancelled: Boolean(parsedMeta.eventCancelled),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function mergeRegistrationsWithArchivedStats(
  registrations: Registration[],
  memberSchedules: MemberScheduleSession[],
  options?: {
    events?: SportEvent[];
    memberNotifications?: MemberNotification[];
  }
): Registration[] {
  const statByRegId = new Map<string, Registration>();
  memberSchedules.forEach((sess) => {
    const statReg = parseArchivedRegistrationStat(sess);
    if (statReg && !statByRegId.has(statReg.id)) {
      statByRegId.set(statReg.id, statReg);
    }
  });

  const eventsById = new Map(
    (options?.events ?? []).map((ev) => [ev.id, ev])
  );
  const adminCancelNotifRegIds = new Set<string>();
  (options?.memberNotifications ?? []).forEach((notif) => {
    if (notif.type === 'event_cancelled' && notif.registrationId) {
      adminCancelNotifRegIds.add(notif.registrationId);
    }
  });

  const liveIds = new Set<string>();
  const enrichedLive = registrations.map((reg) => {
    liveIds.add(reg.id);
    const matchedEvent = eventsById.get(reg.eventId);
    const isEventCancelled = matchedEvent?.status === 'cancelled';
    const statMeta = statByRegId.get(reg.id);

    if (reg.status === 'confirmed' && !isEventCancelled) {
      return reg.cancelledBy
        ? { ...reg, cancelledBy: undefined, eventCancelled: false }
        : reg;
    }

    const isAdminCancelled =
      statMeta?.cancelledBy === 'admin' ||
      adminCancelNotifRegIds.has(reg.id) ||
      (reg.status === 'confirmed' && isEventCancelled);

    return {
      ...reg,
      attended: reg.attended || Boolean(statMeta?.attended),
      cancelledBy: isAdminCancelled ? ('admin' as const) : ('member' as const),
      eventCancelled: Boolean(statMeta?.eventCancelled || isEventCancelled),
    };
  });

  const archivedOnly: Registration[] = [];
  statByRegId.forEach((statReg, regId) => {
    if (!liveIds.has(regId)) {
      archivedOnly.push(statReg);
    }
  });

  if (archivedOnly.length === 0) return enrichedLive;
  return [...enrichedLive, ...archivedOnly];
}

export function isInternalScheduleOverride(
  session: Pick<MemberScheduleSession, 'id' | 'objective'>
): boolean {
  return (
    parseMoveOverrideTarget(session) !== null ||
    parseProgramSessionEditOverride(session) !== null ||
    parseProgramNotificationAck(session) !== null ||
    parseProgramVmaResultOverride(
      session as Pick<MemberScheduleSession, 'id' | 'objective' | 'notes' | 'startAt'>
    ) !== null ||
    (session.objective ?? '').trim().startsWith(REG_STAT_PREFIX) ||
    session.id.startsWith('regstat__')
  );
}

function buildProgramSessionEditDocId(
  programId: string,
  sessionKey: string
): string {
  const sanitize = (val: string) => val.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `edit__p__${sanitize(programId)}__${sanitize(sessionKey)}`.slice(0, 128);
}

export interface EffectiveProgramSession extends GeneratedProgramSession {
  originalScheduledDate: Date;
  coachPlannedDate: Date;
  isEditedByCoach: boolean;
  coachEditOverrideDoc?: MemberScheduleSession;
  isMovedByMember: boolean;
  memberMoveOverrideDoc?: MemberScheduleSession;
}

export function buildEffectiveProgramSessions(
  program: TrainingProgram,
  memberSchedules: MemberScheduleSession[],
  nowMs: number = Date.now()
): EffectiveProgramSession[] {
  const generated = generateRunningProgramSessions(program, nowMs);
  const coachEditMap = new Map<string, MemberScheduleSession>();
  const memberMoveMap = new Map<string, MemberScheduleSession>();

  memberSchedules.forEach((sess) => {
    const editMeta = parseProgramSessionEditOverride(sess);
    if (editMeta && editMeta.programId === program.id) {
      coachEditMap.set(editMeta.sessionKey, sess);
      return;
    }
    const moveMeta = parseMoveOverrideTarget(sess);
    if (
      moveMeta &&
      moveMeta.kind === 'prog' &&
      moveMeta.programId === program.id
    ) {
      memberMoveMap.set(moveMeta.sessionKey, sess);
    }
  });

  return generated.map((gs) => {
    const coachEdit = coachEditMap.get(gs.key);
    const memberMove = memberMoveMap.get(gs.key);

    const coachPlannedDate = coachEdit
      ? coachEdit.startAt.toDate()
      : gs.scheduledDate;
    const effectiveDate = memberMove
      ? memberMove.startAt.toDate()
      : coachPlannedDate;
    const isMovedByMember =
      Boolean(memberMove) &&
      (effectiveDate.getFullYear() !== coachPlannedDate.getFullYear() ||
        effectiveDate.getMonth() !== coachPlannedDate.getMonth() ||
        effectiveDate.getDate() !== coachPlannedDate.getDate());

    return {
      ...gs,
      title: coachEdit?.title || gs.title,
      discipline: coachEdit?.discipline || gs.discipline,
      durationMinutes: coachEdit?.durationMinutes ?? gs.durationMinutes,
      coachNotes: coachEdit ? coachEdit.notes : gs.coachNotes,
      targetPaceLabel: coachEdit?.location
        ? coachEdit.location
        : gs.targetPaceLabel,
      exercises:
        coachEdit && coachEdit.exercises !== undefined
          ? coachEdit.exercises
          : gs.exercises,
      scheduledDate: effectiveDate,
      originalScheduledDate: gs.scheduledDate,
      coachPlannedDate,
      isEditedByCoach: Boolean(coachEdit),
      coachEditOverrideDoc: coachEdit,
      isMovedByMember,
      memberMoveOverrideDoc: memberMove,
    };
  });
}

export async function saveTrainingProgramSessionOverride(params: {
  program: TrainingProgram;
  sessionKey: string;
  title: string;
  targetPaceLabel: string;
  coachNotes: string;
  startDate: Date;
  durationMinutes: number;
  exercises: ScheduledExerciseItem[];
  coachUid: string;
  existingOverrideDoc?: MemberScheduleSession | null;
}): Promise<string> {
  if (Number.isNaN(params.startDate.getTime())) {
    throw new Error('Date et heure de séance invalides.');
  }

  const resolvedUid = (auth.currentUser?.uid || params.coachUid || '').trim();
  if (!resolvedUid) {
    throw new Error('Coach non authentifié.');
  }

  const cleanEmail = params.program.memberEmail
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(cleanEmail)) {
    throw new Error('Adresse email adhérent invalide.');
  }

  const title = params.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error(
      `Le titre de la séance doit contenir au moins ${VALIDATION_LIMITS.TITLE_MIN} caractères.`
    );
  }

  const durationMinutes = Math.min(
    VALIDATION_LIMITS.DURATION_MAX,
    Math.max(
      VALIDATION_LIMITS.DURATION_MIN,
      Math.round(Number(params.durationMinutes) || 45)
    )
  );
  const notes = params.coachNotes
    .trim()
    .slice(0, VALIDATION_LIMITS.SCHEDULE_NOTES_MAX);
  const location = params.targetPaceLabel
    .trim()
    .slice(0, VALIDATION_LIMITS.LOCATION_MAX);
  const exercises = sanitizeScheduledExercises(params.exercises);

  const memberName = (
    params.program.memberName.trim() ||
    cleanEmail.split('@')[0] ||
    'Adhérent'
  ).slice(0, 125);
  const rawCoachUid = (params.program.coachUid || resolvedUid).trim().slice(0, 128);
  const coachUid = /^[a-zA-Z0-9_\-]+$/.test(rawCoachUid) ? rawCoachUid : '';
  const coachName = (params.program.coachName || 'Coach')
    .trim()
    .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const objective = `${PROG_EDIT_OVERRIDE_PREFIX}${params.program.id}:${params.sessionKey}`.slice(
    0,
    VALIDATION_LIMITS.SESSION_OBJECTIVE_MAX
  );
  const docId =
    params.existingOverrideDoc?.id ||
    buildProgramSessionEditDocId(params.program.id, params.sessionKey);
  const docRef = doc(db, 'memberSchedules', docId);
  const completed = Boolean(
    params.program.completedSessionKeys?.includes(params.sessionKey)
  );

  let alreadyExists = Boolean(params.existingOverrideDoc);
  if (!alreadyExists) {
    try {
      const snap = await getDoc(docRef);
      alreadyExists = snap.exists();
    } catch {
      alreadyExists = false;
    }
  }

  if (alreadyExists) {
    try {
      await updateDoc(docRef, {
        memberName,
        title,
        discipline: 'Course à pied',
        notes,
        location,
        startAt: Timestamp.fromDate(params.startDate),
        durationMinutes,
        coachUid,
        coachName,
        objective,
        exercises,
        completed,
        updatedAt: serverTimestamp(),
      });
      return docId;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `memberSchedules/${docId}`
      );
    }
  }

  try {
    const memberEmailKey = await hashEmailKey(cleanEmail);
    await setDoc(docRef, {
      memberEmail: cleanEmail,
      memberEmailKey,
      memberName,
      title,
      discipline: 'Course à pied',
      notes,
      location,
      startAt: Timestamp.fromDate(params.startDate),
      durationMinutes,
      coachUid,
      coachName,
      objective,
      exercises,
      isPaid: true,
      priceCents: VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS,
      currency: 'EUR',
      paymentMode: 'both',
      paymentStatus: 'paid',
      paymentMethod: 'onsite',
      paymentReference: generatePaymentReference('OFFERT'),
      cardBrand: '',
      cardLast4: '',
      paidAt: serverTimestamp(),
      createdByUid: resolvedUid,
      createdByRole: 'coach',
      completed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `memberSchedules/${docId}`
    );
  }
}

export async function resetTrainingProgramSessionOverride(
  overrideDocId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'memberSchedules', overrideDocId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `memberSchedules/${overrideDocId}`
    );
  }
}

export async function deleteMemberScheduleSession(
  sessionId: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'memberSchedules', sessionId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `memberSchedules/${sessionId}`
    );
  }
  try {
    const overrideId = buildMoveOverrideDocId({ kind: 'sched', sessionId });
    await deleteDoc(doc(db, 'memberSchedules', overrideId));
  } catch {
    // Non-blocking cleanup if no override exists
  }
  try {
    const ackId = buildProgramNotificationAckDocId(`sched__${sessionId}`);
    await deleteDoc(doc(db, 'memberSchedules', ackId));
  } catch {
    // Non-blocking cleanup if no ack exists
  }
}

function buildProgramNotificationAckDocId(notifId: string): string {
  const sanitize = (val: string) => val.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `ack__${sanitize(notifId)}`.slice(0, 128);
}

export function buildMemberProgramNotifications(params: {
  trainingPrograms: TrainingProgram[];
  memberSchedules: MemberScheduleSession[];
  localAckStates?: Map<string, 'read' | 'dismissed'>;
  nowMs?: number;
}): MemberProgramNotification[] {
  const nowMs = params.nowMs ?? Date.now();
  const ackByNotifId = new Map<
    string,
    { status: 'read' | 'dismissed'; doc?: MemberScheduleSession }
  >();

  params.memberSchedules.forEach((sess) => {
    const parsed = parseProgramNotificationAck(sess);
    if (!parsed) return;
    ackByNotifId.set(parsed.notifId, { status: parsed.status, doc: sess });
  });

  params.localAckStates?.forEach((status, notifId) => {
    const existing = ackByNotifId.get(notifId);
    if (!existing || status === 'dismissed') {
      ackByNotifId.set(notifId, { status, doc: existing?.doc });
    }
  });

  const results: MemberProgramNotification[] = [];

  params.trainingPrograms.forEach((prog) => {
    if (prog.status === 'completed') return;

    const delivery = getProgramDeliveryProgress(prog, nowMs);
    const tpl = RUNNING_DISTANCE_TEMPLATES[prog.distance];
    const isFree = !prog.isPaid || prog.paymentStatus === 'free';
    const requiresPayment = Boolean(prog.isPaid) && prog.paymentStatus !== 'paid';
    const startDate =
      (prog.desiredStartAt ?? prog.startAt)?.toDate?.() ?? new Date(nowMs);
    const createdAtMs = prog.createdAt?.toMillis?.() ?? startDate.getTime();
    const durationWeeks = prog.durationWeeks || delivery.totalWeeks;
    const levelLabel = getProgramRunnerLevelLabel(prog.level ?? 'regular');

    const baseNotifId = `prog__${prog.id}`;
    const baseAck = ackByNotifId.get(baseNotifId);

    if (baseAck?.status !== 'dismissed') {
      const paymentLabel = isFree
        ? delivery.awaitingVma
          ? 'Offert · Envoi en attente du Test VMA (Sem. 1 dès validation)'
          : delivery.unlockedWeeks <= 1
            ? `Offert · VMA validée · Semaine 1 envoyée${delivery.nextUnlockAtMs ? ` (Sem. 2 le ${delivery.autoSendLabel})` : ''}`
            : `Offert · Semaine ${delivery.unlockedWeeks}/${durationWeeks} envoyée`
        : requiresPayment
          ? `${formatPriceEuros(prog.priceCents)} · Paiement requis · Envoi après Test VMA`
          : delivery.awaitingVma
            ? 'Payé · Envoi en attente du Test VMA (Sem. 1 dès validation)'
            : delivery.unlockedWeeks <= 1
              ? `Payé · VMA validée · Semaine 1 envoyée${delivery.nextUnlockAtMs ? ` (Sem. 2 le ${delivery.autoSendLabel})` : ''}`
              : `Payé · Semaine ${delivery.unlockedWeeks}/${durationWeeks} envoyée`;

      results.push({
        id: baseNotifId,
        kind: 'running_program',
        title: prog.title,
        coachName: prog.coachName || 'Votre coach',
        coachUid: prog.coachUid,
        summary: `${tpl.shortLabel} · ${durationWeeks} sem. (${levelLabel}) · ${prog.sessionsPerWeek} séances/sem. · ${paymentLabel}`,
        priceCents: prog.priceCents,
        isFree,
        requiresPayment,
        durationWeeks,
        weekNumber:
          delivery.hasAccess && !delivery.awaitingVma && delivery.unlockedWeeks >= 1
            ? delivery.unlockedWeeks
            : undefined,
        startDate,
        createdAtMs,
        read: baseAck?.status === 'read',
        programId: prog.id,
      });
    }

    if (
      delivery.hasAccess &&
      !delivery.awaitingVma &&
      delivery.unlockedWeeks >= 1 &&
      (delivery.unlockedWeeks >= 2 ||
        baseAck?.status === 'read' ||
        baseAck?.status === 'dismissed')
    ) {
      const weekNotifId = `week__${prog.id}__w${delivery.unlockedWeeks}`;
      const weekAck = ackByNotifId.get(weekNotifId);
      if (weekAck?.status !== 'dismissed') {
        const currentWeekWindow = delivery.weeks[delivery.unlockedWeeks - 1];
        const nextWeekHint =
          delivery.nextWeekNumber && delivery.nextUnlockAtMs
            ? ` Prochaine semaine (Sem. ${delivery.nextWeekNumber}) envoyée le ${delivery.autoSendLabel}.`
            : '';
        results.push({
          id: weekNotifId,
          kind: 'program_week',
          title: `${prog.title} · Semaine ${delivery.unlockedWeeks}/${durationWeeks}`,
          coachName: prog.coachName || 'Votre coach',
          coachUid: prog.coachUid,
          summary:
            delivery.unlockedWeeks === 1
              ? `Test VMA validé : la Semaine 1 de votre programme ${tpl.shortLabel} est disponible dans votre planning.${nextWeekHint}`
              : `La semaine ${delivery.unlockedWeeks} de votre programme ${tpl.shortLabel} est disponible dans votre planning.${nextWeekHint}`,
          priceCents: prog.priceCents,
          isFree,
          requiresPayment: false,
          durationWeeks,
          weekNumber: delivery.unlockedWeeks,
          startDate: currentWeekWindow
            ? new Date(currentWeekWindow.startAtMs)
            : startDate,
          createdAtMs: currentWeekWindow?.unlockAtMs ?? createdAtMs,
          read: weekAck?.status === 'read',
          programId: prog.id,
        });
      }
    }
  });

  params.memberSchedules.forEach((sess) => {
    if (sess.createdByRole !== 'coach') return;
    if (isInternalScheduleOverride(sess)) return;
    if (sess.completed) return;

    const notifId = `sched__${sess.id}`;
    const ack = ackByNotifId.get(notifId);
    if (ack?.status === 'dismissed') return;

    const startDate = sess.startAt?.toDate ? sess.startAt.toDate() : new Date(nowMs);
    const createdAtMs = sess.createdAt?.toMillis?.() ?? startDate.getTime();
    const isFree = !sess.isPaid || sess.paymentStatus === 'free';
    const requiresPayment = Boolean(sess.isPaid) && sess.paymentStatus !== 'paid';
    const exCount = sess.exercises?.length ?? 0;
    const pricePart = isFree
      ? 'Offerte par votre coach'
      : requiresPayment
        ? `${formatPriceEuros(sess.priceCents ?? 0)} · Paiement requis`
        : 'Payée';

    results.push({
      id: notifId,
      kind: 'custom_program',
      title: sess.title,
      coachName: sess.coachName || 'Votre coach',
      coachUid: sess.coachUid,
      summary: `${sess.discipline} · ${sess.durationMinutes} min${
        exCount > 0 ? ` · ${exCount} exercice${exCount > 1 ? 's' : ''}` : ''
      } · ${pricePart}`,
      priceCents: sess.priceCents ?? 0,
      isFree,
      requiresPayment,
      startDate,
      createdAtMs,
      read: ack?.status === 'read',
      scheduleSessionId: sess.id,
    });
  });

  return results.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    return b.createdAtMs - a.createdAtMs;
  });
}

export async function acknowledgeMemberProgramNotification(params: {
  notifId: string;
  status: 'read' | 'dismissed';
  memberEmail: string;
  memberName: string;
  currentUserUid: string;
  memberSchedules: MemberScheduleSession[];
}): Promise<void> {
  const resolvedUid = (auth.currentUser?.uid || params.currentUserUid || '').trim();
  const cleanEmail = (auth.currentUser?.email || params.memberEmail || '')
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);

  if (!resolvedUid || !VALIDATION_LIMITS.EMAIL_REGEX.test(cleanEmail)) {
    return;
  }

  const ackDocId = buildProgramNotificationAckDocId(params.notifId);
  const existingDoc = params.memberSchedules.find(
    (s) => s.id === ackDocId || parseProgramNotificationAck(s)?.notifId === params.notifId
  );
  const objective = `${PROG_NOTIF_ACK_PREFIX}${params.notifId}`.slice(
    0,
    VALIDATION_LIMITS.SESSION_OBJECTIVE_MAX
  );
  const memberName = (
    params.memberName.trim() ||
    cleanEmail.split('@')[0] ||
    'Adhérent'
  ).slice(0, 125);

  if (existingDoc && existingDoc.createdByRole === 'member') {
    if (existingDoc.notes === params.status) return;
    try {
      await updateDoc(doc(db, 'memberSchedules', existingDoc.id), {
        notes: params.status,
        completed: true,
        updatedAt: serverTimestamp(),
      });
      return;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `memberSchedules/${existingDoc.id}`
      );
    }
  }

  try {
    const memberEmailKey = await hashEmailKey(cleanEmail);
    await setDoc(doc(db, 'memberSchedules', ackDocId), {
      memberEmail: cleanEmail,
      memberEmailKey,
      memberName,
      title: 'Notification lue',
      discipline: 'Course',
      notes: params.status,
      location: '',
      startAt: Timestamp.now(),
      durationMinutes: 15,
      coachUid: '',
      coachName: '',
      objective,
      isPaid: false,
      createdByUid: resolvedUid,
      createdByRole: 'member',
      completed: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `memberSchedules/${ackDocId}`
    );
  }
}

export async function acknowledgeAllMemberProgramNotifications(params: {
  notifications: MemberProgramNotification[];
  memberEmail: string;
  memberName: string;
  currentUserUid: string;
  memberSchedules: MemberScheduleSession[];
}): Promise<void> {
  const unread = params.notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  await Promise.all(
    unread.map((n) =>
      acknowledgeMemberProgramNotification({
        notifId: n.id,
        status: 'read',
        memberEmail: params.memberEmail,
        memberName: params.memberName,
        currentUserUid: params.currentUserUid,
        memberSchedules: params.memberSchedules,
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Bibliothèque d'exercices du coach (/exercises)
// ---------------------------------------------------------------------------

export function subscribeExercises(
  onData: (exercises: ExerciseLibraryItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'exercises'),
    (snapshot) => {
      const list: ExerciseLibraryItem[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ExerciseLibraryItem, 'id'>),
      }));
      list.sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'exercises');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createExercise(params: {
  name: string;
  category: ExerciseCategory;
  targetObjectives: string[];
  description: string;
  defaultParams: ExerciseParams;
  intensityHint?: string;
  isPreset?: boolean;
  coachUid: string;
  customId?: string;
}): Promise<string> {
  const name = params.name
    .trim()
    .slice(0, VALIDATION_LIMITS.EXERCISE_NAME_MAX);
  if (name.length < VALIDATION_LIMITS.EXERCISE_NAME_MIN) {
    throw new Error(
      `Le nom de l’exercice doit contenir au moins ${VALIDATION_LIMITS.EXERCISE_NAME_MIN} caractères.`
    );
  }
  const category: ExerciseCategory =
    params.category === 'running' || params.category === 'mobility'
      ? params.category
      : 'strength';
  const targetObjectives = sanitizeObjectiveList(params.targetObjectives);
  const description = params.description
    .trim()
    .slice(0, VALIDATION_LIMITS.EXERCISE_DESCRIPTION_MAX);
  const defaultParams = clampExerciseParams(params.defaultParams);
  const intensityHint = (params.intensityHint ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.EXERCISE_INTENSITY_MAX);

  const ref =
    params.customId && /^[a-zA-Z0-9_\-]{4,128}$/.test(params.customId)
      ? doc(db, 'exercises', params.customId)
      : doc(collection(db, 'exercises'));

  try {
    const payload: Record<string, unknown> = {
      name,
      category,
      targetObjectives,
      description,
      defaultParams,
      intensityHint,
      isPreset: Boolean(params.isPreset),
      createdBy: params.coachUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `exercises/${ref.id}`);
  }
}

export async function updateExercise(
  exerciseId: string,
  params: {
    name: string;
    category: ExerciseCategory;
    targetObjectives: string[];
    description: string;
    defaultParams: ExerciseParams;
    intensityHint?: string;
    isPreset?: boolean;
  }
): Promise<void> {
  const name = params.name
    .trim()
    .slice(0, VALIDATION_LIMITS.EXERCISE_NAME_MAX);
  if (name.length < VALIDATION_LIMITS.EXERCISE_NAME_MIN) {
    throw new Error(
      `Le nom de l’exercice doit contenir au moins ${VALIDATION_LIMITS.EXERCISE_NAME_MIN} caractères.`
    );
  }
  const category: ExerciseCategory =
    params.category === 'running' || params.category === 'mobility'
      ? params.category
      : 'strength';
  const targetObjectives = sanitizeObjectiveList(params.targetObjectives);
  const description = params.description
    .trim()
    .slice(0, VALIDATION_LIMITS.EXERCISE_DESCRIPTION_MAX);
  const defaultParams = clampExerciseParams(params.defaultParams);
  const intensityHint = (params.intensityHint ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.EXERCISE_INTENSITY_MAX);

  try {
    await updateDoc(doc(db, 'exercises', exerciseId), {
      name,
      category,
      targetObjectives,
      description,
      defaultParams,
      intensityHint,
      isPreset: Boolean(params.isPreset),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `exercises/${exerciseId}`);
  }
}

export async function deleteExercise(exerciseId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'exercises', exerciseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `exercises/${exerciseId}`);
  }
}

export async function seedStarterExercises(
  coachUid: string,
  existingExercises: ExerciseLibraryItem[]
): Promise<number> {
  const existingIds = new Set(existingExercises.map((e) => e.id));
  const existingNames = new Set(
    existingExercises.map((e) => e.name.trim().toLowerCase())
  );
  const missing = STARTER_EXERCISES.filter(
    (tpl) =>
      !existingIds.has(tpl.presetId) &&
      !existingNames.has(tpl.name.trim().toLowerCase())
  );
  if (missing.length === 0) return 0;

  const batch = writeBatch(db);
  for (const tpl of missing) {
    const ref = doc(db, 'exercises', tpl.presetId);
    batch.set(ref, {
      name: tpl.name.slice(0, VALIDATION_LIMITS.EXERCISE_NAME_MAX),
      category: tpl.category,
      targetObjectives: sanitizeObjectiveList(tpl.targetObjectives),
      description: tpl.description.slice(
        0,
        VALIDATION_LIMITS.EXERCISE_DESCRIPTION_MAX
      ),
      defaultParams: clampExerciseParams(tpl.defaultParams),
      intensityHint: (tpl.intensityHint ?? '').slice(
        0,
        VALIDATION_LIMITS.EXERCISE_INTENSITY_MAX
      ),
      isPreset: true,
      createdBy: coachUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return missing.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'exercises');
  }
}

// ---------------------------------------------------------------------------
// Programmes running personnalisés (/trainingPrograms)
// 5 km (10/8 sem.), 10 km (12/10 sem.), 21 km (14/12 sem.), 42 km (16/14 sem.)
// Test VMA Jour 1 + Allures + Paiement obligatoire + 3 séances/sem. par défaut
// ---------------------------------------------------------------------------

const PROGRAM_META_TAG_REGEX =
  /\s*\[GFN:(8|10|12|14|16):(beginner|regular|experienced)(?::(\d{4}-\d{2}-\d{2}))?(?::d([1-7])-(\d{4}))?\]\s*$/;

function formatMetaIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseMetaIsoDate(raw?: string): Date | null {
  if (!raw) return null;
  const parts = raw.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const parsed = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function clampFirestoreProgramStartDate(desiredDate: Date): Date {
  const now = new Date();
  const safeFloor = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  return desiredDate.getTime() > safeFloor.getTime() ? safeFloor : desiredDate;
}

function encodeProgramNotesWithMeta(
  rawNotes: string,
  durationWeeks: number,
  level: ProgramRunnerLevel,
  desiredStartDate?: Date,
  autoSendDay?: number,
  autoSendTime?: string
): string {
  const cleanUserNotes = rawNotes.replace(PROGRAM_META_TAG_REGEX, '').trim();
  const datePart =
    desiredStartDate && !Number.isNaN(desiredStartDate.getTime())
      ? `:${formatMetaIsoDate(desiredStartDate)}`
      : '';
  const safeDay = normalizeAutoSendDay(autoSendDay);
  const parsedTime = parseAutoSendTime(autoSendTime);
  const hhmm = parsedTime.normalized.replace(':', '');
  const sendPart =
    datePart &&
    (safeDay !== DEFAULT_AUTO_SEND_DAY ||
      parsedTime.normalized !== DEFAULT_AUTO_SEND_TIME)
      ? `:d${safeDay}-${hhmm}`
      : '';
  const tag = `[GFN:${durationWeeks}:${level}${datePart}${sendPart}]`;
  const maxUserLen = Math.max(
    0,
    VALIDATION_LIMITS.SCHEDULE_NOTES_MAX - tag.length - 1
  );
  const clampedUserNotes = cleanUserNotes.slice(0, maxUserLen).trim();
  return clampedUserNotes ? `${clampedUserNotes} ${tag}` : tag;
}

function normalizeTrainingProgramDoc(
  id: string,
  raw: Omit<TrainingProgram, 'id'>
): TrainingProgram {
  const rawNotes = raw.notes ?? '';
  const metaMatch = rawNotes.match(PROGRAM_META_TAG_REGEX);
  const cleanNotes = rawNotes.replace(PROGRAM_META_TAG_REGEX, '').trim();
  const parsedWeeks = metaMatch ? Number(metaMatch[1]) : undefined;
  const parsedLevel = metaMatch
    ? (metaMatch[2] as ProgramRunnerLevel)
    : undefined;
  const parsedDesiredDate = parseMetaIsoDate(metaMatch?.[3]);
  const desiredStartAt = parsedDesiredDate
    ? Timestamp.fromDate(parsedDesiredDate)
    : raw.startAt;
  const parsedAutoSendDay = metaMatch?.[4]
    ? normalizeAutoSendDay(Number(metaMatch[4]))
    : normalizeAutoSendDay(raw.autoSendDay);
  const rawAutoSendTime = metaMatch?.[5]
    ? `${metaMatch[5].slice(0, 2)}:${metaMatch[5].slice(2, 4)}`
    : raw.autoSendTime;
  const parsedAutoSendTime = parseAutoSendTime(rawAutoSendTime).normalized;

  const level: ProgramRunnerLevel =
    parsedLevel ??
    raw.level ??
    inferProgramLevelFromDuration(
      raw.distance,
      parsedWeeks ?? raw.durationWeeks
    );
  const durationWeeks =
    parsedWeeks ??
    (raw.level
      ? getProgramDurationWeeks(raw.distance, raw.level)
      : raw.durationWeeks || 12);

  const isGift =
    isGiftPaymentRef(raw.paymentReference) ||
    raw.isPaid === false ||
    raw.paymentStatus === 'free';

  if (isGift) {
    const normalizedStatus: TrainingProgramStatus =
      raw.status === 'awaiting_payment'
        ? raw.vmaTestStatus === 'completed'
          ? 'active'
          : 'awaiting_vma'
        : raw.status;
    return {
      id,
      ...raw,
      desiredStartAt,
      autoSendDay: parsedAutoSendDay,
      autoSendTime: parsedAutoSendTime,
      level,
      durationWeeks,
      notes: cleanNotes,
      isPaid: false,
      priceCents: 0,
      paymentStatus: 'free',
      paymentMethod: 'free',
      paymentReference: '',
      status: normalizedStatus,
    };
  }

  return {
    id,
    ...raw,
    desiredStartAt,
    autoSendDay: parsedAutoSendDay,
    autoSendTime: parsedAutoSendTime,
    level,
    durationWeeks,
    notes: cleanNotes,
  };
}

export function subscribeAllTrainingPrograms(
  onData: (programs: TrainingProgram[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'trainingPrograms'),
    (snapshot) => {
      const list: TrainingProgram[] = snapshot.docs.map((d) =>
        normalizeTrainingProgramDoc(
          d.id,
          d.data() as Omit<TrainingProgram, 'id'>
        )
      );
      list.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'trainingPrograms');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export function subscribeCoachTrainingPrograms(params: {
  coachUid: string;
  isPrimaryBootstrapped: boolean;
  onData: (programs: TrainingProgram[]) => void;
  onError?: (err: Error) => void;
}): Unsubscribe {
  const sourceQuery = params.isPrimaryBootstrapped
    ? collection(db, 'trainingPrograms')
    : query(
        collection(db, 'trainingPrograms'),
        where('coachUid', '==', params.coachUid)
      );
  return onSnapshot(
    sourceQuery,
    (snapshot) => {
      const list: TrainingProgram[] = snapshot.docs.map((d) =>
        normalizeTrainingProgramDoc(
          d.id,
          d.data() as Omit<TrainingProgram, 'id'>
        )
      );
      list.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
      params.onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'trainingPrograms');
      } catch (wrapped) {
        if (params.onError && wrapped instanceof Error) {
          params.onError(wrapped);
        }
      }
    }
  );
}

export function subscribeMyTrainingPrograms(
  memberEmail: string,
  onData: (programs: TrainingProgram[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const cleanEmail = memberEmail.trim().toLowerCase();
  const q = query(
    collection(db, 'trainingPrograms'),
    where('memberEmail', '==', cleanEmail)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: TrainingProgram[] = snapshot.docs.map((d) =>
        normalizeTrainingProgramDoc(
          d.id,
          d.data() as Omit<TrainingProgram, 'id'>
        )
      );
      list.sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis());
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'trainingPrograms');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function createTrainingProgram(params: {
  memberEmail: string;
  memberName: string;
  title?: string;
  distance: RunningDistanceKey;
  level?: ProgramRunnerLevel;
  sessionsPerWeek: number;
  preferredDays?: number[];
  targetTimeSeconds: number;
  startDate: Date;
  autoSendDay?: number;
  autoSendTime?: string;
  notes?: string;
  coachUid: string;
  coachName: string;
  isPaid?: boolean;
  priceCents: number;
  paymentMode: EventPaymentMode;
  markPaid?: boolean;
  createdByUid: string;
}): Promise<string> {
  const cleanEmail = params.memberEmail
    .trim()
    .toLowerCase()
    .slice(0, VALIDATION_LIMITS.EMAIL_MAX);
  if (!VALIDATION_LIMITS.EMAIL_REGEX.test(cleanEmail)) {
    throw new Error('Adresse email adhérent invalide.');
  }

  const tpl = RUNNING_DISTANCE_TEMPLATES[params.distance];
  const level: ProgramRunnerLevel = params.level ?? 'regular';
  const durationWeeks = getProgramDurationWeeks(params.distance, level);
  const title = (
    params.title?.trim() || `${tpl.label} · ${durationWeeks} semaines`
  ).slice(0, VALIDATION_LIMITS.TITLE_MAX);
  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error('Titre du programme trop court.');
  }

  if (Number.isNaN(params.startDate.getTime())) {
    throw new Error('Date de démarrage souhaitée du programme invalide.');
  }

  const sessionsPerWeek = Math.min(
    VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN,
      Math.round(Number(params.sessionsPerWeek) || tpl.defaultSessionsPerWeek)
    )
  );
  const preferredDays = normalizePreferredDays(
    params.preferredDays ?? getDefaultPreferredDays(sessionsPerWeek),
    sessionsPerWeek
  );
  const targetTimeSeconds = Math.min(
    VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MAX_SEC,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MIN_SEC,
      Math.round(Number(params.targetTimeSeconds) || tpl.defaultTargetTimeSeconds)
    )
  );
  const isProgramPaid = params.isPaid ?? true;
  const priceCents = isProgramPaid
    ? Math.min(
        VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS,
        Math.max(
          VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS,
          Math.round(Number(params.priceCents) || tpl.defaultPriceCents)
        )
      )
    : 0;

  const memberEmailKey = await hashEmailKey(cleanEmail);
  const memberName = (
    params.memberName.trim() ||
    cleanEmail.split('@')[0] ||
    'Adhérent'
  ).slice(0, 125);
  const coachName = (params.coachName.trim() || 'Coach').slice(
    0,
    VALIDATION_LIMITS.DISPLAY_NAME_MAX
  );
  const encodedNotes = encodeProgramNotesWithMeta(
    params.notes ?? '',
    durationWeeks,
    level,
    params.startDate,
    params.autoSendDay,
    params.autoSendTime
  );
  const firestoreStartAt = clampFirestoreProgramStartDate(params.startDate);

  const isPaidAlready = isProgramPaid && Boolean(params.markPaid);
  const paymentRef = !isProgramPaid
    ? ''
    : isPaidAlready
      ? generatePaymentReference('RUN')
      : '';
  const status: TrainingProgramStatus =
    !isProgramPaid || isPaidAlready ? 'awaiting_vma' : 'awaiting_payment';

  const programRef = doc(collection(db, 'trainingPrograms'));
  try {
    await setDoc(programRef, {
      memberEmail: cleanEmail,
      memberEmailKey,
      memberName,
      title,
      distance: params.distance,
      level,
      durationWeeks,
      sessionsPerWeek,
      preferredDays,
      targetTimeSeconds,
      startAt: Timestamp.fromDate(firestoreStartAt),
      vmaTestStatus: 'pending',
      vmaKmh: 0,
      vmaTestDistanceMeters: 0,
      vmaTestDurationSeconds: 0,
      vmaTestedAt: null,
      completedSessionKeys: [],
      notes: encodedNotes,
      coachUid: params.coachUid,
      coachName,
      isPaid: isProgramPaid,
      priceCents,
      currency: 'EUR',
      paymentMode: isProgramPaid ? params.paymentMode : 'both',
      paymentStatus: !isProgramPaid
        ? 'free'
        : isPaidAlready
          ? 'paid'
          : 'pending',
      paymentMethod: !isProgramPaid
        ? 'free'
        : isPaidAlready
          ? 'onsite'
          : '',
      paymentReference: paymentRef,
      cardBrand: '',
      cardLast4: '',
      paidAt: isPaidAlready ? serverTimestamp() : null,
      status,
      createdByUid: params.createdByUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return programRef.id;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `trainingPrograms/${programRef.id}`
    );
  }
}

export async function updateTrainingProgramConfig(
  programId: string,
  params: {
    title: string;
    distance?: RunningDistanceKey;
    level?: ProgramRunnerLevel;
    sessionsPerWeek: number;
    preferredDays: number[];
    targetTimeSeconds: number;
    startDate: Date;
    autoSendDay?: number;
    autoSendTime?: string;
    notes: string;
    coachUid: string;
    coachName: string;
    isPaid?: boolean;
    priceCents: number;
    paymentMode: EventPaymentMode;
    existingProgram?: TrainingProgram;
  }
): Promise<void> {
  const title = params.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  if (title.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error('Titre du programme invalide.');
  }
  if (Number.isNaN(params.startDate.getTime())) {
    throw new Error('Date de début invalide.');
  }
  const sessionsPerWeek = Math.min(
    VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN,
      Math.round(
        Number(params.sessionsPerWeek) ||
          VALIDATION_LIMITS.PROGRAM_DEFAULT_SESSIONS_PER_WEEK
      )
    )
  );
  const preferredDays = normalizePreferredDays(
    params.preferredDays,
    sessionsPerWeek
  );
  const targetTimeSeconds = Math.min(
    VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MAX_SEC,
    Math.max(
      VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MIN_SEC,
      Math.round(Number(params.targetTimeSeconds) || 3000)
    )
  );
  const isProgramPaid = params.isPaid ?? true;
  const priceCents = isProgramPaid
    ? Math.min(
        VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS,
        Math.max(
          VALIDATION_LIMITS.PROGRAM_PRICE_MIN_CENTS,
          Math.round(Number(params.priceCents) || 4900)
        )
      )
    : 0;
  const coachName = (params.coachName.trim() || 'Coach').slice(
    0,
    VALIDATION_LIMITS.DISPLAY_NAME_MAX
  );

  const effectiveDistance =
    params.distance ?? params.existingProgram?.distance ?? '10km';
  const effectiveLevel: ProgramRunnerLevel =
    params.level ?? params.existingProgram?.level ?? 'regular';
  const effectiveDurationWeeks = getProgramDurationWeeks(
    effectiveDistance,
    effectiveLevel
  );
  const encodedNotes = encodeProgramNotesWithMeta(
    params.notes,
    effectiveDurationWeeks,
    effectiveLevel,
    params.startDate,
    params.autoSendDay ?? params.existingProgram?.autoSendDay,
    params.autoSendTime ?? params.existingProgram?.autoSendTime
  );
  const firestoreStartAt = clampFirestoreProgramStartDate(params.startDate);

  let paymentPatch: Record<string, unknown> = {};
  if (!isProgramPaid) {
    const nextStatus: TrainingProgramStatus =
      params.existingProgram?.vmaTestStatus === 'completed'
        ? params.existingProgram.status === 'completed'
          ? 'completed'
          : 'active'
        : 'awaiting_vma';
    paymentPatch = {
      isPaid: false,
      priceCents: 0,
      paymentMode: 'both',
      paymentStatus: 'free',
      paymentMethod: 'free',
      paymentReference: '',
      cardBrand: '',
      cardLast4: '',
      paidAt: null,
      status: nextStatus,
    };
  } else if (
    params.existingProgram &&
    (!params.existingProgram.isPaid ||
      params.existingProgram.paymentStatus === 'free')
  ) {
    paymentPatch = {
      isPaid: true,
      priceCents,
      paymentMode: params.paymentMode,
      paymentStatus: 'pending',
      paymentMethod: '',
      paymentReference: '',
      cardBrand: '',
      cardLast4: '',
      paidAt: null,
      status: 'awaiting_payment' as TrainingProgramStatus,
    };
  } else {
    paymentPatch = {
      isPaid: true,
      priceCents,
      paymentMode: params.paymentMode,
    };
  }

  try {
    await updateDoc(doc(db, 'trainingPrograms', programId), {
      title,
      level: effectiveLevel,
      durationWeeks: effectiveDurationWeeks,
      sessionsPerWeek,
      preferredDays,
      targetTimeSeconds,
      startAt: Timestamp.fromDate(firestoreStartAt),
      notes: encodedNotes,
      coachUid: params.coachUid,
      coachName,
      ...paymentPatch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `trainingPrograms/${programId}`
    );
  }
}

export async function payTrainingProgram(params: {
  program: TrainingProgram;
  method: 'card' | 'onsite';
  cardBrand?: string;
  cardLast4?: string;
  isCoach?: boolean;
}): Promise<string> {
  const rawRef = params.program.paymentReference?.trim() ?? '';
  const reference =
    rawRef.length >= 6 ? rawRef.slice(0, 64) : generatePaymentReference('RUN');
  const nextStatusAfterPaid: TrainingProgramStatus =
    params.program.vmaTestStatus === 'completed' ? 'active' : 'awaiting_vma';

  try {
    if (params.isCoach) {
      await updateDoc(doc(db, 'trainingPrograms', params.program.id), {
        paymentStatus: 'paid',
        paymentMethod:
          params.program.paymentMethod === 'card' ? 'card' : 'onsite',
        paymentReference: reference,
        paidAt: serverTimestamp(),
        status: nextStatusAfterPaid,
        updatedAt: serverTimestamp(),
      });
      return reference;
    }

    if (params.method === 'card') {
      const cleanLast4 = (params.cardLast4 ?? '').replace(/\D/g, '').slice(-4);
      if (cleanLast4.length !== 4) {
        throw new Error('Numéro de carte bancaire invalide.');
      }
      await updateDoc(doc(db, 'trainingPrograms', params.program.id), {
        paymentStatus: 'paid',
        paymentMethod: 'card',
        paymentReference: reference,
        cardBrand: (params.cardBrand ?? 'CB').slice(0, 24),
        cardLast4: cleanLast4,
        paidAt: serverTimestamp(),
        status: nextStatusAfterPaid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'trainingPrograms', params.program.id), {
        paymentStatus: 'pending',
        paymentMethod: 'onsite',
        paymentReference: reference,
        cardBrand: '',
        cardLast4: '',
        paidAt: null,
        status: 'awaiting_payment',
        updatedAt: serverTimestamp(),
      });
    }
    return reference;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `trainingPrograms/${params.program.id}`
    );
  }
}

export async function submitTrainingProgramVmaTest(params: {
  program: TrainingProgram;
  distanceMeters?: number;
  durationSeconds?: number;
  directVmaKmh?: number;
}): Promise<number> {
  let vmaKmh = 0;
  let distanceMeters = Math.max(
    0,
    Math.min(10000, Math.round(Number(params.distanceMeters) || 0))
  );
  let durationSeconds = Math.max(
    0,
    Math.min(3600, Math.round(Number(params.durationSeconds) || 0))
  );

  if (
    params.directVmaKmh !== undefined &&
    Number.isFinite(params.directVmaKmh) &&
    params.directVmaKmh > 0
  ) {
    vmaKmh = Math.round(params.directVmaKmh * 10) / 10;
    if (distanceMeters === 0 && durationSeconds === 0) {
      durationSeconds = 360;
      distanceMeters = Math.round(vmaKmh * 100);
    }
  } else {
    vmaKmh = computeVmaFromTest(distanceMeters, durationSeconds);
  }

  if (
    vmaKmh < VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH ||
    vmaKmh > VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH
  ) {
    throw new Error(
      `La VMA évaluée doit être comprise entre ${VALIDATION_LIMITS.PROGRAM_VMA_MIN_KMH} et ${VALIDATION_LIMITS.PROGRAM_VMA_MAX_KMH} km/h.`
    );
  }

  try {
    await updateDoc(doc(db, 'trainingPrograms', params.program.id), {
      vmaTestStatus: 'completed' as VmaTestStatus,
      vmaKmh,
      vmaTestDistanceMeters: distanceMeters,
      vmaTestDurationSeconds: durationSeconds,
      vmaTestedAt: serverTimestamp(),
      status: 'active' as TrainingProgramStatus,
      updatedAt: serverTimestamp(),
    });
    return vmaKmh;
  } catch (error) {
    const errCode = (error as { code?: string })?.code ?? '';
    const errMsg = error instanceof Error ? error.message.toLowerCase() : '';
    const isPermissionDenied =
      errCode === 'permission-denied' ||
      errMsg.includes('missing or insufficient permissions');
    const currentEmail = auth.currentUser?.email?.trim().toLowerCase() ?? '';
    const currentUid = auth.currentUser?.uid ?? '';
    const isProgramMember =
      Boolean(currentUid) &&
      Boolean(currentEmail) &&
      currentEmail === params.program.memberEmail.trim().toLowerCase();
    const hasAccess =
      !params.program.isPaid ||
      params.program.paymentStatus === 'paid' ||
      params.program.paymentStatus === 'free';

    if (isPermissionDenied && isProgramMember && hasAccess) {
      const docId = buildProgramVmaResultDocId(params.program.id);
      const overrideRef = doc(db, 'memberSchedules', docId);
      const testedAtMs = Date.now();
      const testedTimestamp = Timestamp.fromMillis(testedAtMs);
      const payloadNotes = `${vmaKmh}|${distanceMeters}|${durationSeconds}|${testedAtMs}`;
      const objective = `${PROG_VMA_RESULT_PREFIX}${params.program.id}`.slice(
        0,
        VALIDATION_LIMITS.SESSION_OBJECTIVE_MAX
      );
      try {
        let alreadyExists = false;
        try {
          const existingSnap = await getDoc(overrideRef);
          alreadyExists = existingSnap.exists();
        } catch {
          alreadyExists = false;
        }
        if (alreadyExists) {
          await updateDoc(overrideRef, {
            notes: payloadNotes,
            startAt: testedTimestamp,
            completed: true,
            updatedAt: serverTimestamp(),
          });
          return vmaKmh;
        }
        const memberEmailKey = await hashEmailKey(currentEmail);
        const memberName = (
          params.program.memberName.trim() ||
          currentEmail.split('@')[0] ||
          'Adhérent'
        ).slice(0, 125);
        const rawCoachUid = (params.program.coachUid || '').trim().slice(0, 128);
        const coachUid = /^[a-zA-Z0-9_\-]+$/.test(rawCoachUid) ? rawCoachUid : '';
        const coachName = (params.program.coachName || 'Coach')
          .trim()
          .slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
        await setDoc(overrideRef, {
          memberEmail: currentEmail,
          memberEmailKey,
          memberName,
          title: 'Test VMA validé',
          discipline: 'Course à pied',
          notes: payloadNotes,
          location: '',
          startAt: testedTimestamp,
          durationMinutes: 30,
          coachUid,
          coachName,
          objective,
          isPaid: false,
          priceCents: 0,
          createdByUid: currentUid,
          createdByRole: 'member',
          completed: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return vmaKmh;
      } catch (fallbackError) {
        handleFirestoreError(
          fallbackError,
          OperationType.WRITE,
          `memberSchedules/${docId}`
        );
      }
    }

    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `trainingPrograms/${params.program.id}`
    );
  }
}

export async function toggleTrainingProgramSessionCompleted(
  program: TrainingProgram,
  sessionKey: string,
  completed: boolean
): Promise<void> {
  const cleanKey = sessionKey.trim().slice(0, 32);
  if (cleanKey.length < 3 || cleanKey === 'vma-test') return;
  if (program.vmaTestStatus === 'pending' && completed) {
    throw new Error(
      'Effectuez d’abord votre Test VMA : seule la séance Test VMA peut être validée avant le démarrage du programme.'
    );
  }
  const set = new Set(
    (program.completedSessionKeys ?? []).filter((k) => k !== 'vma-test')
  );
  if (completed) {
    set.add(cleanKey);
  } else {
    set.delete(cleanKey);
  }
  const nextKeys = Array.from(set).slice(
    0,
    VALIDATION_LIMITS.PROGRAM_COMPLETED_KEYS_MAX
  );
  const effectiveWeeks =
    program.durationWeeks ||
    getProgramDurationWeeks(program.distance, program.level ?? 'regular');
  const totalSessions =
    effectiveWeeks *
    (program.sessionsPerWeek || VALIDATION_LIMITS.PROGRAM_DEFAULT_SESSIONS_PER_WEEK);
  const nextStatus: TrainingProgramStatus =
    program.vmaTestStatus === 'pending'
      ? 'awaiting_vma'
      : nextKeys.length >= totalSessions
        ? 'completed'
        : 'active';

  try {
    await updateDoc(doc(db, 'trainingPrograms', program.id), {
      completedSessionKeys: nextKeys,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `trainingPrograms/${programIdFallback(program)}`
    );
  }
}

function programIdFallback(program: TrainingProgram): string {
  return program.id;
}

export async function saveProgramSessionExercisesOverride(params: {
  program: TrainingProgram;
  sessionKey: string;
  title: string;
  durationMinutes: number;
  coachNotes: string;
  exercises: ScheduledExerciseItem[];
}): Promise<void> {
  const cleanKey = params.sessionKey.trim().slice(0, 32);
  if (!/^w\d{1,2}-s[1-6]$/.test(cleanKey)) {
    throw new Error('Identifiant de séance invalide.');
  }

  const cleanTitle = params.title.trim().slice(0, VALIDATION_LIMITS.TITLE_MAX);
  if (cleanTitle.length < VALIDATION_LIMITS.TITLE_MIN) {
    throw new Error(
      `Le titre de la séance doit contenir au moins ${VALIDATION_LIMITS.TITLE_MIN} caractères.`
    );
  }

  const durationMinutes = Math.min(
    VALIDATION_LIMITS.DURATION_MAX,
    Math.max(
      VALIDATION_LIMITS.DURATION_MIN,
      Math.round(Number(params.durationMinutes) || 45)
    )
  );
  const coachNotes = (params.coachNotes ?? '')
    .trim()
    .slice(0, VALIDATION_LIMITS.SCHEDULE_NOTES_MAX);
  const exercises = sanitizeScheduledExercises(params.exercises);

  const nextOverride: ProgramSessionOverride = {
    sessionKey: cleanKey,
    title: cleanTitle,
    durationMinutes,
    coachNotes,
    exercises,
    updatedAtMs: Date.now(),
  };

  const existingList = Array.isArray(params.program.sessionOverrides)
    ? params.program.sessionOverrides.filter(
        (ov) => ov && ov.sessionKey !== cleanKey
      )
    : [];
  const nextOverrides = [...existingList, nextOverride].slice(
    -VALIDATION_LIMITS.PROGRAM_OVERRIDES_MAX
  );

  try {
    await updateDoc(doc(db, 'trainingPrograms', params.program.id), {
      sessionOverrides: nextOverrides,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `trainingPrograms/${params.program.id}`
    );
  }
}

export async function clearTrainingProgramSessionOverride(params: {
  program: TrainingProgram;
  sessionKey: string;
}): Promise<void> {
  const cleanKey = params.sessionKey.trim().slice(0, 32);
  if (!cleanKey) return;

  const existingList = Array.isArray(params.program.sessionOverrides)
    ? params.program.sessionOverrides
    : [];
  const nextOverrides = existingList.filter(
    (ov) => ov && ov.sessionKey !== cleanKey
  );

  try {
    await updateDoc(doc(db, 'trainingPrograms', params.program.id), {
      sessionOverrides: nextOverrides,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `trainingPrograms/${params.program.id}`
    );
  }
}

export async function deleteTrainingProgram(programId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'trainingPrograms', programId));
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `trainingPrograms/${programId}`
    );
  }
  try {
    const prefixes = [
      `${MOVE_OVERRIDE_PROG_PREFIX}${programId}:`,
      `${PROG_EDIT_OVERRIDE_PREFIX}${programId}:`,
      `${PROG_NOTIF_ACK_PREFIX}prog__${programId}`,
      `${PROG_NOTIF_ACK_PREFIX}week__${programId}__`,
      `${PROG_VMA_RESULT_PREFIX}${programId}`,
    ];
    const currentEmail = auth.currentUser?.email?.trim().toLowerCase() ?? '';
    const currentUid = auth.currentUser?.uid ?? '';
    const isPrimary =
      Boolean(auth.currentUser?.emailVerified) &&
      currentEmail === BOOTSTRAPPED_COACH_EMAIL.toLowerCase();
    if (isPrimary) {
      for (const prefix of prefixes) {
        const snap = await getDocs(
          query(
            collection(db, 'memberSchedules'),
            where('objective', '>=', prefix),
            where('objective', '<=', `${prefix}\uf8ff`)
          )
        );
        if (!snap.empty) {
          await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
        }
      }
    } else if (currentUid) {
      const coachSchedSnap = await getDocs(
        query(
          collection(db, 'memberSchedules'),
          where('coachUid', '==', currentUid)
        )
      );
      const matchingDocs = coachSchedSnap.docs.filter((d) => {
        const obj = String(
          (d.data() as Partial<MemberScheduleSession>).objective ?? ''
        );
        return prefixes.some((p) => obj.startsWith(p));
      });
      if (matchingDocs.length > 0) {
        await Promise.all(matchingDocs.map((d) => deleteDoc(d.ref)));
      }
    }
  } catch {
    // Non-blocking cleanup if no overrides exist
  }
}

