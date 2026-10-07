"""Entry-only guards. Candle replay cannot observe an unknown intrabar equity path."""
import math
from .market import stamp, IST


def validate_entry_safety(risk):
    for key, low, high, integer in [('reentryCooldownMinutes', 0, 10080, True), ('maxEntriesPerStockPerDay', 0, 100, True), ('dailyLossLimitPercent', .1, 10, False), ('maxEntryDeviationPercent', .1, 10, False)]:
        value = risk.get(key)
        if key in risk and (value is None or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high or integer and int(value) != value):
            raise ValueError(f'Invalid {key}')


class EntrySafety:
    def __init__(self, risk):
        self.risk = risk
        self.exits = {}
        self.buys = {}
        self.day = None
        self.baseline = None
        self.halted = False
        self.halted_days = set()
        self.blocked = {'cooldown': 0, 'dailyEntries': 0, 'dailyLoss': 0, 'priceDeviation': 0, 'oldSignal': 0}

    def observe_equity(self, at, equity):
        day = stamp(at).tz_convert(IST).date()
        if day != self.day:
            self.day, self.baseline, self.halted = day, equity, False
        limit = self.risk.get('dailyLossLimitPercent')
        if limit is not None and self.baseline > 0 and (self.baseline-equity)/self.baseline*100 >= limit:
            self.halted = True
            self.halted_days.add(str(day))

    def reason(self, ident, at, signal_at=None):
        at = stamp(at)
        if self.halted:
            return 'dailyLoss'
        last = self.exits.get(ident)
        if last is not None:
            if signal_at is not None and stamp(signal_at) <= last:
                return 'oldSignal'
            if (at-last).total_seconds() < self.risk.get('reentryCooldownMinutes', 0)*60:
                return 'cooldown'
        maximum = self.risk.get('maxEntriesPerStockPerDay', 0)
        if maximum and self.buys.get((ident, at.tz_convert(IST).date()), 0) >= maximum:
            return 'dailyEntries'
        return None

    def filled(self, ident, at):
        key = (ident, stamp(at).tz_convert(IST).date())
        self.buys[key] = self.buys.get(key, 0)+1

    def deviation(self, reference, price):
        maximum = self.risk.get('maxEntryDeviationPercent')
        return maximum is not None and (reference is None or reference <= 0 or abs(price/reference-1)*100 > maximum)
