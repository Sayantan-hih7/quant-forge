"""Report statistics from full-resolution equity; ratios use daily closes, not trade legs."""
import math
from statistics import mean, stdev
from .market import stamp, IST


def performance_metrics(curve, capital, closed_pnls, start, end):
    daily = {}
    for point in curve:
        daily[stamp(point['at']).tz_convert(IST).strftime('%Y-%m-%d')] = point['equity']
    previous, returns, months = capital, [], {}
    for day, equity in sorted(daily.items()):
        if previous > 0:
            returns.append(equity / previous - 1)
        month = day[:7]
        if month not in months:
            months[month] = {'month': month, 'openingEquity': previous, 'closingEquity': equity}
        months[month]['closingEquity'] = equity
        previous = equity
    for row in months.values():
        row['returnPercent'] = (row['closingEquity'] / row['openingEquity'] - 1) * 100 if row['openingEquity'] > 0 else None
    deviation = stdev(returns) if len(returns) >= 20 else 0
    downside = math.sqrt(mean([min(0, value) ** 2 for value in returns])) if len(returns) >= 20 else 0
    years = (end - start).total_seconds() / (365.25 * 86400)
    return {
        'cagrPercent': ((previous / capital) ** (1 / years) - 1) * 100 if years >= 1 and previous > 0 and capital > 0 else None,
        'sharpe': mean(returns) / deviation * math.sqrt(252) if deviation else None,
        'sortino': mean(returns) / downside * math.sqrt(252) if downside else None,
        'expectancy': mean(closed_pnls) if closed_pnls else None,
        'dailyObservations': len(returns), 'monthlyReturns': list(months.values()),
        'method': 'Net daily-close equity returns; 252 trading days, zero risk-free/target return. Ratios require 20 observed sessions; CAGR requires one year. Expectancy is per fully closed position, including all partial exits. Missing trading sessions are not fabricated; inspect data coverage.'
    }
