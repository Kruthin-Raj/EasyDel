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
import { useRoute } from '@react-navigation/native';
import { Shuffle, Trash2 } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { editRouteApi } from '../lib/api';
import { COLORS } from '../theme';

export default function EditRouteScreen() {
  const navRoute = useRoute<{ key: string; name: string; params?: { routeId?: string } }>();
  const { apiUrl, routes, locations, requireToken, refreshWorkspace } = useApp();

  const routeObj = routes.find((r) => r.id === navRoute.params?.routeId) ?? routes[0];
  const [nameDraft, setNameDraft] = useState(routeObj?.name ?? '');
  const [tab, setTab] = useState<'link' | 'code' | 'saved'>('link');
  const [linkInput, setLinkInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!routeObj) return null;

  const stopLocIds = new Set(routeObj.stops.map((s) => s.locationId));
  const availableLocs = locations.filter((l) => l.status === 'ACTIVE' && !stopLocIds.has(l.id));

  async function runEdit(payload: Parameters<typeof editRouteApi>[3], okLabel: string) {
    setLoading(true);
    setStatusMsg(null);
    try {
      await requireToken('Sign in to edit this route.', async (tok) => {
        await editRouteApi(apiUrl, tok, routeObj.id, payload);
        await refreshWorkspace(tok);
        setStatusMsg(okLabel);
        setLinkInput('');
        setCodeInput('');
      });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {statusMsg ? (
          <View style={styles.msgBox}>
            <Text style={styles.msgText}>{statusMsg}</Text>
          </View>
        ) : null}

        {/* Rename */}
        <View style={styles.card}>
          <Text style={styles.label}>Route name</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={nameDraft}
              onChangeText={setNameDraft}
            />
            <TouchableOpacity
              style={styles.priSmall}
              onPress={() => void runEdit({ action: 'rename', name: nameDraft }, 'Name saved.')}
            >
              <Text style={styles.priSmallText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Add Stop */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add stop</Text>
          <View style={styles.tabs}>
            {(
              [
                ['link', 'Map link'],
                ['code', 'By code'],
                ['saved', 'Saved'],
              ] as const
            ).map(([k, label]) => (
              <TouchableOpacity
                key={k}
                style={[styles.tabBtn, tab === k && styles.tabBtnActive]}
                onPress={() => setTab(k)}
              >
                <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'link' ? (
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="Maps link or lat, lng"
                placeholderTextColor={COLORS.inkFaint}
                value={linkInput}
                onChangeText={setLinkInput}
              />
              <TouchableOpacity
                style={styles.priSmall}
                disabled={loading}
                onPress={() => void runEdit({ action: 'add_link', link: linkInput }, 'Stop added!')}
              >
                <Text style={styles.priSmallText}>Add</Text>
              </TouchableOpacity>
            </View>
          ) : tab === 'code' ? (
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="8-letter location code"
                placeholderTextColor={COLORS.inkFaint}
                autoCapitalize="characters"
                value={codeInput}
                onChangeText={setCodeInput}
              />
              <TouchableOpacity
                style={styles.priSmall}
                disabled={loading}
                onPress={() => void runEdit({ action: 'add_code', code: codeInput }, 'Added from code!')}
              >
                <Text style={styles.priSmallText}>Add</Text>
              </TouchableOpacity>
            </View>
          ) : availableLocs.length === 0 ? (
            <Text style={styles.sub}>All active locations are already on this route.</Text>
          ) : (
            availableLocs.map((loc) => (
              <TouchableOpacity
                key={loc.id}
                style={styles.pickRow}
                onPress={() =>
                  void runEdit({ action: 'add_location', locationId: loc.id }, `Added "${loc.name}".`)
                }
              >
                <Text style={styles.stopName}>{loc.name}</Text>
                <Text style={styles.priSmallText}>+ Add</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Stops list + Re-optimise */}
        <View style={styles.card}>
          <View style={styles.stopsHead}>
            <Text style={styles.cardTitle}>Stops ({routeObj.stops.length})</Text>
            <TouchableOpacity
              style={styles.reoptBtn}
              disabled={loading}
              onPress={() => void runEdit({ action: 'reoptimise' }, 'Route re-optimised.')}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.ink} size="small" />
              ) : (
                <>
                  <Shuffle color={COLORS.ink} size={13} />
                  <Text style={styles.reoptText}>Re-optimise</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {routeObj.stops.map((stop) => (
            <View key={stop.id} style={styles.stopRow}>
              <View style={styles.seq}>
                <Text style={styles.seqText}>{stop.sequence}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.stopName}>{stop.name}</Text>
                <Text style={styles.sub}>{stop.address}</Text>
              </View>
              <TouchableOpacity
                style={styles.delBtn}
                onPress={() => void runEdit({ action: 'remove_stop', stopId: stop.id }, 'Stop removed.')}
              >
                <Trash2 color={COLORS.bad} size={15} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  msgBox: {
    backgroundColor: COLORS.infoSoft,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  msgText: { fontSize: 13, color: COLORS.ink },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
    color: COLORS.ink,
  },
  priSmall: {
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  priSmallText: { fontSize: 13, fontWeight: '700', color: COLORS.accentInk },
  tabs: { flexDirection: 'row', gap: 6, marginVertical: 10 },
  tabBtn: {
    flex: 1,
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: COLORS.accent },
  tabText: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim },
  tabTextActive: { color: COLORS.accentInk, fontWeight: '700' },
  pickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stopsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reoptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reoptText: { fontSize: 12, fontWeight: '600', color: COLORS.ink },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  seq: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seqText: { fontSize: 11, fontWeight: '700', color: COLORS.ink },
  stopName: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  sub: { fontSize: 11, color: COLORS.inkDim, marginTop: 2 },
  delBtn: { padding: 6 },
});
