import type {
  ActiveRecordingSession,
  DashboardStats,
  IssueSummary,
  MobileLocation,
  MobileLocationPreview,
  MobileRoute,
  MobileUser,
  ParsedLinkRow,
  PendingSyncEntry,
  RecentDeliverySummary,
  RecordedRoundSummary,
  RunSummary,
  UserPreferences,
} from './types';

function cleanBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function loginOrSignUp(
  baseUrl: string,
  payload: {
    mode: 'login' | 'signup';
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  },
): Promise<{ token: string; user: MobileUser }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export type CodeLookupResponse =
  | { kind: 'route'; code: string; route: Omit<MobileRoute, 'isOwner'> }
  | { kind: 'location'; code: string; location: MobileLocationPreview };

export async function lookupShareCode(
  baseUrl: string,
  codeInput: string,
): Promise<CodeLookupResponse> {
  const cleaned = codeInput
    .trim()
    .replace(/^https?:\/\/[^/]+\/share\//i, '')
    .replace(/[\s-]+/g, '')
    .toUpperCase();
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/share/${encodeURIComponent(cleaned)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return parseJson(res);
}

export type WorkspaceSyncPayload = {
  routes: MobileRoute[];
  locations: MobileLocation[];
  dashboardStats: DashboardStats;
  recentDeliveries: RecentDeliverySummary[];
  recordedRounds: RecordedRoundSummary[];
  runs: RunSummary[];
  issues: IssueSummary[];
  preferences: UserPreferences;
  syncedAt: string;
};

export async function fetchWorkspace(baseUrl: string, token: string): Promise<WorkspaceSyncPayload> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/routes`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function saveCodeToAccount(
  baseUrl: string,
  token: string,
  code: string,
): Promise<{ ok: true; kind: 'route' | 'location'; id: string; name: string }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/routes/save`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ code }),
  });
  return parseJson(res);
}

export async function createRouteFromLocationsApi(
  baseUrl: string,
  token: string,
  payload: {
    name: string;
    locationIds: string[];
    startName?: string;
    startLatitude?: number;
    startLongitude?: number;
    endSameAsStart?: boolean;
  },
): Promise<{ ok: true; id: string; name: string; shareCode: string }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/routes`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function parseLinksApi(
  baseUrl: string,
  token: string,
  links: string,
): Promise<{ rows: ParsedLinkRow[] }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/routes/from-links`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ action: 'parse', links }),
  });
  return parseJson(res);
}

export async function createRouteFromLinksApi(
  baseUrl: string,
  token: string,
  payload: {
    routeName: string;
    stops: { name: string; lat: number; lng: number; type: string; quantity: number }[];
    startLatitude?: number;
    startLongitude?: number;
  },
): Promise<{ ok: true; id: string; name: string; shareCode: string }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/routes/from-links`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ action: 'create', ...payload }),
  });
  return parseJson(res);
}

export async function editRouteApi(
  baseUrl: string,
  token: string,
  routeId: string,
  payload: {
    action: 'rename' | 'add_link' | 'add_code' | 'add_location' | 'remove_stop' | 'reoptimise';
    name?: string;
    link?: string;
    code?: string;
    locationId?: string;
    stopId?: string;
    productType?: string;
    quantity?: number;
  },
) {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/routes/${encodeURIComponent(routeId)}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function createLocationApi(
  baseUrl: string,
  token: string,
  payload: {
    name: string;
    address?: string;
    link?: string;
    latitude?: number;
    longitude?: number;
    floor?: string;
    unit?: string;
    notes?: string;
    entranceInstructions?: string;
    securityInstructions?: string;
    productType?: string;
    quantity?: number;
    confirmDuplicate?: boolean;
  },
): Promise<{ ok: true; id: string; name: string; shareCode: string }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/locations`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function updateLocationStatusApi(
  baseUrl: string,
  token: string,
  id: string,
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'CANCELLED',
) {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/locations`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ id, status }),
  });
  return parseJson(res);
}

export async function fetchActiveRecordingApi(
  baseUrl: string,
  token: string,
): Promise<{ session: ActiveRecordingSession | null }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/record`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function recordActionApi(
  baseUrl: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<{
  ok?: boolean;
  session?: ActiveRecordingSession;
  routeId?: string;
  routeName?: string;
  shareCode?: string;
}> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/record`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function pushSyncQueue(
  baseUrl: string,
  token: string,
  entries: PendingSyncEntry[],
): Promise<{ synced: number }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/runs/sync`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ entries }),
  });
  return parseJson(res);
}

export async function saveSettingsApi(
  baseUrl: string,
  token: string,
  payload: Partial<UserPreferences> & { firstName?: string; lastName?: string },
) {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/settings`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function submitContactApi(
  baseUrl: string,
  token: string | null,
  payload: { name: string; email: string; topic: string; subject: string; message: string },
): Promise<{ ok: true; ticketId: string }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/settings`, {
    method: 'PUT',
    headers: token
      ? authHeaders(token)
      : { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function issueActionApi(
  baseUrl: string,
  token: string,
  payload: { action: 'create' | 'resolve'; issueId?: string; locationId?: string; category?: string; description?: string },
) {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/issues`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function checkApkRelease(baseUrl: string): Promise<{
  available: boolean;
  version: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
}> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/app-release`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return parseJson(res);
}

export async function duplicateRouteApi(
  baseUrl: string,
  token: string,
  payload: { routeId?: string; shareCode?: string; name?: string },
): Promise<{ ok: true; id: string; name: string; shareCode: string }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/routes/duplicate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function unsaveRouteApi(baseUrl: string, token: string, routeId: string) {
  const res = await fetch(
    `${cleanBaseUrl(baseUrl)}/api/mobile/routes/save?routeId=${encodeURIComponent(routeId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
  );
  return parseJson(res);
}

export async function editLocationApi(
  baseUrl: string,
  token: string,
  payload: {
    id: string;
    name?: string;
    address?: string;
    entranceInstructions?: string;
    notes?: string;
    nextVisitNote?: string;
  },
) {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/locations`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function importLocationsCsvApi(
  baseUrl: string,
  token: string,
  csvText: string,
): Promise<{ ok: true; imported: number }> {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/locations`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ importCsv: true, csvText }),
  });
  return parseJson(res);
}

export async function changePasswordApi(
  baseUrl: string,
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  const res = await fetch(`${cleanBaseUrl(baseUrl)}/api/mobile/auth`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return parseJson(res);
}
