import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import DeviceInfo from 'react-native-device-info';
import { Platform } from 'react-native';

interface DeviceInfo {
  deviceModel: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  deviceName: string;
  deviceId: string;
  hardwareId: string;
}

interface EnrollmentResponse {
  id: string;
  status: 'PENDING_ENROLLMENT' | 'ACTIVE' | 'SUSPENDED';
  organizationId: string;
  sessionToken: string;
  policies?: any[];
}

interface LoginCredentials {
  email: string;
  password: string;
  organizationId?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  sessionToken?: string;
  userId?: string;
  organizationId?: string;
  deviceId?: string;
  userProfile?: any;
}

const API_BASE_URL = 'https://api.skymanuals.com'; // Would be from env

export class AuthService {
  private static instance: AuthService;
  private authState: AuthState = {
    isAuthenticated: false,
  };

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const deviceId = await DeviceInfo.getUniqueId();
    const hardwareId = await DeviceInfo.getBuildId();
    const deviceName = await DeviceInfo.getDeviceName();
    const osVersion = DeviceInfo.getSystemVersion();
    const appVersion = DeviceInfo.getVersion();

    // Determine device model based on platform
    let deviceModel: string;
    if (Platform.OS === 'ios') {
      const model = DeviceInfo.getModel();
      deviceModel = model.includes('iPad') ? 'iPad' : 'iPhone';
    } else {
      deviceModel = Platform.select({
        android: 'Android_Tablet', // Could be Phone/Tablet based on screen size
        default: 'Windows_Tablet',
      }) as string;
    }

    return {
      deviceModel,
      platform: Platform.select({
        ios: 'iOS',
        android: 'Android',
        default: 'Windows',
      }) as string,
      osVersion,
      appVersion,
      deviceName: deviceName || 'Unknown Device',
      deviceId,
      hardwareId,
    };
  }

  async checkSecurityCompliance(): Promise<any> {
    try {
      const isJailbroken = await DeviceInfo.isEmulator(); // Simplified check
      const hasDeveloperMode = __DEV__; // React Native development mode
      const encryptionSupported = true; // Assume supported on all platforms
      
      // Check if biometric authentication is available
      const biometricAuthSupported = Platform.OS === 'ios' || Platform.OS === 'android';
      
      return {
        isJailbroken,
        hasDeveloperMode,
        encryptionSupported,
        biometricAuthSupported,
      };
    } catch (error) {
      console.error('Security compliance check failed:', error);
      return {
        isJailbroken: false,
        hasDeveloperMode: false,
        encryptionSupported: true,
        biometricAuthSupported: false,
      };
    }
  }

  async enrollDevice(organizationIdentifier: string): Promise<EnrollmentResponse> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      const securityInfo = await this.checkSecurityCompliance();

      const enrollmentData = {
        ...deviceInfo,
        organizationIdentifier,
        securityInfo,
      };

      const response = await fetch(`${API_BASE_URL}/efb/devices/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enrollmentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Enrollment failed: ${errorData.message || 'Unknown error'}`);
      }

      const enrollment = await response.json();
      
      // Store enrollment session token
      if (enrollment.sessionToken) {
        await SecureStore.setItemAsync('enrollment_token', enrollment.sessionToken);
      }

      return enrollment;
    } catch (error) {
      console.error('Device enrollment failed:', error);
      throw error;
    }
  }

  async approveDevice(code: string): Promise<AuthState> {
    try {
      // In a real implementation, this would involve scanning QR code
      // or entering approval code from admin interface
      const sessionToken = await SecureStore.getItemAsync('enrollment_token');
      
      if (!sessionToken) {
        throw new Error('No enrollment session found');
      }

      // Simulate approval process - in reality would validate code and get approval
      const response = await fetch(`${API_BASE_URL}/efb/devices/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ 
          // In reality, would include device ID and approval verification
        }),
      });

      if (!response.ok) {
        throw new Error('Device approval failed');
      }

      const approvalData = await response.json();
      
      // Store auth state
      this.authState = {
        isAuthenticated: true,
        sessionToken: approvalData.session.sessionToken,
        userId: approvalData.session.userId,
        organizationId: approvalData.device.organizationId,
        deviceId: approvalData.device.id,
        userProfile: approvalData.user,
      };

      // Persist auth state
      await this.saveAuthState();
      
      return this.authState;
    } catch (error) {
      console.error('Device approval failed:', error);
      throw error;
    }
  }

  async login(credentials: LoginCredentials): Promise<AuthState> {
    try {
      // In a pre-enrolled device, users can login directly
      const deviceInfo = await this.getDeviceInfo();
      
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': deviceInfo.deviceId,
          'X-Device-Model': deviceInfo.deviceModel,
          'X-Platform': deviceInfo.platform,
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Login failed: ${errorData.message || 'Invalid credentials'}`);
      }

      const loginData = await response.json();
      
      this.authState = {
        isAuthenticated: true,
        sessionToken: loginData.sessionToken,
        userId: loginData.user.id,
        organizationId: loginData.user.organizationId,
        deviceId: loginData.deviceId,
        userProfile: loginData.user,
      };

      await this.saveAuthState();
      
      return this.authState;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.authState.sessionToken) {
        // Notify server of logout
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.authState.sessionToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout notification failed:', error);
    } finally {
      // Clear local auth state regardless of server response
      this.authState = { isAuthenticated: false };
      await this.clearAuthState();
    }
  }

  async getAuthState(): Promise<AuthState> {
    if (this.authState.isAuthenticated) {
      return this.authState;
    }

    // Try to restore from storage
    try {
      const savedSessionToken = await SecureStore.getItemAsync('session_token');
      const savedUserId = await AsyncStorage.getItem('user_id');
      const savedOrganizationId = await AsyncStorage.getItem('organization_id');
      const savedDeviceId = await AsyncStorage.getItem('device_id');

      if (savedSessionToken && savedUserId && savedOrganizationId) {
        this.authState = {
          isAuthenticated: true,
          sessionToken: savedSessionToken,
          userId: savedUserId,
          organizationId: savedOrganizationId,
          deviceId: savedDeviceId || undefined,
        };

        // Verify session is still valid
        try {
          const response = await fetch(`${API_BASE_URL}/auth/verify`, {
            headers: {
              'Authorization': `Bearer ${savedSessionToken}`,
            },
          });

          if (!response.ok) {
            // Session invalid, clear auth state
            await this.clearAuthState();
            this.authState = { isAuthenticated: false };
          }
        } catch (error) {
          console.error('Session verification failed:', error);
          await this.clearAuthState();
          this.authState = { isAuthenticated: false };
        }
      }
    } catch (error) {
      console.error('Failed to restore auth state:', error);
    }

    return this.authState;
  }

  async saveAuthState(): Promise<void> {
    try {
      if (this.authState.sessionToken) {
        await SecureStore.setItemAsync('session_token', this.authState.sessionToken);
      }
      if (this.authState.userId) {
        await AsyncStorage.setItem('user_id', this.authState.userId);
      }
      if (this.authState.organizationId) {
        await AsyncStorage.setItem('organization_id', this.authState.organizationId);
      }
      if (this.authState.deviceId) {
        await AsyncStorage.setItem('device_id', this.authState.deviceId);
      }
      if (this.authState.userProfile) {
        await AsyncStorage.setItem('user_profile', JSON.stringify(this.authState.userProfile));
      }
    } catch (error) {
      console.error('Failed to save auth state:', error);
    }
  }

  async clearAuthState(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync('session_token');
      await SecureStore.deleteItemAsync('enrollment_token');
      await AsyncStorage.multiRemove([
        'user_id',
        'organization_id',
        'device_id',
        'user_profile',
      ]);
    } catch (error) {
      console.error('Failed to clear auth state:', error);
    }
  }

  getAuthenticatedHeaders(): Record<string, string> {
    if (!this.authState.sessionToken) {
      return {};
    }

    return {
      'Authorization': `Bearer ${this.authState.sessionToken}`,
      'Content-Type': 'application/json',
    };
  }

  async makeAuthenticatedRequest(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const headers = {
      ...this.getAuthenticatedHeaders(),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Token expired, clear auth state
      await this.clearAuthState();
      this.authState = { isAuthenticated: false };
      throw new Error('Authentication required');
    }

    return response;
  }

  async getPolicies(): Promise<any[]> {
    try {
      const response = await this.makeAuthenticatedRequest('/efb/devices/policies');
      
      if (!response.ok) {
        throw new Error('Failed to fetch policies');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch policies:', error);
      return [];
    }
  }

  async logAnalytics(action: string, targetId?: string, metadata?: any): Promise<void> {
    try {
      await this.makeAuthenticatedRequest('/efb/devices/analytics', {
        method: 'POST',
        body: JSON.stringify({
          userId: this.authState.userId,
          organizationId: this.authState.organizationId,
          action,
          targetId,
          metadata,
        }),
      });
    } catch (error) {
      console.error('Failed to log analytics:', error);
      // Don't throw - analytics failures shouldn't crash the app
    }
  }
}
