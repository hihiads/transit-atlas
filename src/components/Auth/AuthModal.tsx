import { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import ForgotPasswordForm from './ForgotPasswordForm';
import { verifyEmail } from '../../services/auth';
import { resetPassword } from '../../services/auth';
import { useAuth } from '../../contexts/AuthContext';

interface AuthModalProps {
  onClose: () => void;
  loginEnabled: boolean;
  registrationEnabled: boolean;
}

type View = 'login' | 'register' | 'forgot-password' | 'verify-email' | 'reset-password';

export default function AuthModal({ onClose, loginEnabled, registrationEnabled }: AuthModalProps) {
  const [view, setView] = useState<View>(() => window.location.pathname === '/verify-email' ? 'verify-email' : window.location.pathname === '/reset-password' ? 'reset-password' : !loginEnabled && registrationEnabled ? 'register' : 'login');
  const [verificationToken, setVerificationToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [verificationMessage, setVerificationMessage] = useState('Potvrdite email adresu za dovršetak registracije.');
  const { login } = useAuth();

  async function handleSuccess() {
    await login();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 text-gray-400 hover:text-gray-600 transition-colors bg-white rounded-full p-2"
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
            onSuccess={(token) => {
              if (token) {
                setVerificationToken(token);
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
