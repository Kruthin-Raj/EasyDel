import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function RouteMapScreen() {
  return (
    <View style={styles.container}>
      {/* Map rendering will go here once maplibre-react-native or expo-location is fully configured */}
      <View style={styles.mapPlaceholder}>
        <Text style={styles.placeholderText}>MapLibre Native View</Text>
        <Text style={styles.subText}>Requires native map module compilation</Text>
      </View>
      
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>Next Stop: 456 Hill St</Text>
        <Text style={styles.overlaySubText}>2.4 miles • 8 mins</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  subText: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
  },
  overlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  overlayText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  overlaySubText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
});
