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
import { useApp } from '../context/AppContext';
import { submitContactApi } from '../lib/api';
import { COLORS } from '../theme';

export default function SupportScreen() {
  const { apiUrl, token, user } = useApp();
  const [name, setName] = useState(user ? `${user.firstName} ${user.lastName}`.trim() : '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function handleSend() {
    setStatusMsg(null);
    try {
      const res = await submitContactApi(apiUrl, token, {
        name,
        email,
        topic: 'Mobile app',
        subject,
        message,
      });
      setStatusMsg(`Message sent! Ticket ${res.ticketId}`);
      setSubject('');
      setMessage('');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not send message.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>About EasyDel</Text>
          <Text style={styles.body}>
            EasyDel helps newspaper carriers and local delivery riders learn routes quickly using
            house photos, entrance clues, next-visit reminders, offline memorization quizzes, and
            8-letter route &amp; location share codes.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Contact support</Text>
          {statusMsg ? <Text style={styles.status}>{statusMsg}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={COLORS.inkFaint}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.inkFaint}
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Subject"
            placeholderTextColor={COLORS.inkFaint}
            value={subject}
            onChangeText={setSubject}
          />
          <TextInput
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            placeholder="How can we help?"
            placeholderTextColor={COLORS.inkFaint}
            multiline
            value={message}
            onChangeText={setMessage}
          />

          <TouchableOpacity style={styles.btn} onPress={handleSend}>
            <Text style={styles.btnText}>Send message</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.ink, marginBottom: 8 },
  body: { fontSize: 13, color: COLORS.inkDim, lineHeight: 20 },
  status: { fontSize: 12, color: COLORS.ok, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.ink,
    marginBottom: 10,
  },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { fontSize: 14, fontWeight: '700', color: COLORS.accentInk },
});
