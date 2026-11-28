import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Edit3, KeyRound, MapPin, Pause, Play, Plus, Search, Share2, Upload } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import {
  createLocationApi,
  editLocationApi,
  importLocationsCsvApi,
  saveCodeToAccount,
  updateLocationStatusApi,
} from '../lib/api';
import type { MobileLocation } from '../lib/types';
import { COLORS } from '../theme';

export default function LocationsScreen() {
  const { apiUrl, locations, requireToken, refreshWorkspace } = useApp();

  const [query, setQuery] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [csvText, setCsvText] = useState('');

  const [editingLoc, setEditingLoc] = useState<MobileLocation | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editEntrance, setEditEntrance] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editNextVisit, setEditNextVisit] = useState('');

  const [name, setName] = useState('');
  const [linkOrAddress, setLinkOrAddress] = useState('');
  const [coords, setCoords] = useState('13.6288, 79.4192');
  const [entrance, setEntrance] = useState('');
  const [item, setItem] = useState('Newspaper');
  const [qty, setQty] = useState('1');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.shareCode?.toLowerCase().includes(q) ?? false),
    );
  }, [locations, query]);

  async function handleAddByCode() {
    if (!codeInput.trim()) return;
    setLoading(true);
    setMsg(null);
    try {
      await requireToken('Sign in to add a location by code.', async (tok) => {
        const res = await saveCodeToAccount(apiUrl, tok, codeInput.trim());
        await refreshWorkspace(tok);
        setCodeInput('');
        setMsg(`Added "${res.name}" to your locations!`);
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Code lookup failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateLocation() {
    setLoading(true);
    setMsg(null);
    try {
      await requireToken('Sign in to add a delivery location.', async (tok) => {
        const isLink = /http|maps\.|goo\.gl/i.test(linkOrAddress);
        const [latStr, lngStr] = coords.split(',').map((s) => s.trim());
        const res = await createLocationApi(apiUrl, tok, {
          name,
          link: isLink ? linkOrAddress : undefined,
          address: isLink ? undefined : linkOrAddress,
          latitude: isLink ? undefined : Number(latStr),
          longitude: isLink ? undefined : Number(lngStr),
          entranceInstructions: entrance,
          productType: item,
          quantity: Number(qty) || 1,
        });
        await refreshWorkspace(tok);
        setName('');
        setLinkOrAddress('');
        setEntrance('');
        setShowAdd(false);
        setMsg(`Created "${res.name}" · Code ${res.shareCode}`);
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not create location.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCsvImport() {
    setLoading(true);
    setMsg(null);
    try {
      await requireToken('Sign in to import locations.', async (tok) => {
        const res = await importLocationsCsvApi(apiUrl, tok, csvText);
        await refreshWorkspace(tok);
        setCsvText('');
        setShowCsv(false);
        setMsg(`Imported ${res.imported} location(s)!`);
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(loc: MobileLocation) {
    setEditingLoc(loc);
    setEditName(loc.name);
    setEditAddress(loc.address);
    setEditEntrance(loc.entranceInstructions ?? '');
    setEditNotes(loc.notes ?? '');
    setEditNextVisit(loc.nextVisitNote ?? '');
  }

  async function saveEdit() {
    if (!editingLoc) return;
    setLoading(true);
    setMsg(null);
    try {
      await requireToken('Sign in to edit locations.', async (tok) => {
        await editLocationApi(apiUrl, tok, {
          id: editingLoc.id,
          name: editName,
          address: editAddress,
          entranceInstructions: editEntrance,
          notes: editNotes,
          nextVisitNote: editNextVisit,
        });
        await refreshWorkspace(tok);
        setEditingLoc(null);
        setMsg('Location updated!');
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not update location.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(id: string, current: string) {
    const next = current === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await requireToken('Sign in to update location status.', async (tok) => {
        await updateLocationStatusApi(apiUrl, tok, id, next);
        await refreshWorkspace(tok);
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Status update failed.');
    }
  }

  async function shareLocation(locName: string, code: string | null) {
    if (!code) return;
    try {
      await Share.share({
        title: locName,
        message: `Add "${locName}" on EasyDel using location code: ${code}`,
      });
    } catch {
      // Dismissed.
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headRow}>
          <Text style={styles.title}>Locations ({locations.length})</Text>
          <View style={styles.codeRow}>
            <TouchableOpacity style={styles.csvBtn} onPress={() => setShowCsv((s) => !s)}>
              <Upload color={COLORS.ink} size={14} />
              <Text style={styles.statusBtnText}>CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd((s) => !s)}>
              <Plus color={COLORS.accentInk} size={15} />
              <Text style={styles.addBtnText}>{showAdd ? 'Close' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {msg ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{msg}</Text>
          </View>
        ) : null}

        {/* Add by 8-char location code */}
        <View style={styles.card}>
          <View style={styles.codeHead}>
            <KeyRound color={COLORS.accent} size={15} />
            <Text style={styles.cardTitle}>Add location by code</Text>
          </View>
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              placeholder="e.g. DMHOUSE1"
              placeholderTextColor={COLORS.inkFaint}
              autoCapitalize="characters"
              value={codeInput}
              onChangeText={setCodeInput}
            />
            <TouchableOpacity style={styles.codeGo} onPress={handleAddByCode} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={COLORS.accentInk} size="small" />
              ) : (
                <Text style={styles.addBtnText}>Add</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {showCsv ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Bulk CSV import</Text>
            <Text style={styles.sub}>Columns: Name, Address, Latitude, Longitude, ProductType, Qty</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              multiline
              placeholder={'Name,Address,Latitude,Longitude,Type,Qty\nOak House,12 Main St,13.631,79.421,Newspaper,2'}
              placeholderTextColor={COLORS.inkFaint}
              value={csvText}
              onChangeText={setCsvText}
            />
            <TouchableOpacity style={styles.saveLocBtn} onPress={handleCsvImport}>
              <Text style={styles.addBtnText}>Import CSV rows</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {editingLoc ? (
          <View style={[styles.card, { borderColor: 'rgba(245, 158, 11, 0.5)' }]}>
            <Text style={styles.cardTitle}>Edit: {editingLoc.name}</Text>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Name" placeholderTextColor={COLORS.inkFaint} />
            <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} placeholder="Address" placeholderTextColor={COLORS.inkFaint} />
            <TextInput style={styles.input} value={editEntrance} onChangeText={setEditEntrance} placeholder="Entrance instructions" placeholderTextColor={COLORS.inkFaint} />
            <TextInput style={styles.input} value={editNotes} onChangeText={setEditNotes} placeholder="Delivery notes" placeholderTextColor={COLORS.inkFaint} />
            <TextInput style={styles.input} value={editNextVisit} onChangeText={setEditNextVisit} placeholder="Next-visit reminder" placeholderTextColor={COLORS.inkFaint} />
            <View style={[styles.codeRow, { marginTop: 10 }]}>
              <TouchableOpacity style={[styles.saveLocBtn, styles.flex, { marginTop: 0 }]} onPress={saveEdit}>
                <Text style={styles.addBtnText}>Save changes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statusBtn} onPress={() => setEditingLoc(null)}>
                <Text style={styles.statusBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Manual / Link Location Creator */}
        {showAdd ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>New delivery location</Text>
            <TextInput
              style={styles.input}
              placeholder="House / Building name *"
              placeholderTextColor={COLORS.inkFaint}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Google Maps link OR street address"
              placeholderTextColor={COLORS.inkFaint}
              value={linkOrAddress}
              onChangeText={setLinkOrAddress}
            />
            <TextInput
              style={styles.input}
              placeholder="Lat, Lng (if no Maps link)"
              placeholderTextColor={COLORS.inkFaint}
              value={coords}
              onChangeText={setCoords}
            />
            <TextInput
              style={styles.input}
              placeholder="Entrance instructions (optional)"
              placeholderTextColor={COLORS.inkFaint}
              value={entrance}
              onChangeText={setEntrance}
            />
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="Item (e.g. Newspaper)"
                placeholderTextColor={COLORS.inkFaint}
                value={item}
                onChangeText={setItem}
              />
              <TextInput
                style={[styles.input, { width: 65 }]}
                placeholder="Qty"
                keyboardType="number-pad"
                value={qty}
                onChangeText={setQty}
              />
            </View>
            <TouchableOpacity style={styles.saveLocBtn} onPress={handleCreateLocation}>
              <Text style={styles.addBtnText}>Save Location</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Search */}
        <View style={styles.searchBox}>
          <Search color={COLORS.inkFaint} size={15} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search saved locations or codes…"
            placeholderTextColor={COLORS.inkFaint}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {filtered.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.sub}>
              No locations saved yet. Sign in and add one above, or enter a location code!
            </Text>
          </View>
        ) : (
          filtered.map((loc) => (
            <View key={loc.id} style={styles.card}>
              <View style={styles.locTop}>
                <View style={styles.flex}>
                  <Text style={styles.locName}>{loc.name}</Text>
                  <Text style={styles.sub}>
                    <MapPin color={COLORS.inkFaint} size={11} /> {loc.address}
                  </Text>
                  <Text style={styles.itemsMeta}>
                    {loc.activeItems} item{loc.activeItems === 1 ? '' : 's'} · {loc.status}
                  </Text>
                </View>

                {loc.shareCode ? (
                  <TouchableOpacity
                    style={styles.codeBadge}
                    onPress={() => void shareLocation(loc.name, loc.shareCode)}
                  >
                    <Share2 color={COLORS.accent} size={12} />
                    <Text style={styles.codeBadgeText}>{loc.shareCode}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={[styles.locActions, { gap: 8 }]}>
                <TouchableOpacity style={styles.statusBtn} onPress={() => startEdit(loc)}>
                  <Edit3 color={COLORS.ink} size={13} />
                  <Text style={styles.statusBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.statusBtn}
                  onPress={() => void toggleStatus(loc.id, loc.status)}
                >
                  {loc.status === 'ACTIVE' ? (
                    <Pause color={COLORS.inkDim} size={13} />
                  ) : (
                    <Play color={COLORS.ok} size={13} />
                  )}
                  <Text style={styles.statusBtnText}>
                    {loc.status === 'ACTIVE' ? 'Pause' : 'Restore'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.ink },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.accentInk },
  banner: { backgroundColor: COLORS.infoSoft, borderRadius: 10, padding: 10, marginBottom: 12 },
  bannerText: { fontSize: 12, color: COLORS.ink },
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  codeHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  codeRow: { flexDirection: 'row', gap: 8 },
  codeInput: {
    flex: 1,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.ink,
    fontWeight: '700',
  },
  codeGo: {
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.ink,
    marginTop: 8,
  },
  saveLocBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: COLORS.ink },
  locTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  locName: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  sub: { fontSize: 12, color: COLORS.inkDim, marginTop: 2 },
  itemsMeta: { fontSize: 11, fontWeight: '600', color: COLORS.accent, marginTop: 4 },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  codeBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  locActions: { flexDirection: 'row', marginTop: 10 },
  statusBtn: {
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
  statusBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.ink },
  csvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.borderBright,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
