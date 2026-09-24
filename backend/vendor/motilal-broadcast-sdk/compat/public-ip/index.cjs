"use strict";
// Preserve the vendored CommonJS SDK's v4() API while using the maintained ESM package.
exports.v4 = async function (options) {
  const { publicIpv4 } = await import("public-ip-modern");
  return publicIpv4({ timeout: 5000, ...options });
};
