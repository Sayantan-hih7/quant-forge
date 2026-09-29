import copy
import pytest
from quantforge.backtest import run_backtest
from quantforge.replay import ReplayObservations, decision
from quantforge.market import stamp


def body():
    def rule(side, value):
        return {"tier":"tactical", "side":side,"cadence":"daily","logic":"AND","groups":[{"logic":"AND","conditions":[{"left":"close","leftFrame":"1d","operator":"gt","rightType":"value","value":value}]}]}
    bars=[]
    for date, price in [("2026-09-14",100),("2026-09-15",110),("2026-09-16",120)]:
        bars.append({"time":date+"T03:45:00Z","open":price,"high":price+1,"low":price-1,"close":price,"volume":1000})
    return {"strategy":{"entry":rule("BUY",50),"exit":rule("SELL",105),"risk":{"initialCapital":100000,"riskPercent":1,"maxPositions":4,"timeframe":"1d","stopMode":"fixed","stopPercent":10,"atrPeriod":14,"atrMultiplier":2,"targetR":10,"overnight":True,"slippagePercent":0,"feePercent":0}},
            "config":{"from":"2026-09-14T00:00:00+05:30","to":"2026-09-17T00:00:00+05:30","universe":"current","ids":["NSE:1"],"includeManual":False},"instruments":[{"id":"NSE:1","daily":bars}],"snapshots":[]}


def test_next_bar_execution_and_no_duplicate_entries():
    result=run_backtest(body())
    assert len(result["trades"])==1
    trade=result["trades"][0]
    assert trade["entry"]==110 and trade["exit"]==120
    assert trade["quantity"]==90
    assert trade["pnl"]==900


def test_stop_wins_over_target_when_order_is_unknown():
    request=body()
    request["strategy"]["risk"]["targetR"]=1
    request["instruments"][0]["daily"][1].update(high=130,low=90)
    trade=run_backtest(request)["trades"][0]
    assert trade["reason"]=="Stop loss" and trade["exit"]==99


def test_history_does_not_use_universe_before_publication():
    request=body();request["config"]["universe"]="historical"
    request["snapshots"]=[{"month":"2026-09","publishedAt":"2026-09-17T00:00:00Z","members":[{"instrumentId":"NSE:1","source":"scan"}]}]
    result=run_backtest(request)
    assert not result["trades"] and not result["openPositions"]


def test_future_price_changes_do_not_change_earlier_indicator():
    request=body(); instrument=request["instruments"][0]
    first=ReplayObservations(instrument,request["config"]["to"])
    changed=copy.deepcopy(instrument);changed["daily"][-1].update(open=900,high=999,low=800,close=950)
    second=ReplayObservations(changed,request["config"]["to"])
    for obs in (first,second):obs.cutoff=stamp("2026-09-15T10:00:00Z")
    assert first.values("close","1d").tolist()==second.values("close","1d").tolist()==[100,110]


def test_missing_history_rejects_report_instead_of_empty_success():
    request=body();request["instruments"][0]["daily"]=[]
    with pytest.raises(ValueError,match="Missing 1d history"):run_backtest(request)


def test_fee_metrics_and_open_equity_reconcile():
    request = body()
    request["strategy"]["risk"]["feePercent"] = 0.1
    result = run_backtest(request)
    assert result["totalFees"] > 0
    assert result["winRate"] == 100
    assert result["unavailableDecisions"] == 0
    assert result["equity"] == pytest.approx(result["initialCapital"] + result["netPnl"])
    assert result["realizedPnl"] == pytest.approx(sum(t["pnl"] for t in result["trades"]))
    assert result["coverage"][0]["bars"] == 3


def test_stale_intraday_preview_does_not_read_later_daily_context():
    request = body()
    strategy = request["strategy"]
    strategy["entry"]["cadence"] = strategy["exit"]["cadence"] = "1m"
    strategy["entry"]["groups"][0]["conditions"][0]["value"] = 105
    instrument = request["instruments"][0]
    # Last minute is on Sep 15 morning, before that day's daily close of 110.
    instrument["intraday"] = [{"time": "2026-09-15T04:00:00Z", "open": 105, "high": 106, "low": 104, "close": 105, "volume": 100}]
    result = decision(strategy, instrument, "2026-09-17T00:00:00Z")
    assert result["barEnd"] == "2026-09-15T04:01:00+00:00"
    assert result["entry"]["matched"] is False
    assert result["entry"]["checks"][0]["left"] == 100


def test_daily_replay_supports_multi_year_research_but_intraday_is_bounded():
    request = body()
    request["config"]["from"] = "2023-01-01T00:00:00Z"
    assert run_backtest(request)["trades"]
    request["strategy"]["entry"]["cadence"] = "5m"
    with pytest.raises(ValueError, match="90 days"):
        run_backtest(request)


def partial_body():
    request = body()
    request["strategy"]["exit"]["groups"][0]["conditions"][0]["value"] = 1000
    request["strategy"]["risk"].update(exitTargets=[{"profitPercent": 2, "closePercent": 50}, {"profitPercent": 4, "closePercent": 50}], breakevenAfterTarget1=True)
    for bar in request["instruments"][0]["daily"]:
        bar.update(open=100, high=101, low=99, close=100)
    return request


def test_partial_targets_reduce_size_and_count_one_closed_position():
    request = partial_body()
    bars = request["instruments"][0]["daily"]
    bars[1].update(high=102, close=102)
    bars[2].update(open=103, low=101, high=105, close=104)
    result = run_backtest(request)
    assert [(t["quantity"], t["remainingQuantity"], t["reason"]) for t in result["trades"]] == [(50, 50, "Target 1"), (50, 0, "Target 2")]
    assert result["cash"] == 100300
    assert result["closedTrades"] == 1 and result["winRate"] == 100
    assert not result["openPositions"]


def test_breakeven_stops_only_the_remainder_on_a_later_bar():
    request = partial_body()
    request["instruments"][0]["daily"][1].update(high=102, close=102)
    result = run_backtest(request)
    assert [t["reason"] for t in result["trades"]] == ["Target 1", "Stop loss"]
    assert result["trades"][1]["exit"] == 100
    assert result["realizedPnl"] == 100
    request["strategy"]["risk"]["breakevenAfterTarget1"] = False
    result = run_backtest(request)
    assert len(result["trades"]) == 1 and result["openPositions"][0]["quantity"] == 50
    assert result["closedTrades"] == 0 and result["winRate"] is None


def test_partial_same_bar_targets_and_stop_precedence():
    request = partial_body()
    request["instruments"][0]["daily"][1].update(high=105, close=104)
    result = run_backtest(request)
    assert [t["reason"] for t in result["trades"]] == ["Target 1", "Target 2"]
    request["instruments"][0]["daily"][1]["low"] = 89
    result = run_backtest(request)
    assert result["trades"][0]["reason"] == "Stop loss" and result["trades"][0]["quantity"] == 100


def test_partial_fees_and_open_cost_reconcile_and_sell_rule_closes_balance():
    request = partial_body()
    request["strategy"]["risk"]["feePercent"] = 0.1
    request["strategy"]["exit"]["groups"][0]["conditions"][0]["value"] = 101
    bars = request["instruments"][0]["daily"]
    bars[1].update(high=102, close=102)
    bars[2].update(open=103, high=104, low=102, close=103)
    result = run_backtest(request)
    assert [t["reason"] for t in result["trades"]] == ["Target 1", "Sell rule"]
    assert result["totalFees"] == pytest.approx(20.25)
    assert result["realizedPnl"] == pytest.approx(229.75)
    assert result["cash"] == pytest.approx(result["initialCapital"] + result["realizedPnl"])


def test_partial_validation_and_whole_share_rounding():
    from quantforge.exit_targets import position_targets
    request = partial_body()
    assert [t["quantity"] for t in position_targets(request["strategy"]["risk"], 10000, 11)] == [5, 6]
    assert position_targets(request["strategy"]["risk"], 10000, 1)[0]["completed"]
    request["strategy"]["risk"]["exitTargets"][1]["closePercent"] = 20
    with pytest.raises(ValueError, match="100%"):
        run_backtest(request)


@pytest.mark.parametrize("basis,values", [("amount", [2, 4]), ("price", [102, 104])])
def test_currency_partial_exits_and_breakeven(basis, values):
    request = partial_body()
    request["strategy"]["risk"]["exitTargets"] = [{"basis": basis, "value": value, "closePercent": 50} for value in values]
    bars = request["instruments"][0]["daily"]
    bars[1].update(high=102, close=102)
    bars[2].update(open=103, low=101, high=105, close=104)
    result = run_backtest(request)
    assert [(t["exit"], t["quantity"], t["remainingQuantity"]) for t in result["trades"]] == [(102, 50, 50), (104, 50, 0)]
    assert result["cash"] == 100300 and result["closedTrades"] == 1
    bars[2].update(open=100, low=99, high=101, close=100)
    result = run_backtest(request)
    assert result["trades"][-1]["reason"] == "Stop loss"
    assert result["trades"][-1]["quantity"] == 50 and result["trades"][-1]["exit"] == 100


def test_exact_target_below_entry_is_reported_without_spending_cash_or_fees():
    request = partial_body()
    request["strategy"]["risk"].update(feePercent=0.1, exitTargets=[{"basis": "price", "value": 100, "closePercent": 50}, {"basis": "price", "value": 104, "closePercent": 50}])
    result = run_backtest(request)
    assert result["invalidTargetEntries"] == 2
    assert result["cash"] == 100000 and result["totalFees"] == 0
    assert not result["trades"] and not result["openPositions"]


def test_target_units_validate_and_currency_gains_follow_filled_entry():
    from quantforge.exit_targets import position_targets, validate_targets, InvalidTargetPriceError
    risk = partial_body()["strategy"]["risk"]
    risk["exitTargets"] = [{"basis": "amount", "value": 10, "closePercent": 50}, {"basis": "amount", "value": 20, "closePercent": 50}]
    validate_targets(risk)
    assert [t["price"] for t in position_targets(risk, 60000, 11)] == [610, 620]
    for change in [{"basis": "price"}, {"value": 10.001}, {"profitPercent": 2}, {"value": None}, {"value": 0}, {"value": 20}]:
        invalid = copy.deepcopy(risk)
        invalid["exitTargets"][0].update(change)
        with pytest.raises(ValueError):
            validate_targets(invalid)
    with pytest.raises(InvalidTargetPriceError):
        position_targets(partial_body()["strategy"]["risk"], 1, 11)


def risk_body():
    request = partial_body()
    request["strategy"]["risk"].update(initialCapital=40000, stopMode="price", stopValue=96, breakevenAfterTarget1=False,
        exitTargets=[{"basis": "risk", "value": r, "closePercent": size} for r, size in [(2, 30), (4, 30), (5, 40)]],
        stopManagement={"breakeven": {"trigger": "risk", "at": 1}, "trailing": {"trigger": "target", "at": 2, "distanceR": 1}})
    return request


def test_risk_targets_match_user_example_and_preserve_original_risk():
    request = risk_body()
    request["config"]["to"] = "2026-09-18T00:00:00+05:30"
    bars = request["instruments"][0]["daily"]
    bars[1].update(high=108, low=99, close=108)
    bars[2].update(open=110, high=116, low=109, close=116)
    bars.append({"time":"2026-09-17T03:45:00Z","open":118,"high":120,"low":117,"close":120,"volume":1000})
    result = run_backtest(request)
    assert [(t["exit"], t["quantity"], t["remainingQuantity"]) for t in result["trades"]] == [(108,30,70),(116,30,40),(120,40,0)]
    assert result["cash"] == 41520 and result["closedTrades"] == 1


def test_one_r_moves_stop_to_entry_before_any_partial_exit():
    request = risk_body()
    bars = request["instruments"][0]["daily"]
    bars[1].update(high=104, low=98, close=103)
    bars[2].update(open=101, high=107, low=99, close=101)
    result = run_backtest(request)
    assert [(t["reason"], t["quantity"], t["exit"]) for t in result["trades"]] == [("Stop loss",100,100)]


def test_r_trailing_does_not_use_a_later_high_to_stop_out_earlier_in_same_bar():
    request = risk_body()
    request["strategy"]["risk"]["stopManagement"]={"trailing":{"trigger":"risk","at":1,"distanceR":1}}
    bars = request["instruments"][0]["daily"]
    bars[1].update(high=106, low=99, close=105)
    bars[2].update(open=105, high=110, low=101, close=105)
    result = run_backtest(request)
    assert result["trades"][0]["exit"] == 102 and result["trades"][0]["quantity"] == 100


def test_limit_waits_then_uses_better_fill_for_initial_risk():
    request = risk_body()
    request["strategy"]["risk"].update(entryOrderType="limit",entryLimitPrice=100)
    bars = request["instruments"][0]["daily"]
    bars[1].update(open=105, high=110, low=101, close=106)
    bars[2].update(open=99, high=101, low=98, close=100)
    result = run_backtest(request)
    assert result["unfilledLimitEntries"] == 1
    held = result["openPositions"][0]
    assert held["entry"] == 9900 and held["initialRiskPaise"] == 300
    assert [t["price"] for t in held["targets"]] == [105,111,114]


def test_intrabar_limit_does_not_retroactively_claim_targets_or_trailing_from_earlier_high():
    request = risk_body()
    request["strategy"]["risk"].update(entryOrderType="limit",entryLimitPrice=100,slippagePercent=1)
    request["instruments"][0]["daily"][1].update(open=105,high=125,low=99,close=101)
    result = run_backtest(request)
    assert not result["trades"]
    held = result["openPositions"][0]
    assert held["entry"] == 10000 and held["stop"] == 96
    assert not held.get("breakevenActivated") and not held.get("trailingActivated")
    request["instruments"][0]["daily"][1]["low"]=95
    stopped = run_backtest(request)["trades"][0]
    assert stopped["reason"] == "Stop loss" and stopped["exit"] == pytest.approx(95.04)


def test_stop_settings_reject_unusable_target_triggers():
    request=risk_body()
    request["strategy"]["risk"]["stopManagement"]["trailing"]["at"]=3
    with pytest.raises(ValueError,match="before the final exit"):
        run_backtest(request)


def test_backtest_identifies_missing_turnover_instead_of_suggesting_no_setups():
    request = body()
    condition = request['strategy']['entry']['groups'][0]['conditions'][0]
    condition.update(left='dailyTurnover', leftFrame='1d', operator='gt', rightType='value', value=20)
    result = run_backtest(request)
    assert not result['trades']
    assert result['unavailableDecisions'] > 0
    assert result['unavailableInputs'][0]['field'] == 'dailyTurnover'
    assert 'downloaded later' in result['unavailableInputs'][0]['reason']


def test_backtest_names_missing_comparison_indicator_in_report():
    request = body()
    request['strategy']['entry']['groups'][0]['conditions'][0].update(
        rightType='indicator', right='ema', rightFrame='1d', rightPeriod=200)
    result = run_backtest(request)
    assert not result['trades']
    assert result['unavailableInputs'][0]['field'] == 'ema'
    assert '200 candles' in result['unavailableInputs'][0]['reason']


def test_backtest_accepts_entire_159_stock_qualified_list(monkeypatch):
    from quantforge.app import backtest
    monkeypatch.setenv("ENGINE_TOKEN", "test")
    request = body()
    original = request["instruments"][0]
    request["instruments"] = [{**copy.deepcopy(original), "id": f"NSE:{n}"} for n in range(1, 160)]
    request["config"]["ids"] = [i["id"] for i in request["instruments"]]
    report = backtest(request, "test")
    assert len(report["coverage"]) == 159
    assert len(report["openPositions"]) <= request["strategy"]["risk"]["maxPositions"]
