import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { supabase, simulatedSupabase, isRealSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isRealDb: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  register: (email: string, password: string, fullName: string, companyName?: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        if (isRealSupabaseConfigured && supabase) {
          // Check actual Supabase session
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              fullName: session.user.user_metadata?.full_name || 'Desarrollador',
              role: session.user.user_metadata?.role || 'user',
              companyName: session.user.user_metadata?.company_name || 'DIAN Partner',
              createdAt: session.user.created_at,
            });
          }
        } else {
          // Load from LocalStorage for mock
          const cachedSession = localStorage.getItem('dian_rut_session');
          if (cachedSession) {
            const users = JSON.parse(localStorage.getItem('dian_rut_users') || '[]');
            const activeUser = users.find((u: any) => u.id === cachedSession);
            if (activeUser) {
              setUser(activeUser);
            } else {
              // Create default demo user to prevent login lock
              const defaultUser: User = {
                id: 'user_demo_colombia',
                email: 'calabozodelandroide90@gmail.com',
                fullName: 'Administrador RUT DIAN',
                companyName: 'DIAN Partner SAS',
                role: 'admin',
                createdAt: new Date().toISOString(),
              };
              localStorage.setItem('dian_rut_users', JSON.stringify([defaultUser]));
              localStorage.setItem('dian_rut_session', defaultUser.id);
              setUser(defaultUser);
            }
          }
        }
      } catch (err) {
        console.error('Error loading auth state:', err);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      if (isRealSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        if (data.user) {
          const loadedUser: User = {
            id: data.user.id,
            email: data.user.email || '',
            fullName: data.user.user_metadata?.full_name || 'Usuario DIAN',
            companyName: data.user.user_metadata?.company_name || '',
            role: data.user.user_metadata?.role || 'user',
            createdAt: data.user.created_at,
          };
          setUser(loadedUser);
          return { error: null };
        }
      } else {
        const { data, error } = await simulatedSupabase.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        if (data.user) {
          const loggedUser: User = {
            id: data.user.id,
            email: data.user.email || '',
            fullName: data.user.user_metadata?.full_name || 'Administrador RUT DIAN',
            companyName: 'DIAN Partner SAS',
            role: 'admin',
            createdAt: new Date().toISOString()
          };
          setUser(loggedUser);
          localStorage.setItem('dian_rut_session', loggedUser.id);
          return { error: null };
        }
      }
      return { error: 'Ha ocurrido un error inesperado al iniciar sesión.' };
    } catch (err: any) {
      return { error: err.message || 'Error de red' };
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, fullName: string, companyName?: string) => {
    setLoading(true);
    try {
      if (isRealSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              company_name: companyName || '',
              role: 'user',
            },
          },
        });
        if (error) return { error: error.message };
        if (data.user) {
          return { error: null };
        }
      } else {
        const { data, error } = await simulatedSupabase.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              company_name: companyName || '',
            },
          },
        });
        if (error) return { error: error.message };
        if (data.user) {
          // Immediately log them in
          const newUser: User = {
            id: data.user.id,
            email: data.user.email,
            fullName,
            companyName: companyName || 'Independiente',
            role: 'user',
            createdAt: new Date().toISOString(),
          };
          setUser(newUser);
          localStorage.setItem('dian_rut_session', newUser.id);
          return { error: null };
        }
      }
      return { error: 'Error agregando nuevo registro.' };
    } catch (err: any) {
      return { error: err.message || 'Error de registro' };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      if (isRealSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      } else {
        await simulatedSupabase.signOut();
        localStorage.removeItem('dian_rut_session');
      }
      setUser(null);
    } catch (err) {
      console.error('Error logging out:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isRealDb: isRealSupabaseConfigured, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
