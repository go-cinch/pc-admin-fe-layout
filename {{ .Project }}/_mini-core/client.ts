import type { Platform } from './platform';
import { encryptJWE, randomID, type PublicJWK } from './jwe';
import type { AuthInfo, SessionResult, PageResult, RecordData, ResourceKind } from './types';
import { translate, type Locale } from './locale';
export class ApiError extends Error {
  constructor(public status: number, public data: any) { super(data?.msg || `HTTP ${status}`) }
}
export interface Options { method?: string; body?: unknown; public?: boolean; retry?: boolean; headers?: Record<string, string> }
export class Client {
  accessToken = '';
  refreshToken = '';
  resetRequired = false;
  user: AuthInfo | null = null;
  locale: Locale;
  generation = 0;
  onExpired = () => {};
  private refreshing: Promise<void> | null = null;
  private initializing: Promise<void> | null = null;
  private ready = false;
  registrationLogin: { username: string; password: string } | null = null;
  readonly prefix: string;
  constructor(public platform: Platform, public base: string) {
    this.base = base.replace(/\/$/, '');
    this.prefix = `cinch-mini:${this.base}:`;
    this.refreshToken = String(platform.read(this.prefix + 'refresh') || '');
    this.locale = platform.read(this.prefix + 'locale') === 'en-US' ? 'en-US' : 'zh-CN';
  }
  t(key: string, vars: Record<string, unknown> = {}) { return translate(this.locale, key, vars) }
  async request<T = any>(path: string, options: Options = {}): Promise<T> {
    const generation = this.generation;
    let response;
    try {
      response = await this.platform.request(this.base + path, { method: options.method || 'GET', data: options.body, headers: {
        'Accept-Language': this.locale,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(!options.public && this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        ...options.headers,
      } });
    } catch { throw new Error(this.t('requestError')) }
    if (response.status >= 200 && response.status < 300) return response.data as T;
    if (response.data?.error_code === 'AUTH_PASSWORD_RESET_REQUIRED') { this.resetRequired = true; this.onExpired() }
    if (response.status === 401 && !options.public && generation !== this.generation) throw new Error(this.t('sessionExpired'));
    if (response.status === 401 && !options.public && options.retry !== false && this.refreshToken) {
      await this.refresh();
      if (this.resetRequired && !path.startsWith('/auth/')) { this.onExpired(); throw new ApiError(403, { msg: this.t('resetRequired') }) }
      return this.request<T>(path, { ...options, retry: false });
    }
    if (response.status === 401 && !options.public && generation === this.generation) { this.clear(); this.onExpired() }
    throw new ApiError(response.status, response.data);
  }
  clear() { this.generation++; this.accessToken = ''; this.refreshToken = ''; this.user = null; this.resetRequired = false; this.platform.write(this.prefix + 'refresh', undefined) }
  accept(result: SessionResult) { this.generation++; this.accessToken = result.access_token; this.refreshToken = result.refresh_token; this.resetRequired = !!result.password_reset_required; this.platform.write(this.prefix + 'refresh', result.refresh_token) }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const generation = this.generation;
    this.refreshing = this.request<SessionResult>('/auth/pub/refresh', { method: 'POST', public: true, body: { refresh_token: this.refreshToken } }).then(result => {
      if (this.generation !== generation) throw new Error(this.t('sessionExpired'));
      this.accept(result);
    }).catch(error => { if (this.generation === generation) { this.clear(); this.onExpired() } throw error }).finally(() => { this.refreshing = null });
    return this.refreshing;
  }
  async initialize() {
    if (this.ready) return;
    this.initializing ||= (async () => { try { if (this.refreshToken) { await this.refresh(); if (!this.resetRequired) await this.loadUser() } } finally { this.ready = true } })();
    return this.initializing;
  }
  async loadUser(): Promise<void> { const generation = this.generation; const user = await this.request<AuthInfo>('/auth/info'); if (generation === this.generation) this.user = user; else if (this.accessToken && !this.resetRequired) return this.loadUser() }
  async logout() { try { if (this.refreshing) await this.refreshing.catch(() => {}); if (this.refreshToken) await this.request('/auth/pub/logout', { method: 'POST', public: true, body: { refresh_token: this.refreshToken } }) } finally { this.clear() } }
  async credentials(purpose: 'login' | 'register' | 'password_change' | 'password_reset', payload: Record<string, unknown>) {
    const authenticated = purpose.startsWith('password');
    const challenge = await this.request<{ challenge_id: string; key_id: string; public_key: PublicJWK }>(authenticated ? '/auth/challenge' : '/auth/pub/challenge', { method: 'POST', public: !authenticated, body: { purpose } });
    const types = { login: 'login+jwe', register: 'register+jwe', password_change: 'password+jwe', password_reset: 'password-reset+jwe' };
    return { challenge_id: challenge.challenge_id, credential: await encryptJWE(challenge.public_key, challenge.key_id, types[purpose], { ...payload, challenge_id: challenge.challenge_id }, this.platform.random) };
  }
  async submitCredentials(purpose: 'login' | 'register' | 'password_change' | 'password_reset', payload: Record<string, unknown>) {
    const paths = { login: '/auth/pub/login', register: '/auth/pub/register', password_change: '/auth/change/pwd', password_reset: '/auth/reset/pwd' };
    return this.request<SessionResult>(paths[purpose], { method: purpose.startsWith('password') ? 'PATCH' : 'POST', public: !purpose.startsWith('password'), body: await this.credentials(purpose, payload) });
  }
  list(resource: string, params: Record<string, unknown> = {}) {
    const query = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : String(v))}`).join('&');
    return this.request<PageResult>(`/${resource}?${query}`);
  }
  async save(resource: ResourceKind, payload: Record<string, unknown>, id?: number, key?: string) {
    let body = { ...payload };
    if (resource === 'user') {
      if (typeof body.username === 'string') body.username = body.username.trim();
      const password = typeof body.password === 'string' ? body.password.trim() : '';
      delete body.password;
      if (password) body = { ...body, ...await this.credentials('register', { password }) };
    }
    return this.request<RecordData>(`/${resource}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body, headers: id ? {} : { 'x-idempotent': key || await randomID(this.platform.random) } });
  }
  remove(resource: string, ids: number[]) { return this.request(`/${resource}/${ids.join(',')}`, { method: 'DELETE' }) }
  canMenu(path: string) { return ['/dashboard/overview', '/profile', '/msg/inbox'].includes(path) || !!this.user?.permission?.menus.some(v => v === '*' || v === path || (path === '/system/user-group' && v === '/system/group')) }
  can(resource: string, action: string) { return !!this.user?.permission?.btns.some(v => v === '*' || v === `system.${resource === 'user-group' ? 'user.group' : resource}.${action}`) }
  canMsg(action: string) { return !!this.user?.permission?.btns.some(v => v === '*' || v === `system.msg.${action}`) }
}
