import { FormEvent, useState } from 'react';
import { ChevronDown, Eye, EyeOff, KeyRound } from 'lucide-react';
import { User } from 'firebase/auth';
import {
  setOrUpdateUserPassword,
  userHasPasswordProvider,
} from '../services/authService';

interface PasswordSettingsCardProps {
  user: User;
  stacked?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function PasswordSettingsCard({
  user,
  stacked = false,
  collapsible = false,
  defaultExpanded = false,
}: PasswordSettingsCardProps) {
  const hasPassword = userHasPasswordProvider(user);
  const [expanded, setExpanded] = useState(
    collapsible ? defaultExpanded : true
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const isBodyVisible = !collapsible || expanded;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (newPassword.length < 6) {
      setFeedback({
        type: 'error',
        text: 'Votre mot de passe doit contenir au moins 6 caractères.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({
        type: 'error',
        text: 'Les deux nouveaux mots de passe ne correspondent pas.',
      });
      return;
    }

    setSaving(true);
    try {
      const outcome = await setOrUpdateUserPassword({
        user,
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setFeedback({
        type: 'success',
        text:
          outcome === 'linked'
            ? 'Votre mot de passe est configuré. Vous pouvez désormais vous connecter avec votre email et ce mot de passe.'
            : 'Votre mot de passe a bien été mis à jour.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de mettre à jour votre mot de passe.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div
        className={`flex items-start justify-between gap-3 ${
          isBodyVisible
            ? 'border-b border-slate-100 pb-3.5 dark:border-slate-800'
            : ''
        }`}
      >
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="flex flex-1 items-start gap-3 text-left cursor-pointer"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {hasPassword
                  ? 'Modifier mon mot de passe'
                  : 'Définir mon mot de passe de connexion'}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {hasPassword
                  ? 'Mettez à jour le mot de passe associé à votre compte.'
                  : 'Définissez un mot de passe personnel pour sécuriser votre connexion par email.'}
              </p>
            </div>
          </button>
        ) : (
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                {hasPassword
                  ? 'Modifier mon mot de passe'
                  : 'Définir mon mot de passe de connexion'}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {hasPassword
                  ? 'Mettez à jour le mot de passe associé à votre compte.'
                  : 'Définissez un mot de passe personnel pour sécuriser votre connexion par email.'}
              </p>
            </div>
          </div>
        )}

        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Replier la section mot de passe' : 'Déplier la section mot de passe'}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {isBodyVisible && (
      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        className="mt-4 space-y-3.5"
      >
        {hasPassword && (
          <div>
            <label
              htmlFor="pwd-current"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Mot de passe actuel *
            </label>
            <div className="relative mt-1">
              <input
                id="pwd-current"
                type={showCurrentPassword ? 'text' : 'password'}
                required
                autoComplete="off"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                aria-label={
                  showCurrentPassword
                    ? 'Masquer le mot de passe actuel'
                    : 'Afficher le mot de passe actuel'
                }
                aria-pressed={showCurrentPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 cursor-pointer"
              >
                {showCurrentPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        )}

        <div
          className={
            stacked
              ? 'grid grid-cols-1 gap-3'
              : 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end'
          }
        >
          <div>
            <label
              htmlFor="pwd-new"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Nouveau mot de passe *
            </label>
            <div className="relative mt-1">
              <input
                id="pwd-new"
                type={showNewPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 caractères minimum"
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                aria-label={
                  showNewPassword
                    ? 'Masquer le nouveau mot de passe'
                    : 'Afficher le nouveau mot de passe'
                }
                aria-pressed={showNewPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 cursor-pointer"
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="pwd-confirm"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Confirmer le mot de passe *
            </label>
            <div className="relative mt-1">
              <input
                id="pwd-confirm"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Répétez le mot de passe"
                className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={
                  showConfirmPassword
                    ? 'Masquer la confirmation du mot de passe'
                    : 'Afficher la confirmation du mot de passe'
                }
                aria-pressed={showConfirmPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 cursor-pointer"
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-lg border p-3 text-xs ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            {saving
              ? 'Enregistrement...'
              : hasPassword
                ? 'Mettre à jour le mot de passe'
                : 'Enregistrer mon mot de passe'}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
