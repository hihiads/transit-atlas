import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'eu.transitly.app',
  appName: 'Transitly',
  webDir: 'dist',
  loggingBehavior: 'none',
  backgroundColor: '#071a2b',
  plugins: {
    LocalNotifications: {
      presentationOptions: ['sound', 'banner', 'list']
    },
    PushNotifications: {
      // Show remote alerts (late, early, arriving) also while the app is open.
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
