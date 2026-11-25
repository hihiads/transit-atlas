import { t } from '../services/i18n';
import { useEffect, useState } from 'react';
import { Vehicle, VehicleProfile } from '../types';
import { api } from '../api';

interface VehicleProfileModalProps {
  vehicle: Vehicle;
  onClose: () => void;
}

const stopLabels = {
  passed: t("Prošao"),
  current: t("Na stanici"),
  upcoming: t("Dolazi"),
  unknown: t("Status nije dostupan")
};

export default function VehicleProfileModal({ vehicle, onClose }: VehicleProfileModalProps) {
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number;

    async function refresh() {
      try {
        const updated = await api.getVehicleProfile(vehicle.id, controller.signal);
        if (!controller.signal.aborted) {
          setProfile(updated);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
      if (!controller.signal.aborted) timer = window.setTimeout(refresh, 15_000);
    }

    void refresh();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [vehicle.id]);

  const details = profile ?? vehicle;
  const typeLabel = details.type === 'bus' ? t("Autobus") : details.type === 'tram' ? t("Tramvaj") : t("Vozilo");

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="vehicle-profile-title"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'Tab') {
            event.preventDefault();
            const button = event.currentTarget.querySelector('button');
            const list = event.currentTarget.querySelector('ol');
            (event.target === button && list ? list : button)?.focus();
          }
        }}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white text-slate-900 shadow-xl sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm text-slate-600">{typeLabel}{details.garageNumber && ` · ${details.garageNumber}`}</p>
            <h2 id="vehicle-profile-title" className="text-xl font-bold">{t("Linija") + " "}{details.line}</h2>
            <p className="text-sm text-slate-600">{details.direction}</p>
          </div>
          <button type="button" autoFocus onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium">{t("Zatvori")}</button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <h3 className="mb-3 text-base font-semibold">{t("Stanice na ovoj vožnji")}</h3>
          {error && <p role="status" className="mb-3 text-sm text-slate-600">
            {profile ? t("Osvježavanje nije uspjelo. Prikazani su zadnji dostupni podaci.") : t("Stanice trenutačno nije moguće učitati.")}
          </p>}
          {!profile && !error && <p role="status" className="text-sm text-slate-600">{t("Učitavanje stanica…")}</p>}
          {profile && profile.stops.length === 0 && <p className="text-sm text-slate-600">{t("Vozni red za ovu vožnju nije dostupan.")}</p>}
          {profile?.progressSource === 'estimated' && <p className="mb-3 text-xs text-slate-600">{t("Prolazak kroz stanice procijenjen je prema GPS položaju vozila.")}</p>}
          {profile && profile.stops.length > 0 && (
            <ol tabIndex={0} aria-label={t("Redoslijed stanica")}
              className="outline-offset-2">
              {profile.stops.map(stop => (
                <li key={JSON.stringify([stop.sequence, stop.id])}
                  className={`relative flex min-h-11 items-start gap-3 pl-7 last:after:hidden after:absolute after:-bottom-2 after:left-[7px] after:top-3 after:w-0.5 after:bg-slate-300 ${stop.status === 'passed' ? 'text-slate-500' : 'text-slate-900'}`}
                  aria-current={stop.status === 'current' ? 'step' : undefined}>
                  <span aria-hidden="true" className={`absolute left-0 top-1 z-10 size-4 rounded-full border-2 ${stop.status === 'passed' || stop.status === 'unknown' ? 'border-slate-400 bg-slate-100' : 'border-teal-700 bg-white'} ${stop.status === 'current' ? 'ring-2 ring-teal-200' : ''}`} />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-3">
                    <span className="font-medium">{stop.name}</span>
                    <span className={`text-xs ${stop.status === 'upcoming' || stop.status === 'current' ? 'font-semibold text-teal-800' : 'text-slate-500'}`}>{stopLabels[stop.status]}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
