import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { User } from 'firebase/auth';
import {
  ArrowLeft,
  CalendarDays,
  CheckCheck,
  Heart,
  MessageSquare,
  Plus,
  Search,
  Send,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { BOOTSTRAPPED_COACH_EMAIL } from '../firebase';
import {
  CoachAdminUser,
  CoachDirectoryEntry,
  CoachPricing,
  Conversation,
  DirectMessage,
  FollowUpStatus,
  MemberProfile,
  PendingMessageTarget,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  deleteConversationThread,
  markConversationAsRead,
  sendDirectMessage,
  subscribeConversationMessages,
  toggleDirectMessageLike,
} from '../services/firestoreService';
import {
  formatFrenchDateShort,
  formatFrenchTime,
  hashEmailKey,
} from '../utils/dateAndValidation';
import { getCoachPricingItems } from '../utils/coachPricingHelpers';
import { ProfileAvatar } from './ProfileAvatar';

interface MessagesViewProps {
  user: User;
  isCoach: boolean;
  isPrimaryBootstrapped?: boolean;
  currentUserDisplayName: string;
  currentUserPhotoUrl?: string;
  conversations: Conversation[];
  coachDirectory: CoachDirectoryEntry[];
  memberProfiles: MemberProfile[];
  allMemberProfiles?: MemberProfile[];
  registrations: Registration[];
  coachAdmins: CoachAdminUser[];
  events: SportEvent[];
  initialTarget?: PendingMessageTarget | null;
  onConsumeInitialTarget?: () => void;
  onOpenMemberProfile?: (memberEmailKey: string) => void;
  onSelectEvent?: (event: SportEvent) => void;
}

interface ActiveThreadTarget {
  conversationId: string | null;
  coachUid: string;
  coachName: string;
  coachPhotoUrl?: string;
  memberEmail: string;
  memberEmailKey: string;
  memberName: string;
  memberPhotoUrl?: string;
  subtitle?: string;
  followUpStatus?: FollowUpStatus;
}

interface MemberContactItem {
  email: string;
  emailKey: string;
  name: string;
  photoUrl?: string;
  goal?: string;
  followUpStatus: FollowUpStatus;
}

interface CoachContactItem {
  uid: string;
  name: string;
  photoUrl?: string;
  specialty?: string;
  city?: string;
  pricing?: CoachPricing;
}

const FOLLOW_UP_LABELS: Record<FollowUpStatus, string> = {
  active: 'Actif',
  to_follow_up: 'À relancer',
  paused: 'En pause',
};

function formatConversationListTime(date: Date | null): string {
  if (!date) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return formatFrenchTime(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return 'Hier';
  }
  return formatFrenchDateShort(date);
}

function formatMessageDayHeader(date: Date): string {
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return 'Aujourd’hui';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return 'Hier';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function MessagesView({
  user,
  isCoach,
  isPrimaryBootstrapped = false,
  currentUserDisplayName,
  currentUserPhotoUrl,
  conversations,
  coachDirectory,
  memberProfiles,
  allMemberProfiles,
  registrations,
  coachAdmins,
  events,
  initialTarget,
  onConsumeInitialTarget,
  onOpenMemberProfile,
  onSelectEvent,
}: MessagesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewConversationPicker, setShowNewConversationPicker] =
    useState(false);
  const [selectedThread, setSelectedThread] =
    useState<ActiveThreadTarget | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [contextEventId, setContextEventId] = useState('');
  const [contextEventTitle, setContextEventTitle] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<string | null>(null);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [optimisticallyDeletedIds, setOptimisticallyDeletedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [likingMessageId, setLikingMessageId] = useState<string | null>(null);
  const [likeError, setLikeError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);

  const currentUserEmail = (user.email ?? '').trim().toLowerCase();

  // Coaches' emails & keys so coaches never appear in the coach's member contact picker
  const coachIdentitySets = useMemo(() => {
    const emails = new Set<string>([
      BOOTSTRAPPED_COACH_EMAIL.trim().toLowerCase(),
    ]);
    const emailKeys = new Set<string>();
    if (currentUserEmail) {
      emails.add(currentUserEmail);
    }
    coachAdmins.forEach((a) => {
      if (a.email?.trim()) emails.add(a.email.trim().toLowerCase());
      if (a.emailKey?.trim()) emailKeys.add(a.emailKey.trim());
    });
    return { emails, emailKeys };
  }, [coachAdmins, currentUserEmail]);

  // Member contacts list (for Coach) — strictly scoped to the coach's own attached members
  const memberContacts = useMemo<MemberContactItem[]>(() => {
    if (!isCoach) return [];
    const map = new Map<string, MemberContactItem>();

    const sourceAllProfiles = allMemberProfiles ?? memberProfiles;
    const reassignedKeys = new Set<string>();
    const reassignedEmails = new Set<string>();
    sourceAllProfiles.forEach((p) => {
      if (p.referentCoachUid && p.referentCoachUid !== user.uid) {
        if (p.emailKey) reassignedKeys.add(p.emailKey);
        if (p.email?.trim()) reassignedEmails.add(p.email.trim().toLowerCase());
      }
    });

    memberProfiles.forEach((p) => {
      const cleanEmail = (p.email ?? '').trim().toLowerCase();
      if (
        !cleanEmail ||
        coachIdentitySets.emailKeys.has(p.emailKey) ||
        coachIdentitySets.emails.has(cleanEmail)
      ) {
        return;
      }
      const isAttachedToMe = isPrimaryBootstrapped
        ? !p.referentCoachUid || p.referentCoachUid === user.uid
        : p.referentCoachUid === user.uid;
      if (!isAttachedToMe) return;

      const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || cleanEmail;
      map.set(p.emailKey, {
        email: cleanEmail,
        emailKey: p.emailKey,
        name,
        photoUrl: p.photoUrl,
        goal: p.goal,
        followUpStatus: p.followUpStatus ?? 'active',
      });
    });

    if (isPrimaryBootstrapped) {
      registrations.forEach((reg) => {
        if (reg.status !== 'confirmed') return;
        const cleanEmail = (reg.email ?? '').trim().toLowerCase();
        if (
          !cleanEmail ||
          coachIdentitySets.emailKeys.has(reg.emailKey) ||
          coachIdentitySets.emails.has(cleanEmail) ||
          reassignedKeys.has(reg.emailKey) ||
          reassignedEmails.has(cleanEmail)
        ) {
          return;
        }
        if (!map.has(reg.emailKey)) {
          const name =
            `${reg.firstName || ''} ${reg.lastName || ''}`.trim() || cleanEmail;
          map.set(reg.emailKey, {
            email: cleanEmail,
            emailKey: reg.emailKey,
            name,
            followUpStatus: 'active',
          });
        }
      });
    }

    conversations.forEach((conv) => {
      if (
        !conv.memberEmail ||
        coachIdentitySets.emails.has(conv.memberEmail.trim().toLowerCase())
      ) {
        return;
      }
      if (!map.has(conv.memberEmailKey)) {
        map.set(conv.memberEmailKey, {
          email: conv.memberEmail.trim().toLowerCase(),
          emailKey: conv.memberEmailKey,
          name: conv.memberName,
          photoUrl: conv.memberPhotoUrl,
          followUpStatus: 'active',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
    );
  }, [
    isCoach,
    isPrimaryBootstrapped,
    user.uid,
    memberProfiles,
    allMemberProfiles,
    registrations,
    conversations,
    coachIdentitySets,
  ]);

  // Coach contacts list (for Member)
  const coachContacts = useMemo<CoachContactItem[]>(() => {
    if (isCoach) return [];
    const map = new Map<string, CoachContactItem>();

    coachDirectory.forEach((entry) => {
      if (!entry.active || !entry.uid || entry.uid === user.uid) return;
      map.set(entry.uid, {
        uid: entry.uid,
        name: entry.displayName || 'Coach GetFitNow',
        photoUrl: entry.photoUrl,
        specialty: entry.specialty,
        city: entry.city,
        pricing: entry.pricing,
      });
    });

    events.forEach((ev) => {
      const candidateUid = ev.coachUids?.[0] || ev.createdBy;
      if (!candidateUid || candidateUid === user.uid || map.has(candidateUid)) {
        return;
      }
      const candidateName =
        ev.coachNames?.[0] || ev.coachName?.split(',')[0]?.trim() || 'Coach GetFitNow';
      map.set(candidateUid, {
        uid: candidateUid,
        name: candidateName,
        city: ev.city,
      });
    });

    conversations.forEach((conv) => {
      if (!conv.coachUid || conv.coachUid === user.uid || map.has(conv.coachUid)) {
        return;
      }
      map.set(conv.coachUid, {
        uid: conv.coachUid,
        name: conv.coachName || 'Coach GetFitNow',
        photoUrl: conv.coachPhotoUrl,
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
    );
  }, [isCoach, coachDirectory, events, conversations, user.uid]);

  const memberContactByEmailKey = useMemo(
    () => new Map(memberContacts.map((m) => [m.emailKey, m])),
    [memberContacts]
  );
  const coachContactByUid = useMemo(
    () => new Map(coachContacts.map((c) => [c.uid, c])),
    [coachContacts]
  );

  const visibleConversations = useMemo(
    () => conversations.filter((c) => !optimisticallyDeletedIds.has(c.id)),
    [conversations, optimisticallyDeletedIds]
  );

  // Match selected thread against live conversations list
  const activeConversation = useMemo(() => {
    if (!selectedThread) return null;
    if (selectedThread.conversationId) {
      const byId = visibleConversations.find(
        (c) => c.id === selectedThread.conversationId
      );
      if (byId) return byId;
    }
    return (
      visibleConversations.find(
        (c) =>
          c.coachUid === selectedThread.coachUid &&
          c.memberEmail.trim().toLowerCase() ===
            selectedThread.memberEmail.trim().toLowerCase()
      ) ?? null
    );
  }, [selectedThread, visibleConversations]);

  // Apply initialTarget from BookingModal, EventRosterDrawer, MembersTrackingView, or MemberPortalView
  useEffect(() => {
    if (!initialTarget) return;
    let cancelled = false;

    const applyTarget = async () => {
      const cleanMemberEmail = initialTarget.memberEmail.trim().toLowerCase();
      const computedEmailKey =
        initialTarget.memberEmailKey ||
        (cleanMemberEmail ? await hashEmailKey(cleanMemberEmail) : '');
      if (cancelled) return;

      const expectedConvId =
        initialTarget.coachUid && computedEmailKey
          ? `${initialTarget.coachUid}__${computedEmailKey}`
          : null;
      const matchedConv = conversations.find(
        (c) =>
          (expectedConvId && c.id === expectedConvId) ||
          (c.coachUid === initialTarget.coachUid &&
            c.memberEmail.trim().toLowerCase() === cleanMemberEmail)
      );

      const coachInfo = coachContactByUid.get(initialTarget.coachUid);
      const memberInfo = memberContactByEmailKey.get(computedEmailKey);

      setSelectedThread({
        conversationId: matchedConv?.id ?? expectedConvId,
        coachUid: initialTarget.coachUid,
        coachName:
          matchedConv?.coachName ||
          initialTarget.coachName ||
          coachInfo?.name ||
          'Coach GetFitNow',
        coachPhotoUrl:
          matchedConv?.coachPhotoUrl ||
          initialTarget.coachPhotoUrl ||
          coachInfo?.photoUrl,
        memberEmail: cleanMemberEmail,
        memberEmailKey: computedEmailKey,
        memberName:
          matchedConv?.memberName ||
          initialTarget.memberName ||
          memberInfo?.name ||
          cleanMemberEmail.split('@')[0] ||
          'Adhérent',
        memberPhotoUrl:
          matchedConv?.memberPhotoUrl ||
          initialTarget.memberPhotoUrl ||
          memberInfo?.photoUrl,
        subtitle: isCoach
          ? [cleanMemberEmail, memberInfo?.goal].filter(Boolean).join(' · ')
          : [coachInfo?.specialty, coachInfo?.city].filter(Boolean).join(' · ') ||
            'Coach sportif',
        followUpStatus: memberInfo?.followUpStatus,
      });

      if (initialTarget.contextEventId && initialTarget.contextEventTitle) {
        setContextEventId(initialTarget.contextEventId);
        setContextEventTitle(initialTarget.contextEventTitle);
      }
      setShowNewConversationPicker(false);
      setMobileShowThread(true);
      setSendError(null);
      onConsumeInitialTarget?.();
      window.setTimeout(() => {
        composerInputRef.current?.focus();
      }, 60);
    };

    void applyTarget();
    return () => {
      cancelled = true;
    };
  }, [
    initialTarget,
    conversations,
    coachContactByUid,
    memberContactByEmailKey,
    isCoach,
    onConsumeInitialTarget,
  ]);

  // Select first conversation automatically on desktop if none is selected
  useEffect(() => {
    if (selectedThread || initialTarget || visibleConversations.length === 0) return;
    const first = visibleConversations[0];
    const memberInfo = memberContactByEmailKey.get(first.memberEmailKey);
    const coachInfo = coachContactByUid.get(first.coachUid);
    setSelectedThread({
      conversationId: first.id,
      coachUid: first.coachUid,
      coachName: first.coachName,
      coachPhotoUrl: first.coachPhotoUrl || coachInfo?.photoUrl,
      memberEmail: first.memberEmail,
      memberEmailKey: first.memberEmailKey,
      memberName: first.memberName,
      memberPhotoUrl: first.memberPhotoUrl || memberInfo?.photoUrl,
      subtitle: isCoach
        ? [first.memberEmail, memberInfo?.goal].filter(Boolean).join(' · ')
        : [coachInfo?.specialty, coachInfo?.city].filter(Boolean).join(' · ') ||
          'Coach sportif',
      followUpStatus: memberInfo?.followUpStatus,
    });
  }, [
    visibleConversations,
    selectedThread,
    initialTarget,
    memberContactByEmailKey,
    coachContactByUid,
    isCoach,
  ]);

  // Subscribe to messages for the active existing conversation
  const activeConversationId = activeConversation?.id ?? null;
  const activeConvCoachUid =
    activeConversation?.coachUid ?? selectedThread?.coachUid ?? '';
  const activeConvMemberEmail =
    activeConversation?.memberEmail ?? selectedThread?.memberEmail ?? '';

  useEffect(() => {
    if (!activeConversationId || !activeConvCoachUid || !activeConvMemberEmail) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    const unsub = subscribeConversationMessages({
      conversationId: activeConversationId,
      isCoach,
      coachUid: activeConvCoachUid,
      memberEmail: activeConvMemberEmail,
      onData: (list) => {
        setMessages(list);
        setMessagesLoading(false);
      },
      onError: () => {
        setMessages([]);
        setMessagesLoading(false);
      },
    });
    return () => unsub();
  }, [activeConversationId, activeConvCoachUid, activeConvMemberEmail, isCoach]);

  // Mark conversation as read automatically when viewed and unread > 0
  useEffect(() => {
    if (!activeConversation || !user.uid) return;
    const unreadForMe = isCoach
      ? activeConversation.coachUnreadCount
      : activeConversation.memberUnreadCount;
    if (unreadForMe > 0) {
      void markConversationAsRead({
        conversationId: activeConversation.id,
        isCoach,
        currentUid: user.uid,
      });
    }
  }, [
    activeConversation?.id,
    activeConversation?.coachUnreadCount,
    activeConversation?.memberUnreadCount,
    isCoach,
    user.uid,
  ]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeConversationId]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleConversations;
    return visibleConversations.filter((conv) => {
      const targetName = isCoach ? conv.memberName : conv.coachName;
      const hay = `${targetName} ${conv.memberEmail} ${conv.lastMessageText}`.toLowerCase();
      return hay.includes(q);
    });
  }, [visibleConversations, searchQuery, isCoach]);

  const filteredMemberContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return memberContacts;
    return memberContacts.filter((m) =>
      `${m.name} ${m.email} ${m.goal ?? ''}`.toLowerCase().includes(q)
    );
  }, [memberContacts, searchQuery]);

  const filteredCoachContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return coachContacts;
    return coachContacts.filter((c) =>
      `${c.name} ${c.specialty ?? ''} ${c.city ?? ''}`.toLowerCase().includes(q)
    );
  }, [coachContacts, searchQuery]);

  const totalUnreadCount = useMemo(
    () =>
      visibleConversations.reduce(
        (sum, c) => sum + (isCoach ? c.coachUnreadCount : c.memberUnreadCount),
        0
      ),
    [visibleConversations, isCoach]
  );

  const selectableContextEvents = useMemo(
    () =>
      events
        .filter(
          (ev) =>
            ev.status === 'published' ||
            (ev.status === 'cancelled' &&
              ev.cancelReason === 'no_registrants' &&
              ev.startAt.toMillis() > Date.now())
        )
        .slice()
        .sort((a, b) => b.startAt.toMillis() - a.startAt.toMillis())
        .slice(0, 25),
    [events]
  );

  const eventsById = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events]
  );

  const openConversation = (conv: Conversation) => {
    const memberInfo = memberContactByEmailKey.get(conv.memberEmailKey);
    const coachInfo = coachContactByUid.get(conv.coachUid);
    setSelectedThread({
      conversationId: conv.id,
      coachUid: conv.coachUid,
      coachName: conv.coachName,
      coachPhotoUrl: conv.coachPhotoUrl || coachInfo?.photoUrl,
      memberEmail: conv.memberEmail,
      memberEmailKey: conv.memberEmailKey,
      memberName: conv.memberName,
      memberPhotoUrl: conv.memberPhotoUrl || memberInfo?.photoUrl,
      subtitle: isCoach
        ? [conv.memberEmail, memberInfo?.goal].filter(Boolean).join(' · ')
        : [coachInfo?.specialty, coachInfo?.city].filter(Boolean).join(' · ') ||
          'Coach sportif',
      followUpStatus: memberInfo?.followUpStatus,
    });
    setShowNewConversationPicker(false);
    setMobileShowThread(true);
    setSendError(null);
    setDeleteError(null);
    setLikeError(null);
    setConfirmDeleteConvId(null);
  };

  const openContactForCoach = (contact: MemberContactItem) => {
    const existing = conversations.find(
      (c) =>
        c.coachUid === user.uid &&
        (c.memberEmailKey === contact.emailKey ||
          c.memberEmail.trim().toLowerCase() === contact.email)
    );
    setSelectedThread({
      conversationId: existing?.id ?? `${user.uid}__${contact.emailKey}`,
      coachUid: user.uid,
      coachName: currentUserDisplayName || 'Coach GetFitNow',
      coachPhotoUrl: currentUserPhotoUrl,
      memberEmail: contact.email,
      memberEmailKey: contact.emailKey,
      memberName: contact.name,
      memberPhotoUrl: contact.photoUrl,
      subtitle: [contact.email, contact.goal].filter(Boolean).join(' · '),
      followUpStatus: contact.followUpStatus,
    });
    setShowNewConversationPicker(false);
    setMobileShowThread(true);
    setSendError(null);
    window.setTimeout(() => composerInputRef.current?.focus(), 60);
  };

  const openContactForMember = async (coach: CoachContactItem) => {
    const myEmailKey = await hashEmailKey(currentUserEmail);
    const existing = conversations.find(
      (c) =>
        c.coachUid === coach.uid &&
        c.memberEmail.trim().toLowerCase() === currentUserEmail
    );
    setSelectedThread({
      conversationId: existing?.id ?? `${coach.uid}__${myEmailKey}`,
      coachUid: coach.uid,
      coachName: coach.name,
      coachPhotoUrl: coach.photoUrl,
      memberEmail: currentUserEmail,
      memberEmailKey: myEmailKey,
      memberName: currentUserDisplayName || currentUserEmail,
      memberPhotoUrl: currentUserPhotoUrl,
      subtitle:
        [coach.specialty, coach.city].filter(Boolean).join(' · ') ||
        'Coach sportif',
    });
    setShowNewConversationPicker(false);
    setMobileShowThread(true);
    setSendError(null);
    window.setTimeout(() => composerInputRef.current?.focus(), 60);
  };

  const submitMessage = async (textOverride?: string) => {
    if (!selectedThread) return;
    const textToSend = (textOverride ?? draftText).trim();
    if (!textToSend) return;

    setSendError(null);
    setSending(true);
    try {
      const convId = await sendDirectMessage({
        coachUid: selectedThread.coachUid,
        coachName: isCoach
          ? currentUserDisplayName || selectedThread.coachName
          : selectedThread.coachName,
        coachPhotoUrl: isCoach
          ? currentUserPhotoUrl ?? selectedThread.coachPhotoUrl
          : selectedThread.coachPhotoUrl,
        memberEmail: selectedThread.memberEmail,
        memberName: isCoach
          ? selectedThread.memberName
          : currentUserDisplayName || selectedThread.memberName,
        memberPhotoUrl: isCoach
          ? selectedThread.memberPhotoUrl
          : currentUserPhotoUrl ?? selectedThread.memberPhotoUrl,
        senderUid: user.uid,
        senderEmail: currentUserEmail,
        senderName: currentUserDisplayName || currentUserEmail,
        senderRole: isCoach ? 'coach' : 'member',
        text: textToSend,
        contextEventId: contextEventId || undefined,
        contextEventTitle: contextEventTitle || undefined,
      });

      setOptimisticallyDeletedIds((prev) => {
        if (!prev.has(convId)) return prev;
        const next = new Set(prev);
        next.delete(convId);
        return next;
      });
      setSelectedThread((prev) =>
        prev ? { ...prev, conversationId: convId } : prev
      );
      if (!textOverride) {
        setDraftText('');
      }
      setContextEventId('');
      setContextEventTitle('');
    } catch (err) {
      let msg = 'Impossible d’envoyer le message pour le moment.';
      if (err instanceof Error) {
        if (err.message.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(err.message) as { error?: string };
            if (parsed.error?.toLowerCase().includes('permission')) {
              msg =
                'Envoi refusé par les règles de sécurité. Vérifiez que votre compte et celui du destinataire sont bien actifs.';
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
      setSendError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitMessage();
  };

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && draftText.trim().length > 0) {
        void submitMessage();
      }
    }
  };

  const handleDeleteConversation = async (conv: Conversation) => {
    if (deletingConvId) return;
    setDeleteError(null);
    setDeletingConvId(conv.id);
    try {
      await deleteConversationThread({
        conversation: conv,
        currentUid: user.uid,
        currentEmail: currentUserEmail,
      });
      setOptimisticallyDeletedIds((prev) => {
        const next = new Set(prev);
        next.add(conv.id);
        return next;
      });
      setConfirmDeleteConvId(null);
      if (
        activeConversation?.id === conv.id ||
        selectedThread?.conversationId === conv.id
      ) {
        setSelectedThread(null);
        setMessages([]);
        setMobileShowThread(false);
      }
    } catch {
      setDeleteError('Impossible de supprimer cette discussion pour le moment.');
    } finally {
      setDeletingConvId(null);
    }
  };

  const handleToggleMessageLike = async (msg: DirectMessage) => {
    if (!activeConversationId || likingMessageId === msg.id) return;
    setLikeError(null);
    setLikingMessageId(msg.id);
    try {
      await toggleDirectMessageLike({
        conversationId: activeConversationId,
        message: msg,
        isCoach,
      });
    } catch {
      setLikeError('Impossible de modifier le J’aime sur ce message.');
    } finally {
      setLikingMessageId(null);
    }
  };

  const activeRecipientName = selectedThread
    ? isCoach
      ? selectedThread.memberName
      : selectedThread.coachName
    : '';
  const activeRecipientPhoto = selectedThread
    ? isCoach
      ? selectedThread.memberPhotoUrl
      : selectedThread.coachPhotoUrl
    : undefined;

  const starterSuggestions = isCoach
    ? [
        'Bonjour ! Comment vous sentez-vous après votre dernière séance ?',
        'N’hésitez pas à me partager vos disponibilités et objectifs de la semaine.',
      ]
    : [
        'Bonjour ! J’ai une question concernant une prochaine séance.',
        'Bonjour, j’aimerais faire un point sur mon programme et ma progression.',
      ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              Messagerie directe
            </h2>
            {totalUnreadCount > 0 && (
              <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-rose-600 px-2 font-mono text-xs font-bold text-white tabular-nums">
                {totalUnreadCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isCoach
              ? 'Échangez en direct avec vos adhérents pour assurer un suivi personnalisé.'
              : 'Discutez en direct avec vos coachs pour poser vos questions et suivre votre progression.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewConversationPicker((prev) => !prev)}
          className="inline-flex min-h-[42px] items-center gap-1.5 self-start rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 sm:self-auto cursor-pointer"
        >
          {showNewConversationPicker ? (
            <>
              <X className="h-4 w-4" aria-hidden="true" />
              Voir mes discussions
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvelle discussion
            </>
          )}
        </button>
      </div>

      {/* Master-Detail Messaging Workspace */}
      <div className="mt-6 grid h-[calc(100dvh-250px)] min-h-[520px] max-h-[760px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:grid-cols-12">
        {/* Left Sidebar: Conversations & Contacts */}
        <aside
          className={`flex flex-col border-slate-200 dark:border-slate-800 md:col-span-4 md:border-r lg:col-span-4 ${
            mobileShowThread ? 'hidden md:flex' : 'flex'
          } min-h-0`}
        >
          {/* Search + Tabs */}
          <div className="border-b border-slate-200 p-3.5 dark:border-slate-800 space-y-2.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  showNewConversationPicker
                    ? isCoach
                      ? 'Chercher un adhérent...'
                      : 'Chercher un coach...'
                    : 'Rechercher une discussion...'
                }
                aria-label="Rechercher dans la messagerie"
                className="min-h-[40px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setShowNewConversationPicker(false)}
                className={`min-h-[32px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  !showNewConversationPicker
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Discussions ({visibleConversations.length})
              </button>
              <button
                type="button"
                onClick={() => setShowNewConversationPicker(true)}
                className={`min-h-[32px] rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  showNewConversationPicker
                    ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {isCoach
                  ? `Adhérents (${memberContacts.length})`
                  : `Coachs (${coachContacts.length})`}
              </button>
            </div>
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            {showNewConversationPicker ? (
              isCoach ? (
                filteredMemberContacts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    Aucun adhérent disponible pour démarrer une discussion.
                  </div>
                ) : (
                  filteredMemberContacts.map((member) => {
                    const existingConv = conversations.find(
                      (c) =>
                        c.coachUid === user.uid &&
                        c.memberEmailKey === member.emailKey
                    );
                    const unread = existingConv?.coachUnreadCount ?? 0;
                    return (
                      <button
                        key={member.emailKey}
                        type="button"
                        onClick={() => openContactForCoach(member)}
                        className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                      >
                        <ProfileAvatar
                          name={member.name}
                          photoUrl={member.photoUrl}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {member.name}
                            </p>
                            {unread > 0 ? (
                              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 font-mono text-[10px] font-bold text-white tabular-nums">
                                {unread}
                              </span>
                            ) : (
                              <span
                                className={`text-[11px] font-medium ${
                                  member.followUpStatus === 'to_follow_up'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {FOLLOW_UP_LABELS[member.followUpStatus]}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {member.email}
                          </p>
                          {member.goal && (
                            <p className="mt-0.5 truncate text-[11px] text-emerald-700 dark:text-emerald-400">
                              Objectif : {member.goal}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )
              ) : filteredCoachContacts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Aucun coach actif disponible pour le moment.
                </div>
              ) : (
                filteredCoachContacts.map((coach) => {
                  const existingConv = conversations.find(
                    (c) => c.coachUid === coach.uid
                  );
                  const unread = existingConv?.memberUnreadCount ?? 0;
                  return (
                    <button
                      key={coach.uid}
                      type="button"
                      onClick={() => void openContactForMember(coach)}
                      className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                    >
                      <ProfileAvatar
                        name={coach.name}
                        photoUrl={coach.photoUrl}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {coach.name}
                          </p>
                          {unread > 0 && (
                            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 font-mono text-[10px] font-bold text-white tabular-nums">
                              {unread}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {[coach.specialty, coach.city]
                            .filter(Boolean)
                            .join(' · ') || 'Coach sportif GetFitNow'}
                        </p>
                        {getCoachPricingItems(coach.pricing).length > 0 && (
                          <p className="mt-0.5 truncate font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            {getCoachPricingItems(coach.pricing)
                              .slice(0, 3)
                              .map((p) => `${p.shortLabel} ${p.formattedPrice}`)
                              .join(' · ')}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <MessageSquare
                  className="h-8 w-8 text-slate-300 dark:text-slate-600"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {visibleConversations.length === 0
                    ? 'Aucune discussion pour le moment'
                    : 'Aucun résultat'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {visibleConversations.length === 0
                    ? isCoach
                      ? 'Sélectionnez un adhérent pour démarrer un échange de suivi.'
                      : 'Choisissez un coach pour lui poser une question.'
                    : 'Essayez avec un autre nom ou mot-clé.'}
                </p>
                {visibleConversations.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setShowNewConversationPicker(true)}
                    className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {isCoach ? 'Écrire à un adhérent' : 'Écrire à un coach'}
                  </button>
                )}
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const contactName = isCoach ? conv.memberName : conv.coachName;
                const contactPhoto = isCoach
                  ? conv.memberPhotoUrl ||
                    memberContactByEmailKey.get(conv.memberEmailKey)?.photoUrl
                  : conv.coachPhotoUrl ||
                    coachContactByUid.get(conv.coachUid)?.photoUrl;
                const unread = isCoach
                  ? conv.coachUnreadCount
                  : conv.memberUnreadCount;
                const isSelected = activeConversation?.id === conv.id;
                const sentByMe =
                  conv.lastMessageSenderRole === (isCoach ? 'coach' : 'member');
                const lastDate = conv.lastMessageAt?.toDate?.() ?? null;
                const isConfirmingRowDelete = confirmDeleteConvId === conv.id;
                const isDeletingRow = deletingConvId === conv.id;

                return (
                  <div
                    key={conv.id}
                    className={`group relative transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/75 dark:bg-emerald-950/35'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-2 p-3.5">
                      <button
                        type="button"
                        onClick={() => openConversation(conv)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left cursor-pointer"
                      >
                        <ProfileAvatar
                          name={contactName}
                          photoUrl={contactPhoto}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={`truncate text-sm ${
                                unread > 0
                                  ? 'font-bold text-slate-900 dark:text-white'
                                  : 'font-semibold text-slate-900 dark:text-white'
                              }`}
                            >
                              {contactName}
                            </p>
                            <span className="shrink-0 font-mono text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                              {formatConversationListTime(lastDate)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p
                              className={`truncate text-xs ${
                                unread > 0
                                  ? 'font-semibold text-slate-800 dark:text-slate-200'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {sentByMe
                                ? `Vous : ${conv.lastMessageText}`
                                : conv.lastMessageText}
                            </p>
                            {unread > 0 && (
                              <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 font-mono text-[10px] font-bold text-white tabular-nums">
                                {unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {!isConfirmingRowDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteError(null);
                            setConfirmDeleteConvId(conv.id);
                          }}
                          aria-label={`Supprimer la discussion avec ${contactName}`}
                          title="Supprimer la discussion"
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-80 transition-opacity hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 dark:text-slate-500 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {isConfirmingRowDelete && (
                      <div className="flex items-center justify-between gap-2 border-t border-rose-200/80 bg-rose-50/90 px-3.5 py-2 dark:border-rose-900/60 dark:bg-rose-950/40">
                        <span className="text-[11px] font-medium text-rose-800 dark:text-rose-200">
                          Supprimer cette discussion ?
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isDeletingRow}
                            onClick={() => void handleDeleteConversation(conv)}
                            className="rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                          >
                            {isDeletingRow ? 'Suppression...' : 'Supprimer'}
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingRow}
                            onClick={() => setConfirmDeleteConvId(null)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Pane: Active Thread */}
        <div
          className={`flex min-h-0 flex-col bg-slate-50/50 dark:bg-slate-950/40 md:col-span-8 ${
            mobileShowThread ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!selectedThread ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <MessageSquare className="h-7 w-7" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-slate-900 dark:text-white">
                Sélectionnez ou démarrez une discussion
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                {isCoach
                  ? 'Retrouvez vos échanges avec les adhérents pour ajuster leurs objectifs, répondre à leurs questions ou préparer la prochaine séance.'
                  : 'Échangez directement avec votre coach pour poser vos questions sur une séance ou faire le point sur votre suivi.'}
              </p>
              <button
                type="button"
                onClick={() => setShowNewConversationPicker(true)}
                className="mt-5 inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nouvelle discussion
              </button>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileShowThread(false)}
                    aria-label="Retour à la liste des discussions"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <ProfileAvatar
                    name={activeRecipientName}
                    photoUrl={activeRecipientPhoto}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-display text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                        {activeRecipientName}
                      </h3>
                      {isCoach && selectedThread.followUpStatus && (
                        <span
                          className={`hidden sm:inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                            selectedThread.followUpStatus === 'to_follow_up'
                              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : selectedThread.followUpStatus === 'active'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {FOLLOW_UP_LABELS[selectedThread.followUpStatus]}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {selectedThread.subtitle ||
                        (isCoach ? selectedThread.memberEmail : 'Coach sportif')}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isCoach && onOpenMemberProfile && selectedThread.memberEmailKey && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenMemberProfile(selectedThread.memberEmailKey)
                      }
                      className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Voir fiche suivi</span>
                      <span className="sm:hidden">Fiche</span>
                    </button>
                  )}

                  {activeConversation && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmDeleteConvId((prev) =>
                          prev === activeConversation.id
                            ? null
                            : activeConversation.id
                        );
                      }}
                      aria-label="Supprimer cette discussion"
                      title="Supprimer cette discussion"
                      className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        confirmDeleteConvId === activeConversation.id
                          ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/40 dark:hover:text-rose-300'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Supprimer</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Delete Confirmation Banner */}
              {activeConversation && confirmDeleteConvId === activeConversation.id && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2.5 dark:border-rose-900/70 dark:bg-rose-950/50 sm:px-5">
                  <p className="text-xs font-medium text-rose-900 dark:text-rose-100">
                    Supprimer définitivement cette discussion et ses messages ?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deletingConvId === activeConversation.id}
                      onClick={() => void handleDeleteConversation(activeConversation)}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                    >
                      {deletingConvId === activeConversation.id
                        ? 'Suppression...'
                        : 'Confirmer'}
                    </button>
                    <button
                      type="button"
                      disabled={deletingConvId === activeConversation.id}
                      onClick={() => setConfirmDeleteConvId(null)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {(deleteError || likeError) && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200 sm:px-5"
                >
                  <span>{deleteError || likeError}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setLikeError(null);
                    }}
                    aria-label="Fermer le message d’erreur"
                    className="rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-5">
                {messagesLoading && messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                    Chargement de la conversation...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Démarrer l’échange avec {activeRecipientName}
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                      Envoyez un message ci-dessous ou cliquez sur une suggestion rapide :
                    </p>
                    <div className="mt-4 flex flex-col gap-2 max-w-md w-full">
                      {starterSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => {
                            setDraftText(suggestion);
                            composerInputRef.current?.focus();
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left text-xs text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30 cursor-pointer"
                        >
                          « {suggestion} »
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const msgDate = msg.createdAt?.toDate?.() ?? new Date();
                    const prevDate =
                      index > 0
                        ? messages[index - 1].createdAt?.toDate?.() ?? new Date()
                        : null;
                    const showDaySeparator =
                      !prevDate || getDayKey(prevDate) !== getDayKey(msgDate);
                    const isMine =
                      msg.senderRole === (isCoach ? 'coach' : 'member');
                    const linkedEvent = msg.contextEventId
                      ? eventsById.get(msg.contextEventId) ?? null
                      : null;

                    const actingAsCoach = isCoach && msg.coachUid === user.uid;
                    const likedByMe = actingAsCoach
                      ? Boolean(msg.likedByCoach)
                      : Boolean(msg.likedByMember);
                    const likedByOther = actingAsCoach
                      ? Boolean(msg.likedByMember)
                      : Boolean(msg.likedByCoach);
                    const likeCount =
                      (msg.likedByCoach ? 1 : 0) + (msg.likedByMember ? 1 : 0);
                    const isLiking = likingMessageId === msg.id;

                    let likeTitle = 'Liker ce message';
                    if (likedByMe && likedByOther) {
                      likeTitle = `Aimé par vous et ${activeRecipientName}`;
                    } else if (likedByMe) {
                      likeTitle = 'Retirer votre J’aime';
                    } else if (likedByOther) {
                      likeTitle = `Aimé par ${activeRecipientName} · Liker en retour`;
                    }

                    return (
                      <div key={msg.id} className="space-y-3">
                        {showDaySeparator && (
                          <div className="flex items-center justify-center">
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-0.5 text-[11px] font-medium text-slate-500 capitalize dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                              {formatMessageDayHeader(msgDate)}
                            </span>
                          </div>
                        )}

                        <div
                          className={`group flex flex-col ${
                            isMine ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm shadow-2xs ${
                              isMine
                                ? 'rounded-br-sm bg-emerald-700 text-white dark:bg-emerald-600'
                                : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {!isMine && (
                              <p className="mb-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                {msg.senderName}
                              </p>
                            )}

                            {msg.contextEventTitle && (
                              <div className="mb-1.5">
                                {linkedEvent && onSelectEvent ? (
                                  <button
                                    type="button"
                                    onClick={() => onSelectEvent(linkedEvent)}
                                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium underline underline-offset-2 cursor-pointer ${
                                      isMine
                                        ? 'bg-emerald-800/70 text-emerald-50 hover:bg-emerald-800'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                  >
                                    <CalendarDays
                                      className="h-3 w-3 shrink-0"
                                      aria-hidden="true"
                                    />
                                    Séance : {msg.contextEventTitle}
                                  </button>
                                ) : (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                                      isMine
                                        ? 'bg-emerald-800/70 text-emerald-50'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                    }`}
                                  >
                                    <CalendarDays
                                      className="h-3 w-3 shrink-0"
                                      aria-hidden="true"
                                    />
                                    Séance : {msg.contextEventTitle}
                                  </span>
                                )}
                              </div>
                            )}

                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.text}
                            </p>

                            <div
                              className={`mt-1 flex items-center justify-end gap-1 font-mono text-[10px] tabular-nums ${
                                isMine
                                  ? 'text-emerald-100/90'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              <span>{formatFrenchTime(msgDate)}</span>
                              {isMine && (
                                <CheckCheck
                                  className="h-3 w-3 opacity-80"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                          </div>

                          <div
                            className={`mt-1 flex items-center gap-1.5 ${
                              isMine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <button
                              type="button"
                              disabled={isLiking}
                              onClick={() => void handleToggleMessageLike(msg)}
                              aria-pressed={likedByMe}
                              aria-label={likeTitle}
                              title={likeTitle}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-60 cursor-pointer ${
                                likedByMe
                                  ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800/80 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/50'
                                  : likeCount > 0
                                    ? 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:text-rose-300'
                                    : 'border-transparent bg-transparent text-slate-400 hover:border-slate-200 hover:bg-white hover:text-rose-600 dark:text-slate-500 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-rose-300'
                              }`}
                            >
                              <Heart
                                className={`h-3.5 w-3.5 ${
                                  likeCount > 0
                                    ? 'fill-rose-500 text-rose-500 dark:fill-rose-400 dark:text-rose-400'
                                    : ''
                                }`}
                                aria-hidden="true"
                              />
                              {likeCount > 0 && (
                                <span className="font-mono text-[10px] font-semibold tabular-nums">
                                  {likeCount}
                                </span>
                              )}
                            </button>
                            {likedByOther && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                Aimé par {activeRecipientName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form
                onSubmit={handleFormSubmit}
                className="border-t border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 sm:p-4 space-y-2.5"
              >
                {sendError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
                  >
                    {sendError}
                  </div>
                )}

                {/* Optional Context Event Selector */}
                <div className="flex flex-wrap items-center gap-2">
                  {contextEventId && contextEventTitle ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Séance : {contextEventTitle}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setContextEventId('');
                          setContextEventTitle('');
                        }}
                        aria-label="Retirer la séance associée"
                        className="ml-0.5 rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 cursor-pointer"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ) : selectableContextEvents.length > 0 ? (
                    <select
                      aria-label="Associer une séance au message (optionnel)"
                      value={contextEventId}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = selectableContextEvents.find(
                          (ev) => ev.id === val
                        );
                        setContextEventId(matched ? matched.id : '');
                        setContextEventTitle(matched ? matched.title : '');
                      }}
                      className="min-h-[34px] max-w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <option value="">
                        Associer une séance (optionnel)...
                      </option>
                      {selectableContextEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} — {formatFrenchDateShort(ev.startAt.toDate())}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                <div className="flex items-end gap-2.5">
                  <div className="relative flex-1">
                    <textarea
                      ref={composerInputRef}
                      rows={2}
                      maxLength={VALIDATION_LIMITS.MESSAGE_TEXT_MAX}
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={`Écrire un message à ${activeRecipientName}...`}
                      aria-label={`Message pour ${activeRecipientName}`}
                      className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sending || draftText.trim().length === 0}
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {sending ? 'Envoi...' : 'Envoyer'}
                    </span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                  <span>Entrée pour envoyer · Maj + Entrée pour saut de ligne</span>
                  <span className="font-mono tabular-nums">
                    {draftText.length}/{VALIDATION_LIMITS.MESSAGE_TEXT_MAX}
                  </span>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
