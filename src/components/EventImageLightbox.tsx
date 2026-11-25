import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface EventImageLightboxProps {
  src: string;
  title: string;
  onClose: () => void;
}

export function EventImageLightbox({
  src,
  title,
  onClose,
}: EventImageLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Visuel en plein écran : ${title}` : 'Visuel de l’événement en plein écran'}
      className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col items-center justify-center bg-slate-950/95 backdrop-blur-xs cursor-zoom-out"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-slate-950/85 via-slate-950/40 to-transparent px-4 py-3 sm:px-6 sm:py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm font-semibold text-white drop-shadow-xs">
          {title}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Fermer l’image en plein écran"
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-slate-900/80 text-white shadow-lg transition-colors hover:bg-slate-800 cursor-pointer"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex h-full w-full items-center justify-center p-2 sm:p-6">
        <img
          src={src}
          alt={title || 'Visuel de l’événement'}
          className="h-full w-full max-h-[100dvh] max-w-full object-contain select-none"
        />
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return content;
  }

  return createPortal(content, document.body);
}
