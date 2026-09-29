import math
import pandas as pd
import pytest
from quantforge.rules import Observations, indicator, validate_rule, evaluate
from quantforge.replay import ReplayObservations
from quantforge.market import stamp


def rows(count=50, start='2026-07-01'):
    return [dict(time=t.isoformat(), open=100+i, close=102+i, high=104+i, low=99+i, volume=100+i)
            for i, t in enumerate(pd.date_range(start + ' 03:45', periods=count, freq='D', tz='UTC'))]


def query(field, **kwargs):
    return dict(logic='AND', groups=[dict(logic='AND', conditions=[dict(left=field, leftFrame='1d', operator='gte', value=0, rightType='value', **kwargs)])])


def test_configurable_averages_and_volume_windows():
    df = pd.DataFrame(rows())
    assert indicator(df, 'ema', 9).iloc[-1] == indicator(df, 'ema9').iloc[-1]
    assert indicator(df, 'sma', 8).iloc[-1] == df.close.iloc[-8:].mean()
    assert indicator(df, 'avgVolume', 3).iloc[-1] == df.volume.iloc[-4:-1].mean()
    assert indicator(df, 'rvol', 3).iloc[-1] == df.volume.iloc[-1] / df.volume.iloc[-4:-1].mean()
    assert math.isnan(indicator(df.iloc[:6], 'rsi', 6).iloc[-1])
    assert indicator(df.iloc[:7], 'rsi', 6).iloc[-1] == 100


def test_body_relative_to_ema_means_body_not_wicks_and_handles_doji():
    df = pd.DataFrame(dict(open=[100, 90, 110], close=[100, 110, 110], high=[120]*3, low=[80]*3))
    # EMA2 at second bar is 106 2/3; body from 90 to 110 has 16 2/3% above it.
    assert indicator(df, 'bodyAboveEma', 2).iloc[1] == pytest.approx(100/6)
    assert indicator(df, 'bodyBelowEma', 2).iloc[1] == pytest.approx(500/6)
    assert indicator(df, 'bodyPercent').iloc[1] == 50
    assert math.isnan(indicator(df, 'bodyAboveEma', 2).iloc[-1])
    assert indicator(df, 'bodyPercent').iloc[-1] == 0


def test_previous_rolling_high_and_completed_offsets_match_live_and_replay():
    stock = dict(id='fixture', daily=rows())
    end = '2026-08-25'
    live = Observations(stock, '2026-08-10T11:00:00Z')
    replay = ReplayObservations(stock, end)
    replay.cutoff = stamp('2026-08-10T11:00:00Z')
    for field, period, offset in [('ema', 9, 2), ('highestHigh', 20, 1), ('bodyAboveEma', 21, 0)]:
        assert replay.values(field, '1d', period, offset).iloc[-1] == pytest.approx(live.values(field, '1d', period, offset).iloc[-1])
    assert live.values('highestHigh', '1d', 20, 1).iloc[-1] == 143
    assert live.values('close', '1d', offset=1).iloc[-1] == 141


def test_real_52_week_window_and_ipo_minimum():
    history = rows(400, '2025-01-01')
    history[0]['high'] = 9000  # Old peak outside 52 weeks must disappear.
    data = Observations(dict(id='x', daily=history), '2026-03-01')
    assert data.values('high52w', '1d').iloc[-1] == 503
    assert math.isnan(data.values('high52w', '1d').iloc[363])
    assert Observations(dict(id='x', daily=history), '2026-02-01').values('high52w', '1mo').iloc[-1] == 499
    assert evaluate(query('high52w'), dict(id='ipo', daily=rows(50)), '2026-09-01')['matched'] is None


def test_actual_turnover_requires_each_report_and_preserves_publication_cutoff():
    history = rows(3)
    reports = [dict(date=f'2026-07-0{i+1}', turnoverCr=10*(i+1), knownAt=f'2026-07-0{i+1}T12:00:00Z') for i in range(3)]
    stock = dict(id='x', daily=history, reports=reports)
    data = Observations(stock, '2026-07-04')
    assert data.values('dailyTurnover', '1d').iloc[-1] == 30
    assert data.values('avgDailyTurnover', '1d', 2).iloc[-1] == 25
    assert data.values('dailyTurnover', '1d', offset=1).iloc[-1] == 20
    # Closing candle is available at 15:30 IST, but its report isn't published yet.
    replay = ReplayObservations(stock, '2026-07-04')
    replay.cutoff = stamp('2026-07-03T10:05:00Z')
    assert math.isnan(replay.values('dailyTurnover', '1d').iloc[-1])
    assert math.isnan(replay.values('avgDailyTurnover', '1d', 2).iloc[-1])
    stock['reports'] = reports[:-1]
    assert math.isnan(Observations(stock, '2026-07-04').values('dailyTurnover', '1d').iloc[-1])
    # Do not derive real turnover from close * volume.
    assert evaluate(query('dailyTurnover'), stock, '2026-07-04')['matched'] is None


@pytest.mark.parametrize('field,changes', [
    ('ema', dict(leftPeriod=1)), ('ema', dict(leftPeriod=501)), ('ema', dict(leftPeriod=2.5)),
    ('close', dict(leftPeriod=20)), ('close', dict(leftOffset=-1)), ('close', dict(leftOffset=121)),
    ('dailyTurnover', dict(leftFrame='5m')), ('highestHigh', dict(leftPeriod=True)),
])
def test_invalid_parameters_are_rejected(field, changes):
    rule = query(field); rule['groups'][0]['conditions'][0].update(changes)
    with pytest.raises(ValueError): validate_rule(rule)


def test_monthly_stays_monthly_and_missing_warmup_has_an_explanation():
    rule = query('dailyTurnover'); rule['timeframe'] = '1mo'
    rule['groups'][0]['conditions'][0].update(field='dailyTurnover', timeframe='1mo')
    with pytest.raises(ValueError, match='not a monthly'): validate_rule(rule)
    rule['groups'][0]['conditions'][0].update(field='ema', period=21, offset=1)
    result = evaluate(rule, dict(id='ipo', daily=rows(50)), '2026-09-01')
    assert result['matched'] is None
    assert result['checks'][0]['requiredMonths'] == 22


def test_missing_comparison_identifies_its_indicator_period_and_offset():
    rule = query('close')
    c = rule['groups'][0]['conditions'][0]
    c.update(rightType='indicator', right='ema', rightFrame='1d', rightPeriod=200, rightOffset=2)
    result = evaluate(rule, dict(id='x', daily=rows(30)), '2026-09-01')
    check = result['checks'][0]
    assert result['matched'] is None
    assert check['field'] == 'close'  # Keep the original condition identity.
    assert check['missingField'] == 'ema'
    assert '200 candles' in check['reason'] and '2 completed candles earlier' in check['reason']
    assert 'Missing/insufficient Close' not in check['reason']
    c.update(rightPeriod=2, rightOffset=0)
    empty = evaluate(rule, dict(id='x'), '2026-09-01')['checks'][0]
    assert empty['missingField'] == 'close'


def test_missing_comparison_lookback_and_exchange_report_are_specific():
    rule = query('close')
    c = rule['groups'][0]['conditions'][0]
    c.update(operator='crossAbove', rightType='indicator', right='ema', rightFrame='1d', rightPeriod=30)
    check = evaluate(rule, dict(id='x', daily=rows(30)), '2026-09-01')['checks'][0]
    assert check['missingField'] == 'ema'  # Latest EMA exists, previous EMA does not.
    c.update(left='dailyTurnover', right='avgDailyTurnover', rightPeriod=20, operator='gt')
    history = rows(30)
    report = dict(date='2026-07-30', turnoverCr=100, knownAt='2026-07-30T12:00:00Z')
    check = evaluate(rule, dict(id='x', daily=history, reports=[report]), '2026-09-01')['checks'][0]
    assert check['missingField'] == 'avgDailyTurnover'
    assert '20 candles' in check['reason'] and 'downloaded later' in check['reason']
