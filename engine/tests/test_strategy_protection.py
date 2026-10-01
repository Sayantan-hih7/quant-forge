import copy
import pandas as pd
import pytest
from test_backtest import body
from quantforge.backtest import run_backtest
from quantforge.replay import ReplayObservations, decision
from quantforge.rules import evaluate_observations, entry_event_keys, validate_rule
from quantforge.market import stamp


def protected():
    request = body()
    request['strategy']['exit'].update(enabled=False, groups=[])
    request['strategy']['risk'].update(stopMode='candleLow', exitTargets=[
        {'basis': 'risk', 'value': 2, 'closePercent': 40, 'moveStopTo': 0},
        {'basis': 'risk', 'value': 5, 'closePercent': 30, 'moveStopTo': 1},
        {'basis': 'risk', 'value': 8, 'closePercent': 30},
    ])
    request['instruments'][0]['daily'] = [
        dict(time=f'2026-09-{day}T03:45:00Z', open=o, high=h, low=l, close=c, volume=1000)
        for day, o, h, l, c in [(14,99,101,96,100),(15,100,108,97,108),(16,110,120,109,119),(17,110,111,107,108)]
    ]
    request['config']['to'] = '2026-09-18T00:00:00+05:30'
    return request


def test_candle_stop_and_target_ladder_close_incrementally():
    result = run_backtest(protected())
    assert [(t['reason'],t['exit'],t['quantity'],t['remainingQuantity']) for t in result['trades']] == [
        ('Target 1',108,100,150),('Target 2',120,75,75),('Stop loss',108,75,0)]
    assert result['cash'] == 102900
    assert result['realizedPnl'] == 2900
    assert result['closedTrades'] == 1
    assert not result['openPositions']


def test_low_is_frozen_before_the_fill_and_gaps_below_it_are_skipped():
    request = protected()
    original = decision(request['strategy'],request['instruments'][0],'2026-09-14T10:01:00Z')
    changed = copy.deepcopy(request)
    changed['instruments'][0]['daily'][1].update(open=95,high=96,low=90,close=94)
    preview = decision(changed['strategy'],changed['instruments'][0],'2026-09-14T10:01:00Z')
    assert original['signalLow'] == preview['signalLow'] == 96
    changed['config']['to'] = '2026-09-16T00:00:00+05:30'
    result = run_backtest(changed)
    assert not result['trades'] and not result['openPositions']
    assert result['invalidStopEntries'] == 1


def test_disabled_sell_is_explicit_and_cannot_disable_buy():
    request = protected()
    output = decision(request['strategy'],request['instruments'][0],'2026-09-16T10:01:00Z')
    assert output['exit'] == {'id':'NSE:1','matched':False,'status':'rejected','checks':[], 'disabled':True}
    with pytest.raises(ValueError,match='Only tactical sell'):
        validate_rule({**request['strategy']['entry'],'enabled':False})


@pytest.mark.parametrize('signal_low,slippage,filled', [(98,0,True),(97,0,True),(96.99,0,False),(97,0.1,False)])
def test_stop_distance_cap_uses_actual_entry_and_does_not_move_the_candle_low(signal_low, slippage, filled):
    request = protected()
    request['strategy']['risk'].update(maxStopPercent=3, slippagePercent=slippage)
    request['instruments'][0]['daily'][0]['low'] = signal_low
    request['instruments'][0]['daily'][1].update(open=100,high=100.5,low=99,close=100)
    request['config']['to'] = '2026-09-16T00:00:00+05:30'
    result = run_backtest(request)
    assert result['stopLimitEntries'] == (0 if filled else 1)
    assert bool(result['openPositions']) == filled
    if filled:
        assert result['openPositions'][0]['stop'] == signal_low
    else:
        assert not result['trades']
        assert result['cash'] == request['strategy']['risk']['initialCapital']


@pytest.mark.parametrize('value', [0, -1, 26, float('nan'), float('inf'), True])
def test_invalid_initial_stop_limit_is_rejected(value):
    request = protected()
    request['strategy']['risk']['maxStopPercent'] = value
    with pytest.raises(ValueError, match='Maximum initial stop distance'):
        run_backtest(request)


def weekly_fixture():
    request = body()
    request['strategy']['entry']['groups'][0]['conditions'] = [{
        'left':'ema','leftPeriod':2,'leftFrame':'1w','operator':'crossAbove',
        'rightType':'indicator','right':'ema','rightPeriod':3,'rightFrame':'1w'}]
    request['strategy']['exit'].update(enabled=False, groups=[])
    # Three declining weeks then a completed bullish week. Daily decisions during
    # the following week must share that event, even after an early stop-out.
    request['instruments'][0]['daily'] = [
        dict(time=f'{day.date()}T03:45:00Z',open=price,high=price+1,low=price-1,close=price,volume=1000)
        for start,price in [('2026-08-31',100),('2026-09-07',90),('2026-09-14',80),('2026-09-21',110),('2026-09-28',110)]
        for day in pd.bdate_range(start,periods=5)]
    request['strategy']['risk'].update(stopPercent=.5,targetR=10)
    request['config'].update({'from':'2026-09-28T00:00:00+05:30','to':'2026-10-03T00:00:00+05:30'})
    return request


def test_weekly_crossover_dedup_and_state_rules_are_distinct():
    request = weekly_fixture()
    results = [decision(request['strategy'],request['instruments'][0],f'2026-09-{day}T10:01:00Z') for day in [28,29,30]]
    assert all(result['entry']['matched'] for result in results)
    assert len({result['entry']['checks'][0]['eventKey'] for result in results}) == 1
    result=run_backtest(request)
    assert len(result['trades']) == 1
    assert result['trades'][0]['reason'] == 'Stop loss'
    request['strategy']['entry']['groups'][0]['conditions'][0]['operator']='gt'
    assert len(run_backtest(request)['trades']) > 1


def test_consumed_event_preserves_or_branches_and_new_crossovers():
    request=weekly_fixture()
    obs=ReplayObservations(request['instruments'][0],request['config']['to'])
    obs.cutoff=stamp('2026-09-28T10:01:00Z')
    rule=request['strategy']['entry']
    initial=evaluate_observations(rule,'NSE:1',obs)
    consumed=set(entry_event_keys(rule,initial))
    assert not evaluate_observations(rule,'NSE:1',obs,consumed_events=consumed)['matched']
    rule['groups'][0]['logic']='OR'
    rule['groups'][0]['conditions'].append({'left':'close','leftFrame':'1d','operator':'gt','rightType':'value','value':100})
    assert evaluate_observations(rule,'NSE:1',obs,consumed_events=consumed)['matched']


@pytest.mark.parametrize('index,level',[(0,1),(1,2),(2,0),(1,-1),(1,.5)])
def test_invalid_stop_steps_are_rejected(index,level):
    request=protected()
    request['strategy']['risk']['exitTargets'][index]['moveStopTo']=level
    with pytest.raises(ValueError):run_backtest(request)
