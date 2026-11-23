import { useEffect } from 'react';

const email = 'info@transitly.eu';
const deletionMail = 'mailto:' + email + '?subject=' + encodeURIComponent('Zahtjev za brisanje Transitly računa');

export default function AccountDeletionPage() {
  useEffect(() => {
    document.title = 'Brisanje računa – Transitly';
  }, []);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
    <article className="mx-auto max-w-2xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
      <a href="/" className="text-sm font-semibold text-blue-800 underline">← Natrag na Transitly</a>
      <h1 className="mt-6 text-3xl font-bold">Brisanje Transitly računa</h1>
      <p className="mt-4 leading-7 text-slate-700">Račun možete trajno izbrisati u Transitlyju nakon prijave: otvorite izbornik računa i odaberite „Trajno izbriši račun”. Time se s Transitlyjeva poslužitelja brišu vaš račun i njegove sesije.</p>
      <p className="mt-4 leading-7 text-slate-700">Ako se ne možete prijaviti, pošaljite zahtjev s email adrese povezane s računom. Transitly će provjeriti da zahtjev dolazi od vlasnika računa prije brisanja.</p>
      <a href={deletionMail} className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[#102638] px-5 font-semibold text-white hover:bg-[#19384f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Zatraži brisanje emailom</a>
      <h2 className="mt-8 text-xl font-semibold">Podaci spremljeni na uređaju</h2>
      <p className="mt-2 leading-7 text-slate-700">Omiljene linije, stanice i praćeni polasci spremaju se lokalno i ne nalaze se na Transitlyjevu poslužitelju. Brisanje računa iz aplikacije uklanja te podatke na tom uređaju; na drugim uređajima uklonite ih brisanjem lokalnih podataka aplikacije ili preglednika.</p>
      <p className="mt-6 text-sm text-slate-600">Pomoć: <a className="font-medium text-blue-800 underline" href={'mailto:' + email}>{email}</a></p>
    </article>
  </main>;
}
