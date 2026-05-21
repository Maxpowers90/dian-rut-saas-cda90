import io
import os
import logging
import traceback
from typing import List
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd

# Configure top-level logging for the FastAPI application
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("main_api")

# Import our customized helper services
from backend.supabase_client import (
    create_validation_job,
    update_job_progress,
    insert_validation_result,
    get_supabase
)
from backend.scraper import scrape_dian_rut, calculate_dian_dv

# Initialize FastAPI App on PORT 3000 (standard internal port required by dev/containers)
app = FastAPI(
    title="RUT DIAN Validator API MVP",
    description="Motor de automatización liviano para validación de NITs colombianos",
    version="1.0.0"
)

# Configure CORS so any client (or your React client on the sandbox/deployment link) can interact
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    """
    Simpler status probe for deployment checking (Liveness/Readiness).
    """
    try:
        # Check if Supabase variables exist
        _ = get_supabase()
        db_status = "connected"
    except Exception as err:
        db_status = f"error: {str(err)}"
        
    return {
        "status": "online",
        "database": db_status,
        "framework": "FastAPI with Playwright"
    }

async def process_validation_sequential(job_id: str, nits: List[str]):
    """
    FastAPI BackgroundTask worker block.
    Iterates sequentially through the parsed list of NITs, scraping
    values and submitting them step-by-step into Supabase for maximum simplicity.
    """
    total = len(nits)
    success = 0
    failed = 0
    
    for idx, nit in enumerate(nits):
        try:
            logger.info(f"[NIT: {nit}] Starting sequential scrape and database registration (Item {idx + 1}/{total})...")
            # Query DIAN using Playwright
            result = await scrape_dian_rut(nit)
            
            # Save validation row to validation_results
            insert_validation_result(job_id, result)
            
            if result.get("check_code") in ["DIAN_MUISCA_LIVE", "ALGO_FALLBACK_2026"]:
                success += 1
            else:
                failed += 1
                
        except Exception as err:
            failed += 1
            tb_str = traceback.format_exc()
            logger.error(f"[NIT: {nit}] Exception encountered during process_validation_sequential:\n{tb_str}")
            
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
                "notes": f"Real raw exception trace:\n{tb_str}"
            }
            insert_validation_result(job_id, error_payload)
            
        # Update progress in real-time in validation_jobs
        # (This triggers Supabase HTML5 sockets to update the UI on the dashboard!)
        current_processed = idx + 1
        current_status = "PROCESSING" if current_processed < total else "COMPLETED"
        update_job_progress(
            job_id=job_id,
            processed_count=current_processed,
            success_count=success,
            failed_count=failed,
            status=current_status
        )

@app.post("/api/upload", status_code=status.HTTP_201_CREATED)
async def upload_xlsx_batch(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Primary API Endpoint. Receives an Excel (.xlsx or .xls) file containing a column listed 'nit' or 'NIT'.
    Parses the rows using Pandas, registers a PENDING slot inside Supabase, launches
    the background scraper process, and responds instantaneously without blocking.
    """
    # 1. Verification of file format
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error: Solamente se aceptan archivos de tipo Excel (.xlsx, .xls)"
        )
        
    try:
        # Read file into memory stream
        contents = await file.read()
        file_size = len(contents)
        
        # Parse Excel using Pandas with openpyxl engine
        df = pd.read_excel(io.BytesIO(contents))
        
        # Seek the NIT column (case-insensitive checking)
        columns_lower = [str(c).lower().strip() for c in df.columns]
        nit_col_index = None
        
        for idx, col in enumerate(columns_lower):
            if "nit" in col:
                nit_col_index = idx
                break
                
        if nit_col_index is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Error de formato: El archivo subido no contiene ninguna columna titulada 'nit' o 'NIT'."
            )
            
        # Extract, stringify, clean non-digit entries
        nit_col_name = df.columns[nit_col_index]
        nits_raw = df[nit_col_name].dropna().tolist()
        cleaned_nits = []
        for n in nits_raw:
            cleaned = "".join(filter(str.isdigit, str(n)))
            if cleaned:
                cleaned_nits.append(cleaned)
                
        if not cleaned_nits:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No se encontraron NITs numéricos válidos en el archivo."
            )
            
        total_records = len(cleaned_nits)
        
        # 2. Record initial validation job metadata inside Supabase
        # Set status as PROCESSING because the execution starts right away
        job = create_validation_job(
            file_name=file.filename,
            file_size=file_size,
            total_records=total_records
        )
        
        if not job or "id" not in job:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo registrar la auditoría del lote en el servidor de base de datos."
            )
            
        job_id = job["id"]
        
        # 3. Queue the process in an asynchronous FastAPI BackgroundTask
        background_tasks.add_task(
            process_validation_sequential,
            job_id=job_id,
            nits=cleaned_nits
        )
        
        # Return success packet
        return {
            "success": True,
            "message": "Archivo recibido. Iniciando procesamiento en segundo plano.",
            "job": {
                "id": job_id,
                "file_name": file.filename,
                "total_records": total_records,
                "status": "PROCESSING"
            }
        }
        
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo al interpretar el archivo de Excel: {str(err)}"
        )

@app.get("/api/jobs/{job_id}/progress")
def get_batch_progress(job_id: str):
    """
    Ad-hoc status request. Helpful if WebSockets are temporarily blocked:
    fetches the exact progress coordinates on-demand from Supabase.
    """
    try:
        supabase = get_supabase()
        response = supabase.table("validation_jobs").select("*").eq("id", job_id).execute()
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El lote de validación solicitado no fue encontrado."
            )
        return response.data[0]
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(err)
        )
