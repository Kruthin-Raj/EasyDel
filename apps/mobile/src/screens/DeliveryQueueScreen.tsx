import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckCircle, Circle } from 'lucide-react-native';

const mockDeliveries = [
  { id: '1', address: '123 Main St, Apt 4B', status: 'COMPLETED', customer: 'John Doe' },
  { id: '2', address: '456 Hill St', status: 'PENDING', customer: 'Jane Smith' },
  { id: '3', address: '789 Market St, Ste 200', status: 'PENDING', customer: 'Office Supplies Inc' },
];

export default function DeliveryQueueScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today's Route</Text>
        <Text style={styles.subtitle}>Route 1A - 3 Stops Remaining</Text>
      </View>

      <FlatList
        data={mockDeliveries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <View style={styles.cardHeader}>
              {item.status === 'COMPLETED' ? (
                <CheckCircle color="#10b981" size={24} />
              ) : (
                <Circle color="#9ca3af" size={24} />
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.address}>{item.address}</Text>
                <Text style={styles.customer}>{item.customer}</Text>
              </View>
            </View>
            {item.status !== 'COMPLETED' && (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Mark Delivered</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    marginLeft: 12,
    flex: 1,
  },
  address: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  customer: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  actions: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 16,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
});
