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

test('logged-out settings retain credentials and persist all preference groups', async () => {
  const f = fixture(); const screen = new Screen(f.client, 'ant', () => {}); screen.route = '/auth/login';
  screen.input('auth.username', 'alice'); screen.input('auth.password', 'typed-secret');
  screen.captcha = { captcha_id: 'login-captcha' } as any; screen.captchaVerified = true;
  await screen.action('settings'); assert.equal(screen.snapshot().settingsOpen, true);
  screen.input('preference.dark', true); screen.input('preference.reducedTransparency', true);
  screen.input('preference.footer', false); await screen.action('accent', 'green');
  await screen.action('language'); await screen.action('language-value', 'en-US');
  assert.equal(screen.sheet?.type, 'settings'); assert.equal(f.client.locale, 'en-US');
  await screen.action('timezone'); await screen.action('timezone-value', 'UTC');
  await screen.action('preferences'); screen.input('form.company', 'Example'); screen.input('form.year', '');
  await screen.action('save-preferences'); assert.equal(screen.sheet?.type, 'settings');
  await screen.action('close'); assert.equal(screen.snapshot().settingsOpen, false);
  assert.equal(screen.captcha?.captcha_id, 'login-captcha'); assert.equal(screen.captchaVerified, true);
  assert.equal(screen.auth.username, 'alice'); assert.equal(screen.auth.password, 'typed-secret');
  const next = new Screen(f.client, 'ant', () => {});
  assert.deepEqual([next.preferences.dark, next.preferences.reducedTransparency, next.preferences.footer, next.preferences.accent, next.preferences.timezone, next.preferences.company], [true,true,false,'green','UTC','Example']);
  assert.ok(!JSON.stringify([...f.storage.values()]).includes('typed-secret'));
  screen.dispose(); next.dispose();
});
test('account history is usernames-only; selection clears password and supports deletion', async () => {
  const f = fixture(); f.storage.set(f.client.prefix+'accounts', [' alice ', 'alice', 'bob', '', { password: 'never' }]);
  f.storage.set(f.client.prefix+'username', 'legacy');
  const screen = new Screen(f.client, 'ant', () => {}); screen.route = '/auth/login';
  assert.deepEqual(screen.accounts, ['alice','bob']); assert.equal(f.storage.has(f.client.prefix+'username'), false);
  screen.input('auth.password', 'secret'); await screen.action('account-pick', 'bob');
  assert.equal(screen.auth.username, 'bob'); assert.equal(screen.auth.password, '');
  await screen.action('account-remove', 'alice'); assert.deepEqual(screen.accounts, ['bob']);
  await screen.action('accounts-clear'); assert.deepEqual(screen.accounts, []); assert.equal(f.storage.has(f.client.prefix+'accounts'), false);
  assert.equal('remember' in screen.auth, false); screen.dispose();
});
test('stale username verification cannot replace the current account captcha', async () => {
  const pending: ((value: any) => void)[] = [];
  const f = fixture(async () => new Promise(resolve => pending.push(resolve)));
  const screen = new Screen(f.client, 'wot', () => {}); screen.route = '/auth/login';
  screen.input('auth.username', 'first'); const first = screen.verifyUsername();
  screen.input('auth.username', 'second'); const second = screen.verifyUsername();
  pending[1]({status:200,data:{captcha:{captcha_id:'current'}}}); await second;
  pending[0]({status:200,data:{captcha:{captcha_id:'stale'}}}); await first;
  assert.equal(screen.captcha?.captcha_id, 'current'); assert.equal(screen.usernameBusy, false); screen.dispose();
});
test('registration rechecks availability before submitting encrypted credentials', async () => {
  const f = fixture(async () => ({status:200,data:{available:false}}));
  const screen = new Screen(f.client, 'tdesign', () => {}); screen.route = '/auth/register';
  screen.auth.username='taken'; screen.auth.password='p'; screen.auth.confirmation='p'; screen.proof='proof';
  await screen.login(); assert.ok(screen.errors.username); assert.equal(f.calls.length,1);
  assert.ok(f.calls[0].url.includes('/auth/pub/register/username?username=taken')); screen.dispose();
});

const admin = { id: 1, username: 'admin', code: 'A', permission: { menus: ['*'], btns: ['*'] } };
const pageData = (items: any[] = [], t = items.length) => ({ items, t, p: 1, s: 20 });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('dashboard ends bootstrap before independent requests complete and retains successful regions', async () => {
  const pending = new Map<string, (value: any) => void>();
  const f = fixture(async url => {
    if (url.endsWith('/auth/pub/refresh')) return { status: 200, data: session };
    if (url.endsWith('/auth/info')) return { status: 200, data: admin };
    if (url.includes('/user?')) return new Promise(resolve => pending.set(new URL(url).searchParams.get('status') || 'recent', resolve));
    return { status: 200, data: { count: 0 } };
  });
  f.client.accept(session); const screen = new Screen(f.client, 'ant', () => {});
  const start = screen.start('/dashboard/overview'); await tick();
  assert.equal(screen.booting, false); assert.equal(screen.snapshot().reviewsLoading, true);
  pending.get('1')!({ status: 200, data: pageData([], 9) }); await tick();
  assert.equal(screen.stats.active.loading, false); assert.equal(screen.stats.active.value, 9);
  assert.equal(screen.stats.pending.loading, true); assert.equal(screen.recentLoading, true);
  pending.get('0')!({ status: 503, data: { msg: 'Try later' } });
  pending.get('2')!({ status: 200, data: pageData([], 2) });
  pending.get('recent')!({ status: 200, data: pageData([{ id: 4, username: 'a', created_at: 1, updated_at: 1 }], 12) });
  await start;
  assert.equal(screen.snapshot().reviewsLoading, false); assert.equal(screen.snapshot().reviewsError, 'Try later');
  assert.equal(screen.snapshot().stats[1].display, '—'); assert.equal(screen.error, ''); assert.equal(screen.total, 12);
  screen.dispose();
});

test('failed refresh keeps previously loaded records and exposes an inline recoverable error', async () => {
  let fail = false, toast = 0;
  const f = fixture(async () => { if (fail) throw new Error('ECONNREFUSED 127.0.0.1:8081'); return { status: 200, data: pageData([{ id: 5, username: 'existing', created_at: 1, updated_at: 1 }]) } });
  f.platform.toast = () => toast++; f.client.user = admin;
  const screen = new Screen(f.client, 'wot', () => {}); screen.view = 'list'; screen.route = '/system/user';
  await screen.load(); fail = true; await screen.load();
  assert.equal(screen.records[0].username, 'existing'); assert.equal(screen.loading, false);
  assert.equal(screen.error, f.client.t('requestError')); assert.equal(toast, 0); screen.dispose();
});

test('late detail response cannot replace a newly opened record or a closed sheet', async () => {
  const pending = new Map<string, (value: any) => void>();
  const f = fixture(async url => new Promise(resolve => pending.set(url, resolve))); f.client.user = admin;
  const screen = new Screen(f.client, 'ant', () => {}); screen.view = 'list'; screen.route = '/system/user';
  const first = screen.detail(1); screen.close(true); const second = screen.detail(2);
  pending.get(f.client.base + '/user/2')!({ status: 200, data: { id: 2, username: 'new' } }); await second;
  pending.get(f.client.base + '/user/1')!({ status: 200, data: { id: 1, username: 'old' } }); await first;
  assert.equal(screen.record?.id, 2); assert.equal(screen.sheet?.id, 2); assert.equal(screen.sheet?.loading, false);
  screen.dispose();
});

test('local screen lock preserves login and stores no plaintext lock password', async () => {
  const f = fixture(); f.client.accept(session); f.client.user = admin;
  const screen = new Screen(f.client, 'ant', () => {});
  await screen.action('lock'); screen.input('form.lock_password', 'local-only'); await screen.action('set-lock');
  assert.equal(screen.locked, true); assert.equal(f.client.accessToken, session.access_token);
  assert.ok(!JSON.stringify([...f.storage.values()]).includes('local-only'));
  assert.notEqual(f.client.screenLock?.hash, 'local-only'); assert.equal(screen.form.lock_password, undefined);
  const restored = new Client(f.platform, f.client.base);
  assert.equal(restored.screenLock?.hash, f.client.screenLock?.hash);
  await screen.action('navigate', '/system/user'); assert.equal(f.routes.length, 0);
  screen.input('lock.password', 'wrong'); await screen.action('unlock'); assert.equal(screen.locked, true);
  screen.input('lock.password', 'local-only'); await screen.action('unlock'); assert.equal(screen.locked, false);
  assert.equal(f.calls.length, 0); assert.equal(f.client.accessToken, session.access_token); screen.dispose();
});

test('enabled filters distinguish all, false and true; status filters retain multiple choices', async () => {
  const f = fixture(async () => ({ status: 200, data: pageData() })); f.client.user = admin;
  const screen = new Screen(f.client, 'ant', () => {}); screen.view = 'list'; screen.route = '/system/dictionary'; screen.resource = 'dictionary';
  await screen.action('filters'); await screen.action('filter-picker', 'filter.enabled');
  await screen.action('option', 'false'); assert.equal(screen.filters.enabled, 'false');
  await screen.action('filter-picker', 'filter.enabled'); await screen.action('option', ''); assert.equal(screen.filters.enabled, undefined);
  screen.close(true); screen.route = '/system/user'; screen.resource = 'user'; await screen.action('filters');
  await screen.action('filter-picker', 'filter.status'); await screen.action('option', '0'); await screen.action('option', '2');
  assert.deepEqual(screen.filters.status, [0, 2]); screen.dispose();
});

test('clearing the primary multi-filter draft does not remove already selected resource rules', async () => {
  const f = fixture(async () => ({ status: 200, data: pageData() })); f.client.user = admin;
  const screen = new Screen(f.client, 'tdesign', () => {}); screen.view = 'list'; screen.route = '/system/whitelist'; screen.resource = 'whitelist';
  screen.query = 'GET|/user'; await screen.action('search'); assert.deepEqual(screen.filters.resource, ['GET|/user']);
  assert.equal(screen.query, ''); await screen.action('search'); assert.deepEqual(screen.filters.resource, ['GET|/user']);
  await screen.action('remove-filter-value', 'GET|/user'); assert.deepEqual(screen.filters.resource, []); screen.dispose();
});

test('whitelist direct query uses resource as its primary search and retains category zero', async () => {
  const f = fixture(async url => {
    if (url.endsWith('/auth/pub/refresh')) return { status: 200, data: session };
    if (url.endsWith('/auth/info')) return { status: 200, data: admin };
    return { status: 200, data: url.includes('/whitelist?') ? pageData() : { count: 0 } };
  });
  f.client.accept(session); const screen = new Screen(f.client, 'tdesign', () => {});
  await screen.start('/system/whitelist', { resource: 'GET|/user', category: '0' });
  const url = f.calls.find(c => c.url.includes('/whitelist?'))!.url;
  assert.equal(new URL(url).searchParams.get('resource'), 'GET|/user'); assert.equal(new URL(url).searchParams.get('category'), '0');
  assert.equal(screen.primaryFilter.key, 'resource'); screen.dispose();
});

test('column picker uses the same defaults as rendered rows and retains other columns on first toggle', async () => {
  const f = fixture(); f.client.user = admin; const screen = new Screen(f.client, 'ant', () => {}); screen.resource = 'user-group';
  await screen.action('columns'); assert.deepEqual(screen.snapshot().choices.filter(c => c.selected).map(c => c.value).sort(), ['action_codes', 'users', 'word']);
  await screen.action('column', 'users'); assert.deepEqual(screen.visibleColumns, ['name', 'word', 'action_codes']); screen.dispose();
});

test('inbox read and personal delete use mutation endpoints without requesting details', async () => {
  const f = fixture(async url => ({ status: 200, data: url.endsWith('unread-count') ? { count: 0 } : url.includes('/msg/inbox?') ? pageData() : {} })); f.client.user = admin;
  const screen = new Screen(f.client, 'wot', () => {}); screen.route = '/msg/inbox'; screen.view = 'messages'; screen.records = [{ id: 3, title: 'Notice', created_at: 1, updated_at: 1 }]; screen.total = 1;
  await screen.action('message-read', '3'); assert.ok(screen.records[0].read_at);
  await screen.action('message-delete', '3'); assert.equal(screen.records.length, 0); assert.equal(screen.sheet, undefined);
  assert.deepEqual(f.calls.filter(c => c.url.endsWith('/msg/inbox/3')).map(c => c.options.method), ['PATCH', 'DELETE']); screen.dispose();
});

test('menu-denied routes cannot expose or call mutations despite unrelated button grants', async () => {
  const f = fixture(); f.client.user = { ...admin, permission: { menus: ['/system/role'], btns: ['*'] } };
  const screen = new Screen(f.client, 'tdesign', () => {}); screen.route = '/system/user'; screen.view = 'list';
  assert.equal(screen.snapshot().canCreate, false); await screen.edit(true); await screen.detail(3); await screen.save();
  assert.equal(f.calls.length, 0); screen.dispose();
});

test('authentication Retry rechecks the username without replaying credentials and clears recovered errors', async () => {
  let failed = true;
  const f = fixture(async url => {
    assert.ok(url.includes('/auth/pub/login/verification?username=alice'));
    if (failed) throw new Error('offline');
    return { status: 200, data: {} };
  });
  const screen = new Screen(f.client, 'ant', () => {}); screen.route = '/auth/login'; screen.view = 'auth';
  screen.auth.username = 'alice'; screen.auth.password = 'still-typed';
  await screen.verifyUsername(); assert.equal(screen.error, f.client.t('requestError'));
  assert.equal(screen.snapshot().errorRetryAction, 'retry-auth-check'); assert.equal(screen.snapshot().canRetryError, true);
  failed = false; await screen.action('retry-auth-check');
  assert.equal(screen.error, ''); assert.equal(screen.auth.password, 'still-typed'); assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => call.options.method === 'GET' && call.options.data === undefined));
  screen.route = '/auth/reset-password'; assert.equal(screen.snapshot().canRetryError, false);
  await screen.action('retry-auth-check'); assert.equal(f.calls.length, 2); screen.dispose();
});

test('every pagination change clears and reapplies the result scroll anchor', async () => {
  const targets: string[] = [];
  const f = fixture(async url => { const params = new URL(url).searchParams; return { status: 200, data: { ...pageData([{ id: Number(params.get('p')), username: 'row', created_at: 1, updated_at: 1 }], 150), p: Number(params.get('p')), s: Number(params.get('s')) } } });
  f.client.user = admin; const screen = new Screen(f.client, 'tdesign', vm => targets.push(vm.scrollTarget)); screen.view = 'list'; screen.route = '/system/user'; screen.total = 150;
  await screen.action('next'); assert.equal(screen.page, 2); assert.equal(screen.scrollTarget, 'results-top');
  const start = targets.length; await screen.action('next');
  assert.equal(screen.page, 3); assert.equal(targets[start], ''); assert.equal(targets.at(-1), 'results-top');
  await screen.action('prev'); assert.equal(screen.page, 2); assert.equal(screen.scrollTarget, 'results-top');
  await screen.action('page-size'); await screen.action('size-value', '50');
  assert.equal(screen.page, 1); assert.equal(screen.size, 50); assert.equal(screen.scrollTarget, 'results-top');
  assert.deepEqual(f.calls.map(call => new URL(call.url).searchParams.get('p')), ['2', '3', '2', '1']); screen.dispose();
});

test('lock expiration and message expiry use datetime fields without changing stored values', async () => {
  const f = fixture(); f.client.user = admin; const screen = new Screen(f.client, 'wot', () => {}); screen.route = '/system/user'; screen.view = 'list';
  await screen.action('lock-user'); const lock = screen.getFormFields().find(field => field.key === 'form.lockUntil')!;
  assert.equal(lock.kind, 'datetime'); assert.equal(lock.required, true); assert.match(lock.value, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  screen.close(true); screen.route = '/system/msg'; screen.view = 'messages'; await screen.action('compose');
  const expiry = screen.getFormFields().find(field => field.key === 'form.expired_at')!;
  assert.equal(expiry.kind, 'datetime'); assert.equal(expiry.required, false); assert.equal(expiry.value, ''); screen.dispose();
});

test('sent message columns stay independent from user columns and density options remain complete', async () => {
  const f = fixture(); f.client.user = admin; const screen = new Screen(f.client, 'ant', () => {}); screen.route = '/system/msg'; screen.view = 'messages';
  await screen.action('columns'); assert.deepEqual(screen.snapshot().choices.map(choice => choice.value), ['type', 'scope', 'published_at']);
  await screen.action('column', 'scope'); assert.deepEqual(screen.visibleColumns, ['title', 'type', 'published_at']);
  screen.records = [{ id: 2, title: 'Message', type: 'notice', scope: 'all', created_at: 1, updated_at: 1, published_at: 1 }];
  assert.equal(screen.snapshot().messageRows[0].showScope, false);
  screen.close(true); await screen.action('density'); assert.deepEqual(screen.snapshot().choices.map(choice => choice.value), ['compact', 'default', 'loose']);
  screen.route = '/system/user'; screen.resource = 'user'; screen.view = 'list'; assert.deepEqual(screen.visibleColumns, ['username', 'role', 'status']); screen.dispose();
});

test('personal message center belongs to Mine while sent management remains in Manage', () => {
  const f = fixture(); f.client.user = admin; const screen = new Screen(f.client, 'ant', () => {}); screen.view = 'messages'; screen.route = '/msg/inbox';
  assert.equal(screen.snapshot().l.messageCenter, '消息中心');
  assert.deepEqual(screen.snapshot().dock.filter(item => item.active).map(item => item.key), ['profile']);
  f.client.locale = 'en-US'; assert.equal(screen.snapshot().l.messageCenter, 'Message center');
  screen.route = '/system/msg'; assert.deepEqual(screen.snapshot().dock.filter(item => item.active).map(item => item.key), ['manage']); screen.dispose();
});

test('unread count carries between page instances and clears after read, delete and read-all', async () => {
  let count = 2;
  const f = fixture(async (url, options) => {
    if (url.endsWith('/msg/unread-count')) return { status: 200, data: { count } };
    if (url.endsWith('/msg/inbox/read-all')) count = 0;
    else if (url.endsWith('/msg/inbox/3') && ['PATCH', 'DELETE'].includes(options.method)) count = Math.max(0, count - 1);
    return { status: 200, data: url.includes('/msg/inbox?') ? pageData() : {} };
  });
  f.client.user = admin; const home = new Screen(f.client, 'ant', () => {}); await home.countMessages();
  assert.equal(home.snapshot().unread, 2); const updates: number[] = [];
  const inbox = new Screen(f.client, 'ant', vm => updates.push(vm.unread)); inbox.view = 'messages'; inbox.route = '/msg/inbox';
  assert.equal(inbox.snapshot().unread, 2);
  inbox.records = [{ id: 3, title: 'Unread', created_at: 1, updated_at: 1 }]; inbox.total = 1;
  await inbox.action('message-read', '3'); assert.equal(inbox.snapshot().unread, 1); assert.equal(f.client.unread, 1);
  await inbox.action('message-delete', '3'); assert.equal(inbox.snapshot().unread, 0); assert.equal(f.client.unread, 0);
  count = 3; await inbox.countMessages(); await inbox.action('read-all');
  assert.equal(inbox.snapshot().unread, 0); assert.equal(updates.at(-1), 0);
  const profile = new Screen(f.client, 'wot', () => {}); assert.equal(profile.snapshot().unread, 0);
  f.client.unread = 8; f.client.clear(); assert.equal(f.client.unread, 0);
  home.dispose(); inbox.dispose(); profile.dispose();
});

test('late unread response cannot attach the previous account badge to a new session', async () => {
  let resolve!: (value: any) => void;
  const f = fixture(async () => new Promise(done => resolve = done)); f.client.accept(session);
  const screen = new Screen(f.client, 'tdesign', () => {}); const pending = screen.countMessages();
  f.client.clear(); f.client.accept({ ...session, access_token: 'different-account' });
  resolve({ status: 200, data: { count: 9 } }); await pending;
  assert.equal(f.client.unread, 0); assert.equal(screen.unread, 0); screen.dispose();
});

test('message-center back returns to My Account while sent management returns to applications', async () => {
  const f=fixture(); const screen=new Screen(f.client,'ant',()=>{});
  screen.view='messages'; screen.route='/msg/inbox'; await screen.action('back');
  assert.equal(f.routes.at(-1),'/pages/profile/index');
  screen.route='/system/msg'; await screen.action('back');
  assert.equal(f.routes.at(-1),'/pages/dashboard/overview/index?tab=manage'); screen.dispose();
});
