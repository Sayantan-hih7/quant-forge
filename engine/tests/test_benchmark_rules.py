import numpy as np
import pandas as pd
import pytest
from quantforge.rules import Observations, validate_rule
from quantforge.replay import ReplayObservations


def minute_rows(day='2025-01-06', count=60, base=100):
    start = pd.Timestamp(day + 'T03:45:00Z')
    return [dict(time=(start + pd.Timedelta(minutes=i)).isoformat(),
                 open=base+i, high=base+i+2, low=base+i-1, close=base+i+1, volume=0 if base==1000 else 100)
            for i in range(count)]


def test_benchmark_is_its_own_index_and_live_matches_replay():
    instrument = {'intraday': minute_rows(), 'benchmarks': {'NIFTY IT': {'intraday': minute_rows(base=1000)}}}
    settings = {'benchmark': 'NIFTY IT'}
    replay = ReplayObservations(instrument, '2025-01-06T05:00:00Z')
    for cutoff in ['2025-01-06T04:05:00Z', '2025-01-06T04:30:00Z']:
        replay.cutoff = pd.Timestamp(cutoff)
        live = Observations(instrument, cutoff)
        for field, period in [('benchmarkClose', None), ('benchmarkEma', 3), ('relativeStrength', 3)]:
            actual = live.values(field, '5m', period, settings=settings).iloc[-1]
            assert replay.values(field, '5m', period, settings=settings).iloc[-1] == pytest.approx(actual)
        assert live.values('benchmarkClose', '5m', settings=settings).iloc[-1] > 1000
        assert live.values('relativeStrength', '5m', 3, settings=settings).iloc[-1] > 0


def test_missing_index_minute_does_not_become_completed_candle():
    reference = minute_rows(base=1000)
    del reference[18]
    instrument = {'intraday': minute_rows(), 'benchmarks': {'NIFTY 50': {'intraday': reference}}}
    live = Observations(instrument, '2025-01-06T04:05:00Z')
    for field, period in [('benchmarkClose', None), ('benchmarkEma', 3), ('relativeStrength', 3)]:
        assert np.isnan(live.values(field, '5m', period).iloc[-1])
    absent = Observations({'intraday': minute_rows()}, '2025-01-06T04:05:00Z')
    assert absent.values('benchmarkClose', '5m').isna().all()


def test_opening_range_waits_for_full_window_resets_and_is_causal():
    rows = minute_rows() + minute_rows('2025-01-07', base=300)
    replay = ReplayObservations({'intraday': rows}, '2025-01-07T05:00:00Z')
    for at in ['2025-01-06T03:59:00Z', '2025-01-06T04:00:00Z', '2025-01-07T03:59:00Z', '2025-01-07T04:05:00Z']:
        replay.cutoff = pd.Timestamp(at)
        live = Observations({'intraday': rows}, at)
        for field in ['openingRangeHigh', 'openingRangeLow']:
            a = live.values(field, '1m', 15).iloc[-1]
            b = replay.values(field, '1m', 15).iloc[-1]
            assert np.isnan(b) if np.isnan(a) else b == pytest.approx(a)
    replay.cutoff = pd.Timestamp('2025-01-06T04:00:00Z')
    assert replay.values('openingRangeHigh', '1m', 15).iloc[-1] == 116
    assert replay.values('openingRangeLow', '1m', 15).iloc[-1] == 99
    del rows[3]
    missing = Observations({'intraday': rows}, '2025-01-06T05:00:00Z')
    assert missing.values('openingRangeHigh', '5m', 15).isna().all()


def test_benchmark_rule_and_sector_setting_validate():
    rule = {'enabled': True, 'cadence': '5m', 'logic': 'AND', 'groups': [{'logic': 'AND', 'conditions': [{
        'left': 'benchmarkClose', 'leftFrame': '5m', 'leftSettings': {'benchmark': 'NIFTY IT'},
        'operator': 'gt', 'rightType': 'indicator', 'right': 'benchmarkEma', 'rightFrame': '5m',
        'rightPeriod': 20, 'rightSettings': {'benchmark': 'NIFTY IT'}}]}]}
    validate_rule(rule)


def test_forming_opening_range_is_waiting_not_data_failure():
    from quantforge.rules import condition
    row = {'left':'close','leftFrame':'1m','operator':'gt','rightType':'indicator',
           'right':'openingRangeHigh','rightFrame':'1m','rightPeriod':15}
    waiting = condition(row, Observations({'intraday':minute_rows()}, '2025-01-06T03:59:00Z'), False)
    assert waiting['matched'] is False
    assert waiting['code'] == 'opening_range_forming'
    incomplete = minute_rows()
    del incomplete[3]
    missing = condition(row, Observations({'intraday':incomplete}, '2025-01-06T04:05:00Z'), False)
    assert missing['matched'] is None
