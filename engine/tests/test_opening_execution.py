"""Independent hand-ledger fixtures: no production sizing/exit helpers used.

All fixtures buy 100 shares at 100 (1% of 100,000 / 10 risk per share).
The opening auction precedes the remaining OHLC range. New stop adjustments
remain next-bar effective, matching the documented conservative replay model.
"""
from decimal import Decimal, ROUND_HALF_UP
import pytest
from quantforge.backtest import run_backtest
from test_backtest import body, partial_body


def scenario(opening, high, low, close, partial=False):
    request = partial_body() if partial else body()
    request['strategy']['exit']['groups'][0]['conditions'][0]['value'] = 1000
    request['strategy']['risk']['targetR'] = 2
    for row in request['instruments'][0]['daily']:
        row.update(open=100, high=101, low=99, close=100)
    request['instruments'][0]['daily'][2].update(open=opening, high=high, low=low, close=close)
    return request


@pytest.mark.parametrize('opening,high,low,close,reason,price,pnl', [
    (125, 130, 85, 95, 'Target', 125, 2500),
    (85, 130, 80, 120, 'Stop loss', 85, -1500),
    (100, 125, 85, 110, 'Stop loss', 90, -1000),
    (100, 125, 95, 120, 'Target', 120, 2000),
])
def test_auction_and_ambiguous_paths_match_independent_ledger(opening, high, low, close, reason, price, pnl):
    result = run_backtest(scenario(opening, high, low, close))
    assert [(t['reason'], t['quantity'], t['exit'], t['pnl']) for t in result['trades']] == [(reason, 100, price, pnl)]
    assert result['cash'] == result['equity'] == 100000 + pnl
    assert result['closedTrades'] == 1
    assert not result['openPositions']


def test_opening_partial_profit_precedes_later_stop_of_remainder():
    result = run_backtest(scenario(103, 105, 85, 95, partial=True))
    assert [(t['reason'], t['quantity'], t['exit']) for t in result['trades']] == [('Target 1', 50, 103), ('Stop loss', 50, 90)]
    # 50 * 3 gain - 50 * 10 loss; only one completed position.
    assert result['cash'] == 99650
    assert result['closedTrades'] == 1 and result['winRate'] == 0


def test_opening_crosses_both_partial_targets_before_later_low():
    result = run_backtest(scenario(105, 106, 85, 95, partial=True))
    assert [(t['reason'], t['quantity'], t['exit']) for t in result['trades']] == [('Target 1', 50, 105), ('Target 2', 50, 105)]
    assert result['cash'] == 100500
    assert result['closedTrades'] == 1 and result['winRate'] == 100


def test_gap_execution_costs_match_decimal_cash_ledger():
    request = scenario(125, 130, 85, 95)
    request['strategy']['risk'].update(slippagePercent=0.1, feePercent=0.1)
    result = run_backtest(request)
    cent = lambda x: Decimal(x).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    entry = cent(Decimal('100') * Decimal('1.001'))
    stop_distance = cent(entry * Decimal('0.1'))
    quantity = int(Decimal('1000') // stop_distance)
    exit_price = cent(Decimal('125') * Decimal('0.999'))
    buy_fee = cent(entry * quantity * Decimal('0.001'))
    sell_fee = cent(exit_price * quantity * Decimal('0.001'))
    pnl = (exit_price - entry) * quantity - buy_fee - sell_fee
    assert result['trades'][0]['quantity'] == quantity
    assert result['realizedPnl'] == float(pnl)
    assert result['cash'] == float(Decimal('100000') + pnl)
    assert result['totalFees'] == float(buy_fee + sell_fee)


def test_opening_target_releases_position_slot_before_other_stock_entry():
    import copy
    request = scenario(125, 130, 85, 95)
    request['strategy']['risk']['maxPositions'] = 1
    second = copy.deepcopy(request['instruments'][0])
    second['id'] = 'NSE:2'
    second['daily'][0].update(open=40, high=41, low=39, close=40)
    second['daily'][2].update(open=100, high=101, low=99, close=100)
    request['instruments'].append(second)
    request['config']['ids'].append('NSE:2')
    result = run_backtest(request)
    assert result['trades'][0]['pnl'] == 2500
    # 1% of 102,500 / 10 per-share risk, rounded down.
    assert [(p['instrumentId'], p['quantity']) for p in result['openPositions']] == [('NSE:2', 102)]
    assert result['cash'] == 92300 and result['equity'] == 102500
    exits = [e for e in result['replay']['events'] if e['kind'] == 'exit']
    assert exits[0]['phase'] == 'open'
