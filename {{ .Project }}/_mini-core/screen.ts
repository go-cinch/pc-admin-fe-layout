import { Client, ApiError } from './client';
import { getConfigs, type ResourceConfig } from './resources';
import { pageURL, type MiniConfig } from './platform';
import { randomID } from './jwe';
import { readAccounts, saveAccounts } from './accounts';
import { lockDigest } from './lock';
import { primaryFilter, parseFilterQuery, normalizeFilterText, pickFilterValue, presentSuggestions, queryFilterSuggestions, readFilterHistory, saveFilterHistory, removeFilterHistory } from './filter-options';
import { dictionaryKeyValid } from './validation';
import { buildChangedPayload } from './update-payload';
import { formatDate, parseDate, systemTimezone, text } from './format';
import type { RecordData, ResourceKind, PointCaptcha, CaptchaPoint } from './types';

const modules: { resource: string; key: string; icon: string; group: number }[] = [
  { resource: 'user', key: 'system.user.title', icon: 'users', group: 0 },
  { resource: 'role', key: 'system.role.title', icon: 'shield', group: 0 },
  { resource: 'user-group', key: 'system.userGroup.title', icon: 'grid', group: 0 },
  { resource: 'action', key: 'system.action.title', icon: 'key', group: 0 },
  { resource: 'dictionary', key: 'system.dictionary.title', icon: 'book', group: 1 },
  { resource: 'whitelist', key: 'system.whitelist.title', icon: 'check', group: 1 },
  { resource: 'msg', key: 'app.msg.manage', icon: 'bell', group: 2 },
];
const defaultColumns: Record<ResourceKind, string[]> = { user: ['username', 'role', 'status'], role: ['name', 'word', 'action_codes'], 'user-group': ['name', 'word', 'users', 'action_codes'], action: ['name', 'word', 'group'], dictionary: ['name', 'key', 'enabled'], whitelist: ['id', 'category', 'resource'] };
const labels: Record<string, string> = {
  home: 'home', manage: 'managing', security: 'security', mine: 'mine', all: 'all', search: 'system.common.search', reset: 'system.common.reset',
  create: 'system.common.create', edit: 'system.common.edit', remove: 'system.common.delete', refresh: 'refresh', filter: 'filterTitle',
  detail: 'detail', close: 'close', cancel: 'cancel', save: 'save', confirm: 'confirm', back: 'back', username: 'system.fields.username',
  password: 'system.fields.password', login: 'page.auth.login', register: 'page.auth.register',
  verification: 'verification', passed: 'verified', slider: 'slider', more: 'more', common: 'common', latest: 'latest', review: 'needsReview',
  reviewAction: 'system.user.review', total: 'userTotal', userOverview: 'userOverview', noData: 'empty', emptyHint: 'emptyHint', retry: 'retry',
  select: 'select', selected: 'selected', allSelect: 'system.common.selectAll', done: 'confirm', prev: 'previous', next: 'next', pageSize: 'pageSize',
  density: 'density', fields: 'fields', style: 'listStyle', lock: 'lockNow', language: 'language', dark: 'theme', profile: 'profile', passwordChange: 'password',
  logout: 'logout', settings: 'settings', session: 'sessionOnly', unread: 'unread', read: 'read', messages: 'messages', messageCenter: 'messageCenter', allRead: 'allRead', send: 'app.msg.send',
  requiredReset: 'resetRequired', continue: 'app.resetPassword.submit', loading: 'loading', noAccess: 'noAccess', footer: 'footerVisible',
  interfaceSettings: 'interfaceSettings', appearance: 'appearance', general: 'general', layout: 'layout', reduced: 'reduceTransparency', reducedHint: 'reduceTransparencyHint', color: 'accentColor', settingsSaved: 'settingsSaved', settingsDescription: 'settingsDescription', copyrightInfo: 'copyrightInfo', copyrightHiddenHint: 'copyrightHiddenHint', autoYearHint: 'autoYearHint', history: 'accountHistory', clearAccounts: 'clearAccountHistory', noMatchingAccounts: 'noMatchingAccounts', createAccountLink: 'createAccountLink', backToLoginLink: 'backToLoginLink',
  copyright: 'copyright', copyrightVisible: 'copyrightVisible', timezone: 'timezone', loadMore: 'loadMore', suggestions: 'suggestions', clearHistory: 'clearHistory',
  allApps: 'allApps', reviewEmpty: 'reviewEmpty', accountOverview: 'userOverview', usersUnit: 'usersUnit', users: 'usersUnit', viewDetails: 'viewDetails', lockPassword: 'lockPassword', lockHint: 'lockHint', unlock: 'unlock', locked: 'locked', overviewDescription: 'overviewDescription',
  loginDevices: 'loginDevices', mockData: 'mockData', currentDevice: 'currentDevice', removeDevice: 'removeDevice', deviceMockHint: 'deviceMockHint', deviceProtection: 'deviceProtection', lockActionHint: 'lockActionHint', securityHint: 'securityHint', sessionHint: 'sessionHint', published: 'app.msg.published', expiry: 'app.msg.expiry', recipients: 'app.msg.recipients',
  signedIn: 'signedIn', securityDescription: 'securityDescription', accountProtection: 'accountProtection',
};
interface Validation { key: string; vars?: Record<string, unknown> }
interface ValueToken { label: string; tone: string; path?: string }
interface Field { key: string; label: string; kind: string; required: boolean; value: any; error: string; placeholder: string; display: string }
interface Sheet { type: string; title: string; id?: number; field?: string; [key: string]: any }
interface Preferences { accent: 'default' | 'green' | 'violet'; reducedTransparency: boolean; dark: boolean; timezone: string; footer: boolean; copyright: boolean; year: string; company: string; companyLink: string; icp: string; icpLink: string; density: string; style: string; bordered: boolean; striped: boolean; sticky: boolean; columns: Record<string, string[]> }

export class Screen {
  route = '/dashboard/overview';
  tab = 'home';
  resource: ResourceKind = 'user';
  view = 'home';
  query = '';
  filters: Record<string, any> = {};
  page = 1;
  size = 20;
  total = 0;
  records: RecordData[] = [];
  record: RecordData | null = null;
  selection = false;
  selected: number[] = [];
  loading = false;
  scrollTarget = '';
  booting = true;
  busy = false;
  error = '';
  sheetError = '';
  sheets: Sheet[] = [];
  form: Record<string, any> = {};
  initial: Record<string, any> = {};
  errors: Record<string, Validation> = {};
  options: { value: string | number; label: string; parts?: { value: string; match: boolean }[]; history?: boolean }[] = [];
  optionsPage = 1;
  optionsTotal = 0;
  optionsQuery = '';
  optionsLoading = false;
  suggestions: { value: string; parts: { value: string; match: boolean }[] }[] = [];
  searchFocus = false;
  unread = 0;
  messageRead = 'all';
  messageType = '';
  loadingMore = false;
  messageBusy: number[] = [];
  swipedMessage: number | null = null;
  notice = '';
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  auth = { username: '', password: '', confirmation: '', old: '' };
  accounts: string[] = [];
  accountFocused = false;
  usernameBusy = false;
  private usernameRevision = 0;
  private accountBlurTimer: ReturnType<typeof setTimeout> | undefined;
  captcha: PointCaptcha | null = null;
  captchaPoints: CaptchaPoint[] = [];
  captchaVerified = false;
  proof = '';
  sliderPosition = 0;
  sliderBusy = false;
  sliderError = '';
  stats: Record<string, { value: number; loading: boolean; error: string }> = { active: { value: 0, loading: true, error: '' }, pending: { value: 0, loading: true, error: '' }, locked: { value: 0, loading: true, error: '' } };
  reviews: RecordData[] = [];
  recent: RecordData[] = [];
  recentLoading = true;
  recentError = '';
  reviewsLoading = true;
  reviewsError = '';
  profileLoading = false;
  profileError = '';
  lockPassword = '';
  devices = [
    { id: 1, name: 'iPhone 15 Pro', platform: 'Mobile Safari · iOS 18', location: 'Shanghai', lastSeen: 'deviceActiveNow', current: true },
    { id: 2, name: 'MacBook Pro', platform: 'Chrome · macOS', location: 'Shanghai', lastSeen: 'deviceActiveTwoHours', current: false },
    { id: 3, name: 'Windows Workstation', platform: 'Edge · Windows 11', location: 'Hangzhou', lastSeen: 'deviceActiveYesterday', current: false },
  ];
  private loadedRegions = new Set<string>();
  private detailRevision = 0;
  preferences: Preferences;
  private disposed = false;
  private visible = true;
  private revision = 0;
  private optionsRevision = 0;
  private suggestRevision = 0;
  private captchaRevision = 0;
  private idempotency = '';
  private timers: ReturnType<typeof setTimeout>[] = [];
  private polling: ReturnType<typeof setInterval> | undefined;
  private inputTimer: ReturnType<typeof setTimeout> | undefined;
  private blurTimer: ReturnType<typeof setTimeout> | undefined;
  private sliderStartX = 0;
  private sliderStarted = 0;
  private sliderWidth = 0;
  private sliderTracks: { x: number; t: number }[] = [];
  private sliderChallenge: Promise<{ captcha_id: string }> | null = null;
  private sliderGeneration = 0;
  private dragging = false;
  private optionLabels = new Map<string, string>();
  constructor(public client: Client, public variant: MiniConfig['variant'], private publish: (vm: any) => void) {
    const stored = client.platform.read(client.prefix + 'preferences') as Partial<Preferences> | undefined;
    this.preferences = { accent: 'default', reducedTransparency: false, dark: false, timezone: systemTimezone(), footer: true, copyright: true, year: '', company: 'go-cinch', companyLink: 'https://github.com/go-cinch/demos', icp: '', icpLink: '', density: 'default', style: variant === 'wot' ? 'cards' : 'grouped', bordered: false, striped: false, sticky: true, columns: {}, ...stored };
    if (this.preferences.density === 'comfortable') this.preferences.density = 'default';
    this.unread = client.unread;
    client.platform.write(client.prefix + 'username', undefined);
    this.accounts = readAccounts(client.platform, client.prefix);
    client.platform.theme?.(this.preferences.dark);
    if (client.registrationLogin) { Object.assign(this.auth, client.registrationLogin); client.registrationLogin = null }
  }
  t = (key: string, vars: Record<string, unknown> = {}) => this.client.t(key, vars);
  get config(): ResourceConfig { return getConfigs(this.t)[this.resource] }
  get primaryFilter() { return primaryFilter(this.config) }
  get columnKey() { return this.isSent ? 'msg' : this.resource }
  get visibleColumns() { return this.preferences.columns[this.columnKey] || (this.isSent ? ['title', 'type', 'scope', 'published_at'] : defaultColumns[this.resource]) }
  get sheet() { return this.sheets[this.sheets.length - 1] }
  get isAuth() { return this.route.startsWith('/auth/') }
  get isSent() { return this.route === '/system/msg' }
  get authenticatedCaptcha() { return this.sheet?.type === 'password' }
  get locked() { return !!this.client.screenLock && !this.isAuth }
  get dirty() { return ['edit', 'password', 'compose', 'preferences', 'timezone', 'lock-setup'].includes(this.sheet?.type || '') && JSON.stringify(this.form) !== JSON.stringify(this.initial) }
  fieldError(key: string) { const error = this.errors[key]; if (!error) return ''; const field = this.config.fields.find(f => f.key === key); return this.t(error.key, error.vars?.field && field ? { ...error.vars, field: field.label } : error.vars) }
  can(operation: string) { return this.client.canMenu(this.route) && this.client.can(this.resource, operation) }
  date(value: unknown) { return formatDate(value, this.preferences.timezone) }
  async start(route: string, query: Record<string, string> = {}) {
    this.route = route; this.tab = query.tab || 'home';
    this.resource = route.slice('/system/'.length) as ResourceKind;
    if (!getConfigs(this.t)[this.resource]) this.resource = 'user';
    this.filters = parseFilterQuery(query, this.config.filters);
    if (this.primaryFilter.type !== 'input-multi-select') { this.query = String(this.filters[this.primaryFilter.key] || ''); delete this.filters[this.primaryFilter.key] }
    this.view = this.isAuth ? 'auth' : route === '/profile' ? 'profile' : route === '/msg/inbox' || route === '/system/msg' ? 'messages' : route.startsWith('/system/') ? 'list' : this.tab === 'manage' ? 'manage' : this.tab === 'security' ? 'security' : 'home';
    this.client.onExpired = () => { if (!this.disposed) this.navigate(this.client.resetRequired ? '/auth/reset-password' : '/auth/login', true) };
    this.emit();
    this.timers.push(setTimeout(() => { this.booting = false; this.emit() }, 5000));
    try {
      await this.client.initialize();
      if (this.disposed) return;
      if (!this.client.accessToken && !this.isAuth) { this.navigate('/auth/login', true); return }
      if (this.client.resetRequired && route !== '/auth/reset-password') { this.navigate('/auth/reset-password', true); return }
      if (!this.client.accessToken && route === '/auth/reset-password') { this.navigate('/auth/login', true); return }
      if (this.client.accessToken && !this.client.resetRequired && this.isAuth) { this.navigate('/dashboard/overview', true); return }
      if (!this.isAuth && !this.client.canMenu(route)) { this.error = this.t('noAccess'); return }
      // Business requests belong to their own regions, not a whole-screen gate.
      this.booting = false; this.emit();
      if (route === '/profile' && query.tab === 'password') await this.action('password');
      await this.load();
      if (!this.isAuth) { void this.countMessages(); this.polling = setInterval(() => { if (this.visible && !this.busy) { void this.countMessages(); if (this.view === 'messages') void this.load() } }, 30000) }
    } catch (e) { this.error = this.errorMessage(e) } finally { this.booting = false; this.emit() }
  }
  show() { this.visible = true; if (!this.isAuth && this.client.accessToken && !this.client.resetRequired) void this.countMessages() }
  hide() { this.visible = false; this.resetSlider() }
  dispose() { this.disposed = true; this.revision++; this.detailRevision++; this.optionsRevision++; this.suggestRevision++; this.captchaRevision++; this.usernameRevision++; clearTimeout(this.accountBlurTimer); clearTimeout(this.noticeTimer); this.resetSlider(); this.timers.forEach(clearTimeout); clearTimeout(this.inputTimer); clearTimeout(this.blurTimer); if (this.polling) clearInterval(this.polling); this.auth.password = ''; this.auth.old = ''; this.auth.confirmation = ''; this.lockPassword = ''; this.form = {} }
  errorMessage(e: unknown) { return e instanceof Error ? e.message : this.t('requestError') }
  navigate(route: string, force = false) {
    if (this.locked && !force) return;
    if (this.busy && !force) return;
    if (!force && this.dirty) { this.push({ type: 'discard', title: 'unsavedTitle', destination: route }); return }
    this.client.platform.navigate(pageURL(route));
  }
  persist() { this.client.platform.write(this.client.prefix + 'preferences', this.preferences); this.client.platform.theme?.(this.preferences.dark) }
  emit() { if (!this.disposed) this.publish(this.snapshot()) }
  notify(message: string) { clearTimeout(this.noticeTimer); this.notice = message; this.emit(); this.noticeTimer = setTimeout(() => { this.notice = ''; this.emit() }, 2500) }
  async load() {
    if (this.isAuth || ['manage', 'security'].includes(this.view)) { this.emit(); return }
    const revision = ++this.revision;
    this.error = '';
    if (this.view === 'profile') {
      this.profileLoading = true; this.profileError = ''; this.emit();
      try { await this.client.loadUser() }
      catch (e) { if (revision === this.revision) this.profileError = this.errorMessage(e) }
      finally { if (revision === this.revision) { this.profileLoading = false; this.emit() } }
      return;
    }
    if (this.view === 'home') {
      if (!this.client.can('user', 'read')) { this.recentLoading = false; this.reviewsLoading = false; Object.values(this.stats).forEach(s => s.loading = false); this.emit(); return }
      this.reviewsLoading = true; this.reviewsError = '';
      const regions = [['active', 1], ['pending', 0], ['locked', 2]] as const;
      await Promise.all([...regions.map(async ([key, status]) => {
        this.stats[key].loading = true; this.stats[key].error = ''; this.emit();
        try { const value = await this.client.list('user', { p: 1, s: status === 0 ? 3 : 1, status }); if (revision !== this.revision || this.disposed) return; this.stats[key].value = value.t; this.loadedRegions.add(key); if (key === 'pending') this.reviews = value.items }
        catch (e) { if (revision === this.revision) { this.stats[key].error = this.errorMessage(e); if (key === 'pending') this.reviewsError = this.stats[key].error } }
        finally { if (revision === this.revision) { this.stats[key].loading = false; if (key === 'pending') this.reviewsLoading = false; this.emit() } }
      }), (async () => {
        this.recentLoading = true; this.recentError = ''; this.emit();
        try { const value = await this.client.list('user', { p: 1, s: 5 }); if (revision === this.revision && !this.disposed) { this.recent = value.items; this.total = value.t; this.loadedRegions.add('recent') } }
        catch (e) { if (revision === this.revision) this.recentError = this.errorMessage(e) }
        finally { if (revision === this.revision) { this.recentLoading = false; this.emit() } }
      })()]); return;
    }
    if ((this.view === 'list' && !this.can('read')) || (this.isSent && !this.client.canMsg('read'))) { this.error = this.t('noAccess'); this.emit(); return }
    this.loading = true; this.emit();
    try {
      let result;
      if (this.view === 'messages') {
        const params = { s: this.size, ...(this.messageRead !== 'all' ? { read: this.messageRead === 'read' } : {}), ...(this.messageType ? { type: this.messageType } : {}), ...this.filters };
        const pages = await Promise.all((this.isSent ? [this.page] : Array.from({ length: this.page }, (_, i) => i + 1)).map(p => this.client.list(this.isSent ? 'msg/sent' : 'msg/inbox', { ...params, p })));
        result = { ...pages[0], items: pages.flatMap(p => p.items) };
      }
      else result = await this.client.list(this.resource, { p: this.page, s: this.size, ...this.filters, ...(this.query ? { [this.primaryFilter.key]: this.query } : {}) });
      if (revision !== this.revision || this.disposed) return;
      this.records = result.items; this.total = result.t;
      this.selected = this.selected.filter(id => this.records.some(r => r.id === id));
    } catch (e) { if (revision === this.revision) this.error = this.errorMessage(e) }
    finally { if (revision === this.revision) { this.loading = false; this.emit() } }
  }
  async loadPageAtTop(page: number, size = this.size) {
    if (this.loading || !Number.isInteger(page) || page < 1 || ![10, 20, 50, 100].includes(size)) return;
    this.scrollTarget = ''; this.page = page; this.size = size; this.selected = []; this.emit();
    await this.load();
    // Deliver the cleared target before assigning it again. This is necessary
    // when consecutive page changes scroll to the same native scroll-view id.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (!this.disposed) { this.scrollTarget = 'results-top'; this.emit() }
  }
  async countMessages() {
    const generation = this.client.generation;
    try {
      const value = await this.client.request<{ count: number }>('/msg/unread-count');
      if (generation !== this.client.generation) return;
      // Carry the badge between page instances while the next page refreshes
      // its count. Keep it in memory only and clear it at the session boundary.
      this.client.unread = Math.max(0, Number(value.count) || 0);
      if (!this.disposed) { this.unread = this.client.unread; this.emit() }
    } catch { /* Poll failures do not block unrelated pages. */ }
  }
  async moreMessages() {
    if (this.isSent || this.loading || this.loadingMore || this.records.length >= this.total) return;
    const revision = this.revision, next = this.page + 1;
    this.loadingMore = true; this.error = ''; this.emit();
    try {
      const result = await this.client.list('msg/inbox', { p: next, s: this.size, ...(this.messageType ? { type: this.messageType } : {}) });
      if (revision !== this.revision || this.disposed) return;
      this.records = [...new Map([...this.records, ...result.items].map(r => [r.id, r])).values()]; this.page = next; this.total = result.t;
    } catch (e) { if (revision === this.revision) this.error = this.errorMessage(e) }
    finally { this.loadingMore = false; this.emit() }
  }
  async readMessage(id: number) {
    if (this.isSent || this.busy || this.loading || this.messageBusy.includes(id)) return;
    if (this.swipedMessage === id) { this.swipedMessage = null; this.emit(); return }
    const row = this.records.find(r => r.id === id);
    if (!row || row.read_at) return;
    this.messageBusy.push(id); this.emit();
    try { await this.client.request(`/msg/inbox/${id}`, { method: 'PATCH', body: { read: true } }); row.read_at = Date.now(); await this.countMessages() }
    catch (e) { this.error = this.errorMessage(e) }
    finally { this.messageBusy = this.messageBusy.filter(v => v !== id); this.emit() }
  }
  async deleteInboxMessage(id: number) {
    if (this.isSent || this.busy || this.loading || this.messageBusy.includes(id) || !this.records.some(r => r.id === id)) return;
    this.messageBusy.push(id); this.emit();
    try {
      await this.client.request(`/msg/inbox/${id}`, { method: 'DELETE' });
      this.records = this.records.filter(r => r.id !== id); this.total = Math.max(0, this.total - 1); this.swipedMessage = null;
      // Offset pages shift after deletion. Refill every displayed page before
      // the next page can be requested, so its first record is not skipped.
      await this.load(); await this.countMessages();
    }
    catch (e) { this.error = this.errorMessage(e) }
    finally { this.messageBusy = this.messageBusy.filter(v => v !== id); this.emit() }
  }
  async readAllMessages() {
    if (this.isSent || this.busy || this.loading || this.messageBusy.length) return;
    this.busy = true; this.error = ''; this.emit();
    try { await this.client.request('/msg/inbox/read-all', { method: 'POST' }); await this.load(); await this.countMessages() }
    catch (e) { this.error = this.errorMessage(e) }
    finally { this.busy = false; this.emit() }
  }
  push(sheet: Sheet) { this.sheets.push(sheet); this.sheetError = ''; this.emit() }
  close(force = false) {
    if (this.busy && !force) return;
    if (!force && this.dirty) { this.push({ type: 'discard', title: 'unsavedTitle' }); return }
    this.optionsRevision++; this.detailRevision++; this.sheets.pop(); this.sheetError = ''; this.errors = {};
    if (!this.sheets.length) { this.form = {}; this.initial = {}; if (!this.isAuth) { this.captcha = null; this.captchaPoints = []; this.captchaVerified = false } }
    this.emit();
  }
  input(key: string, value: unknown) {
    if (key === 'lock.password') { this.lockPassword = String(value); delete this.errors.lock_password; this.emit(); return }
    if (this.locked) return;
    if (key.startsWith('auth.')) {
      const field = key.slice(5); if (!['username', 'password', 'confirmation', 'old'].includes(field)) return; (this.auth as any)[field] = String(value);
      if (field === 'username' || field === 'password') this.resetSlider();
      if (field === 'username') { this.accountFocused = this.route === '/auth/login'; this.usernameRevision++; this.usernameBusy = false; this.captcha = null; this.captchaPoints = []; this.captchaVerified = false; this.captchaRevision++ }
      delete this.errors[field];
    } else if (key.startsWith('preference.')) {
      const field = key.slice(11);
      if (['dark', 'reducedTransparency', 'footer'].includes(field)) { (this.preferences as any)[field] = !!value; this.persist() }
    } else if (key.startsWith('form.')) { const field = key.slice(5); this.form[field] = value; delete this.errors[field] }
    else if (key.startsWith('filter.')) this.filters[key.slice(7)] = value;
    else if (key === 'search') { this.query = String(value); this.page = 1; this.searchFocus = true; if (this.view === 'list') this.suggest(); }
    else if (key === 'picker') { this.optionsQuery = String(value); clearTimeout(this.inputTimer); this.inputTimer = setTimeout(() => void this.loadOptions(true), 250) }
    this.emit();
  }
  focusField(name: string) {
    if (name === 'search') { clearTimeout(this.blurTimer); this.searchFocus = true; this.suggest(); this.emit(); return }
    if (name === 'auth.username' && this.route === '/auth/login') {
      clearTimeout(this.accountBlurTimer); this.accounts = readAccounts(this.client.platform, this.client.prefix); this.accountFocused = true; this.emit();
    }
  }
  blurField(name: string) {
    if (name === 'search') { this.blurSearch(); return }
    if (name === 'picker' && this.sheet?.filter) {
      const sheet = this.sheet;
      clearTimeout(this.blurTimer);
      this.blurTimer = setTimeout(() => {
        if (this.sheet !== sheet || !this.optionsQuery.trim()) return;
        const definition = this.config.filters.find(f => f.key === sheet.field)!;
        if (!['input', 'input-multi-select'].includes(definition.type)) return;
        this.filters[definition.key] = pickFilterValue(this.resource, definition, this.filters[definition.key], this.optionsQuery);
        saveFilterHistory(this.client.platform, this.client.prefix, this.resource, definition.key, this.optionsQuery);
        this.optionsQuery = ''; this.page = 1; void this.load(); this.emit();
      }, 250);
      return;
    }
    if (name === 'auth.username') {
      clearTimeout(this.accountBlurTimer);
      this.accountBlurTimer = setTimeout(() => { this.accountFocused = false; void this.verifyUsername(); this.emit() }, 180);
    }
  }
  async verifyUsername() {
    const account = this.auth.username.trim(), generation = ++this.usernameRevision;
    if (!account || this.route === '/auth/reset-password') return;
    this.error = ''; this.usernameBusy = true; this.emit();
    const timeout = setTimeout(() => { if (generation === this.usernameRevision) { this.usernameBusy = false; this.emit() } }, 5000); this.timers.push(timeout);
    try {
      if (this.route === '/auth/register') {
        const result = await this.client.request<{ available: boolean }>(`/auth/pub/register/username?username=${encodeURIComponent(account)}`, { public: true });
        if (generation === this.usernameRevision && !this.disposed) { if (!result.available) this.errors.username = { key: 'app.register.usernameExists' }; else delete this.errors.username }
      } else {
        const result = await this.client.request<{ captcha?: PointCaptcha }>(`/auth/pub/login/verification?username=${encodeURIComponent(account)}`, { public: true });
        if (generation === this.usernameRevision && !this.disposed) { this.captcha = result.captcha || null; this.captchaPoints = []; this.captchaVerified = false; if (this.captcha) this.resetSlider() }
      }
    } catch (e) { if (generation === this.usernameRevision && !this.disposed) this.error = this.errorMessage(e) }
    finally { clearTimeout(timeout); if (generation === this.usernameRevision) this.usernameBusy = false; this.emit() }
  }
  async retryAuthCheck() {
    if (!this.isAuth || this.route === '/auth/reset-password' || this.busy || this.usernameBusy || !this.auth.username.trim()) return;
    // Retry only the failed prerequisite check. Never replay a credential
    // submission or consume a new one-time login challenge on a Retry tap.
    await this.verifyUsername();
  }
  async saveTimezone() {
    this.errors = {};
    try { new Intl.DateTimeFormat('en', { timeZone: this.form.timezone }).format(new Date()) }
    catch { this.errors.timezone = { key: 'invalidDate' }; this.emit(); return }
    this.preferences.timezone = this.form.timezone; this.persist(); this.initial = { ...this.form }; this.close(true);
  }
  blurSearch() { clearTimeout(this.blurTimer); this.blurTimer = setTimeout(() => { this.searchFocus = false; this.rememberSearch(); void this.load() }, 250) }
  rememberSearch() {
    this.query = normalizeFilterText(this.resource, this.primaryFilter.key, this.query);
    saveFilterHistory(this.client.platform, this.client.prefix, this.resource, this.primaryFilter.key, this.query);
    if (this.primaryFilter.type === 'input-multi-select') { this.filters[this.primaryFilter.key] = pickFilterValue(this.resource, this.primaryFilter, this.filters[this.primaryFilter.key], this.query); this.query = '' }
  }
  suggest() {
    clearTimeout(this.inputTimer); const generation = ++this.suggestRevision;
    this.inputTimer = setTimeout(async () => {
      const q = this.query.trim(), history = readFilterHistory(this.client.platform, this.client.prefix, this.resource, this.primaryFilter.key);
      let values: string[] = [];
      try { values = await queryFilterSuggestions(this.client, this.resource, this.primaryFilter, q) } catch { /* Retain history when suggestions fail. */ }
      if (generation !== this.suggestRevision || this.disposed) return;
      this.suggestions = presentSuggestions(values, q, history); this.emit();
    }, 200);
  }
  async detail(id: number) {
    if (this.view === 'list' && !this.can('read')) return;
    if (this.isSent && !this.client.canMsg('read')) return;
    const revision = ++this.detailRevision;
    this.record = null;
    this.push({ type: this.view === 'messages' ? 'message' : 'detail', title: this.view === 'messages' ? 'app.msg.detail' : 'detail', id, loading: true });
    const target = this.sheet;
    try {
      const record = await this.client.request<RecordData>(this.view === 'messages' ? `/msg/${this.isSent ? 'sent' : 'inbox'}/${id}` : `/${this.resource}/${id}`);
      if (revision !== this.detailRevision || this.disposed) return;
      this.record = record;
      if (this.view === 'messages' && !this.isSent && !record.read_at) {
        await this.client.request(`/msg/inbox/${id}`, { method: 'PATCH', body: { read: true } });
        if (revision !== this.detailRevision || this.disposed) return;
        record.read_at = Date.now(); void this.countMessages(); const row = this.records.find(r => r.id === id); if (row) row.read_at = record.read_at;
      }
    }
    catch (e) { if (revision === this.detailRevision) this.sheetError = this.errorMessage(e) }
    finally { if (revision === this.detailRevision) { target.loading = false; this.emit() } }
  }
  async edit(create = false) {
    if (!this.can(create ? 'create' : 'update')) { this.sheetError = this.t('noAccess'); this.emit(); return }
    if (create) this.record = null;
    if (this.record?.role) this.optionLabels.set(String(this.record.role.id), `${this.record.role.name} · ${this.record.role.word}`);
    this.record?.actions?.forEach(a => this.optionLabels.set(a.code, `${a.name} · ${a.word}`));
    this.record?.users?.forEach(u => this.optionLabels.set(String(u.id), `${u.username} · ${u.code}`));
    this.form = {}; this.errors = {};
    for (const field of this.config.fields) {
      let v: any = this.record?.[field.key] ?? field.defaultValue ?? (field.type.endsWith('-select') ? field.type === 'role-select' ? 0 : [] : '');
      if (field.type === 'json') v = this.record ? JSON.stringify(v, null, 2) : v;
      if (field.key === 'password') v = '';
      if (field.key === 'user_ids') v = this.record?.users?.map(u => u.id) || [];
      this.form[field.key] = v;
    }
    if (this.resource === 'user') { this.form.display_name = this.record?.metadata?.display_name || ''; if (this.record) this.form.department = this.record.metadata?.department || '' }
    this.initial = JSON.parse(JSON.stringify(this.form)); this.idempotency = await randomID(this.client.platform.random);
    this.push({ type: 'edit', title: create ? 'system.common.create' : 'system.common.edit' });
  }
  normalize(form: Record<string, any>) {
    const payload = { ...form };
    for (const key of ['name', 'word', 'key', 'group']) if (typeof payload[key] === 'string') payload[key] = payload[key].trim();
    if (this.resource === 'dictionary') payload.value = JSON.parse(String(payload.value));
    if (this.resource === 'user') {
      payload.username = String(payload.username || '').trim(); payload.password = String(payload.password || '').trim(); if (!payload.password) delete payload.password;
      payload.role_id = Number(payload.role_id || 0); const metadata = { ...this.record?.metadata };
      for (const key of ['display_name', 'department']) { if (payload[key]) metadata[key] = payload[key]; else delete metadata[key]; delete payload[key] }
      if (Object.keys(metadata).length || this.record?.metadata) payload.metadata = metadata;
    }
    return payload;
  }
  required(key: string, value: any, label: string) { if (value === undefined || value === null || !String(value).trim()) this.errors[key] = { key: 'required', vars: { field: label } } }
  async save() {
    if (this.busy || !this.can(this.record ? 'update' : 'create')) return;
    this.errors = {}; this.sheetError = '';
    for (const field of this.config.fields) if (field.required || (!this.record && field.createRequired)) this.required(field.key, this.form[field.key], field.label);
    if (this.resource === 'user' && this.record && this.form.password && !String(this.form.password).trim()) this.errors.password = { key: 'app.validation.password' };
    if (this.resource === 'dictionary') { if (!dictionaryKeyValid(this.form.key)) this.errors.key = { key: 'system.validation.dictionaryKey' }; try { JSON.parse(this.form.value) } catch { this.errors.value = { key: 'system.validation.json' } } }
    if (Object.keys(this.errors).length) { this.emit(); return }
    let payload = this.normalize(this.form); if (this.record) payload = buildChangedPayload(this.normalize(this.initial), payload);
    if (!Object.keys(payload).length) { this.sheetError = this.t('noChange'); this.emit(); return }
    this.busy = true; this.emit();
    try { await this.client.save(this.resource, payload, this.record?.id, this.idempotency); this.sheets = []; this.form = {}; this.notify(this.t('saveSuccess')); await this.load() }
    catch (e) { this.sheetError = this.errorMessage(e); if (e instanceof ApiError && e.status !== 409) this.idempotency = await randomID(this.client.platform.random) }
    finally { this.busy = false; this.emit() }
  }
  async openOptions(field: string) { this.optionsQuery = ''; this.options = []; this.optionsPage = 1; this.optionsTotal = 0; this.push({ type: 'picker', title: 'choose', field }); await this.loadOptions(true) }
  async loadOptions(reset: boolean) {
    const field = this.sheet?.field || ''; const generation = ++this.optionsRevision;
    if (reset) this.optionsPage = 1; else this.optionsPage++;
    this.optionsLoading = true; this.sheetError = ''; this.emit();
    try {
      let options: { value: string | number; label: string }[] = [];
      if (this.sheet?.filter) {
        const definition = this.config.filters.find(f => f.key === field)!;
        if (definition.type === 'category') options = [{ value: '', label: this.t('all') }, ...[0, 1].map(value => ({ value, label: this.t(value ? 'system.category.jwt' : 'system.category.permission') }))];
        else if (definition.type === 'enabled') options = [{ value: '', label: this.t('all') }, { value: 'true', label: this.t('system.enabled.yes') }, { value: 'false', label: this.t('system.enabled.no') }];
        else if (definition.type === 'status-multi-select') options = [0, 1, 2].map(value => ({ value, label: this.t(`system.status.${value === 0 ? 'pending' : value === 1 ? 'active' : 'locked'}`) }));
        else {
          const history = readFilterHistory(this.client.platform, this.client.prefix, this.resource, field);
          const selected = Array.isArray(this.filters[field]) ? this.filters[field] : this.filters[field] ? [String(this.filters[field])] : [];
          const query = normalizeFilterText(this.resource, field, this.optionsQuery);
          const values = await queryFilterSuggestions(this.client, this.resource, definition, query);
          options = presentSuggestions([...(query ? [query] : []), ...values, ...selected], query, history).map(o => ({ ...o, label: o.value }));
        }
        this.optionsTotal = options.length;
      }
      else if (field === 'category') options = [0, 1].map(value => ({ value, label: this.t(value ? 'system.category.jwt' : 'system.category.permission') }));
      else if (field === 'group') { const r = await this.client.request<{ items: string[] }>(`/action/group?keyword=${encodeURIComponent(this.optionsQuery)}`); options = r.items.map(value => ({ value, label: value })); if (this.optionsQuery && !options.some(x => x.value === this.optionsQuery)) options.push({ value: this.optionsQuery, label: this.t('createGroup', { name: this.optionsQuery }) }); this.optionsTotal = options.length }
      else if (field === 'recipient_ids') { const r = await this.client.request<{ id: number; username: string }[]>(`/msg/recipient-option?q=${encodeURIComponent(this.optionsQuery)}`); options = r.map(u => ({ value: u.id, label: u.username })); this.optionsTotal = options.length }
      else {
        const resource = field === 'role_id' ? 'role' : field === 'user_ids' ? 'user' : 'action';
        const fields = resource === 'user' ? ['username', 'code'] : ['name', 'word'];
        const results = await Promise.all((this.optionsQuery ? fields : ['']).map(key => this.client.list(resource, { p: this.optionsPage, s: 30, ...(key ? { [key]: this.optionsQuery } : {}) })));
        options = [...new Map(results.flatMap(r => r.items).map(r => ({ value: resource === 'action' ? String(r.code) : r.id, label: `${r.name || r.username} · ${r.word || r.code}` })).map(o => [o.value, o])).values()]; this.optionsTotal = Math.max(...results.map(r => r.t));
        if (field === 'role_id' && this.optionsPage === 1) options.unshift({ value: 0, label: this.t('choose') });
      }
      if (generation !== this.optionsRevision || this.disposed) return;
      this.options = reset ? options : [...new Map([...this.options, ...options].map(o => [o.value, o])).values()]; this.options.forEach(o => this.optionLabels.set(String(o.value), o.label));
    } catch (e) { if (generation === this.optionsRevision) this.sheetError = this.errorMessage(e) }
    finally { if (generation === this.optionsRevision) { this.optionsLoading = false; this.emit() } }
  }
  selectOption(value: string) {
    const option = this.options.find(o => String(o.value) === value); if (!option) return;
    const field = this.sheet?.field || '';
    if (this.sheet?.filter) {
      const definition = this.config.filters.find(f => f.key === field)!;
      this.optionsQuery = ''; clearTimeout(this.blurTimer);
      if (definition.type === 'category' || definition.type === 'enabled' || definition.type === 'input') {
        this.filters[field] = value === '' ? undefined : definition.type === 'category' ? Number(value) : value;
        if (value) saveFilterHistory(this.client.platform, this.client.prefix, this.resource, field, value);
        this.close(true); this.page = 1; void this.load(); return;
      }
      const values = Array.isArray(this.filters[field]) ? this.filters[field] : [];
      const selectedValue = definition.type === 'status-multi-select' ? Number(value) : value;
      this.filters[field] = values.includes(selectedValue) ? values.filter((v: string | number) => v !== selectedValue) : [...values, selectedValue];
      saveFilterHistory(this.client.platform, this.client.prefix, this.resource, field, value); this.page = 1; void this.load(); this.emit(); return;
    }
    if (['action_codes', 'user_ids', 'recipient_ids'].includes(field)) { const selected = Array.isArray(this.form[field]) ? this.form[field] : []; this.form[field] = selected.includes(option.value) ? selected.filter((v: unknown) => v !== option.value) : [...selected, option.value] }
    else { this.form[field] = option.value; this.close(true) }
    this.emit();
  }
  beginSlider(x: number, width: number) {
    if (this.sliderBusy || this.proof || this.captcha) return;
    if (!this.auth.username.trim() || !this.auth.password.trim()) { this.sliderError = this.t('app.validation.credentialsRequired'); this.emit(); return }
    this.resetSlider(); this.dragging = true; this.sliderStartX = x; this.sliderStarted = Date.now(); this.sliderWidth = Math.max(1, width - 52); this.sliderTracks = [{ x: 0, t: 0 }];
    this.sliderChallenge = this.client.request('/auth/pub/slider/challenge', { method: 'POST', public: true, body: { purpose: this.route === '/auth/register' ? 'register' : 'login', username: this.auth.username.trim() } }); void this.sliderChallenge.catch(() => {}); this.emit();
  }
  moveSlider(x: number) { if (!this.dragging) return; this.sliderPosition = Math.round(Math.max(0, Math.min(this.sliderWidth, x - this.sliderStartX))); if (this.sliderTracks.length < 127) this.sliderTracks.push({ x: this.sliderPosition, t: Date.now() - this.sliderStarted }); this.emit() }
  async endSlider() {
    if (!this.dragging || !this.sliderChallenge) return; this.dragging = false;
    if (this.sliderPosition < this.sliderWidth - 2) { this.resetSlider(); this.sliderError = this.t('app.captcha.sliderIncomplete'); this.emit(); return }
    const generation = this.sliderGeneration; this.sliderBusy = true; this.emit();
    const duration = Date.now() - this.sliderStarted;
    this.sliderTracks.push({ x: Math.round(this.sliderWidth), t: duration });
    try { const challenge = await this.sliderChallenge; const result = await this.client.request<{ proof: string }>('/auth/pub/slider/verify', { method: 'POST', public: true, body: { captcha_id: challenge.captcha_id, distance: Math.round(this.sliderWidth), width: Math.round(this.sliderWidth), duration_ms: duration, tracks: this.sliderTracks, purpose: this.route === '/auth/register' ? 'register' : 'login', username: this.auth.username.trim() } }); if (generation === this.sliderGeneration) this.proof = result.proof }
    catch { if (generation === this.sliderGeneration) { this.sliderPosition = 0; this.sliderError = this.t('app.captcha.sliderFailed') } }
    finally { if (generation === this.sliderGeneration) this.sliderBusy = false; this.emit() }
  }
  resetSlider() { this.sliderGeneration++; this.dragging = false; this.proof = ''; this.sliderPosition = 0; this.sliderBusy = false; this.sliderError = ''; this.sliderChallenge = null }
  async point(x: number, y: number, width: number, height: number) {
    if (!this.captcha || this.captchaVerified || this.sliderBusy || width <= 0 || height <= 0) return;
    const point = { x: Math.round(x / width * this.captcha.width), y: Math.round(y / height * this.captcha.height) };
    if (point.x < 0 || point.y < 0 || point.x > this.captcha.width || point.y > this.captcha.height) return;
    const index = this.captchaPoints.findIndex(p => (p.x - point.x) ** 2 + (p.y - point.y) ** 2 < 196);
    if (index >= 0) this.captchaPoints.splice(index, 1); else this.captchaPoints.push(point);
    this.emit(); if (this.captchaPoints.length !== this.captcha.target_count) return;
    const generation = this.captchaRevision; this.sliderBusy = true; this.sliderError = ''; this.emit();
    try { const result = await this.client.request<{ verified: boolean; captcha?: PointCaptcha }>(`${this.authenticatedCaptcha ? '/auth/captcha' : '/auth/pub/captcha'}/verify`, { method: 'POST', public: !this.authenticatedCaptcha, body: { captcha_id: this.captcha.captcha_id, captcha_points: this.captchaPoints, ...(!this.authenticatedCaptcha ? { username: this.auth.username.trim() } : {}) } }); if (generation !== this.captchaRevision) return; if (result.verified) this.captchaVerified = true; else { this.captchaPoints = []; this.captcha = result.captcha || null; this.sliderError = this.t('app.captcha.failed') } }
    catch (e) { if (generation === this.captchaRevision) { this.sliderError = this.errorMessage(e); this.captchaPoints = [] } }
    finally { if (generation === this.captchaRevision) this.sliderBusy = false; this.emit() }
  }
  async refreshCaptcha() { if (!this.captcha || this.sliderBusy) return; this.captchaRevision++; this.captchaVerified = false; this.captchaPoints = []; this.sliderBusy = true; this.emit(); try { this.captcha = await this.client.request(this.authenticatedCaptcha ? '/auth/captcha' : '/auth/pub/captcha', { method: 'POST', public: !this.authenticatedCaptcha, body: { captcha_id: this.captcha.captcha_id } }) } catch (e) { this.sliderError = this.errorMessage(e) } finally { this.sliderBusy = false; this.emit() } }
  async login() {
    if (this.busy) return;
    const register = this.route === '/auth/register', reset = this.route === '/auth/reset-password';
    this.errors = {}; this.error = '';
    if (!reset) this.required('username', this.auth.username, this.t('system.fields.username'));
    this.required('password', this.auth.password, this.t('system.fields.password'));
    if ((register || reset) && this.auth.password.trim() !== this.auth.confirmation.trim()) this.errors.confirmation = { key: 'passwordMismatch' };
    if (!reset && (this.captcha ? !this.captchaVerified : !this.proof)) this.errors.verification = { key: 'verifyFirst' };
    if (Object.keys(this.errors).length) { this.emit(); return }
    this.busy = true; this.emit();
    try {
      if (register) { const available = await this.client.request<{ available: boolean }>(`/auth/pub/register/username?username=${encodeURIComponent(this.auth.username.trim())}`, { public: true }); if (!available.available) { this.errors.username = { key: 'app.register.usernameExists' }; return } }
      const payload = reset ? { new_password: this.auth.password.trim() } : { username: this.auth.username.trim(), password: this.auth.password.trim(), ...(this.captcha ? { captcha_id: this.captcha.captcha_id, captcha_points: this.captchaPoints } : { slider_proof: this.proof }), ...(register ? {} : { remember_me: false }) };
      const result = await this.client.submitCredentials(reset ? 'password_reset' : register ? 'register' : 'login', payload);
      if (!register && !reset && result.access_token) this.accounts = saveAccounts(this.client.platform, this.client.prefix, [this.auth.username.trim(), ...this.accounts]);
      if (register) { this.client.registrationLogin = { username: this.auth.username.trim(), password: this.auth.password.trim() }; this.navigate('/auth/login', true) }
      else { this.client.accept(result); if (!this.client.resetRequired) await this.client.loadUser(); this.navigate(this.client.resetRequired ? '/auth/reset-password' : '/dashboard/overview', true) }
      this.auth.password = ''; this.auth.confirmation = '';
    } catch (e) { this.error = this.errorMessage(e); this.resetSlider(); this.captchaPoints = []; this.captchaVerified = false; if (e instanceof ApiError && e.data?.captcha) this.captcha = e.data.captcha }
    finally { this.busy = false; this.emit() }
  }
  async passwordChange() {
    if (this.busy) return; this.errors = {}; this.sheetError = '';
    for (const key of ['old_password', 'new_password']) this.required(key, this.form[key], this.t(key === 'old_password' ? 'page.profile.password.oldPassword' : 'system.fields.newPassword'));
    if (String(this.form.new_password).trim() !== String(this.form.confirmation).trim()) this.errors.confirmation = { key: 'passwordMismatch' };
    if (this.captcha && !this.captchaVerified) this.errors.verification = { key: 'verifyFirst' };
    if (Object.keys(this.errors).length) { this.emit(); return }
    this.busy = true; this.emit();
    try { await this.client.submitCredentials('password_change', { old_password: String(this.form.old_password).trim(), new_password: String(this.form.new_password).trim(), ...(this.captcha ? { captcha_id: this.captcha.captcha_id, captcha_points: this.captchaPoints } : {}) }); this.client.clear(); this.navigate('/auth/login', true) }
    catch (e) { this.sheetError = this.errorMessage(e); this.captchaPoints = []; this.captchaVerified = false; if (e instanceof ApiError && e.data?.captcha) this.captcha = e.data.captcha }
    finally { this.busy = false; this.emit() }
  }
  async setLock() {
    if (this.busy || !this.client.user) return;
    this.errors = {}; this.required('lock_password', this.form.lock_password, this.t('lockPassword'));
    if (Object.keys(this.errors).length) { this.emit(); return }
    this.busy = true; this.emit();
    const generation = this.client.generation, userId = this.client.user.id;
    try {
      const salt = await randomID(this.client.platform.random);
      if (generation !== this.client.generation || this.disposed) return;
      this.client.setScreenLock({ userId, salt, hash: lockDigest(salt, String(this.form.lock_password)) });
      this.form = {}; this.initial = {}; this.sheets = []; this.lockPassword = ''; this.errors = {}; this.sheetError = '';
    } catch (e) { this.sheetError = this.errorMessage(e) }
    finally { this.busy = false; this.emit() }
  }
  unlock() {
    const lock = this.client.screenLock;
    if (!lock) return;
    if (lockDigest(lock.salt, this.lockPassword) !== lock.hash) { this.errors.lock_password = { key: 'lockWrong' }; this.emit(); return }
    this.client.setScreenLock(null); this.lockPassword = ''; this.errors = {}; this.emit();
  }
  async operate() {
    if (this.busy || !this.sheet) return;
    const action = this.sheet.operation;
    const remove = action === 'delete';
    if (this.view === 'messages') { if (this.isSent && !this.client.canMsg('delete')) return }
    else if (!this.can(remove ? 'delete' : 'update')) return;
    this.errors = {}; this.sheetError = '';
    const record = this.record;
    if (action === 'review' && this.form.decision === 'reject' && !String(this.form.reason || '').trim()) this.errors.reason = { key: 'system.validation.rejectionRequired' };
    const until = this.form.lockMode === 'permanent' ? 0 : parseDate(String(this.form.lockUntil), this.preferences.timezone);
    if (action === 'lock' && this.form.lockMode !== 'permanent' && (!Number.isFinite(until) || until <= Date.now())) this.errors.lockUntil = { key: 'system.validation.futureLock' };
    if (Object.keys(this.errors).length) { this.emit(); return }
    this.busy = true; this.emit();
    try {
      if (remove) {
        const ids: number[] = (this.sheet.ids || []).filter((id: unknown) => Number.isInteger(id) && Number(id) > 0);
        if (!ids.length) return;
        if (this.view === 'messages') await Promise.all(ids.map(id => this.client.request(`/msg/${this.isSent ? 'sent' : 'inbox'}/${id}`, { method: 'DELETE' })));
        else await this.client.remove(this.resource, ids);
        if (ids.length >= this.records.length && this.page > 1) this.page--;
      } else if (record) {
        const metadata = { ...record.metadata }; let status = record.status;
        if (action === 'review') { if (this.form.decision === 'approve') delete metadata.reject_register_reason; else metadata.reject_register_reason = String(this.form.reason).trim(); status = this.form.decision === 'approve' ? 1 : 0 }
        if (action === 'lock') { metadata.lock_expired_at = until; status = 2 }
        if (action === 'unlock') { delete metadata.lock_expired_at; status = 1 }
        if (action === 'unlockPassword') delete metadata.password_change_failures;
        await this.client.save('user', { metadata, ...(action === 'unlockPassword' ? {} : { status }) }, record.id);
      }
      this.sheets = []; this.selected = []; this.selection = false; this.notify(this.t(remove ? 'deleteSuccess' : 'saveSuccess')); await this.load(); void this.countMessages();
    } catch (e) { this.sheetError = this.errorMessage(e) }
    finally { this.busy = false; this.emit() }
  }
  async compose() { if (!this.client.canMsg('send')) return; this.form = { title: '', content: '', type: 'notice', scope: 'all', recipient_ids: [], expired_at: '' }; this.initial = { ...this.form }; this.idempotency = await randomID(this.client.platform.random); this.push({ type: 'compose', title: 'app.msg.send' }) }
  async sendMessage() {
    if (this.busy || !this.client.canMsg('send')) return;
    this.errors = {}; this.sheetError = '';
    if (!String(this.form.title).trim() || this.form.title.length > 200) this.errors.title = { key: 'app.msg.titleError' };
    if (!String(this.form.content).trim() || this.form.content.length > 20000) this.errors.content = { key: 'app.msg.contentError' };
    if (this.form.scope === 'targeted' && (!this.form.recipient_ids.length || this.form.recipient_ids.length > 1000)) this.errors.recipient_ids = { key: 'app.msg.recipientError' };
    const expiry = this.form.expired_at ? parseDate(this.form.expired_at, this.preferences.timezone) : null;
    if (expiry !== null && (!Number.isFinite(expiry) || expiry <= Date.now())) this.errors.expired_at = { key: 'app.msg.expiryError' };
    if (Object.keys(this.errors).length) { this.emit(); return }
    this.busy = true; this.emit();
    try { await this.client.request('/msg', { method: 'POST', headers: { 'x-idempotent': this.idempotency }, body: { title: this.form.title.trim(), content: this.form.content.trim(), type: this.form.type, scope: this.form.scope, expired_at: expiry, ...(this.form.scope === 'targeted' ? { recipient_ids: this.form.recipient_ids } : {}) } }); this.sheets = []; this.notify(this.t('app.msg.sent')); await this.load() }
    catch (e) { this.sheetError = this.errorMessage(e) }
    finally { this.busy = false; this.emit() }
  }
  field(key: string, label: string, type = 'input', required = false, value: unknown = this.form[key], prefix = 'form'): Field {
    const display = key === 'category' && (value === 0 || value === 1) ? this.t(value ? 'system.category.jwt' : 'system.category.permission') : Array.isArray(value) ? value.map(v => this.optionLabels.get(String(v)) || String(v)).join('、') : this.optionLabels.get(String(value)) || (value === 0 ? '' : String(value ?? ''));
    return { key: `${prefix}.${key}`, label, kind: type, required, value: value ?? '', error: this.fieldError(key), placeholder: type === 'password' && this.record ? this.t('system.user.keepPassword') : this.t('system.common.enter', { field: label }), display: display || this.t('choose') };
  }
  getFormFields(): Field[] {
    if (this.sheet?.type === 'edit') {
      const fields = this.config.fields.map(f => this.field(f.key, this.record && f.editLabel ? f.editLabel : f.label, f.type.endsWith('-select') || ['action-group', 'category'].includes(f.type) ? 'picker' : ['json', 'textarea'].includes(f.type) ? 'textarea' : f.type === 'enabled' ? 'switch' : f.type, !!f.required || (!this.record && !!f.createRequired)));
      if (this.resource === 'user') { fields.push(this.field('display_name', this.t('displayName'))); if (this.record) fields.push(this.field('department', this.t('department'))) }
      return fields;
    }
    if (this.sheet?.type === 'password') return [this.field('old_password', this.t('page.profile.password.oldPassword'), 'password', true), this.field('new_password', this.t('system.fields.newPassword'), 'password', true), this.field('confirmation', this.t('page.profile.password.confirmPassword'), 'password', true)];
    if (this.sheet?.type === 'lock-setup') return [this.field('lock_password', this.t('lockPassword'), 'password', true)];
    if (this.sheet?.type === 'compose') return [this.field('title', this.t('app.msg.title'), 'input', true), this.field('content', this.t('app.msg.content'), 'textarea', true), ...(this.form.scope === 'targeted' ? [this.field('recipient_ids', this.t('app.msg.recipients'), 'picker', true)] : []), this.field('expired_at', this.t('app.msg.expiry'), 'datetime', false)];
    if (this.sheet?.type === 'operation') return this.sheet.operation === 'review' && this.form.decision === 'reject' ? [this.field('reason', this.t('system.user.reason'), 'textarea', true)] : this.sheet.operation === 'lock' && this.form.lockMode !== 'permanent' ? [this.field('lockUntil', this.t('system.user.lockedUntil'), 'datetime', true)] : [];
    if (this.sheet?.type === 'filters') return this.config.filters.filter(f => f.key !== this.primaryFilter.key).map(f => {
      const field = this.field(f.key, f.label, 'filter-picker', false, this.filters[f.key], 'filter');
      if (f.type === 'enabled') field.display = this.filters[f.key] === 'true' ? this.t('system.enabled.yes') : this.filters[f.key] === 'false' ? this.t('system.enabled.no') : this.t('all');
      if (f.type === 'status-multi-select') field.display = this.filters[f.key]?.length ? this.filters[f.key].map((s: number) => this.t(`system.status.${s === 0 ? 'pending' : s === 1 ? 'active' : 'locked'}`)).join('、') : this.t('all');
      return field;
    });
    if (this.sheet?.type === 'timezone') return [this.field('timezone', this.t('timezone'), 'input', true)];
    if (this.sheet?.type === 'preferences') return ['year', 'company', 'companyLink', 'icp', 'icpLink'].map(key => this.field(key, this.t(key), 'input', ['company'].includes(key)));
    return [];
  }
  value(record: RecordData, key: string): string {
    if (key.endsWith('_at')) return this.date(record[key]);
    if (key === 'role') return record.role?.name || '—';
    if (key === 'users') return record.users?.map(u => u.username).join('\n') || '—';
    if (key === 'status') return this.t(`system.status.${record.status === 1 ? 'active' : record.status === 2 ? 'locked' : 'pending'}`);
    if (key === 'enabled') return this.t(record.enabled ? 'enabled' : 'disabled');
    if (key === 'category') return this.t(record.category === 1 ? 'system.category.jwt' : 'system.category.permission');
    if (key === 'action_codes') return record.actions?.map(a => `${a.name} · ${a.code}`).join('\n') || record.action_codes?.join('\n') || '—';
    return text(record[key]);
  }
  valuePresentation(record: RecordData, key: string) {
    const tokens: ValueToken[] = [];
    let note = '';
    if (key === 'status') {
      tokens.push({ label: this.value(record, key), tone: record.status === 1 ? 'success' : record.status === 2 ? 'danger' : 'warning' });
      if (record.status === 2 && record.metadata?.lock_expired_at !== undefined) tokens.push({ label: record.metadata.lock_expired_at === 0 ? this.t('system.user.permanent') : this.date(record.metadata.lock_expired_at), tone: 'warning' });
      if (record.status === 0 && record.metadata?.reject_register_reason) note = String(record.metadata.reject_register_reason);
    } else if (key === 'enabled') tokens.push({ label: this.value(record, key), tone: record.enabled ? 'success' : 'default' });
    else if (key === 'category') tokens.push({ label: this.value(record, key), tone: record.category === 1 ? 'success' : 'primary' });
    else if (key === 'role' && record.role) tokens.push({ label: record.role.name, tone: 'primary', path: `/system/role?word=${encodeURIComponent(record.role.word)}` });
    else if (key === 'users') record.users?.forEach(u => tokens.push({ label: u.username, tone: 'primary', path: `/system/user?username=${encodeURIComponent(u.username)}` }));
    else if (key === 'action_codes') {
      const codes = record.action_codes || record.actions?.map(a => a.code) || [];
      codes.forEach(code => tokens.push({ label: code, tone: 'primary', path: `/system/action?code=${encodeURIComponent(codes.join(','))}` }));
    } else if (['resource', 'menu', 'button'].includes(key)) {
      String(record[key] || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean).forEach(label => {
        const method = label.split('|')[0].trim().toUpperCase();
        const tone = record.category !== undefined ? record.category === 1 ? 'success' : 'primary' : ({ GET: 'success', POST: 'primary', PATCH: 'warning', DELETE: 'danger' } as Record<string, string>)[method] || 'default';
        tokens.push({ label, tone });
      });
    }
    return { tokens, note };
  }
  row(record: RecordData) {
    const identity = this.resource === 'user' ? 'username' : this.resource === 'whitelist' ? 'id' : 'name';
    const visible = this.visibleColumns;
    return { id: record.id, name: text(record[identity]), initials: text(record[identity]).slice(0, 2).toUpperCase(), summary: visible.filter(k => k !== identity && k !== 'status' && k !== 'enabled').map(key => ({ key, label: this.config.columns.find(c => c.key === key)?.title || '', value: this.value(record, key), ...this.valuePresentation(record, key) })), status: record.status, showStatus: visible.includes('status'), statusLabel: this.value(record, 'status'), enabled: record.enabled, showEnabled: visible.includes('enabled'), enabledLabel: this.value(record, 'enabled'), selected: this.selected.includes(record.id) };
  }
  snapshot() {
    const available = modules.filter(m => this.client.canMenu(`/system/${m.resource}`)).map(m => ({ ...m, label: this.t(m.key), path: `/system/${m.resource}` }));
    const filtered = available.filter(m => m.label.toLowerCase().includes(this.query.toLowerCase()));
    const s = this.sheet, record = this.record;
    let choices: any[] = [];
    if (s?.type === 'picker') {
      const value = (s.filter ? this.filters : this.form)[s.field!];
      choices = this.options.map(o => ({ value: String(o.value), label: o.label, parts: o.parts || [{ value: o.label, match: false }], history: !!o.history, selected: Array.isArray(value) ? value.includes(o.value) : value === o.value, action: 'option' }));
    }
    if (s?.type === 'language') choices = [{ value: 'zh-CN', label: '简体中文' }, { value: 'en-US', label: 'English' }].map(o => ({ ...o, selected: this.client.locale === o.value, action: 'language-value' }));
    if (s?.type === 'timezone') choices = ['Asia/Shanghai', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'].map(value => ({ value, label: value, selected: this.preferences.timezone === value, action: 'timezone-value' }));
    if (s?.type === 'density') choices = ['compact', 'default', 'loose'].map(value => ({ value, label: this.t(value), selected: this.preferences.density === value, action: 'density-value' }));
    if (s?.type === 'style') choices = [...['grouped', 'cards'].map(value => ({ value, label: this.t(value), selected: this.preferences.style === value, action: 'style-value' })), ...(['bordered', 'striped', 'sticky'] as const).map(value => ({ value, label: this.t(value), selected: this.preferences[value], action: 'style-toggle' }))];
    if (s?.type === 'page-size') choices = [10, 20, 50, 100].map(value => ({ value: String(value), label: String(value), selected: this.size === value, action: 'size-value' }));
    if (s?.type === 'columns') choices = (this.isSent ? ['type', 'scope', 'published_at'].map(key => ({ key, title: this.t(`app.msg.${key === 'published_at' ? 'published' : key}`) })) : this.config.columns.filter(c => c.key !== (this.resource === 'user' ? 'username' : this.resource === 'whitelist' ? 'id' : 'name'))).map(c => ({ value: c.key, label: c.title, selected: this.visibleColumns.includes(c.key), action: 'column' }));
    choices = choices.map(choice => ({ ...choice, parts: choice.parts || [] }));
    const statusOptions = [{ value: 'all', label: this.t('all') }, { value: '1', label: this.t('system.status.active') }, { value: '0', label: this.t('system.status.pending') }, { value: '2', label: this.t('system.status.locked') }].map(x => ({ ...x, active: x.value === 'all' ? !this.filters.status?.length : this.filters.status?.includes(Number(x.value)) }));
    const messageRows = this.records.map(r => ({ id: r.id, title: String(r.title || ''), content: String(r.content || ''), read: !!r.read_at, date: this.date(r.published_at), type: this.t(`app.msg.${r.type}`), busy: this.messageBusy.includes(r.id), scope: this.t(`app.msg.${r.scope}`), selected: this.selected.includes(r.id), showType: !this.isSent || this.visibleColumns.includes('type'), showScope: this.isSent && this.visibleColumns.includes('scope'), showDate: !this.isSent || this.visibleColumns.includes('published_at') }));
    const authFields = this.route === '/auth/reset-password' ? [this.field('password', this.t('system.fields.newPassword'), 'password', true, this.auth.password, 'auth'), this.field('confirmation', this.t('page.profile.password.confirmPassword'), 'password', true, this.auth.confirmation, 'auth')] : [this.field('username', this.t('system.fields.username'), 'input', true, this.auth.username, 'auth'), this.field('password', this.t('system.fields.password'), 'password', true, this.auth.password, 'auth'), ...(this.route === '/auth/register' ? [this.field('confirmation', this.t('page.profile.password.confirmPassword'), 'password', true, this.auth.confirmation, 'auth')] : [])];
    const date = new Date(), workspace = this.route === '/dashboard/workspace';
    let today = '';
    try { today = new Intl.DateTimeFormat(this.client.locale, { month: 'long', day: 'numeric', weekday: 'long', timeZone: this.preferences.timezone }).format(date) } catch { today = this.date(date.getTime()).slice(0, 10) }
    return {
      extra: Object.fromEntries(Object.entries({ approve: 'system.user.approve', reject: 'system.user.reject', until: 'system.user.lockUntil', permanent: 'system.user.permanent', unlock: 'system.user.unlock', lock: 'system.user.lock', unlockPassword: 'system.user.unlockPassword', messageType: 'app.msg.type', notice: 'app.msg.notice', system: 'app.msg.system', scope: 'app.msg.scope', targeted: 'app.msg.targeted', discardHint: 'unsavedHint', keep: 'keepEditing', discard: 'discard' }).map(([k, v]) => [k, this.t(v)])),
      native: !!this.client.platform.native, topInset: this.client.platform.topInset || 0,
      variant: this.variant, dark: this.preferences.dark, locale: this.client.locale, language: this.client.locale === 'en-US' ? 'English' : '简体中文',
      settingsOpen: this.sheets.some(s => s.type === 'settings'),
      workspace, locked: this.locked, lockFields: [this.field('password', this.t('lockHint'), 'password', true, this.lockPassword, 'lock')].map(f => ({ ...f, error: this.fieldError('lock_password') })),
      deviceRows: this.devices.map(d => ({ ...d, lastSeenLabel: this.t(d.lastSeen), icon: d.current ? 'phone' : 'desktop' })),
      palette: [{ value: 'default', label: this.t(this.variant === 'ant' ? 'paletteAnt' : this.variant === 'tdesign' ? 'paletteTdesign' : 'paletteWot'), color: { ant: '#796375', tdesign: '#0052d9', wot: '#4d55d5' }[this.variant] }, { value: 'green', label: this.t('paletteGreen'), color: '#13775e' }, { value: 'violet', label: this.t('paletteViolet'), color: '#6b52b5' }].map(p => ({ ...p, selected: this.preferences.accent === p.value })),
      accountFocused: this.accountFocused, accountHistory: this.accounts, usernameBusy: this.usernameBusy,
      accountOptions: this.accounts.filter(a => a.toLowerCase().includes(this.auth.username.trim().toLowerCase())).map(value => ({ value })),
      route: this.route, view: this.view, tab: this.tab, resource: this.resource, auth: this.auth, authFields, resetRequired: this.route === '/auth/reset-password', register: this.route === '/auth/register',
      l: Object.fromEntries(Object.entries(labels).map(([alias, key]) => [alias, this.t(key)])),
      title: this.view === 'list' ? this.config.title : this.view === 'messages' ? this.t(this.isSent ? 'app.msg.manage' : 'app.msg.inbox') : this.t(this.view === 'auth' ? this.route === '/auth/register' ? 'authRegisterTitle' : this.route === '/auth/reset-password' ? 'app.resetPassword.title' : 'authLoginTitle' : this.view === 'profile' ? 'mine' : this.view === 'manage' ? 'managing' : this.view === 'security' ? 'security' : workspace ? 'page.dashboard.workspace' : 'home'),
      subtitle: this.t(this.view === 'home' ? workspace ? 'workspaceDescription' : 'overviewDescription' : this.view === 'manage' ? 'manageHint' : this.view === 'profile' ? 'profileHint' : this.view === 'auth' ? this.route === '/auth/register' ? 'authRegisterHint' : this.route === '/auth/reset-password' ? 'app.resetPassword.description' : 'authLoginHint' : this.view === 'list' ? 'userHint' : this.view === 'messages' ? this.isSent ? 'app.msg.manageHint' : 'app.msg.hint' : 'securityHint'),
      today,
      user: this.client.user, initials: this.client.user?.username.slice(0, 2).toUpperCase() || 'GC', query: this.query, filters: this.filters, statusOptions,
      primaryTags: this.primaryFilter.type === 'input-multi-select' && Array.isArray(this.filters[this.primaryFilter.key]) ? this.filters[this.primaryFilter.key].map((value: string) => ({ value, lines: value.split(/\r?\n/).filter(Boolean) })) : [],
      groups: [0, 1, 2].map((group, i) => ({ title: this.t(['accessGroup', 'configGroup', 'messageGroup'][i]), items: filtered.filter(m => m.group === group) })).filter(g => g.items.length),
      quick: available.filter(m => ['user', 'role', 'user-group', 'dictionary'].includes(m.resource)), modules: filtered,
      stats: ['active', 'pending', 'locked'].map((key, i) => ({ ...this.stats[key], available: this.loadedRegions.has(key), display: this.stats[key].error && !this.loadedRegions.has(key) ? '—' : String(this.stats[key].value), label: this.t(`system.status.${key}`), status: [1, 0, 2][i] })),
      total: this.total, totalDisplay: this.recentError && !this.loadedRegions.has('recent') ? '—' : String(this.total), pendingCount: this.stats.pending.value, summaryLoading: this.recentLoading, summaryError: this.recentError || Object.values(this.stats).map(s => s.error).find(Boolean) || '',
      reviews: this.reviews.map(r => ({ id: r.id, name: r.username, initials: String(r.metadata?.display_name || r.username || '').slice(0, 1).toUpperCase(), role: [r.metadata?.display_name || r.metadata?.department || r.role?.name, this.t('system.status.pending')].filter(Boolean).join(' · '), path: `/system/user?username=${encodeURIComponent(r.username || '')}&status=0` })), reviewsLoading: this.reviewsLoading, reviewsError: this.reviewsError,
      recent: this.recent.map(r => ({ id: r.id, name: r.username, initials: r.username?.slice(0, 2).toUpperCase(), date: this.date(r.created_at) })), recentLoading: this.recentLoading, recentError: this.recentError,
      canUsers: this.booting || this.client.can('user', 'read'), canCreate: this.can('create'), canUpdate: this.can('update'), canDelete: this.can('delete'), canRead: this.can('read'), routeAllowed: this.client.canMenu(this.route),
      rows: this.records.map(r => this.row(r)), hasRows: this.records.length > 0, refreshing: this.loading && this.records.length > 0, skeletonRows: [0, 1, 2, 3, 4].map(id => ({ id })), reviewSkeletonRows: [0, 1].map(id => ({ id })), profileLoading: this.profileLoading, profileError: this.profileError, totalLabel: this.t('recordCount', { count: this.total }), page: this.page, size: this.size, pages: Math.max(1, Math.ceil(this.total / this.size)), pageLabel: this.t('currentPage', { page: this.page, total: Math.max(1, Math.ceil(this.total / this.size)) }),
      selection: this.selection, selectedCount: this.selected.length, selectedLabel: this.t('selectCount', { count: this.selected.length }), density: this.preferences.density, listStyle: this.preferences.style,
      searchFocus: this.searchFocus, searchLabel: this.primaryFilter.label, suggestions: this.suggestions, loading: this.loading, booting: this.booting, busy: this.busy, error: this.error, notice: this.notice, scrollTarget: this.scrollTarget,
      errorRetryAction: this.isAuth ? 'retry-auth-check' : 'refresh', canRetryError: !this.isAuth || (this.route !== '/auth/reset-password' && !!this.auth.username.trim()), retryBusy: this.isAuth ? this.usernameBusy || this.busy : this.loading,
      sheetError: this.sheetError, sheet: s ? { ...s, title: this.t(s.title) } : null, fields: this.getFormFields(), choices, optionsLoading: this.optionsLoading, optionsQuery: this.optionsQuery, optionsMore: this.optionsPage * 30 < this.optionsTotal,
      details: record && ['detail', 'profile'].includes(s?.type || '') ? (s?.type === 'profile' ? [{ key: 'username', title: this.t('system.fields.username') }, { key: 'code', title: this.t('system.fields.userCode') }, { key: 'role', title: this.t('system.fields.role') }] : this.config.columns).map(c => ({ key: c.key, label: c.title, value: this.value(record, c.key), tags: this.value(record, c.key).split('\n').filter(Boolean), json: ['metadata', 'value'].includes(c.key), ...this.valuePresentation(record, c.key) })) : [],
      recordName: record ? text(record.username || record.name || record.id) : '', recordStatus: record?.status, hasPasswordLock: !!record?.metadata?.password_change_failures,
      form: this.form, verificationError: this.fieldError('verification'), sliderPosition: this.sliderPosition, sliderBusy: this.sliderBusy, sliderError: this.sliderError, proof: !!this.proof,
      captcha: this.captcha ? { ...this.captcha, points: this.captchaPoints.map((p, index) => ({ left: p.x / this.captcha!.width * 100, top: p.y / this.captcha!.height * 100, label: index + 1 })) } : null, captchaVerified: this.captchaVerified,
      unread: this.unread, messageRead: this.messageRead, messageType: this.messageType, messageTypes: ['', 'system', 'notice'].map(value => ({ value, label: this.t(value ? `app.msg.${value}` : 'all'), active: value === this.messageType })), messageRows, swipedMessage: this.swipedMessage, loadingMore: this.loadingMore, hasMore: this.records.length < this.total, isSent: this.isSent, canSend: this.client.canMenu(this.route) && this.client.canMsg('send'), canDeleteMessage: !this.isSent || (this.client.canMenu(this.route) && this.client.canMsg('delete')), message: s?.type === 'message' ? { title: record?.title || '', content: record?.content || '', date: this.date(record?.published_at), type: this.t(`app.msg.${record?.type}`), scope: this.t(`app.msg.${record?.scope}`), expiry: record?.expired_at ? this.date(record.expired_at) : this.t('app.msg.noExpiry'), recipients: Array.isArray(record?.recipient_ids) ? record.recipient_ids.join(', ') : '', targeted: record?.scope === 'targeted' } : null,
      footer: this.preferences.footer && this.preferences.copyright, copyright: `Copyright © ${this.preferences.year || new Date().getFullYear()} ${this.preferences.company}`, companyLink: this.preferences.companyLink, icp: this.preferences.icp, preferences: this.preferences,
      dock: [{ key: 'home', icon: 'home', label: this.t('home'), path: '/dashboard/overview' }, { key: 'manage', icon: 'grid', label: this.t('manage'), path: '/dashboard/overview?tab=manage' }, { key: 'security', icon: 'shield', label: this.t('security'), path: '/dashboard/overview?tab=security' }, { key: 'profile', icon: 'user', label: this.t('mine'), path: '/profile' }].map(d => ({ ...d, active: d.key === this.view || (d.key === 'manage' && (this.view === 'list' || this.isSent)) || (d.key === 'profile' && this.route === '/msg/inbox') })),
    };
  }
  async action(name: string, value = '') {
    if (this.locked && !['unlock', 'lock-logout'].includes(name)) return;
    if (this.busy && !['close'].includes(name)) return;
    try {
      switch (name) {
        case 'navigate': this.navigate(value); return;
        case 'back': if (this.sheets.length) this.close(); else this.navigate(this.view === 'messages' && !this.isSent ? '/profile' : '/dashboard/overview?tab=manage'); return;
        case 'close': this.close(); return;
        case 'discard': { const destination = this.sheet?.destination; this.sheets.pop(); this.initial = { ...this.form }; if (destination) this.navigate(destination, true); else this.close(true); return }
        case 'keep-editing': this.close(true); return;
        case 'refresh': await this.load(); return;
        case 'retry-auth-check': await this.retryAuthCheck(); return;
        case 'search': this.searchFocus = false; clearTimeout(this.blurTimer); this.page = 1; this.rememberSearch(); await this.load(); return;
        case 'suggestion': this.query = value; this.searchFocus = false; clearTimeout(this.blurTimer); this.suggestRevision++; this.rememberSearch(); await this.load(); return;
        case 'clear-history': removeFilterHistory(this.client.platform, this.client.prefix, this.resource, this.primaryFilter.key); this.suggestions = []; break;
        case 'remove-history': removeFilterHistory(this.client.platform, this.client.prefix, this.resource, this.primaryFilter.key, value); this.suggest(); break;
        case 'reset-search': this.filters = {}; this.query = ''; this.page = 1; this.searchFocus = false; await this.load(); return;
        case 'remove-filter-value': if (Array.isArray(this.filters[this.primaryFilter.key])) this.filters[this.primaryFilter.key] = this.filters[this.primaryFilter.key].filter((v: string) => v !== value); this.page = 1; await this.load(); return;
        case 'status': this.filters.status = value === 'all' ? undefined : [Number(value)]; this.page = 1; await this.load(); return;
        case 'home-status': this.navigate(`/system/user?status=${value}`); return;
        case 'home-record': this.navigate(`/system/user?username=${encodeURIComponent(value)}`); return;
        case 'filters': this.push({ type: 'filters', title: 'filterTitle' }); return;
        case 'apply-filters': this.close(true); this.page = 1; await this.load(); return;
        case 'prev': if (this.page > 1) await this.loadPageAtTop(this.page - 1); return;
        case 'next': if (this.page * this.size < this.total) await this.loadPageAtTop(this.page + 1); return;
        case 'detail': if (this.selection) { const id = Number(value); this.selected = this.selected.includes(id) ? this.selected.filter(x => x !== id) : [...this.selected, id] } else { await this.detail(Number(value)); return } break;
        case 'detail-retry': if (this.sheet?.id) { const id = this.sheet.id; this.close(true); await this.detail(id) } return;
        case 'select': this.selection = !this.selection; this.selected = []; break;
        case 'select-all': this.selected = this.selected.length === this.records.length ? [] : this.records.map(r => r.id); break;
        case 'create': await this.edit(true); return;
        case 'edit': await this.edit(); return;
        case 'save': await this.save(); return;
        case 'picker': await this.openOptions(value.replace(/^form\./, '')); return;
        case 'filter-picker': this.optionsQuery = ''; this.options = []; this.optionsPage = 1; this.optionsTotal = 0; this.push({ type: 'picker', title: 'choose', field: value.replace(/^filter\./, ''), filter: true }); await this.loadOptions(true); return;
        case 'filter-clear': if (this.sheet?.filter) { delete this.filters[this.sheet.field!]; this.emit() } return;
        case 'filter-history-clear': if (this.sheet?.filter) { removeFilterHistory(this.client.platform, this.client.prefix, this.resource, this.sheet.field!); await this.loadOptions(true) } return;
        case 'filter-history-remove': if (this.sheet?.filter) { removeFilterHistory(this.client.platform, this.client.prefix, this.resource, this.sheet.field!, value); await this.loadOptions(true) } return;
        case 'option': this.selectOption(value); return;
        case 'options-more': await this.loadOptions(false); return;
        case 'options-retry': await this.loadOptions(true); return;
        case 'delete': {
          const ids = (this.selected.length ? [...this.selected] : [this.record?.id]).filter((id): id is number => Number.isInteger(id) && Number(id) > 0);
          if (ids.length && (this.view === 'messages' ? !this.isSent || this.client.canMsg('delete') : this.can('delete'))) this.push({ type: 'operation', title: this.isSent ? 'app.msg.deleteGlobalConfirm' : 'deleteConfirm', operation: 'delete', ids });
          return;
        }
        case 'review': case 'lock-user': case 'unlock-user': case 'unlock-password':
          this.form = { decision: 'approve', reason: '', lockMode: 'until', lockUntil: this.date(Date.now() + 86400000) };
          this.push({ type: 'operation', title: 'operation', operation: { review: 'review', 'lock-user': 'lock', 'unlock-user': 'unlock', 'unlock-password': 'unlockPassword' }[name] }); return;
        case 'operate': await this.operate(); return;
        case 'decision': this.form.decision = value; break;
        case 'lock-mode': this.form.lockMode = value; break;
        case 'settings': this.accountFocused = false; this.push({ type: 'settings', title: 'interfaceSettings' }); return;
        case 'density': case 'columns': case 'style': case 'page-size': this.push({ type: name, title: name === 'columns' ? 'fields' : name === 'page-size' ? 'pageSize' : name }); return;
        case 'density-value': this.preferences.density = value; this.persist(); this.close(true); return;
        case 'style-value': this.preferences.style = value; this.persist(); this.close(true); return;
        case 'size-value': if (!this.loading && [10, 20, 50, 100].includes(Number(value))) { this.close(true); await this.loadPageAtTop(1, Number(value)) } return;
        case 'column': { const cols = this.visibleColumns; this.preferences.columns[this.columnKey] = cols.includes(value) ? cols.filter(x => x !== value) : [...cols, value]; this.persist(); break }
        case 'style-toggle': if (['bordered', 'striped', 'sticky'].includes(value)) { const key = value as 'bordered' | 'striped' | 'sticky'; this.preferences[key] = !this.preferences[key]; this.persist() } break;
        case 'theme': this.preferences.dark = !this.preferences.dark; this.persist(); break;
        case 'language': this.push({ type: 'language', title: 'chooseLanguage' }); return;
        case 'language-value': if (value === 'zh-CN' || value === 'en-US') { this.client.locale = value; this.client.platform.write(this.client.prefix + 'locale', value); this.close(true) } return;
        case 'accent': if (['default', 'green', 'violet'].includes(value)) { this.preferences.accent = value as Preferences['accent']; this.persist() } break;
        case 'timezone': this.form = { timezone: this.preferences.timezone }; this.initial = { ...this.form }; this.push({ type: 'timezone', title: 'chooseTimezone' }); return;
        case 'timezone-value': this.form.timezone = value; await this.saveTimezone(); return;
        case 'timezone-save': await this.saveTimezone(); return;
        case 'account-pick': this.input('auth.username', value); this.auth.password = ''; this.accountFocused = false; clearTimeout(this.accountBlurTimer); await this.verifyUsername(); return;
        case 'account-remove': this.accounts = saveAccounts(this.client.platform, this.client.prefix, this.accounts.filter(a => a !== value)); break;
        case 'accounts-clear': this.accounts = saveAccounts(this.client.platform, this.client.prefix, []); this.accountFocused = false; break;
        case 'preferences': this.form = { ...this.preferences }; this.initial = { ...this.form }; this.push({ type: 'preferences', title: 'copyrightInfo' }); return;
        case 'preference-toggle': this.form[value] = !this.form[value]; break;
        case 'save-preferences':
          this.errors = {}; this.required('company', this.form.company, this.t('company'));
          try { new Intl.DateTimeFormat('en', { timeZone: this.form.timezone }).format(new Date()) } catch { this.errors.timezone = { key: 'invalidDate' } }
          if (Object.keys(this.errors).length) break;
          this.preferences = { ...this.preferences, ...this.form }; this.persist(); this.initial = { ...this.form }; this.close(true); return;
        case 'profile': this.record = this.client.user as unknown as RecordData; this.push({ type: 'profile', title: 'profile' }); return;
        case 'password': this.form = { old_password: '', new_password: '', confirmation: '' }; this.initial = { ...this.form }; this.errors = {}; this.captcha = null; this.push({ type: 'password', title: 'password' }); return;
        case 'save-password': await this.passwordChange(); return;
        case 'logout': this.push({ type: 'logout', title: 'logoutConfirm' }); return;
        case 'confirm-logout': this.busy = true; this.emit(); try { await this.client.logout() } finally { this.navigate('/auth/login', true); this.busy = false } return;
        case 'lock': this.form = { lock_password: '' }; this.initial = { ...this.form }; this.errors = {}; this.push({ type: 'lock-setup', title: 'lockNow' }); return;
        case 'remove-device': this.devices = this.devices.filter(d => d.id !== Number(value) || d.current); break;
        case 'set-lock': await this.setLock(); return;
        case 'unlock': this.unlock(); return;
        case 'lock-logout': this.busy = true; this.emit(); try { await this.client.logout() } finally { this.navigate('/auth/login', true); this.busy = false } return;
        case 'login': await this.login(); return;
        case 'refresh-captcha': await this.refreshCaptcha(); return;
        case 'message-filter': this.messageRead = value; this.page = 1; await this.load(); return;
        case 'message-type-filter': this.messageType = value; this.page = 1; this.records = []; this.swipedMessage = null; await this.load(); return;
        case 'message-swipe': this.swipedMessage = Number(value) || null; break;
        case 'message-more': await this.moreMessages(); return;
        case 'message-read': await this.readMessage(Number(value)); return;
        case 'message-delete': if (!this.isSent) await this.deleteInboxMessage(Number(value)); else if (this.client.canMsg('delete')) { this.record = this.records.find(r => r.id === Number(value)) || null; this.push({ type: 'operation', title: 'app.msg.deleteGlobalConfirm', operation: 'delete', ids: [Number(value)] }) } return;
        case 'read-all': await this.readAllMessages(); return;
        case 'compose': await this.compose(); return;
        case 'send': await this.sendMessage(); return;
        case 'message-type': this.form.type = value; break;
        case 'message-scope': this.form.scope = value; break;
      }
    } catch (e) { if (this.sheet) this.sheetError = this.errorMessage(e); else this.error = this.errorMessage(e) }
    this.emit();
  }
}
