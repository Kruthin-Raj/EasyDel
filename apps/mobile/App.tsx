import React, { useState } from 'react';
import { Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Building2, CircleDot, Home, ListChecks, Route as RouteIcon } from 'lucide-react-native';

import { AppProvider, useApp } from './src/context/AppContext';
import SplashIntro from './src/components/SplashIntro';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import RoutesScreen from './src/screens/RoutesScreen';
import RecordScreen from './src/screens/RecordScreen';
import LocationsScreen from './src/screens/LocationsScreen';
import DeliveryQueueScreen from './src/screens/DeliveryQueueScreen';
import MemorizeScreen from './src/screens/MemorizeScreen';
import RouteMapScreen from './src/screens/RouteMapScreen';
import FromLinksScreen from './src/screens/FromLinksScreen';
import CreateRouteScreen from './src/screens/CreateRouteScreen';
import EditRouteScreen from './src/screens/EditRouteScreen';
import ActivityScreen from './src/screens/ActivityScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SupportScreen from './src/screens/SupportScreen';
import { COLORS } from './src/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.panel,
          borderTopColor: COLORS.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.inkFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => {
          if (route.name === 'Home') return <Home color={color} size={size} />;
          if (route.name === 'Routes') return <RouteIcon color={color} size={size} />;
          if (route.name === 'Record') return <CircleDot color={color} size={size} />;
          if (route.name === 'Locations') return <Building2 color={color} size={size} />;
          return <ListChecks color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Routes" component={RoutesScreen} options={{ title: 'Routes' }} />
      <Tab.Screen name="Record" component={RecordScreen} options={{ title: 'Record' }} />
      <Tab.Screen name="Locations" component={LocationsScreen} options={{ title: 'Locations' }} />
      <Tab.Screen name="Queue" component={DeliveryQueueScreen} options={{ title: 'Deliver' }} />
    </Tab.Navigator>
  );
}

function RootShell() {
  const { user, isGuest, enterAsGuest, showAuthModal, authPromptReason, closeAuthModal } = useApp();
  const [splashDone, setSplashDone] = useState(false);

  if (!splashDone) {
    return <SplashIntro onDone={() => setSplashDone(true)} />;
  }

  if (!user && !isGuest) {
    return <AuthScreen onContinueWithoutLogin={enterAsGuest} />;
  }

  return (
    <>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.panel },
            headerTintColor: COLORS.ink,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: COLORS.bg },
          }}
        >
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="Memorize" component={MemorizeScreen} options={{ title: 'Memorize Route' }} />
          <Stack.Screen name="Map" component={RouteMapScreen} options={{ title: 'Route Map' }} />
          <Stack.Screen name="FromLinks" component={FromLinksScreen} options={{ title: 'From Maps Links' }} />
          <Stack.Screen name="CreateRoute" component={CreateRouteScreen} options={{ title: 'New Route' }} />
          <Stack.Screen name="EditRoute" component={EditRouteScreen} options={{ title: 'Edit Route' }} />
          <Stack.Screen name="Activity" component={ActivityScreen} options={{ title: 'History & Reports' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="Support" component={SupportScreen} options={{ title: 'About & Contact' }} />
        </Stack.Navigator>
      </NavigationContainer>

      {/* Triggered automatically when a Guest tries to save, create, or sync */}
      <Modal visible={showAuthModal} animationType="slide" onRequestClose={closeAuthModal}>
        <AuthScreen isModal reason={authPromptReason} onCloseModal={closeAuthModal} />
      </Modal>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <StatusBar style="light" />
      <RootShell />
    </AppProvider>
  );
}
