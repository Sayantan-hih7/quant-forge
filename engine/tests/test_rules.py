import math
import pandas as pd
import pytest
from quantforge.rules import evaluate, validate_rule, rsi, indicator
from quantforge.market import candles, timeframe


def rule(field="close", op="gt", value=100, frame="1d", monthly=False, **extra):
    condition = {"left": field, "leftFrame": frame, "operator": op, "rightType": "value", "value": value, **extra}
    if monthly:
        condition.update(field=field, timeframe="1mo", operand="value")
    return {"logic": "AND", "tier": "monthly" if monthly else "tactical", "groups": [{"logic": "AND", "conditions": [condition]}]}


def day(date, close, volume=100):
    return {"time": f"{date}T03:45:00Z", "open": close, "high": close+1, "low": close-1, "close": close, "volume": volume}


def test_monthly_excludes_current_month():
    stock = {"id": "NSE:1", "daily": [day("2026-08-31", 90), day("2026-09-22", 200)]}
    assert evaluate(rule(monthly=True), stock, "2026-09-23T05:00:00Z")["matched"] is False


def test_monthly_rejects_stale_prices_and_restarts_warmup_after_gaps():
    stale = {"id": "x", "daily": [day("2026-07-31", 200)]}
    assert evaluate(rule(monthly=True), stale, "2026-09-23")["matched"] is None
    dates = ['2026-01-30', '2026-02-27', '2026-03-31', '2026-04-30', '2026-06-30', '2026-07-31', '2026-08-31']
    stock = {"id": "x", "daily": [day(date, 200) for date in dates]}
    assert evaluate(rule('ema5', monthly=True), stock, '2026-09-23')['matched'] is None
    stock['daily'].append(day('2026-05-29', 200))
    assert evaluate(rule('ema5', monthly=True), stock, '2026-09-23')['matched'] is True


def test_missing_and_expired_facts_are_unknown_not_zero():
    query = rule("debtEquity", "lte", 1, monthly=True)
    assert evaluate(query, {"id": "x"}, "2026-09-23")["matched"] is None
    old = {"knownAt": "2026-01-01", "validUntil": "2026-03-01", "values": {"debtEquity": 0}}
    assert evaluate(query, {"id": "x", "facts": [old]}, "2026-09-23")["matched"] is None


def test_current_fundamentals_cannot_enter_historical_test():
    stock = {"id": "x", "facts": [{"knownAt": "2026-09-23", "values": {"marketCap": 5000}}]}
    assert evaluate(rule("marketCap", value=1000), stock, "2026-08-31")["matched"] is None


def test_later_download_of_older_quarter_does_not_replace_newer_report():
    stock = {"id": "x", "facts": [
        {"period": "2026-06-30", "knownAt": "2026-09-01", "values": {"pledge": 1}},
        {"period": "2026-03-31", "knownAt": "2026-09-22", "values": {"pledge": 50}},
    ]}
    assert evaluate(rule("pledge", "lte", 5), stock, "2026-09-23")["matched"] is True


def test_official_turnover_is_required():
    stock = {"id": "x", "daily": [day("2026-08-31", 500, 1000000)]}
    assert evaluate(rule("tradedValue", value=10, monthly=True), stock, "2026-09-23")["matched"] is None


def test_official_value_takes_priority_over_public_fallback_only_while_valid():
    stock = {"id": "x", "facts": [
        {"period": "2026-03-31", "knownAt": "2026-09-01", "priority": 0, "values": {"roe": 20}},
        {"knownAt": "2026-09-20", "validUntil": "2026-09-24", "values": {"roe": 10}},
    ]}
    query = rule("roe", "gte", 15, monthly=True)
    assert evaluate(query, stock, "2026-08-31")["matched"] is None
    assert evaluate(query, stock, "2026-09-19")["matched"] is True
    assert evaluate(query, stock, "2026-09-23")["matched"] is False
    assert evaluate(query, stock, "2026-09-25")["matched"] is True


def test_monthly_disallows_intraday_and_categorical_numeric_comparisons():
    with pytest.raises(ValueError): validate_rule(rule("vwap", monthly=True))
    bad = rule(monthly=True); bad["groups"][0]["conditions"][0]["timeframe"] = "1d"
    with pytest.raises(ValueError): validate_rule(bad)
    with pytest.raises(ValueError): validate_rule(rule("sector", value=1))


def test_indicator_comparison_and_confirmed_crossover():
    stock = {"id": "x", "daily": [day("2026-09-21", 99), day("2026-09-22", 101)]}
    assert evaluate(rule(op="crossAbove"), stock, "2026-09-23")["matched"] is True
    assert evaluate(rule(op="crossAbove"), stock, "2026-09-22T09:00:00Z")["matched"] is None


def test_relative_volume_excludes_current_bar_from_average():
    df = pd.DataFrame({"volume": [100]*20+[300]})
    assert indicator(df, "rvol").iloc[-1] == 3


def test_wilder_rsi_initial_seed_and_flat_series():
    assert rsi(pd.Series(range(20), dtype=float)).iloc[-1] == 100
    assert rsi(pd.Series([10]*20, dtype=float)).iloc[-1] == 50
    assert math.isnan(rsi(pd.Series(range(14), dtype=float)).iloc[-1])


def test_incomplete_five_minute_bucket_does_not_generate_a_signal():
    rows = [{"time": f"2026-09-23T03:{45+i:02}:00Z", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1} for i in [0, 1, 3, 4]]
    df = candles(rows, "2026-09-23T04:00:00Z", "1m")
    assert timeframe(pd.DataFrame(), df, "5m", "2026-09-23T04:00:00Z").empty


def test_known_failing_filter_can_reject_without_missing_indicator():
    query = rule("marketCap", value=1000)
    query["groups"][0]["conditions"].append({"left": "ema20", "leftFrame": "1d", "operator": "gt", "value": 100})
    stock = {"id": "x", "facts": [{"knownAt": "2026-09-20", "values": {"marketCap": 100}}]}
    assert evaluate(query, stock, "2026-09-23")["matched"] is False
