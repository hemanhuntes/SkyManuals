import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import SplashScreen from '@expo/splash-screen';
import * as Updates from 'expo-updates';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DeviceInfo from 'react-native-device-info';
import { AuthService } from './services/auth.service';
import { CacheManagerService } from './services/cache-manager.service';
import { ManualReader } from './components/ManualReader';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

type AppState = 'login' | 'reader' | 'error' | 'loading';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [authState, setAuthState] = useState<any>(null);
  const [selectedManual, setSelectedManual] = useState<string | null>(null);
  const [loginData, setLoginData] = useState({ email: '', password: '' });

  const authService = AuthService.getInstance();
  const cacheManager = CacheManagerService.getInstance();

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check authentication state
      const auth = await authService.getAuthState();
      setAuthState(auth);
      
      if (auth.isAuthenticated) {
        setAppState('reader');
      } else {
        setAppState('login');
      }
      
    } catch (error) {
      console.error('App initialization failed:', error);
      setAppState('error');
    } finally {
      await SplashScreen.hideAsync();
    }
  };

  const handleLogin = async () => {
    try {
      setAppState('loading');
      
      const auth = await authService.login(loginData);
      setAuthState(auth);
      
      setAppState('reader');
      loadAvailableManuals();
      
    } catch (error) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
      setAppState('login');
    }
  };

  const loadAvailableManuals = async () => {
    try {
      // Simulate loading available manuals
      console.log('Loading available manuals...');
      
      // Check for cache updates
      await cacheManager.checkForUpdates('device-id-placeholder');
      
    } catch (error) {
      console.error('Failed to load manuals:', error);
    }
  };

  const handleManualSelection = (manualId: string) => {
    setSelectedManual(manualId);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
      setAuthState({ isAuthenticated: false });
      setAppState('login');
      setSelectedManual(null);
      
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const renderLoginScreen = () => (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>SkyManuals EFB</Text>
        <Text style={styles.subtitle}>Electronic Flight Bag</Text>
        
        <View style={styles.formContainer}>
          <Text style={styles.formLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={loginData.email}
            onChangeText={(text) => setLoginData({ ...loginData, email: text })}
            placeholder="Enter your email"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          
          <Text style={styles.formLabel}>Password</Text>
          <TextInput
            style={styles.input}
            value={loginData.password}
            onChangeText={(text) => setLoginData({ ...loginData, password: text })}
            placeholder="Enter your password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
          />
          
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleLogin}
            disabled={!loginData.email.trim() || !loginData.password.trim()}
          >
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  const renderReaderScreen = () => {
    if (selectedManual) {
      return (
        <ManualReader 
          manualId={selectedManual}
          onManualClose={() => setSelectedManual(null)}
        />
      );
    }

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.readerHeader}>
          <Text style={styles.title}>Available Manuals</Text>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.manualList}>
          <Text style={styles.manualListTitle}>
            Welcome, {authState?.userProfile?.name || 'User'}!
          </Text>
          
          {/* Simulate manual list */}
          <TouchableOpacity
            style={styles.manualItem}
            onPress={() => handleManualSelection('manual-737-v1')}
          >
            <Text style={styles.manualItemTitle}>Boeing 737 Flight Manual</Text>
            <Text style={styles.manualItemVersion}>Version 1.2.0</Text>
            <Text style={styles.manualItemStatus}>Available Offline ✓</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.manualItem}
            onPress={() => handleManualSelection('manual-a320-v1')}
          >
            <Text style={styles.manualItemTitle}>Airbus A320 Operations Manual</Text>
            <Text style={styles.manualItemVersion}>Version 2.1.0</Text>
            <Text style={styles.manualItemStatusDownload}>Download Required</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  };

  const renderLoadingScreen = () => (
    <SafeAreaView style={styles.container}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    </SafeAreaView>
  );

  const renderErrorScreen = () => (
    <SafeAreaView style={styles.container}>
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Initialization Error</Text>
        <Text style={styles.errorText}>
          Unable to initialize the EFB application. Please restart the app.
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={initializeApp}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // Switch between screens based on app state
  switch (appState) {
    case 'login':
      return renderLoginScreen();
    case 'reader':
      return renderReaderScreen();
    case 'error':
      return renderErrorScreen();
    case 'loading':
    default:
      return renderLoadingScreen();
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  formContainer: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginVertical: 4,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  readerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#dc2626',
    borderRadius: 6,
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  manualList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  manualListTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  manualItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  manualItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  manualItemVersion: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  manualItemStatus: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
  },
  manualItemStatusDownload: {
    fontSize: 12,
    color: '#d97706',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
});