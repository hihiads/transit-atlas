import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface DeviceCoordinates {
  latitude: number;
  longitude: number;
}

export interface DevicePosition {
  coords: DeviceCoordinates;
}

export interface DevicePositionError {
  code: number;
  PERMISSION_DENIED: number;
}

const permissionDeniedCode = 1;

export function getDevicePosition(
  success: (position: DevicePosition) => void,
  failure: (error: DevicePositionError) => void,
  options: PositionOptions
) {
  if (!Capacitor.isNativePlatform()) {
    if (!navigator.geolocation) {
      failure({ code: 2, PERMISSION_DENIED: permissionDeniedCode });
      return;
    }
    navigator.geolocation.getCurrentPosition(success as PositionCallback, failure as PositionErrorCallback, options);
    return;
  }

  void (async () => {
    const permissions = await Geolocation.requestPermissions();
    if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
      failure({ code: permissionDeniedCode, PERMISSION_DENIED: permissionDeniedCode });
      return;
    }
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options.enableHighAccuracy,
      timeout: options.timeout,
      maximumAge: options.maximumAge
    });
    success({ coords: { latitude: position.coords.latitude, longitude: position.coords.longitude } });
  })().catch(() => failure({ code: 2, PERMISSION_DENIED: permissionDeniedCode }));
}
