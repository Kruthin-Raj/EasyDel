import React, { createContext, useCallback, useContext, useState } from 'react';
import { Platform } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from '../database';
import Route from '../database/models/Route';
import Location from '../database/models/Location';
import RouteStop from '../database/models/RouteStop';
import * as api from '../lib/api';
import type {
  DashboardStats,
  DeliveryStatus,
  IssueSummary,
  MobileLocation,
  MobileLocationPreview,
  MobileRoute,
  MobileUser,
  PendingSyncEntry,
  RecentDeliverySummary,
  RecordedRoundSummary,
  RunSummary,
  UserPreferences,
} from '../lib/types';

const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000');

const DEFAULT_PREFS: UserPreferences = {
  geofenceMetres: 150,
  checkpointTypes: ['Large package', 'Small package', 'Fruit box', 'Newspaper', 'Milk', 'Food package'],
  defaultStartName: 'Depot',
  defaultStartLat: 13.6288,
  defaultStartLng: 79.4192,
  memorizeQuizDefault: false,
  memorizeAutoAdvance: true,
  showBagReminder: true,
  distanceUnit: 'metric',
};

export const DEMO_ROUTE: MobileRoute = {
  id: 'demo-morning-beat',
  name: 'Morning Paper Beat (Sample)',
  shareCode: 'DEMO2026',
  isOwner: false,
  isDemo: true,
  creatorName: 'EasyDel Demo',
  versionId: 'demo-v1',
  totalDistance: 2450,
  estimatedDuration: 680,
  startPoint: { name: 'Depot', latitude: 13.6279, longitude: 79.4184 },
  endPoint: { name: 'Depot', latitude: 13.6279, longitude: 79.4184 },
  routeGeometry: [
    [79.4184, 13.6279],
    [79.4188, 13.6285],
    [79.4192, 13.6288],
    [79.4204, 13.6296],
    [79.4211, 13.6305],
    [79.4218, 13.6311],
    [79.4227, 13.6324],
    [79.4234, 13.6335],
    [79.4241, 13.6342],
  ],
  stops: [
    {
      id: 'demo-stop-1',
      routeVersionId: 'demo-v1',
      locationId: 'demo-loc-1',
      locationShareCode: 'DMHOUSE1',
      sequence: 1,
      name: 'Green Residency Gate A',
      address: '12 Tilak Rd, Block A',
      latitude: 13.6288,
      longitude: 79.4192,
      floor: 'Ground',
      unit: 'Lobby',
      notes: 'Tuck inside blue mailbox on the left wall.',
      nextVisitNote: 'Ask guard for weekend extra copy.',
      entranceInstructions: 'Side wicket gate stays unlocked before 06:30.',
      securityInstructions: 'Ring bell once and wave to camera.',
      photoUrl: null,
      totalItems: 3,
      items: [
        {
          subscriptionId: 'demo-sub-1',
          customer: 'A. Sharma',
          productType: 'Morning Times',
          quantity: 2,
          specialInstructions: 'Plastic wrap on rainy days',
        },
        {
          subscriptionId: 'demo-sub-2',
          customer: 'Watchman Desk',
          productType: 'Milk 500ml',
          quantity: 1,
          specialInstructions: null,
        },
      ],
      deliveryStatus: 'PENDING',
    },
    {
      id: 'demo-stop-2',
      routeVersionId: 'demo-v1',
      locationId: 'demo-loc-2',
      locationShareCode: 'DMHOUSE2',
      sequence: 2,
      name: 'Lotus Corner Shop',
      address: '44 Market Cross St',
      latitude: 13.6311,
      longitude: 79.4218,
      floor: null,
      unit: 'Shutter #2',
      notes: 'Slide bundle under rolling shutter.',
      nextVisitNote: null,
      entranceInstructions: 'Step over brass rail beside flower stand.',
      securityInstructions: null,
      photoUrl: null,
      totalItems: 5,
      items: [
        {
          subscriptionId: 'demo-sub-3',
          customer: 'R. Patel',
          productType: 'Newspaper bundle',
          quantity: 5,
          specialInstructions: null,
        },
      ],
      deliveryStatus: 'PENDING',
    },
    {
      id: 'demo-stop-3',
      routeVersionId: 'demo-v1',
      locationId: 'demo-loc-3',
      locationShareCode: 'DMHOUSE3',
      sequence: 3,
      name: 'Sunview Apartments',
      address: '88 Park Avenue',
      latitude: 13.6342,
      longitude: 79.4241,
      floor: '2',
      unit: '204',
      notes: 'Hang cloth bag on door handle.',
      nextVisitNote: 'Customer back from trip today.',
      entranceInstructions: 'Code 4820# on keypad.',
      securityInstructions: null,
      photoUrl: null,
      totalItems: 2,
      items: [
        {
          subscriptionId: 'demo-sub-4',
          customer: 'M. Rao',
          productType: 'Fruit box',
          quantity: 2,
          specialInstructions: 'Keep upright',
        },
      ],
      deliveryStatus: 'PENDING',
    },
  ],
};

export type AppContextValue = {
  apiUrl: string;
  setApiUrl: (url: string) => void;
  user: MobileUser | null;
  token: string | null;
  isGuest: boolean;
  showAuthModal: boolean;
  authPromptReason: string | null;
  routes: MobileRoute[];
  locations: MobileLocation[];
  dashboardStats: DashboardStats;
  recentDeliveries: RecentDeliverySummary[];
  recordedRounds: RecordedRoundSummary[];
  runs: RunSummary[];
  issues: IssueSummary[];
  preferences: UserPreferences;
  activeRoute: MobileRoute;
  activeRouteId: string;
  setActiveRouteId: (id: string) => void;
  previewRoute: MobileRoute | null;
  previewLocation: MobileLocationPreview | null;
  pendingSync: PendingSyncEntry[];
  lastSyncedAt: string | null;
  masteryMap: Record<string, 'got_it' | 'review'>;
  markMastery: (stopId: string, state: 'got_it' | 'review') => void;
  enterAsGuest: () => void;
  signInSuccess: (user: MobileUser, token: string) => Promise<void>;
  signOut: () => void;
  openAuthModal: (reason: string, onAuthed?: (tok: string) => Promise<void>) => void;
  closeAuthModal: () => void;
  requireToken: (reason: string, action: (tok: string) => Promise<void>) => Promise<boolean>;
  refreshWorkspace: (overrideToken?: string) => Promise<void>;
  lookupCode: (code: string) => Promise<{ ok: boolean; kind?: 'route' | 'location'; message: string }>;
  savePreviewRoute: () => Promise<{ ok: boolean; message: string }>;
  savePreviewLocation: () => Promise<{ ok: boolean; message: string }>;
  recordStopStatus: (
    stopId: string,
    status: DeliveryStatus,
    extra?: { notes?: string; nextVisitNote?: string; reason?: string },
  ) => void;
  syncNow: () => Promise<{ ok: boolean; message: string }>;
};

const AppContext = createContext<AppContextValue | null>(null);

async function cacheRoutesInWatermelon(routes: MobileRoute[]) {
  const db = getDatabase();
  if (!db) return;

  try {
    await db.write(async () => {
      for (const r of routes) {
        const existingRoutes = await db
          .get<Route>('routes')
          .query(Q.where('remote_id', r.id))
          .fetch();
        if (existingRoutes.length === 0) {
          await db.get<Route>('routes').create((rec) => {
            rec.remoteId = r.id;
            rec.name = r.name;
            rec.shareCode = r.shareCode;
            rec.versionId = r.versionId;
            rec.status = 'ACTIVE';
            rec.localSyncState = 'synced';
          });
        }

        for (const s of r.stops) {
          const existingLocs = await db
            .get<Location>('locations')
            .query(Q.where('remote_id', s.locationId))
            .fetch();
          if (existingLocs.length === 0) {
            await db.get<Location>('locations').create((loc) => {
              loc.remoteId = s.locationId;
              loc.name = s.name;
              loc.address = s.address;
              loc.latitude = s.latitude;
              loc.longitude = s.longitude;
              loc.shareCode = s.locationShareCode;
              loc.notes = s.notes;
              loc.nextVisitNote = s.nextVisitNote;
              loc.entranceInstructions = s.entranceInstructions;
              loc.photoUrl = s.photoUrl;
              loc.status = 'ACTIVE';
              loc.localSyncState = 'synced';
            });
          }

          const existingStops = await db
            .get<RouteStop>('route_stops')
            .query(Q.where('route_id', r.id), Q.where('location_id', s.locationId))
            .fetch();
          if (existingStops.length === 0) {
            await db.get<RouteStop>('route_stops').create((st) => {
              st.routeId = r.id;
              st.locationId = s.locationId;
              st.sequence = s.sequence;
              st.deliveryStatus = s.deliveryStatus ?? 'PENDING';
              st.itemsSummary = `${s.totalItems} items`;
              st.localSyncState = 'synced';
            });
          }
        }
      }
    });
  } catch (err) {
    console.warn('WatermelonDB cache skipped:', err);
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPromptReason, setAuthPromptReason] = useState<string | null>(null);
  const [pendingAfterAuth, setPendingAfterAuth] = useState<((tok: string) => Promise<void>) | null>(
    null,
  );

  const [routes, setRoutes] = useState<MobileRoute[]>([DEMO_ROUTE]);
  const [locations, setLocations] = useState<MobileLocation[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    myRoutesCount: 0,
    locationsCount: 0,
    deliveredCount: 0,
    savedSharedCount: 0,
    trainingRoundsCount: 0,
    openIssuesCount: 0,
  });
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDeliverySummary[]>([]);
  const [recordedRounds, setRecordedRounds] = useState<RecordedRoundSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFS);

  const [activeRouteId, setActiveRouteId] = useState<string>(DEMO_ROUTE.id);
  const [previewRoute, setPreviewRoute] = useState<MobileRoute | null>(null);
  const [previewLocation, setPreviewLocation] = useState<MobileLocationPreview | null>(null);
  const [pendingSync, setPendingSync] = useState<PendingSyncEntry[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [masteryMap, setMasteryMap] = useState<Record<string, 'got_it' | 'review'>>({});

  const refreshWorkspace = useCallback(
    async (overrideToken?: string) => {
      const tok = overrideToken ?? token;
      if (!tok) return;
      try {
        const res = await api.fetchWorkspace(apiUrl, tok);
        const list = res.routes.length > 0 ? res.routes : [DEMO_ROUTE];
        setRoutes(list);
        setLocations(res.locations);
        setDashboardStats(res.dashboardStats);
        setRecentDeliveries(res.recentDeliveries);
        setRecordedRounds(res.recordedRounds);
        setRuns(res.runs);
        setIssues(res.issues);
        setPreferences(res.preferences);
        setLastSyncedAt(res.syncedAt);
        setActiveRouteId((prev) => (list.some((r) => r.id === prev) ? prev : list[0].id));
        void cacheRoutesInWatermelon(list);
      } catch {
        // Offline or unreachable server — keep local state seamlessly.
      }
    },
    [apiUrl, token],
  );

  const enterAsGuest = useCallback(() => {
    setIsGuest(true);
    setUser(null);
    setToken(null);
  }, []);

  const signInSuccess = useCallback(
    async (nextUser: MobileUser, nextToken: string) => {
      setUser(nextUser);
      setToken(nextToken);
      setIsGuest(false);
      setShowAuthModal(false);
      setAuthPromptReason(null);

      if (pendingAfterAuth) {
        const fn = pendingAfterAuth;
        setPendingAfterAuth(null);
        await fn(nextToken);
      }
      await refreshWorkspace(nextToken);
    },
    [pendingAfterAuth, refreshWorkspace],
  );

  const signOut = useCallback(() => {
    setUser(null);
    setToken(null);
    setIsGuest(false);
    setRoutes([DEMO_ROUTE]);
    setLocations([]);
    setDashboardStats({
      myRoutesCount: 0,
      locationsCount: 0,
      deliveredCount: 0,
      savedSharedCount: 0,
      trainingRoundsCount: 0,
      openIssuesCount: 0,
    });
    setRecentDeliveries([]);
    setRecordedRounds([]);
    setRuns([]);
    setIssues([]);
    setActiveRouteId(DEMO_ROUTE.id);
    setPreviewRoute(null);
    setPreviewLocation(null);
  }, []);

  const openAuthModal = useCallback((reason: string, onAuthed?: (tok: string) => Promise<void>) => {
    setAuthPromptReason(reason);
    setPendingAfterAuth(() => onAuthed ?? null);
    setShowAuthModal(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
    setAuthPromptReason(null);
    setPendingAfterAuth(null);
  }, []);

  const requireToken = useCallback(
    async (reason: string, action: (tok: string) => Promise<void>) => {
      if (!token) {
        openAuthModal(reason, action);
        return false;
      }
      await action(token);
      return true;
    },
    [openAuthModal, token],
  );

  const lookupCode = useCallback(
    async (codeRaw: string) => {
      const cleaned = codeRaw.trim().toUpperCase();
      if (cleaned === 'DEMO2026') {
        setPreviewLocation(null);
        setPreviewRoute(DEMO_ROUTE);
        setActiveRouteId(DEMO_ROUTE.id);
        return { ok: true, kind: 'route' as const, message: 'Sample route loaded!' };
      }

      try {
        const res = await api.lookupShareCode(apiUrl, codeRaw);
        if (res.kind === 'route') {
          const loaded: MobileRoute = { ...res.route, isOwner: false };
          setPreviewLocation(null);
          setPreviewRoute(loaded);
          setRoutes((prev) => {
            const exists = prev.some((r) => r.id === loaded.id);
            return exists ? prev.map((r) => (r.id === loaded.id ? loaded : r)) : [loaded, ...prev];
          });
          setActiveRouteId(loaded.id);
          void cacheRoutesInWatermelon([loaded]);
          return { ok: true, kind: 'route' as const, message: `Loaded “${loaded.name}”` };
        }
        setPreviewRoute(null);
        setPreviewLocation(res.location);
        return {
          ok: true,
          kind: 'location' as const,
          message: `Found location “${res.location.name}”`,
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Could not load that code.',
        };
      }
    },
    [apiUrl],
  );

  const savePreviewRoute = useCallback(async () => {
    if (!previewRoute?.shareCode || previewRoute.isDemo) {
      return { ok: false, message: 'Open a shared route by code first to save it to your account.' };
    }
    const targetCode = previewRoute.shareCode;

    try {
      const ran = await requireToken(
        'Sign in to save this route to your account and keep your stops synced.',
        async (tok) => {
          await api.saveCodeToAccount(apiUrl, tok, targetCode);
          await refreshWorkspace(tok);
        },
      );
      if (!ran) return { ok: false, message: 'Please sign in to save this route.' };
      return { ok: true, message: `Saved “${previewRoute.name}” to your routes!` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Could not save route.' };
    }
  }, [apiUrl, previewRoute, refreshWorkspace, requireToken]);

  const savePreviewLocation = useCallback(async () => {
    if (!previewLocation?.shareCode) {
      return { ok: false, message: 'Open a shared location first.' };
    }
    const targetCode = previewLocation.shareCode;

    try {
      const ran = await requireToken(
        'Sign in to save this location to your personal address book.',
        async (tok) => {
          await api.saveCodeToAccount(apiUrl, tok, targetCode);
          await refreshWorkspace(tok);
        },
      );
      if (!ran) return { ok: false, message: 'Please sign in to save this location.' };
      return { ok: true, message: `Saved “${previewLocation.name}” to your locations!` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Could not save location.' };
    }
  }, [apiUrl, previewLocation, refreshWorkspace, requireToken]);

  const markMastery = useCallback((stopId: string, state: 'got_it' | 'review') => {
    setMasteryMap((prev) => ({ ...prev, [stopId]: state }));
  }, []);

  const recordStopStatus = useCallback(
    (
      stopId: string,
      status: DeliveryStatus,
      extra?: { notes?: string; nextVisitNote?: string; reason?: string },
    ) => {
      const targetRoute = routes.find((r) => r.id === activeRouteId) ?? routes[0];
      const stop = targetRoute?.stops.find((s) => s.id === stopId);

      setRoutes((prev) =>
        prev.map((r) =>
          r.id !== targetRoute?.id
            ? r
            : {
                ...r,
                stops: r.stops.map((s) =>
                  s.id === stopId
                    ? {
                        ...s,
                        deliveryStatus: status,
                        nextVisitNote: extra?.nextVisitNote ?? s.nextVisitNote,
                      }
                    : s,
                ),
              },
        ),
      );

      if (targetRoute && !targetRoute.isDemo && stop && status !== 'PENDING' && targetRoute.versionId) {
        const entry: PendingSyncEntry = {
          id: `${stop.id}-${Date.now()}`,
          routeId: targetRoute.id,
          routeVersionId: targetRoute.versionId,
          locationId: stop.locationId,
          subscriptionId: stop.items[0]?.subscriptionId,
          status,
          notes: extra?.notes,
          nextVisitNote: extra?.nextVisitNote,
          reason: extra?.reason,
          timestamp: new Date().toISOString(),
        };
        setPendingSync((prev) => [...prev.filter((e) => e.locationId !== stop.locationId), entry]);
      }
    },
    [activeRouteId, routes],
  );

  const syncNow = useCallback(async () => {
    try {
      const ran = await requireToken(
        'Sign in to sync your offline deliveries and pull saved routes.',
        async (tok) => {
          if (pendingSync.length > 0) {
            await api.pushSyncQueue(apiUrl, tok, pendingSync);
            setPendingSync([]);
          }
          await refreshWorkspace(tok);
        },
      );
      if (!ran) return { ok: false, message: 'Sign in required to sync with server.' };
      return { ok: true, message: 'All routes and deliveries synced.' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Sync failed — queued offline.' };
    }
  }, [apiUrl, pendingSync, refreshWorkspace, requireToken]);

  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? routes[0] ?? DEMO_ROUTE;

  return (
    <AppContext.Provider
      value={{
        apiUrl,
        setApiUrl,
        user,
        token,
        isGuest,
        showAuthModal,
        authPromptReason,
        routes,
        locations,
        dashboardStats,
        recentDeliveries,
        recordedRounds,
        runs,
        issues,
        preferences,
        activeRoute,
        activeRouteId,
        setActiveRouteId,
        previewRoute,
        previewLocation,
        pendingSync,
        lastSyncedAt,
        masteryMap,
        markMastery,
        enterAsGuest,
        signInSuccess,
        signOut,
        openAuthModal,
        closeAuthModal,
        requireToken,
        refreshWorkspace,
        lookupCode,
        savePreviewRoute,
        savePreviewLocation,
        recordStopStatus,
        syncNow,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
