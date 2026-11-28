import React, { useEffect, useState } from 'react';
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
import { MapPin, Navigation } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { COLORS } from '../theme';

export default function RouteMapScreen() {
  const { activeRoute } = useApp();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState('Checking GPS…');

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

  const nextStop =
    activeRoute.stops.find((s) => s.deliveryStatus !== 'DELIVERED') ?? activeRoute.stops[0];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.gpsCard}>
          <MapPin color={COLORS.accent} size={18} />
          <View style={styles.flex}>
            <Text style={styles.gpsTitle}>{gpsStatus}</Text>
            <Text style={styles.gpsSub}>
              {coords
                ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                : 'Tap any stop below to launch turn-by-turn navigation.'}
            </Text>
          </View>
        </View>

        {nextStop ? (
          <View style={styles.nextCard}>
            <Text style={styles.eyebrow}>NEXT STOP · #{nextStop.sequence}</Text>
            <Text style={styles.nextName}>{nextStop.name}</Text>
            <Text style={styles.nextAddr}>{nextStop.address}</Text>
            <TouchableOpacity
              style={styles.mapsBtn}
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${nextStop.latitude},${nextStop.longitude}`,
                )
              }
              activeOpacity={0.85}
            >
              <Navigation color={COLORS.accentInk} size={16} />
              <Text style={styles.mapsBtnText}>Open turn-by-turn in Maps</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Stop sequence ({activeRoute.stops.length})</Text>
        <View style={styles.timeline}>
          {activeRoute.stops.map((stop) => {
            const done = stop.deliveryStatus === 'DELIVERED';
            return (
              <TouchableOpacity
                key={stop.id}
                style={styles.stopRow}
                onPress={() =>
                  void Linking.openURL(
                    `https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`,
                  )
                }
              >
                <View style={[styles.seqBadge, done && styles.seqDone]}>
                  <Text style={styles.seqText}>{stop.sequence}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.stopName}>{stop.name}</Text>
                  <Text style={styles.stopAddr}>{stop.address}</Text>
                </View>
                <Navigation color={COLORS.inkFaint} size={15} />
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
  scroll: { padding: 16, paddingBottom: 32 },
  gpsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 14,
  },
  gpsTitle: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  gpsSub: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  nextCard: {
    backgroundColor: COLORS.panel2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    padding: 16,
    marginBottom: 18,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  nextName: { fontSize: 20, fontWeight: '800', color: COLORS.ink, marginTop: 4 },
  nextAddr: { fontSize: 13, color: COLORS.inkDim, marginTop: 2 },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  mapsBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkDim,
    textTransform: 'uppercase',
    marginBottom: 10,
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
  seqText: { fontSize: 12, fontWeight: '700', color: COLORS.ink },
  stopName: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  stopAddr: { fontSize: 12, color: COLORS.inkDim, marginTop: 1 },
});
