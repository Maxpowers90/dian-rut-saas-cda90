import asyncio
import random
import logging
import traceback

from playwright.async_api import (
    async_playwright,
    Error as PlaywrightError,
    TimeoutError as PlaywrightTimeoutError
)

from playwright_stealth import stealth_async

logger = logging.getLogger("dian_scraper")

USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/135.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    )
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


async def human_delay(min_ms=500, max_ms=1800):
    await asyncio.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


async def human_mouse_movements(page):

    for _ in range(random.randint(3, 6)):

        await page.mouse.move(
            random.randint(100, 1200),
            random.randint(100, 700),
            steps=random.randint(5, 25)
        )

        await human_delay(100, 500)


async def wait_for_turnstile(page, cleaned_nit: str):

    logger.info(f"[NIT: {cleaned_nit}] Esperando Turnstile...")

    try:

        await page.wait_for_function(
            """
            () => {

                const el = document.querySelector(
                    '[name="cf-turnstile-response"]'
                );

                return (
                    el &&
                    el.value &&
                    el.value.length > 20
                );
            }
            """,
            timeout=45000
        )

        token = await page.locator(
            '[name="cf-turnstile-response"]'
        ).input_value()

        logger.info(
            f"[NIT: {cleaned_nit}] Turnstile token OK: "
            f"{token[:20]}..."
        )

        return token

    except Exception:

        logger.error(
            f"[NIT: {cleaned_nit}] "
            "Cloudflare no generó token Turnstile"
        )

        await page.screenshot(
            path=f"turnstile_fail_{cleaned_nit}.png",
            full_page=True
        )

        html = await page.content()

        with open(
            f"turnstile_fail_{cleaned_nit}.html",
            "w",
            encoding="utf-8"
        ) as f:
            f.write(html)

        raise RuntimeError(
            "Cloudflare bloqueó la sesión. "
            "No se generó token Turnstile."
        )


async def scrape_dian_rut(nit_str: str) -> dict:

    cleaned_nit = "".join(filter(str.isdigit, nit_str))

    expected_dv = calculate_dian_dv(cleaned_nit)

    if not cleaned_nit:
        raise ValueError(
            f"NIT '{nit_str}' no contiene dígitos válidos."
        )

    async with async_playwright() as p:

        browser = None

        try:

            logger.info(
                f"[NIT: {cleaned_nit}] "
                "Iniciando Chromium..."
            )

            browser = await p.chromium.launch(
                headless=False,
                slow_mo=50,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-web-security",
                ]
            )

            context = await browser.new_context(
                user_agent=random.choice(USER_AGENTS),
                viewport={
                    "width": 1366,
                    "height": 768
                },
                locale="es-CO",
                timezone_id="America/Bogota",
                java_script_enabled=True,
                extra_http_headers={
                    "Accept-Language": "es-CO,es;q=0.9",
                    "Accept": (
                        "text/html,application/xhtml+xml,"
                        "application/xml;q=0.9,*/*;q=0.8"
                    ),
                    "Upgrade-Insecure-Requests": "1",
                    "Referer": "https://muisca.dian.gov.co/",
                }
            )

            page = await context.new_page()

            # stealth mode
            await stealth_async(page)

            dian_url = (
                "https://muisca.dian.gov.co/"
                "WebRutMuisca/DefConsultaEstadoRUT.faces"
            )

            logger.info(
                f"[NIT: {cleaned_nit}] "
                f"Navegando a {dian_url}"
            )

            try:

                await page.goto(
                    dian_url,
                    timeout=60000,
                    wait_until="networkidle"
                )

            except PlaywrightTimeoutError:
                raise RuntimeError(
                    "Timeout cargando portal DIAN (>60s)"
                )

            except PlaywrightError as e:
                raise RuntimeError(
                    f"Error navegando al portal DIAN: {str(e)}"
                )

            await human_delay(2000, 4000)

            await human_mouse_movements(page)

            input_selector = (
                "input[name='vistaConsultaEstadoRUT:"
                "formConsultaEstadoRUT:numNit']"
            )

            btn_selector = (
                "input[name='vistaConsultaEstadoRUT:"
                "formConsultaEstadoRUT:btnBuscar']"
            )

            logger.info(
                f"[NIT: {cleaned_nit}] "
                "Esperando campo NIT..."
            )

            try:

                await page.wait_for_selector(
                    input_selector,
                    timeout=15000
                )

            except PlaywrightTimeoutError:

                await page.screenshot(
                    path=f"input_not_found_{cleaned_nit}.png",
                    full_page=True
                )

                raise RuntimeError(
                    "Campo NIT no encontrado."
                )

            await page.mouse.move(300, 400)

            await human_delay(500, 1200)

            await page.click(input_selector)

            await human_delay(500, 1500)

            await page.type(
                input_selector,
                cleaned_nit,
                delay=random.randint(100, 180)
            )

            await human_delay(1000, 2500)

            # esperar turnstile real
            turnstile_token = await wait_for_turnstile(
                page,
                cleaned_nit
            )

            logger.info(
                f"[NIT: {cleaned_nit}] "
                "Enviando formulario..."
            )

            await human_delay(1200, 2500)

            await page.click(btn_selector)

            try:
                await page.wait_for_load_state(
                    "networkidle",
                    timeout=30000
                )
            except Exception:
                pass

            await human_delay(3000, 6000)

            result_html = await page.content()

            with open(
                f"resultado_{cleaned_nit}.html",
                "w",
                encoding="utf-8"
            ) as f:
                f.write(result_html)

            await page.screenshot(
                path=f"resultado_{cleaned_nit}.png",
                full_page=True
            )

            logger.info(
                f"[NIT: {cleaned_nit}] "
                "HTML recibido correctamente"
            )

            # extracción de datos
            company_el = (
                await page.query_selector("[id*='razonSocial']")
                or await page.query_selector("[id*='primerApellido']")
            )

            company_name = (
                (await company_el.inner_text()).strip()
                if company_el else None
            )

            status_el = await page.query_selector("[id*='estado']")

            status_val = (
                (await status_el.inner_text()).strip().upper()
                if status_el else None
            )

            activity_code_el = await page.query_selector(
                "[id*='actividadEconomica']"
            )

            activity_code = (
                (await activity_code_el.inner_text()).strip()
                if activity_code_el else "N/A"
            )

            activity_name_el = await page.query_selector(
                "[id*='nombreActividad']"
            )

            activity_name = (
                (await activity_name_el.inner_text()).strip()
                if activity_name_el else "N/A"
            )

            address_el = (
                await page.query_selector("[id*='direccionSeccional']")
                or await page.query_selector("[id*='direccion']")
            )

            address = (
                (await address_el.inner_text()).strip()
                if address_el else "N/A"
            )

            dpto_el = (
                await page.query_selector("[id*='seccional']")
                or await page.query_selector("[id*='dpto']")
            )

            dpto = (
                (await dpto_el.inner_text()).strip()
                if dpto_el else "N/A"
            )

            if not company_name and not status_val:

                raise RuntimeError(
                    "La DIAN respondió sin datos válidos. "
                    "Cloudflare probablemente detectó automatización."
                )

            logger.info(
                f"[NIT: {cleaned_nit}] "
                f"Resultado: {company_name} | "
                f"Estado: {status_val}"
            )

            return {
                "nit": cleaned_nit,
                "dv": expected_dv,
                "company_name": (
                    company_name.upper()
                    if company_name
                    else f"NIT {cleaned_nit}"
                ),
                "status": (
                    status_val
                    if status_val
                    else "ACTIVO"
                ),
                "economic_activity": activity_code,
                "activity_name": activity_name,
                "address": address,
                "dpto": dpto,
                "check_code": "DIAN_MUISCA_LIVE",
                "notes": (
                    "Validación exitosa "
                    "desde portal DIAN."
                )
            }

        except (RuntimeError, ValueError):
            raise

        except PlaywrightError as e:

            tb = traceback.format_exc()

            logger.error(
                f"[NIT: {cleaned_nit}] "
                f"PlaywrightError:\n{tb}"
            )

            raise RuntimeError(
                f"Error de Playwright: {str(e)}"
            )

        except Exception:

            tb = traceback.format_exc()

            logger.error(
                f"[NIT: {cleaned_nit}] "
                f"Error inesperado:\n{tb}"
            )

            raise

        finally:

            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
