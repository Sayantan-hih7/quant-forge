import copy
import io
import json
import pytest
from quantforge.backtest import run_backtest
from quantforge.replay import ReplayObservations, decision
from quantforge.signal_ranking import signal_score
from quantforge.backtest_stream import run_stream
from test_backtest import body
from test_backtest_stream import stream_bytes
from test_benchmark_rules import minute_rows


def test_ranked_buy_wins_one_slot_using_signal_not_future_volume():
    request = body()
    request['strategy']['risk'].update(maxPositions=1, signalRanking='turnover')
    other = copy.deepcopy(request['instruments'][0])
    other['id'] = 'NSE:2'
    other['daily'][0]['volume'] = 2000
    other['daily'][1]['volume'] = 1
    request['instruments'].append(other)
    request['config']['ids'].append(other['id'])
    report = run_backtest(request)
    assert report['trades'][0]['instrumentId'] == 'NSE:2'
    scores = [decision(request['strategy'], stock, '2026-09-14T12:00:00Z')['rankingScore'] for stock in request['instruments']]
    assert scores == [100000, 200000]
    request['strategy']['risk'].pop('signalRanking')
    assert run_backtest(request)['trades'][0]['instrumentId'] == 'NSE:1'


def test_relative_volume_needs_twenty_prior_candles_and_no_future():
    rows = minute_rows()
    rows[20]['volume'] = 250
    obs = ReplayObservations({'intraday':rows}, '2025-01-06T04:06:00Z')
    assert signal_score(obs, {'signalRanking':'relativeVolume'}, '1m') == 2.5
    obs = ReplayObservations({'intraday':rows}, '2025-01-06T04:05:00Z')
    assert signal_score(obs, {'signalRanking':'relativeVolume'}, '1m') is None


def test_shared_benchmark_stream_matches_inline_history_and_rejects_bad_reference():
    request = body()
    other = copy.deepcopy(request['instruments'][0])
    other['id'] = 'NSE:2'
    benchmark = {'NIFTY 50': {'daily':copy.deepcopy(other['daily'])}}
    request['instruments'][0]['benchmarks'] = benchmark
    other['benchmarks'] = benchmark
    request['instruments'].append(other)
    request['config']['ids'].append(other['id'])
    c = request['strategy']['entry']['groups'][0]['conditions'][0]
    c.update(left='benchmarkClose', value=50)
    expected = run_stream(io.BytesIO(stream_bytes(request)))
    records = [json.loads(line) for line in stream_bytes(request).splitlines()]
    records[2].pop('benchmarks')
    records[2]['benchmarksRef'] = 'NSE:1'
    encode = lambda: ('\n'.join(json.dumps(r) for r in records)+'\n').encode()
    assert run_stream(io.BytesIO(encode())) == expected
    records[2]['benchmarksRef'] = 'NSE:unknown'
    with pytest.raises(ValueError, match='benchmark history reference'):
        run_stream(io.BytesIO(encode()))
