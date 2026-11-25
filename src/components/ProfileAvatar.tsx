import { ChangeEvent, useEffect, useId, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { processProfilePhotoFile } from '../utils/imageUpload';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface ProfileAvatarProps {
  name: string;
  photoUrl?: string | null;
  fallbackImage?: string;
  size?: AvatarSize;
  variant?: 'neutral' | 'emerald' | 'dark';
  className?: string;
}

export function ProfileAvatar({
  name,
  photoUrl,
  fallbackImage,
  size = 'md',
  variant = 'emerald',
  className = '',
}: ProfileAvatarProps) {
  const resolvedSrc =
    (typeof photoUrl === 'string' && photoUrl.trim() ? photoUrl.trim() : '') ||
    fallbackImage ||
    '';
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [resolvedSrc]);

  const showImage = Boolean(resolvedSrc) && failedSrc !== resolvedSrc;

  const bgClasses =
    variant === 'dark'
      ? 'bg-slate-800 text-white border-slate-700'
      : variant === 'neutral'
        ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
        : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';

  if (showImage) {
    return (
      <img
        src={resolvedSrc}
        alt={`Photo de profil de ${name}`}
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(resolvedSrc)}
        className={`${SIZE_CLASSES[size]} shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 object-cover ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${SIZE_CLASSES[size]} inline-flex shrink-0 items-center justify-center rounded-lg border font-display font-bold select-none ${bgClasses} ${className}`}
    >
      {computeInitials(name)}
    </div>
  );
}

interface PhotoUploadFieldProps {
  label: string;
  name: string;
  photoUrl: string;
  onChange: (nextPhotoUrl: string) => void;
  helperText?: string;
  stacked?: boolean;
}

export function PhotoUploadField({
  label,
  name,
  photoUrl,
  onChange,
  helperText = 'Format JPG, PNG ou WebP · Recadrage carré automatique.',
  stacked = false,
}: PhotoUploadFieldProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setProcessing(true);
    try {
      const dataUrl = await processProfilePhotoFile(file);
      onChange(dataUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger cette photo de profil.'
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
      <div
        className={
          stacked
            ? 'flex flex-col gap-3'
            : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'
        }
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <ProfileAvatar name={name || 'Profil'} photoUrl={photoUrl} size="lg" />
          <div className="min-w-0">
            <label
              htmlFor={inputId}
              className="block text-xs font-semibold text-slate-800 dark:text-slate-100"
            >
              {label}
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{helperText}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept="image/*"
            onChange={(e) => void handleFileChange(e)}
            className="sr-only"
          />
          <button
            type="button"
            disabled={processing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            {processing
              ? 'Traitement...'
              : photoUrl
                ? 'Changer la photo'
                : 'Ajouter une photo'}
          </button>

          {photoUrl && (
            <button
              type="button"
              disabled={processing}
              onClick={() => {
                setError(null);
                onChange('');
              }}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 hover:border-rose-200 dark:border-slate-700 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/60 dark:hover:border-rose-800 disabled:opacity-60 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Retirer
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
