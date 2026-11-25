import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        aria-label="Installer l’application GetFitNow Event"
        title="Installer l’application"
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-emerald-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:focus-visible:ring-offset-slate-900"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Installer</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Ajouter l’application sur l’écran d’accueil"
          title="Ajouter sur l’écran d’accueil"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        >
          <Smartphone className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span className="hidden sm:inline">App</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/apple-touch-icon.png"
                    alt="Icône GetFitNow Event"
                    className="h-11 w-11 rounded-xl border border-slate-200 dark:border-slate-700"
                  />
                  <div>
                    <h3
                      id="ios-pwa-title"
                      className="font-display text-base font-bold text-slate-900 dark:text-white"
                    >
                      Ajouter à l’écran d’accueil
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      GetFitNow Event sur iPhone / iPad
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Fermer"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <ol className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    1
                  </span>
                  <span>
                    Touchez le bouton{' '}
                    <strong className="inline-flex items-center gap-1 text-slate-900 dark:text-white">
                      <Share className="h-3.5 w-3.5" aria-hidden="true" />
                      Partager
                    </strong>{' '}
                    dans la barre Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    2
                  </span>
                  <span>
                    Faites défiler puis touchez{' '}
                    <strong className="text-slate-900 dark:text-white">
                      Sur l’écran d’accueil
                    </strong>
                    .
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
