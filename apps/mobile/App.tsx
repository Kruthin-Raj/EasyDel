import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Map, List, Settings } from 'lucide-react-native';
import React from 'react';

// Screens
import RouteMapScreen from './src/screens/RouteMapScreen';
import DeliveryQueueScreen from './src/screens/DeliveryQueueScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            if (route.name === 'Map') return <Map color={color} size={size} />;
            if (route.name === 'Queue') return <List color={color} size={size} />;
            if (route.name === 'Settings') return <Settings color={color} size={size} />;
          },
          tabBarActiveTintColor: '#2563eb',
          tabBarInactiveTintColor: 'gray',
        })}
      >
        <Tab.Screen name="Queue" component={DeliveryQueueScreen} options={{ title: 'Deliveries' }} />
        <Tab.Screen name="Map" component={RouteMapScreen} options={{ title: 'Route Map' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
