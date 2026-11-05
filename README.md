# Transit Atlas - Produkcijska Dokumentacija

Transit Atlas je interaktivna karta javnog prijevoza s potpunom autentifikacijom i sigurnosnim zaštitama, spremna za produkcijsko okruženje.

## 🚀 Funkcionalnosti

### Javne funkcionalnosti (bez prijave)
- ✅ Interaktivna karta javnog prijevoza Zagreba
- ✅ GTFS-Realtime prikaz vozila uživo (Zagreb)
- ✅ Statički vozni red iz GTFS podataka
- ✅ Pregled stanica i trasa linija
- ✅ Mobilno responzivno sučelje

### Korisnički računi
- ✅ Registracija s Cloudflare Turnstile zaštitom
- ✅ Prijava/Odjava s sigurnim sesijama
- ✅ Verifikacija email adrese
- ✅ Resetiranje lozinke
- ✅ Argon2id hashiranje lozinki s pepper-om

### Sigurnost
- ✅ MongoDB sesije s `connect-mongo`
- ✅ CSRF zaštita
- ✅ Rate limiting (API, autentifikacija, skupe operacije)
- ✅ Helmet sigurnosni headeri
- ✅ CORS s whitelist domenama
- ✅ Cloudflare Turnstile anti-bot (registracija, reset lozinke)
- ✅ Sprječavanje enumeracije korisnika
- ✅ Brute-force zaštita (5 pokušaja / 15 min)

## 📋 Preduvjeti

- Node.js 18+ i npm
- MongoDB 5+
- Cloudflare Turnstile račun (besplatan)

## 🔧 Lokalna instalacija

### 1. Kloniranje i instalacija paketa

```bash
git clone <repository-url>
cd transit-atlas
npm install
```

### 2. Konfiguracija okruženja

Kopirajte `.env.example` u `.env` i prilagodite vrijednosti:

```bash
cp .env.example .env
```

Jedna `.env` datoteka sadrži **SVE** varijable (backend + frontend):

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/transit-atlas

# Security (generirajte random stringove od 48+ znakova)
SESSION_SECRET=<vaš-random-string>
PASSWORD_PEPPER=<vaš-random-string>

# Cloudflare Turnstile
TURNSTILE_SITE_KEY=<vaš-site-key>
TURNSTILE_SECRET_KEY=<vaš-secret-key>

# Application
APP_ORIGIN=http://localhost:3000
PORT=3001
NODE_ENV=development

# Frontend (Vite)
VITE_API_URL=
VITE_TURNSTILE_SITE_KEY=<vaš-site-key>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
APPLE_CLIENT_ID=<apple-services-id>
APPLE_REDIRECT_URI=https://vaša-domena.com
```

**VAŽNO**: Za produkciju:
- Generirajte **sigurne random stringove** za `SESSION_SECRET` i `PASSWORD_PEPPER`
- Upotrijebite **prave Cloudflare Turnstile ključeve** (ne dummy vrijednosti)
- Postavite `NODE_ENV=production`
- Ažurirajte `VITE_API_URL` na vašu produkcijsku API URL

### 3. Generiranje sigurnih tajni (za produkciju)

```bash
# Linux/Mac
openssl rand -base64 48

# Node.js (bilo gdje)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 4. Cloudflare Turnstile setup

1. Idite na https://dash.cloudflare.com/
2. Odaberite "Turnstile"
3. Kreirajte novi site
4. Kopirajte "Site Key" i "Secret Key"
5. Dodajte domenu u "Domains" (za dev: `localhost`)

### 5. Pokretanje

**Development mode:**
```bash
# Terminal 1 - Backend
npm run server

# Terminal 2 - Frontend
npm run dev
```

**Produkcijski build:**
```bash
npm run build
npm start
```

Aplikacija će biti dostupna na:
- Frontend: http://localhost:3000 (dev) ili isti origin kao backend u produkciji
- API: http://localhost:3001/api

## 🌐 Produkcijski deployment

### Jedna .env datoteka za SVE

Vaš hosting provider može koristiti **jednu .env** koja sadrži i backend i frontend varijable:

```env
# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/transit-atlas?retryWrites=true&w=majority

# Security (SESSION_SECRET/PASSWORD_PEPPER su opcionalni; sustav ima lokalne sigurnosne zadane vrijednosti)
SESSION_SECRET=<opcionalna-nasumična-tajna>
PASSWORD_PEPPER=<opcionalna-stalna-nasumična-tajna>
ADMIN_PANEL_PASSWORD=<nasumična administratorska lozinka od najmanje 16 znakova>
ADMIN_PANEL_SECRET=<opcionalna-odvojena-tajna>
AUTH_LOGIN_ENABLED=true
AUTH_REGISTRATION_ENABLED=true
AUTH_GOOGLE_ENABLED=true
AUTH_APPLE_ENABLED=true

# Cloudflare Turnstile
TURNSTILE_SITE_KEY=<vaš-site-key>
TURNSTILE_SECRET_KEY=<vaš-secret-key>

# Application
APP_ORIGIN=https://vaša-domena.com
PORT=3001
NODE_ENV=production
TRUST_PROXY_HOPS=1

# Frontend (Vite varijable)
VITE_API_URL=
VITE_TURNSTILE_SITE_KEY=<vaš-site-key>
SMTP_HOST=<vaš-smtp-host>
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM=Transit Atlas <noreply@vaša-domena.com>
APP_BASE_URL=https://vaša-domena.com
```

**Napomena**: `VITE_*` varijable se koriste samo tijekom build procesa (`npm run build`). Nakon build-a, frontend samo čita iz statičkih fajlova.

### Prijava Googleom i Appleom

Postavite `GOOGLE_CLIENT_ID` iz Google Cloud OAuth web clienta i `APPLE_CLIENT_ID` kao Apple Services ID. U Google Console dodajte web origin svoje aplikacije. U Apple Developer računu povežite Services ID s primarnim App ID-jem, registrirajte domenu i Return URL iz `APPLE_REDIRECT_URI`. Backend provjerava potpis, izdavatelja, publiku, nonce i potvrđeni email ID tokena. Client ID-jevi nisu tajne; ne stavljajte privatne ključeve u frontend.

Apple prijava zahtijeva Apple Developer konfiguraciju. Bez postavljenog client ID-ja opcija je u sučelju označena kao trenutačno nedostupna.

### Administratorski panel

Otvorite `/admin` i prijavite se lozinkom iz `ADMIN_PANEL_PASSWORD`. Panel može zasebno ugasiti prijavu, registraciju i društvene prijave. Te postavke se spremaju u `backend/data/runtime-settings.json`; za produkcijski hosting s više instanci ili privremenim diskom postavite `ADMIN_SETTINGS_FILE` na zajednički trajni volumen. Lozinka administratora je obavezna. MongoDB URL provjerava se samo kad je prijava ili registracija uključena; ostale env varijable ne blokiraju pokretanje.

Za prvo pokretanje bez autentifikacije postavite `AUTH_LOGIN_ENABLED=false` i `AUTH_REGISTRATION_ENABLED=false`. Administratorske varijable ostaju potrebne za zaštićen pristup panelu.

### Hosting provider specifične postavke

#### Potrebne build komande
```bash
npm install
npm run build
```

#### Start komanda
```bash
npm start
```

#### Port
Server automatski sluša na `process.env.PORT` (postavlja hosting provider)

### Cloudflare postavke

1. **Turnstile Domains**: Dodajte produkcijsku domenu u Turnstile postavke
2. **SSL/TLS**: Postavite na "Full" ili "Full (strict)"
3. **DDoS zaštita**: Uključite Cloudflare DDoS zaštitu
4. **Rate Limiting (opcionalno)**: Dodatna zaštita na razini edge networka

### WAF/Firewall preporuke

Express rate limiting štiti od aplikacijskih napada, ali **NE** štiti od volumetrijskog DDoS-a:
- Koristite Cloudflare WAF ili sličnu zaštitu na edge razini
- Postavite rate limite na hosting provideru ako su dostupni
- Monitorirujte promet i prilagodite limite prema potrebi

**Preporučene postavke (primjer za Cloudflare WAF):**
- API endpoints: 100 zahtjeva/min po IP-u
- Auth endpoints: 5 pokušaja/min po IP-u
- Static files: bez limita (cacheirani)

### MongoDB Atlas setup

1. Kreirajte cluster na https://cloud.mongodb.com/
2. U Network Access dodajte izlaznu IP adresu hostinga; `0.0.0.0/0` koristite samo privremeno kad hosting nema stabilnu izlaznu adresu
3. Kreirajte database user
4. Kopirajte connection string u `MONGODB_URI`

### Email slanje (obavezno za registraciju i oporavak računa u produkciji)

Za slanje verifikacije emaila i resetiranja lozinke dodajte SMTP konfiguraciju. Bez nje server se i dalje pokreće, ali te email funkcije neće raditi:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@transit-atlas.com
```

U lokalnom razvoju, kad SMTP nije postavljen, token se može koristiti za testiranje. Produkcijski server ne zahtijeva SMTP pri pokretanju i nikad ne vraća tokene u HTTP odgovoru.

## 🔒 Sigurnosne mjere

### Implementirane zaštite

✅ **Autentifikacija**
- Argon2id hashiranje s pepper-om
- Server-side sesije (MongoDB)
- HttpOnly, Secure, SameSite cookies
- Regeneracija sesije nakon prijave

✅ **Anti-bot**
- Cloudflare Turnstile (registracija, reset lozinke)
- Isključivo na backendu, ne može se zaobići

✅ **Rate limiting**
- 100 zahtjeva/15min po IP-u (opći API)
- 5 pokušaja/15min (autentifikacija)
- 10 zahtjeva/min (skupe operacije - shapes, GTFS download)

✅ **Sprječavanje napada**
- CSRF zaštita
- Validacija svih ulaza (express-validator)
- Ograničenje veličine zahtjeva (10kb)
- Sprječavanje enumeracije korisnika
- Jednokratni hashirani tokeni (verifikacija, reset)

✅ **Sigurnosni headeri**
- Helmet middleware
- Content Security Policy
- HSTS
- Referrer Policy

✅ **CORS**
- Whitelist dozvoljenih domena
- Credentials support

### Što NIJE pokriveno

❌ **Volumetrijski DDoS**: Potrebna zaštita na edge razini (Cloudflare, WAF)
✅ **Email slanje**: SMTP potvrde emaila i reset lozinke kad je SMTP konfiguriran
❌ **Advanced bot detection**: Turnstile je osnovna zaštita
❌ **IP geolocation**: Nema geo-based ograničenja

## 🧪 Testiranje

### Provjera autentifikacije

1. Otvorite aplikaciju
2. Kliknite "Prijava" → "Registrirajte se"
3. Unesite email i lozinku (min 8 znakova)
4. Riješite Turnstile challenge
5. Provjerite da se sesija sprema (ostajete prijavljeni nakon refresh-a)

### Provjera rate limitinga

```bash
# Pokušajte više od 5 prijava u minuti
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done
# Trebali biste dobiti 429 Too Many Requests nakon 5. pokušaja
```

### Provjera GTFS podataka

```bash
# Stanice
curl http://localhost:3001/api/stops/zagreb

# Linije
curl http://localhost:3001/api/routes/zagreb

# Status
curl http://localhost:3001/api/system/status
```

## 📱 Mobilna prilagodba

- ✅ Responzivni header (skriva dugački tekst na malim ekranima)
- ✅ Touch-friendly gumbi (min 44px)
- ✅ Prilagodljivi filtri i paneli
- ✅ Portrait i landscape orijentacija
- ✅ Optimiziran layout za telefone i tablete
- ✅ Readable font sizes (min 14px)
- ✅ High contrast (WCAG AA)

## 🐛 Debugging

### Backend ne pokreće se

```bash
# Provjerite .env
cat .env | grep -v "^#" | grep -v "^$"

# Provjerite MongoDB konekciju
mongosh $MONGODB_URI

# Provjerite port
lsof -i :3001
```

### Frontend ne učitava podatke

1. Provjerite CORS: `APP_ORIGIN` mora sadržavati frontend URL
2. Provjerite `VITE_API_URL` u frontend `.env`
3. Provjerite Network tab u browseru

### Turnstile ne radi

1. Provjerite da su ključevi ispravni
2. Provjerite da je domena dodana u Cloudflare dashboard
3. Za localhost, koristite test ključeve ili dodajte `localhost` u Turnstile domene

## 📊 Monitoring (preporuke)

Za produkciju, implementirajte:
- Application monitoring (npr. Sentry za greške)
- Uptime monitoring (npr. UptimeRobot)
- MongoDB monitoring (Atlas ima ugrađeni)
- Log aggregation (npr. Papertrail, Loggly)

---

**VAŽNO**: Prije deployanja u produkciju:
1. ✅ Promijenite sve dummy tajne
2. ✅ Postavite prave Turnstile ključeve
3. ✅ Konfigurirajte MongoDB Atlas
4. ✅ Postavite `NODE_ENV=production`
5. ✅ Testirajte autentifikaciju i rate limiting
6. ✅ Konfigurirajte Cloudflare DDoS zaštitu
7. ✅ Implementirajte email slanje (opcionalno)
