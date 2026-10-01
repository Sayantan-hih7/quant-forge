"""Initial risk is fixed at entry; stop adjustments can only tighten protection."""
import math


def paise(value):
    return math.floor(value * 100 + 0.5)


def validate_stop_settings(risk):
    maximum = risk.get('maxStopPercent')
    if maximum is not None and (not isinstance(maximum, (int, float)) or isinstance(maximum, bool) or not math.isfinite(maximum) or not 0.1 <= maximum <= 25):
        raise ValueError('Maximum initial stop distance must be between 0.1% and 25%')
    for field, needed in (("stopValue", risk["stopMode"] in ("amount", "price")), ("entryLimitPrice", risk.get("entryOrderType") == "limit")):
        value = risk.get(field)
        if needed and (not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or not 0.01 <= value <= 10000000):
            raise ValueError(f"{field} requires a positive rupee value")
        if value is not None and abs(value * 100 - round(value * 100)) > 0.000001:
            raise ValueError("Use at most two decimal places for rupees")
    if risk.get("entryOrderType") == "limit" and risk["stopMode"] in ("price", "amount") and risk["stopValue"] >= risk["entryLimitPrice"]:
        raise ValueError("The initial stop price or distance must be below the maximum entry price")
    plan = risk.get("stopManagement")
    if plan is None:
        return
    if not isinstance(plan, dict) or not plan or set(plan) - {"breakeven", "trailing"}:
        raise ValueError("Choose valid stop management settings")
    if risk.get("breakevenAfterTarget1"):
        raise ValueError("Use either legacy breakeven or stop management")
    if plan.get("trailing") and risk["stopMode"] == "trailing":
        raise ValueError("Choose an initial stop before configuring delayed trailing")
    for key, rule in plan.items():
        if not isinstance(rule, dict) or set(rule) != ({"trigger", "at", "distanceR"} if key == "trailing" else {"trigger", "at"}):
            raise ValueError("Invalid stop trigger settings")
        if rule["trigger"] not in ("risk", "target"):
            raise ValueError("Unknown stop trigger")
        value = rule["at"]
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or not 0.1 <= value <= 20:
            raise ValueError("Stop activation must be between 0.1 and 20")
        if rule["trigger"] == "target" and (value != int(value) or not 1 <= value < len(risk.get("exitTargets") or [])):
            raise ValueError("Choose a partial target before the final exit")
        distance = rule.get("distanceR", 1)
        if not isinstance(distance, (int, float)) or isinstance(distance, bool) or not math.isfinite(distance) or not 0.1 <= distance <= 20:
            raise ValueError("Trailing distance must be between 0.1R and 20R")


def exceeds_stop_limit(risk, entry, distance):
    maximum = risk.get('maxStopPercent')
    return maximum is not None and distance * 100 - entry * maximum > 1e-7


def initial_risk_distance(risk, entry, atr=None, signal_low=None):
    if risk['stopMode'] == 'candleLow':
        return entry - paise(signal_low) if signal_low and math.isfinite(signal_low) else 0
    if risk["stopMode"] == "ATR":
        return paise((atr or 0) * risk["atrMultiplier"])
    if risk["stopMode"] == "amount":
        return paise(risk["stopValue"])
    if risk["stopMode"] == "price":
        return entry - paise(risk["stopValue"])
    return math.floor(entry * risk["stopPercent"] / 100 + 0.5)


def advance_stop(position, risk, price):
    plan = risk.get("stopManagement") or ({"breakeven": {"trigger": "target", "at": 1}} if risk.get("breakevenAfterTarget1") else {})
    distance = position["initialRiskPaise"]
    for index, target in enumerate(risk.get('exitTargets') or []):
        move = target.get('moveStopTo')
        if move is None or not position['targets'][index].get('filledQuantity'):
            continue
        level = position['entry'] / 100 if move == 0 else position['targets'][move - 1]['price']
        position['stop'] = max(position['stop'], level)
        if move == 0:
            position['breakevenActivated'] = True

    def reached(rule):
        if rule["trigger"] == "risk":
            return price >= position["entry"] + math.floor(distance * rule["at"] + 0.5)
        return bool(position["targets"][int(rule["at"]) - 1].get("filledQuantity"))

    breakeven, trailing = plan.get("breakeven"), plan.get("trailing")
    if breakeven and (position.get("breakevenActivated") or reached(breakeven)):
        position["breakevenActivated"] = True
        position["stop"] = max(position["stop"], position["entry"] / 100)
    if trailing and (position.get("trailingActivated") or reached(trailing)):
        peak = max(position.get("highWaterPaise", price), price) if position.get("trailingActivated") else price
        position.update(trailingActivated=True, highWaterPaise=peak)
        position["stop"] = max(position["stop"], (peak - max(1, math.floor(distance * trailing["distanceR"] + 0.5))) / 100)
    elif risk["stopMode"] == "trailing":
        position.update(trailingActivated=True, highWaterPaise=max(position.get("highWaterPaise", price), price))
        position["stop"] = max(position["stop"], math.floor(price * (1 - risk["stopPercent"] / 100) + 0.5) / 100)
