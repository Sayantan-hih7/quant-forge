import numpy as np
import pandas as pd
import pytest
from quantforge.market import candles
from quantforge.rules import indicator, Observations, validate_rule
from quantforge.indicator_settings import settings_for
from quantforge.extended_indicators import pivot_series

def rows(count=120):
    return [dict(time=(pd.Timestamp('2025-01-01')+pd.Timedelta(days=i)).isoformat(),open=99+i+3*np.sin(i),high=103+i+3*np.sin(i),low=97+i+3*np.sin(i),close=100+i+3*np.sin(i),volume=100+i*10) for i in range(count)]

@pytest.mark.parametrize('field', ['wma','vwma','hma','sar','ichimokuA','ichimokuB','donchianUpper','keltnerLower','atrBandUpper','stochasticK','stochRsiD','cci','roc','momentum','mfi','williamsR','obv','cmf','aroonDown','choppiness'])
def test_new_indicators_are_causal_and_have_real_warmup(field):
    frame=candles(rows(),'2026-01-01');all_values=indicator(frame,field)
    assert np.isfinite(all_values.iloc[-1]),field
    for n in (80,100):
        actual=indicator(frame.iloc[:n],field).iloc[-1]
        assert actual==pytest.approx(all_values.iloc[n-1]),field

def test_moving_averages_use_real_weights_and_volume():
    frame=candles(rows(3),'2026-01-01');frame['close']=[10.,20.,30.];frame['volume']=[1.,1.,8.]
    assert indicator(frame,'wma',3).iloc[-1]==pytest.approx(140/6)
    assert indicator(frame,'vwma',3).iloc[-1]==27
    frame['volume']=0
    assert np.isnan(indicator(frame,'vwma',3).iloc[-1])


def test_dema_warmup_and_formula_are_not_two_independent_emas():
    from quantforge.indicator_settings import required_bars
    frame=candles(rows(30),'2026-01-01')
    first=frame.close.ewm(span=5,adjust=False,min_periods=5).mean()
    expected=2*first-first.ewm(span=5,adjust=False,min_periods=5).mean()
    actual=indicator(frame,'dema',5)
    np.testing.assert_allclose(actual,expected,equal_nan=True)
    assert actual.first_valid_index()==frame.index[8]
    assert required_bars('dema',5)==9
    assert indicator(frame,'candleAverage').iloc[-1]==pytest.approx(frame.iloc[-1][['open','high','low','close']].mean())


def test_connors_rsi_streaks_ties_rank_and_real_history():
    from quantforge.rules import rsi
    from quantforge.indicator_settings import required_bars
    frame=candles(rows(10),'2026-01-01')
    frame['close']=[100.,102.,104.,104.,103.,101.,103.,104.,103.,104.]
    streaks=pd.Series([0.,1.,2.,0.,-1.,-2.,1.,2.,-1.,1.],index=frame.index)
    changes=frame.close.pct_change()*100
    ranks=changes.rolling(4).apply(lambda w: sum(x<w.iloc[-1] for x in w.iloc[:-1])/3*100)
    expected=(rsi(frame.close,3)+rsi(streaks,2)+ranks)/3
    actual=indicator(frame,'connorsRsi',3,{'rankPeriod':3})
    np.testing.assert_allclose(actual,expected,equal_nan=True)
    assert required_bars('connorsRsi',3,{'rankPeriod':3})==5
    for length in (5,7,9):
        assert indicator(frame.iloc[:length],'connorsRsi',3,{'rankPeriod':3}).iloc[-1]==pytest.approx(actual.iloc[length-1])
    frame['close']=100.
    assert indicator(frame,'connorsRsi',3,{'rankPeriod':3}).iloc[-1]==pytest.approx(100/3)


def test_new_settings_validate_in_monthly_and_replay_cache():
    from quantforge.replay import ReplayObservations
    condition={'field':'connorsRsi','timeframe':'1mo','operator':'gt','operand':'value','value':40,'period':3,'settings':{'rankPeriod':12,'streakPeriod':2}}
    assert validate_rule({'tier':'monthly','logic':'AND','groups':[{'logic':'AND','conditions':[condition]}]})
    data={'daily':rows(120)}
    replay=ReplayObservations(data,'2026-01-01');replay.cutoff=pd.Timestamp('2025-04-15T23:00:00Z')
    for field,period,settings in [('dema',9,{'source':'open'}),('connorsRsi',3,{'rankPeriod':10}),('candleAverage',None,{'source':'hl2'})]:
        live=Observations(data,replay.cutoff).values(field,'1d',period,settings=settings)
        assert replay.values(field,'1d',period,settings=settings).iloc[-1]==pytest.approx(live.iloc[-1])

def test_settings_do_not_share_cached_series_or_drop_on_replay():
    data=Observations({'daily':rows()},'2026-01-01')
    a=data.values('ema','1d',10,settings={'source':'open'});b=data.values('ema','1d',10,settings={'source':'close'})
    assert a.iloc[-1]!=b.iloc[-1]
    from quantforge.replay import ReplayObservations
    replay=ReplayObservations({'daily':rows()},'2026-01-01')
    replay.cutoff=pd.Timestamp('2025-03-01T23:00:00Z')
    for s in ({'source':'open'},{'source':'close'}):
        live=Observations({'daily':rows()},replay.cutoff).values('ema','1d',10,settings=s)
        assert replay.values('ema','1d',10,settings=s).iloc[-1]==pytest.approx(live.iloc[-1])

def test_invalid_or_chart_only_settings_are_rejected():
    for field,s in [('sma',{'multiplier':2}),('macd',{'fastPeriod':30,'slowPeriod':12}),('sar',{'start':.5,'maximum':.2}),('rsi',{'overbought':70}),('ichimokuA',{'displacement':-1})]:
        with pytest.raises(ValueError):settings_for(field,s)

def test_relative_strength_matches_dates_and_never_fills_missing_benchmark():
    stock=rows(12);benchmark=[{**row,'open':100,'close':100,'high':100,'low':100} for row in stock]
    data=Observations({'daily':stock,'benchmarks':{'NIFTY 50':benchmark}},'2026-01-01')
    expected=(stock[-1]['close']/stock[-4]['close']-1)*100
    assert data.values('relativeStrength','1d',3).iloc[-1]==pytest.approx(expected)
    del benchmark[-2]
    missing=Observations({'daily':stock,'benchmarks':{'NIFTY 50':benchmark}},'2026-01-01')
    assert np.isnan(missing.values('relativeStrength','1d',3).iloc[-1])

def test_pivots_use_prior_complete_period_only():
    df=candles(rows(100),'2026-01-01');before=pivot_series(df,df,'pivotR1',{'pivotFrame':'1mo'})
    changed=df.copy();changed.loc[changed.index.month==3,'high']=10000
    after=pivot_series(changed,changed,'pivotR1',{'pivotFrame':'1mo'})
    np.testing.assert_allclose(before.loc[before.index.month==3],after.loc[after.index.month==3])
    assert before.loc[before.index.month==4].iloc[-1]!=after.loc[after.index.month==4].iloc[-1]


def test_anchor_and_pivot_gaps_are_not_treated_as_complete_history():
    df=candles(rows(100),'2026-01-01')
    assert indicator(df,'vwap',settings={'anchor':'custom','anchorDate':'2024-12-01'}).isna().all()
    assert indicator(df,'vwap',settings={'anchor':'custom','anchorDate':'2025-01-10'}).notna().any()
    without_feb=df.loc[df.index.month!=2]
    values=pivot_series(without_feb,without_feb,'pivot',{'pivotFrame':'1mo'})
    assert values.loc[values.index.month==3].isna().all()
