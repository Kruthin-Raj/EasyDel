import React, { useState } from 'react';
import {
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Download, LogIn, LogOut, RefreshCw, Save, Server } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { changePasswordApi, checkApkRelease, saveSettingsApi } from '../lib/api';
import { COLORS } from '../theme';

export default function SettingsScreen() {
  const {
    user,
    apiUrl,
    setApiUrl,
    preferences,
    signOut,
    openAuthModal,
    requireToken,
    refreshWorkspace,
    pendingSync,
    lastSyncedAt,
    syncNow,
  } = useApp();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [geofence, setGeofence] = useState(String(preferences.geofenceMetres));
  const [startName, setStartName] = useState(preferences.defaultStartName);
  const [quizDefault, setQuizDefault] = useState(preferences.memorizeQuizDefault);
  const [autoAdvance, setAutoAdvance] = useState(preferences.memorizeAutoAdvance);
  const [bagReminder, setBagReminder] = useState(preferences.showBagReminder);
  const [unit, setUnit] = useState<'metric' | 'imperial'>(preferences.distanceUnit);

  const [serverDraft, setServerDraft] = useState(apiUrl);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [apkUrl, setApkUrl] = useState<string | null>(null);

  async function handleChangePassword() {
    setStatusNote(null);
    try {
      await requireToken('Sign in to change your password.', async (tok) => {
        await changePasswordApi(apiUrl, tok, currentPw, newPw);
        setCurrentPw('');
        setNewPw('');
        setStatusNote('Password updated!');
      });
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Password change failed.');
    }
  }

  async function handleSavePreferences() {
    setStatusNote(null);
    try {
      await requireToken('Sign in to save your preferences across devices.', async (tok) => {
        await saveSettingsApi(apiUrl, tok, {
          firstName,
          lastName,
          geofenceMetres: Number(geofence) || 150,
          defaultStartName: startName,
          memorizeQuizDefault: quizDefault,
          memorizeAutoAdvance: autoAdvance,
          showBagReminder: bagReminder,
          distanceUnit: unit,
        });
        await refreshWorkspace(tok);
        setStatusNote('Preferences saved!');
      });
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Could not save preferences.');
    }
  }

  async function handleCheckApk() {
    setStatusNote(null);
    try {
      const rel = await checkApkRelease(apiUrl);
      if (rel.available && rel.downloadUrl) {
        setApkUrl(rel.downloadUrl);
        setStatusNote(`Version v${rel.version} APK is ready to download.`);
      } else {
        setStatusNote(`Running v${rel.version}. No newer APK uploaded yet.`);
      }
    } catch {
      setStatusNote('Could not reach server to check APK version.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {user ? (
            <>
              <Text style={styles.name}>
                {user.firstName} {user.lastName}
              </Text>
              <Text style={styles.sub}>{user.email}</Text>
              <TouchableOpacity style={styles.dangerBtn} onPress={signOut}>
                <LogOut color={COLORS.bad} size={17} />
                <Text style={styles.dangerText}>Sign out</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.name}>Guest Mode</Text>
              <Text style={styles.sub}>
                Sign in to save routes, share codes, and sync delivery runs.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => openAuthModal('Sign in to save your routes and sync deliveries.')}
              >
                <LogIn color={COLORS.accentInk} size={16} />
                <Text style={styles.primaryBtnText}>Sign in or create account</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Riding & Memorize Preferences */}
        <Text style={styles.sectionTitle}>Riding &amp; Memorize</Text>
        <View style={styles.card}>
          {user ? (
            <View style={styles.row2}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="First name"
                value={firstName}
                onChangeText={setFirstName}
              />
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="Last name"
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          ) : null}

          <View style={[styles.row2, { marginTop: 8 }]}>
            <View style={styles.flex}>
              <Text style={styles.sub}>Default start</Text>
              <TextInput style={styles.input} value={startName} onChangeText={setStartName} />
            </View>
            <View style={{ width: 95 }}>
              <Text style={styles.sub}>Geofence (m)</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={geofence}
                onChangeText={setGeofence}
              />
            </View>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Default Memorize to Quiz Mode</Text>
            <Switch value={quizDefault} onValueChange={setQuizDefault} />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Auto-advance after marking Got it</Text>
            <Switch value={autoAdvance} onValueChange={setAutoAdvance} />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Show remaining bag items</Text>
            <Switch value={bagReminder} onValueChange={setBagReminder} />
          </View>

          <View style={styles.unitRow}>
            {(['metric', 'imperial'] as const).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                onPress={() => setUnit(u)}
              >
                <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>
                  {u === 'metric' ? 'Metric (km/m)' : 'Imperial (mi/ft)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSavePreferences}>
            <Save color={COLORS.accentInk} size={15} />
            <Text style={styles.primaryBtnText}>Save preferences</Text>
          </TouchableOpacity>
        </View>

        {user ? (
          <>
            <Text style={styles.sectionTitle}>Password</Text>
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder="Current password"
                placeholderTextColor={COLORS.inkFaint}
                secureTextEntry
                value={currentPw}
                onChangeText={setCurrentPw}
              />
              <TextInput
                style={styles.input}
                placeholder="New password (min 8 chars)"
                placeholderTextColor={COLORS.inkFaint}
                secureTextEntry
                value={newPw}
                onChangeText={setNewPw}
              />
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleChangePassword}>
                <Text style={styles.secondaryBtnText}>Update password</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {/* Sync Status */}
        <Text style={styles.sectionTitle}>Offline SQLite Sync</Text>
        <View style={styles.card}>
          <Text style={styles.rowTitle}>
            {pendingSync.length} pending change{pendingSync.length === 1 ? '' : 's'}
          </Text>
          <Text style={styles.sub}>
            {lastSyncedAt
              ? `Last synced: ${lastSyncedAt.slice(0, 19).replace('T', ' ')}`
              : 'Cached locally'}
          </Text>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={async () => {
              const res = await syncNow();
              setStatusNote(res.message);
            }}
          >
            <RefreshCw color={COLORS.ink} size={15} />
            <Text style={styles.secondaryBtnText}>Sync now</Text>
          </TouchableOpacity>
        </View>

        {/* Server URL & Direct APK Update Check */}
        <Text style={styles.sectionTitle}>Server &amp; APK Updates</Text>
        <View style={styles.card}>
          <View style={styles.labelRow}>
            <Server color={COLORS.inkDim} size={14} />
            <Text style={styles.sub}>Backend API URL</Text>
          </View>
          <TextInput
            style={styles.input}
            value={serverDraft}
            onChangeText={setServerDraft}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.flex]}
              onPress={() => {
                setApiUrl(serverDraft.trim());
                setStatusNote('Server URL updated.');
              }}
            >
              <Text style={styles.secondaryBtnText}>Save URL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryBtn, styles.flex]} onPress={handleCheckApk}>
              <Download color={COLORS.accent} size={15} />
              <Text style={styles.secondaryBtnText}>Check APK</Text>
            </TouchableOpacity>
          </View>

          {apkUrl ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 10 }]}
              onPress={() => void Linking.openURL(apkUrl)}
            >
              <Download color={COLORS.accentInk} size={16} />
              <Text style={styles.primaryBtnText}>Download Latest APK</Text>
            </TouchableOpacity>
          ) : null}

          {statusNote ? <Text style={styles.note}>{statusNote}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkDim,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
    marginTop: 10,
  },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  name: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  rowTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  sub: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  row2: { flexDirection: 'row', gap: 8 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  switchLabel: { fontSize: 13, color: COLORS.ink, flex: 1, paddingRight: 8 },
  unitRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  unitBtn: {
    flex: 1,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  unitBtnActive: { backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent },
  unitText: { fontSize: 12, color: COLORS.inkDim, fontWeight: '600' },
  unitTextActive: { color: COLORS.accent, fontWeight: '700' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  dangerText: { fontSize: 14, fontWeight: '700', color: COLORS.bad },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.ink,
    marginTop: 4,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  note: { fontSize: 12, color: COLORS.accent, marginTop: 10 },
});
