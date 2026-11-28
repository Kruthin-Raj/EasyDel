import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { ExternalLink, MapPin } from 'lucide-react-native';
import OsmRouteMap, { type OsmStopPin } from '../components/OsmRouteMap';
import { useApp } from '../context/AppContext';
import { COLORS } from '../theme';

export default function RouteMapScreen() {
  const { activeRoute, apiUrl } = useApp();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState('Checking GPS…');
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [leg, setLeg] = useState<{
    coordinates: number[][] | null;
    distance: number | null;
    duration: number | null;
  }>({ coordinates: null, distance: null, duration: null });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (perm.status !== 'granted') {
          setGpsStatus('Location permission not granted');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        if (!active) return;
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus('GPS locked');
      } catch {
        if (active) setGpsStatus('GPS unavailable on simulator');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const defaultNext =
    activeRoute.stops.find((s) => s.deliveryStatus !== 'DELIVERED') ?? activeRoute.stops[0] ?? null;

  const focusStop =
    activeRoute.stops.find((s) => s.id === selectedStopId) ?? defaultNext;

  // Query live OSRM leg road path from current GPS (or route start) to the focus stop.
  useEffect(() => {
    if (!focusStop) return;
    const fromLat = coords?.lat ?? activeRoute.startPoint?.latitude;
    const fromLng = coords?.lng ?? activeRoute.startPoint?.longitude;
    if (fromLat == null || fromLng == null) return;

    let cancelled = false;
    const base = apiUrl.trim().replace(/\/$/, '');
    const qs = `fromLat=${fromLat}&fromLng=${fromLng}&toLat=${focusStop.latitude}&toLng=${focusStop.longitude}`;
    fetch(`${base}/api/mobile/osrm-leg?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setLeg({
            coordinates: Array.isArray(data.coordinates) ? data.coordinates : null,
            distance: typeof data.distance === 'number' ? data.distance : null,
            duration: typeof data.duration === 'number' ? data.duration : null,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiUrl, coords?.lat, coords?.lng, focusStop, activeRoute.startPoint?.latitude, activeRoute.startPoint?.longitude]);

  const pins: OsmStopPin[] = useMemo(
    () =>
      activeRoute.stops.map((stop) => ({
        id: stop.id,
        sequence: stop.sequence,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        state:
          stop.id === focusStop?.id
            ? 'current'
            : stop.deliveryStatus === 'DELIVERED'
              ? 'completed'
              : stop.deliveryStatus === 'FAILED'
                ? 'failed'
                : 'remaining',
      })),
    [activeRoute.stops, focusStop?.id],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <OsmRouteMap
          stops={pins}
          routeGeometry={activeRoute.routeGeometry ?? null}
          activeLegGeometry={leg.coordinates}
          driverCoords={coords}
          startPoint={activeRoute.startPoint ?? null}
          endPoint={activeRoute.endPoint ?? null}
          height={330}
        />

        <View style={styles.gpsCard}>
          <MapPin color={COLORS.accent} size={18} />
          <View style={styles.flex}>
            <Text style={styles.gpsTitle}>{gpsStatus}</Text>
            <Text style={styles.gpsSub}>
              {coords
                ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                : 'Showing OpenStreetMap + OSRM road route across stops.'}
            </Text>
          </View>
        </View>

        {focusStop ? (
          <View style={styles.nextCard}>
            <Text style={styles.eyebrow}>
              FOCUS STOP · #{focusStop.sequence} · MAPLIBRE + OSRM
            </Text>
            <Text style={styles.nextName}>{focusStop.name}</Text>
            <Text style={styles.nextAddr}>{focusStop.address}</Text>
            {leg.distance != null ? (
              <Text style={styles.legMeta}>
                OSRM road distance:{' '}
                {leg.distance >= 1000
                  ? `${(leg.distance / 1000).toFixed(1)} km`
                  : `${Math.round(leg.distance)} m`}
                {leg.duration != null ? ` · ~${Math.max(1, Math.round(leg.duration / 60))} min` : ''}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.secondaryHandoffBtn}
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${focusStop.latitude},${focusStop.longitude}`,
                )
              }
              activeOpacity={0.85}
            >
              <ExternalLink color={COLORS.inkDim} size={14} />
              <Text style={styles.secondaryHandoffText}>
                Optional external handoff: Google Maps
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>
          Tap a stop to focus on OSM + OSRM map ({activeRoute.stops.length})
        </Text>
        <View style={styles.timeline}>
          {activeRoute.stops.map((stop) => {
            const done = stop.deliveryStatus === 'DELIVERED';
            const isFocus = stop.id === focusStop?.id;
            return (
              <TouchableOpacity
                key={stop.id}
                style={[styles.stopRow, isFocus && styles.stopRowFocus]}
                onPress={() => setSelectedStopId(stop.id)}
              >
                <View style={[styles.seqBadge, done && styles.seqDone, isFocus && styles.seqFocus]}>
                  <Text style={[styles.seqText, isFocus && styles.seqTextFocus]}>{stop.sequence}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.stopName}>{stop.name}</Text>
                  <Text style={styles.stopAddr}>{stop.address}</Text>
                </View>
                <MapPin color={isFocus ? COLORS.accent : COLORS.inkFaint} size={15} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  gpsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  gpsTitle: { fontSize: 13, fontWeight: '700', color: COLORS.ink },
  gpsSub: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  nextCard: {
    backgroundColor: COLORS.panel2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    padding: 16,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  nextName: { fontSize: 20, fontWeight: '800', color: COLORS.ink, marginTop: 4 },
  nextAddr: { fontSize: 13, color: COLORS.inkDim, marginTop: 2 },
  legMeta: { fontSize: 12, fontWeight: '600', color: COLORS.info, marginTop: 6 },
  secondaryHandoffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    paddingVertical: 9,
    marginTop: 12,
  },
  secondaryHandoffText: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.inkDim,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  timeline: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stopRowFocus: {
    backgroundColor: COLORS.panel2,
  },
  seqBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seqDone: { backgroundColor: COLORS.okSoft, borderColor: COLORS.ok },
  seqFocus: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  seqText: { fontSize: 12, fontWeight: '700', color: COLORS.ink },
  seqTextFocus: { color: COLORS.accentInk },
  stopName: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  stopAddr: { fontSize: 12, color: COLORS.inkDim, marginTop: 1 },
});
