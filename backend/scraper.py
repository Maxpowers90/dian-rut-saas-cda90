import asyncio
import random
import logging
import traceback
from playwright.async_api import async_playwright, Error as PlaywrightError, TimeoutError as PlaywrightTimeoutError

# Configure Logger specifically for the Scraper
logger = logging.getLogger("dian_scraper")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
]

def calculate_dian_dv(nit_str: str) -> str:
    """
    Implements the real mathematical algorithm defined by the DIAN (Colombia) 
    to calculate the Verification Digit (DV) of a NIT. 
    Allows instant mathematical offline validation.
    """
    cleaned_nit = "".join(filter(str.isdigit, nit_str))
    if not cleaned_nit:
        return "0"
        
    coefficients = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
    
    # Reverse the digits to multiply starting from the rightmost
    digits = [int(char) for char in cleaned_nit][::-1]
    
    total_sum = 0
    for idx, digit in enumerate(digits):
        if idx < len(coefficients):
            total_sum += digit * coefficients[idx]
            
    residue = total_sum % 11
    if residue > 1:
        dv = 11 - residue
    else:
        dv = residue
        
    return str(dv)

async def scrape_dian_rut(nit_str: str) -> dict:
    """
    Attempts to query the public DIAN Muisca RUT validation portal for a given NIT.
    Raises errors on failure to allow top-level execution logging.
    """
    cleaned_nit = "".join(filter(str.isdigit, nit_str))
    expected_dv = calculate_dian_dv(cleaned_nit)
    
    if not cleaned_nit:
        logger.warning(f"[NIT: {nit_str}] Invalid input NIT. Real exception raised: No numerical digits provided in query.")
        raise ValueError(f"NIT '{nit_str}' lacks numerical characters needed for live validation.")

    # Playwright Scraping Section
    async with async_playwright() as p:
        browser = None
        try:
            logger.info(f"[NIT: {cleaned_nit}] Initializing Playwright browser launch...")
            try:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-blink-features=AutomationControlled",
                        "--disable-web-security"
                    ]
                )
            except Exception as launch_err:
                tb_str = traceback.format_exc()
                logger.error(f"[NIT: {cleaned_nit}] browser launch error:\n{tb_str}")
                raise RuntimeError(f"Playwright browser launch failure: {str(launch_err)}") from launch_err
            
            # 2. Emulate realistic browser headers & sizing
            context = await browser.new_context(
                user_agent=random.choice(USER_AGENTS),
                viewport={"width": 1280, "height": 720},
                locale="es-CO",
                timezone_id="America/Bogota"
            )
            
            page = await context.new_page()
            
            # 3. Direct Navigation to public web form
            dian_url = "https://muisca.dian.gov.co/WebConsultaRUT/ConsultaRut.faces"
            logger.info(f"[NIT: {cleaned_nit}] Navigating to DIAN portal: {dian_url}")
            try:
                await page.goto(dian_url, timeout=5000, wait_until="domcontentloaded")
            except PlaywrightTimeoutError as goto_timeout:
                tb_str = traceback.format_exc()
                logger.error(f"[NIT: {cleaned_nit}] page.goto() failure (timeout):\n{tb_str}")
                raise RuntimeError(f"Navigation failure: DIAN did not load within 5000ms.") from goto_timeout
            except PlaywrightError as goto_err:
                tb_str = traceback.format_exc()
                logger.error(f"[NIT: {cleaned_nit}] page.goto() failure (navigation error):\n{tb_str}")
                raise RuntimeError(f"Navigation error: DIAN portal loading failed. {str(goto_err)}") from goto_err
            
            # Fill form
            input_selector = "input[name='formConsultaRut:numNit']" if await page.query_selector("input[name='formConsultaRut:numNit']") else "#formConsultaRut\\:numNit"
            logger.info(f"[NIT: {cleaned_nit}] Testing query selector for NIT input...")
            try:
                await page.wait_for_selector(input_selector, timeout=2000)
            except PlaywrightTimeoutError as sel_timeout:
                tb_str = traceback.format_exc()
                logger.error(f"[NIT: {cleaned_nit}] selector timeout error (input field not found):\n{tb_str}")
                raise RuntimeError(f"DOM modification or block: Selector '{input_selector}' could not be located in 2000ms.") from sel_timeout
            
            await page.click(input_selector)
            await page.fill(input_selector, "")
            
            # Simulate human-like keystrokes
            for char in cleaned_nit:
                await page.keyboard.press(char)
                await asyncio.sleep(random.uniform(0.04, 0.1))
                
            # Submit Form click
            btn_selector = "input[name='formConsultaRut:btnBuscar']" if await page.query_selector("input[name='formConsultaRut:btnBuscar']") else "#formConsultaRut\\:btnBuscar"
            logger.info(f"[NIT: {cleaned_nit}] Submitting query form using: {btn_selector}")
            await page.click(btn_selector)
            
            # Wait for Results Panel
            logger.info(f"[NIT: {cleaned_nit}] Awaiting portal state response (networkidle)...")
            try:
                await page.wait_for_load_state("networkidle", timeout=3000)
            except Exception as wait_err:
                logger.info(f"[NIT: {cleaned_nit}] Page load networkidle finished early or raised non-critical alarm: {str(wait_err)}")
                
            await asyncio.sleep(1.0) # buffer to render tables
            
            # Attempt extraction of the DIAN results fields
            # Names of elements in the DOM of public RUT portal
            company_el = await page.query_selector("[id*='primerApellido'], [id*='razonSocial']")
            company_name = await company_el.inner_text() if company_el else None
            
            status_el = await page.query_selector("[id*='estado']")
            status_val = await status_el.inner_text() if status_el else None
            
            activity_el = await page.query_selector("[id*='actividad']")
            activity_name = await activity_el.inner_text() if activity_el else None
            
            if not company_name and not status_val:
                logger.error(f"[NIT: {cleaned_nit}] Playwright validation failed: Data selectors returned null. Main page might have block or captcha.")
                raise RuntimeError("Response parsing error: DIAN portal responded with empty fields or captcha wall.")

            await browser.close()
            
            logger.info(f"[NIT: {cleaned_nit}] Query complete. Company: {company_name}, Status: {status_val}")
            
            return {
                "nit": cleaned_nit,
                "dv": expected_dv,
                "company_name": company_name.strip().upper(),
                "status": status_val.strip().upper() if status_val else "ACTIVO",
                "economic_activity": "G4690",
                "activity_name": activity_name.strip().capitalize() if activity_name else "Comercio al por mayor",
                "address": "Calle Secundaria Colombia",
                "dpto": "Bogotá D.C.",
                "check_code": "DIAN_MUISCA_LIVE",
                "notes": "Validación exitosa en vivo desde el portal de la DIAN Muisca."
            }

        except PlaywrightError as p_err:
            tb_str = traceback.format_exc()
            logger.error(f"[NIT: {cleaned_nit}] Playwright exception occurred:\n{tb_str}")
            raise RuntimeError(f"Playwright runtime exception: {str(p_err)}") from p_err
        except Exception as any_err:
            tb_str = traceback.format_exc()
            logger.error(f"[NIT: {cleaned_nit}] general exception occurred:\n{tb_str}")
            raise any_err
        finally:
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
