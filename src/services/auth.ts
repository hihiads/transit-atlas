const API_BASE = import.meta.env.VITE_API_URL || '';

export interface OAuthProviders {
  google: boolean;
  googleClientId: string | null;
}

export interface OAuthChallenge {
  nonce: string;
  state: string;
  expires: number;
}

export async function getOAuthProviders(): Promise<OAuthProviders> {
  const response = await fetch(`${API_BASE}/api/auth/providers`, { credentials: 'include' });
  return handleResponse<OAuthProviders>(response);
}

export interface RegistrationConsent {
  termsAccepted: boolean;
  ageRange: '10-15' | '16+' | '';
  guardianEmail: string;
}

export async function createOAuthChallenge(provider: 'google', intent: 'login' | 'register' = 'login'): Promise<OAuthChallenge> {
  const response = await fetch(`${API_BASE}/api/auth/oauth/challenge`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ provider, intent })
  });
  return handleResponse<OAuthChallenge>(response);
}

export async function finishOAuth(provider: 'google', idToken: string, intent: 'login' | 'register', consent?: RegistrationConsent): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/oauth/${provider}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ idToken, intent, ...(intent === 'register' ? consent : {}) })
  });
  return handleResponse<AuthResponse>(response);
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  message: string;
  user?: SignedInUser;
  verificationToken?: string;
  resetToken?: string;
  parentConsentRequired?: boolean;
  parentConsentToken?: string;
}

export type SignedInUser = Pick<AuthUser, 'id' | 'email' | 'emailVerified'>;

export interface AuthError {
  error: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as (AuthError & T) | null;
  if (!response.ok) {
    throw new Error(data?.error || `Zahtjev nije uspio (${response.status}).`);
  }
  if (!data) throw new Error('Server je poslao neispravan odgovor. Pokušajte ponovno.');
  return data;
}

export async function register(email: string, password: string, turnstileToken: string, consent: RegistrationConsent): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, turnstileToken, ...consent })
  });
  return handleResponse<AuthResponse>(response);
}

export async function confirmParentConsent(token: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/parent-consent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ token, consent: true })
  });
  return handleResponse<AuthResponse>(response);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email.trim(), password }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('Server ne odgovara. Pokušajte ponovno za trenutak.');
    }
    throw new Error('Ne mogu se povezati sa serverom. Provjerite vezu pa pokušajte ponovno.');
  }
  return handleResponse<AuthResponse>(response);
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
  await handleResponse<{ message: string }>(response);
}

export async function deleteCurrentAccount(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/me`, { method: 'DELETE', credentials: 'include' });
  await handleResponse<{ message: string }>(response);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include'
    });
    if (response.status === 401) return null;
    const data = await handleResponse<{ user: AuthUser }>(response);
    return data.user;
  } catch {
    return null;
  }
}

export async function verifyEmail(token: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, password })
  });
  return handleResponse<AuthResponse>(response);
}

export async function forgotPassword(email: string, turnstileToken: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, turnstileToken })
  });
  return handleResponse<AuthResponse>(response);
}

export async function resetPassword(token: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, password })
  });
  return handleResponse<AuthResponse>(response);
}
