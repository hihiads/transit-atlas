export interface Vehicle {
  id: string;
  type: 'bus' | 'tram' | 'unknown';
  line: string;
  direction: string;
  lat: number;
  lon: number;
  lastUpdate: number;
  zetId?: string | null;
  garageNumber?: string | null;
  registrationNumber?: string | null;
  model?: string;
  rare?: boolean;
  modelSource?: string;
  lowFloor?: boolean;
  currentStopSequence?: number | null;
  currentStatus?: number | null;
  tripId?: string | null;
  routeId?: string | null;
  source: 'demo' | 'gtfs' | 'realtime';
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  code?: string | null;
  wheelchairAccessible?: boolean;
  cityId?: string;
}

export interface Route {
  id: string;
  shortName: string;
  longName: string;
  type: 'bus' | 'tram';
  color?: string | null;
  textColor?: string | null;
}

export interface TransitShape {
  id: string;
  routeId: string;
  color?: string | null;
  coordinates: [number, number][];
}

export interface Departure {
  timestamp: number;
  source: 'scheduled' | 'live' | 'estimated';
  type: 'bus' | 'tram' | 'unknown';
  time: string;
  route: string;
  direction: string;
  tripId: string;
}

export interface City {
  id: string;
  name: string;
  operator: string;
  center: [number, number];
  zoom: number;
  status: 'active' | 'coming_soon' | 'unavailable';
  hasRealtime: boolean;
  supportedTypes: ('bus' | 'tram')[];
}

export interface VehicleResponse {
  status: 'demo' | 'live' | 'unavailable';
  message?: string;
  maintenance?: boolean;
  lastUpdate: number;
  staleVehiclesDropped?: number;
  vehicles: Vehicle[];
  source: string;
}

export interface StopsResponse {
  stops: Stop[];
  status: 'loaded' | 'unavailable';
  count?: number;
}

export interface RoutesResponse {
  routes: Route[];
  status: 'loaded' | 'unavailable';
  count?: number;
}

export interface StopDeparturesResponse {
  stop: {
    id: string;
    name: string;
    lat: number;
    lon: number;
  };
  departures: Departure[];
  realtime?: string;
  message?: string;
}

export interface VehicleProfile extends Vehicle {
  progressSource: 'live' | 'estimated' | 'unavailable';
  stops: {
    id: string;
    name: string;
    sequence: number;
    status: 'passed' | 'current' | 'upcoming' | 'unknown';
  }[];
}

export interface SystemStatus {
  gtfsLoaded: boolean;
  lastGtfsUpdate: string | null;
  stats: {
    routes: number;
    stops: number;
    trips: number;
    stopTimes: number;
  };
}
