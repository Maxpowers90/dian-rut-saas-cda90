import io
import os
import logging
import traceback
import asyncio
from typing import List
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("main_api")

# --- FIX 4: Imports sin prefijo 'backend.' (Railway ejecuta desde /backend) ---
from supabase_client import (
    create_validation_job,
    update_job_progress,
    insert_validation_result,
    get_supabase
)
from scraper import scrape_dian_rut, calculate_dian_dv

app = FastAPI(
    title="RUT DIAN Validator API",
    description="Motor de validación masiva de NITs colombianos vía portal Muisca DIAN",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    try:
        _ = get_supabase()
        db_status = "connected"
    except Exception as err:
        db_status = f"error: {str(err)}"

    return {
        "status": "online",
        "database": db_status,
        "framework": "FastAPI + Playwright"
    }


def process_validation_sequential(job_id: str, nits: List[str]):
    """
    Entry point síncrono para BackgroundTasks.
    Lanza un loop asyncio aislado para procesar el scraping.
    """
    logger.info(f"[JOB {job_id}] Iniciando procesamiento de {len(nits)} NITs...")
    try:
        asyncio.run(run_validation_process(job_id, nits))
        logger.info(f"[JOB {job_id}] Procesamiento completado.")
    except Exception as err:
        tb = traceback.format_exc()
        logger.error(f"[JOB {job_id}] Error en tarea de fondo:\n{tb}")


async def run_validation_process(job_id: str, nits: List[str]):
    total = len(nits)
    success = 0
    failed = 0

    for idx, nit in enumerate(nits):
        logger.info(f"[JOB {job_id}] Procesando NIT {nit} ({idx + 1}/{total})...")
        try:
            result = await scrape_dian_rut(nit)
            insert_validation_result(job_id, result)

            if result.get("check_code") == "DIAN_MUISCA_LIVE":
                success += 1
            else:
                failed += 1

        except Exception as err:
            failed += 1
            tb = traceback.format_exc()
            logger.error(f"[JOB {job_id}] Fallo en NIT {nit}:\n{tb}")

            error_payload = {
                "nit": nit,
                "dv": calculate_dian_dv(nit),
                "company_name": f"ERROR - NIT {nit}",
                "status": "ERROR",
                "economic_activity": "N/A",
                "activity_name": "N/A",
                "address": "N/A",
                "dpto": "N/A",
                "check_code": "SCRAPER_FAIL",
                "notes": str(err)
            }
            insert_validation_result(job_id, error_payload)

        current_status = "PROCESSING" if (idx + 1) < total else "COMPLETED"
        update_job_progress(
            job_id=job_id,
            processed_count=idx + 1,
            success_count=success,
            failed_count=failed,
            status=current_status
        )

        # Pausa entre consultas para no saturar el portal DIAN
        if (idx + 1) < total:
            await asyncio.sleep(random.uniform(2.0, 4.0))


@app.post("/api/upload", status_code=status.HTTP_201_CREATED)
async def upload_xlsx_batch(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Recibe un archivo Excel (.xlsx/.xls) con columna 'nit' o 'NIT'.
    Registra el lote en Supabase y lanza el scraping en segundo plano.
    """
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se aceptan archivos Excel (.xlsx, .xls)"
        )

    try:
        contents = await file.read()
        file_size = len(contents)
        df = pd.read_excel(io.BytesIO(contents))

        # Buscar columna NIT (insensible a mayúsculas)
        columns_lower = [str(c).lower().strip() for c in df.columns]
        nit_col_index = next((i for i, c in enumerate(columns_lower) if "nit" in c), None)

        if nit_col_index is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="El archivo no tiene columna 'nit' o 'NIT'."
            )

        nit_col_name = df.columns[nit_col_index]
        nits_raw = df[nit_col_name].dropna().tolist()
        cleaned_nits = [
            "".join(filter(str.isdigit, str(n)))
            for n in nits_raw
            if "".join(filter(str.isdigit, str(n)))
        ]

        if not cleaned_nits:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No se encontraron NITs numéricos válidos en el archivo."
            )

        job = create_validation_job(
            file_name=file.filename,
            file_size=file_size,
            total_records=len(cleaned_nits)
        )

        if not job or "id" not in job:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo crear el registro del lote en Supabase."
            )

        job_id = job["id"]

        background_tasks.add_task(
            process_validation_sequential,
            job_id=job_id,
            nits=cleaned_nits
        )

        return {
            "success": True,
            "message": f"Archivo recibido. Procesando {len(cleaned_nits)} NITs en segundo plano.",
            "job": {
                "id": job_id,
                "file_name": file.filename,
                "total_records": len(cleaned_nits),
                "status": "PROCESSING"
            }
        }

    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al procesar el archivo: {str(err)}"
        )


@app.get("/api/jobs/{job_id}/progress")
def get_batch_progress(job_id: str):
    try:
        supabase = get_supabase()
        response = supabase.table("validation_jobs").select("*").eq("id", job_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Lote no encontrado.")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))


# Importación necesaria para el delay entre NITs
import random
