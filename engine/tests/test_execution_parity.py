import copy
from quantforge.backtest import run_backtest
from test_backtest import body


def test_later_entries_use_paper_conservative_equity_while_report_marks_to_market():
    request = body()
    request["strategy"]["exit"]["groups"][0]["conditions"][0]["value"] = 1000
    first = request["instruments"][0]
    for row in first["daily"]:
        row.update(open=100, high=101, low=99, close=100)
    first["daily"][-1].update(open=105, high=106, low=104, close=105)
    second = copy.deepcopy(first)
    second["id"] = "NSE:2"
    second["daily"][0].update(open=10, high=11, low=9, close=10)
    second["daily"][-1].update(open=100, high=101, low=99, close=100)
    request["instruments"].append(second)
    request["config"]["ids"].append(second["id"])
    result = run_backtest(request)
    positions = {p["instrumentId"]: p for p in result["openPositions"]}
    assert positions["NSE:1"]["quantity"] == 100
    # Paper: cash 90,000 + first position at its 90 stop = 99,000 sizing equity.
    assert positions["NSE:2"]["quantity"] == 99
    assert result["equity"] == 100500
    assert result["cash"] == 80100


def test_half_paise_fees_round_up_like_paper_fills():
    request = body()
    request["strategy"]["risk"].update(initialCapital=1000, feePercent=0.005)
    for row in request["instruments"][0]["daily"]:
        row.update(open=100, high=111, low=99, close=100)
    request["instruments"][0]["daily"][1]["close"] = 110
    result = run_backtest(request)
    assert result["trades"][0]["quantity"] == 1
    assert result["totalFees"] == 0.02
    assert result["trades"][0]["pnl"] == -0.02
    assert result["cash"] == 999.98
