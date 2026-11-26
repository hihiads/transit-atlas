import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getRareVehicleFollows, setRareVehicleFollow, type RareFollows } from '../services/auth';
import { t } from '../services/i18n';

export default function RareVehicleFollows({ vehicleId, onRequireLogin }: { vehicleId?: string; onRequireLogin?: () => void }) {
  const { user, loading } = useAuth();
  const [data, setData] = useState<RareFollows | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(null);
    setError('');
    if (!user?.emailVerified) return;
    const controller = new AbortController();
    getRareVehicleFollows(controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message);
    });
    return () => controller.abort();
  }, [user?.id, user?.emailVerified]);

  async function toggle(id: string, followed: boolean) {
    setSaving(true);
    setError('');
    try {
      const result = await setRareVehicleFollow(id, !followed);
      setData(current => current && ({ ...current, vehicles: current.vehicles.map(vehicle =>
        vehicle.id === id ? { ...vehicle, followed: result.followed } : vehicle) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Zahtjev nije uspio."));
    } finally { setSaving(false); }
  }

  if (loading) return null;
  if (!user?.emailVerified) return onRequireLogin
    ? <button type="button" onClick={onRequireLogin} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold">{t("Prijavi se za praćenje vozila")}</button>
    : <p className="px-2 py-2 text-sm text-slate-600">{t("Za praćenje rijetkih vozila potreban je potvrđen račun.")}</p>;

  const vehicles = data?.vehicles.filter(vehicle => !vehicleId || vehicle.id === vehicleId) ?? [];
  const visible = vehicles.filter(vehicle => vehicle.available || vehicle.followed);
  return <div className="space-y-2 text-sm">
    {data?.enabled && visible.length > 0 && <p className="text-xs text-slate-600">{t("Dobit ćeš najviše jednu e-poruku dnevno po vozilu kad se pojavi u ZET feedu.")}</p>}
    {data && !data.enabled && <p className="text-xs text-slate-600">{t("Obavijesti e-poštom trenutačno nisu dostupne.")}</p>}
    {data && visible.length === 0 && <p className="text-xs text-slate-600">{t("Nema rijetkih vozila za praćenje.")}</p>}
    {!data && !error && <p className="text-xs text-slate-600">{t("Učitavanje…")}</p>}
    {visible.length > 0 && <ul className="max-h-[28dvh] divide-y divide-slate-100 overflow-y-auto">
      {visible.map(vehicle => <li key={vehicle.id} className="flex items-center justify-between gap-2 py-1">
        {!vehicleId && <span className="min-w-0 break-words"><span className="font-semibold">{vehicle.model || t("Vozilo")}</span><small className="block text-slate-600">ZET ID {vehicle.id}</small></span>}
        <button type="button" aria-pressed={vehicle.followed} disabled={saving || (!vehicle.followed && !data?.enabled)} onClick={() => void toggle(vehicle.id, vehicle.followed)}
          className="min-h-10 shrink-0 rounded-lg border border-slate-300 px-2 font-semibold hover:bg-slate-100 disabled:opacity-50">
          {vehicle.followed ? t("Prestani pratiti") : t("Prati vozilo")}
        </button>
      </li>)}
    </ul>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
