"use strict";
const { isIP } = require("node:net");

// The SDK consumes only fetch(ip) -> { latitude, longitude }. The abandoned
// package used unbounded requests, a dead endpoint and an insecure HTTP fallback.
async function lookup(ip) {
  if (!isIP(ip)) throw new Error("Geolocation requires a valid IP address");
  let response;
  try {
    response = await globalThis.fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,latitude,longitude`, {
      signal: AbortSignal.timeout(5000), redirect: "error", headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("Lookup unavailable");
    const data = await response.json();
    if (data.success !== true || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)
        || Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) throw new Error("Invalid coordinates");
    return { latitude: data.latitude, longitude: data.longitude };
  } catch {
    throw new Error("IP geolocation is unavailable; please retry the broker connection later");
  }
}

exports.fetch = function (ip, callback) {
  const request = lookup(ip);
  if (typeof callback === "function") { request.then(data => callback(null, data), error => callback(error, null)); return; }
  return request;
};
