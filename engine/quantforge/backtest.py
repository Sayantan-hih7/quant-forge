from .signal_ranking import signal_score
from .execution_session import execution_close, square_off, entry_cutoff
from .entry_safety import EntrySafety, validate_entry_safety
from .performance_metrics import performance_metrics
"""Long-only portfolio replay. Signals at close, fills at the next available bar open.

All indicators use completed observations. Known opening crossings execute first.
Ambiguous intrabar stop/target touches choose the stop. End positions remain marked open.
"""
from .trading_costs import trade_fee, affordable_shares
import math
import heapq
import pandas as pd
from .market import stamp, IST
from .replay import ReplayObservations
from .rules import evaluate_observations, validate_rule, entry_event_keys
from .exit_targets import InvalidTargetPriceError, position_targets, validate_targets
from .stop_management import advance_stop, initial_risk_distance, validate_stop_settings, exceeds_stop_limit
from .replay_trace import ReplayTrace, signal_candle


def portfolio_events(streams):
    """Merge chronological stock iterators, holding only one row per stock."""
    heap = []
    for ident, iterator in streams.items():
        row = next(iterator, None)
        if row is not None:
            heapq.heappush(heap, (row.Index, ident, row, iterator))
    while heap:
        at, rows = heap[0][0], []
        while heap and heap[0][0] == at:
            _, ident, row, iterator = heapq.heappop(heap)
            rows.append((ident, row))
            following = next(iterator, None)
            if following is not None:
                heapq.heappush(heap, (following.Index, ident, following, iterator))
        yield at, rows


def run_backtest(body, prepared=None, progress=None):
    strategy, config = body["strategy"], body["config"]
    risk = strategy["risk"]
    validate_entry_safety(risk)
    safety = EntrySafety(risk)
    validate_targets(risk)
    validate_stop_settings(risk)
    for rule in (strategy["entry"], strategy["exit"]):
        validate_rule(rule)
    start, end = stamp(config["from"]), stamp(config["to"])
    maximum = 1827 if strategy["entry"]["cadence"] == "daily" else 91
    if end <= start or end - start > pd.Timedelta(days=maximum):
        raise ValueError("Use at most five years for daily strategies or 90 days for intraday strategies")
    data = prepared if prepared is not None else {x["id"]: ReplayObservations(x, end) for x in body["instruments"]}
    # Replay at the finest stored granularity so stops are not inferred from a
    # large execution candle and higher-timeframe signals can close independently.
    frame = "1d" if strategy["entry"]["cadence"] == "daily" and risk["timeframe"] == "1d" else "1m"
    trace = ReplayTrace(body.get('replayInstrumentId'), enabled=body.get('recordReplay', True))
    streams = {}
    missing, coverage = [], []
    for ident, obs in data.items():
        bars = obs.bars(frame)
        selected = bars.loc[(bars.index >= start) & (bars.end <= end)] if len(bars) else bars
        if selected.empty:
            missing.append(ident)
        else:
            coverage.append({"instrumentId": ident, "bars": len(selected), "from": selected.index[0].isoformat(), "to": selected.end.iloc[-1].isoformat()})
        streams[ident] = selected.itertuples(name='Bar')
    if missing:
        raise ValueError(f"Missing {frame} history inside the requested range for {len(missing)} stocks. Import candles before running.")
    if not coverage:
        raise ValueError("No completed candles in this date range")
    # Match JavaScript Math.round for non-negative money; Python round uses ties-to-even.
    money = lambda amount: math.floor(amount + 0.5)
    capital = money(risk["initialCapital"] * 100)
    cash, positions, pending, marks, trades, curve = capital, {}, {}, {}, [], []
    closed_pnls = []
    consumed_events = {ident: set() for ident in data}
    unknown, decisions, total_fees = 0, 0, 0
    zero_volume_bars, expired_signal_orders = 0, 0
    unavailable_inputs = {}
    entry_ready = set()
    warmup_counts = {}
    first_ready = {}
    invalid_target_entries = 0
    invalid_stop_entries, unfilled_limits = 0, 0
    stop_limit_entries = 0
    slip = risk["slippagePercent"] / 100
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
        return cash + sum(p["quantity"] * money(marks[i] * 100) for i, p in positions.items())

    def sizing_equity():
        # Same conservative basis as paper buySize; marks still value the report.
        return cash + sum(min(p['entry'], money(p['stop'] * 100)) * p['quantity'] for p in positions.values())

    def sell(ident, price, at, reason, quantity=None, phase='close', available_at=None):
        nonlocal cash, total_fees
        p = positions[ident]
        quantity = p["quantity"] if quantity is None else min(quantity, p["quantity"])
        if quantity <= 0:
            return
        allocated_cost = p["cost"] if quantity == p["quantity"] else math.floor(p["cost"] * quantity / p["quantity"] + 0.5)
        fill = money(price * 100 * (1-slip))
        gross = fill * quantity
        fee = trade_fee(gross, 'SELL', risk)
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
            safety.exits[ident] = stamp(available_at or at)
            positions.pop(ident)
        pending.pop(ident, None)

    for at, rows in portfolio_events(streams):
        if progress:
            progress({"phase": "replaying", "through": at.isoformat()})
        intrabar_entries = set()
        tradable_rows = [(ident, row) for ident, row in rows if row.volume > 0 and (frame == '1d' or at.tz_convert(IST).hour*60+at.tz_convert(IST).minute < execution_close(ident,at))]
        zero_volume_bars += sum(row.volume <= 0 for _, row in rows)
        for ident, row in rows:
            order = pending.get(ident)
            if order and order.get('expiresAt') is not None and at >= order['expiresAt']:
                pending.pop(ident)
                expired_signal_orders += 1
            # A daily zero-volume bar cannot fill yesterday's order; a fresh
            # signal may still be evaluated at this session's close.
            if frame == '1d' and row.volume <= 0:
                pending.pop(ident, None)
        for ident, row in rows:
            marks[ident] = float(row.open)
        safety.observe_equity(at, equity())
        # Exits release cash before entries at the same time.
        for ident, row in tradable_rows:
            order = pending.get(ident)
            local = at.tz_convert(IST)
            overdue = ident in positions and stamp(positions[ident]["entryAt"]).tz_convert(IST).date() < local.date()
            if ident in positions and (order and order["side"] == "SELL" or not risk["overnight"] and (local.hour * 60 + local.minute >= square_off(ident, at) or overdue)):
                if order and order['side'] == 'SELL':
                    trace.signal(ident, positions[ident]['entryAt'], order)
                sell(ident, float(row.open), at, "Sell rule" if order and order["side"] == "SELL" else "Session close", phase='open')
        # Existing protection orders can execute at the known opening price.
        # Resolve this before inspecting the unknown intrabar high/low ordering
        # and before sizing new entries against the released portfolio cash.
        for ident, row in tradable_rows:
            p = positions.get(ident)
            if not p:
                continue
            opening = float(row.open)
            if opening <= p["stop"]:
                sell(ident, opening, at, "Stop loss", phase='open')
            elif p["targets"]:
                for index, target in enumerate(p["targets"]):
                    if target["completed"] or opening < target["price"]:
                        continue
                    quantity = p["quantity"] if index == len(p["targets"]) - 1 else target["quantity"]
                    sell(ident, opening, at, f"Target {index + 1}", quantity, phase='open')
                    target["completed"] = True
                    target["filledQuantity"] = quantity
                    if ident not in positions:
                        break
                    p["target"] = next(t["price"] for t in p["targets"] if not t["completed"])
            elif opening >= p["target"]:
                sell(ident, opening, at, "Target", phase='open')
        for ident, row in sorted(tradable_rows, key=lambda item: (-pending.get(item[0], {}).get("rankingScore", 0), item[0])):
            order = pending.pop(ident, None)
            if not order or order["side"] != "BUY" or ident in positions or len(positions) >= risk["maxPositions"] or not eligible(ident, at):
                continue
            if not risk["overnight"] and (at.tz_convert(IST).date() != order["date"] or at.tz_convert(IST).hour * 60 + at.tz_convert(IST).minute >= entry_cutoff(risk, ident, at)):
                unfilled_limits += int(order.get("limit") is not None)
                continue
            safety.observe_equity(at, equity())
            blocked = safety.reason(ident, at, order['signalAt'])
            if blocked:
                safety.blocked[blocked] += 1
                continue
            limit = order.get("limit")
            if limit is not None:
                date = at.tz_convert(IST).date()
                if order.get("limitSessionDate", date) != date:
                    unfilled_limits += 1
                    continue
                if money(float(row.low) * 100) > limit:
                    if frame == "1d" or stamp(row.end).tz_convert(IST).hour * 60 + stamp(row.end).tz_convert(IST).minute >= entry_cutoff(risk, ident, at):
                        unfilled_limits += 1
                    else:
                        pending[ident] = {**order, "limitSessionDate": date}
                    continue
            intrabar_fill = limit is not None and money(float(row.open) * 100) > limit
            fill = limit if intrabar_fill else min(money(float(row.open) * 100 * (1+slip)), limit or math.inf)
            if safety.deviation(order.get('referencePrice'), fill/100):
                safety.blocked['priceDeviation'] += 1
                continue
            distance = initial_risk_distance(risk, fill, order["atr"], order.get('signalLow'))
            if distance <= 0 or distance >= fill:
                invalid_stop_entries += 1
                continue
            if exceeds_stop_limit(risk, fill, distance):
                stop_limit_entries += 1
                continue
            quantity = min(math.floor(sizing_equity()*risk["riskPercent"]/100/distance), affordable_shares(cash, fill, risk))
            cost = fill*quantity + trade_fee(fill*quantity, 'BUY', risk)
            if quantity < 1 or cost > cash:
                continue
            try:
                targets = position_targets(risk, fill, quantity, distance)
            except InvalidTargetPriceError:
                invalid_target_entries += 1
                continue
            safety.filled(ident, at)
            cash -= cost
            total_fees += cost - fill * quantity
            positions[ident] = {"quantity": quantity, "initialQuantity": quantity, "initialRiskPaise": distance, "entry": fill, "cost": cost, "entryAt": at.isoformat(), "realizedPaise": 0, "targets": targets,
                                "stop": (fill-distance)/100, "target": money(fill+distance*risk["targetR"])/100}
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
            if p and row.volume > 0:
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
                    advance_stop(p, risk, money(float(row.high) * 100))
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
            if side == "BUY" and not risk["overnight"] and obs.cutoff.tz_convert(IST).hour*60+obs.cutoff.tz_convert(IST).minute >= entry_cutoff(risk, ident, at):
                continue
            if side == "BUY" and not eligible(ident, obs.cutoff):
                continue
            result = evaluate_observations(strategy["exit"] if side == "SELL" else strategy["entry"], ident, obs,
                                           consumed_events=consumed_events[ident] if side == 'BUY' else None)
            decisions += 1
            unknown += int(result["matched"] is None)
            if side == 'BUY' and result['matched'] is not None:
                entry_ready.add(ident)
                first_ready.setdefault(ident, obs.cutoff.isoformat())
            if result['matched'] is None and side == 'BUY' and ident not in entry_ready:
                warmup_counts[ident] = warmup_counts.get(ident, 0) + 1
            if result['matched'] is None:
                for check in result['checks']:
                    if check['matched'] is None:
                        key = (check.get('missingField', check['field']), check.get('reason', 'Input unavailable'))
                        unavailable_inputs[key] = unavailable_inputs.get(key, 0) + 1
            if result["matched"] and side == 'BUY':
                blocked = safety.reason(ident, obs.cutoff, obs.cutoff)
                if blocked:
                    safety.blocked[blocked] += 1
                    continue
            if result["matched"] and ident not in pending:
                score = signal_score(obs, risk, signal_frame) if side == 'BUY' else 0
                if score is None:
                    unknown += 1
                    unavailable_inputs[('signalRanking', 'Ranking history unavailable')] = unavailable_inputs.get(('signalRanking', 'Ranking history unavailable'), 0) + 1
                    continue
                signal_low = obs.signal_low(risk['timeframe']) if risk['stopMode'] == 'candleLow' else None
                if side == 'BUY' and risk['stopMode'] == 'candleLow' and (signal_low is None or not math.isfinite(signal_low) or signal_low <= 0):
                    unknown += 1
                    unavailable_inputs[('low', 'Completed signal candle low unavailable')] = unavailable_inputs.get(('low', 'Completed signal candle low unavailable'), 0) + 1
                    continue
                if side == 'BUY':
                    consumed_events[ident].update(entry_event_keys(strategy['entry'], result))
                signal_minutes = {'1m': 1, '5m': 5, '15m': 15, '1h': 60}.get(signal_frame)
                expiry = obs.cutoff + pd.Timedelta(minutes=signal_minutes) if signal_minutes else None
                if signal_minutes:
                    local_cutoff = obs.cutoff.tz_convert(IST)
                    session_end = local_cutoff.normalize() + pd.Timedelta(hours=15, minutes=15 if not risk["overnight"] else 30)
                    expiry = session_end if side == 'BUY' and risk.get('entryOrderType') == 'limit' else min(expiry, session_end)
                pending[ident] = {"rankingScore": score, "expiresAt": expiry, "side": side, "atr": obs.atr(risk["timeframe"], risk["atrPeriod"]), "date": obs.cutoff.tz_convert(IST).date(),
                                  "signalAt": obs.cutoff.isoformat(), "referencePrice": float(row.close), "checks": result['checks'],
                                  "signalCandle": signal_candle(obs, signal_frame),
                                  "signalLow": signal_low,
                                  "limit": money(risk["entryLimitPrice"] * 100) if side == "BUY" and risk.get("entryOrderType") == "limit" else None}
        safety.observe_equity(max(row.end for _, row in rows), equity())
        if safety.halted:
            for ident in list(pending):
                if pending[ident]['side'] == 'BUY':
                    pending.pop(ident)
                    safety.blocked['dailyLoss'] += 1
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
    return {"entrySafeguards": {"blocked": safety.blocked, "dailyLossDates": sorted(safety.halted_days)}, "metrics": performance_metrics(curve, capital/100, closed_pnls, start, end), "initialCapital": capital/100, "equity": equity()/100, "cash": cash/100,
            "netPnl": (equity()-capital)/100, "maxDrawdownPercent": max_dd, "unavailableDecisions": unknown,
            "unavailableInputs": [{"field": field, "reason": reason, "checks": count} for (field, reason), count in sorted(unavailable_inputs.items())],
            "invalidTargetEntries": invalid_target_entries,
            "invalidStopEntries": invalid_stop_entries, "stopLimitEntries": stop_limit_entries, "unfilledLimitEntries": unfilled_limits,
            "decisions": decisions, "totalFees": total_fees/100, "returnPercent": (equity()-capital)/capital*100,
            "closedTrades": len(closed_pnls), "winRate": wins/len(closed_pnls)*100 if closed_pnls else None, "profitFactor": profit/loss if loss else None,
            "realizedPnl": sum(t["pnl"] for t in trades), "coverage": coverage,
            "trades": trades, "openPositions": [{"instrumentId": i, **p, "mark": marks[i]} for i,p in positions.items()],
            "replay": trace.result(frame),
            "warmupDecisions": sum(warmup_counts.values()), "unreadyInstruments": [i for i in warmup_counts if i not in entry_ready],
            "warmup": [{"instrumentId": i, "skippedDecisions": n, "firstReadyAt": first_ready.get(i)} for i, n in warmup_counts.items()],
            "zeroVolumeBars": zero_volume_bars, "expiredSignalOrders": expired_signal_orders,
            "curve": curve[::stride] + ([curve[-1]] if (len(curve)-1) % stride else []),
            "assumptions": ["From 2026-08-03, NSE intraday replay uses conservative 15:10 square-off and no minute fills from 15:15. This also restricts non-auction NSE stocks until dated CAS membership is supported. Daily OHLC replay cannot distinguish auction from continuous-session touches.", "Configured entry cooldown counts elapsed minutes after a full exit; daily per-stock limits count filled buys in IST. Legacy strategies without these fields retain no cooldown or count limit. A completed signal at or before a full exit cannot re-enter.",
                            "Configured daily loss limits block new entries and reset at the next session opening equity. Replay checks known opens and closes, not unobserved intrabar equity; paper uses live marks. Configured price deviation uses the signal close and estimated fill. Session overrides, circuit/depth liquidity and tick timing can differ from candle replay.","Zero-volume candles may inform indicators but never fill entries, exits, stops or targets, or advance trailing stops. Intraday market signals expire at their next evaluation boundary.", "Long-only cash equities; deterministic symbol order for simultaneous entries.",
                            "Position sizing matches paper trading: risk allowance uses cash plus remaining shares valued at the lower of entry and current stop. Report equity still uses market prices. Fees and fills round to paise using the paper engine\u2019s rule.",
                            "Each crossover event can trigger one entry attempt per stock; state-only entry conditions can match again. Manual paper entries remain independent.",
                            "Candle-low stops use the last completed candle in the risk timeframe at signal time, frozen before entry. Invalid or missing stop levels cannot open a position.",
                            "Per-target stop steps require a non-zero target fill, never lower an existing stop, and apply on the next replay bar.",
                            "Next stored bar open with configured slippage and estimated fees. Existing stops and targets crossed at the open execute there before new entries; otherwise stop first if both touch inside a candle. Opening target fills receive the opening price before slippage. Stop adjustments remain effective next bar.",
                            "Partial exits use original position size, rounded to whole shares; the last target closes the remainder. Win rate counts fully closed positions, not individual exits.",
                            "Percentage and rupee gains are measured from the filled entry; exact target prices stay fixed. Entries are skipped if target prices are not above entry or distinct after rounding to paise.",
                            "1R is the initial filled entry minus its initial stop and stays fixed. Breakeven can activate at a profit multiple or filled partial target; trailing uses a fixed R distance from the highest price after activation and never lowers the stop.",
                            "Limit buys require a later candle to trade at the limit or lower; fills never exceed the limit. Unfilled orders expire at session end. A limit filled inside a candle can stop out that candle, but targets and stop adjustments wait until a later bar because the earlier high may precede entry.",
                            "Breakeven means entry price before fees and slippage. New breakeven and trailing stops apply from the next replay bar because the intrabar path is unknown; paper trading uses subsequent live ticks.",
                            "Open positions are marked at the final stored close, not forcibly sold.",
                            "Current-list research has selection bias; historical mode uses only lists recorded at the time.",
                            "Costs use the saved model: flat per-side estimate or Dhan-style Indian cash charges (2026-10-05 rates). Indian cash assumes delivery for overnight strategies, intraday otherwise; each delivery sell incurs a DP instruction. Exchange rate is explicit; review BSE groups. No historical rate changes or same-day delivery netting. Slippage applies separately.",
                            "Replay uses provider OHLCV. Dividends and corporate-action cash/share adjustments are not separately modelled."]}
