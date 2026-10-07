import copy
import io
from test_backtest import body
from test_backtest_stream import stream_bytes
from quantforge.backtest_stream import run_stream
from quantforge.readiness import assess_scope
from quantforge.replay import ReplayObservations


def assess(request):
    return assess_scope(request, {s['id']: ReplayObservations(s, request['config']['to']) for s in request['instruments']})


def test_ready_scope_excludes_missing_stock_before_portfolio_and_records_original_selection():
    request=body(); request['config']['dataPolicy']='ready'
    request['config']['ids'].append('NSE:2')
    request['instruments'].append({'id':'NSE:2','daily':[]})
    result=run_stream(io.BytesIO(stream_bytes(request)))
    assert result['selectionAudit']['requestedIds']==['NSE:1','NSE:2']
    assert result['selectionAudit']['includedIds']==['NSE:1']
    assert result['netPnl']==900
    assert result['selectionAudit']['excluded'][0]['instrumentId']=='NSE:2'


def test_not_ready_returns_exclusions_instead_of_empty_success():
    request=body(); request['config']['dataPolicy']='ready'; request['instruments'][0]['daily']=[]
    result=run_stream(io.BytesIO(stream_bytes(request)))
    assert result['noEligibleStocks'] is True and 'trades' not in result


def test_new_listing_and_warmup_do_not_use_future_candles_for_admission():
    request=body();request['config']['dataPolicy']='ready'
    request['strategy']['entry']['groups'][0]['conditions'][0].update(left='ema',leftPeriod=3)
    audit=assess(request)
    assert audit['includedIds']==[]
    assert any('Entry inputs not ready' in r for r in audit['excluded'][0]['reasons'])
    # Starting later uses completed, real history and is not a permanent exclusion.
    request['config']['from']='2026-09-16T00:00:00+05:30'
    assert assess(request)['includedIds']==['NSE:1']


def test_price_gap_calendar_missing_day_and_provider_failure_are_audited():
    request=body();request['config']['dataPolicy']='ready'
    request['config']['sessionDates']=['2026-09-14','2026-09-15','2026-09-16']
    request['instruments'][0]['daily'].pop(1)
    assert any('1 market sessions' in r for r in assess(request)['excluded'][0]['reasons'])
    request['config']['preparationIssues']={'NSE:1':['History preparation unavailable']}
    assert 'History preparation unavailable' in assess(request)['excluded'][0]['reasons']


def test_false_buy_condition_is_ready_and_no_trades_are_not_a_data_failure():
    request=body();request['config']['dataPolicy']='ready'
    request['strategy']['entry']['groups'][0]['conditions'][0]['value']=10000
    result=run_stream(io.BytesIO(stream_bytes(request)))
    assert result['selectionAudit']['includedIds']==['NSE:1'] and result['trades']==[]


def test_research_mode_does_not_drop_stock_with_missing_warmup():
    request=body();request['config']['dataPolicy']='all'
    request['strategy']['entry']['groups'][0]['conditions'][0].update(left='ema',leftPeriod=3)
    result=run_stream(io.BytesIO(stream_bytes(request)))
    assert len(result['coverage'])==1 and result['selectionAudit']['excluded']


def test_exit_and_stop_inputs_are_checked_even_if_buy_rule_is_false():
    request=body();request['config']['dataPolicy']='ready'
    request['strategy']['exit']['groups'][0]['conditions'][0].update(left='ema',leftPeriod=21)
    request['strategy']['risk']['stopMode']='ATR'
    reasons=assess(request)['excluded'][0]['reasons']
    assert any('Exit inputs' in r for r in reasons)
    assert any('ATR stop' in r for r in reasons)


def test_intraday_missing_minutes_and_exit_liquidity_are_not_fabricated():
    request=body();request['config']['dataPolicy']='ready'
    request['strategy']['entry']['cadence']='1m';request['strategy']['exit']['cadence']='1m'
    request['strategy']['risk'].update(timeframe='1m',overnight=False)
    request['instruments'][0]['intraday']=copy.deepcopy(request['instruments'][0]['daily'])
    reasons=assess(request)['excluded'][0]['reasons']
    assert any('minute observations missing' in r for r in reasons)
    assert any('intraday exit time' in r for r in reasons)
