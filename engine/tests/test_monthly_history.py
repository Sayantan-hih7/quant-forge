import pandas as pd
import pytest
from quantforge.rules import evaluate, Observations
from quantforge.market import candles, timeframe


def query(field='ema21', **extra):
    return {'timeframe': '1mo', 'logic': 'AND', 'groups': [{'logic': 'AND', 'conditions': [
        {'field': field, 'operator': 'gt', 'operand': 'value', 'value': 50, 'timeframe': '1mo', **extra},
    ]}]}


def stock(months):
    return {'id': 'IPO', 'monthlyHistoryChecked': True, 'daily': [
        {'time': t.isoformat(), 'open': 100, 'high': 110, 'low': 90, 'close': 100, 'volume': 1000}
        for t in pd.date_range(end='2026-08-31', periods=months, freq='ME', tz='UTC')
    ]}


def test_ipo_waits_for_actual_indicator_minimum_not_preferred_warmup():
    result = evaluate(query(), stock(8), '2026-09-25')
    assert result['status'] == 'awaiting_history'
    assert result['matched'] is None
    assert result['checks'][0]['availableMonths'] == 8
    assert result['checks'][0]['requiredMonths'] == 21
    assert evaluate(query(), stock(21), '2026-09-25')['status'] == 'qualified'


def test_zero_months_and_failed_download_are_distinct():
    assert evaluate(query(), stock(0), '2026-09-25')['status'] == 'awaiting_history'
    assert evaluate(query(), {'id': 'unknown'}, '2026-09-25')['status'] == 'unavailable'


def test_forming_month_cannot_complete_ipo_history():
    instrument = stock(20)
    instrument['daily'].append({**instrument['daily'][-1], 'time': '2026-09-24T03:45:00Z'})
    result = evaluate(query(), instrument, '2026-09-25')
    assert result['status'] == 'awaiting_history'
    assert result['checks'][0]['availableMonths'] == 20


def test_both_operands_and_crossover_lookback_determine_required_history():
    result = evaluate(query('ema5', operand='field', compareField='ema21', operator='crossAbove', lookback=6), stock(21), '2026-09-25')
    assert result['status'] == 'awaiting_history'
    assert result['checks'][0]['requiredMonths'] == 27
    assert result['checks'][0]['historyField'] == 'ema21'


def test_fundamentals_only_and_or_branch_can_qualify_a_new_listing():
    instrument = stock(0)
    instrument['facts'] = [{'knownAt': '2026-09-20', 'values': {'marketCap': 5000}}]
    fact_rule = query('marketCap', value=3000)
    assert evaluate(fact_rule, instrument, '2026-09-25')['status'] == 'qualified'
    both = query()
    both['groups'][0]['conditions'] += fact_rule['groups'][0]['conditions']
    both['groups'][0]['logic'] = 'OR'
    assert evaluate(both, instrument, '2026-09-25')['status'] == 'qualified'
    both['groups'][0]['logic'] = 'AND'
    assert evaluate(both, instrument, '2026-09-25')['status'] == 'awaiting_history'
    instrument['facts'][0]['values']['marketCap'] = 100
    assert evaluate(both, instrument, '2026-09-25')['status'] == 'rejected'
    instrument['facts'] = []
    assert evaluate(both, instrument, '2026-09-25')['status'] == 'unavailable'


def test_stale_prices_or_missing_months_do_not_claim_to_be_a_new_listing():
    instrument = stock(21)
    instrument['daily'].pop()
    result = evaluate(query(), instrument, '2026-09-25')
    assert result['status'] == 'unavailable'
    assert result['checks'][0]['code'] == 'stale_history'
    instrument = stock(21)
    instrument['daily'].pop(15)
    result = evaluate(query(), instrument, '2026-09-25')
    assert result['status'] == 'unavailable'
    assert result['checks'][0]['code'] == 'history_gap'


def test_shared_monthly_aggregation_is_scoped_to_stock_and_cutoff():
    data = Observations(stock(21), '2026-09-25')
    data.values('ema5', '1mo')
    bars = data.bars('1mo')
    data.values('ema21', '1mo')
    assert data.bars('1mo') is bars
    earlier = Observations(stock(21), '2026-08-25')
    assert len(earlier.bars('1mo')) == 20
    assert len(data.bars('1mo')) == 21


def test_vectorized_candles_preserve_validation_and_session_buckets():
    row = stock(1)['daily'][0]
    assert len(candles([row, row], '2026-09-01')) == 1
    with pytest.raises(ValueError, match='Conflicting duplicate'):
        candles([row, {**row, 'close': 101}], '2026-09-01')
    with pytest.raises(ValueError, match='Non-finite'):
        candles([{**row, 'volume': float('nan')}], '2026-09-01')
    with pytest.raises(ValueError, match='Invalid OHLCV'):
        candles([{**row, 'high': 80}], '2026-09-01')
    minute_rows = [{**row, 'time': t.isoformat(), 'volume': 1} for t in pd.date_range('2026-09-24T03:45Z', periods=375, freq='min')]
    minutes = candles(minute_rows, '2026-09-24T10:00Z', '1m')
    hourly = timeframe(pd.DataFrame(), minutes, '1h', '2026-09-24T10:00Z')
    assert hourly.volume.tolist() == [60] * 6 + [15]
    assert timeframe(pd.DataFrame(), minutes, '5m', '2026-09-24T03:49Z').empty
