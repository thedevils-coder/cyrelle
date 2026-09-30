import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: '#070708' },
      headerTintColor: '#f4f4f6',
      tabBarStyle: { backgroundColor: '#070708', borderTopColor: 'rgba(212,175,186,0.35)' },
      tabBarActiveTintColor: '#d4146a',
      tabBarInactiveTintColor: '#a7a7b0',
    }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="appointments" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
