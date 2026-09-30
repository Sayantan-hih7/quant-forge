"""Declarative settings shared by chart, manual rules and AI proposals."""
import json
import math
from datetime import date, time
from .field_catalog import path, FIELDS

CATALOG = json.loads(path.with_name('indicators.json').read_text(encoding='utf-8'))
CHART_ONLY = {'overbought', 'oversold', 'maPeriod'}

def settings_for(field, settings=None):
    settings = {} if settings is None else settings
    if not isinstance(settings, dict):
        raise ValueError('Indicator settings must be an object')
    kind = FIELDS.get(field, {}).get('indicator')
    specs = CATALOG.get(kind, {}).get('settings', {})
    for key, value in settings.items():
        spec = specs.get(key)
        if not spec or key in CHART_ONLY:
            raise ValueError(f'{field}: unsupported setting {key}')
        if spec['type'] == 'number' and (type(value) not in (int, float) or not math.isfinite(value) or not spec['min'] <= value <= spec['max'] or spec.get('integer') and value != int(value)):
            raise ValueError(f'{field}: invalid {key}')
        if spec['type'] == 'select' and value not in spec['options']:
            raise ValueError(f'{field}: invalid {key}')
        if spec['type'] == 'date':
            if not isinstance(value, str) or date.fromisoformat(value).isoformat() != value:
                raise ValueError('Invalid anchor date')
        if spec['type'] == 'time' and value:
            time.fromisoformat(value)
    if kind == 'macd' and settings.get('fastPeriod',12) >= settings.get('slowPeriod',26):
        raise ValueError('MACD fast period must be smaller than slow period')
    if kind == 'sar' and max(settings.get('start',.02),settings.get('increment',.02)) > settings.get('maximum',.2):
        raise ValueError('SAR maximum must be at least start and increment')
    if kind == 'vwap' and settings.get('anchor') == 'custom' and not settings.get('anchorDate'):
        raise ValueError('Custom VWAP needs an anchor date')
    return settings

def operand_settings(condition, monthly, right=False):
    return condition.get(('compareSettings' if right else 'settings') if monthly else ('rightSettings' if right else 'leftSettings'))

def settings_key(settings):
    return json.dumps(settings or {}, sort_keys=True, separators=(',', ':'))

def required_bars(field, period, settings=None):
    s=settings or {};kind=FIELDS.get(field,{}).get('indicator');n=period or CATALOG.get(kind,{}).get('period') or 14
    if kind in ('bollinger','bollingerBandwidth') and s.get('maType')=='dema': return 2*n-1
    if kind=='dema': return 2*n-1
    if kind=='averagePrice': return 1
    if kind=='connorsRsi': return max(n+1,s.get('streakPeriod',2)+1,s.get('rankPeriod',100)+2)
    if field=='macd': return s.get('slowPeriod',26)
    if field=='ichimokuConversion': return s.get('conversionPeriod',9)
    if field=='ichimokuBase': return s.get('basePeriod',26)
    if field=='ichimokuA': return max(s.get('conversionPeriod',9),s.get('basePeriod',26))+s.get('displacement',26)
    if field=='ichimokuB': return s.get('spanPeriod',52)+s.get('displacement',26)
    if field=='stochasticK': return n+s.get('smoothK',3)-1
    if field=='stochRsiK': return n+s.get('stochPeriod',14)+s.get('smoothK',3)-1
    if kind=='pivots': return 2
    if kind=='macd': return s.get('slowPeriod',26)+s.get('signalPeriod',9)-1
    if kind=='adx': return n+s.get('adxSmoothing',n)-1
    if kind=='stochastic': return n+s.get('smoothK',3)+s.get('dPeriod',3)-2
    if kind=='stochRsi': return n+s.get('stochPeriod',14)+s.get('smoothK',3)+s.get('dPeriod',3)-2
    if kind=='ichimoku': return max(s.get('conversionPeriod',9),s.get('basePeriod',26),s.get('spanPeriod',52))+s.get('displacement',26)
    if kind=='hma': return n+int(math.sqrt(n))-1
    if kind=='keltner': return max(n,s.get('atrPeriod',10))
    if kind in ('roc','momentum','mfi','aroon','relativeStrength','rsi','rvol'): return n+1
    if kind in ('vwap','accDist','obv'): return 1
    if kind=='sar': return 2
    return n
