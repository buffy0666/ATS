/**
 * Require-hook preloaded via NODE_OPTIONS=--require for the smoke-test
 * runner. The `server-only` package throws unconditionally when imported
 * outside of a Next.js server component (its job is to fail-fast a
 * client-component author). Tools and lib files use it as a marker; in
 * a Node script we need it to be a no-op.
 */
const Module = require("node:module");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "server-only") {
    // Return the path to this very file — its module.exports is `{}` by
    // virtue of running as a CommonJS script with no exports.
    return __filename;
  }
  return original.call(this, request, parent, ...rest);
};
// Intentional no-op exports.
module.exports = {};
