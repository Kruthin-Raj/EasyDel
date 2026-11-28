import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { CircleDot, MapPin, Plus, StopCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { fetchActiveRecordingApi, recordActionApi } from '../lib/api';
import type { ActiveRecordingSession } from '../lib/types';
import { COLORS } from '../theme';

export default function RecordScreen() {
  const nav = useNavigation<{ navigate: (name: string) => void }>();
  const { apiUrl, token, preferences, requireToken, refreshWorkspace, setActiveRouteId } = useApp();

  const [session, setSession] = useState<ActiveRecordingSession | null>(null);
  const [routeName, setRouteName] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(String(preferences.defaultStartLat));
  const [lng, setLng] = useState(String(preferences.defaultStartLng));
  const [deliveryType, setDeliveryType] = useState(preferences.checkpointTypes[0] || 'Newspaper');
  const [quantity, setQuantity] = useState('1');
  const [entrance, setEntrance] = useState('');
  const [notes, setNotes] = useState('');
  const [nextVisitNote, setNextVisitNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void fetchActiveRecordingApi(apiUrl, token)
      .then((res) => {
        if (res.session) setSession(res.session);
      })
      .catch(() => {});
  }, [apiUrl, token]);

  async function captureGps() {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setStatusMsg('Location permission denied — enter coordinates manually.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
      setStatusMsg('GPS updated.');
    } catch {
      setStatusMsg('GPS unavailable here — adjust coordinates if needed.');
    }
  }

  async function startSession() {
    setLoading(true);
    setStatusMsg(null);
    try {
      await requireToken('Sign in to start recording a new delivery route.', async (tok) => {
        const res = await recordActionApi(apiUrl, tok, {
          action: 'start',
          routeName: routeName.trim() || 'Recorded Round',
          latitude: Number(lat),
          longitude: Number(lng),
        });
        if (res.session) setSession(res.session);
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not start recording.');
    } finally {
      setLoading(false);
    }
  }

  async function addCheckpoint() {
    if (!session) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      await requireToken('Sign in to save houses while recording.', async (tok) => {
        const res = await recordActionApi(apiUrl, tok, {
          action: 'checkpoint',
          sessionId: session.id,
          name,
          address,
          latitude: Number(lat),
          longitude: Number(lng),
          deliveryType,
          quantity: Number(quantity) || 1,
          entranceInstructions: entrance,
          notes,
          nextVisitNote,
        });
        if (res.session) setSession(res.session);
        setName('');
        setAddress('');
        setEntrance('');
        setNotes('');
        setNextVisitNote('');
        setStatusMsg('House saved!');
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not save house.');
    } finally {
      setLoading(false);
    }
  }

  async function finishSession() {
    if (!session) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      await requireToken('Sign in to generate your route.', async (tok) => {
        const res = await recordActionApi(apiUrl, tok, {
          action: 'finish',
          sessionId: session.id,
        });
        setSession(null);
        setRouteName('');
        await refreshWorkspace(tok);
        if (res.routeId) setActiveRouteId(res.routeId);
        setStatusMsg(
          `Created "${res.routeName ?? 'Route'}"! Share code: ${res.shareCode ?? ''}`,
        );
        nav.navigate('Routes');
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not finish recording.');
    } finally {
      setLoading(false);
    }
  }

  async function abandonSession() {
    if (!session || !token) return;
    await recordActionApi(apiUrl, token, { action: 'abandon', sessionId: session.id }).catch(() => {});
    setSession(null);
    setStatusMsg('Recording discarded.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Record route</Text>
        <Text style={styles.sub}>Log each house, drop notes, and GPS as you move.</Text>

        {statusMsg ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{statusMsg}</Text>
          </View>
        ) : null}

        {!session ? (
          <View style={styles.card}>
            <Text style={styles.label}>Route / round name</Text>
            <TextInput
              style={styles.input}
              placeholder="Morning Beat - Ward 4"
              placeholderTextColor={COLORS.inkFaint}
              value={routeName}
              onChangeText={setRouteName}
            />

            <TouchableOpacity style={styles.gpsBtn} onPress={captureGps}>
              <MapPin color={COLORS.info} size={14} />
              <Text style={styles.gpsBtnText}>Use current GPS ({lat}, {lng})</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={startSession} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={COLORS.accentInk} />
              ) : (
                <>
                  <CircleDot color={COLORS.accentInk} size={16} />
                  <Text style={styles.primaryBtnText}>Start recording</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.activeCard}>
              <Text style={styles.eyebrow}>RECORDING IN PROGRESS</Text>
              <Text style={styles.activeTitle}>{session.routeName}</Text>
              <Text style={styles.sub}>
                {session.checkpoints.length} stop{session.checkpoints.length === 1 ? '' : 's'} logged
              </Text>

              <View style={styles.finishRow}>
                <TouchableOpacity
                  style={styles.finishBtn}
                  onPress={finishSession}
                  disabled={loading}
                >
                  <StopCircle color={COLORS.accentInk} size={15} />
                  <Text style={styles.finishBtnText}>Finish &amp; Create Route</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.abandonBtn} onPress={abandonSession}>
                  <Text style={styles.abandonText}>Discard</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Log house checkpoint</Text>

              <TouchableOpacity style={styles.gpsBtn} onPress={captureGps}>
                <MapPin color={COLORS.info} size={14} />
                <Text style={styles.gpsBtnText}>Refresh GPS coordinates</Text>
              </TouchableOpacity>

              <View style={styles.row2}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={lat}
                  onChangeText={setLat}
                  keyboardType="numeric"
                  placeholder="Lat"
                  placeholderTextColor={COLORS.inkFaint}
                />
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={lng}
                  onChangeText={setLng}
                  keyboardType="numeric"
                  placeholder="Lng"
                  placeholderTextColor={COLORS.inkFaint}
                />
              </View>

              <Text style={styles.label}>House / Building name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Green Villa / Block B"
                placeholderTextColor={COLORS.inkFaint}
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Address</Text>
              <TextInput
                style={styles.input}
                placeholder="12 Tilak Rd"
                placeholderTextColor={COLORS.inkFaint}
                value={address}
                onChangeText={setAddress}
              />

              <View style={styles.row2}>
                <View style={styles.flex}>
                  <Text style={styles.label}>Item</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryType}
                    onChangeText={setDeliveryType}
                  />
                </View>
                <View style={{ width: 70 }}>
                  <Text style={styles.label}>Qty</Text>
                  <TextInput
                    style={styles.input}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <Text style={styles.label}>Entrance / gate clue</Text>
              <TextInput
                style={styles.input}
                placeholder="Side gate unlocked before 7 AM"
                placeholderTextColor={COLORS.inkFaint}
                value={entrance}
                onChangeText={setEntrance}
              />

              <Text style={styles.label}>Drop notes</Text>
              <TextInput
                style={styles.input}
                placeholder="Leave inside blue letterbox"
                placeholderTextColor={COLORS.inkFaint}
                value={notes}
                onChangeText={setNotes}
              />

              <Text style={styles.label}>Reminder for next visit</Text>
              <TextInput
                style={styles.input}
                placeholder="Collect Sunday supplement"
                placeholderTextColor={COLORS.inkFaint}
                value={nextVisitNote}
                onChangeText={setNextVisitNote}
              />

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={addCheckpoint}
                disabled={loading}
              >
                <Plus color={COLORS.accentInk} size={16} />
                <Text style={styles.primaryBtnText}>Save checkpoint</Text>
              </TouchableOpacity>
            </View>

            {session.checkpoints.map((cp) => (
              <View key={cp.id} style={styles.cpCard}>
                <Text style={styles.cpTitle}>
                  #{cp.sequence} · {cp.name}
                </Text>
                <Text style={styles.sub}>
                  {cp.deliveryType ?? 'Item'} ×{cp.quantity ?? 1} · {cp.address}
                </Text>
                {cp.entranceInstructions ? (
                  <Text style={styles.cpNote}>Entrance: {cp.entranceInstructions}</Text>
                ) : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.ink },
  sub: { fontSize: 12, color: COLORS.inkDim, marginTop: 2, marginBottom: 12 },
  banner: { backgroundColor: COLORS.infoSoft, borderRadius: 10, padding: 10, marginBottom: 12 },
  bannerText: { fontSize: 13, color: COLORS.ink },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.ink, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim, marginBottom: 5, marginTop: 6 },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
    color: COLORS.ink,
    marginBottom: 6,
  },
  row2: { flexDirection: 'row', gap: 8 },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  gpsBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.info },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 10,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
  activeCard: {
    backgroundColor: COLORS.panel2,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    padding: 15,
    marginBottom: 14,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  activeTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink, marginTop: 2 },
  finishRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  finishBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.ok,
    borderRadius: 9,
    paddingVertical: 11,
  },
  finishBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.accentInk },
  abandonBtn: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  abandonText: { fontSize: 12, fontWeight: '600', color: COLORS.bad },
  cpCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 8,
  },
  cpTitle: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  cpNote: { fontSize: 12, color: COLORS.accent, marginTop: 3 },
});
