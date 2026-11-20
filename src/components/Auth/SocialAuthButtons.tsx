import { useEffect, useRef, useState } from 'react';
import { createOAuthChallenge, finishOAuth, getOAuthProviders } from '../../services/auth';

declare global {
  interface Window {
    google?: {
      accounts: { id: {
        initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }) => void;
        renderButton: (element: HTMLElement, options: Record<string, string>) => void;
      } };
    };
  }
}

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing?.dataset.loaded === 'true') return resolve();
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google prijava trenutačno nije dostupna.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error('Google prijava trenutačno nije dostupna.'));
    document.head.appendChild(script);
  });
}

export default function SocialAuthButtons({ onSuccess }: { onSuccess: () => void }) {
  const googleButton = useRef<HTMLDivElement>(null);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    let active = true;
    let refreshInterval: number | undefined;
    getOAuthProviders().then(async providers => {
      if (!active) return;
      setGoogleEnabled(providers.google);
      if (!providers.google || !providers.googleClientId) return;
      await loadGoogleScript();
      const refreshChallenge = async () => {
        const challenge = await createOAuthChallenge('google');
        if (!active || !window.google || !googleButton.current) return;
        window.google.accounts.id.initialize({
          client_id: providers.googleClientId!,
          nonce: challenge.nonce,
          callback: async response => {
            try {
              await finishOAuth('google', response.credential);
              onSuccessRef.current();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Google prijava nije uspjela.');
              void refreshChallenge().catch(() => {});
            }
          }
        });
        googleButton.current.replaceChildren();
        window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', shape: 'rectangular', text: 'continue_with', locale: 'hr', width: '340' });
      };
      await refreshChallenge();
      refreshInterval = window.setInterval(() => void refreshChallenge().catch(() => {}), 4 * 60 * 1000);
    }).catch(cause => active && setError(cause instanceof Error ? cause.message : 'Google prijava trenutačno nije dostupna.'));
    return () => { active = false; if (refreshInterval) window.clearInterval(refreshInterval); };
  }, []);

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center gap-3 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" /><span>ili nastavite s</span><span className="h-px flex-1 bg-gray-200" /></div>
      <div ref={googleButton} className="flex min-h-10 justify-center" aria-label="Nastavi s Googleom">
        {googleEnabled === false && <button type="button" disabled className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-400">Google · trenutačno nedostupan</button>}
      </div>
      {error && <p className="text-center text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
