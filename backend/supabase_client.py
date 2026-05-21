import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env if present
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # Use the Service Role Key for server-side write access if RLS is enabled

# Lazy initialization helper
_supabase_client: Client = None

def get_supabase() -> Client:
    """
    Lazy initialization of the Supabase client.
    Ensures the service doesn't crash on startup if credentials aren't set yet.
    """
    global _supabase_client
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError(
                "Missing SUPABASE_URL or SUPABASE_KEY environment variables. "
                "Please configure them in your settings or .env file."
            )
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase_client

def create_validation_job(file_name: str, file_size: int, total_records: int, user_id: str = None) -> dict:
    """
    Inserts a new validation job record with state 'PROCESSING'.
    """
    supabase = get_supabase()
    data = {
        "file_name": file_name,
        "file_size": file_size,
        "total_records": total_records,
        "processed_count": 0,
        "success_count": 0,
        "failed_count": 0,
        "status": "PROCESSING",
        "user_id": user_id  # Optional, links to auth.users if available
    }
    response = supabase.table("validation_jobs").insert(data).execute()
    return response.data[0] if response.data else {}

def update_job_progress(job_id: str, processed_count: int, success_count: int, failed_count: int, status: str = "PROCESSING") -> dict:
    """
    Updates progress attributes in the validation_jobs table.
    """
    supabase = get_supabase()
    update_data = {
        "processed_count": processed_count,
        "success_count": success_count,
        "failed_count": failed_count,
        "status": status
    }
    # If completed, set completed_at timestamp
    if status in ["COMPLETED", "FAILED"]:
        from datetime import datetime, timezone
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
        
    response = supabase.table("validation_jobs").update(update_data).eq("id", job_id).execute()
    return response.data[0] if response.data else {}

def insert_validation_result(job_id: str, result: dict) -> dict:
    """
    Inserts an individual record's validation result into 'validation_results'.
    Matches structural columns from the database schema.
    """
    supabase = get_supabase()
    data = {
        "job_id": job_id,
        "nit": str(result.get("nit", "")),
        "dv": str(result.get("dv", "")),
        "company_name": result.get("company_name", "ERROR / NO DETECTADO"),
        "status": result.get("status", "CANCELADO"),
        "economic_activity": result.get("economic_activity", ""),
        "activity_name": result.get("activity_name", ""),
        "address": result.get("address", ""),
        "dpto": result.get("dpto", ""),
        "check_code": result.get("check_code", "MOCK_GATEWAY_V1"),
        "notes": result.get("notes", "")
    }
    response = supabase.table("validation_results").insert(data).execute()
    return response.data[0] if response.data else {}
