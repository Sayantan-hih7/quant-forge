export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AppError(422, 'INVALID_DATA', message);
}
