// Only load the primitives used by compact JWE. The full forge entry eagerly
// initializes a browser PRNG and reads window.crypto, which WeChat does not expose.
import forge from 'node-forge/lib/forge';
import 'node-forge/lib/util';

// This is forge's internal environment object, not a browser/crypto polyfill.
(forge.util as any).globalScope ||= {};
const unavailable = () => { throw new Error('Use the platform secure random provider explicitly') };
// RSA-OAEP receives an explicit securely generated seed in jwe.ts. Disallow any
// implicit forge PRNG fallback (including its browser Math.random fallback).
forge.random = { getBytes: unavailable, getBytesSync: unavailable } as any;
export default forge;
