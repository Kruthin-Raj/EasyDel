import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BookOpen, Copy, Edit3, Link2, ListPlus, Map, Play, Search, Share2, Trash2 } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { duplicateRouteApi, unsaveRouteApi } from '../lib/api';
import { COLORS } from '../theme';

export default function RoutesScreen() {
  const nav = useNavigation<{ navigate: (name: string, params?: Record<string, unknown>) => void }>();
  const { apiUrl, routes, activeRouteId, setActiveRouteId, requireToken, refreshWorkspace } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'owned' | 'saved'>('all');
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return routes.filter((r) => {
      if (filter === 'owned' && !r.isOwner) return false;
      if (filter === 'saved' && r.isOwner) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.shareCode?.toLowerCase().includes(q) ?? false) ||
        r.creatorName.toLowerCase().includes(q)
      );
    });
  }, [filter, query, routes]);

  async function shareRoute(name: string, shareCode: string | null) {
    if (!shareCode) return;
    try {
      await Share.share({
        title: name,
        message: `Open "${name}" on EasyDel with code: ${shareCode}`,
      });
    } catch {
      // User dismissed share sheet.
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>My routes</Text>

        {/* Create Actions */}
        <View style={styles.buildRow}>
          <TouchableOpacity
            style={styles.buildBtnPrimary}
            onPress={() => nav.navigate('FromLinks')}
          >
            <Link2 color={COLORS.accentInk} size={15} />
            <Text style={styles.buildBtnPrimaryText}>From Maps links</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buildBtnSecondary}
            onPress={() => nav.navigate('CreateRoute')}
          >
            <ListPlus color={COLORS.ink} size={15} />
            <Text style={styles.buildBtnSecondaryText}>Pick saved</Text>
          </TouchableOpacity>
        </View>

        {/* Search & Filter */}
        <View style={styles.searchBox}>
          <Search color={COLORS.inkFaint} size={16} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search route name or code…"
            placeholderTextColor={COLORS.inkFaint}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <View style={styles.filterRow}>
          {(
            [
              ['all', `All (${routes.length})`],
              ['owned', `Mine (${routes.filter((r) => r.isOwner).length})`],
              ['saved', `Saved (${routes.filter((r) => !r.isOwner).length})`],
            ] as const
          ).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.filterPill, filter === key && styles.filterPillActive]}
              onPress={() => setFilter(key)}
            >
              <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {msg ? <Text style={styles.msgBanner}>{msg}</Text> : null}

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No routes match</Text>
            <Text style={styles.emptySub}>Create one from map links or enter a share code on Home.</Text>
          </View>
        ) : (
          filtered.map((r) => {
            const isActive = r.id === activeRouteId;
            return (
              <View key={r.id} style={[styles.card, isActive && styles.cardActive]}>
                <View style={styles.cardTop}>
                  <View style={styles.flex}>
                    <Text style={styles.routeName}>{r.name}</Text>
                    <Text style={styles.meta}>
                      {r.stops.length} stops · {r.isOwner ? 'Created by you' : `by ${r.creatorName}`}
                      {r.totalDistance ? ` · ${(r.totalDistance / 1000).toFixed(1)} km` : ''}
                    </Text>
                  </View>

                  {r.shareCode ? (
                    <TouchableOpacity
                      style={styles.codeBadge}
                      onPress={() => void shareRoute(r.name, r.shareCode)}
                    >
                      <Share2 color={COLORS.accent} size={12} />
                      <Text style={styles.codeBadgeText}>{r.shareCode}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.btnSec}
                    onPress={() => {
                      setActiveRouteId(r.id);
                      nav.navigate('Memorize');
                    }}
                  >
                    <BookOpen color={COLORS.ink} size={14} />
                    <Text style={styles.btnSecText}>Memorize</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnSec}
                    onPress={() => {
                      setActiveRouteId(r.id);
                      nav.navigate('Map');
                    }}
                  >
                    <Map color={COLORS.ink} size={14} />
                    <Text style={styles.btnSecText}>Map</Text>
                  </TouchableOpacity>
                  {r.isOwner ? (
                    <TouchableOpacity
                      style={styles.btnSec}
                      onPress={() => nav.navigate('EditRoute', { routeId: r.id })}
                    >
                      <Edit3 color={COLORS.ink} size={14} />
                      <Text style={styles.btnSecText}>Edit</Text>
                    </TouchableOpacity>
                  ) : !r.isDemo ? (
                    <>
                      <TouchableOpacity
                        style={styles.btnSec}
                        onPress={() => {
                          void requireToken('Sign in to clone this route.', async (tok) => {
                            const cloned = await duplicateRouteApi(apiUrl, tok, { routeId: r.id });
                            await refreshWorkspace(tok);
                            setMsg(`Created editable copy "${cloned.name}"!`);
                          });
                        }}
                      >
                        <Copy color={COLORS.ink} size={14} />
                        <Text style={styles.btnSecText}>Clone</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.btnSec}
                        onPress={() => {
                          void requireToken('Sign in to remove saved route.', async (tok) => {
                            await unsaveRouteApi(apiUrl, tok, r.id);
                            await refreshWorkspace(tok);
                            setMsg(`Removed "${r.name}".`);
                          });
                        }}
                      >
                        <Trash2 color={COLORS.bad} size={14} />
                        <Text style={[styles.btnSecText, { color: COLORS.bad }]}>Remove</Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                  <TouchableOpacity
                    style={styles.btnPri}
                    onPress={() => {
                      setActiveRouteId(r.id);
                      nav.navigate('Queue');
                    }}
                  >
                    <Play color={COLORS.accentInk} size={14} />
                    <Text style={styles.btnPriText}>Start</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.ink, marginBottom: 12 },
  buildRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  buildBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 11,
  },
  buildBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: COLORS.accentInk },
  buildBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingVertical: 11,
  },
  buildBtnSecondaryText: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: COLORS.ink },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterPill: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterPillActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterText: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim },
  filterTextActive: { color: COLORS.accentInk, fontWeight: '700' },
  emptyCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  emptySub: { fontSize: 12, color: COLORS.inkDim, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  cardActive: { borderColor: 'rgba(245, 158, 11, 0.5)' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeName: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  meta: { fontSize: 12, color: COLORS.inkDim, marginTop: 3 },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
  },
  codeBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  btnSec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btnSecText: { fontSize: 12, fontWeight: '600', color: COLORS.ink },
  btnPri: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnPriText: { fontSize: 12, fontWeight: '700', color: COLORS.accentInk },
  msgBanner: { fontSize: 12, color: COLORS.ok, marginBottom: 10 },
});
