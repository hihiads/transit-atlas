import { useState } from 'react';
import { Search } from 'lucide-react';
import { t } from '../services/i18n';
import type { Vehicle } from '../types';

export default function VehicleSearch({ vehicles, onSelect, onClose }: {
  vehicles: Vehicle[];
  onSelect: (vehicle: Vehicle) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const term = query.trim().toUpperCase();
  const matches = term ? vehicles.flatMap(vehicle => {
    const ids = [vehicle.zetId, vehicle.garageNumber, vehicle.id].flatMap(id => id ? [id.toUpperCase()] : []);
    if (ids.includes(term)) return [{ vehicle, rank: 0 }];
    if (vehicle.line.toUpperCase() === term) return [{ vehicle, rank: 1 }];
    if (vehicle.line.toUpperCase().startsWith(term) || ids.some(id => id.startsWith(term))) return [{ vehicle, rank: 2 }];
    return [];
  }).sort((a, b) => a.rank - b.rank) : [];

  return (
    <section id="vehicle-search" aria-label={t("Pretraži vozila")} onKeyDown={event => {
      if (event.key === 'Escape') onClose();
    }} className="absolute left-3 right-3 top-full z-[1200] mt-1 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl sm:left-auto sm:right-5 sm:w-96">
      <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:ring-2 focus-within:ring-teal-700">
        <Search size={17} aria-hidden="true" />
        <input autoFocus type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)}
          aria-label={t("Broj linije ili ZET ID")} placeholder={t("Broj linije ili ZET ID")}
          className="min-h-11 w-full min-w-0 rounded-lg bg-transparent px-1 text-base outline-none" />
      </label>
      {term && matches.length === 0 && <p role="status" className="p-3 text-sm text-slate-600">{t("Nema vozila s tim brojem.")}</p>}
      {matches.length > 0 && <ul className="mt-1 max-h-[35dvh] divide-y divide-slate-100 overflow-y-auto">
        {matches.slice(0, 24).map(({ vehicle }) => <li key={vehicle.id}>
          <button type="button" onClick={() => onSelect(vehicle)} className="block min-h-11 w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100">
            <span className="block text-sm font-bold">{t("Linija") + " "}{vehicle.line} · {vehicle.type === 'bus' ? t("Autobus") : vehicle.type === 'tram' ? t("Tramvaj") : t("Vozilo")}{vehicle.zetId && ` · ${vehicle.zetId}`}</span>
            <span className="block truncate text-xs text-slate-600">{vehicle.direction}</span>
          </button>
        </li>)}
      </ul>}
      {matches.length > 24 && <p className="px-3 pt-2 text-xs text-slate-600">{t("Suzi pretragu za više rezultata.")}</p>}
    </section>
  );
}
