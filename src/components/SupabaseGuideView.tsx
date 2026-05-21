import React, { useState } from 'react';
import { isRealSupabaseConfigured } from '../lib/supabase';
import { 
  Database, 
  CheckCircle2, 
  Terminal, 
  Copy, 
  Check, 
  ShieldAlert, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';

export const SupabaseGuideView: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const sqlSchema = `-- 1. Habilitar extensiones de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Crear tabla de perfiles de usuario vinculada a Auth Supabase
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  company_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS (Row Level Security) para el Perfil
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver su propio perfil" 
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden modificar su propio perfil" 
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Crear tabla de lotes (Jobs) de validación de NITs
CREATE TABLE IF NOT EXISTS public.validation_jobs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  total_records INTEGER NOT NULL,
  processed_count INTEGER DEFAULT 0 NOT NULL,
  success_count INTEGER DEFAULT 0 NOT NULL,
  failed_count INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.validation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios ven sus propios lotes de validación" 
  ON public.validation_jobs FOR ALL USING (auth.uid() = user_id);

-- 4. Crear tabla de registros individuales de resultados de RUT DIAN
CREATE TABLE IF NOT EXISTS public.validation_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  job_id UUID REFERENCES public.validation_jobs ON DELETE CASCADE NOT NULL,
  nit TEXT NOT NULL,
  dv TEXT NOT NULL,
  company_name TEXT NOT NULL,
  status TEXT NOT NULL,
  economic_activity TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  address TEXT,
  dpto TEXT,
  last_validated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  check_code TEXT NOT NULL,
  notes TEXT
);

ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios ven resultados vinculados a sus propios lotes" 
  ON public.validation_results FOR ALL USING (
    job_id IN (SELECT id FROM public.validation_jobs WHERE user_id = auth.uid())
  );`;

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Title block */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Preparación para Supabase Backend</h2>
        <p className="text-sm text-slate-500">
          La base de datos actual opera localmente mediante un adaptador virtual listo para migrar. Siga estas instrucciones para sincronizar el SaaS con su base Postgres en Supabase Cloud de forma inmediata.
        </p>
      </div>

      {/* Grid: Indicators and Variables details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Indicator Card */}
        <div className="lg:col-span-4 bg-white p-6 border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-sky-500" />
              <h3 className="text-sm font-bold text-slate-900">Estado de la Integración</h3>
            </div>

            {isRealSupabaseConfigured ? (
              <div className="p-4 bg-emerald-50 border border-emerald-250 rounded-xl space-y-2 text-xs text-emerald-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <strong className="font-bold uppercase font-mono">LIVE MODE: ACTIVADO</strong>
                </div>
                <p>
                  SaaS sincronizado con su cuenta en Supabase Cloud. Los lotes, credenciales de usuarios, perfiles y registros se leen y persisten de manera encriptada en la base Postgres.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-205 rounded-xl space-y-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                  <strong className="font-bold uppercase font-mono text-slate-700">MODO SANDBOX: ACTIVO</strong>
                </div>
                <p className="leading-relaxed">
                  Ejecutando la lógica de negocio simulada de manera local (almacenamiento en caché HTML5 local). 
                </p>
                <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-amber-600 flex items-start gap-2">
                  <ShieldAlert className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <span>Sin dependencias de red. Listo para conectar añadiendo las credenciales.</span>
                </div>
              </div>
            )}

            {/* Steps config description */}
            <div className="space-y-3.5 pt-2">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase font-mono tracking-wider">Instrucciones de Despliegue</h4>
              
              <ul className="space-y-3 text-xs text-slate-600">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">1</span>
                  <span>Cree un proyecto nuevo en la <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-sky-500 underline font-semibold inline-flex items-center gap-0.5">consola de Supabase <ExternalLink className="h-3 w-3 inline" /></a></span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">2</span>
                  <span>Abra la pestaña <strong>SQL Editor</strong> en Supabase, pegue el script de la derecha y ejecútalo.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[10px] shrink-0 font-mono">3</span>
                  <span>Copie la <strong>Project URL</strong> y el <strong>Anon Public Key</strong> en las Preferencias / Secrets de este Workspace en AI Studio.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <span className="text-[10px] text-slate-400 font-mono block">CLIENT ADAPTER:</span>
            <span className="text-xs text-slate-600 font-mono block font-semibold">src/lib/supabase.ts</span>
          </div>
        </div>

        {/* Right Schema SQL Editor Block */}
        <div className="lg:col-span-8 bg-sky-950 p-5 rounded-2xl shadow-lg border border-sky-905 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-sky-900">
            <div className="flex items-center gap-2">
              <Terminal className="h-4.5 w-4.5 text-sky-450" />
              <span className="text-white font-bold font-mono text-xs">Estructura SQL de Tablas (Data Schema)</span>
            </div>
            <button
              id="copy-sql-schema"
              onClick={() => handleCopy(sqlSchema, 1)}
              className="flex items-center gap-1 bg-sky-900/40 border border-sky-800 hover:bg-sky-900 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] text-sky-300 font-mono tracking-wide font-semibold transition-colors"
            >
              {copiedIndex === 1 ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>COPIADO</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>COPIAR SCRIPT SQL</span>
                </>
              )}
            </button>
          </div>

          <div className="p-3 bg-slate-950/90 rounded-xl overflow-hidden">
            <pre className="text-[11px] text-slate-300 max-h-[350px] overflow-y-auto custom-scrollbar font-mono leading-relaxed select-all">
              {sqlSchema}
            </pre>
          </div>

          <div className="p-3 bg-sky-900/10 border border-sky-800/40 rounded-xl text-xs text-sky-200">
            <div className="flex items-start gap-2.5">
              <Info className="h-4.5 w-4.5 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold leading-normal">Generación Automática de UUID e Índices Relacionales</p>
                <p className="text-[11px] text-sky-300/80 mt-1 leading-relaxed">
                  El esquema SQL integra Row Level Security (RLS) para proteger los identificadores. De este modo, los NITs cargados por un cliente solo puedan ser vistos y descargados exclusivamente por su propio usuario, cumpliendo con la Ley de Protección de Datos de Colombia (Habeas Data).
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
