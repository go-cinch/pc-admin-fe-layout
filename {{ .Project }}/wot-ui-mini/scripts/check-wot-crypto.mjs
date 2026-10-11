import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { compactDecrypt, exportJWK, generateKeyPair } from 'jose';

// This loads the actual uni-app output, including its shared Rollup vendor
// chunk. An esbuild-only core test cannot detect dependency hoisting here.
const root = path.resolve(process.argv[2] || 'dist/build/mp-weixin');
const noOp = () => {};
const wx = new Proxy({
  getSystemInfoSync: () => ({ platform: 'devtools', SDKVersion: '3.8.12', language: 'en', pixelRatio: 2, windowWidth: 390, windowHeight: 844 }),
  getAppBaseInfo: () => ({ SDKVersion: '3.8.12', language: 'en' }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, statusBarHeight: 24 }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  getStorageSync: () => '', canIUse: () => false,
}, { get: (target, key) => key in target ? target[key] : noOp });
const context = vm.createContext({ wx, console, setTimeout, clearTimeout, setInterval, clearInterval, getApp: () => ({}), getCurrentPages: () => [], App: noOp, Page: noOp, Component: noOp });
context.global = context;
// No window, self, global crypto, process, Buffer or TextEncoder is supplied.
// Fail even if an implicit weak entropy source is reached indirectly.
vm.runInContext('Math.random = () => { throw new Error("Implicit Math.random is forbidden in JWE"); };', context);
const cache = new Map();
function load(file) {
  const resolved = path.resolve(file);
  assert.ok(resolved.startsWith(root + path.sep), 'Only generated application modules may be loaded');
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const module = { exports: {} }; cache.set(resolved, module);
  const require = specifier => {
    assert.ok(specifier.startsWith('.'), `Unexpected external import in the mini bundle: ${specifier}`);
    return load(path.resolve(path.dirname(resolved), specifier.endsWith('.js') ? specifier : specifier + '.js'));
  };
  const factory = vm.runInContext(`(function(module, exports, require) {\n${readFileSync(resolved, 'utf8')}\n})`, context, { filename: path.relative(root, resolved) });
  try { factory(module, module.exports, require); }
  catch (error) { throw new Error(`${path.relative(root, resolved)} startup failed: ${error.message}`); }
  return module.exports;
}
const { encryptJWE } = load(path.join(root, 'core/jwe.js'));
const { forge } = load(path.join(root, 'common/vendor.js'));
assert.throws(() => forge.random.getBytesSync(16), /platform secure random provider/);
const { publicKey, privateKey } = await generateKeyPair('RSA-OAEP-256', { extractable: true });
const jwk = await exportJWK(publicKey);
const sizes = [];
const random = async size => { sizes.push(size); return webcrypto.getRandomValues(new Uint8Array(size)); };
for (const typ of ['login+jwe', 'register+jwe', 'password+jwe', 'password-reset+jwe']) {
  const payload = { challenge_id: 'browserless-rollup', password: '测试 😀', slider_proof: 'one-use-proof' };
  const encrypted = await encryptJWE(jwk, 'test-key', typ, payload, random);
  const decrypted = await compactDecrypt(encrypted, privateKey, { keyManagementAlgorithms: ['RSA-OAEP-256'], contentEncryptionAlgorithms: ['A256GCM'] });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(decrypted.plaintext)), payload);
  assert.equal(decrypted.protectedHeader.typ, typ);
}
assert.deepEqual(sizes, [76, 76, 76, 76], 'CEK, IV and OAEP seed must use the explicit secure source');
await assert.rejects(encryptJWE(jwk, 'test-key', 'login+jwe', {}, async () => { throw new Error('secure random unavailable'); }), /secure random unavailable/);
await assert.rejects(encryptJWE(jwk, 'test-key', 'login+jwe', {}, async () => new Uint8Array(1)), /Invalid random byte count/);
console.log('Wot generated Rollup bundle: browserless startup and four JWE flows passed; secure randomness fails closed.');
