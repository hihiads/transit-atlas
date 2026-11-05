const API_BASE = import.meta.env.VITE_API_URL || '';

export interface OAuthProviders {
  google: boolean;
  apple: boolean;
  googleClientId: string | null;
  appleClientId: string | null;
  appleRedirectUri: string | null;
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

export async function createOAuthChallenge(provider: 'google' | 'apple'): Promise<OAuthChallenge> {
  const response = await fetch(`${API_BASE}/api/auth/oauth/challenge`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ provider })
  });
  return handleResponse<OAuthChallenge>(response);
}

export async function finishOAuth(provider: 'google' | 'apple', idToken: string, state?: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/oauth/${provider}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ idToken, state })
  });
  return handleResponse<AuthResponse>(response);
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface AuthResponse {
  message: string;
  user?: AuthUser;
  verificationToken?: string;
  resetToken?: string;
}

export interface AuthError {
  error: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json() as AuthError;
    throw new Error(error.error || 'Greška pri zahtjevu');
  }
  return response.json();
}

export async function register(email: string, password: string, turnstileToken: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, turnstileToken })
  });
  return handleResponse<AuthResponse>(response);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password })
  });
  return handleResponse<AuthResponse>(response);
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
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

export async function verifyEmail(token: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token })
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
