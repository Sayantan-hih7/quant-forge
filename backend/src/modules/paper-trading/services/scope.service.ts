/** Entries remain a subset of the current qualified list. Held shares always retain exits. */
export function monitoringIds(qualified: string[], selected: string[] | undefined, held: string[], paused = false) {
  const scope = selected ? new Set(selected) : undefined;
  return [...new Set([...(paused ? [] : qualified.filter(id => !scope || scope.has(id))), ...held])];
}
