import { useEffect, useRef, useState } from 'react';
import { createOAuthChallenge, finishOAuth, getOAuthProviders, OAuthChallenge, OAuthProviders } from '../../services/auth';

declare global {
  interface Window {
    google?: {
      accounts: { id: {
        initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }) => void;
        renderButton: (element: HTMLElement, options: Record<string, string>) => void;
      } };
    };
    AppleID?: {
      auth: {
        init: (options: { clientId: string; scope: string; redirectURI: string; state: string; nonce: string; usePopup: boolean }) => void;
        signIn: () => Promise<{ authorization: { id_token: string; state: string } }>;
      };
    };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === 'true') return resolve();
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Skripta se ne može učitati.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error('Skripta se ne može učitati.'));
    document.head.appendChild(script);
  });
}

export default function SocialAuthButtons({ onSuccess }: { onSuccess: () => void }) {
  const googleButton = useRef<HTMLDivElement>(null);
  const [providers, setProviders] = useState<OAuthProviders | null>(null);
  const [appleChallenge, setAppleChallenge] = useState<OAuthChallenge | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onSuccessRef = useRef(onSuccess);
  const refreshRef = useRef<((provider: 'google' | 'apple') => Promise<void>) | null>(null);
  onSuccessRef.current = onSuccess;

  async function complete(provider: 'google' | 'apple', idToken: string, state?: string) {
    setBusy(true);
    setError('');
    try {
      await finishOAuth(provider, idToken, state);
      onSuccessRef.current();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Prijava nije uspjela. Pokušajte ponovno.');
      await refreshRef.current?.(provider);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    let cleanupInterval: number | undefined;
    getOAuthProviders().then(async (available) => {
      if (!active) return;
      setProviders(available);
      try {
        await Promise.all([
          available.google ? loadScript('https://accounts.google.com/gsi/client') : Promise.resolve(),
          available.apple ? loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js') : Promise.resolve()
        ]);
        const refreshProvider = async (provider: 'google' | 'apple') => {
          const challenge = await createOAuthChallenge(provider);
          if (!active) return;
          if (provider === 'google' && available.googleClientId && window.google && googleButton.current) {
            window.google.accounts.id.initialize({
              client_id: available.googleClientId,
              nonce: challenge.nonce,
              callback: response => void complete('google', response.credential)
            });
            googleButton.current.replaceChildren();
            window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', locale: 'hr', width: '340' });
          }
          if (provider === 'apple' && available.appleClientId && window.AppleID) {
            window.AppleID.auth.init({ clientId: available.appleClientId, scope: 'name email', redirectURI: available.appleRedirectUri || window.location.origin, state: challenge.state, nonce: challenge.nonce, usePopup: true });
            setAppleChallenge(challenge);
            setAppleReady(true);
          }
        };
        refreshRef.current = refreshProvider;
        if (available.google) await refreshProvider('google');
        if (available.apple) await refreshProvider('apple');
        const interval = window.setInterval(() => {
          if (available.google) void refreshProvider('google');
          if (available.apple) void refreshProvider('apple');
        }, 4 * 60 * 1000);
        if (!active) window.clearInterval(interval);
        else cleanupInterval = interval;
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Društvena prijava trenutačno nije dostupna.');
      }
    }).catch(() => active && setProviders({ google: false, apple: false, googleClientId: null, appleClientId: null, appleRedirectUri: null }));
    return () => { active = false; if (cleanupInterval) window.clearInterval(cleanupInterval); };
  }, []);

  async function signInWithApple() {
    if (!window.AppleID || !appleChallenge || appleChallenge.expires < Date.now()) {
      setError('Apple prijava je istekla. Zatvorite i ponovno otvorite prijavu.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await window.AppleID.auth.signIn();
      if (response.authorization.state !== appleChallenge.state) throw new Error('Sigurnosna provjera nije prošla.');
      await complete('apple', response.authorization.id_token, response.authorization.state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Apple prijava nije uspjela.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center gap-3 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" /><span>ili nastavite s</span><span className="h-px flex-1 bg-gray-200" /></div>
      <div ref={googleButton} className="flex min-h-10 justify-center" aria-label="Nastavi s Googleom">
        {providers && !providers.google && <button type="button" disabled className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-400">Google · trenutačno nedostupno</button>}
      </div>
      {providers && !providers.apple ? (
        <button type="button" disabled className="h-10 w-full rounded-md bg-gray-100 text-sm text-gray-400">Apple · trenutačno nedostupno</button>
      ) : providers?.apple ? (
        <button type="button" onClick={signInWithApple} disabled={!appleReady || busy} className="h-10 w-full rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"> &nbsp; Nastavi s Appleom</button>
      ) : null}
      {error && <p className="text-center text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
