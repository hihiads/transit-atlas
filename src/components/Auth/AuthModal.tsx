import { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import { AuthResponse, resetPassword, SignedInUser, verifyEmail } from '../../services/auth';
import { useAuth } from '../../contexts/AuthContext';

interface AuthModalProps {
  onClose: () => void;
  loginEnabled: boolean;
  registrationEnabled: boolean;
}

type View = 'login' | 'register' | 'forgot-password' | 'verify-email' | 'reset-password' | 'parent-consent';

export default function AuthModal({ onClose, loginEnabled, registrationEnabled }: AuthModalProps) {
  const [view, setView] = useState<View>(() => window.location.pathname === '/verify-email' ? 'verify-email' : window.location.pathname === '/reset-password' ? 'reset-password' : !loginEnabled && registrationEnabled ? 'register' : 'login');
  const [verificationToken, setVerificationToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [verificationMessage, setVerificationMessage] = useState('Potvrdite email adresu za dovršetak registracije.');
  const [parentMessage, setParentMessage] = useState('Provjerite email roditelja ili skrbnika kako bi potvrdio suglasnost.');
  const { login } = useAuth();

  async function handleSuccess(user?: SignedInUser) {
    await login(user);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
      <div role="dialog" aria-modal="true" aria-label="Prijava ili registracija u Transitly" onKeyDown={event => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'Tab') {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])'));
          const first = controls[0]; const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }} className="relative w-full max-w-md max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          autoFocus
          aria-label="Zatvori prozor za prijavu"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 text-gray-600 hover:text-gray-600 transition-colors bg-white rounded-full p-2"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {view === 'login' && (
          <LoginForm
            onSuccess={handleSuccess}
            allowRegister={registrationEnabled}
            onSwitchToRegister={() => setView('register')}
            onSwitchToForgotPassword={() => setView('forgot-password')}
          />
        )}

        {view === 'register' && (
          <RegisterForm
            onSuccess={(response: AuthResponse) => {
              if (response.parentConsentRequired) {
                setParentMessage(response.message);
                if (response.parentConsentToken) setVerificationToken(response.parentConsentToken);
                setView('parent-consent');
              } else if (response.verificationToken) {
                setVerificationToken(response.verificationToken);
                setView('verify-email');
              }
            }}
            onSocialSuccess={handleSuccess}
            allowLogin={loginEnabled}
            onSwitchToLogin={() => setView('login')}
          />
        )}

        {view === 'verify-email' && (
          <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4 text-center text-primary">Potvrda emaila</h2>
            <p className="mb-4 text-sm text-gray-700">{verificationMessage}</p>
            <button className="w-full bg-primary text-white py-2 px-4 rounded-lg" onClick={async () => {
              try {
                await verifyEmail(verificationToken);
                setVerificationMessage('Email je potvrđen. Sada se možete prijaviti.');
                window.history.replaceState({}, '', '/');
                setView(loginEnabled ? 'login' : 'register');
              } catch (error) {
                setVerificationMessage(error instanceof Error ? error.message : 'Potvrda nije uspjela.');
              }
            }}>Potvrdi email</button>
          </div>
        )}

        {view === 'parent-consent' && <div className="w-full max-w-md mx-auto space-y-4 rounded-lg bg-white p-6 shadow-lg">
          <h2 className="text-2xl font-bold text-center text-primary">Čeka se roditeljska suglasnost</h2>
          <p className="text-sm leading-6 text-gray-800">{parentMessage}</p>
          {verificationToken && <a className="block break-all rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-900 underline" href={`/confirm-parent?token=${encodeURIComponent(verificationToken)}`}>Otvori lokalnu poveznicu za potvrdu</a>}
          <button type="button" onClick={onClose} className="w-full rounded-lg border border-slate-400 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-100">Zatvori</button>
        </div>}

        {view === 'reset-password' && (
          <ResetPasswordForm token={verificationToken} onDone={() => setView('login')} />
        )}

        {view === 'forgot-password' && (
          <ForgotPasswordForm
            onSuccess={() => setView('login')}
            onBack={() => setView('login')}
          />
        )}
      </div>
    </div>
  );
}

function ResetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  return <form className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg space-y-4" onSubmit={async (event) => {
    event.preventDefault();
    try {
      const result = await resetPassword(token, password);
      setMessage(result.message);
      window.history.replaceState({}, '', '/');
      setTimeout(onDone, 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Promjena lozinke nije uspjela.');
    }
  }}>
    <h2 className="text-2xl font-bold text-center text-primary">Nova lozinka</h2>
    <label className="block text-sm font-medium text-gray-700">Lozinka
      <input className="mt-1 w-full px-3 py-2 border rounded-lg" type="password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
    </label>
    {message && <p className="text-sm text-gray-700" role="status">{message}</p>}
    <button className="w-full bg-primary text-white py-2 px-4 rounded-lg">Spremi novu lozinku</button>
  </form>;
}
