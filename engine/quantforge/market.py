from datetime import timedelta, timezone
import math
import pandas as pd

IST = timezone(timedelta(hours=5, minutes=30))
FRAME_MINUTES = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240}


def stamp(value):
    result = pd.Timestamp(value)
    return result.tz_localize("UTC") if result.tzinfo is None else result.tz_convert("UTC")


def candles(rows, cutoff, interval="1d"):
    """Validate before aggregation; duplicates with conflicting values fail closed."""
    records = {}
    for row in rows:
        t = stamp(row["time"])
        values = {key: float(row[key]) for key in ["open", "high", "low", "close", "volume"]}
        if not all(math.isfinite(v) for v in values.values()):
            raise ValueError("Non-finite candle value")
        o, h, l, c, v = (values[k] for k in ["open", "high", "low", "close", "volume"])
        if min(o, h, l, c) <= 0 or v < 0 or h < max(o, c, l) or l > min(o, c):
            raise ValueError("Invalid OHLCV candle")
        local = t.tz_convert(IST)
        if interval == "1d":
            start = local.normalize() + pd.Timedelta(hours=9, minutes=15)
            end = local.normalize() + pd.Timedelta(hours=15, minutes=30)
        else:
            minute = local.hour * 60 + local.minute
            if minute < 555 or minute >= 930 or local.second != 0:
                raise ValueError("Intraday candle outside the regular IST session")
            start, end = t, t + pd.Timedelta(minutes=1)
        if end > stamp(cutoff):
            continue
        key = start.tz_convert("UTC")
        if key in records and records[key] != values:
            raise ValueError("Conflicting duplicate candle")
        records[key] = values
    if not records:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume", "end"])
    df = pd.DataFrame.from_dict(records, orient="index").sort_index()
    if interval == "1d":
        df["end"] = df.index.tz_convert(IST).normalize() + pd.Timedelta(hours=15, minutes=30)
    else:
        df["end"] = df.index + pd.Timedelta(minutes=1)
    return df


def timeframe(daily, intraday, frame, cutoff):
    if frame == "1d":
        return daily
    if frame == "1m":
        return intraday
    rows = []
    source = daily if frame in ("1w", "1mo", "1q") else intraday
    if source.empty:
        return source
    groups = {}
    for t, row in source.iterrows():
        local = t.tz_convert(IST)
        if frame == "1mo":
            start = local.normalize().replace(day=1)
            end = start + pd.offsets.MonthBegin(1)
        elif frame == "1q":
            start = local.normalize().replace(month=(local.month - 1) // 3 * 3 + 1, day=1)
            end = start + pd.offsets.MonthBegin(3)
        elif frame == "1w":
            start = local.normalize() - pd.Timedelta(days=local.weekday())
            end = start + pd.Timedelta(days=7)
        elif frame in FRAME_MINUTES:
            session = local.normalize() + pd.Timedelta(hours=9, minutes=15)
            size = FRAME_MINUTES[frame]
            start = session + pd.Timedelta(minutes=int((local - session).total_seconds() // 60) // size * size)
            end = min(start + pd.Timedelta(minutes=size), session + pd.Timedelta(minutes=375))
        else:
            raise ValueError(f"Unsupported timeframe: {frame}")
        if end <= stamp(cutoff):
            groups.setdefault((start, end), []).append((t, row))
    for (start, end), group in groups.items():
        if frame in FRAME_MINUTES and len(group) != int((end-start).total_seconds() // 60):
            continue  # Do not invent missing intraday minutes.
        rows.append({"time": start, "end": end, "open": group[0][1].open,
                     "high": max(x[1].high for x in group), "low": min(x[1].low for x in group),
                     "close": group[-1][1].close, "volume": sum(x[1].volume for x in group)})
    return pd.DataFrame(rows).set_index("time") if rows else source.iloc[:0]
