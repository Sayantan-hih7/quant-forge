import os
import asyncio
import json
import time
from threading import Event
from fastapi.responses import StreamingResponse
import secrets
from fastapi import FastAPI, Header, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from tempfile import TemporaryFile
from threading import BoundedSemaphore
from .backtest_stream import run_stream, MAX_BYTES
from pydantic import BaseModel, Field
from .rules import evaluate, validate_rule, TECHNICAL, FACTS
from .replay import decision
from .backtest import run_backtest

app = FastAPI(title="QuantForge calculation engine", version="0.1.0")
backtest_slot = BoundedSemaphore(1)
if os.getenv("NODE_ENV") == "production" and not os.getenv("ENGINE_TOKEN"):
    raise RuntimeError("Production requires ENGINE_TOKEN")


class EvaluationRequest(BaseModel):
    rule: dict
    cutoff: str
    instruments: list[dict] = Field(min_length=1, max_length=100)


def authorize(token):
    expected = os.getenv("ENGINE_TOKEN", "")
    if expected and not secrets.compare_digest(token, expected):
        raise HTTPException(401, "Invalid engine token")


@app.get("/health")
async def health():
    available = backtest_slot.acquire(blocking=False)
    if available:
        backtest_slot.release()
    return {"status": "ok", "service": "python-engine", "execution": "calculations-only", "backtestProgressVersion": 1, "backtestBusy": not available}


@app.get("/capabilities")
def capabilities():
    return {"technical": sorted(TECHNICAL), "datedFacts": sorted(FACTS),
            "notes": {"tradedValue": "Actual monthly turnover from exchange daily reports, in INR crore.",
                      "rvol": "Current completed-bar volume / prior N completed bars' mean; N defaults to 20."}}


@app.post("/evaluate")
def evaluate_batch(body: EvaluationRequest, x_engine_token: str = Header(default="")):
    authorize(x_engine_token)
    try:
        validate_rule(body.rule)
        return {"results": [evaluate(body.rule, instrument, body.cutoff) for instrument in body.instruments]}
    except (ValueError, KeyError) as error:
        raise HTTPException(422, str(error)) from error


@app.post("/validate-rule")
def validate(body: dict, x_engine_token: str = Header(default="")):
    authorize(x_engine_token)
    try:
        monthly = validate_rule(body)
        return {"valid": True, "monthly": monthly}
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(422, str(error)) from error


@app.post("/decisions")
def decisions(body: dict, x_engine_token: str = Header(default="")):
    authorize(x_engine_token)
    try:
        if not 1 <= len(body["instruments"]) <= 100:
            raise ValueError("Decision batches must contain 1–100 instruments")
        return {"results": [decision(body["strategy"], i, body["cutoff"]) for i in body["instruments"]]}
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(422, str(error)) from error


@app.post("/backtest")
def backtest(body: dict, x_engine_token: str = Header(default="")):
    authorize(x_engine_token)
    if not backtest_slot.acquire(blocking=False):
        raise HTTPException(503, "Another portfolio calculation is running. Retry after it completes.")
    try:
        if not 1 <= len(body["instruments"]) <= 200:
            raise ValueError("Backtests support 1–200 selected stocks")
        return run_backtest(body)
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(422, str(error)) from error
    finally:
        backtest_slot.release()


@app.post("/backtest-stream")
async def streamed_backtest(request: Request, x_engine_token: str = Header(default="")):
    authorize(x_engine_token)
    if request.headers.get("content-type", "").split(";")[0] != "application/x-ndjson":
        raise HTTPException(415, "Use the versioned backtest stream format")
    if not backtest_slot.acquire(blocking=False):
        raise HTTPException(503, "Another portfolio calculation is running. Retry after it completes.")
    try:
        handle = TemporaryFile()
    except Exception:
        backtest_slot.release()
        raise
    handed_off = False
    try:
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BYTES:
                raise HTTPException(413, "Backtest history exceeds the safe transfer size")
            await run_in_threadpool(handle.write, chunk)
        handle.seek(0)
        if request.headers.get("accept") != "application/x-ndjson":
            return await run_in_threadpool(run_stream, handle)

        cancelled = Event()
        latest = {"phase": "loading"}
        last_update = 0.0

        def progress(value):
            nonlocal latest, last_update
            if cancelled.is_set():
                raise ValueError("Backtest caller disconnected; calculation cancelled")
            now = time.monotonic()
            if now - last_update >= 1 or value.get("phase") != latest.get("phase"):
                latest = value
                last_update = now

        def calculate():
            try:
                return run_stream(handle, progress)
            finally:
                handle.close()
                backtest_slot.release()

        async def events():
            task = asyncio.create_task(asyncio.to_thread(calculate))
            # Retrieve background exceptions even if the HTTP client disconnects.
            task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
            try:
                while not task.done():
                    yield json.dumps({"type": "progress", **latest}) + "\n"
                    await asyncio.wait({task}, timeout=2)
                try:
                    result = task.result()
                    yield json.dumps({"type": "result", "data": result}, allow_nan=False) + "\n"
                except (ValueError, KeyError, TypeError) as error:
                    yield json.dumps({"type": "error", "code": "ENGINE_VALIDATION", "message": str(error)[:1500]}) + "\n"
                except Exception:
                    import logging
                    logging.getLogger(__name__).exception("Backtest calculation failed")
                    yield json.dumps({"type": "error", "code": "ENGINE_CALCULATION", "message": "Calculation failed inside the engine. Stored history is retained; inspect the engine log for details."}) + "\n"
            finally:
                cancelled.set()

        handed_off = True
        return StreamingResponse(events(), media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no"})
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(422, str(error)) from error
    finally:
        if not handed_off:
            handle.close()
            backtest_slot.release()
