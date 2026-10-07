import pytest
from quantforge.backtest import run_backtest
from quantforge.entry_safety import EntrySafety, validate_entry_safety
from quantforge.market import stamp
from test_backtest import body
from test_zero_volume_fills import minute_request


def test_cooldown_and_daily_limit_reset():
    guard = EntrySafety({'reentryCooldownMinutes': 15, 'maxEntriesPerStockPerDay': 2})
    guard.exits['A'] = stamp('2026-10-07T05:00:00Z')
    assert guard.reason('A', '2026-10-07T05:14:59Z') == 'cooldown'
    assert guard.reason('A', '2026-10-07T05:15:00Z') is None
    guard.filled('A', '2026-10-06T19:00:00Z')  # already October 7 IST
    guard.filled('A', '2026-10-07T04:00:00Z')
    assert guard.reason('A', '2026-10-07T05:15:00Z') == 'dailyEntries'
    assert guard.reason('A', '2026-10-08T04:00:00Z') is None


def test_loss_latch_and_new_day_reset():
    guard = EntrySafety({'dailyLossLimitPercent': 2})
    guard.observe_equity('2026-10-07T04:00:00Z', 100000)
    guard.observe_equity('2026-10-07T04:01:00Z', 98000)
    guard.observe_equity('2026-10-07T04:02:00Z', 101000)
    assert guard.reason('A', '2026-10-07T04:02:00Z') == 'dailyLoss'
    guard.observe_equity('2026-10-08T04:00:00Z', 98000)
    assert guard.reason('A', '2026-10-08T04:00:00Z') is None


def test_gap_buys_are_skipped_without_changing_old_revision():
    request = body()
    assert run_backtest(request)['trades'][0]['entry'] == 110
    request['strategy']['risk']['maxEntryDeviationPercent'] = 2
    result = run_backtest(request)
    assert not result['trades'] and not result['openPositions']
    assert result['entrySafeguards']['blocked']['priceDeviation'] == 2


def test_choppy_tape_limits_filled_entries_and_keeps_stops():
    bars = [(f'2026-09-15T03:{45+i:02d}:00Z', 100, 100, 1000) for i in range(15)]
    request = minute_request(bars)
    request['strategy']['risk'].update(stopPercent=0.5, targetR=10, maxEntriesPerStockPerDay=2)
    result = run_backtest(request)
    assert len(result['trades']) == 2
    assert all(t['reason'] == 'Stop loss' for t in result['trades'])
    assert result['entrySafeguards']['blocked']['dailyEntries'] > 0
    request['strategy']['risk'].update(maxEntriesPerStockPerDay=0, reentryCooldownMinutes=5)
    result = run_backtest(request)
    assert len(result['trades']) == 3
    assert result['entrySafeguards']['blocked']['cooldown'] > 0
    request['strategy']['risk'].update(reentryCooldownMinutes=0, dailyLossLimitPercent=0.1)
    result = run_backtest(request)
    assert len(result['trades']) == 1
    assert result['entrySafeguards']['dailyLossDates'] == ['2026-09-15']


@pytest.mark.parametrize('field,value', [('reentryCooldownMinutes', None), ('reentryCooldownMinutes', -1), ('maxEntriesPerStockPerDay', 1.5), ('dailyLossLimitPercent', 0), ('maxEntryDeviationPercent', float('nan'))])
def test_invalid_controls_rejected(field, value):
    with pytest.raises(ValueError):
        validate_entry_safety({field: value})


def test_conservative_nse_squareoff_precedes_auction():
    from quantforge.execution_session import execution_close, square_off
    assert execution_close('NSE:1', '2026-07-30T09:45:00Z') == 930
    assert execution_close('NSE:1', '2026-10-07T09:45:00Z') == 915
    assert square_off('NSE:1', '2026-10-07T09:45:00Z') == 910
    assert square_off('BSE:1', '2026-10-07T09:45:00Z') == 915
    request = minute_request([(f'2026-09-15T09:{minute}:00Z', 100, 100, 1000) for minute in ['38','39','40','41','45','46']])
    ident = request['instruments'][0]['id']
    request['instruments'][0]['id'] = 'NSE:1'
    request['config']['ids'] = ['NSE:1']
    for snap in request.get('snapshots', []):
        for member in snap.get('members', []):
            if member.get('instrumentId') == ident:
                member['instrumentId'] = 'NSE:1'
    request['strategy']['risk'].update(overnight=False, stopPercent=10, targetR=10)
    result = run_backtest(request)
    assert len(result['trades']) == 1
    assert result['trades'][0]['reason'] == 'Session close'
    assert stamp(result['trades'][0]['exitAt']) == stamp('2026-09-15T09:40:00Z')
    assert not result['openPositions']
