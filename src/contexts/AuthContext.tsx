import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { deleteCurrentAccount as deleteAccountService, getCurrentUser, logout as logoutService, SignedInUser } from '../services/auth';
import { readStoredStringList } from '../services/localPreferences';
import { cancelDepartureReminders } from '../services/localDepartureNotifications';

interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (user?: SignedInUser) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    }
  }

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  async function login(signedInUser?: SignedInUser) {
    if (signedInUser) setUser(signedInUser);
    else await refreshUser();
  }

  async function logout() {
    await logoutService();
    if (user) {
      await Promise.all(readStoredStringList(`transit-atlas-tracked:${user.id}`).map(key => cancelDepartureReminders(key).catch(() => {})));
    }
    setUser(null);
  }

  async function deleteAccount(password: string) {
    if (!user) return;
    await deleteAccountService(password);
    const tracked = readStoredStringList(`transit-atlas-tracked:${user.id}`);
    await Promise.all(tracked.map(key => cancelDepartureReminders(key).catch(() => {})));
    for (const key of ['tracked', 'favorite-routes', 'favorite-stops']) localStorage.removeItem(`transit-atlas-${key}:${user.id}`);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, deleteAccount, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
