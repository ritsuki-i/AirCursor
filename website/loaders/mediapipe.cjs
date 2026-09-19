/**
 * Legacy MediaPipe packages expose their API through the IIFE's `this`.
 * Webpack otherwise sees no exports. Preserve the vendor source and give its
 * export scope an explicit CommonJS boundary. WASM assets still load on demand.
 */
module.exports = function mediapipeLoader(source) {
  return "var mediapipeExports = {};\n" +
    source.replace(/\.call\(this\);?\s*$/, ".call(mediapipeExports);") +
    "\nmodule.exports = mediapipeExports;\n";
};
