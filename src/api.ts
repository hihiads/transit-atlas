import { City, VehicleResponse, VehicleProfile, StopsResponse, RoutesResponse, StopDeparturesResponse, SystemStatus, TransitShape } from './types';
import { API_ROOT } from './services/platform';

export interface AuthStatus {
  loginEnabled: boolean;
  registrationEnabled: boolean;
  authenticationActive: boolean;
}

export const api = {
  async getAuthStatus(): Promise<AuthStatus> {
    const res = await fetch(`${API_ROOT}/auth/status`);
    if (!res.ok) throw new Error('Failed to fetch authentication status');
    return res.json();
  },
  async getCities(): Promise<City[]> {
    const res = await fetch(`${API_ROOT}/cities`);
    if (!res.ok) throw new Error('Failed to fetch cities');
    return res.json();
  },

  async getVehicles(cityId: string): Promise<VehicleResponse> {
    const res = await fetch(`${API_ROOT}/vehicles/${cityId}`);
    if (!res.ok) throw new Error('Failed to fetch vehicles');
    return res.json();
  },

  async getStops(cityId: string): Promise<StopsResponse> {
    const res = await fetch(`${API_ROOT}/stops/${cityId}`);
    if (!res.ok) throw new Error('Failed to fetch stops');
    return res.json();
  },

  async getRoutes(cityId: string): Promise<RoutesResponse> {
    const res = await fetch(`${API_ROOT}/routes/${cityId}`);
    if (!res.ok) throw new Error('Failed to fetch routes');
    return res.json();
  },

  async getShapes(cityId: string): Promise<{ shapes: TransitShape[]; status: 'loaded' | 'unavailable' }> {
    const res = await fetch(`${API_ROOT}/shapes/${cityId}`);
    if (!res.ok) throw new Error('Failed to fetch route shapes');
    return res.json();
  },

  async getStopDepartures(cityId: string, stopId: string): Promise<StopDeparturesResponse> {
    const res = await fetch(`${API_ROOT}/${cityId}/stop/${stopId}/departures`);
    if (!res.ok) throw new Error('Failed to fetch stop departures');
    return res.json();
  },

  async getVehicleProfile(vehicleId: string, signal?: AbortSignal): Promise<VehicleProfile> {
    const res = await fetch(`${API_ROOT}/vehicle/${encodeURIComponent(vehicleId)}`, { signal });
    if (!res.ok) throw new Error('Failed to fetch vehicle profile');
    return res.json();
  },

  async getSystemStatus(): Promise<SystemStatus> {
    const res = await fetch(`${API_ROOT}/system/status`);
    if (!res.ok) throw new Error('Failed to fetch system status');
    return res.json();
  }
};
