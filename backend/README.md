# RUT DIAN Automation Engine - MVP Backend (FastAPI + Playwright)

Este es el componente back-end ligero (MVP) para la gestión del validador de RUT DIAN Colombia. Está construido con **FastAPI** para la API, **Playwright** en modo asíncrono para el rastreo y cálculo del Dígito de Verificación (DV), y **Supabase** para persistencia de datos inmediata.

No requiere de bases de datos complejas locales, motores Redis, ni trabajadores Celery distribuidos. Todo se orquesta de forma asíncrona mediante las tareas en segundo plano nativas de FastAPI (`BackgroundTasks`), haciéndolo sumamente confiable y de costo cero para arranques ágiles.

---

## 🚀 1. Estructura de Carpetas Creadas

```text
backend/
├── Dockerfile              # Dockerfile listo para Railway (Instala librerías y Chromium)
├── requirements.txt        # Dependencias de Python exigidas (Pandas, Playwright, Supabase, etc.)
├── main.py                 # Pila FastAPI con endpoint de carga, `/health` y progreso
├── scraper.py              # Motor Playwright Stealth con Algoritmo Matemático DV de la DIAN
├── supabase_client.py      # Operaciones mapeadas a Supabase (jobs y results)
└── README.md               # Este archivo de instrucciones de despliegue
```

---

## ⚙️ 2. Variables de Entorno Requeridas

Para operar, requiere tres (3) claves de acceso. Hágalas disponibles en su archivo `.env` local o en las variables "Variables / Secrets" de Railway:

```env
PORT=3000
SUPABASE_URL="https://tu-proyecto.supabase.co"
SUPABASE_KEY="tu-supabase-service-role-key"  # Preferible Service Role para evadir políticas RLS restrictivas al escribir
```

---

## 🛠️ 3. Ejecución y Pruebas Locales

Si desea correr el servidor de desarrollo en su máquina local:

1. **Crear entorno virtual** de Python y activarlo:
   ```bash
   python -m venv venv
   source venv/bin/activate  # En Windows use: venv\Scripts\activate
   ```

2. **Instalar dependencias**:
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Descargar navegador Chromium** de Playwright:
   ```bash
   playwright install chromium
   ```

4. **Lanzar servidor local**:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 3000 --reload
   ```

5. Acceda a la documentación interactiva (Swagger UI) en: **http://localhost:3000/docs**

---

## ☁️ 4. Guía de Despliegue Paso a Paso en Railway

[Railway](https://railway.app/) es la plataforma ideal para este MVP, ya que detecta y compila Dockerfiles con Playwright automáticamente sin configuraciones manuales complejas.

### Paso 1: Subir código a GitHub
1. Cree un repositorio en GitHub.
2. Añada la carpeta `backend/` a su repositorio. (Asegúrese de no incluir archivos pesados ni carpetas virtuales `venv/` usando `.gitignore`).

### Paso 2: Crear proyecto en Railway
1. Inicie sesión en [Railway.app](https://railway.app/).
2. Haga clic en **+ New Project** y seleccione **Deploy from GitHub repo**.
3. Otorgue permisos de lectura y elija su repositorio.

### Paso 3: Configurar el Directorio de Construcción (Root Directory)
Si su proyecto tiene el código del backend estructurado en una subcarpeta `/backend`, configure la variable de construcción en la pestaña **Settings** de Railway:
* **Root Directory**: `backend` (o déjelo vacío si crea un repositorio independiente para el backend).
* Railway leerá el `Dockerfile` inside `/backend` automáticamente.

### Paso 4: Añadir las Variables de Entorno (Secrets)
Vaya a la pestaña **Variables** en el servicio de Railway y presione **New Variable**:
1. `SUPABASE_URL` = *(Su URL de Supabase)*
2. `SUPABASE_KEY` = *(Su Service Role JWT)*
3. `PORT` = `3000`

### Paso 5: Despliegue
Railway iniciará la construcción de la imagen de Docker, instalará las librerías nativas de Linux para Linux Chromium de forma aislada, y desplegará su API. Una vez completado:
1. Railway le asignará un dominio público en vivo (por ejemplo, `https://tu-backend-produccion.up.railway.app`).
2. Puede comprobar el funcionamiento ingresando al endpoint `/health` de su servicio desplegado.

---

## 🛡️ 5. Esquema Postgres Requerido en Supabase

Asegúrese de haber ejecutado este script SQL en el **SQL Editor** de Supabase para que las escrituras del API no fallen:

```sql
-- Tabla Principal para Lotes (Jobs)
CREATE TABLE IF NOT EXISTS public.validation_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INT NOT NULL,
  total_records INT NOT NULL,
  processed_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status TEXT DEFAULT 'PROCESSING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Tabla para Resultados Individuales de RUT
CREATE TABLE IF NOT EXISTS public.validation_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.validation_jobs(id) ON DELETE CASCADE,
  nit TEXT,
  dv TEXT,
  company_name TEXT,
  status TEXT,
  economic_activity TEXT,
  activity_name TEXT,
  address TEXT,
  dpto TEXT,
  check_code TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```
