import { useEffect, useState } from 'react';
import { CircleMarker, Popup } from 'react-leaflet';
import { t } from '../services/i18n';
import { fetchBikeStations, type BikeStation } from '../services/bikes';

// Public bike stations (nextbike / Bajs) for all Croatian cities. Refreshed every minute while visible.
export default function BikeShareLayer({ visible }: { visible: boolean }) {
  const [stations, setStations] = useState<BikeStation[]>([]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    const load = () => {
      fetchBikeStations()
        .then(list => { if (active) setStations(list); })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      {stations.map(station => (
        <CircleMarker key={station.id} center={[station.lat, station.lon]} radius={6}
          pathOptions={{ color: '#0f766e', weight: 2, fillColor: '#14b8a6', fillOpacity: 0.9 }}>
          <Popup>
            <strong>{station.name}</strong>
            <br />
            {station.city}
            <br />
            {t("Bicikli: {0}", station.bikesAvailable ?? '–')}{station.capacity ? ` / ${station.capacity}` : ''}
            <br />
            <small>{t("Podaci: nextbike / Bajs")}</small>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}
