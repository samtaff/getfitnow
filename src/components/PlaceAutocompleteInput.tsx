/// <reference types="google.maps" />
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import { VALIDATION_LIMITS } from '../types';

interface PlaceSelection {
  location: string;
  city: string;
  region: string;
  hasCoords: boolean;
  lat: number;
  lng: number;
}

interface PlaceAutocompleteInputProps {
  value: string;
  hasMapsApiKey: boolean;
  onChangeText: (value: string) => void;
  onSelectPlace: (place: PlaceSelection) => void;
}

export function PlaceAutocompleteInput({
  value,
  hasMapsApiKey,
  onChangeText,
  onSelectPlace,
}: PlaceAutocompleteInputProps) {
  if (!hasMapsApiKey) {
    return (
      <input
        id="ev-location"
        type="text"
        required
        minLength={VALIDATION_LIMITS.LOCATION_MIN}
        maxLength={VALIDATION_LIMITS.LOCATION_MAX}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        placeholder="Ex. 12 Rue Oberkampf ou Parc des Buttes-Chaumont"
        className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    );
  }

  return (
    <PlaceAutocompleteInner
      value={value}
      onChangeText={onChangeText}
      onSelectPlace={onSelectPlace}
    />
  );
}

function PlaceAutocompleteInner({
  value,
  onChangeText,
  onSelectPlace,
}: Omit<PlaceAutocompleteInputProps, 'hasMapsApiKey'>) {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!placesLib) return;
    const trimmed = value.trim();
    if (trimmed.length < 3 || !open) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        language: 'fr',
        includedRegionCodes: ['fr', 'be', 'ch', 'lu'],
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.suggestions ?? []);
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('OVER_QUERY_LIMIT') ||
            msg.includes('429')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, value, open]);

  const handleInput = useCallback(
    (e: FormEvent<HTMLInputElement>) => {
      onChangeText((e.target as HTMLInputElement).value);
      setOpen(true);
    },
    [onChangeText]
  );

  const handleSuggestionClick = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      const place = suggestion.placePrediction.toPlace();
      try {
        await place.fetchFields({
          fields: [
            'displayName',
            'formattedAddress',
            'addressComponents',
            'location',
          ],
        });

        const locality =
          place.addressComponents?.find((c) => c.types.includes('locality'))
            ?.longText ||
          place.addressComponents?.find((c) =>
            c.types.includes('administrative_area_level_2')
          )?.longText ||
          '';

        const regionName =
          place.addressComponents?.find((c) =>
            c.types.includes('administrative_area_level_1')
          )?.longText || '';

        const displayLabel =
          place.displayName && place.formattedAddress
            ? `${place.displayName} — ${place.formattedAddress}`
            : place.formattedAddress ||
              place.displayName ||
              suggestion.placePrediction.text.text;

        const loc = place.location;
        onSelectPlace({
          location: displayLabel.slice(0, VALIDATION_LIMITS.LOCATION_MAX),
          city: locality.slice(0, VALIDATION_LIMITS.CITY_MAX),
          region: regionName.slice(0, VALIDATION_LIMITS.REGION_MAX),
          hasCoords: Boolean(loc),
          lat: loc ? loc.lat() : 0,
          lng: loc ? loc.lng() : 0,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      } finally {
        sessionTokenRef.current = null;
        setSuggestions([]);
        setOpen(false);
      }
    },
    [placesLib, onSelectPlace]
  );

  return (
    <div className="relative">
      <input
        id="ev-location"
        type="text"
        required
        minLength={VALIDATION_LIMITS.LOCATION_MIN}
        maxLength={VALIDATION_LIMITS.LOCATION_MAX}
        value={value}
        onInput={handleInput}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 180);
        }}
        placeholder="Rechercher une adresse ou un lieu..."
        autoComplete="off"
        className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleSuggestionClick(s);
                }}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span>{s.placePrediction?.text.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
