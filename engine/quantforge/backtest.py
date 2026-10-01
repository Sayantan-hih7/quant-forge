"""Long-only portfolio replay. Signals at close, fills at the next available bar open.

All indicators use completed observations. Simultaneous stop/target touches choose
the stop; gaps cross stops at the opening price. End positions remain marked open.
"""
import math
import pandas as pd
from .market import stamp, IST
from .replay import ReplayObservations
from .rules import evaluate_observations, validate_rule, entry_event_keys
from .exit_targets import InvalidTargetPriceError, position_targets, validate_targets
from .stop_management import advance_stop, initial_risk_distance, validate_stop_settings, exceeds_stop_limit
from .replay_trace import ReplayTrace, signal_candle


def run_backtest(body):
    strategy, config = body["strategy"], body["config"]
    risk = strategy["risk"]
    validate_targets(risk)
    validate_stop_settings(risk)
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
    trace = ReplayTrace(body.get('replayInstrumentId'), enabled=body.get('recordReplay', True))
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
    closed_pnls = []
    consumed_events = {ident: set() for ident in data}
    unknown, decisions, total_fees = 0, 0, 0
    unavailable_inputs = {}
    invalid_target_entries = 0
    invalid_stop_entries, unfilled_limits = 0, 0
    stop_limit_entries = 0
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

    def sell(ident, price, at, reason, quantity=None, phase='close', available_at=None):
        nonlocal cash, total_fees
        p = positions[ident]
        quantity = p["quantity"] if quantity is None else min(quantity, p["quantity"])
        if quantity <= 0:
            return
        allocated_cost = p["cost"] if quantity == p["quantity"] else math.floor(p["cost"] * quantity / p["quantity"] + 0.5)
        fill = round(price * (1-slip) * 100)
        gross = fill * quantity
        fee = round(gross * fee_rate)
        total_fees += fee
        cash += gross - fee
        pnl = gross - fee - allocated_cost
        p["quantity"] -= quantity
        p["cost"] -= allocated_cost
        p["realizedPaise"] += pnl
        trades.append({"instrumentId": ident, "entryAt": p["entryAt"], "exitAt": at.isoformat(), "quantity": quantity,
                       "remainingQuantity": p["quantity"], "entry": p["entry"] / 100, "exit": fill / 100, "pnl": pnl / 100, "reason": reason})
        trace.add('exit', ident, p['entryAt'], available_at or at.isoformat(), phase, side='SELL',
                  fillAt=at.isoformat(), price=fill / 100, quantity=quantity, remainingQuantity=p['quantity'],
                  pnl=pnl / 100, reason=reason, stop=p['stop'])
        if p["quantity"] == 0:
            closed_pnls.append(p["realizedPaise"] / 100)
            positions.pop(ident)
        pending.pop(ident, None)

    for at in sorted(events):
        rows = sorted(events[at], key=lambda x: x[0])
        intrabar_entries = set()
        for ident, row in rows:
            marks[ident] = float(row.open)
        # Exits release cash before entries at the same time.
        for ident, row in rows:
            order = pending.get(ident)
            local = at.tz_convert(IST)
            overdue = ident in positions and stamp(positions[ident]["entryAt"]).tz_convert(IST).date() < local.date()
            if ident in positions and (order and order["side"] == "SELL" or not risk["overnight"] and (local.hour * 60 + local.minute >= 915 or overdue)):
                if order and order['side'] == 'SELL':
                    trace.signal(ident, positions[ident]['entryAt'], order)
                sell(ident, float(row.open), at, "Sell rule" if order and order["side"] == "SELL" else "Session close", phase='open')
        for ident, row in rows:
            order = pending.pop(ident, None)
            if not order or order["side"] != "BUY" or ident in positions or len(positions) >= risk["maxPositions"] or not eligible(ident, at):
                continue
            if not risk["overnight"] and (at.tz_convert(IST).date() != order["date"] or at.tz_convert(IST).hour * 60 + at.tz_convert(IST).minute >= 915):
                unfilled_limits += int(order.get("limit") is not None)
                continue
            limit = order.get("limit")
            if limit is not None:
                date = at.tz_convert(IST).date()
                if order.get("limitSessionDate", date) != date:
                    unfilled_limits += 1
                    continue
                if round(float(row.low) * 100) > limit:
                    if frame == "1d" or stamp(row.end).tz_convert(IST).hour * 60 + stamp(row.end).tz_convert(IST).minute >= (930 if risk["overnight"] else 915):
                        unfilled_limits += 1
                    else:
                        pending[ident] = {**order, "limitSessionDate": date}
                    continue
            intrabar_fill = limit is not None and round(float(row.open) * 100) > limit
            fill = limit if intrabar_fill else min(round(float(row.open) * (1+slip) * 100), limit or math.inf)
            distance = initial_risk_distance(risk, fill, order["atr"], order.get('signalLow'))
            if distance <= 0 or distance >= fill:
                invalid_stop_entries += 1
                continue
            if exceeds_stop_limit(risk, fill, distance):
                stop_limit_entries += 1
                continue
            quantity = min(math.floor(equity()*risk["riskPercent"]/100/distance), math.floor(cash/(fill*(1+fee_rate))))
            cost = fill*quantity + round(fill*quantity*fee_rate)
            if quantity < 1 or cost > cash:
                continue
            try:
                targets = position_targets(risk, fill, quantity, distance)
            except InvalidTargetPriceError:
                invalid_target_entries += 1
                continue
            cash -= cost
            total_fees += cost - fill * quantity
            positions[ident] = {"quantity": quantity, "initialQuantity": quantity, "initialRiskPaise": distance, "entry": fill, "cost": cost, "entryAt": at.isoformat(), "realizedPaise": 0, "targets": targets,
                                "stop": (fill-distance)/100, "target": (fill+distance*risk["targetR"])/100}
            if intrabar_fill:
                intrabar_entries.add(ident)
            if targets:
                positions[ident]["target"] = next(t["price"] for t in targets if not t["completed"])
            trace.signal(ident, at.isoformat(), order)
            trace.add('entry', ident, at.isoformat(), row.end.isoformat() if intrabar_fill else at.isoformat(),
                      'close' if intrabar_fill else 'open', side='BUY', fillAt=at.isoformat(), price=fill / 100,
                      quantity=quantity, remainingQuantity=quantity, stop=(fill-distance)/100, initialRisk=distance/100,
                      reason='Limit filled inside candle' if intrabar_fill else 'Next candle open',
                      targets=[dict(number=n+1, price=t['price'], quantity=t['quantity']) for n,t in enumerate(targets)]
                      if targets else [dict(number=1, price=positions[ident]['target'], quantity=quantity)])
        for ident, row in rows:
            p = positions.get(ident)
            if p:
                if row.low <= p["stop"]:
                    sell(ident, min(float(row.open), p["stop"]), at, "Stop loss", available_at=row.end.isoformat())
                elif ident not in intrabar_entries:
                    if p["targets"]:
                        for index, target in enumerate(p["targets"]):
                            if target["completed"] or row.high < target["price"]:
                                continue
                            quantity = p["quantity"] if index == len(p["targets"]) - 1 else target["quantity"]
                            sell(ident, target["price"], at, f"Target {index + 1}", quantity, available_at=row.end.isoformat())
                            target["completed"] = True
                            target["filledQuantity"] = quantity
                            if ident not in positions:
                                break
                            p["target"] = next(t["price"] for t in p["targets"] if not t["completed"])
                    elif row.high >= p["target"]:
                        sell(ident, p["target"], at, "Target", available_at=row.end.isoformat())
                if ident in positions and ident not in intrabar_entries:
                    # New stops take effect next bar; never infer high/low order.
                    previous_stop = p['stop']
                    advance_stop(p, risk, round(float(row.high) * 100))
                    if p['stop'] != previous_stop:
                        trace.add('stop', ident, p['entryAt'], row.end.isoformat(), 'close', previousStop=previous_stop,
                                  stop=p['stop'], remainingQuantity=p['quantity'], effective='next-bar',
                                  reason='Trailing / target protection' if p.get('trailingActivated') else 'Breakeven / target protection')
            marks[ident] = float(row.close)
            obs = data[ident]
            obs.cutoff = stamp(row.end)
            if obs.cutoff not in signal_ends[ident]:
                continue
            side = "SELL" if ident in positions else "BUY"
            if side == "BUY" and not eligible(ident, obs.cutoff):
                continue
            result = evaluate_observations(strategy["exit"] if side == "SELL" else strategy["entry"], ident, obs,
                                           consumed_events=consumed_events[ident] if side == 'BUY' else None)
            decisions += 1
            unknown += int(result["matched"] is None)
            if result['matched'] is None:
                for check in result['checks']:
                    if check['matched'] is None:
                        key = (check.get('missingField', check['field']), check.get('reason', 'Input unavailable'))
                        unavailable_inputs[key] = unavailable_inputs.get(key, 0) + 1
            if result["matched"] and ident not in pending:
                signal_low = obs.signal_low(risk['timeframe']) if risk['stopMode'] == 'candleLow' else None
                if side == 'BUY' and risk['stopMode'] == 'candleLow' and (signal_low is None or not math.isfinite(signal_low) or signal_low <= 0):
                    unknown += 1
                    unavailable_inputs[('low', 'Completed signal candle low unavailable')] = unavailable_inputs.get(('low', 'Completed signal candle low unavailable'), 0) + 1
                    continue
                if side == 'BUY':
                    consumed_events[ident].update(entry_event_keys(strategy['entry'], result))
                pending[ident] = {"side": side, "atr": obs.atr(risk["timeframe"], risk["atrPeriod"]), "date": obs.cutoff.tz_convert(IST).date(),
                                  "signalAt": obs.cutoff.isoformat(), "checks": result['checks'],
                                  "signalCandle": signal_candle(obs, signal_frame),
                                  "signalLow": signal_low,
                                  "limit": round(risk["entryLimitPrice"] * 100) if side == "BUY" and risk.get("entryOrderType") == "limit" else None}
        curve.append({"at": max(row.end for _, row in rows).isoformat(), "equity": equity()/100})
    peak, max_dd = capital/100, 0
    for point in curve:
        peak = max(peak, point["equity"])
        max_dd = max(max_dd, (peak-point["equity"])/peak*100)
    # Keep all trades, downsample only the chart; metrics use the full sequence.
    stride = max(1, math.ceil(len(curve)/1500))
    wins = sum(pnl > 0 for pnl in closed_pnls)
    profit = sum(max(0, pnl) for pnl in closed_pnls)
    loss = -sum(min(0, pnl) for pnl in closed_pnls)
    return {"initialCapital": capital/100, "equity": equity()/100, "cash": cash/100,
            "netPnl": (equity()-capital)/100, "maxDrawdownPercent": max_dd, "unavailableDecisions": unknown,
            "unavailableInputs": [{"field": field, "reason": reason, "checks": count} for (field, reason), count in sorted(unavailable_inputs.items())],
            "invalidTargetEntries": invalid_target_entries,
            "invalidStopEntries": invalid_stop_entries, "stopLimitEntries": stop_limit_entries, "unfilledLimitEntries": unfilled_limits,
            "decisions": decisions, "totalFees": total_fees/100, "returnPercent": (equity()-capital)/capital*100,
            "closedTrades": len(closed_pnls), "winRate": wins/len(closed_pnls)*100 if closed_pnls else None, "profitFactor": profit/loss if loss else None,
            "realizedPnl": sum(t["pnl"] for t in trades), "coverage": coverage,
            "trades": trades, "openPositions": [{"instrumentId": i, **p, "mark": marks[i]} for i,p in positions.items()],
            "replay": trace.result(frame),
            "curve": curve[::stride] + ([curve[-1]] if (len(curve)-1) % stride else []),
            "assumptions": ["Long-only cash equities; deterministic symbol order for simultaneous entries.",
                            "Each crossover event can trigger one entry attempt per stock; state-only entry conditions can match again. Manual paper entries remain independent.",
                            "Candle-low stops use the last completed candle in the risk timeframe at signal time, frozen before entry. Invalid or missing stop levels cannot open a position.",
                            "Per-target stop steps require a non-zero target fill, never lower an existing stop, and apply on the next replay bar.",
                            "Next stored bar open with configured slippage and estimated fees; stop first if both stop and target touch.",
                            "Partial exits use original position size, rounded to whole shares; the last target closes the remainder. Win rate counts fully closed positions, not individual exits.",
                            "Percentage and rupee gains are measured from the filled entry; exact target prices stay fixed. Entries are skipped if target prices are not above entry or distinct after rounding to paise.",
                            "1R is the initial filled entry minus its initial stop and stays fixed. Breakeven can activate at a profit multiple or filled partial target; trailing uses a fixed R distance from the highest price after activation and never lowers the stop.",
                            "Limit buys require a later candle to trade at the limit or lower; fills never exceed the limit. Unfilled orders expire at session end. A limit filled inside a candle can stop out that candle, but targets and stop adjustments wait until a later bar because the earlier high may precede entry.",
                            "Breakeven means entry price before fees and slippage. New breakeven and trailing stops apply from the next replay bar because the intrabar path is unknown; paper trading uses subsequent live ticks.",
                            "Open positions are marked at the final stored close, not forcibly sold.",
                            "Current-list research has selection bias; historical mode uses only lists recorded at the time.",
                            "Fees are a flat estimate per side, not a broker contract-note tax calculation. Slippage is applied per fill.",
                            "Replay uses provider OHLCV. Dividends and corporate-action cash/share adjustments are not separately modelled."]}
