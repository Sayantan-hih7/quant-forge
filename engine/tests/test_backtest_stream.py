import io
import json
import copy
import pytest
from fastapi.testclient import TestClient
from quantforge.app import app, backtest_slot
from quantforge.backtest import run_backtest
from quantforge.backtest_stream import run_stream
from quantforge.replay import ReplayObservations
from quantforge.market import stamp
from test_backtest import body


def stream_bytes(request):
    records = [{"format": "quantforge-backtest-v1", "readinessVersion": 1 if request["config"].get("dataPolicy") else None, **{key: value for key, value in request.items() if key != "instruments"}}]
    total = 0
    for original in request["instruments"]:
        stock = copy.deepcopy(original)
        for frame in ("daily", "intraday"):
            rows = stock.get(frame, [])
            total += len(rows)
            stock[frame] = [[row[key] for key in ("time", "open", "high", "low", "close", "volume")] for row in rows]
        stock["candleEncoding"] = "ohlcv-v1"
        records.append(stock)
    records.append({"end": True, "instruments": len(request["instruments"]), "candles": total})
    return ("\n".join(json.dumps(record) for record in records) + "\n").encode()


def test_stream_preserves_shared_capital_position_limits_and_exact_fills():
    request = body()
    request["strategy"]["risk"]["maxPositions"] = 1
    other = copy.deepcopy(request["instruments"][0])
    other["id"] = "NSE:2"
    request["instruments"].append(other)
    request["config"]["ids"].append(other["id"])
    expected = run_backtest(request)
    result = run_stream(io.BytesIO(stream_bytes(request)))
    assert result.pop("inputCandles") == 6
    assert result.pop("engineVersion") == "portfolio-stream-v7"
    assert result == expected
    assert {trade["instrumentId"] for trade in result["trades"]} == {"NSE:1"}


@pytest.mark.parametrize("problem", ["truncated", "missing", "duplicate", "wrong-count", "trailing", "bad-candle"])
def test_incomplete_or_mismatched_stream_never_produces_partial_portfolio(problem):
    lines = stream_bytes(body()).decode().splitlines()
    if problem == "truncated":
        lines.pop()
    elif problem == "missing":
        lines.pop(1)
    elif problem == "duplicate":
        lines.insert(2, lines[1])
    elif problem == "wrong-count":
        lines[-1] = json.dumps({"end": True, "instruments": 1, "candles": 999})
    elif problem == "trailing":
        lines.append("{}")
    elif problem == "bad-candle":
        stock = json.loads(lines[1])
        stock["daily"][0][2] = 1  # High below open/close.
        lines[1] = json.dumps(stock)
    with pytest.raises(ValueError):
        run_stream(io.BytesIO(("\n".join(lines) + "\n").encode()))


def test_stream_auth_validation_and_slot_cleanup(monkeypatch):
    monkeypatch.setenv("ENGINE_TOKEN", "isolated-test")
    client = TestClient(app)
    data = stream_bytes(body())
    headers = {"Content-Type": "application/x-ndjson", "X-Engine-Token": "isolated-test"}
    assert client.post("/backtest-stream", content=data).status_code == 401
    assert client.post("/backtest-stream", content=b"bad", headers=headers).status_code == 422
    assert client.post("/backtest-stream", content=data, headers=headers).status_code == 200
    assert backtest_slot.acquire(blocking=False)
    try:
        assert client.post("/backtest-stream", content=data, headers=headers).status_code == 503
    finally:
        backtest_slot.release()
    assert client.post("/backtest-stream", content=data, headers=headers).status_code == 200


def test_indexed_history_slicing_never_reads_future_or_shifted_values():
    request = body()
    stock = request["instruments"][0]
    data = ReplayObservations(stock, request["config"]["to"])
    for cutoff, expected in [("2026-09-14T09:59:59Z", []), ("2026-09-14T10:00:00Z", [100]),
                              ("2026-09-15T10:00:00Z", [100, 110]), ("2026-09-14T10:00:00Z", [100])]:
        data.cutoff = stamp(cutoff)
        assert data.values("close", "1d").tolist() == expected
        assert len(data.completed_bars("1d")) == len(expected)
    data.cutoff = stamp("2026-09-15T10:00:00Z")
    assert data.values("close", "1d", offset=1).iloc[-1] == 100
