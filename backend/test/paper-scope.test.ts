import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monitoringScope } from '../src/modules/paper-trading/services/scope.service.js';

test('session scope explains excluded selections while retaining held exits', () => {
  const selected = ['A', 'B', 'C', 'D', 'E'];
  const scope = monitoringScope(['A', 'F'], selected, ['C', 'G']);
  assert.deepEqual(scope.eligibleIds, ['A']);
  assert.deepEqual(scope.excludedIds, ['B', 'C', 'D', 'E']);
  assert.deepEqual(scope.entryIds, ['A']);
  assert.deepEqual(scope.monitoredIds, ['A', 'C', 'G']);
  assert.deepEqual(selected, ['A', 'B', 'C', 'D', 'E']);
  const paused = monitoringScope(['A'], selected, ['C'], true);
  assert.deepEqual(paused.entryIds, []);
  assert.deepEqual(paused.monitoredIds, ['C']);
  assert.deepEqual(monitoringScope(['A', 'F'], undefined, []).selectedIds, ['A', 'F']);
  assert.deepEqual(monitoringScope(['A'], ['A'], ['A']).entryIds, [], 'Held shares use exit checks, not new buy checks');
});
