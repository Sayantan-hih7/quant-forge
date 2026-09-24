/** Keep the provider grammar small. The original Zod schema still validates every
 * response, including all lengths, ranges, counts and cross-field constraints. */
export function geminiSchema(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(geminiSchema);
  if (!input || typeof input !== 'object') return input;
  let schema = input as Record<string, unknown>;
  const alternatives = schema.anyOf;
  if (Array.isArray(alternatives) && alternatives.length === 2) {
    const nullable = alternatives.find(x => x && typeof x === 'object' && x.type === 'null');
    const typed = alternatives.find(x => x && typeof x === 'object' && typeof x.type === 'string' && x.type !== 'null');
    if (nullable && typed) { const rest = { ...schema }; delete rest.anyOf; schema = { ...rest, ...typed, type: [typed.type, 'null'] }; }
  }
  const constraints: Record<string, string> = {
    minLength: 'Minimum characters', maxLength: 'Maximum characters', minItems: 'Minimum items', maxItems: 'Maximum items',
    minimum: 'Minimum inclusive value', maximum: 'Maximum inclusive value', exclusiveMinimum: 'Value must be greater than', exclusiveMaximum: 'Value must be less than',
  };
  const descriptions = [typeof schema.description === 'string' ? schema.description : '',
    ...Object.entries(constraints).flatMap(([key, label]) => typeof schema[key] === 'number' ? [`${label}: ${schema[key]}.`] : [])].filter(Boolean);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema' || key === 'description' || key === 'default' || key in constraints) continue;
    result[key] = key === 'properties' && value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, geminiSchema(child)])) : geminiSchema(value);
  }
  if (descriptions.length) result.description = descriptions.join(' ');
  return result;
}
