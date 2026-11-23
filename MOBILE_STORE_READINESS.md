# Transitly mobile store readiness

This repository now contains Android and iOS Capacitor projects. The ZET and HŽPP frontends are packaged as local web assets; the native app does not load the live website as its main screen.

## Native app behavior

- Location is requested only after the user chooses a location or nearest-station action. No background location permission is requested.
- Tracked ZET departures can schedule local device reminders. Notification permission is requested only after the user chooses to enable reminders. Android reminders are inexact so the app does not request exact-alarm access.
- Native screens use Transitly's email-and-password account system. Google sign-in is hidden in the app because Google's web OAuth flow must not run in an embedded WebView. A user with a verified Google-only account can set a Transitly password through “Zaboravili ste lozinku?” using the same email.
- Account deletion is available inside the app and at https://transitly.eu/delete-account.
- Native API requests use VITE_NATIVE_API_URL (defaults to https://transitly.eu). The backend accepts only configured app origins and issues secure cross-site session cookies to those origins.

## Required before a store submission

1. **Build and review on devices.** Run npm run mobile:sync, then open Android Studio or Xcode. Verify sign-in, registration, parent-consent email, account deletion, location denial, notification denial, ZET/HŽPP navigation, and the offline/error states on real iOS and Android devices.
2. **Finish account-provider decisions.** The native app currently offers first-party email/password sign-in. If Google sign-in is added back to iOS, implement a native OAuth flow and an equivalent privacy-preserving sign-in option such as Sign in with Apple; that requires Apple Developer capabilities and server-side token verification. Do not put Google OAuth in a WebView.
3. **Configure Turnstile for the native hostname.** The app's local WebView hostname is localhost. Add localhost to the production Turnstile site's allowed hostnames, then verify registration and password-reset challenges on both platforms. The backend APP_ORIGIN must include https://transitly.eu, https://www.transitly.eu, https://transit-atlas.onrender.com, https://localhost, capacitor://localhost, and any staging API origin used for mobile development; render.yaml now declares the production origins.
4. **Complete child-audience review.** The account flow accepts users aged 10–15 only after a parent or guardian confirms by email. Because this includes ages 10–12, Play Console audience declarations must reflect that if those ages can use the app. Complete Google's Families and SDK review for every included service before claiming the app is child-directed or submitting it to that audience. Confirm Turnstile and any other SDK/service are permitted for the declared audience. Do not declare 13+ while offering accounts to 10–12-year-olds.
5. **Complete privacy and store forms.** Use the published privacy policy and deletion page URLs. Fill Apple's privacy details and age-rating questionnaire and Google's Data safety and account-deletion sections from the actual production configuration, including hosting, database, email, Turnstile, location, account data, and local notifications. The age rating is set by each store's questionnaire; there is no exact “10+” store rating. Select Apple's Kids category only if Transitly is primarily designed for children.
6. **Complete listing and review access.** Reserve/confirm bundle ID eu.transitly.app, provide app icon and screenshots, support/contact and privacy URLs, an active review account or full demo mode, and reviewer notes. Apple requires the app to offer lasting app-like utility beyond a repackaged website; native location and device reminders add native behavior, but Apple makes the final review decision.
7. **Use platform build tools.** Android uses target API 36. Capacitor 8 requires Android Studio 2025.2.1 or later and the Android 16 SDK. The iOS project requires macOS with Xcode 26 or later. Create/sign release builds with the respective developer accounts and keep signing credentials out of this repository.

## Store policy references

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — minimum functionality, login services, account deletion, privacy, and kids.
- [Apple age ratings](https://developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/) — age-rating questionnaire output.
- [Google Play target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-en) — current target API requirements.
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-en) — in-app deletion and a web deletion resource.
- [Google Play Families policy](https://support.google.com/googleplay/android-developer/answer/18265346?hl=en) — requirements when children are in the declared audience.
