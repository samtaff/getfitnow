import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updatePassword,
  updateProfile,
  User,
} from 'firebase/auth';
import { auth } from '../firebase';

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const msg = error instanceof Error ? error.message : String(error ?? '');

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Email ou mot de passe incorrect. Vérifiez vos identifiants ou créez un compte.';
  }
  if (code === 'auth/invalid-email') {
    return 'Adresse email invalide.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Un compte existe déjà avec cette adresse email. Connectez-vous ou utilisez « Mot de passe oublié ».';
  }
  if (code === 'auth/weak-password') {
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'La connexion par email et mot de passe doit être activée dans la console Firebase (Authentication > Sign-in method > E-mail/Mot de passe).';
  }
  if (code === 'auth/too-many-requests') {
    return 'Trop de tentatives. Patientez quelques instants avant de réessayer.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Par sécurité, veuillez vous déconnecter puis vous reconnecter avant de modifier votre mot de passe.';
  }
  if (code === 'auth/provider-already-linked') {
    return 'Un mot de passe est déjà associé à ce compte.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Erreur réseau. Vérifiez votre connexion internet et réessayez.';
  }

  return msg || 'Une erreur d’authentification est survenue.';
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<User> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new Error('Veuillez saisir votre adresse email et votre mot de passe.');
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    return cred.user;
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

export async function registerWithEmailPassword(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<User> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.displayName.trim();

  if (cleanName.length < 2) {
    throw new Error('Veuillez saisir votre nom complet (2 caractères minimum).');
  }
  if (params.password.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
  }

  try {
    const cred = await createUserWithEmailAndPassword(
      auth,
      cleanEmail,
      params.password
    );
    await updateProfile(cred.user, { displayName: cleanName });
    try {
      await sendEmailVerification(cred.user);
    } catch {
      // Non-blocking: user can also resend verification from the gate if needed
    }
    return cred.user;
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Veuillez saisir votre adresse email.');
  }
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}

export function userHasPasswordProvider(user: User | null): boolean {
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === 'password');
}

export async function setOrUpdateUserPassword(params: {
  user: User;
  currentPassword?: string;
  newPassword: string;
}): Promise<'linked' | 'updated'> {
  if (!params.user.email) {
    throw new Error('Aucune adresse email associée à ce compte.');
  }
  if (params.newPassword.length < 6) {
    throw new Error('Le nouveau mot de passe doit contenir au moins 6 caractères.');
  }

  const hasPassword = userHasPasswordProvider(params.user);

  if (hasPassword) {
    if (!params.currentPassword) {
      throw new Error('Veuillez saisir votre mot de passe actuel.');
    }
    try {
      const credential = EmailAuthProvider.credential(
        params.user.email,
        params.currentPassword
      );
      await reauthenticateWithCredential(params.user, credential);
      await updatePassword(params.user, params.newPassword);
      return 'updated';
    } catch (error) {
      throw new Error(formatFirebaseAuthError(error));
    }
  }

  // Account without password provider yet -> link Email/Password credential
  const credential = EmailAuthProvider.credential(
    params.user.email,
    params.newPassword
  );
  try {
    await linkWithCredential(params.user, credential);
    return 'linked';
  } catch (error) {
    throw new Error(formatFirebaseAuthError(error));
  }
}
