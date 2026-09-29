"""Shared declarative fields; formulas are trusted engine code, never AI code."""
import json
import os
from pathlib import Path

path = Path(os.getenv('RULE_CATALOG_PATH', Path(__file__).resolve().parents[2] / 'packages/rule-catalog/fields.json'))
FIELDS = json.loads(path.read_text(encoding='utf-8'))
REPORT_FIELDS = {key for key, value in FIELDS.items() if value['source'] == 'dailyReports'}


def parameters(field, period=None, offset=0):
    definition = FIELDS.get(field, {})
    spec = definition.get('period')
    if period is not None and (not spec or type(period) is not int or not spec['min'] <= period <= spec['max']):
        raise ValueError(f'{field}: unsupported indicator period')
    if type(offset) is not int or not 0 <= offset <= 120 or offset and not definition.get('offset'):
        raise ValueError(f'{field}: unsupported candle offset')
    return period if period is not None else spec['default'] if spec else None, offset


def operand_parameters(condition, monthly, right=False):
    prefix = ('compare' if right else '') if monthly else ('right' if right else 'left')
    return condition.get(prefix + ('Period' if prefix else 'period')), condition.get(prefix + ('Offset' if prefix else 'offset'), 0)
