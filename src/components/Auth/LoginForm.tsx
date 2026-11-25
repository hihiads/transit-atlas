import { t } from '../../services/i18n';
import { useState, FormEvent } from 'react';
import { login, SignedInUser } from '../../services/auth';
import SocialAuthButtons from './SocialAuthButtons';
import { isNativeApp } from '../../services/platform';
import { useTurnstile } from './useTurnstile';

interface LoginFormProps {
  onSuccess: (user?: SignedInUser) => void | Promise<void>;
  onSwitchToRegister: () => void;
  onSwitchToForgotPassword: () => void;
  allowRegister: boolean;
}

export default function LoginForm({ onSuccess, onSwitchToRegister, onSwitchToForgotPassword, allowRegister }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstile = useTurnstile('login');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!turnstile.ready) return;
    setError(null);
    setLoading(true);

    try {
      await login(email, password, turnstile.token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Greška pri prijavi"));
    } finally {
      turnstile.reset();
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-center text-primary">{t("Prijava")}</h2>
      {isNativeApp() && <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm leading-5 text-slate-700">{t("Google prijava nije dostupna u ovoj aplikaciji. Ako ste se prije prijavljivali Googleom, odaberite „Zaboravili ste lozinku?” da postavite lozinku za isti email.")}</p>}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
          {error}
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">{t("Lozinka")}</label>
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

        <button
          type="button"
          onClick={onSwitchToForgotPassword}
          className="text-sm text-primary hover:underline"
          disabled={loading}
        >{t("Zaboravili ste lozinku?")}</button>

        {turnstile.challenge}

        <button
          type="submit"
          disabled={loading || !turnstile.ready}
          className="w-full bg-primary text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {loading ? t("Prijava...") : t("Prijavi se")}
        </button>
      </form>

      <SocialAuthButtons onSuccess={onSuccess} intent="login" />

      {allowRegister && <div className="mt-6 text-center text-sm text-gray-600">{t("Nemate račun?")}{' '}
        <button
          onClick={onSwitchToRegister}
          className="text-primary hover:underline font-medium"
          disabled={loading}
        >{t("Registrirajte se")}</button>
      </div>}
    </div>
  );
}
