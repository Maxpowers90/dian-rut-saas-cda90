import { createClient } from '@supabase/supabase-js';

// Read Supabase credentials from environment variables
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

// Check if actual Supabase is configured
export const isRealSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'YOUR_SUPABASE_URL');

// Standard supabase instance (will be configured if credentials exist)
export const supabase = isRealSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * High-fidelity Simulated Database Client for Sandbox Preview.
 * Mimics Supabase client structure so that migration requires exactly zero code changes.
 * Simply populate VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your secrets to switch.
 */
class SimulatedDatabase {
  private getStorage<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(`dian_rut_${key}`);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private setStorage<T>(key: string, value: T): void {
    localStorage.setItem(`dian_rut_${key}`, JSON.stringify(value));
  }

  // Auth Operations
  async signUp({ email, password, options }: any) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const users = this.getStorage<any[]>('users', []);
    
    if (users.some((u) => u.email === email)) {
      return { data: { user: null }, error: { message: 'El correo electrónico ya está registrado.' } };
    }

    const newUser = {
      id: Math.random().toString(36).substring(2, 11),
      email,
      fullName: options?.data?.full_name || 'Usuario DIAN',
      role: 'user',
      createdAt: new Date().toISOString(),
    };

    const sessions = this.getStorage<any[]>('sessions', []);
    users.push(newUser);
    sessions.push({ token: `session_${newUser.id}`, userId: newUser.id });
    
    this.setStorage('users', users);
    
    return {
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          user_metadata: { full_name: newUser.fullName },
        },
        session: { access_token: `session_${newUser.id}` }
      },
      error: null
    };
  }

  async signInWithPassword({ email, password }: any) {
    await new Promise((resolve) => setTimeout(resolve, 550));
    const users = this.getStorage<any[]>('users', []);
    
    // Default system user for out-of-the-box demo
    if (users.length === 0) {
      const demoUser = {
        id: 'user_demo_colombia',
        email: 'calabozodelandroide90@gmail.com',
        fullName: 'Administrador RUT DIAN',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      users.push(demoUser);
      this.setStorage('users', users);
    }

    const user = users.find((u) => u.email === email);
    if (!user) {
      return { data: { user: null, session: null }, error: { message: 'Credenciales inválidas. Por favor verifique e intente nuevamente.' } };
    }

    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: { full_name: user.fullName, role: user.role }
        },
        session: { access_token: `session_${user.id}`, expires_at: Date.now() + 3600000 }
      },
      error: null
    };
  }

  async signOut() {
    return { error: null };
  }

  async getSession() {
    return { data: { session: null }, error: null };
  }

  // Database operations
  from(tableName: string) {
    return {
      select: (query?: string) => {
        return {
          eq: (field: string, value: any) => {
            return {
              order: (orderField: string, { ascending }: { ascending: boolean }) => {
                const list = this.getStorage<any[]>(tableName, []);
                const filtered = list.filter(item => item[field] === value);
                const sorted = filtered.sort((a, b) => {
                  const valA = a[orderField];
                  const valB = b[orderField];
                  if (ascending) {
                    return valA > valB ? 1 : -1;
                  } else {
                    return valA < valB ? 1 : -1;
                  }
                });
                return Promise.resolve({ data: sorted, error: null });
              },
              then: (onfulfilled: any) => {
                const list = this.getStorage<any[]>(tableName, []);
                const filtered = list.filter(item => item[field] === value);
                return onfulfilled({ data: filtered, error: null });
              }
            };
          },
          order: (orderField: string, { ascending }: { ascending: boolean } = { ascending: false }) => {
            const list = this.getStorage<any[]>(tableName, []);
            const sorted = list.sort((a, b) => {
              const valA = a[orderField];
              const valB = b[orderField];
              if (ascending) {
                return valA > valB ? 1 : -1;
              } else {
                return valA < valB ? 1 : -1;
              }
            });
            return Promise.resolve({ data: sorted, error: null });
          },
          then: (onfulfilled: any) => {
            const list = this.getStorage<any[]>(tableName, []);
            return onfulfilled({ data: list, error: null });
          }
        };
      },
      insert: (records: any | any[]) => {
        const list = this.getStorage<any[]>(tableName, []);
        const toAdd = Array.isArray(records) ? records : [records];
        const added = toAdd.map(item => ({
          id: item.id || Math.random().toString(36).substring(2, 11),
          createdAt: new Date().toISOString(),
          ...item
        }));
        
        list.push(...added);
        this.setStorage(tableName, list);
        return Promise.resolve({ data: added, error: null });
      },
      update: (fields: any) => {
        return {
          eq: (key: string, val: any) => {
            const list = this.getStorage<any[]>(tableName, []);
            const updated = list.map(item => {
              if (item[key] === val) {
                return { ...item, ...fields, updated_at: new Date().toISOString() };
              }
              return item;
            });
            this.setStorage(tableName, updated);
            return Promise.resolve({ data: updated.filter(i => i[key] === val), error: null });
          }
        };
      },
      delete: () => {
        return {
          eq: (key: string, val: any) => {
            const list = this.getStorage<any[]>(tableName, []);
            const remaining = list.filter(item => item[key] !== val);
            this.setStorage(tableName, remaining);
            return Promise.resolve({ data: null, error: null });
          }
        };
      }
    };
  }
}

export const simulatedSupabase = new SimulatedDatabase();
