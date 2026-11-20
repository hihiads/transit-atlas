# Google prijava i registracija

## Google prijava

1. U [Google Cloud Console](https://console.cloud.google.com/) odaberite projekt i uključite **Google Identity Services**.
2. U **Google Auth Platform → Clients** napravite OAuth client tipa **Web application**.
3. U **Authorized JavaScript origins** dodajte domenu aplikacije, npr. `https://transit-atlas.onrender.com`. Za lokalni Vite dodajte `http://localhost:5173`.
4. Kopirajte OAuth **Client ID** (završava s `.apps.googleusercontent.com`) u serversko okruženje:

   ```env
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   AUTH_GOOGLE_ENABLED=true
   ```

   Taj Client ID smije biti javno vidljiv. Za ovaj Google popup način prijave ne treba Client Secret niti redirect URI.
5. U administratorskoj ploči uključite **Google prijava** i spremite postavke. Ponovno pokrenite server nakon promjene varijabli.

## Omogućavanje registracije

Produkcijska registracija koristi Cloudflare Turnstile. Napravite widget za istu domenu u Cloudflare dashboardu i postavite:

```env
TURNSTILE_SITE_KEY=...     # javni ključ widgeta
VITE_TURNSTILE_SITE_KEY=... # isti javni ključ; dostupan pri izgradnji frontenda
TURNSTILE_SECRET_KEY=...   # tajni ključ; samo serversko okruženje
```

U Renderu dodajte `TURNSTILE_SITE_KEY` i `TURNSTILE_SECRET_KEY` kao environment variables, a `VITE_TURNSTILE_SITE_KEY` kao build environment variable pa pokrenite novi deploy. Provjerite da je **Registracija** uključena u administratorskoj ploči.

Email potvrda novih računa također traži SMTP postavke: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` i `SMTP_FROM`. Bez njih server može izraditi račun, ali ne može poslati poveznicu za potvrdu.
