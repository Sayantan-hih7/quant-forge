import os
import secrets
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from .rules import evaluate, validate_rule, TECHNICAL, FACTS
from .replay import decision
from .backtest import run_backtest

app = FastAPI(title="QuantForge calculation engine", version="0.1.0")


class EvaluationRequest(BaseModel):
    rule: dict
    cutoff: str
    instruments: list[dict] = Field(min_length=1, max_length=100)


def authorize(token):
    expected = os.getenv("ENGINE_TOKEN", "")
    if expected and not secrets.compare_digest(token, expected):
        raise HTTPException(401, "Invalid engine token")


@app.get("/health")
def health():
    return {"status": "ok", "service": "python-engine", "execution": "calculations-only"}


@app.get("/capabilities")
def capabilities():
    return {"technical": sorted(TECHNICAL), "datedFacts": sorted(FACTS),
            "notes": {"tradedValue": "Actual monthly turnover from exchange daily reports, in INR crore.",
                      "rvol": "Current completed-bar volume / prior 20 completed bars' mean."}}


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
    try:
        if not 1 <= len(body["instruments"]) <= 100:
            raise ValueError("Backtests support 1–100 selected stocks")
        return run_backtest(body)
    except (ValueError, KeyError, TypeError) as error:
        raise HTTPException(422, str(error)) from error
