import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useDianRut } from '../context/DianRutContext';
import { 
  LayoutDashboard, 
  UploadCloud, 
  FileSpreadsheet, 
  Database, 
  LogOut, 
  Shield, 
  Menu, 
  X,
  FileCheck2
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  isOpen: boolean;
  toggleOpen: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, isOpen, toggleOpen }) => {
  const { user, logout } = useAuth();
  const { activeJob } = useDianRut();

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard Global', icon: LayoutDashboard },
    { id: 'validate', name: 'Validar Lote NIT', icon: UploadCloud, badge: activeJob ? 'PROCESANDO' : undefined },
    { id: 'history', name: 'Historial de Lotes', icon: FileSpreadsheet },
    { id: 'supabase', name: 'Esquema Supabase', icon: Database },
  ];

  return (
    <>
      {/* Mobile Toggle Button */}
      <button 
        id="mobile-sidebar-toggle"
        onClick={toggleOpen}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-lg shadow-lg hover:bg-slate-800 transition-colors"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          onClick={toggleOpen}
          className="md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity"
        />
      )}

      {/* Main Sidebar Container */}
      <aside 
        id="main-sidebar"
        className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-slate-900 flex flex-col justify-between text-slate-300 z-40 transition-transform duration-300 md:transform-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Core Logo Column */}
        <div className="p-6 flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white text-sm shrink-0">
              R
            </div>
            <div>
              <h1 className="text-white font-bold tracking-tight text-sm leading-tight">RUT Validator</h1>
              <span className="text-[10px] text-green-400 font-mono font-bold tracking-wider block">DIAN ACTIVE</span>
            </div>
          </div>

          <div className="mt-4 p-2 bg-slate-950/50 rounded border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] text-slate-400 font-bold font-mono uppercase">CONEXIÓN DIAN</span>
            </div>
          </div>

          {/* Nav menu links */}
          <nav className="mt-6 flex-1 space-y-1 overflow-y-auto custom-scrollbar pr-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  id={`nav-link-${item.id}`}
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    if (isOpen) toggleOpen(); // close mobile sidebar on select
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors group ${
                    isActive 
                      ? 'bg-slate-800 text-white' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-4 w-4 shrink-0 transition-transform ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                    }`} />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-amber-500/20 text-amber-400 animate-pulse border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Authenticated User Profile Block */}
        <div className="p-4 border-t border-slate-850 bg-slate-950/40">
          <div className="flex items-center gap-3 mb-3.5">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 uppercase shrink-0">
              {user?.fullName?.split(' ').map(n=>n[0]).join('').slice(0, 2) || 'US'}
            </div>
            <div className="truncate text-xs">
              <p className="text-slate-200 font-bold uppercase truncate">{user?.fullName}</p>
              <p className="text-slate-500 font-mono text-[10px] truncate">{user?.email}</p>
            </div>
          </div>

          {/* Simple Clean Logout Action Button */}
          <button
            id="auth-logout"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[11px] font-bold text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/25 transition-all font-mono"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>CERRAR SESIÓN</span>
          </button>
        </div>
      </aside>
    </>
  );
};
