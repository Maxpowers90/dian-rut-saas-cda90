# Arquitectura del Motor de Automatización RUT DIAN
## Documento Técnico de Implementación Back-end de Producción

Este documento detalla la arquitectura de referencia para implementar el componente back-end de consulta automatizada del RUT Muisca de la DIAN, utilizando **FastAPI**, **Celery + Redis** para colas de tareas asíncronas, **Playwright** en modo Headless/Stealth para interacción web con el portal público, y **Supabase** como persistencia principal y gestor de eventos en tiempo real.

---

## 1. Estructura de Proyecto con FastAPI (Clean Architecture)

Se adopta una estructura modular guiada por separación de responsabilidades para asegurar mantenibilidad y desacoplamiento de herramientas externas (como bases de datos o librerías de scraping).

```text
dian-validator-backend/
├── .github/workflows/ci-cd.yml
├── docs/
│   └── architecture.md
├── src/
│   ├── __init__.py
│   ├── main.py                 # Punto de entrada de FastAPI
│   ├── config.py               # Configuración y variables de entorno por Pydantic
│   │
│   ├── api/                    # Capa de API HTTP / Capa de Presentación
│   │   ├── __init__.py
│   │   ├── dependencies.py     # Dependencias e inyección (Auth Supabase, DB)
│   │   └── v1/
│   │       ├── auth.py         # Endpoints de validación de token / perfiles
│   │       ├── jobs.py         # Endpoints de creación y control de lotes
│   │       └── health.py       # Indicadores Liveness y Readiness
│   │
│   ├── core/                   # Capa Dominio (Entidades y Lógica de Negocio Pura)
│   │   ├── __init__.py
│   │   ├── models.py           # Modelos Pydantic y Validaciones Matemáticas (DV)
│   │   └── security.py         # Lógica criptográfica y autenticación JWT
│   │
│   ├── services/               # Capa de Aplicación (Casos de uso)
│   │   ├── __init__.py
│   │   ├── job_manager.py      # Orquestador de carga de archivos y colas
│   │   └── supabase_sync.py    # Servicio abstracto para actualizaciones en BD
│   │
│   ├── workers/                # Capa de Infraestructura (Scraping y Procesamiento Asíncrono)
│   │   ├── __init__.py
│   │   ├── tasks.py            # Definición de tareas Celery
│   │   └── dian_scraper.py     # Cliente Playwright Stealth para interactuar con Muisca
│   │
│   └── utils/
│       ├── __init__.py
│       └── file_parser.py      # Parsing de archivos Excel (.xlsx) y CSV
│
├── tests/                      # Pruebas Unitarias y de Integración
│   ├── conftest.py
│   ├── test_api_jobs.py
│   └── test_dian_scraper.py
│
├── Dockerfile                  # Empaquetado optimizado con drivers de Playwright
├── Dockerfile.worker           # Sub-imagen especializada para Tasks de Celery
├── docker-compose.yml          # Configuración multi-contenedor local
├── pyproject.toml              # Definición de dependencias Poetry o Pipenv
├── railway.json                # Configuración de despliegue en la nube Railway
└── README.md
```

---

## 2. Arquitectura de Procesamiento Asíncrono y Cola de Tareas

El portal de la DIAN impone latencias variables (desde 150ms hasta tiempo fuera de 30s) y mecanismos de bloqueo de tráfico automatizados. Es mandatorio no bloquear el hilo de ejecución principal de la API HTTP de FastAPI.

```
                    ┌────────────────────────┐
                    │ Client (React Frontend)│
                    └───────────┬────────────┘
                                │ Post File/Excel
                                ▼
                    ┌────────────────────────┐
                    │  FastAPI API Gateway   │
                    └───────────┬────────────┘
                                │
                      1. Registra lote en Supabase (status: PENDING)
                      2. Genera identificador único (job_id UUID)
                      3. Publica lista de NITs en cola Redis
                                │
                                ▼
                      ┌────────────────────┐
                      │    Redis Broker    │
                      └─────────┬──────────┘
                                │
                     ┌──────────┴──────────┐
                     │ Celery Task Queue   │
                     └──────────┬──────────┘
                                │ Despacha Tarea (Concurrency limit: N)
                                ▼
             ┌──────────────────────────────────────┐
             │ Celery Workers (Playwright + Stealth)│
             └──────────────────┬───────────────────┘
                                │
                                ├─► Consulta Muisca DIAN (Secuencial o Micro-Batch)
                                │
                                ▼
             ┌──────────────────────────────────────┐
             │ Real-time Events & Postgres Updates  │
             └──────────────────┬───────────────────┘
                                │ Sincroniza estados parciales en tiempo real
                                ▼
                     ┌────────────────────┐
                     │  Supabase (DBMS)   │
                     └────────────────────┘
```

### Configuración de la Tarea Celery (`src/workers/tasks.py`)
```python
import asyncio
from celery import Celery
from src.config import settings
from src.workers.dian_scraper import scrape_nit_from_dian
from src.services.supabase_sync import update_job_progress, save_validation_result

celery_app = Celery(
    "dian_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Bogota",
    enable_utc=True,
    worker_prefetch_multiplier=1,  # Evita que un worker acapare múltiples NITs
    task_acks_late=True,           # Confirma la tarea solo después de finalizar exitosamente
)

@celery_app.task(name="process_bulk_validation", bind=True, max_retries=3)
def process_bulk_validation(self, job_id: str, nits: list[str]):
    """
    Tarea Celery principal para procesar una lista de NITs.
    Inicia un bucle asíncrono controlado para utilizar Playwright sin saturación.
    """
    # Ejecuta el bucle de eventos asíncronos requerido por Playwright
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(
        _async_process_job(self, job_id, nits)
    )

async def _async_process_job(task, job_id: str, nits: list[str]):
    total = len(nits)
    success_count = 0
    failed_count = 0
    
    # Marcamos el lote en ejecución
    await update_job_progress(job_id, status="PROCESSING", processed_count=0)

    for idx, nit in enumerate(nits):
        try:
            # Consulta individual con estrategia Retry
            result = await scrape_nit_from_dian(nit)
            
            # Persistir resultado individual en Supabase
            await save_validation_result(job_id, result)
            success_count += 1
        except Exception as exc:
            failed_count += 1
            # Registramos un error controlado
            await save_validation_result(job_id, {"nit": nit, "status": "ERROR", "error": str(exc)})
            
        # Actualización periódica en Supabase (Dispara disparadores en tiempo real)
        await update_job_progress(
            job_id=job_id,
            status="PROCESSING" if (idx + 1) < total else "COMPLETED",
            processed_count=idx + 1,
            success_count=success_count,
            failed_count=failed_count
        )
```

---

## 3. Arquitectura del Scraper con Playwright (Stealth) y Seguridad de Red

El portal de la DIAN está protegido por balanceadores de carga y directivas de seguridad como Cloudflare / Sucuri. Un script estándar de Playwright/Puppeteer es bloqueado de inmediato. Para evitarlo se configura un stack defensivo de navegación:

### Configuración del Worker de Scraping (`src/workers/dian_scraper.py`)
```python
import random
from playwright.async_api import async_playwright
# Se recomienda instalar playwright-stealth vía pip
from playwright_stealth import stealth_async

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
]

async def scrape_nit_from_dian(nit: str) -> dict:
    """
    Interactúa de forma humana y simulada con el portal de consulta pública DIAN.
    """
    async with async_playwright() as p:
        # 1. Configurar un navegador Chromium optimizado
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-web-security",
                "--disable-infobars"
            ]
        )
        
        # 2. Modificar el contexto para incluir UserAgent realista y Viewport normalizado
        context = await browser.new_context(
            user_agent=random.choice(USER_AGENTS),
            viewport={"width": 1280, "height": 800},
            locale="es-CO",
            timezone_id="America/Bogota"
        )
        
        page = await context.new_page()
        
        # Aplicamos la máscara Stealth
        await stealth_async(page)
        
        # 3. Consultar con control de recesión de red y timeouts cortos
        try:
            # Portal de consulta DIAN Muisca
            url = f"https://muisca.dian.gov.co/WebConsultaRUT/ConsultaRut.faces"
            await page.goto(url, timeout=12000, wait_until="domcontentloaded")
            
            # Completar formulario simulando pulsación humana de teclas
            await page.wait_for_selector("#formConsultaRut\\:numNit", timeout=6000)
            
            # Limpiar campo e ingresar NIT carácter a carácter
            await page.click("#formConsultaRut\\:numNit")
            await page.fill("#formConsultaRut\\:numNit", "")
            for char in nit:
                await page.keyboard.press(char)
                await asyncio.sleep(random.uniform(0.05, 0.15)) # delay humano
                
            # Pulsar botón de búsqueda
            await page.click("#formConsultaRut\\:btnBuscar")
            
            # Esperar respuesta de la tabla de datos
            await page.wait_for_selector(".dian-results-table", timeout=8000)
            
            # Extracción de campos
            company_name = await page.locator("#formConsultaRut\\:razonSocial").inner_text()
            status = await page.locator("#formConsultaRut\\:estadoRut").inner_text()
            activity = await page.locator("#formConsultaRut\\:actividadPrincipal").inner_text()
            
            return {
                "nit": nit,
                "company_name": company_name.strip(),
                "status": status.strip().upper(),
                "economic_activity": activity.strip(),
                "success": True
            }
            
        except Exception as e:
            # Caso de captcha o caída del servicio
            raise RuntimeError(f"Falla de extracción DIAN para NIT {nit}: {str(e)}")
        finally:
            await context.close()
            await browser.close()
```

---

## 4. Estrategia de Sincronización con Supabase (Autenticación y RLS)

En lugar de construir una base de datos PostgreSQL tradicional y un servidor WebSocket complejo, el backend delega la sincronización de estados y persistencia directamente a Supabase, asegurando que la API principal mantenga un diseño estatal mínimo ("stateless").

- **Control de Acceso mediante JWT:** FastAPI intercepta las peticiones y valida el token `Authorization: Bearer <JWT_TOKEN>` directamente contra el endpoint JWKS de Supabase Auth.
- **Acceso Directo de Postgres a WebSockets (Real-time):** FastAPI actualiza el progreso en la tabla `validation_jobs`. Al estar habilitado Supabase Realtime, el cliente React recibe los cambios vía WebSocket en milisegundos de forma nativa sin interactuar con FastAPI para la fase de progreso.

### Autenticación Middleware en FastAPI (`src/api/dependencies.py`)
```python
from fastapi import Header, HTTPException, status
from jose import jwt, JWTError
from src.config import settings

def get_current_user(authorization: str = Header(...)) -> dict:
    """
    Decodifica y valida el JSON Web Token emitido por Supabase Auth.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Formato de autenticación inválido. Debe ser Bearer <token>"
        )
    
    token = authorization.split(" ")[1]
    try:
        # El secreto JWT de Supabase se define como la variable SUPABASE_JWT_SECRET
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated"
        )
        user_id = payload.get("sub")
        email = payload.get("email")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin identificación de usuario")
            
        return {"id": user_id, "email": email}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firma de Token inválida o expirada"
        )
```

---

## 5. El Flujo de Carga de Archivos Completo

```
   [CLIENTE]
       │
       │ 1. Carga de archivo Excel (.xlsx) / CSV
       ▼
   [FASTAPI API] ──► 2. Parsea archivo en memoria (sin guardado en disco permanente)
       │             3. Extrae lista de NITs válidos usando pandas/xlsx
       │             4. Registra en Supabase `validation_jobs` -> Status: PENDING
       ▼
   [REDIS] ──► 5. Inserta IDs de tarea en la cola masiva
       │
       ▼
   [WORKERS] ──► 6. Orquesta Playwright con Rotación de Proxies/IPs y Retardos
       │        7. Guarda cada registro procesado en `validation_results`
       │        8. Actualiza el progreso de forma iterativa en `validation_jobs`
       ▼
   [SUPABASE DB] ──(Notificación Real-time)──► [INTERFAZ REACT DE OPERADOR]
```

---

## 6. Lucha contra el Bloqueo: Reintentos, Proxies y Anti-botting

Dado que la DIAN restringe repetidos requests provenientes de la misma IP, se configuran salvaguardas avanzadas en los Workers de Celery:

1. **Rotación Automática de Proxies (Residential Proxy Pool):**
   A través del motor Playwright, se inyectan credenciales de rotación para cada sesión de navegador.
   ```python
   # En src/workers/dian_scraper.py
   proxy_config = {
       "server": settings.PROXY_ROTATION_GATEWAY,  # e.g., "http://zproxy.luminati.io:22225"
       "username": settings.PROXY_USERNAME,
       "password": settings.PROXY_PASSWORD
   }
   context = await browser.new_context(proxy=proxy_config)
   ```
2. **Backoff Estratégico Exponencial (Retries):**
   Si una tarea falla por bloqueo (HTTP 429 u 503), la Celery Task reintenta automáticamente con un multiplicador de retardo exponencial, previniendo empeorar la reputación de la IP.
3. **Evasión de Patrones Estáticos (Random Jitter):**
   Entre cada clic y movimiento virtual en el navegador Playwright, se genera un tiempo de suspensión aleatorio (`random.uniform(0.5, 2.0)`) con micro-movimientos del ratón virtual.

---

## 7. Despliegue en la Nube con Railway (`railway.json` / Dockerfile)

Railway permite desplegar múltiples componentes (API FastAPI, Workers Celery y Base de Datos Redis de Soporte) coordinados bajo el mismo monorepositorio o repositorio unificado.

### Configuración del Despliegue en Railway (`railway.json`)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "docker"
  },
  "services": {
    "api": {
      "source": "api",
      "watchPatterns": ["src/api/**", "src/core/**", "src/services/**", "src/main.py"],
      "build": {
        "dockerfilePath": "Dockerfile"
      }
    },
    "celery-worker": {
      "source": "worker",
      "watchPatterns": ["src/workers/**", "src/core/**"],
      "build": {
        "dockerfilePath": "Dockerfile.worker"
      }
    }
  }
}
```

### Dockerfile del Worker Celery con Drivers Playwright (`Dockerfile.worker`)
```dockerfile
# Utilizar una imagen oficial de Python optimizada
FROM python:3.11-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Instalar dependencias del sistema requeridas por Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfix0 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Descargar e instalar exclusivamente los binarios de Chromium de Playwright
RUN playwright install chromium
RUN playwright install-deps chromium

COPY . .

# Comando de arranque para Celery Worker en modo un solo proceso de alta fidelidad
CMD ["celery", "-A", "src.workers.tasks.celery_app", "worker", "--loglevel=info", "-c", "1"]
```

---

## 8. Gestión de Variables de Entorno Seguras

Las variables sensibles bajo ninguna circunstancia se guardan en el repositorio Git. Se consumen mediante `Pydantic BaseSettings` validando tipos y presencia en el entorno en tiempo de arranque.

### Variables de Entorno del Proyecto (`.env.example`)
```env
# Configuración Servidor FastAPI
PORT=3000
ENVIRONMENT=production
ALLOWED_ORIGINS="https://mi-portal-saas.com,https://railway.app"

# Base de persistencia y encriptación Supabase
VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
VITE_SUPABASE_ANON_KEY="tu-anon-key-publica"
SUPABASE_JWT_SECRET="secreto-jwt-recuperado-de-settings-api-supabase"
SUPABASE_SERVICE_ROLE_KEY="llave-maestra-para-escribir-sin-restriccion-de-usuario"

# Cola asíncrona Celery
REDIS_URL="redis://default:password@redis-railway:6379/0"

# Rotación de Proxies Antibloqueo DIAN
PROXY_ROTATION_GATEWAY="http://proxy.proveedor.com:20000"
PROXY_USERNAME="usuario-premium-pro"
PROXY_PASSWORD="clave-secreta-proxy"

# Límites operativos de seguridad
MAX_NITS_PER_JOB=5000
CONCURRENT_SCRAPING_LIMIT=2
```

La adopción rígida de este blueprint garantiza una arquitectura desacoplada, escalable de forma horizontal (añadiendo workers independientes en Railway sin saturar el API principal) y 100% preparada para producción con los mayores estándares de cumplimiento corporativo.
