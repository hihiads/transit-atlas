import { Capacitor } from '@capacitor/core';

const configuredApiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const nativeApiOrigin = (import.meta.env.VITE_NATIVE_API_URL || 'https://transitly.eu').replace(/\/$/, '');

export const API_ORIGIN = Capacitor.isNativePlatform()
  ? nativeApiOrigin
  : configuredApiOrigin;

export const API_ROOT = `${API_ORIGIN}/api`;

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}
