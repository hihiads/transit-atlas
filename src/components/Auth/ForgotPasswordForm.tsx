import { t } from '../../services/i18n';
import { useState, FormEvent } from 'react';
import { forgotPassword } from '../../services/auth';
import { useTurnstile } from './useTurnstile';

interface ForgotPasswordFormProps {
  onSuccess: () => void;
  onBack: () => void;
}

export default function ForgotPasswordForm({ onSuccess, onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const turnstile = useTurnstile('forgot_password');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!turnstile.ready) {
      setError(t("Molimo pričekajte Turnstile provjeru"));
      return;
    }

    setLoading(true);

    try {
      const response = await forgotPassword(email, turnstile.token);
      setSuccess(response.message);

      setTimeout(() => {
        onSuccess();
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Greška pri zahtjevu"));
    } finally {
      turnstile.reset();
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-center text-primary">{t("Resetiranje lozinke")}</h2>

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
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">{t("Email adresa")}</label>
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
          <p className="mt-1 text-xs text-gray-500">{t("Poslat će vam se email s uputama za resetiranje lozinke.")}</p>
        </div>

        {turnstile.challenge}

        <button
          type="submit"
          disabled={loading || !turnstile.ready}
          className="w-full bg-primary text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {loading ? t("Slanje...") : t("Pošalji upute")}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={onBack}
          className="text-sm text-primary hover:underline"
          disabled={loading}
        >{t("← Natrag na prijavu")}</button>
      </div>
    </div>
  );
}
