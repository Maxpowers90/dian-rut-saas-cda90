"""
scraper.py
Async Playwright scraper for the DIAN MUISCA RUT validation portal.

The public lookup URL is:
  https://muisca.dian.gov.co/WebRutMuisca/DefConsultaEstadoRUT.faces

The function `scrape_dian_rut(nit)` fills in the NIT field, submits the
form, and parses the response page to extract the company name, DV digit,
and registration status.

If the live portal is unreachable or returns an unexpected structure the
function falls back to a lightweight check-digit algorithm (Módulo 11)
so the caller always receives a structured dict.
"""

import asyncio
import re
from typing import Any, Dict

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DIAN_URL = (
    "https://muisca.dian.gov.co/WebRutMuisca/DefConsultaEstadoRUT.faces"
)

# Selectors – adjust if DIAN updates their markup
NIT_INPUT_SELECTOR = "input[id*='numNit'], input[name*='numNit']"
CONSULT_BUTTON_SELECTOR = "input[id*='btnBuscar'], input[value*='Consultar']"
RESULT_TABLE_SELECTOR = "table.tablaResultados, table[id*='resultado']"

REQUEST_TIMEOUT_MS = 30_000  # 30 s per NIT


# ---------------------------------------------------------------------------
# DV check-digit algorithm (Módulo 11 – DIAN specification)
# ---------------------------------------------------------------------------

_WEIGHTS = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]


def _compute_dv(nit: str) -> str:
    """Return the verification digit (DV) for a Colombian NIT using Módulo 11."""
    digits = [int(c) for c in nit if c.isdigit()]
    weights = _WEIGHTS[-len(digits):]
    total = sum(d * w for d, w in zip(digits, weights))
    remainder = total % 11
    if remainder < 2:
        return str(remainder)
    return str(11 - remainder)


# ---------------------------------------------------------------------------
# Main scraper
# ---------------------------------------------------------------------------


async def scrape_dian_rut(nit: str) -> Dict[str, Any]:
    """
    Query the DIAN MUISCA portal for the given NIT and return a dict with:

      nit          – cleaned NIT string (digits only)
      dv           – verification digit
      company_name – registered name or empty string
      status       – e.g. "ACTIVO", "CANCELADO", "SUSPENDIDO", "UNKNOWN"
      check_code   – "DIAN_MUISCA_LIVE" | "ALGO_FALLBACK_2026"
      notes        – human-readable detail or error message
      raw_data     – dict with any extra fields extracted from the page
    """
    clean_nit = "".join(filter(str.isdigit, str(nit)))

    if not clean_nit:
        return _fallback_result(nit, "NIT vacío o sin dígitos numéricos.")

    try:
        return await _scrape_live(clean_nit)
    except Exception as exc:  # noqa: BLE001
        return _fallback_result(clean_nit, f"Portal DIAN no disponible: {exc}")


async def _scrape_live(nit: str) -> Dict[str, Any]:
    """Perform the actual Playwright scrape against the DIAN portal."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="es-CO",
        )
        page = await context.new_page()

        try:
            await page.goto(DIAN_URL, timeout=REQUEST_TIMEOUT_MS)

            # Fill NIT field
            await page.wait_for_selector(NIT_INPUT_SELECTOR, timeout=REQUEST_TIMEOUT_MS)
            await page.fill(NIT_INPUT_SELECTOR, nit)

            # Submit
            await page.click(CONSULT_BUTTON_SELECTOR)

            # Wait for results
            await page.wait_for_selector(
                RESULT_TABLE_SELECTOR, timeout=REQUEST_TIMEOUT_MS
            )

            # Parse result table
            raw_data = await _parse_result_table(page)

        except PlaywrightTimeoutError as exc:
            raise RuntimeError(f"Timeout esperando respuesta de DIAN: {exc}") from exc
        finally:
            await browser.close()

    company_name = raw_data.get("Razón Social", raw_data.get("Nombre", ""))
    rut_status = _normalise_status(
        raw_data.get("Estado", raw_data.get("Estado RUT", "UNKNOWN"))
    )
    dv = raw_data.get("DV", _compute_dv(nit))

    return {
        "nit": nit,
        "dv": dv,
        "company_name": company_name,
        "status": rut_status,
        "check_code": "DIAN_MUISCA_LIVE",
        "notes": "Consultado exitosamente en el portal DIAN MUISCA.",
        "raw_data": raw_data,
    }


async def _parse_result_table(page: Any) -> Dict[str, str]:
    """
    Extract key-value pairs from the DIAN result table.
    Returns a plain dict of label → value strings.
    """
    rows = await page.query_selector_all(f"{RESULT_TABLE_SELECTOR} tr")
    data: Dict[str, str] = {}

    for row in rows:
        cells = await row.query_selector_all("td, th")
        texts = [
            (await cell.inner_text()).strip()
            for cell in cells
        ]
        # Expect pairs: [label, value] or [label, value, label, value, ...]
        for i in range(0, len(texts) - 1, 2):
            key = re.sub(r"\s+", " ", texts[i]).rstrip(":")
            value = texts[i + 1]
            if key:
                data[key] = value

    return data


def _normalise_status(raw: str) -> str:
    """Map DIAN status strings to a consistent uppercase token."""
    upper = raw.upper().strip()
    if "ACTIVO" in upper or "ACTIVE" in upper:
        return "ACTIVO"
    if "CANCEL" in upper:
        return "CANCELADO"
    if "SUSPEND" in upper:
        return "SUSPENDIDO"
    if "INACTIV" in upper:
        return "INACTIVO"
    return upper or "UNKNOWN"


# ---------------------------------------------------------------------------
# Fallback (algorithm-only, no live portal)
# ---------------------------------------------------------------------------


def _fallback_result(nit: str, reason: str) -> Dict[str, Any]:
    """
    Return a best-effort result computed locally when the live portal
    is unavailable.  The DV is calculated via Módulo 11.
    """
    clean = "".join(filter(str.isdigit, str(nit)))
    dv = _compute_dv(clean) if clean else "0"

    return {
        "nit": clean or nit,
        "dv": dv,
        "company_name": "",
        "status": "UNKNOWN",
        "check_code": "ALGO_FALLBACK_2026",
        "notes": reason,
        "raw_data": {},
    }
