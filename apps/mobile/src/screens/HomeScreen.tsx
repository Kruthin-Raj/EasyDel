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
import {
  BarChart3,
  BookOpen,
  BookmarkPlus,
  CircleDot,
  History,
  Info,
  KeyRound,
  Link2,
  ListPlus,
  LogIn,
  MapPin,
  Play,
  RefreshCw,
  Settings,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { COLORS } from '../theme';

export default function HomeScreen() {
  const nav = useNavigation<{ navigate: (name: string, params?: Record<string, unknown>) => void }>();
  const {
    user,
    isGuest,
    routes,
    dashboardStats,
    recentDeliveries,
    activeRouteId,
    setActiveRouteId,
    previewRoute,
    previewLocation,
    lookupCode,
    savePreviewRoute,
    savePreviewLocation,
    openAuthModal,
    syncNow,
    pendingSync,
  } = useApp();

  const [codeInput, setCodeInput] = useState('');
  const [loadingCode, setLoadingCode] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleOpenCode(customCode?: string) {
    const val = (customCode ?? codeInput).trim();
    if (!val) return;
    setLoadingCode(true);
    setFeedback(null);
    const res = await lookupCode(val);
    setFeedback({ ok: res.ok, text: res.message });
    setLoadingCode(false);
  }

  async function handleSaveRoute() {
    const res = await savePreviewRoute();
    if (res.message) setFeedback({ ok: res.ok, text: res.message });
  }

  async function handleSaveLocation() {
    const res = await savePreviewLocation();
    if (res.message) setFeedback({ ok: res.ok, text: res.message });
  }

  async function handleSyncTap() {
    const res = await syncNow();
    setFeedback({ ok: res.ok, text: res.message });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.greeting}>
              {user ? `Hi, ${user.firstName}` : 'EasyDel Guest'}
            </Text>
            <Text style={styles.subGreeting}>
              {isGuest ? 'Guest preview · sign in to save & record' : 'Everything synced offline'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            {user ? (
              <TouchableOpacity style={styles.pillBtn} onPress={handleSyncTap} activeOpacity={0.8}>
                <RefreshCw color={COLORS.accent} size={14} />
                <Text style={styles.pillText}>
                  {pendingSync.length > 0 ? `Sync (${pendingSync.length})` : 'Sync'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.pillBtn}
                onPress={() => openAuthModal('Sign in to save routes, record rounds, and sync runs.')}
                activeOpacity={0.8}
              >
                <LogIn color={COLORS.accent} size={14} />
                <Text style={styles.pillText}>Sign in</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.gearBtn}
              onPress={() => nav.navigate('Settings')}
              activeOpacity={0.8}
            >
              <Settings color={COLORS.ink} size={18} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Code Launchpad */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={styles.iconBadge}>
              <KeyRound color={COLORS.accent} size={18} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Open route or location by code</Text>
              <Text style={styles.cardSub}>Enter an 8-letter code or share link.</Text>
            </View>
          </View>

          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              placeholder="e.g. K7M9P2X4"
              placeholderTextColor={COLORS.inkFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              value={codeInput}
              onChangeText={setCodeInput}
            />
            <TouchableOpacity
              style={styles.openBtn}
              onPress={() => handleOpenCode()}
              disabled={loadingCode}
              activeOpacity={0.85}
            >
              {loadingCode ? (
                <ActivityIndicator color={COLORS.accentInk} size="small" />
              ) : (
                <Text style={styles.openBtnText}>Open</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.samplePill}
            onPress={() => {
              setCodeInput('DEMO2026');
              void handleOpenCode('DEMO2026');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.samplePillText}>Try sample code DEMO2026</Text>
          </TouchableOpacity>

          {feedback ? (
            <View
              style={[styles.feedbackBox, feedback.ok ? styles.feedbackOk : styles.feedbackBad]}
            >
              <Text style={styles.feedbackText}>{feedback.text}</Text>
            </View>
          ) : null}
        </View>

        {/* Quick Create Tiles */}
        <View style={styles.createRow}>
          <TouchableOpacity
            style={styles.createTile}
            onPress={() => nav.navigate('FromLinks')}
            activeOpacity={0.85}
          >
            <Link2 color={COLORS.info} size={18} />
            <Text style={styles.createTileTitle}>Map links</Text>
            <Text style={styles.createTileSub}>Paste Pins</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createTile}
            onPress={() => nav.navigate('Record')}
            activeOpacity={0.85}
          >
            <CircleDot color={COLORS.accent} size={18} />
            <Text style={styles.createTileTitle}>Record</Text>
            <Text style={styles.createTileSub}>Drive beat</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createTile}
            onPress={() => nav.navigate('CreateRoute')}
            activeOpacity={0.85}
          >
            <ListPlus color={COLORS.ok} size={18} />
            <Text style={styles.createTileTitle}>Pick stops</Text>
            <Text style={styles.createTileSub}>From saved</Text>
          </TouchableOpacity>
        </View>

        {/* Opened Shared Route Preview */}
        {previewRoute ? (
          <View style={styles.previewCard}>
            <Text style={styles.eyebrow}>OPENED ROUTE · {previewRoute.shareCode}</Text>
            <Text style={styles.routeName}>{previewRoute.name}</Text>
            <Text style={styles.metaText}>
              {previewRoute.stops.length} stops · by {previewRoute.creatorName}
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setActiveRouteId(previewRoute.id);
                  nav.navigate('Memorize');
                }}
                activeOpacity={0.85}
              >
                <BookOpen color={COLORS.ink} size={15} />
                <Text style={styles.secondaryBtnText}>Memorize</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleSaveRoute}
                activeOpacity={0.85}
              >
                <BookmarkPlus color={COLORS.accentInk} size={15} />
                <Text style={styles.primaryBtnText}>
                  {user ? 'Save route' : 'Login & Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Opened Shared Location Preview */}
        {previewLocation ? (
          <View style={styles.previewCard}>
            <Text style={styles.eyebrow}>SHARED LOCATION · {previewLocation.shareCode}</Text>
            <Text style={styles.routeName}>{previewLocation.name}</Text>
            <Text style={styles.metaText}>{previewLocation.address}</Text>
            {previewLocation.entranceInstructions ? (
              <Text style={styles.noteText}>Entrance: {previewLocation.entranceInstructions}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 12 }]}
              onPress={handleSaveLocation}
              activeOpacity={0.85}
            >
              <BookmarkPlus color={COLORS.accentInk} size={15} />
              <Text style={styles.primaryBtnText}>
                {user ? 'Save location' : 'Login & Save'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 4 Dashboard Metrics */}
        <View style={styles.statsGrid}>
          <TouchableOpacity style={styles.statCard} onPress={() => nav.navigate('Routes')}>
            <Text style={styles.statLabel}>My routes</Text>
            <Text style={styles.statVal}>{user ? dashboardStats.myRoutesCount : routes.length}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => nav.navigate('Locations')}>
            <Text style={styles.statLabel}>Locations</Text>
            <Text style={styles.statVal}>{dashboardStats.locationsCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => nav.navigate('Activity')}>
            <Text style={styles.statLabel}>Delivered</Text>
            <Text style={[styles.statVal, { color: COLORS.ok }]}>
              {dashboardStats.deliveredCount}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => nav.navigate('Activity')}>
            <Text style={styles.statLabel}>Recorded</Text>
            <Text style={styles.statVal}>{dashboardStats.trainingRoundsCount}</Text>
          </TouchableOpacity>
        </View>

        {/* Ready to deliver */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ready to start</Text>
          <TouchableOpacity onPress={() => nav.navigate('Routes')}>
            <Text style={styles.seeAll}>All routes</Text>
          </TouchableOpacity>
        </View>

        {routes.slice(0, 3).map((route) => {
          const isActive = route.id === activeRouteId;
          return (
            <View key={route.id} style={[styles.routeCard, isActive && styles.routeCardActive]}>
              <View style={styles.routeTop}>
                <View style={styles.flex}>
                  <Text style={styles.routeCardTitle}>{route.name}</Text>
                  <Text style={styles.metaText}>
                    <MapPin color={COLORS.inkFaint} size={11} /> {route.stops.length} stops
                  </Text>
                </View>
                {route.shareCode ? (
                  <View style={styles.codeChip}>
                    <Text style={styles.codeChipText}>{route.shareCode}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setActiveRouteId(route.id);
                    nav.navigate('Memorize');
                  }}
                >
                  <BookOpen color={COLORS.ink} size={15} />
                  <Text style={styles.secondaryBtnText}>Memorize</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => {
                    setActiveRouteId(route.id);
                    nav.navigate('Queue');
                  }}
                >
                  <Play color={COLORS.accentInk} size={15} />
                  <Text style={styles.primaryBtnText}>Deliver</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {recentDeliveries.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent deliveries</Text>
            {recentDeliveries.slice(0, 3).map((d) => (
              <View key={d.id} style={styles.recentRow}>
                <View style={styles.flex}>
                  <Text style={styles.recentName}>{d.locationName}</Text>
                  <Text style={styles.cardSub}>
                    {d.productType} ×{d.quantity}
                  </Text>
                </View>
                <Text style={[styles.recentBadge, d.status === 'DELIVERED' && { color: COLORS.ok }]}>
                  {d.status}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Quick Links to History, Reports, About & Contact */}
        <View style={styles.linksRow}>
          <TouchableOpacity style={styles.linkChip} onPress={() => nav.navigate('Activity')}>
            <History color={COLORS.inkDim} size={14} />
            <Text style={styles.linkChipText}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkChip} onPress={() => nav.navigate('Activity')}>
            <BarChart3 color={COLORS.inkDim} size={14} />
            <Text style={styles.linkChipText}>Reports</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkChip} onPress={() => nav.navigate('Support')}>
            <Info color={COLORS.inkDim} size={14} />
            <Text style={styles.linkChipText}>About &amp; Contact</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greeting: { fontSize: 22, fontWeight: '800', color: COLORS.ink },
  subGreeting: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 12, fontWeight: '600', color: COLORS.ink },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 14,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  cardSub: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  codeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  codeInput: {
    flex: 1,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.ink,
    letterSpacing: 1,
  },
  openBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
  samplePill: { marginTop: 10, alignSelf: 'flex-start' },
  samplePillText: { fontSize: 12, fontWeight: '600', color: COLORS.accent },
  feedbackBox: { marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1 },
  feedbackOk: { backgroundColor: COLORS.okSoft, borderColor: 'rgba(16, 185, 129, 0.35)' },
  feedbackBad: { backgroundColor: COLORS.badSoft, borderColor: 'rgba(239, 68, 68, 0.35)' },
  feedbackText: { fontSize: 12, color: COLORS.ink },
  createRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  createTile: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  createTileTitle: { fontSize: 13, fontWeight: '700', color: COLORS.ink, marginTop: 8 },
  createTileSub: { fontSize: 11, color: COLORS.inkDim, marginTop: 1 },
  previewCard: {
    backgroundColor: COLORS.panel2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    padding: 15,
    marginBottom: 14,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.7 },
  routeName: { fontSize: 17, fontWeight: '800', color: COLORS.ink, marginTop: 3 },
  metaText: { fontSize: 12, color: COLORS.inkDim, marginTop: 3 },
  noteText: { fontSize: 12, color: COLORS.ink, marginTop: 6 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: {
    width: '48.5%',
    backgroundColor: COLORS.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  statLabel: { fontSize: 11, fontWeight: '600', color: COLORS.inkDim },
  statVal: { fontSize: 20, fontWeight: '800', color: COLORS.ink, marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkDim,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  seeAll: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  routeCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  routeCardActive: { borderColor: 'rgba(245, 158, 11, 0.5)' },
  routeTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  routeCardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  codeChip: {
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeChipText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingVertical: 9,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 9,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.accentInk },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  recentName: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  recentBadge: { fontSize: 11, fontWeight: '700', color: COLORS.inkDim },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  linkChipText: { fontSize: 12, fontWeight: '600', color: COLORS.ink },
});
