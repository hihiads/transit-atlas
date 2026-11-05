import { Vehicle } from '../types';

interface VehicleCardProps {
  vehicle: Vehicle;
  onClose: () => void;
  onViewProfile: () => void;
}

export default function VehicleCard({ vehicle, onClose, onViewProfile }: VehicleCardProps) {
  const formatLastUpdate = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `prije ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `prije ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    return `prije ${hours}h`;
  };

  const getSourceLabel = (source: string) => {
    if (source === 'demo') return 'Ogledni podaci';
    if (source === 'gtfs') return 'Raspored';
    if (source === 'realtime') return 'ZET · uživo';
    return source;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-4 md:bottom-4 md:w-96 bg-white rounded-t-2xl md:rounded-2xl shadow-2xl z-[1000] max-h-[50vh] md:max-h-[80vh] overflow-y-auto">
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              {vehicle.type === 'bus' ? 'Autobus' : 'Tramvaj'}
            </div>
            <div className="text-2xl font-bold text-primary">Linija {vehicle.line}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-500">Smjer</div>
            <div className="text-lg font-medium">{vehicle.direction}</div>
          </div>

          {vehicle.garageNumber && (
            <div>
              <div className="text-sm text-gray-500">Garažni broj</div>
              <div className="text-lg font-medium">{vehicle.garageNumber}</div>
            </div>
          )}

          {vehicle.model && (
            <div>
              <div className="text-sm text-gray-500">Model</div>
              <div className="text-lg font-medium">{vehicle.model}</div>
            </div>
          )}

          {vehicle.lowFloor && (
            <div className="flex items-center text-sm text-green-600">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Niskopodni pristup
            </div>
          )}

          <div className="pt-3 border-t border-gray-200">
            <div className="text-xs text-gray-500 mb-1">Zadnje ažuriranje</div>
            <div className="text-sm">{formatLastUpdate(vehicle.lastUpdate)}</div>
          </div>

          <div className="pt-2">
            <div className="text-xs text-gray-400 mb-2">Izvor podataka</div>
            <div className="inline-block px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
              {getSourceLabel(vehicle.source)}
            </div>
          </div>

          <button
            onClick={onViewProfile}
            className="w-full mt-4 bg-primary text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Otvori puni profil
          </button>
        </div>
      </div>
    </div>
  );
}
