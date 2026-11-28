import React, { useState } from 'react';
import {
  FlatList,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CheckCircle2, Circle, Navigation, RefreshCw, SkipForward, XCircle } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { COLORS } from '../theme';

export default function DeliveryQueueScreen() {
  const { activeRoute, recordStopStatus, pendingSync, syncNow, user } = useApp();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [nextVisitDraft, setNextVisitDraft] = useState<Record<string, string>>({});

  const stops = activeRoute.stops;
  const doneCount = stops.filter(
    (s) => s.deliveryStatus === 'DELIVERED' || s.deliveryStatus === 'SKIPPED' || s.deliveryStatus === 'FAILED',
  ).length;

  async function handleSync() {
    const res = await syncNow();
    setSyncMessage(res.message);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.title}>{activeRoute.name}</Text>
            <Text style={styles.subtitle}>
              {doneCount} of {stops.length} stops done
            </Text>
          </View>

          <TouchableOpacity style={styles.syncBtn} onPress={handleSync} activeOpacity={0.85}>
            <RefreshCw color={COLORS.accentInk} size={14} />
            <Text style={styles.syncBtnText}>
              {user
                ? pendingSync.length > 0
                  ? `Sync (${pendingSync.length})`
                  : 'Sync'
                : 'Login & Sync'}
            </Text>
          </TouchableOpacity>
        </View>

        {syncMessage ? <Text style={styles.syncMsg}>{syncMessage}</Text> : null}
      </View>

      <FlatList
        data={stops}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isDelivered = item.deliveryStatus === 'DELIVERED';
          const isSkipped = item.deliveryStatus === 'SKIPPED';
          const isFailed = item.deliveryStatus === 'FAILED';
          const isDone = isDelivered || isSkipped || isFailed;
          return (
            <View style={[styles.card, isDelivered && styles.cardDone]}>
              <View style={styles.cardHeader}>
                {isDelivered ? (
                  <CheckCircle2 color={COLORS.ok} size={22} />
                ) : isFailed ? (
                  <XCircle color={COLORS.bad} size={22} />
                ) : isSkipped ? (
                  <SkipForward color={COLORS.warn} size={22} />
                ) : (
                  <Circle color={COLORS.inkFaint} size={22} />
                )}
                <View style={styles.cardInfo}>
                  <Text style={styles.stopName}>
                    #{item.sequence} · {item.name}
                  </Text>
                  <Text style={styles.address}>{item.address}</Text>
                  <Text style={styles.items}>
                    {item.totalItems} item{item.totalItems === 1 ? '' : 's'}
                    {item.entranceInstructions ? ` · ${item.entranceInstructions}` : ''}
                  </Text>
                  {item.nextVisitNote ? (
                    <Text style={styles.nextNote}>Next visit: {item.nextVisitNote}</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={styles.navIconBtn}
                  onPress={() =>
                    void Linking.openURL(
                      `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`,
                    )
                  }
                >
                  <Navigation color={COLORS.info} size={16} />
                </TouchableOpacity>
              </View>

              {!isDone ? (
                <TextInput
                  style={styles.noteInput}
                  placeholder="Optional note for next visit…"
                  placeholderTextColor={COLORS.inkFaint}
                  value={nextVisitDraft[item.id] ?? ''}
                  onChangeText={(txt) => setNextVisitDraft((p) => ({ ...p, [item.id]: txt }))}
                />
              ) : null}

              <View style={styles.actions}>
                {!isDone ? (
                  <>
                    <TouchableOpacity
                      style={styles.deliverBtn}
                      onPress={() =>
                        recordStopStatus(item.id, 'DELIVERED', {
                          nextVisitNote: nextVisitDraft[item.id]?.trim() || undefined,
                        })
                      }
                      activeOpacity={0.85}
                    >
                      <Text style={styles.deliverBtnText}>Delivered</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.skipBtn}
                      onPress={() =>
                        recordStopStatus(item.id, 'SKIPPED', { reason: 'Skipped on beat' })
                      }
                      activeOpacity={0.85}
                    >
                      <Text style={styles.skipBtnText}>Skip</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.failBtn}
                      onPress={() =>
                        recordStopStatus(item.id, 'FAILED', { reason: 'Could not deliver' })
                      }
                      activeOpacity={0.85}
                    >
                      <Text style={styles.failBtnText}>Fail</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.undoBtn}
                    onPress={() => recordStopStatus(item.id, 'PENDING')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.undoBtnText}>Undo ({item.deliveryStatus})</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  header: {
    padding: 16,
    backgroundColor: COLORS.panel,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  subtitle: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
  },
  syncBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.accentInk },
  syncMsg: { fontSize: 12, color: COLORS.ok, marginTop: 8 },
  list: { padding: 14, paddingBottom: 30, gap: 12 },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  cardDone: { borderColor: 'rgba(16, 185, 129, 0.35)' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardInfo: { flex: 1 },
  stopName: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  address: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  items: { fontSize: 12, color: COLORS.accent, marginTop: 4 },
  nextNote: { fontSize: 11, color: COLORS.info, marginTop: 4 },
  navIconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.infoSoft,
  },
  noteInput: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    color: COLORS.ink,
    marginTop: 10,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  deliverBtn: {
    flex: 1,
    backgroundColor: COLORS.ok,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deliverBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.accentInk },
  skipBtn: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  skipBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim },
  failBtn: {
    backgroundColor: COLORS.badSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 9,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  failBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.bad },
  undoBtn: {
    flex: 1,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  undoBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim },
});
