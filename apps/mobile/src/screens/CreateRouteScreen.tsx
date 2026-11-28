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
import { CheckSquare, Square } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { createRouteFromLocationsApi } from '../lib/api';
import { COLORS } from '../theme';

export default function CreateRouteScreen() {
  const nav = useNavigation<{ goBack: () => void }>();
  const { apiUrl, locations, preferences, requireToken, refreshWorkspace, setActiveRouteId } = useApp();

  const deliverable = locations.filter((l) => l.status === 'ACTIVE');
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => deliverable.map((l) => l.id));
  const [startLat, setStartLat] = useState(String(preferences.defaultStartLat));
  const [startLng, setStartLng] = useState(String(preferences.defaultStartLng));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleLoc(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreate() {
    setError(null);
    setLoading(true);
    try {
      await requireToken('Sign in to save your newly built route.', async (tok) => {
        const res = await createRouteFromLocationsApi(apiUrl, tok, {
          name: name.trim() || 'My Delivery Route',
          locationIds: selectedIds,
          startName: preferences.defaultStartName,
          startLatitude: Number(startLat),
          startLongitude: Number(startLng),
          endSameAsStart: true,
        });
        await refreshWorkspace(tok);
        setActiveRouteId(res.id);
        nav.goBack();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create route.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>Route name</Text>
          <TextInput
            style={styles.input}
            placeholder="Morning Beat 01"
            placeholderTextColor={COLORS.inkFaint}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Start point ({preferences.defaultStartName})</Text>
          <View style={styles.row2}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={startLat}
              onChangeText={setStartLat}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.flex]}
              value={startLng}
              onChangeText={setStartLng}
              keyboardType="numeric"
            />
          </View>

          <Text style={styles.label}>Pick stops ({selectedIds.length} selected)</Text>
          {deliverable.length === 0 ? (
            <Text style={styles.empty}>
              No active locations yet. Add locations on the Locations tab first.
            </Text>
          ) : (
            deliverable.map((loc) => {
              const checked = selectedIds.includes(loc.id);
              return (
                <TouchableOpacity
                  key={loc.id}
                  style={styles.stopRow}
                  onPress={() => toggleLoc(loc.id)}
                >
                  {checked ? (
                    <CheckSquare color={COLORS.accent} size={18} />
                  ) : (
                    <Square color={COLORS.inkFaint} size={18} />
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.stopName}>{loc.name}</Text>
                    <Text style={styles.stopMeta}>
                      {loc.activeItems > 0 ? `${loc.activeItems} items` : '1 item (Package)'} · {loc.address}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.accentInk} />
            ) : (
              <Text style={styles.primaryBtnText}>Create &amp; Optimise</Text>
            )}
          </TouchableOpacity>
        </View>
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
  },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.ink,
    marginBottom: 8,
  },
  row2: { flexDirection: 'row', gap: 8 },
  empty: { fontSize: 13, color: COLORS.inkDim, marginVertical: 12 },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stopName: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  stopMeta: { fontSize: 11, color: COLORS.inkDim, marginTop: 2 },
  error: { fontSize: 12, color: COLORS.bad, marginTop: 10 },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
});
