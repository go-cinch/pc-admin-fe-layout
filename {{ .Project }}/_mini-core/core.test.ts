import { test } from 'node:test';
import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { CompactEncrypt, compactDecrypt, exportJWK, generateKeyPair } from 'jose';
import { encryptJWE, type PublicJWK } from './jwe';
import { Client } from './client';
import { Screen } from './screen';
import { pageURL, ROUTES, type Platform } from './platform';
import { getConfigs } from './resources';
import { translate } from './locale';
const random: Platform['random'] = async size => webcrypto.getRandomValues(new Uint8Array(size));
const keys = await generateKeyPair('RSA-OAEP-256', { extractable: true });
const jwk = await exportJWK(keys.publicKey) as unknown as PublicJWK;
const session = { access_token: 'access-memory-only', refresh_token: 'rotating-refresh', password_reset_required: false, expired_at: Date.now() + 60000 };
function fixture(handler: Platform['request'] = async () => ({ status: 200, data: {} })) {
  const storage = new Map<string, unknown>(), calls: { url: string; options: any }[] = [], routes: string[] = [];
  const platform: Platform = { request: async (url, options) => { calls.push({ url, options }); return handler(url, options) }, read: key => storage.get(key), write: (key, v) => { v === undefined ? storage.delete(key) : storage.set(key, v) }, random, navigate: url => routes.push(url), title: () => {}, toast: () => {} };
  return { platform, storage, calls, routes, client: new Client(platform, 'https://api.example.com') };
}
for (const typ of ['login+jwe', 'register+jwe', 'password+jwe', 'password-reset+jwe']) test(`JWE ${typ} decrypts with independent JOSE implementation`, async () => {
  const payload = { username: '测试 😀', password: 'p', challenge_id: 'once-only', slider_proof: 'proof' };
  const jwe = await encryptJWE(jwk, 'key-1', typ, payload, random);
  assert.equal(jwe.split('.').length, 5);
  assert.equal(Buffer.from(jwe.split('.')[1], 'base64url').length, 256);
  const value = await compactDecrypt(jwe, keys.privateKey, { keyManagementAlgorithms: ['RSA-OAEP-256'], contentEncryptionAlgorithms: ['A256GCM'] });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(value.plaintext)), payload);
  assert.equal(value.protectedHeader.typ, typ);
  assert.equal(value.protectedHeader.kid, 'key-1');
  const parts = jwe.split('.'); parts[4] = (parts[4][0] === 'A' ? 'B' : 'A') + parts[4].slice(1);
  await assert.rejects(compactDecrypt(parts.join('.'), keys.privateKey));
});
test('credential encryption fails closed if secure randomness is unavailable', async () => {
  await assert.rejects(encryptJWE(jwk, 'key', 'login+jwe', {}, async () => { throw new Error('unavailable') }), /unavailable/);
  await assert.rejects(encryptJWE(jwk, 'key', 'login+jwe', {}, async () => new Uint8Array(1)), /random/);
});
test('user creation sends only encrypted password and preserves other fields', async () => {
  const f = fixture(async url => ({ status: 200, data: url.endsWith('/auth/pub/challenge') ? { challenge_id: 'register-once', key_id: 'key-1', public_key: jwk } : { id: 1 } }));
  f.client.accept(session);
  await f.client.save('user', { username: ' a ', password: ' p ', role_id: 2, metadata: { display_name: 'A' } }, undefined, 'idempotent-1');
  const req = f.calls.at(-1)!;
  assert.equal(req.options.data.username, 'a'); assert.equal(req.options.data.password, undefined);
  assert.equal(req.options.headers['x-idempotent'], 'idempotent-1');
  const value = await compactDecrypt(req.options.data.credential, keys.privateKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(value.plaintext)), { password: 'p', challenge_id: 'register-once' });
  assert.deepEqual(req.options.data.metadata, { display_name: 'A' });
  assert.equal(f.calls[0].options.headers.Authorization, undefined);
  assert.equal(req.options.headers.Authorization, 'Bearer access-memory-only');
  assert.equal(req.options.headers['Accept-Language'], 'zh-CN');
});
test('editing without password omits plaintext and credential challenge', async () => {
  const f = fixture(); await f.client.save('user', { username: ' a ', password: '' }, 2);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].options.data, { username: 'a' });
});
test('concurrent 401s share one refresh and rotate tokens', async () => {
  let refreshes = 0;
  const f = fixture(async (url, options) => {
    if (url.endsWith('/auth/pub/refresh')) { refreshes++; await new Promise(r => setTimeout(r, 10)); return { status: 200, data: { ...session, access_token: 'new-access', refresh_token: 'new-refresh' } } }
    return options.headers.Authorization === 'Bearer new-access' ? { status: 200, data: { ok: true } } : { status: 401, data: {} };
  });
  f.client.accept(session);
  await Promise.all([f.client.request('/user'), f.client.request('/role')]);
  assert.equal(refreshes, 1); assert.equal(f.client.refreshToken, 'new-refresh');
  assert.equal([...f.storage.values()].includes('new-access'), false);
});
test('logout prevents in-flight refresh from resurrecting a session', async () => {
  let finish!: (value: any) => void;
  const f = fixture(async () => new Promise(resolve => { finish = resolve }));
  f.client.accept(session); const pending = f.client.refresh(); f.client.clear(); finish({ status: 200, data: session });
  await assert.rejects(pending); assert.equal(f.client.accessToken, ''); assert.equal(f.storage.size, 0);
});
test('required reset blocks protected retry after refresh', async () => {
  const f = fixture(async url => url.endsWith('/auth/pub/refresh') ? { status: 200, data: { ...session, password_reset_required: true } } : { status: 401, data: {} });
  f.client.accept(session); await assert.rejects(f.client.request('/user'));
  assert.equal(f.calls.filter(c => c.url.endsWith('/user')).length, 1); assert.equal(f.client.resetRequired, true);
});
test('canonical routes map to physical mini pages and reject unknown routes', () => {
  for (const route of ROUTES) assert.equal(pageURL(route), `/pages${route}/index`);
  assert.equal(pageURL('/system/user?status=0'), '/pages/system/user/index?status=0');
  assert.throws(() => pageURL('/unknown'));
});
test('menu and action permissions preserve backend action namespace', () => {
  const f = fixture(); f.client.user = { id: 1, username: 'viewer', code: 'V', permission: { menus: ['/system/group'], btns: ['system.user.group.read', 'system.msg.send'] } };
  assert.equal(f.client.canMenu('/system/user-group'), true); assert.equal(f.client.can('user-group', 'read'), true);
  assert.equal(f.client.can('user', 'delete'), false); assert.equal(f.client.canMsg('send'), true); assert.equal(f.client.canMsg('delete'), false);
});
test('resource forms retain full reference fields in both languages', () => {
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const configs = getConfigs(k => translate(locale, k));
    assert.deepEqual(configs.user.fields.map(f => f.key), ['username', 'password', 'role_id', 'action_codes']);
    assert.ok(configs.action.fields.some(f => f.key === 'resource'));
    assert.ok(configs.action.fields.some(f => f.key === 'menu'));
    assert.ok(configs.action.fields.some(f => f.key === 'button'));
    for (const config of Object.values(configs)) for (const field of config.fields) assert.ok(!field.label.startsWith('system.'), field.label);
  }
});
test('screen validates empty credentials without issuing requests', async () => {
  const f = fixture(); const screen = new Screen(f.client, 'ant', () => {}); screen.route = '/auth/login';
  await screen.login(); assert.equal(f.calls.length, 0); assert.ok(screen.errors.username); assert.ok(screen.errors.password); screen.dispose();
});
test('screen read-only state hides mutations and denies programmatic create', async () => {
  const f = fixture(); f.client.user = { id: 1, username: 'viewer', code: 'V', permission: { menus: ['/system/user'], btns: ['system.user.read'] } };
  const screen = new Screen(f.client, 'tdesign', () => {}); screen.view = 'list';
  await screen.edit(true); const vm = screen.snapshot(); assert.equal(vm.canCreate, false); assert.equal(vm.canDelete, false); assert.equal(vm.sheet, null); assert.equal(f.calls.length, 0); screen.dispose();
});
test('stale slider proof is discarded when username changes', async () => {
  let finish!: (value: any) => void;
  const f = fixture(async url => url.endsWith('/challenge') ? { status: 200, data: { captcha_id: 'one' } } : new Promise(resolve => { finish = resolve }));
  const screen = new Screen(f.client, 'wot', () => {}); screen.route = '/auth/login'; screen.auth.username = 'a'; screen.auth.password = 'p';
  screen.beginSlider(0, 252); screen.moveSlider(200); const end = screen.endSlider(); await new Promise(r => setTimeout(r, 0));
  screen.input('auth.username', 'b'); finish({ status: 200, data: { proof: 'old-user-proof' } }); await end;
  assert.equal(screen.proof, ''); screen.dispose();
});
test('late 401 from a previous login cannot refresh the newly signed-in account', async () => {
  let finish!: (value: any) => void;
  const f = fixture(async () => new Promise(resolve => { finish = resolve }));
  f.client.accept(session); const pending = f.client.request('/user');
  f.client.clear(); f.client.accept({ ...session, access_token: 'another-user', refresh_token: 'another-refresh' });
  finish({ status: 401, data: {} }); await assert.rejects(pending);
  assert.equal(f.calls.length, 1); assert.equal(f.client.accessToken, 'another-user');
});

test('browserless WeChat bundle initializes and encrypts without window.crypto', async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('./jwe.ts', import.meta.url))], bundle: true, platform: 'browser', format: 'cjs', target: 'es2018', write: false });
  const module = { exports: {} as any };
  vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports, window: undefined, self: undefined, console, setTimeout, clearTimeout });
  const encrypted = await module.exports.encryptJWE(jwk, 'native-key', 'login+jwe', { challenge_id: 'native', password: 'p' }, random);
  const result = await compactDecrypt(encrypted, keys.privateKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(result.plaintext)), { challenge_id: 'native', password: 'p' });
});
