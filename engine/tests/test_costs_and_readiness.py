from quantforge.trading_costs import trade_fee, affordable_shares
from quantforge.performance_metrics import performance_metrics
from quantforge.market import stamp
from quantforge.backtest import run_backtest
from test_backtest import body


def test_indian_cash_fee_reference_cases_and_cash_ceiling():
    risk = dict(costModel='indian-cash', overnight=False, feePercent=0)
    assert trade_fee(3000000, 'BUY', risk) == 1274
    assert trade_fee(3000000, 'SELL', risk) == 1974
    risk['overnight'] = True
    assert trade_fee(3000000, 'BUY', risk) == 3612
    assert trade_fee(3000000, 'SELL', risk) == 4587
    q = affordable_shares(3000000, 10000, risk)
    assert q * 10000 + trade_fee(q * 10000, 'BUY', risk) <= 3000000
    assert (q+1) * 10000 + trade_fee((q+1) * 10000, 'BUY', risk) > 3000000


def test_monthly_returns_expectancy_and_short_sample_ratios():
    curve = [dict(at='2026-01-30T10:00:00Z', equity=110000), dict(at='2026-02-02T10:00:00Z', equity=99000)]
    m = performance_metrics(curve, 100000, [1000, -500], stamp('2026-01-01'), stamp('2026-03-01'))
    assert m['expectancy'] == 250
    assert round(m['monthlyReturns'][0]['returnPercent'], 6) == 10
    assert round(m['monthlyReturns'][1]['returnPercent'], 6) == -10
    assert m['sharpe'] is None and m['sortino'] is None and m['cagrPercent'] is None


def test_initial_indicator_warmup_is_separate_from_missing_decisions():
    request = body()
    c = request['strategy']['entry']['groups'][0]['conditions'][0]
    c.update(left='rsi', leftPeriod=2, operator='gte', value=0)
    request['strategy']['exit'].update(enabled=False, groups=[])
    result = run_backtest(request)
    assert result['warmupDecisions'] > 0
    assert result['unreadyInstruments'] == []
    assert result['warmup'][0]['firstReadyAt'] is not None
