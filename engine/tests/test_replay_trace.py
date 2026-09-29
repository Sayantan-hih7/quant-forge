import copy
from datetime import datetime
from quantforge.backtest import run_backtest
from quantforge.replay_trace import ReplayTrace
from test_backtest import body, risk_body


def test_trace_explains_prior_close_next_open_without_changing_results():
    request = body()
    result = run_backtest(request)
    trace = result.pop('replay')
    request['recordReplay'] = False
    plain = run_backtest(request)
    plain.pop('replay')
    assert result == plain
    assert trace['complete'] and trace['timeframe'] == '1d'
    signal, entry, sell_signal, exit = trace['events']
    assert signal['kind'] == 'signal' and datetime.fromisoformat(signal['at']) == datetime.fromisoformat('2026-09-14T10:00:00+00:00')
    assert signal['candle']['close'] == 100 and signal['checks'][0]['left'] == 100
    assert entry['kind'] == 'entry' and datetime.fromisoformat(entry['at']) == datetime.fromisoformat('2026-09-15T03:45:00+00:00')
    assert entry['phase'] == 'open' and entry['price'] == 110
    assert sell_signal['side'] == 'SELL'
    assert exit['phase'] == 'open' and exit['remainingQuantity'] == 0


def test_trace_partial_targets_and_next_bar_stop():
    request = risk_body()
    request['instruments'][0]['daily'][1].update(high=108, low=99, close=108)
    request['instruments'][0]['daily'][2].update(open=101, high=102, low=99, close=100)
    events = run_backtest(request)['replay']['events']
    partial = next(e for e in events if e['kind'] == 'exit')
    stop = next(e for e in events if e['kind'] == 'stop')
    assert partial['quantity'] == 30 and partial['remainingQuantity'] == 70
    assert partial['phase'] == 'close' and 'T15:30' in partial['at']
    assert stop['previousStop'] == 96 and stop['stop'] == 100
    assert stop['effective'] == 'next-bar'
    assert events[-1]['quantity'] == 70 and events[-1]['price'] == 100


def test_trace_intrabar_limit_waits_until_close_and_does_not_invent_path():
    request = risk_body()
    request['strategy']['risk'].update(entryOrderType='limit', entryLimitPrice=100)
    request['instruments'][0]['daily'][1].update(open=105, high=125, low=99, close=101)
    entry = next(e for e in run_backtest(request)['replay']['events'] if e['kind'] == 'entry')
    assert entry['phase'] == 'close' and 'T15:30' in entry['at']
    assert datetime.fromisoformat(entry['fillAt']) == datetime.fromisoformat('2026-09-15T03:45:00+00:00') and entry['price'] == 100


def test_trace_is_bounded_and_stock_filter_preserves_financials():
    trace = ReplayTrace(limit=1)
    trace.add('entry', 'NSE:1', 'at', 'at', 'open')
    trace.add('exit', 'NSE:1', 'at', 'at', 'close')
    assert not trace.complete and len(trace.events) == 1
    trace = ReplayTrace(byte_limit=1)
    trace.add('entry', 'NSE:1', 'at', 'at', 'open')
    assert not trace.complete and not trace.events
    request = body()
    original = run_backtest(request)
    filtered = copy.deepcopy(request)
    filtered['replayInstrumentId'] = 'NSE:2'
    result = run_backtest(filtered)
    assert not result.pop('replay')['events']
    original.pop('replay')
    assert result == original
