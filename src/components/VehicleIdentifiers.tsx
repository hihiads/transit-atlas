import { useEffect, useState } from 'react';
import { api } from '../api';
import { t } from '../services/i18n';
import type { Vehicle } from '../types';

export default function VehicleIdentifiers({ vehicle }: { vehicle: Vehicle }) {
  const { id: liveId, registrationNumber, source, type } = vehicle;
  const [lookup, setLookup] = useState<{ id: string; plate: string | null; forum: boolean }>();
  const canLookUp = type === 'bus' && source === 'realtime' && !registrationNumber;

  useEffect(() => {
    if (!canLookUp) return;
    const controller = new AbortController();
    const update = (plate: string | null, forum: boolean) => {
      if (!controller.signal.aborted) setLookup({ id: liveId, plate, forum });
    };
    api.getVehicleRegistration(liveId, controller.signal)
      .then(result => update(result.registrationNumber, result.source === 'autobusi.org'))
      .catch(() => update(null, false));
    return () => controller.abort();
  }, [canLookUp, liveId]);

  const result = canLookUp && lookup?.id === liveId ? lookup : undefined;
  const plate = registrationNumber || result?.plate;
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
        <dd className="font-semibold" aria-live="polite">
          {plate || (canLookUp && !result ? t("Tražim registraciju…") : t("Nije dostupna"))}
        </dd>
        {result?.forum && <dd><a href="https://autobusi.org/forum/index.php?topic=3819.0" target="_blank" rel="noreferrer" className="text-xs underline">autobusi.org</a></dd>}
      </div>}
    </dl>
  );
}
