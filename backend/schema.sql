-- ====================================================================
-- SCRIPT DE BASE DE DATOS: SAAS RUT DIAN AUTOMATION GATEWAY
-- Motores Soportados: PostgreSQL 14+ / Supabase (Postgres)
-- ====================================================================

-- Habilitar extensión UUID para generación robusta de IDs únicos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- 1. TABLA: PROFILES (Perfiles de Operador Tributario)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    company_name TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar Row Level Security (RLS) en Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Profiles
CREATE POLICY "Select_Own_Profile" 
    ON public.profiles 
    FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Update_Own_Profile" 
    ON public.profiles 
    FOR UPDATE 
    USING (auth.uid() = id);


-- ====================================================================
-- 2. TABLA: VALIDATION_JOBS (Lotes de Consultas Masivas)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.validation_jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE SET NULL, -- Nullable para admitir cargas anónimas o procesos del sistema
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL, -- En bytes
    total_records INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER DEFAULT 0 NOT NULL,
    success_count INTEGER DEFAULT 0 NOT NULL,
    failed_count INTEGER DEFAULT 0 NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Habilitar Row Level Security (RLS) en Validation Jobs
ALTER TABLE public.validation_jobs ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Validation Jobs
CREATE POLICY "User_View_Own_Jobs" 
    ON public.validation_jobs 
    FOR SELECT 
    USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "User_Insert_Own_Jobs" 
    ON public.validation_jobs 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "User_Update_Own_Jobs" 
    ON public.validation_jobs 
    FOR UPDATE 
    USING (auth.uid() = user_id OR auth.uid() IS NULL);

CREATE POLICY "User_Delete_Own_Jobs" 
    ON public.validation_jobs 
    FOR DELETE 
    USING (auth.uid() = user_id);


-- ====================================================================
-- 3. TABLA: VALIDATION_RESULTS (Resultados Individuales por NIT)
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.validation_results (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID REFERENCES public.validation_jobs(id) ON DELETE CASCADE NOT NULL,
    nit TEXT NOT NULL,
    dv TEXT NOT NULL,
    company_name TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVO' CHECK (status IN ('ACTIVO', 'SUSPENDIDO', 'CANCELADO', 'ERROR')) NOT NULL,
    economic_activity TEXT,
    activity_name TEXT,
    address TEXT,
    dpto TEXT,
    last_validated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    check_code TEXT NOT NULL, -- Código identificador del sistema (ej: DIAN_MUISCA_LIVE, FALLBACK_ALGO)
    notes TEXT, -- Registro de logs de error o contingencia
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar Row Level Security (RLS) en Validation Results
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Validation Results
CREATE POLICY "User_View_Own_Results" 
    ON public.validation_results 
    FOR SELECT 
    USING (
        job_id IN (
            SELECT id FROM public.validation_jobs 
            WHERE user_id = auth.uid() OR user_id IS NULL
        )
    );

CREATE POLICY "System_Insert_Results" 
    ON public.validation_results 
    FOR INSERT 
    WITH CHECK (
        job_id IN (
            SELECT id FROM public.validation_jobs 
            WHERE user_id = auth.uid() OR auth.uid() IS NULL
        )
    );


-- ====================================================================
-- 4. ÍNDICES DE RENDIMIENTO (Performance Optimization)
-- ====================================================================

-- Indexar claves foráneas para optimización de queries con INNER JOIN / SELECT
CREATE INDEX IF NOT EXISTS idx_validation_results_job_id ON public.validation_results(job_id);
CREATE INDEX IF NOT EXISTS idx_validation_jobs_user_id ON public.validation_jobs(user_id);

-- Indexar consultas frecuentes por NIT para búsquedas rápidas corporativas
CREATE INDEX IF NOT EXISTS idx_validation_results_nit ON public.validation_results(nit);

-- Indexar estados de lotes para facilitar paneles analíticos del panel principal
CREATE INDEX IF NOT EXISTS idx_validation_jobs_status ON public.validation_jobs(status);


-- ====================================================================
-- 5. TRIGGERS: AUTOMATIZACIONES Y FECHAS DE ACTUALIZACIÓN
-- ====================================================================

-- Función para actualizar el campo updated_at de forma automática
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para automatizar cambios en Profiles
CREATE OR REPLACE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
