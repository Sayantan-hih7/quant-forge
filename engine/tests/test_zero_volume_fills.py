from quantforge.backtest import run_backtest
from test_backtest import body


def test_zero_volume_day_cannot_fill_pending_entry():
    request = body()
    request["instruments"][0]["daily"][1]["volume"] = 0
    result = run_backtest(request)
    assert not result["trades"]
    assert all(p["entryAt"].startswith("2026-09-16") for p in result["openPositions"])
    assert result["zeroVolumeBars"] == 1


def test_zero_volume_day_cannot_exit_or_trigger_stop():
    request = body()
    request["instruments"][0]["daily"][2].update(volume=0, low=1, high=1000)
    result = run_backtest(request)
    assert not result["trades"]
    assert len(result["openPositions"]) == 1
    assert result["openPositions"][0]["stop"] == 99


def test_all_zero_volume_candles_never_create_a_position():
    request = body()
    for row in request["instruments"][0]["daily"]:
        row["volume"] = 0
    result = run_backtest(request)
    assert result["equity"] == result["initialCapital"]
    assert not result["trades"] and not result["openPositions"]



def minute_request(bars):
    request = body()
    request["config"]["from"] = "2026-09-15T00:00:00+05:30"
    request["config"]["to"] = "2026-09-17T00:00:00+05:30"
    request["strategy"]["entry"]["cadence"] = "1m"
    request["strategy"]["entry"]["groups"][0]["conditions"][0]["leftFrame"] = "1m"
    request["strategy"]["exit"]["enabled"] = False
    request["strategy"]["risk"]["timeframe"] = "1m"
    request["instruments"][0]["intraday"] = [
        dict(time=at, open=price, high=max(price, close)+1, low=min(price, close)-1, close=close, volume=volume)
        for at, price, close, volume in bars
    ]
    return request


def test_market_signal_expires_before_a_later_traded_candle():
    request = minute_request([
        ("2026-09-15T03:45:00Z", 100, 100, 100),
        ("2026-09-15T03:46:00Z", 100, 10, 0),
        ("2026-09-15T03:47:00Z", 10, 10, 100),
    ])
    result = run_backtest(request)
    assert not result["trades"] and not result["openPositions"]
    assert result["expiredSignalOrders"] == 1


def test_day_limit_does_not_leak_into_next_session_without_trades():
    request = minute_request([
        ("2026-09-15T03:45:00Z", 100, 100, 100),
        ("2026-09-15T09:59:00Z", 100, 10, 0),
        ("2026-09-16T03:45:00Z", 90, 10, 100),
    ])
    request["strategy"]["risk"].update(entryOrderType="limit", entryLimitPrice=95)
    result = run_backtest(request)
    assert not result["trades"] and not result["openPositions"]
    assert result["expiredSignalOrders"] == 1


def test_intraday_cutoff_blocks_new_pending_entries_but_keeps_legacy_cutoff():
    bars = []
    for minute in range(0, 20):
        bars.append((f'2026-09-15T09:{30+minute:02d}:00Z',100,100,1000))
    request = minute_request(bars)
    request['strategy']['risk']['overnight'] = False
    request['strategy']['risk']['entryCutoffMinute'] = 900
    result = run_backtest(request)
    assert not result['trades'] and not result['openPositions']
    del request['strategy']['risk']['entryCutoffMinute']
    legacy = run_backtest(request)
    assert legacy['trades'] or legacy['openPositions']
