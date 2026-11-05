import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { Vehicle, Stop, TransitShape } from '../types';

// Ikone za različite tipove vozila
const busIcon = L.divIcon({
  className: 'custom-marker',
  html: `<div class="w-8 h-8 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
      <path d="M4 4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v6H4V6z"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const tramIcon = L.divIcon({
  className: 'custom-marker',
  html: `<div class="w-8 h-8 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
      <path d="M3 4a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V4zm3 2v8h8V6H6z"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

interface MapViewProps {
  vehicles: Vehicle[];
  stops: Stop[];
  shapes: TransitShape[];
  center: [number, number];
  zoom: number;
  showStops: boolean;
  showShapes: boolean;
  userLocation?: [number, number];
  onVehicleClick: (vehicle: Vehicle) => void;
  onStopClick: (stop: Stop) => void;
}

function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);

  return null;
}

export default function MapView({
  vehicles,
  stops,
  shapes,
  center,
  zoom,
  showStops,
  showShapes,
  userLocation,
  onVehicleClick,
  onStopClick
}: MapViewProps) {
  const formatLastUpdate = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `prije ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `prije ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    return `prije ${hours}h`;
  };

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="w-full h-full"
      zoomControl={true}
    >
      <MapController center={center} zoom={zoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {userLocation && <CircleMarker center={userLocation} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}><Popup>Vaša lokacija</Popup></CircleMarker>}

      {showShapes && shapes.map(shape => shape.coordinates.length > 1 && (
        <Polyline
          key={shape.id}
          positions={shape.coordinates}
          pathOptions={{ color: shape.color ? `#${shape.color}` : '#2563eb', weight: 3, opacity: 0.5 }}
        />
      ))}

      {/* Stanice */}
      {showStops && stops.map((stop) => (
        <CircleMarker
          key={stop.id}
          center={[stop.lat, stop.lon]}
          radius={5}
          pathOptions={{
            color: '#4b5563',
            fillColor: '#9ca3af',
            fillOpacity: 0.7,
            weight: 2
          }}
          eventHandlers={{
            click: () => onStopClick(stop)
          }}
        >
          <Popup>
            <div className="p-2">
              <div className="font-bold text-sm">{stop.name}</div>
              <div className="text-xs text-gray-500">{stop.mode === 'train' ? 'Vlak' : 'Autobus / tramvaj'}</div>
              {stop.code && (
                <div className="text-xs text-gray-500">Kod: {stop.code}</div>
              )}
              {stop.wheelchairAccessible && (
                <div className="text-xs text-green-600 mt-1">♿ Pristupačno</div>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Vozila */}
      {vehicles.map((vehicle) => (
        <Marker
          key={vehicle.id}
          position={[vehicle.lat, vehicle.lon]}
          icon={vehicle.type === 'bus' ? busIcon : tramIcon}
          eventHandlers={{
            click: () => onVehicleClick(vehicle)
          }}
        >
          <Popup>
            <div className="p-2">
              <div className="font-bold text-lg">Linija {vehicle.line}</div>
              <div className="text-sm text-gray-600">{vehicle.direction}</div>
              {vehicle.garageNumber && (
                <div className="text-xs text-gray-500 mt-1">
                  Vozilo: {vehicle.garageNumber}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-1">
                {formatLastUpdate(vehicle.lastUpdate)}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
