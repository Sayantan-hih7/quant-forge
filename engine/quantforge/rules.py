import re
import math
import numpy as np
import pandas as pd
from .market import candles, timeframe, stamp, IST

TECHNICAL = {"close", "open", "high", "low", "volume", "ema5", "ema20", "ema21", "ema50",
             "sma50", "sma200", "rsi", "atr", "rvol", "volumeRatio", "avgVolume20", "avgVolume6", "macd", "macdSignal",
             "vwap", "priceChange", "return1m", "return3m", "return6m", "return12m"}
FACTS = {"marketCap", "debtEquity", "pledge", "delivery", "roe", "roce", "pe", "growth",
         "revenueGrowth", "profitGrowth", "promoterHolding", "fiiChange", "diiChange",
         "positiveQuarters", "sector", "index", "fnoEligible", "turnover", "tradedValue"}
OPERATORS = {"gt", "gte", "lt", "lte", "eq", "neq", "between", "notBetween", "crossAbove",
             "crossBelow", "increasing", "decreasing", "within", "aboveBy", "belowBy",
             "is", "isNot", "in", "notIn"}


def validate_rule(rule):
    groups = rule.get("groups", [])
    if not groups or len(groups) > 10 or rule.get("logic") not in ("AND", "OR"):
        raise ValueError("Rule needs 1–10 condition groups and AND/OR logic")
    monthly = rule.get("timeframe") == "1mo" or rule.get("tier") == "monthly"
    frames = {"1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo", "1q"}
    for group in groups:
        if group.get("logic") not in ("AND", "OR") or not 1 <= len(group.get("conditions", [])) <= 30:
            raise ValueError("Invalid condition group")
        for c in group["conditions"]:
            left = c.get("field", c.get("left"))
            if left not in TECHNICAL | FACTS:
                raise ValueError(f"Unsupported field: {left}. A verified data source/calculation is required.")
            if c.get("operator") not in OPERATORS:
                raise ValueError("Unsupported condition operator")
            frame = c.get("timeframe") if monthly else c.get("leftFrame", "1d")
            if frame not in frames and not (frame == "latest" and left in FACTS):
                raise ValueError("Unsupported observation timeframe")
            if left in {"sector", "index", "fnoEligible"}:
                if c.get("operator") not in {"is", "isNot", "in", "notIn"} or not c.get("choices"):
                    raise ValueError("Categorical fields need a selection and IS/IN operators")
            elif c.get("operator") in {"is", "isNot", "in", "notIn"}:
                raise ValueError("Numeric fields need numeric comparison operators")
            if monthly and (c.get("timeframe") != "1mo" or left == "vwap"):
                raise ValueError("Qualification only supports completed monthly observations")
            right = c.get("compareField", c.get("right"))
            if c.get("operand", c.get("rightType")) in ("field", "indicator") and right not in TECHNICAL | FACTS:
                raise ValueError(f"Unsupported comparison field: {right}")
            if c.get("operand", c.get("rightType")) in ("field", "indicator"):
                right_frame = "1mo" if monthly else c.get("rightFrame", frame)
                if (right_frame not in frames and not (right_frame == "latest" and right in FACTS)) or monthly and right == "vwap":
                    raise ValueError("Invalid comparison timeframe/indicator")
                if c.get("operator") in {"crossAbove", "crossBelow"} and (frame != right_frame or right in FACTS):
                    raise ValueError("Crossovers need technical operands on the same timeframe")
            if left in FACTS and c.get("operator") in {"crossAbove", "crossBelow", "increasing", "decreasing"}:
                raise ValueError("Snapshot facts do not provide a candle-by-candle series")
            for key in ("value", "upper", "multiplier", "distance", "tolerance", "lookback"):
                if key in c and (not isinstance(c[key], (int, float)) or not math.isfinite(c[key])):
                    raise ValueError(f"{key} must be a finite number")
            if c.get("operator") in {"between", "notBetween"} and c.get("upper", -math.inf) < c.get("value", 0):
                raise ValueError("Range upper bound must follow its lower bound")
            if not 1 <= c.get("lookback", 1) <= 120 or c.get("multiplier", 1) <= 0:
                raise ValueError("Invalid lookback/multiplier")
    return monthly


def wilder(values, n):
    """Wilder RMA seeded with the first n non-null observations' simple average."""
    result = pd.Series(np.nan, index=values.index, dtype=float)
    valid = values.dropna()
    if len(valid) < n:
        return result
    previous = float(valid.iloc[:n].mean())
    result.loc[valid.index[n-1]] = previous
    for index, value in valid.iloc[n:].items():
        previous = (previous * (n-1) + value) / n
        result.loc[index] = previous
    return result


def rsi(close, n=14):
    delta = close.diff()
    gain = wilder(delta.clip(lower=0), n)
    loss = wilder(-delta.clip(upper=0), n)
    return (100 - 100/(1+gain/loss.replace(0, np.nan))).where(loss != 0, 100).where((gain+loss) != 0, 50)


def indicator(df, field):
    if df.empty:
        return pd.Series(dtype=float)
    if field in ("open", "high", "low", "close", "volume"):
        return df[field]
    ma = re.fullmatch(r"(ema|sma)(\d+)", field)
    if ma:
        n = int(ma[2])
        return df.close.ewm(span=n, adjust=False, min_periods=n).mean() if ma[1] == "ema" else df.close.rolling(n).mean()
    if field == "rsi":
        return rsi(df.close)
    if field == "atr":
        tr = pd.concat([df.high-df.low, (df.high-df.close.shift()).abs(), (df.low-df.close.shift()).abs()], axis=1).max(axis=1)
        return wilder(tr, 14)
    if field in ("avgVolume20", "avgVolume6"):
        return df.volume.shift().rolling(20 if field == "avgVolume20" else 6).mean()
    if field in ("rvol", "volumeRatio"):
        return df.volume / df.volume.shift().rolling(20).mean().replace(0, np.nan)
    if field in ("macd", "macdSignal"):
        line = df.close.ewm(span=12, adjust=False, min_periods=12).mean() - df.close.ewm(span=26, adjust=False, min_periods=26).mean()
        return line if field == "macd" else line.ewm(span=9, adjust=False, min_periods=9).mean()
    if field == "priceChange":
        return df.close.pct_change() * 100
    if field.startswith("return"):
        return df.close.pct_change(int(field[6:-1])) * 100
    if field == "vwap":
        days = df.index.tz_convert(IST).date
        typical = (df.high + df.low + df.close) / 3
        return (typical*df.volume).groupby(days).cumsum() / df.volume.groupby(days).cumsum().replace(0, np.nan)
    raise ValueError(f"Unsupported indicator: {field}")


class Observations:
    def __init__(self, instrument, cutoff):
        self.cutoff = stamp(cutoff)
        self.daily = candles(instrument.get("daily", []), cutoff)
        self.intraday = candles(instrument.get("intraday", []), cutoff, "1m")
        self.facts = instrument.get("facts", [])
        self.cache = {}
        self.frame_cache = {}
        self.monthly_history_issue = None
        self.monthly_history_checked = instrument.get('monthlyHistoryChecked', False)

    def bars(self, frame):
        if frame not in self.frame_cache:
            df = timeframe(self.daily, self.intraday, frame, self.cutoff)
            if frame == '1mo' and not df.empty:
                expected_end = self.cutoff.tz_convert(IST).normalize().replace(day=1)
                if df.end.iloc[-1] != expected_end:
                    self.monthly_history_issue = 'stale_history'
                    df = df.iloc[:0]
                else:
                    months = df.index.year * 12 + df.index.month
                    gaps = np.flatnonzero(np.diff(months) != 1)
                    if len(gaps):
                        self.monthly_history_issue = 'history_gap'
                        df = df.iloc[gaps[-1] + 1:]
            self.frame_cache[frame] = df
        return self.frame_cache[frame]

    def values(self, field, frame):
        key = field, frame
        if key in self.cache:
            return self.cache[key]
        if field in FACTS:
            found = [x for x in self.facts if field in x.get("values", {}) and stamp(x["knownAt"]) <= self.cutoff
                     and (not x.get("validUntil") or stamp(x["validUntil"]) >= self.cutoff)]
            # A late download of an older report cannot supersede a newer reporting period.
            found.sort(key=lambda x: (x.get("priority", 1), x.get("period") or "", stamp(x["knownAt"])))
            result = pd.Series([x["values"][field] for x in found], dtype=object)
        else:
            result = indicator(self.bars(frame), field)
        self.cache[key] = result
        return result


def combine(values, logic):
    if logic == "AND":
        return False if False in values else None if None in values else True
    return True if True in values else None if None in values else False


def condition(c, data, monthly):
    field = c.get("field", c.get("left"))
    frame = "1mo" if monthly else c.get("leftFrame", "1d")
    left = data.values(field, frame)
    missing = {"matched": None, "field": field, "reason": f"Missing/insufficient {field} ({frame}) history or dated facts"}
    if monthly:
        # Diagnose both operands, including the lookback. A failed data request is
        # not evidence of an IPO, and preferred EMA warm-up is not minimum age.
        required = [field]
        if c.get('operand') == 'field':
            required.append(c.get('compareField'))
        # A missing fundamental must remain a data gap even if its technical
        # comparison also lacks history.
        if any(operand in FACTS and data.values(operand, frame).empty for operand in required):
            required = []
        for operand in sorted(required, key=indicator_months, reverse=True):
            if operand not in TECHNICAL:
                continue
            bars = data.bars('1mo')
            needed = indicator_months(operand) + (int(c.get('lookback', 1)) if c['operator'] in {'crossAbove', 'crossBelow', 'increasing', 'decreasing'} else 0)
            if len(bars) < needed:
                code = data.monthly_history_issue or ('insufficient_monthly_history' if len(bars) or not data.daily.empty or data.monthly_history_checked else 'missing_history')
                missing = {**missing, 'code': code, 'historyField': operand, 'availableMonths': len(bars), 'requiredMonths': needed,
                           'reason': f'{operand}: {len(bars)} of {needed} completed monthly candles available. '
                                     + ({'stale_history': 'Latest completed month is missing.', 'history_gap': 'History has a gap; consecutive candles are required.',
                                         'missing_history': 'Price history is not loaded; listing age is not yet known.'}.get(code, 'More monthly history is needed; the forming month is excluded.'))}
                break
    if left.empty:
        return missing
    op = c["operator"]
    if field == 'pledge' and left.iloc[-1] == 'not-applicable':
        # A verified no-promoter filing has no percentage denominator. It meets
        # a nonnegative maximum-encumbrance guardrail without fabricating 0%.
        threshold = c.get('value')
        upper_limit = c.get('operand', c.get('rightType')) not in ('field', 'indicator') and isinstance(threshold, (int, float))
        passed = upper_limit and (op == 'lte' and threshold >= 0 or op == 'lt' and threshold > 0)
        return {'matched': True if passed else None, 'field': field, 'code': 'no_promoters',
                'reason': 'No promoter holding in the verified filing; pledge percentage is not applicable. '
                          + ('Meets the maximum-encumbrance limit.' if passed else 'This comparison requires a promoter holding percentage.')}
    if op in ("is", "isNot", "in", "notIn"):
        value = left.iloc[-1]
        selected = c.get("choices", [])
        actual = value if isinstance(value, list) else [value]
        found = bool(set(str(x).lower() for x in actual) & set(str(x).lower() for x in selected))
        return {"matched": not found if op in ("isNot", "notIn") else found, "field": field}
    try:
        a = float(left.iloc[-1])
        right_field = c.get("compareField", c.get("right"))
        use_field = c.get("operand", c.get("rightType")) in ("field", "indicator")
        right = data.values(right_field, "1mo" if monthly else c.get("rightFrame", frame)) if use_field else None
        multiplier = float(c.get("multiplier", 1)) if use_field else 1
        b = float(right.iloc[-1] if use_field else c.get("value", 0)) * multiplier
        if not math.isfinite(a) or not math.isfinite(b):
            return missing
        matched = False
        if op in ("crossAbove", "crossBelow", "increasing", "decreasing"):
            lookback = int(c.get("lookback", 1))
            if not 1 <= lookback <= 120 or len(left) < lookback+1:
                return missing
            if use_field and frame != c.get("rightFrame", frame) and not monthly:
                # Align higher-timeframe observations to each earlier decision time in the caller.
                return {**missing, "reason": "Crossovers require matching operand timeframes"}
            a_values = [float(x) for x in left.iloc[-lookback-1:]]
            b_values = [float(x)*multiplier for x in right.iloc[-lookback-1:]] if use_field else [b]*(lookback+1)
            if len(b_values) != len(a_values) or not all(math.isfinite(x) for x in a_values+b_values):
                return missing
            if op == "increasing": matched = all(y>x for x,y in zip(a_values, a_values[1:]))
            elif op == "decreasing": matched = all(y<x for x,y in zip(a_values, a_values[1:]))
            elif op == "crossAbove": matched = any(a_values[i-1] <= b_values[i-1] and a_values[i] > b_values[i] for i in range(1,len(a_values)))
            else: matched = any(a_values[i-1] >= b_values[i-1] and a_values[i] < b_values[i] for i in range(1,len(a_values)))
        elif op == "gt": matched = a > b
        elif op == "gte": matched = a >= b
        elif op == "lt": matched = a < b
        elif op == "lte": matched = a <= b
        elif op == "eq": matched = a == b
        elif op == "neq": matched = a != b
        elif op == "between": matched = b <= a <= float(c["upper"])
        elif op == "notBetween": matched = not b <= a <= float(c["upper"])
        elif op in ("within", "aboveBy", "belowBy"):
            if b == 0: return missing
            distance = float(c.get("distance", c.get("tolerance", 2)))
            delta = (a-b)/abs(b)*100
            matched = abs(delta) <= distance if op == "within" else delta >= distance if op == "aboveBy" else delta <= -distance
        return {"matched": bool(matched), "field": field, "left": a, "right": b}
    except (ValueError, TypeError, IndexError):
        return missing


def evaluate(rule, instrument, cutoff):
    monthly = validate_rule(rule)
    data = Observations(instrument, cutoff)
    return evaluate_observations(rule, instrument["id"], data, monthly)


def evaluate_observations(rule, instrument_id, data, monthly=False):
    groups = [[condition(c, data, monthly) for c in group["conditions"]] for group in rule["groups"]]
    matched = combine([combine([c["matched"] for c in checks], group["logic"]) for checks, group in zip(groups, rule["groups"])], rule["logic"])
    missing = [c for group in groups for c in group if c['matched'] is None]
    awaiting = monthly and missing and all(c.get('code') == 'insufficient_monthly_history' for c in missing)
    return {"id": instrument_id, "matched": matched, "status": ('awaiting_history' if awaiting else 'unavailable') if matched is None else "qualified" if matched else "rejected",
            "checks": [c for group in groups for c in group]}


def indicator_months(field):
    ma = re.fullmatch(r'(?:ema|sma)(\d+)', field)
    returns = re.fullmatch(r'return(\d+)m', field)
    return int(ma[1]) if ma else int(returns[1]) + 1 if returns else {
        'rsi': 15, 'atr': 14, 'macd': 26, 'macdSignal': 34, 'avgVolume6': 7,
        'avgVolume20': 21, 'rvol': 21, 'volumeRatio': 21, 'priceChange': 2,
    }.get(field, 1)
