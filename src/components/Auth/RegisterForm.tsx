import { useState, FormEvent, useEffect, useRef } from 'react';
import { AuthResponse, register, RegistrationConsent, SignedInUser } from '../../services/auth';
import SocialAuthButtons from './SocialAuthButtons';

interface RegisterFormProps {
  onSuccess: (response: AuthResponse) => void;
  onSocialSuccess: (user: SignedInUser) => void | Promise<void>;
  onSwitchToLogin: () => void;
  allowLogin: boolean;
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: {
        sitekey: string;
        action: string;
        callback: (token: string) => void;
        'error-callback': () => void;
        theme?: 'light' | 'dark';
      }) => string;
      reset: (widgetId: string) => void;
    };
  }
}

export default function RegisterForm({ onSuccess, onSocialSuccess, onSwitchToLogin, allowLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageRange, setAgeRange] = useState<RegistrationConsent['ageRange']>('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const turnstileOptional = import.meta.env.DEV && !turnstileSiteKey;
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.turnstile && turnstileRef.current) {
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
          sitekey: turnstileSiteKey,
          action: 'register',
          callback: (token: string) => setTurnstileToken(token),
          'error-callback': () => {
            setError('Turnstile provjera nije uspjela');
            setTurnstileToken(null);
          },
          theme: 'light'
        });
      }
    };

    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError('Lozinke se ne podudaraju');
      return;
    }

    if (!turnstileToken && !turnstileOptional) {
      setError('Molimo pričekajte Turnstile provjeru');
      return;
    }

    setLoading(true);

    try {
      const consent: RegistrationConsent = { termsAccepted, ageRange, guardianEmail };
      const response = await register(email, password, turnstileToken || '', consent);
      setSuccess(response.message);

      // Reset Turnstile
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
      }
      setTurnstileToken(null);

      onSuccess(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri registraciji');

      // Reset Turnstile
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
      }
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-center text-primary">Registracija</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={255}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            disabled={loading}
          />
        </div>

        <fieldset className="space-y-2 rounded-lg border border-gray-300 p-3">
          <legend className="px-1 text-sm font-semibold text-gray-800">Dobna skupina</legend>
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input type="radio" name="ageRange" value="16+" required checked={ageRange === '16+'} onChange={() => setAgeRange('16+')} disabled={loading} />
            <span>Imam 16 ili više godina.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input type="radio" name="ageRange" value="10-15" required checked={ageRange === '10-15'} onChange={() => setAgeRange('10-15')} disabled={loading} />
            <span>Imam od 10 do 15 godina.</span>
          </label>
        </fieldset>

        {ageRange === '10-15' && <div>
          <label htmlFor="guardianEmail" className="mb-1 block text-sm font-medium text-gray-800">Email roditelja ili skrbnika</label>
          <input id="guardianEmail" type="email" autoComplete="email" value={guardianEmail} onChange={event => setGuardianEmail(event.target.value)} required maxLength={255} disabled={loading} className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary" />
          <p className="mt-1 text-xs leading-5 text-gray-700">Račun se neće otvoriti dok roditelj ili skrbnik ne potvrdi suglasnost putem emaila. Nepotvrđeni zahtjev briše se nakon 7 dana.</p>
        </div>}

        <label className="flex items-start gap-2 text-sm leading-5 text-gray-800">
          <input type="checkbox" checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} required disabled={loading} className="mt-1" />
          <span>Prihvaćam <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-blue-800 underline">Uvjeti korištenja</a> i potvrđujem da sam pročitao/la <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-blue-800 underline">Politiku privatnosti</a>.</span>
        </label>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Lozinka (najmanje 8 znakova)
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Potvrdi lozinku
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            disabled={loading}
          />
        </div>

        {turnstileSiteKey ? <div ref={turnstileRef} className="flex justify-center"></div> : turnstileOptional ? null : (
          <p className="text-sm text-red-700" role="alert">Registracija trenutačno nije konfigurirana. Administrator treba postaviti Cloudflare Turnstile ključeve.</p>
        )}

        <button
          type="submit"
          disabled={loading || (!turnstileToken && !turnstileOptional)}
          className="w-full bg-primary text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {loading ? 'Registracija...' : 'Registriraj se'}
        </button>
      </form>

      <SocialAuthButtons onSuccess={onSocialSuccess} intent="register" consent={{ termsAccepted, ageRange, guardianEmail }} />

      {allowLogin && <div className="mt-6 text-center text-sm text-gray-600">
        Već imate račun?{' '}
        <button
          onClick={onSwitchToLogin}
          className="text-primary hover:underline font-medium"
          disabled={loading}
        >
          Prijavite se
        </button>
      </div>}
    </div>
  );
}
