"""
supabase_client.py
Thin wrapper around the supabase-py client.

Expected environment variables:
  SUPABASE_URL  – project URL  (e.g. https://xxxx.supabase.co)
  SUPABASE_KEY  – service-role or anon key
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Singleton client
# ---------------------------------------------------------------------------

_client: Optional[Client] = None


def get_supabase() -> Client:
    """
    Return a cached Supabase client instance.
    Raises RuntimeError if the required environment variables are missing.
    """
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_KEY", "").strip()

        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY environment variables must be set."
            )

        _client = create_client(url, key)

    return _client


# ---------------------------------------------------------------------------
# Job management helpers
# ---------------------------------------------------------------------------


def create_validation_job(
    file_name: str,
    file_size: int,
    total_records: int,
) -> Dict[str, Any]:
    """
    Insert a new row into the `validation_jobs` table with status PROCESSING
    and return the created record (including its generated `id`).
    """
    supabase = get_supabase()

    payload = {
        "file_name": file_name,
        "file_size": file_size,
        "total_records": total_records,
        "processed_count": 0,
        "success_count": 0,
        "failed_count": 0,
        "status": "PROCESSING",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    response = supabase.table("validation_jobs").insert(payload).execute()

    if not response.data:
        raise RuntimeError(
            f"Failed to create validation job in Supabase: {response}"
        )

    return response.data[0]


def update_job_progress(
    job_id: str,
    processed_count: int,
    success_count: int,
    failed_count: int,
    status: str = "PROCESSING",
) -> None:
    """
    Update progress counters and status for an existing validation job.
    """
    supabase = get_supabase()

    payload = {
        "processed_count": processed_count,
        "success_count": success_count,
        "failed_count": failed_count,
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    supabase.table("validation_jobs").update(payload).eq("id", job_id).execute()


# ---------------------------------------------------------------------------
# Result helpers
# ---------------------------------------------------------------------------


def insert_validation_result(
    job_id: str,
    result: Dict[str, Any],
) -> None:
    """
    Insert a single NIT validation result into the `validation_results` table.

    Expected keys in `result` (all optional except `nit`):
      nit, dv, company_name, status, check_code, notes, raw_data
    """
    supabase = get_supabase()

    payload = {
        "job_id": job_id,
        "nit": result.get("nit", ""),
        "dv": result.get("dv", ""),
        "company_name": result.get("company_name", ""),
        "status": result.get("status", "UNKNOWN"),
        "check_code": result.get("check_code", ""),
        "notes": result.get("notes", ""),
        "raw_data": result.get("raw_data", {}),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    supabase.table("validation_results").insert(payload).execute()
