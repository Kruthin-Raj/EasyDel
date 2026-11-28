import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { issueActionApi } from '../lib/api';
import { COLORS } from '../theme';

export default function ActivityScreen() {
  const { apiUrl, dashboardStats, runs, recordedRounds, issues, requireToken, refreshWorkspace } =
    useApp();
  const [tab, setTab] = useState<'history' | 'rounds' | 'reports'>('history');
  const [issueText, setIssueText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function reportIssue() {
    if (!issueText.trim()) return;
    try {
      await requireToken('Sign in to report a delivery issue.', async (tok) => {
        await issueActionApi(apiUrl, tok, { action: 'create', description: issueText.trim() });
        await refreshWorkspace(tok);
        setIssueText('');
        setMsg('Issue logged.');
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to log issue.');
    }
  }

  async function resolveIssue(id: string) {
    try {
      await requireToken('Sign in to update issues.', async (tok) => {
        await issueActionApi(apiUrl, tok, { action: 'resolve', issueId: id });
        await refreshWorkspace(tok);
      });
    } catch {
      // Ignore.
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.tabRow}>
          {(
            [
              ['history', 'History'],
              ['rounds', 'Recorded'],
              ['reports', 'Reports'],
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

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        {tab === 'history' ? (
          runs.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.sub}>No delivery runs recorded yet.</Text>
            </View>
          ) : (
            runs.map((run) => (
              <View key={run.id} style={styles.card}>
                <Text style={styles.title}>{run.routeName}</Text>
                <Text style={styles.sub}>
                  {run.startedAt.slice(0, 10)} · {run.status}
                </Text>
                <Text style={styles.meta}>
                  {run.delivered} delivered · {run.skipped} skipped · {run.failed} failed (of{' '}
                  {run.totalStops})
                </Text>
              </View>
            ))
          )
        ) : tab === 'rounds' ? (
          recordedRounds.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.sub}>No recorded training rounds yet.</Text>
            </View>
          ) : (
            recordedRounds.map((round) => (
              <View key={round.id} style={styles.card}>
                <Text style={styles.title}>{round.routeName}</Text>
                <Text style={styles.sub}>
                  {round.startedAt.slice(0, 10)} · {round.checkpointCount} stops · {round.status}
                </Text>
              </View>
            ))
          )
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.sub}>Delivered</Text>
                <Text style={[styles.statVal, { color: COLORS.ok }]}>
                  {dashboardStats.deliveredCount}
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.sub}>Open Issues</Text>
                <Text style={[styles.statVal, { color: COLORS.warn }]}>
                  {dashboardStats.openIssuesCount}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Report delivery issue</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder="Gate locked, dog hazard, missing drop…"
                  placeholderTextColor={COLORS.inkFaint}
                  value={issueText}
                  onChangeText={setIssueText}
                />
                <TouchableOpacity style={styles.priBtn} onPress={reportIssue}>
                  <Text style={styles.priText}>Log</Text>
                </TouchableOpacity>
              </View>
            </View>

            {issues.map((iss) => (
              <View key={iss.id} style={styles.card}>
                <View style={styles.issueRow}>
                  {iss.status === 'RESOLVED' ? (
                    <CheckCircle2 color={COLORS.ok} size={16} />
                  ) : (
                    <AlertTriangle color={COLORS.warn} size={16} />
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.title}>{iss.description}</Text>
                    <Text style={styles.sub}>
                      {iss.status} · {iss.createdAt.slice(0, 10)}
                    </Text>
                  </View>
                  {iss.status === 'OPEN' ? (
                    <TouchableOpacity
                      style={styles.resolveBtn}
                      onPress={() => void resolveIssue(iss.id)}
                    >
                      <Text style={styles.resolveText}>Resolve</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
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
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tabBtn: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.inkDim },
  tabTextActive: { color: COLORS.accentInk, fontWeight: '700' },
  msg: { fontSize: 12, color: COLORS.ok, marginBottom: 10 },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  sub: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  meta: { fontSize: 12, color: COLORS.accent, marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  statVal: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.ink,
  },
  priBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  priText: { fontSize: 13, fontWeight: '700', color: COLORS.accentInk },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resolveBtn: {
    backgroundColor: COLORS.okSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resolveText: { fontSize: 12, fontWeight: '700', color: COLORS.ok },
});
