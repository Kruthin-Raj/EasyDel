import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowRight, Route as RouteIcon, X } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { loginOrSignUp } from '../lib/api';
import { COLORS } from '../theme';

export default function AuthScreen({
  isModal = false,
  reason,
  onContinueWithoutLogin,
  onCloseModal,
}: {
  isModal?: boolean;
  reason?: string | null;
  onContinueWithoutLogin?: () => void;
  onCloseModal?: () => void;
}) {
  const { apiUrl, signInSuccess } = useApp();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const res = await loginOrSignUp(apiUrl, {
        mode,
        email,
        password,
        firstName: mode === 'signup' ? firstName : undefined,
        lastName: mode === 'signup' ? lastName : undefined,
      });
      await signInSuccess(res.user, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Top corner bar: "Continue without login" or Modal close */}
        <View style={styles.topRow}>
          <View style={styles.brandMini}>
            <View style={styles.brandMiniIcon}>
              <RouteIcon color={COLORS.accent} size={16} />
            </View>
            <Text style={styles.brandMiniText}>EasyDel</Text>
          </View>

          {isModal && onCloseModal ? (
            <TouchableOpacity style={styles.skipBtn} onPress={onCloseModal} activeOpacity={0.8}>
              <X color={COLORS.inkDim} size={16} />
              <Text style={styles.skipText}>Not now</Text>
            </TouchableOpacity>
          ) : onContinueWithoutLogin ? (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={onContinueWithoutLogin}
              activeOpacity={0.8}
            >
              <Text style={styles.skipText}>Continue without login</Text>
              <ArrowRight color={COLORS.accent} size={15} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </Text>
            <Text style={styles.subtitle}>
              {reason ||
                (mode === 'login'
                  ? 'Sign in to sync your saved routes, codes, and delivery runs.'
                  : 'Save shared beats, notes, and offline routes under your name.')}
            </Text>

            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}
                onPress={() => {
                  setMode('login');
                  setError(null);
                }}
              >
                <Text style={[styles.modeTabText, mode === 'login' && styles.modeTabTextActive]}>
                  Sign in
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeTab, mode === 'signup' && styles.modeTabActive]}
                onPress={() => {
                  setMode('signup');
                  setError(null);
                }}
              >
                <Text style={[styles.modeTabText, mode === 'signup' && styles.modeTabTextActive]}>
                  Sign up
                </Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {mode === 'signup' ? (
              <View style={styles.row2}>
                <View style={styles.halfInput}>
                  <Text style={styles.label}>First name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Sam"
                    placeholderTextColor={COLORS.inkFaint}
                    value={firstName}
                    onChangeText={setFirstName}
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.label}>Last name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Carrier"
                    placeholderTextColor={COLORS.inkFaint}
                    value={lastName}
                    onChangeText={setLastName}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.inkFaint}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
                placeholderTextColor={COLORS.inkFaint}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.accentInk} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </Text>
              )}
            </TouchableOpacity>

            {!isModal && onContinueWithoutLogin ? (
              <TouchableOpacity
                style={styles.guestFooter}
                onPress={onContinueWithoutLogin}
                activeOpacity={0.8}
              >
                <Text style={styles.guestFooterText}>
                  Just exploring? <Text style={styles.guestFooterAccent}>Skip &amp; enter a route code</Text>
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  brandMini: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMiniIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMiniText: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  skipText: { fontSize: 12, fontWeight: '600', color: COLORS.ink },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.ink },
  subtitle: { fontSize: 13, color: COLORS.inkDim, marginTop: 6, lineHeight: 19 },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    padding: 4,
    marginTop: 18,
    marginBottom: 16,
  },
  modeTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeTabActive: { backgroundColor: COLORS.panel2 },
  modeTabText: { fontSize: 13, fontWeight: '600', color: COLORS.inkDim },
  modeTabTextActive: { color: COLORS.ink },
  errorBox: {
    backgroundColor: COLORS.badSoft,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorText: { fontSize: 13, color: COLORS.ink },
  row2: { flexDirection: 'row', gap: 10 },
  halfInput: { flex: 1, marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.inkDim, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.ink,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.accentInk },
  guestFooter: { marginTop: 16, alignItems: 'center' },
  guestFooterText: { fontSize: 13, color: COLORS.inkDim },
  guestFooterAccent: { color: COLORS.accent, fontWeight: '600' },
});
