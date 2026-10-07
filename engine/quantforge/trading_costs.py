"""Dhan-style cash estimate, frozen rates 2026-10-05; not a contract note.
Exchange rate is configurable (BSE groups vary). DP is per delivery sell.
"""
# NSE/FA/73061: effective 1 March 2026, IPFT Rs 0.01/crore = 1e-9.
import math

def rounded(value):
    return math.floor(value + 0.5 + 1e-8)

def trade_fee(gross, side, risk):
    if risk.get('costModel') != 'indian-cash':
        return rounded(gross * risk['feePercent'] / 100)
    delivery = risk['overnight']
    brokerage = 0 if delivery else rounded(min(2000, gross * 0.0003))
    exchange = rounded(gross * risk.get('exchangeFeePercent', 0.0030699) / 100)
    sebi, ipft = rounded(gross * 0.000001), rounded(gross * 0.000000001)
    stt = rounded(gross * (0.001 if delivery else 0.00025 if side == 'SELL' else 0) / 100) * 100
    stamp = rounded(gross * (0.00015 if delivery else 0.00003) / 100) * 100 if side == 'BUY' else 0
    gst = rounded((brokerage + exchange + sebi + ipft) * 0.18)
    return brokerage + exchange + sebi + ipft + stt + stamp + gst + (1475 if delivery and side == 'SELL' else 0)

def affordable_shares(cash, price, risk):
    lo, hi = 0, max(0, cash // price)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if mid * price + trade_fee(mid * price, 'BUY', risk) <= cash:
            lo = mid
        else:
            hi = mid - 1
    return lo
