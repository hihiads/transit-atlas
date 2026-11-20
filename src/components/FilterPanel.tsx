import { Route, Vehicle } from '../types';

interface FilterPanelProps {
  vehicles: Vehicle[];
  routes: Route[];
  selectedType: 'all' | 'bus' | 'tram';
  selectedLine: string;
  onTypeChange: (type: 'all' | 'bus' | 'tram') => void;
  onLineChange: (line: string) => void;
  compact?: boolean;
}

export default function FilterPanel({
  vehicles,
  routes,
  selectedType,
  selectedLine,
  onTypeChange,
  onLineChange,
  compact = false
}: FilterPanelProps) {
  const routeLines = routes
    .filter(route => selectedType === 'all' || route.type === selectedType)
    .map(route => route.shortName);
  const vehicleLines = vehicles
    .filter(vehicle => selectedType === 'all' || vehicle.type === selectedType)
    .map(vehicle => vehicle.line);
  const lines = Array.from(new Set([...routeLines, ...vehicleLines].filter(Boolean))).sort((a, b) => {
    const aNum = parseInt(a);
    const bNum = parseInt(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });

  if (compact) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 rounded-2xl border border-white/70 bg-white/95 p-2 shadow-[0_8px_30px_rgba(22,45,58,0.14)] backdrop-blur">
        <select
          aria-label="Vrsta vozila"
          value={selectedType}
          onChange={(event) => onTypeChange(event.target.value as 'all' | 'bus' | 'tram')}
          className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:text-sm"
        >
          <option value="all">Sva vozila</option>
          <option value="bus">Autobusi</option>
          <option value="tram">Tramvaji</option>
        </select>
        <select
          aria-label="Filtriraj po liniji"
          value={selectedLine}
          onChange={(event) => onLineChange(event.target.value)}
          className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:text-sm"
        >
          <option value="">Sve linije</option>
          {lines.map(line => <option key={line} value={line}>Linija {line}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_8px_28px_rgba(22,45,58,0.06)] md:mb-0">
      <div className="mb-4 flex items-center justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Karta</p><h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Pronađi liniju</h3></div>
        <span className="rounded-xl bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-800">{vehicles.length} vozila</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vrsta prijevoza
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => onTypeChange('all')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'all'
                  ? 'bg-[#102638] text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Sve
            </button>
            <button
              onClick={() => onTypeChange('bus')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'bus'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Autobus
            </button>
            <button
              onClick={() => onTypeChange('tram')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'tram'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tramvaj
            </button>
          </div>
        </div>

        <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Linija
          </label>
          <select
            value={selectedLine}
            onChange={(e) => onLineChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
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
