/** Entries remain a subset of the current qualified list. Held shares always retain exits. */
export function monitoringIds(qualified: string[], selected: string[] | undefined, held: string[], paused = false) {
  const scope = selected ? new Set(selected) : undefined;
  return [...new Set([...(paused ? [] : qualified.filter(id => !scope || scope.has(id))), ...held])];
}

/** Derived on every read: saved selections are never silently edited. */
export function monitoringScope(qualified: string[], selected: string[] | undefined, held: string[], paused = false) {
  const selectedIds = [...new Set(selected ?? qualified)], current = new Set(qualified);
  const eligibleIds = selectedIds.filter(id => current.has(id));
  const excludedIds = selectedIds.filter(id => !current.has(id));
  const heldIds = [...new Set(held)];
  return { selectedIds, eligibleIds, excludedIds, heldIds,
    monitoredIds: monitoringIds(qualified, selected, held, paused), entryIds: paused ? [] : eligibleIds.filter(id => !heldIds.includes(id)) };
}
