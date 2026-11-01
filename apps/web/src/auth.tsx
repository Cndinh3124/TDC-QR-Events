// Trang thai dang nhap toan app: khoi phuc phien tu cookie refresh khi tai trang.
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import * as api from './api';

interface AuthState {
  user: api.User | null;
  loading: boolean;
  setUser: (u: api.User | null) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // trang diem danh cong khai khong dung phien quan tri: khong goi /refresh (sinh vien khong co cookie)
    if (window.location.pathname.startsWith('/diem-danh/')) {
      setLoading(false);
      return;
    }
    api.setSessionLostHandler(() => setUser(null));
    api.restoreSession().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    await api.logout();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, setUser, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth ngoai AuthProvider');
  return v;
}
