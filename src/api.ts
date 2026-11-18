import { City, VehicleResponse, VehicleProfile, StopsResponse, RoutesResponse, StopDeparturesResponse, SystemStatus, TransitShape } from './types';

const API_BASE = '/api';

export interface AuthStatus {
  loginEnabled: boolean;
  registrationEnabled: boolean;
  authenticationActive: boolean;
}

export const api = {
  async getAuthStatus(): Promise<AuthStatus> {
    const res = await fetch(`${API_BASE}/auth/status`);
    if (!res.ok) throw new Error('Failed to fetch authentication status');
    return res.json();
  },
  async getCities(): Promise<City[]> {
    const res = await fetch(`${API_BASE}/cities`);
    if (!res.ok) throw new Error('Failed to fetch cities');
    return res.json();
  },

  async getVehicles(cityId: string): Promise<VehicleResponse> {
    const res = await fetch(`${API_BASE}/vehicles/${cityId}`);
    if (!res.ok) throw new Error('Failed to fetch vehicles');
    return res.json();
  },

  async getStops(cityId: string): Promise<StopsResponse> {
    const res = await fetch(`${API_BASE}/stops/${cityId}`);
    if (!res.ok) throw new Error('Failed to fetch stops');
    return res.json();
  },

  async getRoutes(cityId: string): Promise<RoutesResponse> {
    const res = await fetch(`${API_BASE}/routes/${cityId}`);
    if (!res.ok) throw new Error('Failed to fetch routes');
    return res.json();
  },

  async getShapes(cityId: string): Promise<{ shapes: TransitShape[]; status: 'loaded' | 'unavailable' }> {
    const res = await fetch(`${API_BASE}/shapes/${cityId}`);
    if (!res.ok) throw new Error('Failed to fetch route shapes');
    return res.json();
  },

  async getStopDepartures(cityId: string, stopId: string): Promise<StopDeparturesResponse> {
    const res = await fetch(`${API_BASE}/${cityId}/stop/${stopId}/departures`);
    if (!res.ok) throw new Error('Failed to fetch stop departures');
    return res.json();
  },

  async getVehicleProfile(vehicleId: string): Promise<VehicleProfile> {
    const res = await fetch(`${API_BASE}/vehicle/${vehicleId}`);
    if (!res.ok) throw new Error('Failed to fetch vehicle profile');
    return res.json();
  },

  async getSystemStatus(): Promise<SystemStatus> {
    const res = await fetch(`${API_BASE}/system/status`);
    if (!res.ok) throw new Error('Failed to fetch system status');
    return res.json();
  }
};
