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
    cleaned_nit = "".join(filter(str.isdigit, nit_str))
    expected_dv = calculate_dian_dv(cleaned_nit)

    if not cleaned_nit:
        raise ValueError(f"NIT '{nit_str}' no contiene digitos numericos validos.")

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
                timezone_id="America/Bogota",
                extra_http_headers={
                    "Accept-Language": "es-CO,es;q=0.9",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Referer": "http://muisca.dian.gov.co/",
                }
            )

            page = await context.new_page()

            dian_url = "http://muisca.dian.gov.co/WebRutMuisca/DefConsultaEstadoRUT.faces"
            logger.info(f"[NIT: {cleaned_nit}] Navegando a: {dian_url}")
            try:
                await page.goto(dian_url, timeout=30000, wait_until="domcontentloaded")
            except PlaywrightTimeoutError:
                raise RuntimeError("Timeout al cargar el portal DIAN (>30s).")
            except PlaywrightError as e:
                raise RuntimeError(f"Error de navegacion al portal DIAN: {str(e)}")

            page_title = await page.title()
            logger.info(f"[NIT: {cleaned_nit}] PAGE TITLE: {page_title}")
            logger.info(f"[NIT: {cleaned_nit}] PAGE URL: {page.url}")

            body_el = await page.query_selector("body")
            body_text = await body_el.inner_html() if body_el else "NO BODY"
            logger.info(f"[NIT: {cleaned_nit}] BODY HTML: {body_text[:4000]}")

            inputs = await page.query_selector_all("input")
            for inp in inputs:
                name = await inp.get_attribute("name")
                tipo = await inp.get_attribute("type")
                value = await inp.get_attribute("value")
                logger.info(f"[NIT: {cleaned_nit}] INPUT: name={name} type={tipo} value={value}")

            input_selector = "input[name='NIT']"
            logger.info(f"[NIT: {cleaned_nit}] Esperando campo NIT...")
            try:
                await page.wait_for_selector(input_selector, timeout=10000)
            except PlaywrightTimeoutError:
                input_selector = "input[type='text']"
                try:
                    await page.wait_for_selector(input_selector, timeout=5000)
                except PlaywrightTimeoutError:
                    raise RuntimeError("Campo NIT no encontrado. El portal puede haber cambiado o mostrar captcha.")

            await page.fill(input_selector, "")
            await page.type(input_selector, cleaned_nit, delay=random.randint(60, 120))

            btn_selector = None
            for sel in [
                "input[type='submit']",
                "button[type='submit']",
                "input[type='button']",
                "input[value='Buscar']",
                "input[value='Consultar']",
                "button",
            ]:
                el = await page.query_selector(sel)
                if el:
                    btn_selector = sel
                    logger.info(f"[NIT: {cleaned_nit}] Boton encontrado: {sel}")
                    break

            if not btn_selector:
                raise RuntimeError("Boton de busqueda no encontrado en el portal.")

            await page.click(btn_selector)

            try:
                await page.wait_for_load_state("networkidle", timeout=20000)
            except Exception:
                pass

            await asyncio.sleep(2.0)

            result_html = await page.content()
            logger.info(f"[NIT: {cleaned_nit}] RESULT HTML: {result_html[:2000]}")

            company_el = (
                await page.query_selector("[id*='razonSocial']") or
                await page.query_selector("[id*='primerApellido']")
            )
            company_name = (await company_el.inner_text()).strip() if company_el else None

            status_el = await page.query_selector("[id*='estado']")
            status_val = (await status_el.inner_text()).strip().upper() if status_el else None

            activity_code_el = await page.query_selector("[id*='actividadEconomica']")
            activity_code = (await activity_code_el.inner_text()).strip() if activity_code_el else "N/A"

            activity_name_el = await page.query_selector("[id*='nombreActividad']")
            activity_name = (await activity_name_el.inner_text()).strip().capitalize() if activity_name_el else "N/A"

            address_el = (
                await page.query_selector("[id*='direccionSeccional']") or
                await page.query_selector("[id*='direccion']")
            )
            address = (await address_el.inner_text()).strip() if address_el else "N/A"

            dpto_el = (
                await page.query_selector("[id*='seccional']") or
                await page.query_selector("[id*='dpto']")
            )
            dpto = (await dpto_el.inner_text()).strip() if dpto_el else "N/A"

            if not company_name and not status_val:
                raise RuntimeError("El portal respondio con campos vacios. NIT no existe, captcha activo, o portal bloqueo la consulta.")

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
                "notes": "Validacion exitosa desde el portal Muisca de la DIAN."
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
