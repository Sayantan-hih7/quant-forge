"""Partial targets use percentages of the original whole-share position."""
import math


class InvalidTargetPriceError(ValueError):
    """Target levels cannot be used with this particular filled entry."""


def validate_targets(risk):
    targets = risk.get("exitTargets")
    if targets is None:
        if risk.get("breakevenAfterTarget1"):
            raise ValueError("Breakeven after Target 1 requires partial exits")
        return
    if not isinstance(targets, list) or not 2 <= len(targets) <= 5:
        raise ValueError("Use two to five partial targets")
    previous, total = 0, 0
    basis = targets[0].get("basis", "percent")
    if basis not in ("percent", "amount", "price", "risk"):
        raise ValueError("Unknown target unit")
    for index, target in enumerate(targets):
        if target.get("basis", "percent") != basis:
            raise ValueError("Use the same target unit for every level")
        if set(target) - {"basis", "profitPercent", "value", "closePercent", "moveStopTo"}:
            raise ValueError("Unknown target property")
        move = target.get('moveStopTo')
        if move is not None and (type(move) is not int or not 0 <= move <= index or index == len(targets) - 1):
            raise ValueError('Move the stop to entry or an earlier target after a partial exit only')
        field, inactive = ("profitPercent", "value") if basis == "percent" else ("value", "profitPercent")
        price, size = target.get(field), target.get("closePercent")
        minimum, maximum = (0.1, 1000) if basis == "percent" else (0.1, 20) if basis == "risk" else (0.01, 10000000)
        if inactive in target or not isinstance(price, (int, float)) or isinstance(price, bool) or not math.isfinite(price) or not minimum <= price <= maximum or price <= previous:
            raise ValueError("Target values must be positive, increasing and use only the selected unit")
        if basis in ("amount", "price") and abs(price * 100 - round(price * 100)) > 0.000001:
            raise ValueError("Use at most two decimal places for rupees")
        if not isinstance(size, (int, float)) or isinstance(size, bool) or not math.isfinite(size) or not 1 <= size <= 99:
            raise ValueError("Each partial exit must close between 1% and 99%")
        previous, total = price, total + size
    if abs(total - 100) > 0.000001:
        raise ValueError("Exit percentages must total 100%")


def position_targets(risk, entry, quantity, initial_risk=None):
    targets, percent, allocated = [], 0, 0
    previous_price = entry
    for index, target in enumerate(risk.get("exitTargets") or []):
        basis = target.get("basis", "percent")
        if basis == "risk" and (not initial_risk or initial_risk <= 0):
            raise InvalidTargetPriceError("Risk targets require a positive initial risk distance")
        price = (math.floor(entry * (1 + target["profitPercent"] / 100) + 0.5) if basis == "percent"
                 else entry + math.floor(initial_risk * target["value"] + 0.5) if basis == "risk" and initial_risk
                 else entry + math.floor(target["value"] * 100 + 0.5) if basis == "amount"
                 else math.floor(target["value"] * 100 + 0.5))
        if price <= previous_price:
            raise InvalidTargetPriceError("Profit targets must be above the filled entry price and at least ₹0.01 apart")
        previous_price = price
        percent += target["closePercent"]
        cumulative = quantity if index == len(risk["exitTargets"]) - 1 else math.floor(quantity * percent / 100 + 1e-9)
        shares = cumulative - allocated
        allocated = cumulative
        targets.append({"price": price / 100,
                        "quantity": shares, "completed": shares == 0})
    return targets
