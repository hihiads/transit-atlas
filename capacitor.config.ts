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
    }
  }
};

export default config;
