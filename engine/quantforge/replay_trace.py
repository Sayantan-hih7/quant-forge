"""Bounded explanation log. Observes replay decisions without changing execution."""
from copy import deepcopy
import json

TRACE_VERSION = 1


class ReplayTrace:
    def __init__(self, instrument_id=None, limit=20000, enabled=True, byte_limit=4_000_000):
        self.instrument_id, self.limit, self.enabled = instrument_id, limit, enabled
        self.events, self.complete = [], True
        self.bytes, self.byte_limit = 0, byte_limit

    def add(self, kind, ident, entry_at, at, phase, **detail):
        if not self.enabled or self.instrument_id and ident != self.instrument_id:
            return
        if not self.complete or len(self.events) >= self.limit:
            self.complete = False
            return
        event = dict(kind=kind, instrumentId=ident, entryAt=str(entry_at), at=str(at),
                     phase=phase, sequence=len(self.events), **deepcopy(detail))
        size = len(json.dumps(event, ensure_ascii=False).encode('utf-8'))
        if self.bytes + size > self.byte_limit:
            self.complete = False
            return
        self.bytes += size
        self.events.append(event)

    def signal(self, ident, entry_at, order):
        if order.get('signalAt'):
            self.add('signal', ident, entry_at, order['signalAt'], 'close', side=order['side'],
                     checks=order['checks'], candle=order['signalCandle'])

    def result(self, frame):
        return dict(version=TRACE_VERSION, complete=self.complete, timeframe=frame, events=self.events)


def signal_candle(observations, frame):
    available = observations.completed_bars(frame)
    if available.empty:
        return None
    row = available.iloc[-1]
    return dict(time=available.index[-1].isoformat(), end=row.end.isoformat(), timeframe=frame,
                **{field: float(row[field]) for field in ('open', 'high', 'low', 'close', 'volume')})
