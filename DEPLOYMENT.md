# 🚀 Deployment Guide - Jedinstvena .env konfiguracija

## ✅ Brzi pregled

Transit Atlas koristi **JEDNU `.env` datoteku** za sve konfiguracije (backend + frontend). Vaš hosting provider može jednostavno učitati sve varijable iz jednog mjesta.

## 📋 Environment varijable za hosting provider

Kopirajte ovo u svoj hosting provider dashboard (Environment Variables sekcija):

```env
# MongoDB - OBAVEZNO
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/transit-atlas?retryWrites=true&w=majority

# Security - GENERIRAJTE NOVE VRIJEDNOSTI
SESSION_SECRET=<generirajte-48-random-znakova>
PASSWORD_PEPPER=<generirajte-48-random-znakova>
ADMIN_PANEL_PASSWORD=<duga-nasumična-lozinka>
# ADMIN_PANEL_SECRET je opcionalan; ADMIN_PANEL_PASSWORD se koristi za potpis ako nije postavljen.
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
SMTP_FROM=Transit Atlas <noreply@vaša-domena.com>
APP_BASE_URL=https://vaša-domena.com
GOOGLE_CLIENT_ID=<google-oauth-client-id>
APPLE_CLIENT_ID=<apple-services-id>
APPLE_REDIRECT_URI=https://vaša-domena.com
```

**VAŽNO**: `PORT` varijablu **NE** postavljate - hosting provider automatski postavlja `process.env.PORT`.

Administratorski panel nalazi se na `/admin`; postavite `ADMIN_PANEL_PASSWORD`. Potpisna tajna je opcionalna. Ako obje opcije autentifikacije postavite na `false`, server ne spaja MongoDB. Kad su prijava ili registracija uključene, jedina dodatna env provjera pri pokretanju je `MONGODB_URI`. SMTP i Turnstile koriste se samo kad su njihove funkcije pozvane. Za postojane postavke na hostingu s više instanci postavite `ADMIN_SETTINGS_FILE` na zajednički trajni volumen.

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
