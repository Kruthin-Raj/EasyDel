import React, { useState } from 'react';
import {
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  RotateCcw,
} from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import OsmRouteMap, { type OsmStopPin } from '../components/OsmRouteMap';
import { COLORS } from '../theme';

export default function MemorizeScreen() {
  const { activeRoute, masteryMap, markMastery } = useApp();
  const [index, setIndex] = useState(0);
  const [quizMode, setQuizMode] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const stops = activeRoute.stops;
  const safeIndex = stops.length > 0 ? index % stops.length : 0;
  const current = stops[safeIndex];

  const gotItCount = stops.filter((s) => masteryMap[s.id] === 'got_it').length;

  function go(nextIndex: number) {
    if (stops.length === 0) return;
    setIndex((nextIndex + stops.length) % stops.length);
    setRevealed(false);
  }

  function handleMark(state: 'got_it' | 'review') {
    if (!current) return;
    markMastery(current.id, state);
    if (stops.length > 1) {
      go(safeIndex + 1);
    }
  }

  if (!current) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No stops in this route yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hideDetails = quizMode && !revealed;

  const pins: OsmStopPin[] = stops.map((s, idx) => ({
    id: s.id,
    sequence: s.sequence,
    name: quizMode && idx === safeIndex && !revealed ? `Stop #${s.sequence}` : s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    state:
      idx === safeIndex
        ? 'current'
        : masteryMap[s.id] === 'got_it'
          ? 'completed'
          : 'remaining',
  }));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ marginBottom: 14 }}>
          <OsmRouteMap
            stops={pins}
            routeGeometry={activeRoute.routeGeometry ?? null}
            startPoint={activeRoute.startPoint ?? null}
            endPoint={activeRoute.endPoint ?? null}
            height={210}
          />
        </View>
        {/* Route & Progress Bar */}
        <View style={styles.topCard}>
          <View style={styles.topRow}>
            <View style={styles.flex}>
              <Text style={styles.routeLabel}>{activeRoute.name}</Text>
              <Text style={styles.progressText}>
                {gotItCount}/{stops.length} stops memorized
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.quizToggle, quizMode && styles.quizToggleActive]}
              onPress={() => {
                setQuizMode((q) => !q);
                setRevealed(false);
              }}
              activeOpacity={0.85}
            >
              {quizMode ? (
                <EyeOff color={COLORS.accentInk} size={14} />
              ) : (
                <Eye color={COLORS.ink} size={14} />
              )}
              <Text style={[styles.quizToggleText, quizMode && styles.quizToggleTextActive]}>
                {quizMode ? 'Quiz ON' : 'Quiz OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${stops.length ? (gotItCount / stops.length) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>

        {/* Flashcard */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>
                STOP {current.sequence} OF {stops.length}
              </Text>
              <Text style={styles.stopTitle}>
                {hideDetails ? 'Try to recall this house…' : current.name}
              </Text>
            </View>
            <View style={styles.navArrows}>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => go(safeIndex - 1)}>
                <ChevronLeft color={COLORS.ink} size={18} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => go(safeIndex + 1)}>
                <ChevronRight color={COLORS.ink} size={18} />
              </TouchableOpacity>
            </View>
          </View>

          {hideDetails ? (
            <View style={styles.quizBox}>
              <EyeOff color={COLORS.inkFaint} size={28} />
              <Text style={styles.quizTitle}>Recall items, entrance gate &amp; notes</Text>
              <Text style={styles.quizHint}>
                Coordinates: {current.latitude.toFixed(4)}, {current.longitude.toFixed(4)}
              </Text>
              <TouchableOpacity
                style={styles.revealBtn}
                onPress={() => setRevealed(true)}
                activeOpacity={0.85}
              >
                <Eye color={COLORS.accentInk} size={16} />
                <Text style={styles.revealBtnText}>Tap to reveal details</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cardBody}>
              {current.photoUrl ? (
                <Image source={{ uri: current.photoUrl }} style={styles.photo} resizeMode="cover" />
              ) : null}

              <Text style={styles.address}>{current.address}</Text>
              {current.floor || current.unit ? (
                <Text style={styles.floorUnit}>
                  {[current.floor && `Floor ${current.floor}`, current.unit]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}

              <View style={styles.itemsBlock}>
                <Text style={styles.blockLabel}>DROP ({current.totalItems} ITEMS)</Text>
                {current.items.map((item) => (
                  <View key={item.subscriptionId} style={styles.itemRow}>
                    <View style={styles.flex}>
                      <Text style={styles.itemCustomer}>{item.customer ?? 'Customer'}</Text>
                      <Text style={styles.itemType}>{item.productType}</Text>
                      {item.specialInstructions ? (
                        <Text style={styles.itemSpecial}>{item.specialInstructions}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.itemQty}>×{item.quantity}</Text>
                  </View>
                ))}
              </View>

              {(current.entranceInstructions || current.notes || current.nextVisitNote) ? (
                <View style={styles.notesBlock}>
                  <Text style={styles.blockLabel}>CLUES &amp; NOTES</Text>
                  {current.entranceInstructions ? (
                    <Text style={styles.noteLine}>
                      <Text style={styles.noteKey}>Entrance: </Text>
                      {current.entranceInstructions}
                    </Text>
                  ) : null}
                  {current.notes ? <Text style={styles.noteLine}>{current.notes}</Text> : null}
                  {current.nextVisitNote ? (
                    <Text style={styles.nextNote}>
                      Next visit: {current.nextVisitNote}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}

          {/* Thumb-friendly Mastery Buttons */}
          <View style={styles.decisionRow}>
            <TouchableOpacity
              style={styles.reviewBtn}
              onPress={() => handleMark('review')}
              activeOpacity={0.85}
            >
              <RotateCcw color={COLORS.warn} size={16} />
              <Text style={styles.reviewBtnText}>Needs review</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.gotItBtn}
              onPress={() => handleMark('got_it')}
              activeOpacity={0.85}
            >
              <Check color={COLORS.accentInk} size={16} />
              <Text style={styles.gotItBtnText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.inkDim, fontSize: 15 },
  topCard: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 14,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeLabel: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  progressText: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  quizToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  quizToggleActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  quizToggleText: { fontSize: 12, fontWeight: '700', color: COLORS.ink },
  quizToggleTextActive: { color: COLORS.accentInk },
  barTrack: {
    height: 7,
    backgroundColor: COLORS.surface2,
    borderRadius: 999,
    marginTop: 12,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: COLORS.ok, borderRadius: 999 },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: COLORS.panel2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  eyebrow: { fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.8 },
  stopTitle: { fontSize: 20, fontWeight: '800', color: COLORS.ink, marginTop: 2 },
  navArrows: { flexDirection: 'row', gap: 8 },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizBox: { padding: 28, alignItems: 'center' },
  quizTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink, marginTop: 12, textAlign: 'center' },
  quizHint: { fontSize: 12, color: COLORS.inkDim, marginTop: 4 },
  revealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 18,
  },
  revealBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
  cardBody: { padding: 16, gap: 12 },
  photo: { width: '100%', height: 170, borderRadius: 10 },
  address: { fontSize: 14, color: COLORS.inkDim },
  floorUnit: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  itemsBlock: {
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 8,
  },
  blockLabel: { fontSize: 10, fontWeight: '700', color: COLORS.inkFaint, letterSpacing: 0.8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemCustomer: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  itemType: { fontSize: 12, color: COLORS.inkDim },
  itemSpecial: { fontSize: 11, color: COLORS.warn, marginTop: 2 },
  itemQty: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  notesBlock: {
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 5,
  },
  noteLine: { fontSize: 13, color: COLORS.inkDim, lineHeight: 18 },
  noteKey: { color: COLORS.accent, fontWeight: '700' },
  nextNote: {
    fontSize: 12,
    color: COLORS.info,
    backgroundColor: COLORS.infoSoft,
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  decisionRow: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 4 },
  reviewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.warnSoft,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 11,
    paddingVertical: 13,
  },
  reviewBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.warn },
  gotItBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.ok,
    borderRadius: 11,
    paddingVertical: 13,
  },
  gotItBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
});
