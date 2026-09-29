export function feedRetryDelay(attempt: number) { return Math.min(300_000, 5_000 * 2 ** Math.min(Math.max(0, attempt), 6)); }
export const motilalConfigured = () => ['MO_CLIENT_CODE', 'MO_PASSWORD', 'MO_2FA', 'MO_API_KEY', 'MO_API_SECRET_KEY'].every(key => !!process.env[key]);
export function feedProvider(preference: 'auto' | 'motilal' | 'dhan', motilalReady: boolean, motilalFailed: boolean): 'motilal' | 'dhan' {
  return preference === 'auto' ? motilalReady && !motilalFailed ? 'motilal' : 'dhan' : preference;
}
