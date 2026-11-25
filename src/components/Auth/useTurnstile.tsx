import { useEffect, useRef, useState } from 'react';
import { language, t } from '../../services/i18n';
import { API_ORIGIN, isNativeApp } from '../../services/platform';

type Action = 'login' | 'register' | 'forgot_password' | 'analyze_photos';

interface Turnstile {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: Action;
    language: 'hr' | 'en';
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  ready: (callback: () => void) => void;
  reset: (widget: string) => void;
  remove: (widget: string) => void;
}

declare global {
  interface Window { turnstile?: Turnstile }
}

const configuredSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
const siteKey = import.meta.env.DEV || !/^[123]x0{8}/.test(configuredSiteKey || '') ? configuredSiteKey : undefined;
const optional = import.meta.env.DEV && !siteKey;
const messageType = 'transitly-turnstile';
let scriptLoad: Promise<Turnstile> | undefined;

function loadTurnstile() {
  scriptLoad ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    function fail() {
      script.remove();
      reject(new Error('Turnstile nije dostupan.'));
    }
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      const turnstile = window.turnstile;
      if (turnstile) turnstile.ready(() => resolve(turnstile));
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => {
    scriptLoad = undefined;
    throw error;
  });
  return scriptLoad;
}

export function useTurnstile(action: Action, { hosted = false, enabled = true } = {}) {
  const [token, setToken] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string>();
  const frame = useRef<HTMLIFrameElement>(null);
  const bridgeOrigin = enabled && !hosted && !optional && isNativeApp() ? new URL(API_ORIGIN).origin : '';

  useEffect(() => {
    if (!bridgeOrigin) return;
    function receive(event: MessageEvent) {
      if (event.origin === bridgeOrigin && event.source === frame.current?.contentWindow &&
          event.data?.type === messageType && typeof event.data.token === 'string') {
        setToken(event.data.token);
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [bridgeOrigin]);

  useEffect(() => {
    if (!enabled) { setToken(''); return; }
    const element = container.current;
    if (!siteKey || !element) return;
    let active = true;
    void loadTurnstile().then(turnstile => {
      if (!active) return;
      widget.current = turnstile.render(element, {
        sitekey: siteKey,
        action,
        language,
        callback: value => { setFailed(false); setToken(value); },
        'expired-callback': () => setToken(''),
        'error-callback': () => { setFailed(true); setToken(''); }
      });
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (widget.current !== undefined) window.turnstile?.remove(widget.current);
      widget.current = undefined;
    };
  }, [action, enabled]);

  function reset() {
    setToken('');
    if (bridgeOrigin) setAttempt(previous => previous + 1);
    if (widget.current !== undefined) window.turnstile?.reset(widget.current);
  }

  const query = new URLSearchParams({ action, parent: `${window.location.protocol}//${window.location.host}` });
  const challenge = !enabled ? null : bridgeOrigin ? (
    <iframe key={attempt} ref={frame} src={`${bridgeOrigin}/auth/turnstile?${query}`}
      title={t("Sigurnosna provjera")} referrerPolicy="no-referrer" className="h-28 w-full border-0" />
  ) : optional ? null : <>
    <div ref={container} className="flex justify-center" />
    {(!siteKey || failed) && <p className="text-sm text-red-700" role="alert">{t("Sigurnosna provjera trenutačno nije dostupna. Pokušajte ponovno.")}</p>}
  </>;
  return { challenge, ready: optional || Boolean(token), token, reset };
}

function HostedChallenge({ action, parent }: { action: Action; parent: string }) {
  const { challenge, token } = useTurnstile(action, { hosted: true });
  useEffect(() => {
    window.parent.postMessage({ type: messageType, token }, parent);
  }, [parent, token]);
  return <main className="h-screen bg-white">{challenge}</main>;
}

export function NativeTurnstilePage() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');
  const parent = params.get('parent');
  if ((action !== 'login' && action !== 'register' && action !== 'forgot_password') ||
      (parent !== 'https://localhost' && parent !== 'capacitor://localhost') || window.parent === window) return null;
  return <HostedChallenge action={action} parent={parent} />;
}
