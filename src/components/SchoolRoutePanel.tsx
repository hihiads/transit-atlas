import { FormEvent, useState } from 'react';
import { api } from '../api';
import { SchoolRoutePlan } from '../types';

interface Place { id: string; name: string; lat: number; lon: number }

export default function SchoolRoutePanel({ onClose, onPlan }: { onClose: () => void; onPlan: (plan: SchoolRoutePlan | null) => void }) {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [arriveBy, setArriveBy] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + (date.getDay() === 5 ? 3 : date.getDay() === 6 ? 2 : 1));
    date.setHours(7, 45, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T07:45`;
  });
  const [plan, setPlan] = useState<SchoolRoutePlan | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function locateOrigin() {
    setMessage('');
    if (!navigator.geolocation) return setMessage('Lokacija nije dostupna na ovom uređaju.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setOrigin({ id: 'current', name: 'Moja trenutna lokacija', lat: coords.latitude, lon: coords.longitude });
      setBusy(false);
    }, () => { setBusy(false); setMessage('Lokacija nije dopuštena ili trenutačno nije dostupna.'); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { setResults(await api.searchSchoolAddress(query)); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Pretraga adrese nije uspjela.'); }
    finally { setBusy(false); }
  }

  async function calculate(mode: 'arrive' | 'fastest') {
    if (!origin || !destination) return setMessage('Odaberite polazište i odredište.');
    setBusy(true); setMessage(''); setPlan(null); onPlan(null);
    try {
      const soon = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const fastestDeadline = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}T${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
      const response = await api.planSchoolRoute({ origin, destination, arriveBy: mode === 'fastest' ? fastestDeadline : arriveBy, mode });
      setPlan(response.plan); onPlan(response.plan); setMessage(response.plan ? response.note || '' : response.message || 'Nema rute.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Planiranje nije uspjelo.'); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/40 md:items-center md:p-5" role="dialog" aria-modal="true" aria-labelledby="school-route-title">
    <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl md:max-w-xl md:rounded-3xl">
      <div className="mb-4 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-700">Zagreb · ZET</p><h2 id="school-route-title" className="text-2xl font-bold text-slate-900">Do škole</h2><p className="mt-1 text-sm text-slate-600">Planiraj polazak prema rasporedu javnog prijevoza.</p></div><button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Zatvori">✕</button></div>
      <div className="space-y-3">
        <div className="flex gap-2"><div className="min-w-0 flex-1 rounded-xl border bg-slate-50 px-3 py-3 text-sm">{origin?.name || 'Odakle krećeš?'}</div><button onClick={locateOrigin} disabled={busy} className="rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">Moja lokacija</button></div>
        <form onSubmit={search} className="flex gap-2"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Adresa škole ili odredišta" className="min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm"/><button disabled={busy || query.trim().length < 3} className="rounded-xl border px-4 text-sm font-semibold disabled:opacity-50">Traži</button></form>
        {results.length > 0 && <div className="max-h-40 overflow-y-auto rounded-xl border">{results.map(place => <button key={place.id} onClick={() => { setDestination(place); setResults([]); setQuery(place.name); setPlan(null); onPlan(null); }} className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50">{place.name}</button>)}</div>}
        {destination && <p className="text-xs text-slate-600">Odredište: {destination.name}</p>}
        <label className="block text-sm font-medium text-slate-700">Želim stići do<input type="datetime-local" value={arriveBy} onChange={e => setArriveBy(e.target.value)} className="mt-1 block w-full rounded-xl border px-3 py-3"/></label>
        <div className="grid grid-cols-2 gap-2"><button disabled={busy} onClick={() => calculate('arrive')} className="rounded-xl bg-blue-700 px-3 py-3 font-semibold text-white disabled:opacity-50">Planiraj dolazak</button><button disabled={busy} onClick={() => calculate('fastest')} className="rounded-xl border border-slate-300 px-3 py-3 font-semibold text-slate-800 disabled:opacity-50">Kasnim · najbrže</button></div>
      </div>
      {busy && <p className="mt-4 text-sm text-slate-600" role="status">Tražim rutu…</p>}
      {plan && <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4"><div className="flex items-baseline justify-between"><strong className="text-lg text-slate-900">Kreni u {plan.leaveAt.slice(11, 16)}</strong><span className="text-sm text-slate-600">Dolazak {plan.arriveAt.slice(11, 16)}</span></div><div className="mt-3 space-y-2 text-sm text-slate-700"><p>🚶 Hodanje do stanice {plan.walkTo} min · {plan.from.stop_name}</p><p>🚌/🚋 Linija {plan.route}{plan.headsign ? ` prema ${plan.headsign}` : ''}</p><p>🚏 Silazak: {plan.to.stop_name}</p><p>🚶 Hodanje do odredišta {plan.walkFrom} min</p></div><p className="mt-3 text-xs text-slate-600">Vremena su iz ZET rasporeda. Hodanje je gruba procjena; kašnjenja uživo nisu uključena.</p></div>}
      {message && <p className="mt-3 text-sm text-slate-600" role="status">{message}</p>}
      <p className="mt-4 text-[11px] text-slate-500">Pretraga adrese koristi OpenStreetMap Nominatim. <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></p>
    </section>
  </div>;
}
