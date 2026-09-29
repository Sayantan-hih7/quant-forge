/** Require explicit null for unused optional risk settings so the provider cannot
 * silently omit targets or adjustments while describing them in its message. */
export function explicitRiskSchema(input: unknown): unknown {
  const explicit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(explicit);
    if (!value || typeof value !== 'object') return value;
    const schema = value as Record<string, unknown>;
    const next = Object.fromEntries(Object.entries(schema).map(([key, child]) => [key, explicit(child)]));
    if (schema.properties && typeof schema.properties === 'object') {
      const required = new Set(Array.isArray(schema.required) ? schema.required : []);
      next.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => {
        const converted = explicit(child) as Record<string, unknown>;
        if (!required.has(key)) return [key, { anyOf: [converted, { type: 'null' }], description: 'Set explicitly; null only when this setting is unused.' }];
        return [key, converted];
      }));
      next.required = Object.keys(schema.properties);
    }
    return next;
  };
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'risk' ? explicit(child) : walk(child)]));
  };
  return walk(input);
}

export function normalizeRiskReply(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const reply = raw as Record<string, unknown>, proposal = reply.proposal;
  if (!proposal || typeof proposal !== 'object' || !('risk' in proposal)) return raw;
  const clean = (value: unknown): unknown => Array.isArray(value) ? value.map(clean)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, child]) => child !== null).map(([key, child]) => [key, clean(child)])) : value;
  const risk = clean(proposal.risk) as Record<string, unknown>;
  if (risk && typeof risk === 'object' && risk.stopManagement && typeof risk.stopManagement === 'object' && !Object.keys(risk.stopManagement).length) delete risk.stopManagement;
  return { ...reply, proposal: { ...proposal, risk } };
}
