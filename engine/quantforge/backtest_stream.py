"""Bounded NDJSON ingestion. No stock is omitted and all share one portfolio."""
import json
from .backtest import run_backtest
from .replay import ReplayObservations
from .readiness import assess_scope

MAX_BYTES = 1024 * 1024 * 1024
MAX_LINE_BYTES = 64 * 1024 * 1024
MAX_CANDLES = 8_000_000


def run_stream(handle):
    def record():
        line = handle.readline(MAX_LINE_BYTES + 1)
        if len(line) > MAX_LINE_BYTES:
            raise ValueError("One stock exceeds the backtest transfer limit; reduce indicator warm-up")
        if not line:
            raise ValueError("Incomplete backtest upload; no partial portfolio was calculated")
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError("Invalid backtest stream record")
        return value

    body = record()
    if body.get("format") != "quantforge-backtest-v1":
        raise ValueError("Unsupported backtest stream format")
    ids = body["config"]["ids"]
    if not isinstance(ids, list) or not 1 <= len(ids) <= 200 or not all(isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
        raise ValueError("Backtests require 1-200 distinct stocks")
    prepared, total = {}, 0
    for ident in ids:
        stock = record()
        if stock.get("id") != ident or stock.get("candleEncoding") != "ohlcv-v1":
            raise ValueError("Backtest stock history is missing, duplicated or out of order")
        total += len(stock.get("daily", [])) + len(stock.get("intraday", []))
        if total > MAX_CANDLES:
            raise ValueError("Backtest exceeds 8 million candles including indicator warm-up")
        prepared[ident] = ReplayObservations(stock, body["config"]["to"])
        # Release the decoded JSON before loading the next stock.
        del stock
    end = record()
    if end != {"end": True, "instruments": len(ids), "candles": total} or handle.read(1):
        raise ValueError("Incomplete or inconsistent backtest upload")
    audit = assess_scope(body, prepared) if body.get('readinessVersion') == 1 and body['config'].get('dataPolicy') else None
    if audit and body['config']['dataPolicy'] == 'ready':
        if not audit['includedIds']:
            return {'noEligibleStocks': True, 'selectionAudit': audit}
        body = {**body, 'config': {**body['config'], 'ids': audit['includedIds']}}
        prepared = {ident: prepared[ident] for ident in audit['includedIds']}
    result = run_backtest(body, prepared=prepared)
    if audit:
        result['selectionAudit'] = audit
    result["inputCandles"] = total
    result["engineVersion"] = "portfolio-stream-v7"
    return result
