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
