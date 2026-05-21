# RUT DIAN Validator — Backend

Motor de validación masiva de NITs colombianos usando FastAPI + Playwright (Chromium headless) + Supabase.

---

## Estructura

```
backend/
├── main.py              # API FastAPI con endpoints de carga y progreso
├── scraper.py           # Scraper Playwright del portal Muisca DIAN
├── supabase_client.py   # Cliente Supabase para persistencia
├── schema.sql           # Script SQL para crear tablas en Supabase
├── requirements.txt     # Dependencias Python
├── Dockerfile           # Imagen Docker lista para Railway
├── railway.json         # Configuración de deploy en Railway
└── .gitignore
```

---

## Variables de entorno requeridas

Crear en Railway → Variables (o en `.env` local):

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...  # Service Role Key (no la anon key)
```

---

## Pasos para subir a GitHub y deployar en Railway

### 1. Preparar Supabase

1. Ir a [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**
2. Ejecutar el contenido de `schema.sql` completo
3. Ir a **Settings → API** y copiar:
   - `Project URL` → es tu `SUPABASE_URL`
   - `service_role` key → es tu `SUPABASE_KEY` ⚠️ Nunca la `anon` key para el backend

### 2. Subir a GitHub

```bash
# Desde la carpeta backend/
git init
git add .
git commit -m "feat: backend RUT DIAN validator con Playwright"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

> ⚠️ Verificar que `.env` esté en `.gitignore` antes del push

### 3. Crear proyecto en Railway

1. Ir a [railway.app](https://railway.app) → **New Project**
2. Seleccionar **Deploy from GitHub repo**
3. Elegir el repositorio recién creado
4. En **Settings → Source**:
   - **Root Directory**: `backend` (si el repo tiene frontend y backend)
   - Railway detectará el `Dockerfile` automáticamente
5. En **Variables**, agregar:
   - `SUPABASE_URL` = tu URL de Supabase
   - `SUPABASE_KEY` = tu Service Role Key
6. Hacer clic en **Deploy**

### 4. Verificar el deploy

Una vez Railway asigne un dominio (ej: `https://tu-app.up.railway.app`):

```bash
# Test de salud
curl https://tu-app.up.railway.app/health

# Respuesta esperada:
# {"status":"online","database":"connected","framework":"FastAPI + Playwright"}
```

También disponible la documentación interactiva en:
```
https://tu-app.up.railway.app/docs
```

---

## Prueba de carga masiva

1. Crear un archivo `nits.xlsx` con una columna `NIT` y algunos NITs colombianos
2. Hacer POST al endpoint:

```bash
curl -X POST https://tu-app.up.railway.app/api/upload \
  -F "file=@nits.xlsx"
```

3. Seguir el progreso con el `job_id` retornado:

```bash
curl https://tu-app.up.railway.app/api/jobs/{job_id}/progress
```

---

## Notas importantes

- El portal Muisca de la DIAN puede responder lento (15-30s por consulta)
- Se aplica un delay de 2-4s entre consultas para no saturar el portal
- Si la DIAN muestra captcha, el resultado tendrá `check_code: SCRAPER_FAIL`
- Usar la **Service Role Key** de Supabase (no la anon key) para que el backend pueda escribir en las tablas con RLS activo
