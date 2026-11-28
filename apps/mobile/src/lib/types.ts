export type MobileUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type StopItem = {
  subscriptionId: string;
  customer: string | null;
  productType: string;
  quantity: number;
  specialInstructions: string | null;
};

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

export type MobileStop = {
  id: string;
  routeVersionId: string | null;
  locationId: string;
  locationShareCode: string | null;
  sequence: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  floor: string | null;
  unit: string | null;
  notes: string | null;
  nextVisitNote: string | null;
  entranceInstructions: string | null;
  securityInstructions: string | null;
  photoUrl: string | null;
  totalItems: number;
  items: StopItem[];
  deliveryStatus?: DeliveryStatus;
};

export type MobileRoute = {
  id: string;
  name: string;
  shareCode: string | null;
  isOwner: boolean;
  isDemo?: boolean;
  creatorName: string;
  versionId: string | null;
  totalDistance: number | null;
  estimatedDuration: number | null;
  routeGeometry?: number[][] | null;
  startPoint?: { name: string; latitude: number; longitude: number } | null;
  endPoint?: { name: string; latitude: number; longitude: number } | null;
  stops: MobileStop[];
};

export type MobileLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  status: string;
  shareCode: string | null;
  floor: string | null;
  unit: string | null;
  notes: string | null;
  nextVisitNote: string | null;
  entranceInstructions: string | null;
  securityInstructions: string | null;
  activeItems: number;
  subscriptions: { id: string; productType: string; quantity: number }[];
};

export type MobileLocationPreview = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  shareCode: string;
  creatorName: string;
  floor: string | null;
  unit: string | null;
  notes: string | null;
  nextVisitNote: string | null;
  entranceInstructions: string | null;
  securityInstructions: string | null;
  photoUrl: string | null;
  totalItems: number;
  items: StopItem[];
};

export type DashboardStats = {
  myRoutesCount: number;
  locationsCount: number;
  deliveredCount: number;
  savedSharedCount: number;
  trainingRoundsCount: number;
  openIssuesCount: number;
};

export type RecentDeliverySummary = {
  id: string;
  locationName: string;
  customer: string | null;
  productType: string;
  quantity: number;
  status: string;
  timestamp: string;
};

export type RecordedRoundSummary = {
  id: string;
  routeName: string;
  status: string;
  checkpointCount: number;
  generatedRouteId: string | null;
  startedAt: string;
};

export type RunSummary = {
  id: string;
  routeId: string;
  routeName: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalStops: number;
  delivered: number;
  skipped: number;
  failed: number;
};

export type IssueSummary = {
  id: string;
  category: string | null;
  description: string;
  status: string;
  createdAt: string;
};

export type UserPreferences = {
  geofenceMetres: number;
  checkpointTypes: string[];
  defaultStartName: string;
  defaultStartLat: number;
  defaultStartLng: number;
  memorizeQuizDefault: boolean;
  memorizeAutoAdvance: boolean;
  showBagReminder: boolean;
  distanceUnit: 'metric' | 'imperial';
};

export type ParsedLinkRow = {
  raw: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  error: string | null;
};

export type RecordingCheckpoint = {
  id: string;
  sequence: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  deliveryType: string | null;
  quantity: number | null;
  notes: string | null;
  nextVisitNote: string | null;
  entranceInstructions: string | null;
};

export type ActiveRecordingSession = {
  id: string;
  routeName: string;
  status: string;
  checkpoints: RecordingCheckpoint[];
};

export type PendingSyncEntry = {
  id: string;
  routeId: string;
  routeVersionId: string;
  locationId: string;
  subscriptionId?: string;
  status: 'DELIVERED' | 'FAILED' | 'SKIPPED';
  notes?: string;
  nextVisitNote?: string;
  reason?: string;
  recordedDistance?: number | null;
  timestamp: string;
};
