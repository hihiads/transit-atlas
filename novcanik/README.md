# Novčanik

Samostalna, responsivna web-aplikacija koju je moguće instalirati kao PWA na Android i iOS.

## Pokretanje

```sh
npm install
npm run dev
```

Za kameru je potreban `localhost` ili HTTPS. QR dekodiranje radi lokalno u pregledniku. Fiskalni QR služi za provjeru računa; aplikacija ne pretpostavlja da sadrži iznos ili stavke. Iznos, trgovina i kategorija unose se i potvrđuju ručno. OCR nije uključen.

Podaci se čuvaju u `localStorage` trenutačnog preglednika i nisu zaštićeni korisničkim računom ni šifriranjem. Nema bankovne integracije, analitike ni slanja financijskih podataka u AI ili backend. JSON izvoz je dostupan u sučelju. Brisanje podataka preglednika može ih nepovratno ukloniti. Demo iznosi su izmišljeni.

Za produkcijsku provjeru QR tvrdnji koristimo [službene upute Porezne uprave](https://porezna.gov.hr/fiskalizacija/gotovinski-racuni/provjeri-fiskalni-racun).
