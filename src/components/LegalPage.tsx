import type { ReactNode } from 'react';
import { useEffect } from 'react';
import CookieNotice from './CookieNotice';

const operator = 'Din Mulajusufović';
const email = 'info@transitly.eu';

const pages = {
  '/privacy': { title: 'Politika privatnosti', intro: 'Ova stranica objašnjava koje podatke Transitly obrađuje i zašto.' },
  '/terms': { title: 'Uvjeti korištenja', intro: 'Korištenjem Transitlyja prihvaćate ove uvjete.' },
  '/cookies': { title: 'Kolačići i lokalna pohrana', intro: 'Objašnjenje kolačića i sličnih tehnologija koje koristi Transitly.' }
} as const;

export default function LegalPage() {
  const page = pages[window.location.pathname as keyof typeof pages] || pages['/privacy'];
  useEffect(() => {
    document.title = `${page.title} – Transitly`;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `https://transitly.eu${window.location.pathname}`;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = page.intro;
  }, [page]);
  return <main className="h-screen overflow-y-auto bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
    <article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
      <a href="/" className="text-sm font-semibold text-blue-800 underline">← Natrag na Transitly</a>
      <h1 className="mt-6 text-3xl font-bold">{page.title}</h1>
      <p className="mt-2 text-slate-700">{page.intro}</p>
      <p className="mt-3 text-sm text-slate-600">Zadnje ažurirano: 22. studenoga 2026.</p>

      {window.location.pathname === '/privacy' && <>
        <Section title="Voditelj obrade i kontakt"><p>Transitlyjem upravlja {operator}. Za pitanja o privatnosti, pristup, ispravak ili brisanje podataka javite se na <a className="font-medium text-blue-800 underline" href={`mailto:${email}`}>{email}</a>. U ovom trenutku na ovoj stranici nisu navedeni registrirani naziv pravne osobe, poštanska adresa ni registracijski broj.</p></Section>
        <Section title="Podaci koje obrađujemo"><p>Za račun obrađujemo email adresu, hash lozinke ili identifikator Google računa, dobnu skupinu (10–15 ili 16+), status potvrde emaila, prihvaćenu verziju uvjeta i vrijeme prihvaćanja te tehničke podatke sesije. Za korisnike od 10 do 15 godina obrađujemo email roditelja/skrbnika i vrijeme roditeljske potvrde. Ako potvrda ne stigne, privremeni zahtjev i hash lozinke brišu se nakon sedam dana. Tokeni za potvrdu emaila i reset lozinke pohranjuju se u hashiranom obliku i imaju ograničen rok valjanosti. Omiljene linije, stanice i praćeni polasci spremaju se lokalno u pregledniku uz korisnički račun; ne šalju se Transitlyjevom poslužitelju.</p><p>Lokaciju uređaja koristimo samo nakon što odaberete funkciju lokacije. Koordinate se koriste u pregledniku za kartu i obližnje stanice; Transitlyjev API ih ne prima. Korištenje OpenStreetMap pločica može otkriti pružatelju karte IP adresu i područje karte koje pregledavate.</p></Section>
        <Section title="Svrhe i pravne osnove"><p>Podatke računa obrađujemo radi pružanja računa i značajki koje ste zatražili (<a className="text-blue-800 underline" href="https://eur-lex.europa.eu/eli/reg/2016/679/oj">GDPR, članak 6. stavak 1. točka b</a>). Za sigurnost prijave i sprječavanje zlouporabe obrađujemo tehničke podatke na temelju legitimnog interesa za zaštitu usluge (članak 6. stavak 1. točka f). Za dobnu skupinu 10–15 račun se ne otvara prije roditeljske/skrbničke suglasnosti; obrada se u tom slučaju temelji na suglasnosti iz članka 6. stavka 1. točke a i članka 8. GDPR-a te <a className="text-blue-800 underline" href="https://narodne-novine.nn.hr/clanci/sluzbeni/2018_05_42_805.html">članka 19. hrvatskog provedbenog zakona</a>. Roditelj ili skrbnik može povući suglasnost slanjem zahtjeva na {email}. Analiza fotografija pokreće se samo nakon što sami pošaljete fotografije i zatražite analizu.</p></Section>
        <Section title="Pružatelji usluga"><p>Prijava koristi Google Identity Services, a zaštita registracije i zahtjeva za reset lozinke Cloudflare Turnstile. Karta učitava OpenStreetMap pločice. Zasebna funkcija analize fotografija oglasa šalje odabrane fotografije i unesene pojedinosti Google Gemini API-ju tek kada pokrenete analizu; slike se obrađuju u memoriji poslužitelja i ne pohranjuju se u Transitlyjevu bazu. Googleovu obradu izvan Transitlyja uređuju Googleovi uvjeti. Poslužiteljska aplikacija koristi Render, bazu MongoDB i email uslugu podešenu kroz konfiguraciju poslužitelja. Email usluga prima adrese primatelja i sadržaj poruka za potvrdu računa, reset lozinke i roditeljsku suglasnost. Konkretan podugovaratelj i regija ovise o postavkama okruženja i trenutačno nisu potvrđeni.</p></Section>
        <Section title="Rokovi i vaša prava"><p>Podatke računa čuvamo dok je račun aktivan, a možete zatražiti njegovo brisanje. Neaktivna sesija istječe nakon sedam dana, a korištenjem se njezin rok produljuje. Token za potvrdu emaila vrijedi 24 sata, a token za reset lozinke jedan sat. Možete zatražiti pristup, ispravak, brisanje ili ograničenje obrade te uložiti prigovor <a className="text-blue-800 underline" href="https://azop.hr/">Agenciji za zaštitu osobnih podataka</a>. Zahtjeve pošaljite na {email}.</p><p>Račun možete obrisati iz Transitlyja. Time se brišu podaci računa i njegove sesije s naše baze te lokalne spremljene stavke u tom pregledniku.</p></Section>
        <Section title="Djeca"><p>Račun mogu zatražiti osobe od navršenih 10 godina. Za dobnu skupinu 10–15 račun se otvara tek nakon potvrde roditelja ili zakonskog skrbnika putem emaila. Ne prikupljamo datum rođenja.</p></Section>
      </>}

      {window.location.pathname === '/terms' && <>
        <Section title="Opis usluge"><p>Transitly prikazuje dostupne informacije o linijama, stajalištima, vozilima i polascima javnog prijevoza. Podaci dolaze iz javnih i pružateljevih GTFS rasporeda i feedova u stvarnom vremenu. Transitly nije prijevoznik, ne upravlja vozilima i ne prodaje karte.</p></Section>
        <Section title="Točnost podataka"><p>Rasporedi, lokacije i procijenjeni dolasci mogu kasniti, biti nepotpuni ili nedostupni. Procjena dolaska nije jamstvo i stvarno vrijeme polaska određuje prijevoznik. Prije putovanja provjerite obavijesti prijevoznika.</p></Section>
        <Section title="SecondLook"><p>SecondLook je zaseban alat za analizu fotografija i opisa oglasa. Analiza može pogriješiti, ne potvrđuje autentičnost proizvoda i ne jamči sigurnu kupnju. Nije povezan s Vintedom i ne pristupa Vinted računima, oglasima ni recenzijama. Ako pokrenete analizu, odabrane fotografije i unesene pojedinosti šalju se Google Gemini API-ju.</p></Section>
        <Section title="Račun i prihvatljivo korištenje"><p>Za registraciju je potrebno prihvatiti ove uvjete. Korisnicima od 10 do 15 godina račun se otvara tek nakon roditeljske ili skrbničke potvrde emailom. Čuvajte pristupne podatke i koristite uslugu zakonito. Nemojte pokušavati ometati rad, zaobilaziti zaštite ili neovlašteno pristupati sustavima. Možete prestati koristiti uslugu i zatražiti brisanje računa u bilo kojem trenutku.</p></Section>
        <Section title="Podaci operatora i kontakt"><p>Transitlyjem upravlja {operator}. Kontakt za pitanja, prijavu problema i zahtjeve vezane uz račun: <a className="font-medium text-blue-800 underline" href={`mailto:${email}`}>{email}</a>. Naziv registrirane pravne osobe, poslovna adresa i registracijski broj trenutačno nisu dostavljeni.</p></Section>
      </>}

      {window.location.pathname === '/cookies' && <>
        <Section title="Što se sprema"><p>Za prijavljeni račun koristi se nužni HTTP-only kolačić sesije (naziv <code>sessionId</code>) radi prijave i zaštite računa. Administratorsko sučelje koristi zaseban nužni kolačić <code>transit-admin</code>. Postavka prikaza ove obavijesti, omiljene linije, stanice i praćeni polasci mogu se spremiti u lokalnu pohranu preglednika. Ove postavke nisu kolačići za oglašavanje.</p></Section>
        <Section title="Vanjski sadržaj"><p>Google Identity Services, Cloudflare Turnstile i OpenStreetMap učitavaju se kada koristite Google prijavu, sigurnosnu provjeru ili kartu. Ti pružatelji mogu obraditi tehničke podatke kao što su IP adresa i podaci preglednika prema svojim pravilima privatnosti.</p></Section>
        <Section title="Upravljanje"><p>Možete izbrisati kolačiće i lokalnu pohranu kroz postavke preglednika. Brisanje kolačića sesije odjavit će vas. U pregledanom kodu aplikacije ne nalaze se oglašivački kolačići ni analitički SDK. Google, Cloudflare i drugi vanjski pružatelji mogu koristiti vlastite tehnologije prema svojim pravilima privatnosti.</p></Section>
      </>}
      <div className="mt-8 border-t pt-5 text-sm text-slate-700"><a className="mr-4 underline" href="/privacy">Privatnost</a><a className="mr-4 underline" href="/terms">Uvjeti</a><a className="underline" href="/cookies">Kolačići</a><p className="mt-3">Kontakt: <a className="font-medium text-blue-800 underline" href={`mailto:${email}`}>{email}</a></p></div>
    </article>
    <CookieNotice />
  </main>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-7 space-y-2 leading-7 text-slate-700"><h2 className="text-xl font-semibold text-slate-900">{title}</h2>{children}</section>;
}
