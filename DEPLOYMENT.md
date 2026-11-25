# 🚀 Deployment Guide - Jedinstvena .env konfiguracija

## ✅ Brzi pregled

Transitly koristi **JEDNU `.env` datoteku** za sve konfiguracije (backend + frontend). Vaš hosting provider može jednostavno učitati sve varijable iz jednog mjesta.

## 📋 Environment varijable za hosting provider

Kopirajte ovo u svoj hosting provider dashboard (Environment Variables sekcija):

```env
# MongoDB - OBAVEZNO
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/transit-atlas?retryWrites=true&w=majority

# Security - GENERIRAJTE NOVE VRIJEDNOSTI
SESSION_SECRET=<generirajte-48-random-znakova>
PASSWORD_PEPPER=<generirajte-48-random-znakova>
ADMIN_PANEL_PASSWORD=<duga-nasumična-lozinka>
ADMIN_HOST=admin.transitly.eu
CLOUDFLARE_ACCESS_TEAM_DOMAIN=<tim>.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUD=<aud-iz-cloudflare-access-aplikacije>
AUTH_LOGIN_ENABLED=true
AUTH_REGISTRATION_ENABLED=true
AUTH_GOOGLE_ENABLED=true
AUTH_APPLE_ENABLED=true

# Cloudflare Turnstile - DOBIJETE NA https://dash.cloudflare.com/
TURNSTILE_SITE_KEY=<vaš-cloudflare-site-key>
TURNSTILE_SECRET_KEY=<vaš-cloudflare-secret-key>

# Application
APP_ORIGIN=https://vaša-domena.com
NODE_ENV=production
TRUST_PROXY_HOPS=1

# Frontend (Vite) - koriste se samo pri build-u
VITE_API_URL=https://vaša-domena.com
VITE_TURNSTILE_SITE_KEY=<vaš-cloudflare-site-key>
SMTP_HOST=<vaš-smtp-host>
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM=Transitly <noreply@vaša-domena.com>
APP_BASE_URL=https://vaša-domena.com
GOOGLE_CLIENT_ID=<google-oauth-client-id>
APPLE_CLIENT_ID=<apple-services-id>
APPLE_REDIRECT_URI=https://vaša-domena.com
```

**VAŽNO**: `PORT` varijablu **NE** postavljate - hosting provider automatski postavlja `process.env.PORT`.

### Administratorski pristup

Dodajte `admin.transitly.eu` kao custom domenu na Renderu i uključite Cloudflare proxy. U Cloudflare Accessu napravite self-hosted aplikaciju za cijeli `admin.transitly.eu`. Dopustite samo imenovane administratore uz MFA. Postavite domenu, Access team domain i Application Audience (AUD) na Renderu. Express provjerava host i potpisani Access token prije posluživanja panela ili `/api/admin` ruta. Otvorite `https://admin.transitly.eu/admin` i nakon Access prijave unesite `ADMIN_PANEL_PASSWORD`. Admin sesija traje 30 minuta i opoziva se pri odjavi. Sesije i ograničenja zahtjeva čuvaju se u memoriji jedne instance. [Cloudflare Access provjera tokena](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

Bez postavki za Access admin rute u produkciji vraćaju 404. Na `transitly.eu`, `www.transitly.eu` i Renderovoj zadanoj domeni provjerite da `/admin` i `/api/admin/settings` vraćaju 404. `/api/system/status` služi provjeri dostupnosti. Detalji feedova dostupni su nakon prijave u panel.

### Cloudflare cache i ograničenje za vozila

Na javnim hostnameovima označite `GET /api/vehicles/zagreb` bez queryja kao *Eligible for cache*. Za Edge TTL i Browser TTL koristite postavke koje poštuju zaglavlja Origina. Zadržite `Origin` u ključu cachea. Uspješni odgovori s vozilima imaju TTL od 10 sekundi na Cloudflareu. Provjerite `CF-Cache-Status` i `Age` ponovljenim čitanjem iste adrese. [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)

U Cloudflare WAF-u dodajte rate limit po IP adresi na `starts_with(http.request.uri.path, "/api/vehicles/")` i uključite brojanje odgovora iz cachea. Uskladite prag s limitom aplikacije od 120 zahtjeva u 60 sekundi, ovisno o razdobljima koja podržava vaš plan. Provjerite da `TRUST_PROXY_HOPS` odgovara Renderovu ulaznom proxyju i da se zahtjevi različitih klijenata broje zasebno. [Cloudflare WAF pravilo za ograničenje zahtjeva](https://developers.cloudflare.com/waf/rate-limiting-rules/create-zone-dashboard/)

Kad su prijava ili registracija uključene, produkcija zahtijeva `MONGODB_URI`, `SESSION_SECRET` i `PASSWORD_PEPPER`. Postavite zasebne tajne od najmanje 32 znaka. Za postojeće račune zadržite pepper s kojim su hashirane njihove lozinke. Postavite točan HTTPS origin aplikacije u `APP_ORIGIN`, HTTPS adresu u `APP_BASE_URL` i SMTP s TLS-om. Za prijavu lozinkom, registraciju i zahtjev za resetiranje lozinke postavite produkcijski Turnstile ključ i tajnu. Turnstile hostname mora biti konfigurirani javni HTTPS host aplikacije. Instalirana aplikacija dohvaća widget s tog hosta, pa na uređajima provjerite novi build prije objave. Stare email poveznice s tokenom u queryju treba zamijeniti novim poveznicama.

## 🔐 Generiranje sigurnih tajni

Pokrenite ovu komandu **DVAPUT** (jednom za SESSION_SECRET, jednom za PASSWORD_PEPPER):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## 🏗️ Build i Start komande

### Build Command:
```bash
npm install && npm run build
```

### Start Command:
```bash
npm start
```

## 🔧 Hosting Provider Setup (primjer: Render/Heroku/Railway)

### 1. MongoDB Atlas
1. Idite na https://cloud.mongodb.com/
2. Create Cluster → Shared (besplatno)
3. Database Access → Add User (username/password)
4. Network Access → Add IP Address → dozvolite samo izlaznu IP adresu aplikacijskog hostinga; koristite `0.0.0.0/0` samo privremeno ako hosting nema stabilne izlazne IP adrese.
5. Cluster → Connect → Application → Kopirajte connection string
6. Zamijenite `<password>` s vašom lozinkom u `MONGODB_URI`

### 2. Cloudflare Turnstile
1. Idite na https://dash.cloudflare.com/
2. Turnstile → Add Site
3. Unesite vašu domenu (npr. `transit-atlas.onrender.com`)
4. Kopirajte Site Key i Secret Key
5. Dodajte u env varijable

### 3. Environment Varijable
Dodajte **SVE** varijable iz liste gore u hosting provider dashboard.

**Render primjer:**
- Dashboard → Your Service → Environment
- Dodajte svaku varijablu pojedinačno (Name → Value)

**Heroku primjer:**
```bash
heroku config:set MONGODB_URI="mongodb+srv://..."
heroku config:set SESSION_SECRET="..."
# ... itd
```

### 4. Deploy
- Push kod na GitHub
- Povežite GitHub repo s hosting providerom
- Automatic deploy će pokrenuti build i start komande

## ✅ Provjera da li radi

Nakon deploya, provjerite:

```bash
# 1. API status
curl https://vaša-domena.com/api/system/status

# 2. Frontend učitava se
curl https://vaša-domena.com/

# 3. GTFS podaci
curl https://vaša-domena.com/api/stops/zagreb
```

## 🐛 Troubleshooting

### Server ne pokreće se
**Provjera:** Logs u hosting provider dashboard
- **Greška**: `MONGODB_URI not configured`
  - **Rješenje**: Provjerite da je `MONGODB_URI` točno postavljen

- **Greška**: `MongoDB connection failed`
  - **Rješenje**: Provjerite IP allowlist u MongoDB Atlasu i dozvolite izlaznu IP adresu hostinga.

### Frontend pokazuje CORS grešku
**Rješenje**: Provjerite da `APP_ORIGIN` sadrži vašu domenu:
```env
APP_ORIGIN=https://vaša-domena.com,https://www.vaša-domena.com
```

### Turnstile ne radi
**Rješenje**:
1. Provjerite da ste dodali domenu u Cloudflare Turnstile dashboard
2. Provjerite da su ključevi točni
3. Za localhost developmenet, dodajte `localhost` u Turnstile domene

### Build timeout
**Rješenje**: Neki provideri imaju timeout na buildu. Povećajte timeout ili upotrijebite:
```bash
npm ci --prefer-offline && npm run build
```

## 📊 Monitoring

Nakon deploya, pratite:
- **CPU/Memory**: U hosting provider dashboardu
- **MongoDB**: MongoDB Atlas → Metrics
- **Error logs**: Hosting provider logs
- **Uptime**: UptimeRobot ili sličan servis

## 🔄 Ažuriranje

Za deploy novih promjena:
1. Push na GitHub
2. Hosting provider automatski rebuilda
3. Server restarta s novim kodom

Ako mijenjate env varijable:
1. Ažurirajte u hosting provider dashboardu
2. Ručni restart servera (Dashboard → Restart)

## 💡 Best Practices

✅ **DOs:**
- Generirajte nove tajne za svaki environment (dev/staging/prod)
- Koristite MongoDB Atlas whitelisting (ne `0.0.0.0/0` u produkciji ako je moguće)
- Postavi Cloudflare DDoS zaštitu
- Redovito provjeravajte logove

❌ **DON'Ts:**
- Ne commitajte `.env` u Git
- Ne dijelite SESSION_SECRET ni PASSWORD_PEPPER
- Ne koristite dummy Turnstile ključeve u produkciji
- Ne ostavljajte MongoDB lozinku u plain text fileovima

## 🆘 Potrebna pomoć?

Provjerite:
1. Hosting provider logove
2. MongoDB Atlas metrics
3. Browser Network tab (F12)
4. Backend response headers

---

**Sve postavke u jednoj `.env` datoteci = jednostavan deployment! 🎉**
