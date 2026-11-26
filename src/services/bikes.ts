import { API_ROOT } from './platform';

export type BikeStation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number | null;
  bikesAvailable: number | null;
  docksAvailable: number | null;
  city: string;
  operator: string;
};

// Public bike share stations in Croatia (nextbike network, Bajs in Zagreb). Served by the backend, cached there.
export async function fetchBikeStations(): Promise<BikeStation[]> {
  const response = await fetch(`${API_ROOT}/bikes/hr`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Bike stations request failed: ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.stations) ? data.stations : [];
}
