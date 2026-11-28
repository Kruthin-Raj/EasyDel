import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { Link2, CheckCircle2 } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { createRouteFromLinksApi, parseLinksApi } from '../lib/api';
import type { ParsedLinkRow } from '../lib/types';
import { COLORS } from '../theme';

type EditableStop = {
  key: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  quantity: string;
};

export default function FromLinksScreen() {
  const nav = useNavigation<{ goBack: () => void; navigate: (name: string) => void }>();
  const { apiUrl, requireToken, refreshWorkspace, setActiveRouteId, preferences } = useApp();

  const [linksText, setLinksText] = useState('');
  const [routeName, setRouteName] = useState('');
  const [parsedStops, setParsedStops] = useState<EditableStop[]>([]);
  const [errors, setErrors] = useState<ParsedLinkRow[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleParse() {
    setStatusMsg(null);
    setLoading(true);
    try {
      await requireToken('Sign in to parse and save routes from map links.', async (tok) => {
        const res = await parseLinksApi(apiUrl, tok, linksText);
        const valid: EditableStop[] = [];
        const failed: ParsedLinkRow[] = [];
        res.rows.forEach((r, idx) => {
          if (r.latitude !== null && r.longitude !== null) {
            valid.push({
              key: `${idx}-${r.latitude}-${r.longitude}`,
              name: r.name || `Stop ${valid.length + 1}`,
              lat: r.latitude,
              lng: r.longitude,
              type: preferences.checkpointTypes[0] || 'Newspaper',
              quantity: '1',
            });
          } else {
            failed.push(r);
          }
        });
        setParsedStops(valid);
        setErrors(failed);
        setStatusMsg(`Recognised ${valid.length} stop(s)${failed.length ? `, ${failed.length} skipped` : ''}.`);
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to parse links.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setStatusMsg(null);
    setLoading(true);
    try {
      await requireToken('Sign in to save your new route.', async (tok) => {
        const res = await createRouteFromLinksApi(apiUrl, tok, {
          routeName: routeName.trim() || 'Morning Map Route',
          stops: parsedStops.map((s) => ({
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            type: s.type,
            quantity: Number(s.quantity) || 1,
          })),
          startLatitude: preferences.defaultStartLat,
          startLongitude: preferences.defaultStartLng,
        });
        await refreshWorkspace(tok);
        setActiveRouteId(res.id);
        nav.navigate('Main');
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not build route.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.headRow}>
            <Link2 color={COLORS.info} size={18} />
            <Text style={styles.title}>Build route from Maps links</Text>
          </View>
          <Text style={styles.sub}>
            Paste Google Maps links or lat, lng coordinates (one per line).
          </Text>

          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={5}
            placeholder={'https://maps.app.goo.gl/...\n13.6288, 79.4192'}
            placeholderTextColor={COLORS.inkFaint}
            value={linksText}
            onChangeText={setLinksText}
          />

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleParse}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.accentInk} />
            ) : (
              <Text style={styles.primaryBtnText}>Preview stops</Text>
            )}
          </TouchableOpacity>

          {statusMsg ? <Text style={styles.status}>{statusMsg}</Text> : null}
        </View>

        {errors.length > 0 ? (
          <View style={styles.errCard}>
            {errors.map((e, idx) => (
              <Text key={idx} style={styles.errText}>
                Skipped: {e.raw} ({e.error ?? 'unreadable'})
              </Text>
            ))}
          </View>
        ) : null}

        {parsedStops.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.label}>Route name</Text>
            <TextInput
              style={styles.input}
              placeholder="Morning Paper Beat 01"
              placeholderTextColor={COLORS.inkFaint}
              value={routeName}
              onChangeText={setRouteName}
            />

            {parsedStops.map((stop, idx) => (
              <View key={stop.key} style={styles.stopRow}>
                <CheckCircle2 color={COLORS.ok} size={16} />
                <View style={styles.flex}>
                  <TextInput
                    style={styles.stopNameInput}
                    value={stop.name}
                    onChangeText={(val) =>
                      setParsedStops((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, name: val } : p)),
                      )
                    }
                  />
                  <Text style={styles.coords}>
                    {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
                  </Text>
                </View>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="number-pad"
                  value={stop.quantity}
                  onChangeText={(val) =>
                    setParsedStops((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, quantity: val } : p)),
                    )
                  }
                />
              </View>
            ))}

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 14 }]}
              onPress={handleCreate}
              disabled={loading}
            >
              <Text style={styles.primaryBtnText}>Create &amp; Optimise Route</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  sub: { fontSize: 12, color: COLORS.inkDim, marginTop: 4, marginBottom: 12 },
  textarea: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    padding: 12,
    minHeight: 110,
    fontSize: 13,
    color: COLORS.ink,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
  status: { fontSize: 12, color: COLORS.accent, marginTop: 10 },
  errCard: {
    backgroundColor: COLORS.badSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errText: { fontSize: 12, color: COLORS.ink },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.ink,
    marginBottom: 12,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stopNameInput: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.ink,
    paddingVertical: 2,
  },
  coords: { fontSize: 11, color: COLORS.inkFaint },
  qtyInput: {
    width: 46,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 8,
    paddingVertical: 6,
    textAlign: 'center',
    color: COLORS.ink,
    fontWeight: '700',
  },
});
