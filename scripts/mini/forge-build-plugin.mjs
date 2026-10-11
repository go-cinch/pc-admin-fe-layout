/** Keep Forge's browser PRNG out of the uni-app Rollup dependency graph. */
export function miniForge() {
  return {
    name: 'cinch-mini-forge-explicit-random',
    enforce: 'pre',
    transform(source, rawId) {
      // CommonJS emits virtual proxy modules whose ids contain the original
      // filename. Transform only the package source, never those proxies.
      if (rawId.startsWith('\0') || rawId.includes('?')) return;
      const id = rawId.split('?')[0].replace(/\\/g, '/');
      if (id.endsWith('/node-forge/lib/random.js')) {
        // RSA-OAEP receives its seed explicitly from wx.getRandomValues (or
        // Web Crypto on H5). No Forge call may silently create its own entropy.
        // Keep this CommonJS module in its original location so ./forge refers
        // to the same instance used by rsa, pkcs1 and the application adapter.
        return { code: `var forge = require('./forge');
function unavailable() { throw new Error('Use the platform secure random provider explicitly'); }
module.exports = forge.random = { getBytes: unavailable, getBytesSync: unavailable };
`, map: null };
      }
      if (id.endsWith('/node-forge/lib/util.js')) {
        const unsafe = "return typeof self === 'undefined' ? window : self;";
        if (!source.includes(unsafe)) throw new Error('Forge environment initialization changed; review the mini-program adapter');
        return { code: source.replace(unsafe, "return typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {};"), map: null };
      }
    },
  };
}
