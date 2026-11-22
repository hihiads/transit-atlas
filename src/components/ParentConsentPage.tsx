import { useEffect, useState } from 'react';
import { confirmParentConsent } from '../services/auth';
import CookieNotice from './CookieNotice';
import { actionLinkToken } from '../services/actionLink';

export default function ParentConsentPage() {
  const token = actionLinkToken;
  const [childEmail, setChildEmail] = useState('');
  const [checked, setChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Učitavam zahtjev za suglasnost…');
  const [verificationToken, setVerificationToken] = useState('');

  useEffect(() => {
    if (token.length !== 64) { setMessage('Poveznica nije ispravna ili je istekla.'); return; }
    fetch('/api/auth/parent-consent/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Poveznica nije ispravna ili je istekla.');
        setChildEmail(result.childEmail);
        setMessage('Provjerite email djeteta i potvrdite suglasnost ako ste roditelj ili zakonski skrbnik.');
      })
      .catch(error => setMessage(error instanceof Error ? error.message : 'Nije moguće učitati zahtjev.'));
  }, [token]);

  async function submit() {
    setLoading(true);
    try {
      const response = await confirmParentConsent(token);
      setMessage(response.message);
      setVerificationToken(response.verificationToken || '');
      setCompleted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Potvrda nije uspjela.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex h-screen items-center justify-center overflow-y-auto bg-slate-50 p-4 text-slate-900">
    <section className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-lg sm:p-9">
      <a href="/" className="text-sm font-semibold text-blue-800 underline">Transitly</a>
      <h1 className="mt-6 text-2xl font-bold">Roditeljska suglasnost</h1>
      <p className="mt-3 text-sm leading-6 text-slate-700">{message}</p>
      {childEmail && <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-900">Zahtjev za račun: <strong>{childEmail}</strong></p>}
      {!completed && childEmail && <>
        <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-800">
          <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-1" />
          <span>Potvrđujem da sam roditelj ili zakonski skrbnik i dajem suglasnost za korištenje Transitlyja.</span>
        </label>
        <div className="mt-5 flex flex-wrap gap-4 text-sm"><a className="text-blue-800 underline" href="/privacy">Politika privatnosti</a><a className="text-blue-800 underline" href="/terms">Uvjeti korištenja</a></div>
        <button type="button" disabled={!checked || loading} onClick={() => void submit()} className="mt-6 w-full rounded-lg bg-[#102638] px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500">{loading ? 'Potvrđujem…' : 'Potvrdi suglasnost'}</button>
      </>}
      {completed && <a href="/" className="mt-6 inline-block rounded-lg bg-[#102638] px-4 py-3 font-semibold text-white">Natrag na Transitly</a>}
      {verificationToken && <a href={`/verify-email#token=${encodeURIComponent(verificationToken)}`} className="mt-4 block text-sm font-semibold text-blue-800 underline">Potvrdi email djeteta (lokalno okruženje)</a>}
    </section>
    <CookieNotice />
  </main>;
}
