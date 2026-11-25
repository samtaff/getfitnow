import { FormEvent, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  registerWithEmailPassword,
  sendPasswordReset,
  signInWithEmailPassword,
} from '../services/authService';
import { VALIDATION_LIMITS } from '../types';

type AuthMode = 'login' | 'register' | 'reset';

interface EmailPasswordAuthFormProps {
  audience: 'member' | 'coach';
  externalError?: string | null;
  onSuccess: (user: User) => void;
}

export function EmailPasswordAuthForm({
  audience,
  externalError,
  onSuccess,
}: EmailPasswordAuthFormProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const displayedError = localError || externalError || null;

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setLocalError(null);
    setResetSent(false);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetSent(false);

    const cleanEmail = email.trim().toLowerCase();
    if (!VALIDATION_LIMITS.EMAIL_REGEX.test(cleanEmail)) {
      setLocalError('Veuillez saisir une adresse email valide.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const loggedUser = await signInWithEmailPassword(cleanEmail, password);
        setPassword('');
        onSuccess(loggedUser);
      } else if (mode === 'register') {
        if (password.length < 6) {
          setLocalError('Le mot de passe doit contenir au moins 6 caractères.');
          setSubmitting(false);
          return;
        }
        if (password !== confirmPassword) {
          setLocalError('Les deux mots de passe ne correspondent pas.');
          setSubmitting(false);
          return;
        }
        const computedName =
          audience === 'member'
            ? `${firstName.trim()} ${lastName.trim()}`.trim()
            : fullName.trim();
        if (computedName.length < 2) {
          setLocalError(
            audience === 'member'
              ? 'Veuillez saisir votre prénom et votre nom.'
              : 'Veuillez saisir votre nom complet.'
          );
          setSubmitting(false);
          return;
        }
        const createdUser = await registerWithEmailPassword({
          email: cleanEmail,
          password,
          displayName: computedName,
        });
        setPassword('');
        setConfirmPassword('');
        onSuccess(createdUser);
      } else {
        await sendPasswordReset(cleanEmail);
        setResetSent(true);
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Erreur d’authentification.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div
        role="tablist"
        aria-label="Mode d’authentification"
        className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => switchMode('login')}
          className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'login'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          Se connecter
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          onClick={() => switchMode('register')}
          className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            mode === 'register'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          Créer un compte
        </button>
      </div>

      <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3.5">
        {mode === 'register' &&
          (audience === 'member' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`${audience}-auth-firstname`}
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Prénom *
                </label>
                <input
                  id={`${audience}-auth-firstname`}
                  type="text"
                  required
                  autoComplete="off"
                  maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Camille"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
              <div>
                <label
                  htmlFor={`${audience}-auth-lastname`}
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Nom *
                </label>
                <input
                  id={`${audience}-auth-lastname`}
                  type="text"
                  required
                  autoComplete="off"
                  maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Laurent"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor={`${audience}-auth-fullname`}
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nom complet *
              </label>
              <input
                id={`${audience}-auth-fullname`}
                type="text"
                required
                autoComplete="off"
                maxLength={VALIDATION_LIMITS.DISPLAY_NAME_MAX}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="David Frosio"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          ))}

        <div>
          <label
            htmlFor={`${audience}-auth-email`}
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Adresse email *
          </label>
          <input
            id={`${audience}-auth-email`}
            type="email"
            required
            autoComplete="off"
            maxLength={VALIDATION_LIMITS.EMAIL_MAX}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@exemple.fr"
            className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        {mode !== 'reset' && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`${audience}-auth-password`}
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Mot de passe *
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-[11px] font-medium text-emerald-700 hover:underline dark:text-emerald-400 cursor-pointer"
                >
                  Mot de passe oublié ?
                </button>
              )}
            </div>
            <div className="relative mt-1">
              <input
                id={`${audience}-auth-password`}
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6 caractères minimum"
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword
                    ? 'Masquer le mot de passe'
                    : 'Afficher le mot de passe'
                }
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        )}

        {mode === 'register' && (
          <div>
            <label
              htmlFor={`${audience}-auth-confirm`}
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Confirmer le mot de passe *
            </label>
            <input
              id={`${audience}-auth-confirm`}
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Répétez votre mot de passe"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        )}

        {displayedError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span>{displayedError}</span>
          </div>
        )}

        {resetSent && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <span>
              Si un compte existe pour cette adresse, un email de réinitialisation vient d’être envoyé.
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
        >
          {mode === 'login' && <LogIn className="h-4 w-4" aria-hidden="true" />}
          {mode === 'register' && (
            <UserPlus className="h-4 w-4" aria-hidden="true" />
          )}
          {mode === 'reset' && (
            <KeyRound className="h-4 w-4" aria-hidden="true" />
          )}
          {submitting
            ? 'Validation en cours...'
            : mode === 'login'
              ? 'Se connecter avec mon mot de passe'
              : mode === 'register'
                ? 'Créer mon profil avec mot de passe'
                : 'Envoyer le lien de réinitialisation'}
        </button>

        {mode === 'reset' && (
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="w-full text-center text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
          >
            Retour à la connexion
          </button>
        )}
      </form>
    </div>
  );
}
