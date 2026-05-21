/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DianRutProvider } from './context/DianRutContext';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { ValidateView } from './components/ValidateView';
import { HistoryView } from './components/HistoryView';
import { SupabaseGuideView } from './components/SupabaseGuideView';
import { Cpu, Terminal, Shield } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-55 flex flex-col justify-center items-center font-mono">
        <div className="p-4 bg-white border border-slate-200/80 rounded-3xl shadow-xl flex flex-col items-center space-y-4 max-w-xs text-center">
          <Cpu className="h-10 w-10 text-sky-500 animate-spin" />
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">SaaS RUT Core</h3>
            <p className="text-[10px] text-slate-400">Verificando tokens y sesión de seguridad tributaria...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-50 font-sans flex flex-col md:flex-row relative">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        currentView={view} 
        setView={setView} 
        isOpen={sidebarOpen} 
        toggleOpen={() => setSidebarOpen(!sidebarOpen)} 
      />

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        
        {/* Top Header Panel */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-30">
          <div className="flex items-center gap-4 pl-12 md:pl-0">
            <h1 className="text-sm font-bold text-slate-800 tracking-tight uppercase font-mono">Consola de Validación RUT</h1>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase tracking-wider">Muisca DIAN On-line</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-bold text-slate-800 leading-none">{user.fullName}</span>
              <span className="text-[9px] text-slate-400 font-mono mt-1">Socio: <span className="font-semibold text-blue-600">{user.companyName || 'Persona Natural'}</span></span>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-150 border border-slate-200 flex items-center justify-center font-bold text-xs select-none shadow-inner text-slate-700 shrink-0">
              {user.fullName[0].toUpperCase()}
            </div>
          </div>
        </header>

        {/* Dynamic Viewport Container with custom scroll bar */}
        <main className="flex-1 p-5 md:p-6 overflow-y-auto custom-scrollbar bg-slate-50/50 space-y-5">
          {view === 'dashboard' && <DashboardView />}
          {view === 'validate' && <ValidateView />}
          {view === 'history' && <HistoryView />}
          {view === 'supabase' && <SupabaseGuideView />}
        </main>

        {/* Status Bar Footer */}
        <footer className="h-8 bg-white border-t border-slate-200 flex items-center justify-between px-6 shrink-0 text-slate-500 font-mono text-[9px] select-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="uppercase text-slate-500 font-bold">Latencia API: 42ms</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
              <span className="uppercase text-slate-500 font-bold">DB Sincronizada: En tiempo real</span>
            </div>
          </div>
          <div className="text-slate-400 uppercase font-bold text-[8px] tracking-wider hidden sm:block">
            v2.4.0-CO-stable | Región: South-Central-1 (Bogotá)
          </div>
        </footer>
      </div>

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DianRutProvider>
        <AppContent />
      </DianRutProvider>
    </AuthProvider>
  );
}

