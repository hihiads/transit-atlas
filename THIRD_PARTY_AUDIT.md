# Transitly: third-party services and SDK review

Reviewed 2026-11-22 against the application code and current package manifest.

| Service or SDK | Where used | Data or network exposure | Action / status |
| --- | --- | --- | --- |
| Google Identity Services | Google sign-in | Google receives browser connection data; Transitly receives the verified account email and subject. | Authentication only; no analytics SDK detected. |
| Cloudflare Turnstile | Registration and password recovery | Browser contacts Cloudflare and submits challenge response. | Abuse prevention; disclosed in privacy and cookie pages. |
| OpenStreetMap tile service | Transit map | Tile requests expose IP address and requested map areas to tile provider. | Map attribution is shown in the map controls. |
| Google Gemini API (`@google/generative-ai`) | Separate SecondLook photo analysis | User-selected images and entered listing details are sent when analysis is requested. | Optional feature; disclosed in privacy page. No image persistence in Transitly route code. |
| MongoDB and Render | Account/session storage and server hosting | Account records and session records are processed by configured database/host. | Actual account, region, retention terms and processing agreement depend on deployment configuration and still need operator verification. |
| SMTP provider | Email verification and password reset | Recipient email and transactional message content are sent to configured SMTP provider. | Provider is environment-configured and was not identifiable from repository. |

The account data necessary for sign-in includes password hashes or a Google subject, age band, terms acceptance record and, for ages 10–15 only, guardian email and consent time. Unconfirmed guardian requests (including their password hashes) expire after seven days.

No advertising or analytics SDK was found in the reviewed main Transitly source. This is a repository review, not a review of the runtime network, hosting account settings, subprocessors, or provider contract terms. Recheck when dependencies, features, or deployment configuration change.
