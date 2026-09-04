// __BUILD_TIME__ is a compile-time string constant from vite.config.js's
// `define` — substituted at build time, so `typeof` guards against it not
// existing at all in a context Vite didn't process (there isn't one today,
// but this is a one-line insurance policy against a confusing ReferenceError
// down the line).
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : null;
