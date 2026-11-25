# Deploy na Render

Projekt koristi jedan Node web service: Vite izgradi frontend, a Express poslužuje frontend i API na istom hostu.

## GitHub

1. Napravite prazan GitHub repozitorij.
2. Iz korijena projekta pokrenite:

   ```sh
   git add .
   git commit -m "Prepare Transitly for Render"
   git branch -M main
   git remote add origin https://github.com/VAŠE-IME/transit-atlas.git
   git push -u origin main
   ```

3. Provjerite da `.env`, `backend/data/` i `gtfs_data/` nisu dodani u commit. `.gitignore` ih isključuje.

## Render

1. U Renderu izaberite **New → Blueprint** i povežite GitHub repozitorij. Render će koristiti `render.yaml`.
2. Unesite tražene tajne:
   - `MONGODB_URI`: MongoDB Atlas connection string
   - `ADMIN_PANEL_PASSWORD`: jedinstvena lozinka od najmanje 24 znaka
   - ADMIN_TOTP_SECRET s 32 nasumična Base32 znaka. Unesite istu tajnu u aplikaciju za autentifikaciju.
   - `APP_ORIGIN`: puna HTTPS adresa Render servisa, npr. `https://transit-atlas.onrender.com`
   - `TURNSTILE_SITE_KEY` i `TURNSTILE_SECRET_KEY`: ključevi za tu domenu iz Cloudflare Turnstilea
   - `VITE_TURNSTILE_SITE_KEY`: isti Turnstile site key; koristi se tijekom builda frontenda
3. Blueprint automatski generira `SESSION_SECRET` i `PASSWORD_PEPPER`. Nemojte ih rotirati nakon što korisnici naprave račune jer pepper sudjeluje u provjeri lozinki.
4. U MongoDB Atlas Network Access dopustite mrežni pristup Render servisu. Za Atlas URI koristite URL-encoded znakove u korisničkom imenu/lozinci.
5. Nakon deploya otvorite `/` i `/api/health`. Za povezivanje `admin.transitly.eu` i postavke Cloudflarea slijedite [upute za deploy](DEPLOYMENT.md#administratorski-pristup).

Build naredba je `npm ci --include=dev && npm run build`, a start naredba je `npm start`. Build treba TypeScript i Vite čak i kad je `NODE_ENV=production`. Blueprint objavljuje commitove s grane `main` i koristi Node.js 22 prema rasponu u `package.json`. Ako je servis ručno konfiguriran, provjerite iste postavke u Render dashboardu. Express sluša na `PORT` koji dodjeljuje Render.

## Produkcijske postavke

- Registracija i prijava uključene su po zadanim postavkama i zahtijevaju MongoDB. Postavite `AUTH_LOGIN_ENABLED=false` i `AUTH_REGISTRATION_ENABLED=false` ako ih želite ugasiti prije prvog pokretanja.
- Registracijska i reset lozinke email poruka zahtijevaju `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` i `APP_BASE_URL`. Bez SMTP-a te poruke neće biti isporučene.
- Google i Apple prijava ostaju nedostupne dok ne postavite njihove OAuth varijable i konfigurirate pružatelje.
- Render free servis ima prolazni disk. GTFS ZIP se može ponovno preuzeti, ali administratorske promjene zapisane u `backend/data/runtime-settings.json` vraćaju se na početne env postavke nakon restarta/deploya. Za trajne admin postavke potreban je trajni disk ili pohrana u bazu.
- Povežite servis s GitHubom i deployajte tek nakon što su tajne unesene u Render dashboard. Nikad nemojte commitati `.env`.
