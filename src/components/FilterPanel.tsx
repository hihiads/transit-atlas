import { Vehicle } from '../types';

interface FilterPanelProps {
  vehicles: Vehicle[];
  selectedType: 'all' | 'bus' | 'tram';
  selectedLine: string;
  onTypeChange: (type: 'all' | 'bus' | 'tram') => void;
  onLineChange: (line: string) => void;
}

export default function FilterPanel({
  vehicles,
  selectedType,
  selectedLine,
  onTypeChange,
  onLineChange
}: FilterPanelProps) {
  const lines = Array.from(new Set(vehicles.map(v => v.line))).sort((a, b) => {
    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });

  return (
    <div className="bg-white shadow-lg rounded-lg p-4 mb-4 md:mb-0">
      <h3 className="font-semibold text-lg mb-3 text-gray-800">Filteri</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tip vozila
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => onTypeChange('all')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'all'
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Sve
            </button>
            <button
              onClick={() => onTypeChange('bus')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'bus'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Autobus
            </button>
            <button
              onClick={() => onTypeChange('tram')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'tram'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Tramvaj
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Linija
          </label>
          <select
            value={selectedLine}
            onChange={(e) => onLineChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Sve linije</option>
            {lines.map(line => (
              <option key={line} value={line}>
                Linija {line}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
