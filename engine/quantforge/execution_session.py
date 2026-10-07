from .market import IST, stamp


def execution_close(ident, at):
    return 915 if ident.startswith('NSE:') and stamp(at).tz_convert(IST).strftime('%Y-%m-%d') >= '2026-08-03' else 930


def square_off(ident, at):
    return 910 if execution_close(ident, at) == 915 else 915


def entry_cutoff(risk, ident, at):
    return execution_close(ident, at) if risk['overnight'] else min(risk.get('entryCutoffMinute', 915), square_off(ident, at))
