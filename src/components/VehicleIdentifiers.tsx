import { t } from '../services/i18n';
import type { Vehicle } from '../types';

export default function VehicleIdentifiers({ vehicle }: { vehicle: Vehicle }) {
  const id = vehicle.zetId || vehicle.garageNumber;
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-900">
      <div>
        <dt className="text-xs text-slate-600">{t("ZET ID")}</dt>
        <dd className="font-semibold">{id || '—'}</dd>
      </div>
      {(vehicle.rare || vehicle.modelSource) && <div>
        <dt className="text-xs font-semibold text-amber-700">{vehicle.rare ? t("Rijetko vozilo") : t("Model")}</dt>
        <dd>{vehicle.modelSource ? <a href={vehicle.modelSource} target="_blank" rel="noreferrer" className="underline">{vehicle.model}</a> : vehicle.model}</dd>
      </div>}
      {vehicle.type === 'bus' && <div>
        <dt className="text-xs text-slate-600">{t("Registracija vozila")}</dt>
        <dd className="font-semibold">{vehicle.registrationNumber || t("Nije dostupna")}</dd>
      </div>}
    </dl>
  );
}
