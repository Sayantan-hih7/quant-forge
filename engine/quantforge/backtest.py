"""Long-only portfolio replay. Signals at close, fills at the next available bar open.

All indicators use completed observations. Simultaneous stop/target touches choose
the stop; gaps cross stops at the opening price. End positions remain marked open.
"""
import math
import pandas as pd
from .market import stamp, IST
from .replay import ReplayObservations
from .rules import evaluate_observations, validate_rule


def run_backtest(body):
    strategy, config = body["strategy"], body["config"]
    risk = strategy["risk"]
    for rule in (strategy["entry"], strategy["exit"]):
        validate_rule(rule)
    start, end = stamp(config["from"]), stamp(config["to"])
    maximum = 1827 if strategy["entry"]["cadence"] == "daily" else 91
    if end <= start or end - start > pd.Timedelta(days=maximum):
        raise ValueError("Use at most five years for daily strategies or 90 days for intraday strategies")
    data = {x["id"]: ReplayObservations(x, end) for x in body["instruments"]}
    # Replay at the finest stored granularity so stops are not inferred from a
    # large execution candle and higher-timeframe signals can close independently.
    frame = "1d" if strategy["entry"]["cadence"] == "daily" and risk["timeframe"] == "1d" else "1m"
    events = {}
    missing, coverage = [], []
    for ident, obs in data.items():
        bars = obs.bars(frame)
        selected = bars.loc[(bars.index >= start) & (bars.end <= end)] if len(bars) else bars
        if selected.empty:
            missing.append(ident)
        else:
            coverage.append({"instrumentId": ident, "bars": len(selected), "from": selected.index[0].isoformat(), "to": selected.end.iloc[-1].isoformat()})
        for time, row in selected.iterrows():
            events.setdefault(time, []).append((ident, row))
    if missing:
        raise ValueError(f"Missing {frame} history inside the requested range for {len(missing)} stocks. Import candles before running.")
    if len(events) > 100000:
        raise ValueError("Shorten the replay range")
    if not events:
        raise ValueError("No completed candles in this date range")
    capital = round(risk["initialCapital"] * 100)
    cash, positions, pending, marks, trades, curve = capital, {}, {}, {}, [], []
    unknown, decisions, total_fees = 0, 0, 0
    fee_rate, slip = risk["feePercent"] / 100, risk["slippagePercent"] / 100
    snapshots = sorted(body.get("snapshots", []), key=lambda x: x["publishedAt"])
    fixed_ids = set(config.get("ids", []))
    signal_frame = "1d" if strategy["entry"]["cadence"] == "daily" else strategy["entry"]["cadence"]
    signal_ends = {ident: set(obs.bars(signal_frame).end) for ident, obs in data.items()}

    def eligible(ident, at):
        if config["universe"] == "current":
            return ident in fixed_ids
        month = at.tz_convert(IST).strftime("%Y-%m")
        available = [s for s in snapshots if s["month"] == month and stamp(s["publishedAt"]) <= at]
        return bool(available) and any(m["instrumentId"] == ident and (config.get("includeManual") or m["source"] == "scan") for m in available[-1]["members"])

    def equity():
        return cash + sum(p["quantity"] * round(marks[i] * 100) for i, p in positions.items())

    def sell(ident, price, at, reason):
        nonlocal cash, total_fees
        p = positions.pop(ident)
        fill = round(price * (1-slip) * 100)
        gross = fill * p["quantity"]
        fee = round(gross * fee_rate)
        total_fees += fee
        cash += gross - fee
        trades.append({"instrumentId": ident, "entryAt": p["entryAt"], "exitAt": at.isoformat(), "quantity": p["quantity"],
                       "entry": p["entry"] / 100, "exit": fill / 100, "pnl": (gross-fee-p["cost"]) / 100, "reason": reason})
        pending.pop(ident, None)

    for at in sorted(events):
        rows = sorted(events[at], key=lambda x: x[0])
        for ident, row in rows:
            marks[ident] = float(row.open)
        # Exits release cash before entries at the same time.
        for ident, row in rows:
            order = pending.get(ident)
            local = at.tz_convert(IST)
            overdue = ident in positions and stamp(positions[ident]["entryAt"]).tz_convert(IST).date() < local.date()
            if ident in positions and (order and order["side"] == "SELL" or not risk["overnight"] and (local.hour * 60 + local.minute >= 915 or overdue)):
                sell(ident, float(row.open), at, "Sell rule" if order and order["side"] == "SELL" else "Session close")
        for ident, row in rows:
            order = pending.pop(ident, None)
            if not order or order["side"] != "BUY" or ident in positions or len(positions) >= risk["maxPositions"] or not eligible(ident, at):
                continue
            if not risk["overnight"] and (at.tz_convert(IST).date() != order["date"] or at.tz_convert(IST).hour * 60 + at.tz_convert(IST).minute >= 915):
                continue
            fill = round(float(row.open) * (1+slip) * 100)
            distance = round(order["atr"] * risk["atrMultiplier"] * 100) if risk["stopMode"] == "ATR" and order["atr"] else round(fill*risk["stopPercent"]/100) if risk["stopMode"] != "ATR" else 0
            if distance <= 0 or distance >= fill:
                continue
            quantity = min(math.floor(equity()*risk["riskPercent"]/100/distance), math.floor(cash/(fill*(1+fee_rate))))
            cost = fill*quantity + round(fill*quantity*fee_rate)
            if quantity < 1 or cost > cash:
                continue
            cash -= cost
            total_fees += cost - fill * quantity
            positions[ident] = {"quantity": quantity, "entry": fill, "cost": cost, "entryAt": at.isoformat(),
                                "stop": (fill-distance)/100, "target": (fill+distance*risk["targetR"])/100}
        for ident, row in rows:
            p = positions.get(ident)
            if p:
                if row.low <= p["stop"]:
                    sell(ident, min(float(row.open), p["stop"]), at, "Stop loss")
                elif row.high >= p["target"]:
                    sell(ident, p["target"], at, "Target")
                elif risk["stopMode"] == "trailing":
                    # A new high adjusts the stop for the next bar, avoiding
                    # assuming the unknown order of this bar's high and low.
                    p["stop"] = max(p["stop"], float(row.high)*(1-risk["stopPercent"]/100))
            marks[ident] = float(row.close)
            obs = data[ident]
            obs.cutoff = stamp(row.end)
            if obs.cutoff not in signal_ends[ident]:
                continue
            side = "SELL" if ident in positions else "BUY"
            if side == "BUY" and not eligible(ident, obs.cutoff):
                continue
            result = evaluate_observations(strategy["exit"] if side == "SELL" else strategy["entry"], ident, obs)
            decisions += 1
            unknown += int(result["matched"] is None)
            if result["matched"]:
                pending[ident] = {"side": side, "atr": obs.atr(risk["timeframe"], risk["atrPeriod"]), "date": obs.cutoff.tz_convert(IST).date()}
        curve.append({"at": max(row.end for _, row in rows).isoformat(), "equity": equity()/100})
    peak, max_dd = capital/100, 0
    for point in curve:
        peak = max(peak, point["equity"])
        max_dd = max(max_dd, (peak-point["equity"])/peak*100)
    # Keep all trades, downsample only the chart; metrics use the full sequence.
    stride = max(1, math.ceil(len(curve)/1500))
    wins = sum(t["pnl"] > 0 for t in trades)
    profit = sum(max(0, t["pnl"]) for t in trades)
    loss = -sum(min(0, t["pnl"]) for t in trades)
    return {"initialCapital": capital/100, "equity": equity()/100, "cash": cash/100,
            "netPnl": (equity()-capital)/100, "maxDrawdownPercent": max_dd, "unavailableDecisions": unknown,
            "decisions": decisions, "totalFees": total_fees/100, "returnPercent": (equity()-capital)/capital*100,
            "winRate": wins/len(trades)*100 if trades else None, "profitFactor": profit/loss if loss else None,
            "realizedPnl": sum(t["pnl"] for t in trades), "coverage": coverage,
            "trades": trades, "openPositions": [{"instrumentId": i, **p, "mark": marks[i]} for i,p in positions.items()],
            "curve": curve[::stride] + ([curve[-1]] if (len(curve)-1) % stride else []),
            "assumptions": ["Long-only cash equities; deterministic symbol order for simultaneous entries.",
                            "Next stored bar open with configured slippage and estimated fees; stop first if both stop and target touch.",
                            "Open positions are marked at the final stored close, not forcibly sold.",
                            "Current-list research has selection bias; historical mode uses only lists recorded at the time.",
                            "Fees are a flat estimate per side, not a broker contract-note tax calculation. Slippage is applied per fill.",
                            "Replay uses provider OHLCV. Dividends and corporate-action cash/share adjustments are not separately modelled."]}
