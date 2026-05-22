import asyncio
import random
import logging
import traceback
from playwright.async_api import async_playwright, Error as PlaywrightError, TimeoutError as PlaywrightTimeoutError

logger = logging.getLogger("dian_scraper")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
]

def calculate_dian_dv(nit_str: str) -> str:
    """
    Calcula el Dígito de Verificación (DV) según el algoritmo oficial de la DIAN.
    """
    cleaned_nit = "".join(filter(str.isdigit, nit_str))
    if not cleaned_nit:
        return "0"

    coefficients = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
    digits = [int(c) for c in cleaned_nit][::-1]

    total_sum = 0
    for idx, digit in enumerate(digits):
        if idx < len(coefficients):
            total_sum += digit * coefficients[idx]

    residue = total_sum % 11
    dv = 11 - residue if residue > 1 else residue
    return str(dv)


async def scrape_dian_rut(nit_str: str) -> dict:
    """
    Consulta el portal público RUT Muisca de la DIAN para un NIT dado.
    Raises RuntimeError con mensaje descriptivo ante cualquier fallo.
    """
    cleaned_nit = "".join(filter(str.isdigit, nit_str))
    expected_dv = calculate_dian_dv(cleaned_nit)

    if not cleaned_nit:
        raise ValueError(f"NIT '{nit_str}' no contiene dígitos numéricos válidos.")

    async with async_playwright() as p:
        browser = None
        try:
            logger.info(f"[NIT: {cleaned_nit}] Iniciando navegador Chromium...")
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                ]
            )

            context = await browser.new_context(
                user_agent=random.choice(USER_AGENTS),
                viewport={"width": 1280, "height": 720},
                locale="es-CO",
                timezone_id="America/Bogota"
            )

            page = await context.new_page()

            # --- FIX 1: Timeout aumentado a 30s (el portal DIAN es muy lento) ---
            dian_url = "dian_url = "https://muisca.dian.gov.co/WebRutMuisca/DefConsultaEstadoRUT.faces""
            logger.info(f"[NIT: {cleaned_nit}] Navegando a: {dian_url}")
            try:
                await page.goto(dian_url, timeout=30000, wait_until="domcontentloaded")
            except PlaywrightTimeoutError:
                raise RuntimeError("Timeout al cargar el portal DIAN (>30s). El servidor puede estar caído o bloqueando el acceso.")
            except PlaywrightError as e:
                raise RuntimeError(f"Error de navegación al portal DIAN: {str(e)}")

            # DEBUG temporal
            page_content = await page.content()
            logger.info(f"[NIT: {cleaned_nit}] PAGE TITLE: {await page.title()}")
            logger.info(f"[NIT: {cleaned_nit}] PAGE URL: {page.url}")
            logger.info(f"[NIT: {cleaned_nit}] HTML SNIPPET: {page_content[:500]}")

                      
            # --- FIX 2: wait_for_selector PRIMERO, luego usar el selector confirmado ---
            input_selector = "input[name='NIT']"
            logger.info(f"[NIT: {cleaned_nit}] Esperando campo de entrada NIT...")
            try:
                await page.wait_for_selector(input_selector, timeout=10000)
            except PlaywrightTimeoutError:
                # Intentar selector alternativo con escape JSF
                input_selector = "#formConsultaRut\\:numNit"
                try:
                    await page.wait_for_selector(input_selector, timeout=5000)
                except PlaywrightTimeoutError:
                    raise RuntimeError("Campo NIT no encontrado en el portal. El portal puede haber cambiado su estructura HTML o mostrar un captcha.")

            await page.fill(input_selector, "")

            # --- FIX 3: Usar page.type() para escritura carácter a carácter (NO keyboard.press) ---
            await page.type(input_selector, cleaned_nit, delay=random.randint(60, 120))

            # Localizar y hacer clic en el botón Buscar
            btn_selector = "input[type='submit']"
            try:
                await page.wait_for_selector(btn_selector, timeout=5000)
            except PlaywrightTimeoutError:
                btn_selector = "#formConsultaRut\\:btnBuscar"
                await page.wait_for_selector(btn_selector, timeout=5000)

            logger.info(f"[NIT: {cleaned_nit}] Enviando formulario...")
            await page.click(btn_selector)

            # Esperar respuesta del portal
            try:
                await page.wait_for_load_state("networkidle", timeout=20000)
            except Exception:
                pass  # networkidle puede no dispararse en portales JSF, continuar

            await asyncio.sleep(1.5)  # buffer adicional para renderizado JSF

            # --- Extracción de datos del portal ---
            # Razón social o primer apellido
            company_el = await page.query_selector("[id*='razonSocial']") or \
                         await page.query_selector("[id*='primerApellido']")
            company_name = (await company_el.inner_text()).strip() if company_el else None

            # Estado del RUT
            status_el = await page.query_selector("[id*='estado']")
            status_val = (await status_el.inner_text()).strip().upper() if status_el else None

            # Actividad económica
            activity_code_el = await page.query_selector("[id*='actividadEconomica']")
            activity_code = (await activity_code_el.inner_text()).strip() if activity_code_el else "N/A"

            activity_name_el = await page.query_selector("[id*='nombreActividad']")
            activity_name = (await activity_name_el.inner_text()).strip().capitalize() if activity_name_el else "N/A"

            # Dirección
            address_el = await page.query_selector("[id*='direccionSeccional']") or \
                         await page.query_selector("[id*='direccion']")
            address = (await address_el.inner_text()).strip() if address_el else "N/A"

            # Departamento / seccional
            dpto_el = await page.query_selector("[id*='seccional']") or \
                      await page.query_selector("[id*='dpto']")
            dpto = (await dpto_el.inner_text()).strip() if dpto_el else "N/A"

            if not company_name and not status_val:
                raise RuntimeError(
                    "El portal respondió con campos vacíos. Posibles causas: NIT no existe, captcha activo, o el portal bloqueó la consulta."
                )

            logger.info(f"[NIT: {cleaned_nit}] Resultado: {company_name} | Estado: {status_val}")

            return {
                "nit": cleaned_nit,
                "dv": expected_dv,
                "company_name": company_name.upper() if company_name else f"NIT {cleaned_nit}",
                "status": status_val if status_val else "ACTIVO",
                "economic_activity": activity_code,
                "activity_name": activity_name,
                "address": address,
                "dpto": dpto,
                "check_code": "DIAN_MUISCA_LIVE",
                "notes": "Validación exitosa desde el portal Muisca de la DIAN."
            }

        except (RuntimeError, ValueError):
            raise
        except PlaywrightError as e:
            tb = traceback.format_exc()
            logger.error(f"[NIT: {cleaned_nit}] PlaywrightError:\n{tb}")
            raise RuntimeError(f"Error de Playwright: {str(e)}")
        except Exception as e:
            tb = traceback.format_exc()
            logger.error(f"[NIT: {cleaned_nit}] Error inesperado:\n{tb}")
            raise
        finally:
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
