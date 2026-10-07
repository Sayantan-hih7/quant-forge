"""Conservative pre-run scope checks; never remove positions after replay starts."""
from .market import stamp, IST
from .rules import evaluate_observations


def assess_scope(body, prepared):
    strategy, config = body['strategy'], body['config']
    start, end = stamp(config['from']), stamp(config['to'])
    replay = '1d' if strategy['entry']['cadence'] == 'daily' and strategy['risk']['timeframe'] == '1d' else '1m'
    signal = '1d' if strategy['entry']['cadence'] == 'daily' else strategy['entry']['cadence']
    sessions = set(config.get('sessionDates', []))
    for obs in prepared.values():
        bars = obs.bars(replay)
        if len(bars):
            sessions.update(at.tz_convert(IST).strftime('%Y-%m-%d') for at in bars.index if start <= at < end)
    observed = {at.tz_convert(IST).strftime('%Y-%m-%d') for obs in prepared.values() for at in obs.bars(replay).index if start <= at < end}
    absent_market = set(config.get('sessionDates', [])) - observed
    included, excluded = [], []
    for ident, obs in prepared.items():
        reasons = list(config.get('preparationIssues', {}).get(ident, []))
        if absent_market:
            reasons.append('Calendar/provider mismatch: no selected stock has candles on ' + ', '.join(sorted(absent_market)[:10]) + '. Verify exchange calendar or retry the provider; absence alone does not prove a holiday.')
        bars = obs.bars(replay)
        selected = bars.loc[(bars.index >= start) & (bars.end <= end)] if len(bars) else bars
        if selected.empty:
            reasons.append('No completed price history inside this test period. Choose a later period for a new listing or retry history.')
        else:
            dates = {at.tz_convert(IST).strftime('%Y-%m-%d') for at in selected.index}
            missing_days = sessions - dates
            if missing_days:
                reasons.append(f'{len(missing_days)} market sessions lack candles in this period (new listing, suspension or missing history).')
            if replay == '1m':
                counts = selected.groupby(selected.index.tz_convert(IST).strftime('%Y-%m-%d')).size()
                missing = sum(max(0, 375-int(n)) for n in counts)
                if missing:
                    reasons.append(f'{missing} minute observations missing against the regular-session template. For NSE stocks after 2026-08-03, verify closing-auction eligibility; 15:15-15:30 may be outside continuous trading. This scope stays excluded until its dated session is verified.')
                if not strategy['risk']['overnight']:
                    traded = selected.loc[selected.volume > 0]
                    exit_days = {at.tz_convert(IST).strftime('%Y-%m-%d') for at in traded.index if at.tz_convert(IST).hour*60+at.tz_convert(IST).minute >= 915}
                    if dates - exit_days:
                        reasons.append(f'{len(dates-exit_days)} sessions lack traded candles at or after the intraday exit time.')
            if not (selected.volume > 0).any():
                reasons.append('No traded volume in the selected period.')
            decisions = obs.bars(signal)
            decisions = decisions.loc[(decisions.index >= start) & (decisions.end <= end)] if len(decisions) else decisions
            if decisions.empty:
                reasons.append('No completed strategy decision candle in this period.')
            else:
                # Start-of-period readiness is conservative and does not inspect future
                # indicator values to admit an IPO early. Later missing inputs still
                # remain visible in the replay and block report handoff.
                obs.cutoff = stamp(decisions.end.iloc[0])
                for side in ('entry', 'exit'):
                    result = evaluate_observations(strategy[side], ident, obs)
                    missing_fields = sorted({check.get('missingField', check['field']) for check in result['checks'] if check['matched'] is None})
                    if missing_fields:
                        reasons.append(f"{side.title()} inputs not ready at period start: {', '.join(missing_fields)}. More warm-up or dated input data is required.")
                risk = strategy['risk']
                if risk['stopMode'] == 'ATR' and obs.atr(risk['timeframe'], risk['atrPeriod']) is None:
                    reasons.append('ATR stop history is not ready at period start.')
                if risk['stopMode'] == 'candleLow' and obs.signal_low(risk['timeframe']) is None:
                    reasons.append('Signal-candle stop history is not ready at period start.')
        obs.cutoff = end
        if reasons:
            excluded.append({'instrumentId': ident, 'reasons': list(dict.fromkeys(reasons))})
        else:
            included.append(ident)
    return {'policy': config['dataPolicy'], 'requestedIds': list(config['ids']), 'includedIds': included, 'excluded': excluded,
            'method': 'Complete recorded sessions and strategy inputs ready at the first decision candle. Missing history does not reject a stock from qualification. Start later for new listings. Coverage filtering uses the test period and can bias the resulting subset; this is not a point-in-time investment filter.'}
