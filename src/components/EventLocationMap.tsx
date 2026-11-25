/// <reference types="google.maps" />
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin } from 'lucide-react';
import { DisciplineItem, SportEvent } from '../types';
import {
  evaluateEventBooking,
  formatEventCoachesLabel,
  formatEventPrice,
  formatFrenchDateShort,
  formatFrenchTime,
} from '../utils/dateAndValidation';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { DisciplineIcon } from './DisciplineIcon';

const MAPS_ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function useMapRenderError(): {
  hasRenderError: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
} {
  const [hasRenderError, setHasRenderError] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onErrorEvent = () => setHasRenderError(true);
    window.addEventListener('gmp-quota-exceeded', onErrorEvent);
    window.addEventListener('gmp-map-render-error', onErrorEvent);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', onErrorEvent);
      window.removeEventListener('gmp-map-render-error', onErrorEvent);
    };
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || hasRenderError) return;

    const checkForErrorOverlay = () => {
      if (node.querySelector('.gm-err-container')) {
        setHasRenderError(true);
      }
    };

    checkForErrorOverlay();
    const observer = new MutationObserver(checkForErrorOverlay);
    observer.observe(node, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [hasRenderError]);

  return { hasRenderError, containerRef };
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429')
  );
}

function buildMapsExternalUrl(
  location: string,
  city: string,
  coords?: { lat: number; lng: number } | null
): string {
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }
  const query = encodeURIComponent([location, city].filter(Boolean).join(', '));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

interface EventLocationMapProps {
  event: SportEvent;
  disciplines?: DisciplineItem[];
  hasMapsApiKey: boolean;
}

export function EventLocationMap({
  event,
  disciplines = [],
  hasMapsApiKey,
}: EventLocationMapProps) {
  if (!hasMapsApiKey) {
    return <FallbackLocationCard event={event} />;
  }

  return (
    <GoogleEventLocationMapInner event={event} disciplines={disciplines} />
  );
}

function FallbackLocationCard({ event }: { event: SportEvent }) {
  const coords = event.hasCoords ? { lat: event.lat, lng: event.lng } : null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5 min-w-0">
          <MapPin
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {event.location}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {event.city}
              {event.region ? ` · ${event.region}` : ''}
            </p>
          </div>
        </div>
        <a
          href={buildMapsExternalUrl(event.location, event.city, coords)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 shrink-0"
        >
          Ouvrir sur Google Maps
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function GoogleEventLocationMapInner({
  event,
  disciplines,
}: {
  event: SportEvent;
  disciplines: DisciplineItem[];
}) {
  const discStyle = getDisciplineStyle(event.discipline, disciplines);
  const isDark = useIsDarkTheme();
  const status = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');
  const { hasRenderError, containerRef } = useMapRenderError();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);
  const [resolvedPos, setResolvedPos] = useState<{ lat: number; lng: number } | null>(
    event.hasCoords ? { lat: event.lat, lng: event.lng } : null
  );
  const [resolving, setResolving] = useState(!event.hasCoords);
  const [lookupCompleted, setLookupCompleted] = useState(event.hasCoords);

  useEffect(() => {
    setInfoOpen(false);
  }, [event.id, isDark]);

  useEffect(() => {
    if (event.hasCoords) {
      setResolvedPos({ lat: event.lat, lng: event.lng });
      setResolving(false);
      setLookupCompleted(true);
      return;
    }

    setResolvedPos(null);
    setLookupCompleted(false);
    setResolving(true);

    if (!placesLib) return;
    let cancelled = false;

    const primaryQuery = [event.location, event.city, event.region]
      .filter(Boolean)
      .join(', ');
    const cityFallbackQuery = [event.city, event.region].filter(Boolean).join(', ');

    const lookupPlace = async () => {
      try {
        const res = await placesLib.Place.searchByText({
          textQuery: primaryQuery,
          fields: ['displayName', 'formattedAddress', 'location'],
          language: 'fr',
          region: 'fr',
          maxResultCount: 1,
        });
        let firstLoc = res.places?.[0]?.location;

        if (!firstLoc && cityFallbackQuery && cityFallbackQuery !== primaryQuery) {
          const fallbackRes = await placesLib.Place.searchByText({
            textQuery: cityFallbackQuery,
            fields: ['location'],
            language: 'fr',
            region: 'fr',
            maxResultCount: 1,
          });
          firstLoc = fallbackRes.places?.[0]?.location;
        }

        if (!cancelled && firstLoc) {
          setResolvedPos({
            lat: firstLoc.lat(),
            lng: firstLoc.lng(),
          });
        }
      } catch (err: unknown) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      } finally {
        if (!cancelled) {
          setResolving(false);
          setLookupCompleted(true);
        }
      }
    };

    void lookupPlace();

    return () => {
      cancelled = true;
    };
  }, [
    event.id,
    event.hasCoords,
    event.lat,
    event.lng,
    event.location,
    event.city,
    event.region,
    placesLib,
  ]);

  if (
    hasRenderError ||
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE ||
    (lookupCompleted && !resolving && !resolvedPos)
  ) {
    return <FallbackLocationCard event={event} />;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
      <div ref={containerRef} className="relative h-64 w-full sm:h-72">
        {resolvedPos ? (
          <GoogleMap
            id="event-location-map"
            key={`${event.id}-${resolvedPos.lat}-${resolvedPos.lng}-${isDark ? 'dark' : 'light'}`}
            mapId="DEMO_MAP_ID"
            defaultCenter={resolvedPos}
            defaultZoom={15}
            colorScheme={isDark ? 'DARK' : 'LIGHT'}
            gestureHandling="cooperative"
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            internalUsageAttributionIds={MAPS_ATTRIBUTION_IDS}
            style={{ width: '100%', height: '100%' }}
          >
            <AdvancedMarker
              ref={markerRef}
              position={resolvedPos}
              title={event.location}
              onClick={() => setInfoOpen((prev) => !prev)}
            >
              <Pin
                background={discStyle.hex}
                borderColor={discStyle.borderHex}
                glyphColor="#ffffff"
              />
            </AdvancedMarker>

            {infoOpen && marker && (
              <InfoWindow
                anchor={marker}
                onCloseClick={() => setInfoOpen(false)}
                maxWidth={240}
                headerContent={
                  <span className="text-xs font-bold leading-snug">
                    {event.location}
                  </span>
                }
              >
                <p className="text-[11px] opacity-85">
                  {event.city}
                  {event.region ? ` · ${event.region}` : ''}
                </p>
              </InfoWindow>
            )}
          </GoogleMap>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center text-xs text-slate-500 dark:text-slate-400">
            <MapPin className="h-6 w-6 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <p className="mt-2 font-medium text-slate-700 dark:text-slate-200">
              {resolving
                ? 'Localisation de l’adresse sur Google Maps...'
                : `${event.location} (${event.city})`}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
          {event.location} · {event.city}
        </span>
        <a
          href={buildMapsExternalUrl(event.location, event.city, resolvedPos)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 shrink-0"
        >
          Itinéraire Google Maps
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

interface EventsOverviewMapProps {
  events: SportEvent[];
  disciplines?: DisciplineItem[];
  hasMapsApiKey: boolean;
  heightClass?: string;
  onSelectEvent: (event: SportEvent) => void;
}

export function EventsOverviewMap({
  events,
  disciplines = [],
  hasMapsApiKey,
  heightClass,
  onSelectEvent,
}: EventsOverviewMapProps) {
  if (!hasMapsApiKey) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        La carte interactive s’affichera automatiquement dès que la clé Google Maps sera configurée.
      </div>
    );
  }

  return (
    <EventsOverviewMapInner
      events={events}
      disciplines={disciplines}
      heightClass={heightClass}
      onSelectEvent={onSelectEvent}
    />
  );
}

function EventsOverviewMapInner({
  events,
  disciplines,
  heightClass = 'h-[340px] sm:h-[420px]',
  onSelectEvent,
}: {
  events: SportEvent[];
  disciplines: DisciplineItem[];
  heightClass?: string;
  onSelectEvent: (event: SportEvent) => void;
}) {
  const isDark = useIsDarkTheme();
  const status = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');
  const { hasRenderError, containerRef } = useMapRenderError();
  const [coordsCache, setCoordsCache] = useState<
    Record<string, { lat: number; lng: number } | null>
  >({});
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedEventId && !events.some((ev) => ev.id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!placesLib || events.length === 0) return;
    let cancelled = false;

    const toResolve = events.filter(
      (ev) => !ev.hasCoords && !(ev.id in coordsCache)
    );
    if (toResolve.length === 0) return;

    Promise.all(
      toResolve.slice(0, 10).map(async (ev) => {
        const primaryQuery = [ev.location, ev.city, ev.region].filter(Boolean).join(', ');
        const cityFallbackQuery = [ev.city, ev.region].filter(Boolean).join(', ');
        try {
          const res = await placesLib.Place.searchByText({
            textQuery: primaryQuery,
            fields: ['location'],
            language: 'fr',
            region: 'fr',
            maxResultCount: 1,
          });
          let loc = res.places?.[0]?.location;
          if (!loc && cityFallbackQuery && cityFallbackQuery !== primaryQuery) {
            const fallbackRes = await placesLib.Place.searchByText({
              textQuery: cityFallbackQuery,
              fields: ['location'],
              language: 'fr',
              region: 'fr',
              maxResultCount: 1,
            });
            loc = fallbackRes.places?.[0]?.location;
          }
          if (loc) {
            return { id: ev.id, pos: { lat: loc.lat(), lng: loc.lng() } };
          }
        } catch (err) {
          if (isQuotaError(err)) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        }
        return { id: ev.id, pos: null };
      })
    ).then((results) => {
      if (cancelled) return;
      const updates: Record<string, { lat: number; lng: number } | null> = {};
      results.forEach((item) => {
        updates[item.id] = item.pos;
      });
      if (Object.keys(updates).length > 0) {
        setCoordsCache((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [events, placesLib, coordsCache]);

  const mappedEvents = useMemo(() => {
    return events
      .map((ev) => {
        const pos = ev.hasCoords
          ? { lat: ev.lat, lng: ev.lng }
          : coordsCache[ev.id] ?? null;
        return pos ? { event: ev, pos } : null;
      })
      .filter((x): x is { event: SportEvent; pos: { lat: number; lng: number } } => Boolean(x));
  }, [events, coordsCache]);

  const selectedEntry = useMemo(
    () => mappedEvents.find((m) => m.event.id === selectedEventId) ?? null,
    [mappedEvents, selectedEventId]
  );

  if (
    hasRenderError ||
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        Impossible de charger la carte Google Maps pour le moment. Utilisez la vue liste pour consulter et réserver vos séances.
      </div>
    );
  }

  const initialCenter = mappedEvents[0]?.pos ?? { lat: 46.603354, lng: 1.888334 };
  const initialZoom = mappedEvents.length === 1 ? 14 : mappedEvents.length > 1 ? 6 : 5;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div ref={containerRef} className={`${heightClass} w-full`}>
        <GoogleMap
          id="events-overview-map"
          key={isDark ? 'dark' : 'light'}
          mapId="DEMO_MAP_ID"
          defaultCenter={initialCenter}
          defaultZoom={initialZoom}
          colorScheme={isDark ? 'DARK' : 'LIGHT'}
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          internalUsageAttributionIds={MAPS_ATTRIBUTION_IDS}
          style={{ width: '100%', height: '100%' }}
        >
          <MapBoundsFitter positions={mappedEvents.map((m) => m.pos)} />

          {mappedEvents.map(({ event, pos }) => {
            const discStyle = getDisciplineStyle(event.discipline, disciplines);
            return (
              <EventPinMarker
                key={event.id}
                event={event}
                disciplines={disciplines}
                position={pos}
                pinBackground={discStyle.hex}
                pinBorderColor={discStyle.borderHex}
                isSelected={selectedEventId === event.id}
                onSelect={() => setSelectedEventId(event.id)}
              />
            );
          })}

          {selectedEntry && (
            <InfoWindow
              position={selectedEntry.pos}
              onCloseClick={() => setSelectedEventId(null)}
              maxWidth={260}
              headerContent={
                <span className="text-xs font-bold leading-snug">
                  {selectedEntry.event.title}
                </span>
              }
            >
              <div className="space-y-1.5 pt-0.5">
                <p
                  className="inline-flex items-center gap-1 text-[11px] font-semibold"
                  style={{
                    color: getDisciplineStyle(selectedEntry.event.discipline, disciplines)
                      .hex,
                  }}
                >
                  <DisciplineIcon
                    disciplineName={selectedEntry.event.discipline}
                    catalog={disciplines}
                    className="h-3 w-3 shrink-0"
                  />
                  {selectedEntry.event.discipline} · {selectedEntry.event.city}
                </p>
                <p className="text-xs capitalize opacity-90">
                  {formatFrenchDateShort(selectedEntry.event.startAt.toDate())} à{' '}
                  {formatFrenchTime(selectedEntry.event.startAt.toDate())}
                </p>
                <p className="text-xs opacity-75">
                  {selectedEntry.event.location}
                </p>
                <p className="text-[11px] font-medium opacity-90">
                  {formatEventCoachesLabel(selectedEntry.event)} ·{' '}
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatEventPrice(selectedEntry.event)}
                  </span>
                </p>
                {(() => {
                  const evalInfo = evaluateEventBooking(selectedEntry.event);
                  const isCancelled = evalInfo.state === 'cancelled';
                  const isClosed = evalInfo.state === 'closed';
                  return (
                    <>
                      {(isCancelled || isClosed) && (
                        <p
                          className={`text-[11px] font-semibold ${
                            isCancelled
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {evalInfo.helperText}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectEvent(selectedEntry.event)}
                        className={`mt-1 w-full rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                          evalInfo.state === 'open'
                            ? 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500'
                            : 'border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {evalInfo.state === 'open'
                          ? selectedEntry.event.isPaid
                            ? `Réserver (${formatEventPrice(selectedEntry.event)})`
                            : 'Voir & réserver'
                          : isCancelled
                            ? 'Séance annulée · Voir détails'
                            : 'Voir les détails'}
                      </button>
                    </>
                  );
                })()}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  );
}

function EventPinMarker({
  event,
  disciplines,
  position,
  pinBackground,
  pinBorderColor,
  isSelected,
  onSelect,
}: {
  event: SportEvent;
  disciplines: DisciplineItem[];
  position: { lat: number; lng: number };
  pinBackground: string;
  pinBorderColor: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <AdvancedMarker
      position={position}
      title={`${event.title} (${event.discipline}) — ${event.city}`}
      onClick={onSelect}
    >
      <Pin
        background={isSelected ? '#0f172a' : pinBackground}
        borderColor={isSelected ? '#020617' : pinBorderColor}
        glyphColor="#ffffff"
        scale={isSelected ? 1.15 : 1}
      >
        <DisciplineIcon
          disciplineName={event.discipline}
          catalog={disciplines}
          className="h-3.5 w-3.5 text-white"
        />
      </Pin>
    </AdvancedMarker>
  );
}

function MapBoundsFitter({
  positions,
}: {
  positions: { lat: number; lng: number }[];
}) {
  const map = useMap('events-overview-map');
  const coreLib = useMapsLibrary('core');

  const positionsKey = useMemo(
    () => positions.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|'),
    [positions]
  );

  const fit = useCallback(() => {
    if (!map || !coreLib || positions.length === 0) return;
    if (positions.length === 1) {
      map.setCenter(positions[0]);
      map.setZoom(14);
      return;
    }
    const bounds = new coreLib.LatLngBounds();
    positions.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 56);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, coreLib, positionsKey]);

  useEffect(() => {
    fit();
  }, [fit]);

  return null;
}
