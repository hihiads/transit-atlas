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
      {vehicle.type === 'bus' && <div>
        <dt className="text-xs text-slate-600">{t("Registracija vozila")}</dt>
        <dd className="font-semibold">{vehicle.registrationNumber || t("Nije dostupna")}</dd>
      </div>}
    </dl>
  );
}
