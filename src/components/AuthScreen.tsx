import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileCheck2, ShieldAlert, BadgeInfo, KeyRound, Mail, Sparkles } from 'lucide-react';

export const AuthScreen = () => {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('calabozodelandroide90@gmail.com');
  const [password, setPassword] = useState('dian_secure_2026');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick helper to auto-fill credentials for instantaneous testing
  const handleDemoFill = () => {
    setEmail('calabozodelandroide90@gmail.com');
    setPassword('dian_secure_2026');
    setIsLogin(true);
    setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor complete todos los campos obligatorios.');
      return;
    }

    if (!isLogin && !fullName) {
      setErrorMsg('Por favor ingrese su nombre de usuario/razón social.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      if (isLogin) {
        const result = await login(email, password);
        if (result && result.error) {
          setErrorMsg(result.error);
        }
      } else {
        const result = await register(email, password, fullName, companyName);
        if (result && result.error) {
          setErrorMsg(result.error);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      
      {/* Container Card */}
      <div className="w-full max-w-md bg-white border border-slate-200 shadow-xl rounded-3xl overflow-hidden p-6 md:p-8 space-y-6 animate-fade-in">
        
        {/* Core Header logo */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <div className="p-3 bg-sky-500/10 border border-sky-450/25 rounded-2xl text-sky-500">
            <FileCheck2 className="h-8 w-8 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">RUT DIAN SaaS Core</h1>
            <p className="text-xs text-slate-500 font-mono tracking-wider">PORTAL DE GESTIÓN TRIBUTARIA EXCEL</p>
          </div>
        </div>

        {/* Demo Fill Alert Button */}
        <div className="bg-sky-50 p-4 border border-sky-100 rounded-2xl space-y-2.5">
          <div className="flex items-center gap-2 text-sky-700 font-bold text-xs font-mono">
            <Sparkles className="h-4.5 w-4.5" />
            <span>MODO TESTING / MOCK ACCESO</span>
          </div>
          <p className="text-xs text-slate-550 leading-relaxed">
            Haga clic abajo para auto-rellenar las credenciales de simulación del operador colombiano e ingresar inmediatamente.
          </p>
          <button
            id="auth-fill-demo"
            type="button"
            onClick={handleDemoFill}
            className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold font-mono transition-colors"
          >
            AUTO-RELLENAR CREDENCIALES DEMO
          </button>
        </div>

        {/* Auth selector tabs */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            id="tab-select-login"
            type="button"
            onClick={() => { setIsLogin(true); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold font-mono rounded-lg transition-all ${
              isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            INICIAR SESIÓN
          </button>
          <button
            id="tab-select-register"
            type="button"
            onClick={() => { setIsLogin(false); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold font-mono rounded-lg transition-all ${
              !isLogin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            REGISTRARSE
          </button>
        </div>

        {/* Form Body block */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {!isLogin && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-slate-650 font-mono uppercase mb-1">Nombre Completo *</label>
                <input
                  id="auth-fullname"
                  type="text"
                  placeholder="Ej. Juan Carlos Gomez"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4.5 py-3 bg-slate-50 border border-slate-250 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-650 font-mono uppercase mb-1">Compañía / Organización</label>
                <input
                  id="auth-org"
                  type="text"
                  placeholder="Ej. Comercializadora Colombia Ltda"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4.5 py-3 bg-slate-50 border border-slate-250 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[10px] font-bold text-slate-650 font-mono uppercase mb-1">Correo Electrónico *</label>
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-slate-400">
                <Mail className="h-4 w-4" />
              </span>
              <input
                id="auth-email"
                type="email"
                placeholder="ejemplo@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-255 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-650 font-mono uppercase mb-1">Contraseña *</label>
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-slate-400">
                <KeyRound className="h-4 w-4" />
              </span>
              <input
                id="auth-password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-255 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:bg-white"
                required
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 flex items-center gap-2">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            id="auth-submit"
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-400 text-xs font-bold text-white rounded-xl font-mono transition-colors shadow-lg hover:shadow-slate-900/10"
          >
            {isSubmitting ? 'PROCESANDO SOLICITUD...' : (isLogin ? 'INICIAR SESIÓN' : 'DE ALTA CREAR CUENTA')}
          </button>
        </form>

        <div className="flex items-start gap-2 text-[10px] text-slate-400">
          <BadgeInfo className="h-4.5 w-4.5 shrink-0 text-slate-400" />
          <p className="leading-normal">
            Al registrarse o ingresar acepta las condiciones de uso de la central RUT DIAN Colombia, garantizando el correcto tratamiento de la información bajo la Ley Habeas Data.
          </p>
        </div>

      </div>

    </div>
  );
};
