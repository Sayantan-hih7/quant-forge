import re
import math
import numpy as np
import pandas as pd
from .market import candles, timeframe, stamp, IST
from .field_catalog import FIELDS, REPORT_FIELDS, parameters, operand_parameters

TECHNICAL = {"close", "open", "high", "low", "volume", "ema5", "ema20", "ema21", "ema50",
             "sma50", "sma200", "rsi", "atr", "rvol", "volumeRatio", "avgVolume20", "avgVolume6", "macd", "macdSignal",
             "vwap", "priceChange", "return1m", "return3m", "return6m", "return12m"}
FACTS = {"marketCap", "debtEquity", "pledge", "delivery", "roe", "roce", "pe", "growth",
         "revenueGrowth", "profitGrowth", "promoterHolding", "fiiChange", "diiChange",
         "positiveQuarters", "sector", "index", "fnoEligible", "turnover", "tradedValue"}
TECHNICAL |= {key for key, value in FIELDS.items() if value['source'] in ('candles', 'dailyReports')}
OPERATORS = {"gt", "gte", "lt", "lte", "eq", "neq", "between", "notBetween", "crossAbove",
             "crossBelow", "increasing", "decreasing", "within", "aboveBy", "belowBy",
             "is", "isNot", "in", "notIn"}


def validate_rule(rule):
    if rule.get('enabled') is False:
        if rule.get('side') != 'SELL' or rule.get('tier') != 'tactical':
            raise ValueError('Only tactical sell conditions can be disabled')
        return False
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
            parameters(left, *operand_parameters(c, monthly))
            if left in FIELDS:
                definition = FIELDS[left]
                if monthly and not definition['monthly']:
                    raise ValueError(f'{left} is not a monthly qualification field')
                if not monthly and left not in FACTS and frame not in definition['frames']:
                    raise ValueError(f'{left}: unsupported timeframe')
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
                parameters(right, *operand_parameters(c, monthly, True))
                if right in FIELDS and (monthly and not FIELDS[right]['monthly'] or not monthly and right not in FACTS and right_frame not in FIELDS[right]['frames']):
                    raise ValueError(f'{right}: unsupported comparison timeframe')
                if left in FIELDS and right in FIELDS and FIELDS[left]['unit'] != FIELDS[right]['unit']:
                    raise ValueError('Compare fields with matching units')
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


def indicator(df, field, period=None):
    period, _ = parameters(field, period)
    if df.empty:
        return pd.Series(dtype=float)
    if field in ("open", "high", "low", "close", "volume"):
        return df[field]
    if field in ('ema', 'sma'):
        return df.close.ewm(span=period, adjust=False, min_periods=period).mean() if field == 'ema' else df.close.rolling(period).mean()
    if field in ('highestHigh', 'lowestLow'):
        return df.high.rolling(period).max() if field == 'highestHigh' else df.low.rolling(period).min()
    if field in ('high52w', 'low52w'):
        # Actual 52-week time window; an IPO's shorter history does not qualify.
        result = df.high.rolling('364D').max() if field == 'high52w' else df.low.rolling('364D').min()
        return result.where(df.index >= df.index[0] + pd.Timedelta(days=364))
    if field in ('bodyAboveEma', 'bodyBelowEma'):
        ema = df.close.ewm(span=period, adjust=False, min_periods=period).mean()
        top, bottom = df[['open', 'close']].max(axis=1), df[['open', 'close']].min(axis=1)
        above = ((top - ema).clip(lower=0) / (top - bottom).replace(0, np.nan)).clip(upper=1) * 100
        return above if field == 'bodyAboveEma' else 100 - above
    if field == 'bodyPercent':
        return (df.close - df.open).abs() / (df.high - df.low).replace(0, np.nan) * 100
    ma = re.fullmatch(r"(ema|sma)(\d+)", field)
    if ma:
        n = int(ma[2])
        return df.close.ewm(span=n, adjust=False, min_periods=n).mean() if ma[1] == "ema" else df.close.rolling(n).mean()
    if field == "rsi":
        return rsi(df.close, period)
    if field == "atr":
        tr = pd.concat([df.high-df.low, (df.high-df.close.shift()).abs(), (df.low-df.close.shift()).abs()], axis=1).max(axis=1)
        return wilder(tr, period)
    if field == 'avgVolume':
        return df.volume.shift().rolling(period).mean()
    if field in ("avgVolume20", "avgVolume6"):
        return df.volume.shift().rolling(20 if field == "avgVolume20" else 6).mean()
    if field in ("rvol", "volumeRatio"):
        return df.volume / df.volume.shift().rolling(period).mean().replace(0, np.nan)
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
    if field in ("bollingerUpper", "bollingerLower", "bollingerBandwidth"):
        mid = df.close.rolling(period).mean()
        std = df.close.rolling(period).std()
        if field == "bollingerUpper": return mid + 2*std
        if field == "bollingerLower": return mid - 2*std
        return (4*std) / mid.replace(0, np.nan) * 100
    if field in ("adx", "diPlus", "diMinus"):
        up_move, down_move = df.high.diff(), -df.low.diff()
        plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
        minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)
        tr = pd.concat([df.high-df.low, (df.high-df.close.shift()).abs(), (df.low-df.close.shift()).abs()], axis=1).max(axis=1)
        smoothed_tr = wilder(tr, period)
        plus_di = 100 * wilder(plus_dm, period) / smoothed_tr.replace(0, np.nan)
        minus_di = 100 * wilder(minus_dm, period) / smoothed_tr.replace(0, np.nan)
        if field == "diPlus": return plus_di
        if field == "diMinus": return minus_di
        dx = (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan) * 100
        return wilder(dx, period)
    if field == "supertrend":
        return supertrend(df)
    if field in ("doji", "hammer", "bullishEngulfing", "bearishEngulfing"):
        return candlePattern(df, field)
    if field == "accDist":
        span = (df.high - df.low).replace(0, np.nan)
        money_flow = (((df.close-df.low) - (df.high-df.close)) / span).fillna(0)
        return (money_flow * df.volume).cumsum()
    raise ValueError(f"Unsupported indicator: {field}")


def supertrend(df, period=10, multiplier=3):
    """Standard iterative Supertrend: the stop line flips sides when price closes through it."""
    hl2 = (df.high + df.low) / 2
    tr = pd.concat([df.high-df.low, (df.high-df.close.shift()).abs(), (df.low-df.close.shift()).abs()], axis=1).max(axis=1)
    atr = wilder(tr, period)
    basic_upper, basic_lower = hl2 + multiplier*atr, hl2 - multiplier*atr
    final_upper, final_lower = basic_upper.to_numpy(copy=True), basic_lower.to_numpy(copy=True)
    close = df.close.to_numpy()
    result = np.full(len(df), np.nan)
    start = np.flatnonzero(~np.isnan(basic_upper.to_numpy()))
    if not len(start):
        return pd.Series(result, index=df.index)
    i0 = start[0]
    result[i0] = final_lower[i0]
    for i in range(i0+1, len(df)):
        if not (basic_upper[i] < final_upper[i-1] or close[i-1] > final_upper[i-1]): final_upper[i] = final_upper[i-1]
        if not (basic_lower[i] > final_lower[i-1] or close[i-1] < final_lower[i-1]): final_lower[i] = final_lower[i-1]
        if result[i-1] == final_upper[i-1]:
            result[i] = final_upper[i] if close[i] <= final_upper[i] else final_lower[i]
        else:
            result[i] = final_lower[i] if close[i] >= final_lower[i] else final_upper[i]
    return pd.Series(result, index=df.index)


def candlePattern(df, field):
    body = (df.close - df.open).abs()
    span = (df.high - df.low).replace(0, np.nan)
    upper_wick = df.high - df[["open", "close"]].max(axis=1)
    lower_wick = df[["open", "close"]].min(axis=1) - df.low
    if field == "doji":
        matched = (body / span * 100) <= 5
    elif field == "hammer":
        matched = (lower_wick >= 2*body) & (upper_wick <= body) & (body / span * 100 <= 40)
    elif field == "bullishEngulfing":
        matched = (df.close > df.open) & (df.close.shift() < df.open.shift()) & (df.open <= df.close.shift()) & (df.close >= df.open.shift())
    else:
        matched = (df.close < df.open) & (df.close.shift() > df.open.shift()) & (df.open >= df.close.shift()) & (df.close <= df.open.shift())
    return matched.fillna(False).astype(float)


class Observations:
    def __init__(self, instrument, cutoff):
        self.cutoff = stamp(cutoff)
        self.daily = candles(instrument.get("daily", []), cutoff)
        self.intraday = candles(instrument.get("intraday", []), cutoff, "1m")
        self.facts = instrument.get("facts", [])
        self.reports = instrument.get('reports', [])
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

    def calculate(self, field, frame, period=None):
        bars = self.bars(frame)
        if field in REPORT_FIELDS:
            # Align to EVERY daily candle so an absent last-day report stays NaN.
            by_date = {row['date']: row for row in self.reports if stamp(row['knownAt']) <= self.cutoff}
            values = pd.Series([by_date.get(t.tz_convert(IST).strftime('%Y-%m-%d'), {}).get('turnoverCr', np.nan)
                                for t in bars.index], index=bars.index, dtype=float)
            return values if field == 'dailyTurnover' else values.rolling(period or 20).mean()
        if field in ('high52w', 'low52w') and frame == '1mo':
            daily_values = indicator(self.daily, field)
            # Monthly values observe only daily bars completed before month end.
            return pd.Series([daily_values.loc[self.daily.end <= end].iloc[-1] if (self.daily.end <= end).any() else np.nan
                              for end in bars.end], index=bars.index, dtype=float)
        return indicator(bars, field, period)

    def values(self, field, frame, period=None, offset=0):
        period, offset = parameters(field, period, offset)
        key = field, frame, period, offset
        if key in self.cache:
            return self.cache[key]
        if field in FACTS:
            found = [x for x in self.facts if field in x.get("values", {}) and stamp(x["knownAt"]) <= self.cutoff
                     and (not x.get("validUntil") or stamp(x["validUntil"]) >= self.cutoff)]
            # A late download of an older report cannot supersede a newer reporting period.
            found.sort(key=lambda x: (x.get("priority", 1), x.get("period") or "", stamp(x["knownAt"])))
            result = pd.Series([x["values"][field] for x in found], dtype=object)
        else:
            result = self.calculate(field, frame, period).shift(offset)
        self.cache[key] = result
        return result


def combine(values, logic):
    if logic == "AND":
        return False if False in values else None if None in values else True
    return True if True in values else None if None in values else False


def condition(c, data, monthly):
    field = c.get("field", c.get("left"))
    frame = "1mo" if monthly else c.get("leftFrame", "1d")
    left_period, left_offset = operand_parameters(c, monthly)
    left = data.values(field, frame, left_period, left_offset)
    def unavailable(operand, observation_frame, period, offset):
        period = parameters(operand, period, offset)[0]
        label = FIELDS.get(operand, {}).get('label', operand)
        if period is not None:
            label += f' ({period} candles)'
        if offset:
            label += f', {offset} completed candles earlier'
        reason = f'Missing/insufficient {label} ({observation_frame}) history or dated facts'
        if operand in REPORT_FIELDS:
            reason = f'{label}: the required exchange turnover report or complete averaging window was not available at this decision time. Reports downloaded later cannot fill historical decisions.'
        return {"matched": None, "field": field, "missingField": operand, "reason": reason}

    missing = unavailable(field, frame, left_period, left_offset)
    right_field = c.get("compareField", c.get("right"))
    use_field = c.get("operand", c.get("rightType")) in ("field", "indicator")
    right_frame = "1mo" if monthly else c.get("rightFrame", frame)
    right_period, right_offset = operand_parameters(c, monthly, True) if use_field else (None, 0)
    right_missing = unavailable(right_field, right_frame, right_period, right_offset) if use_field else missing
    monthly_missing = {}
    if monthly:
        # Diagnose both operands, including the lookback. A failed data request is
        # not evidence of an IPO, and preferred EMA warm-up is not minimum age.
        required = [(field, left_period, left_offset)]
        if c.get('operand') == 'field':
            required.append((c.get('compareField'), *operand_parameters(c, monthly, True)))
        # A missing fundamental must remain a data gap even if its technical
        # comparison also lacks history.
        if any(operand in FACTS and data.values(operand, frame).empty for operand, _, _ in required):
            required = []
        for operand, period, offset in sorted(required, key=lambda item: indicator_months(item[0], item[1]) + item[2], reverse=True):
            if operand not in TECHNICAL:
                continue
            bars = data.bars('1mo')
            needed = indicator_months(operand, period) + offset + (int(c.get('lookback', 1)) if c['operator'] in {'crossAbove', 'crossBelow', 'increasing', 'decreasing'} else 0)
            if len(bars) < needed:
                code = data.monthly_history_issue or ('insufficient_monthly_history' if len(bars) or not data.daily.empty or data.monthly_history_checked else 'missing_history')
                monthly_missing[(operand, period, offset)] = {**unavailable(operand, frame, period, offset), 'code': code, 'historyField': operand, 'availableMonths': len(bars), 'requiredMonths': needed,
                           'reason': f'{operand}: {len(bars)} of {needed} completed monthly candles available. '
                                     + ({'stale_history': 'Latest completed month is missing.', 'history_gap': 'History has a gap; consecutive candles are required.',
                                         'missing_history': 'Price history is not loaded; listing age is not yet known.'}.get(code, 'More monthly history is needed; the forming month is excluded.'))}
        missing = monthly_missing.get((field, left_period, left_offset), missing)
        right_missing = monthly_missing.get((right_field, right_period, right_offset), right_missing)
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
        if not math.isfinite(a):
            return missing
        left_missing = missing
        missing = right_missing
        right = data.values(right_field, right_frame, right_period, right_offset) if use_field else None
        multiplier = float(c.get("multiplier", 1)) if use_field else 1
        b = float(right.iloc[-1] if use_field else c.get("value", 0)) * multiplier
        if not math.isfinite(b):
            return missing
        missing = left_missing
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
            if not all(math.isfinite(x) for x in a_values):
                return missing
            if len(b_values) != len(a_values) or not all(math.isfinite(x) for x in b_values):
                return right_missing
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
        result = {"matched": bool(matched), "field": field, "left": a, "right": b}
        if matched and not monthly and op in ('crossAbove', 'crossBelow'):
            crossings = [i for i in range(1, len(a_values)) if (
                a_values[i-1] <= b_values[i-1] and a_values[i] > b_values[i] if op == 'crossAbove'
                else a_values[i-1] >= b_values[i-1] and a_values[i] < b_values[i])]
            event_index = left.iloc[-lookback-1:].index[crossings[-1]]
            result['eventAt'] = stamp(data.bars(frame).loc[event_index, 'end']).isoformat()
        return result
    except (ValueError, TypeError, IndexError):
        return missing


def evaluate(rule, instrument, cutoff):
    monthly = validate_rule(rule)
    data = Observations(instrument, cutoff)
    return evaluate_observations(rule, instrument["id"], data, monthly)


def evaluate_observations(rule, instrument_id, data, monthly=False, consumed_events=None):
    if rule.get('enabled') is False:
        return {'id': instrument_id, 'matched': False, 'status': 'rejected', 'checks': [], 'disabled': True}
    groups = []
    for gi, group in enumerate(rule['groups']):
        checks = []
        for ci, c in enumerate(group['conditions']):
            check = condition(c, data, monthly)
            if check.get('eventAt'):
                check['eventKey'] = f"{gi}.{ci}:{check['eventAt']}"
                if check['eventKey'] in (consumed_events or set()):
                    check.update(matched=False, reason='This crossover already triggered an entry')
            checks.append(check)
        groups.append(checks)
    matched = combine([combine([c["matched"] for c in checks], group["logic"]) for checks, group in zip(groups, rule["groups"])], rule["logic"])
    missing = [c for group in groups for c in group if c['matched'] is None]
    awaiting = monthly and missing and all(c.get('code') == 'insufficient_monthly_history' for c in missing)
    return {"id": instrument_id, "matched": matched, "status": ('awaiting_history' if awaiting else 'unavailable') if matched is None else "qualified" if matched else "rejected",
            "checks": [c for group in groups for c in group]}


def entry_event_keys(rule, result):
    """Consume only crossovers belonging to groups that actually satisfied the rule."""
    offset, keys = 0, []
    for group in rule['groups']:
        checks = result['checks'][offset:offset + len(group['conditions'])]
        offset += len(checks)
        if combine([check['matched'] for check in checks], group['logic']) is True:
            keys.extend(check['eventKey'] for check in checks if check['matched'] is True and check.get('eventKey'))
    return keys


def indicator_months(field, period=None):
    period, _ = parameters(field, period)
    if field == 'adx':
        return 2 * (period or 14) - 1
    if period is not None:
        return period + (1 if field in ('rsi', 'avgVolume', 'rvol', 'volumeRatio') else 0)
    if field in ('high52w', 'low52w'):
        return 13
    ma = re.fullmatch(r'(?:ema|sma)(\d+)', field)
    returns = re.fullmatch(r'return(\d+)m', field)
    return int(ma[1]) if ma else int(returns[1]) + 1 if returns else {
        'rsi': 15, 'atr': 14, 'macd': 26, 'macdSignal': 34, 'avgVolume6': 7,
        'avgVolume20': 21, 'rvol': 21, 'volumeRatio': 21, 'priceChange': 2,
        'supertrend': 10, 'bullishEngulfing': 2, 'bearishEngulfing': 2,
    }.get(field, 1)
