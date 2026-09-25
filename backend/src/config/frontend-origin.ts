import { env } from './env.js';

const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Vite can display either loopback address. In development, allow only
 * aliases of the configured local origin, with the same protocol and port. */
export function isAllowedFrontendOrigin(origin: string | undefined, configured = env.FRONTEND_ORIGIN, mode = env.NODE_ENV): boolean {
  if (!origin) return false;
  try {
    const requested = new URL(origin), expected = new URL(configured);
    // An Origin header must be a serialized origin, never a URL with a path,
    // credentials, query, fragment or a loosely matched hostname.
    if (requested.origin !== origin || expected.origin !== configured || !['http:', 'https:'].includes(requested.protocol)) return false;
    if (origin === configured) return true;
    return mode !== 'production' && localHosts.has(requested.hostname) && localHosts.has(expected.hostname)
      && requested.protocol === expected.protocol && requested.port === expected.port;
  } catch { return false; }
}
