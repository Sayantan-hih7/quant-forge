import math
import pandas as pd
import pytest
from quantforge.rules import indicator, indicator_months


def test_new_indicator_minimums_match_their_first_valid_observations():
    assert indicator_months('adx', 14) == 27
    assert indicator_months('supertrend') == 10
    assert indicator_months('bullishEngulfing') == 2
    df = pd.DataFrame(rows(40))
    assert indicator(df, 'adx', 14).first_valid_index() == 26
    assert indicator(df, 'supertrend').first_valid_index() == 9


def rows(count=50, start='2026-07-01', step=1.0):
    return [dict(time=t.isoformat(), open=100+i*step, close=102+i*step, high=104+i*step, low=99+i*step, volume=100+i)
            for i, t in enumerate(pd.date_range(start + ' 03:45', periods=count, freq='D', tz='UTC'))]


def falling_rows(count=50, start='2026-07-01'):
    return [dict(time=t.isoformat(), open=200-i, close=198-i, high=204-i, low=195-i, volume=100+i)
            for i, t in enumerate(pd.date_range(start + ' 03:45', periods=count, freq='D', tz='UTC'))]


def test_bollinger_bands_match_hand_computed_mean_and_sample_std():
    df = pd.DataFrame(dict(close=[10, 12, 14, 16, 18], open=[10]*5, high=[20]*5, low=[5]*5, volume=[100]*5))
    upper = indicator(df, 'bollingerUpper', 5).iloc[-1]
    lower = indicator(df, 'bollingerLower', 5).iloc[-1]
    bandwidth = indicator(df, 'bollingerBandwidth', 5).iloc[-1]
    mean, std = 14, math.sqrt(10)  # sample std (ddof=1) of [10,12,14,16,18]
    assert upper == pytest.approx(mean + 2*std)
    assert lower == pytest.approx(mean - 2*std)
    assert bandwidth == pytest.approx((upper - lower) / mean * 100)


def test_adx_system_isolates_direction_in_a_pure_uptrend_and_downtrend():
    up = pd.DataFrame(rows(30))
    assert indicator(up, 'diMinus', 5).iloc[-1] == pytest.approx(0)
    assert indicator(up, 'diPlus', 5).iloc[-1] > 0
    assert indicator(up, 'adx', 5).iloc[-1] == pytest.approx(100)
    down = pd.DataFrame(falling_rows(30))
    assert indicator(down, 'diPlus', 5).iloc[-1] == pytest.approx(0)
    assert indicator(down, 'diMinus', 5).iloc[-1] > 0
    assert indicator(down, 'adx', 5).iloc[-1] == pytest.approx(100)


def test_supertrend_sits_below_price_in_a_calm_uptrend():
    up = pd.DataFrame(rows(30))
    line = indicator(up, 'supertrend')
    assert line.iloc[-1] < up.close.iloc[-1]


def test_supertrend_flips_above_price_after_a_sharp_crash_breaks_the_band():
    # 15 calm rising candles establish an uptrend and a stable ATR, then day 16
    # crashes far past the ratcheted lower band — the line must flip to resistance.
    calm = rows(15)
    crash = [dict(time=t.isoformat(), open=116-15*i, close=100-15*i, high=118-15*i, low=48-15*i, volume=200)
             for i, t in enumerate(pd.date_range('2026-07-16 03:45', periods=10, freq='D', tz='UTC'))]
    df = pd.DataFrame(calm + crash)
    line = indicator(df, 'supertrend')
    assert line.iloc[-1] > df.close.iloc[-1]


def test_doji_flags_a_tiny_body_relative_to_range():
    df = pd.DataFrame(dict(open=[100, 100], close=[100.5, 130], high=[110, 140], low=[90, 95]))
    result = indicator(df, 'doji')
    assert result.iloc[0] == 1  # body 0.5 / range 20 = 2.5%
    assert result.iloc[1] == 0  # body 30 / range 45 = 66.7%


def test_hammer_needs_a_long_lower_wick_and_little_upper_wick():
    df = pd.DataFrame(dict(open=[100, 100], close=[102, 101], high=[103, 115], low=[90, 99]))
    result = indicator(df, 'hammer')
    assert result.iloc[0] == 1  # body 2, lower wick 10 (>=2x), upper wick 1 (<=body)
    assert result.iloc[1] == 0  # large upper wick disqualifies it


def test_engulfing_patterns_require_a_full_body_reversal():
    df = pd.DataFrame(dict(open=[110, 99, 100, 112], close=[100, 112, 110, 98], high=[115, 117, 115, 117], low=[95, 94, 95, 93], volume=[1000]*4))
    bullish = indicator(df, 'bullishEngulfing')
    bearish = indicator(df, 'bearishEngulfing')
    assert bullish.iloc[1] == 1  # bar 1 (99->112) engulfs bearish bar 0 (110->100)
    assert bearish.iloc[3] == 1  # bar 3 (112->98) engulfs bullish bar 2 (100->110)
    assert bullish.iloc[3] == 0 and bearish.iloc[1] == 0


def test_accumulation_distribution_matches_hand_computed_money_flow_volume():
    df = pd.DataFrame(dict(high=[110, 120], low=[90, 100], close=[100, 115], open=[100, 100], volume=[1000, 2000]))
    result = indicator(df, 'accDist')
    assert result.iloc[0] == pytest.approx(0)      # MFM = ((100-90)-(110-100))/20 = 0
    assert result.iloc[1] == pytest.approx(1000)   # MFM = ((115-100)-(120-115))/20 = 0.5; MFV = 1000; cumsum = 0+1000
