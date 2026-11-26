import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { reportVehicle } from '../services/auth';
import VehicleIdentifiers from './VehicleIdentifiers';
import { relativeUpdateTime, t } from '../services/i18n';
import { Vehicle } from '../types';

interface VehicleCardProps {
  vehicle: Vehicle;
  onClose: () => void;
  onViewProfile: () => void;
  onRequireLogin?: () => void;
}

export default function VehicleCard({ vehicle, onClose, onViewProfile, onRequireLogin }: VehicleCardProps) {
  const { user } = useAuth();
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState<'breakdown' | 'delay'>('breakdown');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [reported, setReported] = useState(false);

  async function submitReport(event: FormEvent) {
    event.preventDefault();
    if (!user || !vehicle.tripId || submitting || reported) return;
    setSubmitting(true);
    setMessage('');
    try {
      const result = await reportVehicle(vehicle.id, vehicle.tripId, reason);
      setMessage(result.message);
      setReported(true);
      setShowReport(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Slanje prijave nije uspjelo."));
    } finally {
      setSubmitting(false);
    }
  }
  const getSourceLabel = (source: string) => {
    if (source === 'demo') return t("Ogledni podaci");
    if (source === 'gtfs') return t("Raspored");
    if (source === 'realtime') return t("ZET · uživo");
    return source;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-4 md:bottom-4 md:w-96 bg-white text-slate-900 rounded-t-2xl md:rounded-2xl shadow-2xl z-[1000] max-h-[60dvh] md:max-h-[80vh] overflow-y-auto">
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              {vehicle.type === 'bus' ? t("Autobus") : vehicle.type === 'tram' ? t("Tramvaj") : t("Vozilo")}
            </div>
            <div className="text-2xl font-bold text-primary">{t("Linija") + " "}{vehicle.line}</div>
          </div>
          <button
            onClick={onClose}
            aria-label={t("Zatvori")}
            className="text-gray-600 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-sm text-gray-500">{t("Smjer")}</div>
            <div className="text-lg font-medium">{vehicle.direction}</div>
          </div>

          <VehicleIdentifiers vehicle={vehicle} />

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
              </svg>{t("Niskopodni pristup")}</div>
          )}

          <p className="border-t border-gray-200 pt-2 text-xs text-gray-600">
            {getSourceLabel(vehicle.source)} · {relativeUpdateTime(vehicle.lastUpdate)}
          </p>

          {vehicle.source === 'realtime' && vehicle.tripId && vehicle.type !== 'unknown' && !reported && (user || onRequireLogin) &&
            (showReport && user ? <form onSubmit={submitReport} className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
              <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">
                {t("Razlog prijave")}
                <select value={reason} onChange={event => setReason(event.target.value === 'delay' ? 'delay' : 'breakdown')}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-base" disabled={submitting}>
                  <option value="breakdown">{t("Kvar vozila")}</option>
                  <option value="delay">{t("Kašnjenje")}</option>
                </select>
              </label>
              <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-[#102638] px-3 text-sm font-semibold text-white disabled:opacity-60">{submitting ? t("Šaljem…") : t("Pošalji prijavu")}</button>
              <button type="button" disabled={submitting} aria-label={t("Odustani")} onClick={() => { setShowReport(false); setMessage(''); }} className="min-h-11 px-2 text-sm underline">{t("Odustani")}</button>
            </form> : <button type="button" onClick={() => user ? setShowReport(true) : onRequireLogin?.()}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold">
              {user ? t("Prijavi problem") : t("Prijavi se za dojavu")}
            </button>)}
          {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
          <button
            onClick={onViewProfile}
            className="w-full bg-primary text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >{t("Otvori puni profil")}</button>
        </div>
      </div>
    </div>
  );
}
