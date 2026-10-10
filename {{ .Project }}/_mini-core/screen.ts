import { Client, ApiError } from './client';
import { getConfigs, type ResourceConfig } from './resources';
import { pageURL, type MiniConfig } from './platform';
import { randomID } from './jwe';
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
const labels: Record<string, string> = {
  home: 'home', manage: 'managing', security: 'security', mine: 'mine', all: 'all', search: 'system.common.search', reset: 'system.common.reset',
  create: 'system.common.create', edit: 'system.common.edit', remove: 'system.common.delete', refresh: 'refresh', filter: 'filterTitle',
  detail: 'detail', close: 'close', cancel: 'cancel', save: 'save', confirm: 'confirm', back: 'back', username: 'system.fields.username',
  password: 'system.fields.password', remember: 'remembered', usernameHint: 'passwordNotStored', login: 'page.auth.login', register: 'page.auth.register',
  verification: 'verification', passed: 'verified', slider: 'slider', more: 'more', common: 'common', latest: 'latest', review: 'needsReview',
  reviewAction: 'system.user.review', total: 'userTotal', userOverview: 'userOverview', noData: 'empty', emptyHint: 'emptyHint', retry: 'retry',
  select: 'select', selected: 'selected', allSelect: 'system.common.selectAll', done: 'confirm', prev: 'previous', next: 'next', pageSize: 'pageSize',
  density: 'density', fields: 'fields', style: 'listStyle', lock: 'lockNow', language: 'language', dark: 'theme', profile: 'profile', passwordChange: 'password',
  logout: 'logout', settings: 'settings', session: 'sessionOnly', unread: 'unread', read: 'read', messages: 'messages', allRead: 'allRead', send: 'app.msg.send',
  requiredReset: 'resetRequired', continue: 'app.resetPassword.submit', loading: 'loading', noAccess: 'noAccess', footer: 'footerVisible',
  copyright: 'copyright', copyrightVisible: 'copyrightVisible', timezone: 'timezone', loadMore: 'loadMore', suggestions: 'suggestions', clearHistory: 'clearHistory',
};
interface Validation { key: string; vars?: Record<string, unknown> }
interface Field { key: string; label: string; kind: string; required: boolean; value: any; error: string; placeholder: string; display: string }
interface Sheet { type: string; title: string; id?: number; field?: string; [key: string]: any }
interface Preferences { dark: boolean; timezone: string; footer: boolean; copyright: boolean; year: string; company: string; companyLink: string; icp: string; icpLink: string; density: string; style: string; columns: Record<string, string[]> }

export class Screen {
  route = '/dashboard/overview';
  tab = 'home';
  resource: ResourceKind = 'user';
  view = 'home';
  query = '';
  filters: Record<string, any> = {};
  page = 1;
  size = 10;
  total = 0;
  records: RecordData[] = [];
  record: RecordData | null = null;
  selection = false;
  selected: number[] = [];
  loading = false;
  booting = true;
  busy = false;
  error = '';
  sheetError = '';
  sheets: Sheet[] = [];
  form: Record<string, any> = {};
  initial: Record<string, any> = {};
  errors: Record<string, Validation> = {};
  options: { value: string | number; label: string }[] = [];
  optionsPage = 1;
  optionsTotal = 0;
  optionsQuery = '';
  optionsLoading = false;
  suggestions: { value: string; parts: { value: string; match: boolean }[] }[] = [];
  searchFocus = false;
  unread = 0;
  messageRead = 'all';
  auth = { username: '', password: '', confirmation: '', old: '', remember: false };
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
    this.preferences = { dark: false, timezone: systemTimezone(), footer: true, copyright: true, year: String(new Date().getFullYear()), company: 'go-cinch', companyLink: 'https://github.com/go-cinch/demos', icp: '', icpLink: '', density: 'comfortable', style: variant === 'wot' ? 'cards' : 'grouped', columns: {}, ...stored };
    this.auth.username = String(client.platform.read(client.prefix + 'username') || '');
    this.auth.remember = !!this.auth.username;
    if (client.registrationLogin) { Object.assign(this.auth, client.registrationLogin); client.registrationLogin = null }
  }
  t = (key: string, vars: Record<string, unknown> = {}) => this.client.t(key, vars);
  get config(): ResourceConfig { return getConfigs(this.t)[this.resource] }
  get sheet() { return this.sheets[this.sheets.length - 1] }
  get isAuth() { return this.route.startsWith('/auth/') }
  get isSent() { return this.route === '/system/msg' }
  get authenticatedCaptcha() { return this.sheet?.type === 'password' }
  get dirty() { return ['edit', 'password', 'compose', 'preferences'].includes(this.sheet?.type || '') && JSON.stringify(this.form) !== JSON.stringify(this.initial) }
  fieldError(key: string) { const error = this.errors[key]; if (!error) return ''; const field = this.config.fields.find(f => f.key === key); return this.t(error.key, error.vars?.field && field ? { ...error.vars, field: field.label } : error.vars) }
  can(operation: string) { return this.client.can(this.resource, operation) }
  date(value: unknown) { return formatDate(value, this.preferences.timezone) }
  async start(route: string, query: Record<string, string> = {}) {
    this.route = route; this.tab = query.tab || 'home';
    if (query.status) this.filters.status = query.status.split(',').map(Number);
    if (query.username) this.query = query.username;
    this.resource = route.slice('/system/'.length) as ResourceKind;
    if (!getConfigs(this.t)[this.resource]) this.resource = 'user';
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
      await this.load();
      if (!this.isAuth) { void this.countMessages(); this.polling = setInterval(() => { if (this.visible && !this.busy) { void this.countMessages(); if (this.view === 'messages') void this.load() } }, 30000) }
    } catch (e) { this.error = this.errorMessage(e) } finally { this.booting = false; this.emit() }
  }
  show() { this.visible = true; if (!this.isAuth && this.client.accessToken && !this.client.resetRequired) void this.countMessages() }
  hide() { this.visible = false; this.resetSlider() }
  dispose() { this.disposed = true; this.revision++; this.optionsRevision++; this.suggestRevision++; this.captchaRevision++; this.resetSlider(); this.timers.forEach(clearTimeout); clearTimeout(this.inputTimer); clearTimeout(this.blurTimer); if (this.polling) clearInterval(this.polling); this.auth.password = ''; this.auth.old = ''; this.auth.confirmation = ''; this.form = {} }
  errorMessage(e: unknown) { return e instanceof Error ? e.message : this.t('requestError') }
  navigate(route: string, force = false) {
    if (this.busy && !force) return;
    if (!force && this.dirty) { this.push({ type: 'discard', title: 'unsavedTitle', destination: route }); return }
    this.client.platform.navigate(pageURL(route));
  }
  persist() { this.client.platform.write(this.client.prefix + 'preferences', this.preferences) }
  emit() { if (!this.disposed) this.publish(this.snapshot()) }
  async load() {
    if (this.isAuth || ['manage', 'profile', 'security'].includes(this.view)) { this.emit(); return }
    const revision = ++this.revision;
    this.error = '';
    if (this.view === 'home') {
      if (!this.client.can('user', 'read')) { this.recentLoading = false; this.reviewsLoading = false; this.emit(); return }
      const regions = [['active', 1], ['pending', 0], ['locked', 2]] as const;
      await Promise.all([...regions.map(async ([key, status]) => {
        this.stats[key].loading = true; this.stats[key].error = ''; this.emit();
        try { const value = await this.client.list('user', { p: 1, s: status === 0 ? 3 : 1, status }); if (revision !== this.revision || this.disposed) return; this.stats[key].value = value.t; if (key === 'pending') { this.reviews = value.items; this.reviewsLoading = false } }
        catch (e) { if (revision === this.revision) this.stats[key].error = this.errorMessage(e) }
        finally { if (revision === this.revision) { this.stats[key].loading = false; this.emit() } }
      }), (async () => {
        this.recentLoading = true; this.recentError = ''; this.emit();
        try { const value = await this.client.list('user', { p: 1, s: 5 }); if (revision === this.revision && !this.disposed) { this.recent = value.items; this.total = value.t } }
        catch (e) { this.recentError = this.errorMessage(e) }
        finally { this.recentLoading = false; this.emit() }
      })()]); return;
    }
    if ((this.view === 'list' && !this.can('read')) || (this.isSent && !this.client.canMsg('read'))) { this.error = this.t('noAccess'); this.emit(); return }
    this.loading = true; this.emit();
    try {
      let result;
      if (this.view === 'messages') result = await this.client.list(this.isSent ? 'msg/sent' : 'msg/inbox', { p: this.page, s: this.size, ...(this.messageRead === 'unread' ? { read: false } : {}), ...this.filters });
      else result = await this.client.list(this.resource, { p: this.page, s: this.size, ...this.filters, ...(this.query ? { [this.config.filters[0].key]: this.query } : {}) });
      if (revision !== this.revision || this.disposed) return;
      this.records = result.items; this.total = result.t;
      this.selected = this.selected.filter(id => this.records.some(r => r.id === id));
    } catch (e) { if (revision === this.revision) this.error = this.errorMessage(e) }
    finally { if (revision === this.revision) { this.loading = false; this.emit() } }
  }
  async countMessages() { try { const value = await this.client.request<{ count: number }>('/msg/unread-count'); if (!this.disposed) { this.unread = value.count; this.emit() } } catch { /* Poll failures do not block unrelated pages. */ } }
  push(sheet: Sheet) { this.sheets.push(sheet); this.sheetError = ''; this.emit() }
  close(force = false) {
    if (this.busy && !force) return;
    if (!force && this.dirty) { this.push({ type: 'discard', title: 'unsavedTitle' }); return }
    this.optionsRevision++; this.sheets.pop(); this.sheetError = ''; this.errors = {};
    if (!this.sheets.length) { this.form = {}; this.initial = {}; this.captcha = null; this.captchaPoints = []; this.captchaVerified = false }
    this.emit();
  }
  input(key: string, value: unknown) {
    if (key.startsWith('auth.')) {
      const field = key.slice(5); (this.auth as any)[field] = field === 'remember' ? !!value : String(value);
      if (field === 'username' || field === 'password') { this.resetSlider(); this.captcha = null; this.captchaPoints = []; this.captchaVerified = false; this.captchaRevision++ }
      if (field === 'remember' && !value) this.client.platform.write(this.client.prefix + 'username', undefined);
      delete this.errors[field];
    } else if (key.startsWith('form.')) { const field = key.slice(5); this.form[field] = value; delete this.errors[field] }
    else if (key.startsWith('filter.')) this.filters[key.slice(7)] = value;
    else if (key === 'search') { this.query = String(value); this.page = 1; this.searchFocus = true; if (this.view === 'list') this.suggest(); }
    else if (key === 'picker') { this.optionsQuery = String(value); clearTimeout(this.inputTimer); this.inputTimer = setTimeout(() => void this.loadOptions(true), 250) }
    this.emit();
  }
  blurSearch() { clearTimeout(this.blurTimer); this.blurTimer = setTimeout(() => { this.searchFocus = false; this.rememberSearch(); void this.load() }, 250) }
  rememberSearch() { const q = this.query.trim(); if (!q) return; const key = this.client.prefix + `history:${this.resource}`, history = this.client.platform.read(key); this.client.platform.write(key, [q, ...(Array.isArray(history) ? history : []).filter(x => x !== q)].slice(0, 12)) }
  suggest() {
    clearTimeout(this.inputTimer); const generation = ++this.suggestRevision;
    this.inputTimer = setTimeout(async () => {
      const q = this.query.trim(), field = this.config.filters[0].key;
      const history = this.client.platform.read(this.client.prefix + `history:${this.resource}`);
      let values = Array.isArray(history) ? history.filter(x => String(x).toLowerCase().includes(q.toLowerCase())) : [];
      try { if (q && this.can('read')) { const result = await this.client.list(this.resource, { p: 1, s: 8, [field]: q }); values = [...result.items.flatMap(r => String(r[field] || '').split('\n')), ...values] } } catch { /* Retain history when suggestions fail. */ }
      if (generation !== this.suggestRevision || this.disposed) return;
      this.suggestions = [...new Set<string>(values)].slice(0, 10).map(value => { const i = value.toLowerCase().indexOf(q.toLowerCase()); return { value, parts: i < 0 || !q ? [{ value, match: false }] : [{ value: value.slice(0, i), match: false }, { value: value.slice(i, i + q.length), match: true }, { value: value.slice(i + q.length), match: false }] } }); this.emit();
    }, 200);
  }
  async detail(id: number) {
    if (this.view === 'list' && !this.can('read')) return;
    if (this.isSent && !this.client.canMsg('read')) return;
    this.push({ type: this.view === 'messages' ? 'message' : 'detail', title: this.view === 'messages' ? 'app.msg.detail' : 'detail', id, loading: true });
    const target = this.sheet;
    try { this.record = await this.client.request<RecordData>(this.view === 'messages' ? `/msg/${this.isSent ? 'sent' : 'inbox'}/${id}` : `/${this.resource}/${id}`); if (this.view === 'messages' && !this.isSent && !this.record.read_at) { await this.client.request(`/msg/inbox/${id}`, { method: 'PATCH', body: { read: true } }); void this.countMessages(); const row = this.records.find(r => r.id === id); if (row) row.read_at = Date.now() } }
    catch (e) { this.sheetError = this.errorMessage(e) }
    finally { target.loading = false; this.emit() }
  }
  async edit(create = false) {
    if (!this.can(create ? 'create' : 'update')) { this.sheetError = this.t('noAccess'); this.emit(); return }
    if (create) this.record = null;
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
    if (this.resource === 'dictionary') { if (!dictionaryKeyValid(this.form.key)) this.errors.key = { key: 'system.validation.dictionaryKey' }; try { JSON.parse(this.form.value) } catch { this.errors.value = { key: 'system.validation.json' } } }
    if (Object.keys(this.errors).length) { this.emit(); return }
    let payload = this.normalize(this.form); if (this.record) payload = buildChangedPayload(this.normalize(this.initial), payload);
    if (!Object.keys(payload).length) { this.sheetError = this.t('noChange'); this.emit(); return }
    this.busy = true; this.emit();
    try { await this.client.save(this.resource, payload, this.record?.id, this.idempotency); this.sheets = []; this.form = {}; this.client.platform.toast(this.t('saveSuccess')); await this.load() }
    catch (e) { this.sheetError = this.errorMessage(e) }
    finally { this.busy = false; this.emit() }
  }
  async openOptions(field: string) { this.optionsQuery = ''; this.options = []; this.optionsPage = 1; this.optionsTotal = 0; this.push({ type: 'picker', title: 'choose', field }); await this.loadOptions(true) }
  async loadOptions(reset: boolean) {
    const field = this.sheet?.field || ''; const generation = ++this.optionsRevision;
    if (reset) this.optionsPage = 1; else this.optionsPage++;
    this.optionsLoading = true; this.sheetError = ''; this.emit();
    try {
      let options: { value: string | number; label: string }[] = [];
      if (field === 'category') options = [0, 1].map(value => ({ value, label: this.t(value ? 'system.category.jwt' : 'system.category.permission') }));
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
      const payload = reset ? { new_password: this.auth.password.trim() } : { username: this.auth.username.trim(), password: this.auth.password.trim(), ...(this.captcha ? { captcha_id: this.captcha.captcha_id, captcha_points: this.captchaPoints } : { slider_proof: this.proof }), ...(register ? {} : { remember_me: this.auth.remember }) };
      const result = await this.client.submitCredentials(reset ? 'password_reset' : register ? 'register' : 'login', payload);
      if (this.auth.remember) this.client.platform.write(this.client.prefix + 'username', this.auth.username.trim());
      if (register) { this.client.registrationLogin = { username: this.auth.username.trim(), password: this.auth.password.trim() }; this.client.platform.toast(this.t('app.register.success')); this.navigate('/auth/login', true) }
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
        const ids: number[] = this.sheet.ids;
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
      this.sheets = []; this.selected = []; this.selection = false; this.client.platform.toast(this.t(remove ? 'deleteSuccess' : 'saveSuccess')); await this.load(); void this.countMessages();
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
    try { await this.client.request('/msg', { method: 'POST', headers: { 'x-idempotent': this.idempotency }, body: { title: this.form.title.trim(), content: this.form.content.trim(), type: this.form.type, scope: this.form.scope, expired_at: expiry, ...(this.form.scope === 'targeted' ? { recipient_ids: this.form.recipient_ids } : {}) } }); this.sheets = []; this.client.platform.toast(this.t('app.msg.sent')); await this.load() }
    catch (e) { this.sheetError = this.errorMessage(e) }
    finally { this.busy = false; this.emit() }
  }
  field(key: string, label: string, type = 'input', required = false, value: unknown = this.form[key], prefix = 'form'): Field {
    const display = Array.isArray(value) ? value.map(v => this.optionLabels.get(String(v)) || String(v)).join('、') : this.optionLabels.get(String(value)) || (value === 0 ? '' : String(value ?? ''));
    return { key: `${prefix}.${key}`, label, kind: type, required, value: value ?? '', error: this.fieldError(key), placeholder: type === 'password' && this.record ? this.t('system.user.keepPassword') : this.t('system.common.enter', { field: label }), display: display || this.t('choose') };
  }
  getFormFields(): Field[] {
    if (this.sheet?.type === 'edit') {
      const fields = this.config.fields.map(f => this.field(f.key, this.record && f.editLabel ? f.editLabel : f.label, f.type.endsWith('-select') || ['action-group', 'category'].includes(f.type) ? 'picker' : ['json', 'textarea'].includes(f.type) ? 'textarea' : f.type === 'enabled' ? 'switch' : f.type, !!f.required || (!this.record && !!f.createRequired)));
      if (this.resource === 'user') { fields.push(this.field('display_name', this.t('displayName'))); if (this.record) fields.push(this.field('department', this.t('department'))) }
      return fields;
    }
    if (this.sheet?.type === 'password') return [this.field('old_password', this.t('page.profile.password.oldPassword'), 'password', true), this.field('new_password', this.t('system.fields.newPassword'), 'password', true), this.field('confirmation', this.t('page.profile.password.confirmPassword'), 'password', true)];
    if (this.sheet?.type === 'compose') return [this.field('title', this.t('app.msg.title'), 'input', true), this.field('content', this.t('app.msg.content'), 'textarea', true), ...(this.form.scope === 'targeted' ? [this.field('recipient_ids', this.t('app.msg.recipients'), 'picker', true)] : []), this.field('expired_at', this.t('app.msg.expiry'), 'input', false)];
    if (this.sheet?.type === 'operation') return this.sheet.operation === 'review' && this.form.decision === 'reject' ? [this.field('reason', this.t('system.user.reason'), 'textarea', true)] : this.sheet.operation === 'lock' && this.form.lockMode !== 'permanent' ? [this.field('lockUntil', this.t('system.user.lockedUntil'), 'input', true)] : [];
    if (this.sheet?.type === 'filters') return this.config.filters.filter((f, i) => i > 0 && f.key !== 'status').map(f => this.field(f.key, f.label, f.type === 'enabled' ? 'switch' : 'input', false, this.filters[f.key], 'filter'));
    if (this.sheet?.type === 'preferences') return ['timezone', 'year', 'company', 'companyLink', 'icp', 'icpLink'].map(key => this.field(key, this.t(key), 'input', ['timezone', 'company'].includes(key)));
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
  row(record: RecordData) {
    const identity = this.resource === 'user' ? 'username' : this.resource === 'whitelist' ? 'id' : 'name';
    const defaults: Record<ResourceKind, string[]> = { user: ['role', 'code'], role: ['word', 'action_codes'], 'user-group': ['word', 'users'], action: ['group', 'word'], dictionary: ['key'], whitelist: ['category', 'resource'] };
    const visible = this.preferences.columns[this.resource] || defaults[this.resource];
    return { id: record.id, name: text(record[identity]), initials: text(record[identity]).slice(0, 2).toUpperCase(), summary: visible.filter(k => k !== identity && k !== 'status' && k !== 'enabled').map(key => ({ key, value: this.value(record, key) })), status: record.status, statusLabel: this.value(record, 'status'), enabled: record.enabled, enabledLabel: this.value(record, 'enabled'), selected: this.selected.includes(record.id) };
  }
  snapshot() {
    const available = modules.filter(m => this.client.canMenu(`/system/${m.resource}`)).map(m => ({ ...m, label: this.t(m.key), path: `/system/${m.resource}` }));
    const filtered = available.filter(m => m.label.toLowerCase().includes(this.query.toLowerCase()));
    const s = this.sheet, record = this.record;
    let choices: any[] = [];
    if (s?.type === 'picker') choices = this.options.map(o => ({ value: String(o.value), label: o.label, selected: Array.isArray(this.form[s.field!]) ? this.form[s.field!].includes(o.value) : this.form[s.field!] === o.value, action: 'option' }));
    if (s?.type === 'density') choices = ['comfortable', 'compact'].map(value => ({ value, label: this.t(value), selected: this.preferences.density === value, action: 'density-value' }));
    if (s?.type === 'style') choices = ['grouped', 'cards'].map(value => ({ value, label: this.t(value), selected: this.preferences.style === value, action: 'style-value' }));
    if (s?.type === 'page-size') choices = [10, 20, 50].map(value => ({ value: String(value), label: String(value), selected: this.size === value, action: 'size-value' }));
    if (s?.type === 'columns') choices = this.config.columns.filter(c => !['id', this.resource === 'user' ? 'username' : 'name'].includes(c.key)).map(c => ({ value: c.key, label: c.title, selected: (this.preferences.columns[this.resource] || (this.resource === 'user' ? ['role', 'code'] : ['word'])).includes(c.key), action: 'column' }));
    const statusOptions = [{ value: 'all', label: this.t('all') }, { value: '1', label: this.t('system.status.active') }, { value: '0', label: this.t('system.status.pending') }, { value: '2', label: this.t('system.status.locked') }].map(x => ({ ...x, active: x.value === 'all' ? !this.filters.status?.length : this.filters.status?.includes(Number(x.value)) }));
    const messageRows = this.records.map(r => ({ id: r.id, title: String(r.title || ''), content: String(r.content || ''), read: !!r.read_at, date: this.date(r.published_at), type: this.t(`app.msg.${r.type}`) }));
    const authFields = this.route === '/auth/reset-password' ? [this.field('password', this.t('system.fields.newPassword'), 'password', true, this.auth.password, 'auth'), this.field('confirmation', this.t('page.profile.password.confirmPassword'), 'password', true, this.auth.confirmation, 'auth')] : [this.field('username', this.t('system.fields.username'), 'input', true, this.auth.username, 'auth'), this.field('password', this.t('system.fields.password'), 'password', true, this.auth.password, 'auth'), ...(this.route === '/auth/register' ? [this.field('confirmation', this.t('page.profile.password.confirmPassword'), 'password', true, this.auth.confirmation, 'auth')] : [])];
    const date = new Date();
    return {
      extra: Object.fromEntries(Object.entries({ approve: 'system.user.approve', reject: 'system.user.reject', until: 'system.user.lockUntil', permanent: 'system.user.permanent', unlock: 'system.user.unlock', lock: 'system.user.lock', unlockPassword: 'system.user.unlockPassword', messageType: 'app.msg.type', notice: 'app.msg.notice', system: 'app.msg.system', scope: 'app.msg.scope', targeted: 'app.msg.targeted', discardHint: 'unsavedHint', keep: 'keepEditing', discard: 'discard' }).map(([k, v]) => [k, this.t(v)])),
      native: !!this.client.platform.native, topInset: this.client.platform.topInset || 0,
      variant: this.variant, dark: this.preferences.dark, locale: this.client.locale, language: this.client.locale === 'en-US' ? 'English' : '简体中文',
      route: this.route, view: this.view, tab: this.tab, resource: this.resource, auth: this.auth, authFields, resetRequired: this.route === '/auth/reset-password', register: this.route === '/auth/register',
      l: Object.fromEntries(Object.entries(labels).map(([alias, key]) => [alias, this.t(key)])),
      title: this.view === 'list' ? this.config.title : this.view === 'messages' ? this.t(this.isSent ? 'app.msg.manage' : 'app.msg.inbox') : this.t(this.view === 'auth' ? this.route === '/auth/register' ? 'page.auth.register' : this.route === '/auth/reset-password' ? 'app.resetPassword.title' : 'page.auth.login' : this.view === 'profile' ? 'mine' : this.view === 'manage' ? 'managing' : this.view === 'security' ? 'security' : 'home'),
      subtitle: this.t(this.view === 'home' ? 'overviewHint' : this.view === 'manage' ? 'manageHint' : this.view === 'profile' ? 'profileHint' : this.view === 'auth' ? 'subtitle' : this.view === 'list' ? 'userHint' : 'securityHint'),
      today: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      user: this.client.user, initials: this.client.user?.username.slice(0, 2).toUpperCase() || 'GC', query: this.query, filters: this.filters, statusOptions,
      groups: [0, 1, 2].map((group, i) => ({ title: this.t(['accessGroup', 'configGroup', 'messageGroup'][i]), items: filtered.filter(m => m.group === group) })).filter(g => g.items.length),
      quick: available.filter(m => ['user', 'role', 'user-group', 'dictionary'].includes(m.resource)), modules: filtered,
      stats: ['active', 'pending', 'locked'].map((key, i) => ({ ...this.stats[key], label: this.t(`system.status.${key}`), status: [1, 0, 2][i] })),
      total: this.total, reviews: this.reviews.map(r => ({ id: r.id, name: r.username, initials: r.username?.slice(0, 2).toUpperCase(), role: r.role?.name || this.t('system.status.pending') })), reviewsLoading: this.stats.pending.loading,
      recent: this.recent.map(r => ({ id: r.id, name: r.username, initials: r.username?.slice(0, 2).toUpperCase(), date: this.date(r.created_at) })), recentLoading: this.recentLoading, recentError: this.recentError,
      canUsers: this.client.can('user', 'read'), canCreate: this.can('create'), canUpdate: this.can('update'), canDelete: this.can('delete'), canRead: this.can('read'),
      rows: this.records.map(r => this.row(r)), totalLabel: this.t('recordCount', { count: this.total }), page: this.page, size: this.size, pages: Math.max(1, Math.ceil(this.total / this.size)), pageLabel: this.t('currentPage', { page: this.page, total: Math.max(1, Math.ceil(this.total / this.size)) }),
      selection: this.selection, selectedCount: this.selected.length, selectedLabel: this.t('selectCount', { count: this.selected.length }), density: this.preferences.density, listStyle: this.preferences.style,
      searchFocus: this.searchFocus, suggestions: this.suggestions, loading: this.loading, booting: this.booting, busy: this.busy, error: this.error,
      sheetError: this.sheetError, sheet: s ? { ...s, title: this.t(s.title) } : null, fields: this.getFormFields(), choices, optionsLoading: this.optionsLoading, optionsQuery: this.optionsQuery, optionsMore: this.optionsPage * 30 < this.optionsTotal,
      details: record && ['detail', 'profile'].includes(s?.type || '') ? (s?.type === 'profile' ? [{ key: 'username', title: this.t('system.fields.username') }, { key: 'code', title: this.t('system.fields.userCode') }, { key: 'role', title: this.t('system.fields.role') }] : this.config.columns).map(c => ({ key: c.key, label: c.title, value: this.value(record, c.key), tags: this.value(record, c.key).split('\n').filter(Boolean), json: ['metadata', 'value'].includes(c.key) })) : [],
      recordName: record ? text(record.username || record.name || record.id) : '', recordStatus: record?.status, hasPasswordLock: !!record?.metadata?.password_change_failures,
      form: this.form, verificationError: this.fieldError('verification'), sliderPosition: this.sliderPosition, sliderBusy: this.sliderBusy, sliderError: this.sliderError, proof: !!this.proof,
      captcha: this.captcha ? { ...this.captcha, points: this.captchaPoints.map((p, index) => ({ left: p.x / this.captcha!.width * 100, top: p.y / this.captcha!.height * 100, label: index + 1 })) } : null, captchaVerified: this.captchaVerified,
      unread: this.unread, messageRead: this.messageRead, messageRows, isSent: this.isSent, canSend: this.client.canMsg('send'), canDeleteMessage: !this.isSent || this.client.canMsg('delete'), message: s?.type === 'message' ? { title: record?.title || '', content: record?.content || '', date: this.date(record?.published_at), type: this.t(`app.msg.${record?.type}`) } : null,
      footer: this.preferences.footer && this.preferences.copyright, copyright: `Copyright © ${this.preferences.year} ${this.preferences.company}`, companyLink: this.preferences.companyLink, icp: this.preferences.icp, preferences: this.preferences,
      dock: [{ key: 'home', icon: 'home', label: this.t('home'), path: '/dashboard/overview' }, { key: 'manage', icon: 'grid', label: this.t('manage'), path: '/dashboard/overview?tab=manage' }, { key: 'security', icon: 'shield', label: this.t('security'), path: '/dashboard/overview?tab=security' }, { key: 'profile', icon: 'user', label: this.t('mine'), path: '/profile' }].map(d => ({ ...d, active: d.key === this.view || (d.key === 'manage' && ['list', 'messages'].includes(this.view)) })),
    };
  }
  async action(name: string, value = '') {
    if (this.busy && !['close'].includes(name)) return;
    try {
      switch (name) {
        case 'navigate': this.navigate(value); return;
        case 'back': if (this.sheets.length) this.close(); else this.navigate('/dashboard/overview?tab=manage'); return;
        case 'close': this.close(); return;
        case 'discard': { const destination = this.sheet?.destination; this.sheets.pop(); this.initial = { ...this.form }; if (destination) this.navigate(destination, true); else this.close(true); return }
        case 'keep-editing': this.close(true); return;
        case 'refresh': await this.load(); return;
        case 'search': this.searchFocus = false; clearTimeout(this.blurTimer); this.page = 1; this.rememberSearch(); await this.load(); return;
        case 'suggestion': this.query = value; this.searchFocus = false; clearTimeout(this.blurTimer); this.suggestRevision++; this.rememberSearch(); await this.load(); return;
        case 'clear-history': this.client.platform.write(this.client.prefix + `history:${this.resource}`, []); this.suggestions = []; break;
        case 'reset-search': this.filters = {}; this.query = ''; this.page = 1; this.searchFocus = false; await this.load(); return;
        case 'status': this.filters.status = value === 'all' ? undefined : [Number(value)]; this.page = 1; await this.load(); return;
        case 'home-status': this.navigate(`/system/user?status=${value}`); return;
        case 'home-record': this.navigate(`/system/user?username=${encodeURIComponent(value)}`); return;
        case 'filters': this.push({ type: 'filters', title: 'filterTitle' }); return;
        case 'apply-filters': this.close(true); this.page = 1; await this.load(); return;
        case 'prev': if (this.page > 1) { this.page--; await this.load() } return;
        case 'next': if (this.page * this.size < this.total) { this.page++; await this.load() } return;
        case 'detail': if (this.selection) { const id = Number(value); this.selected = this.selected.includes(id) ? this.selected.filter(x => x !== id) : [...this.selected, id] } else { await this.detail(Number(value)); return } break;
        case 'select': this.selection = !this.selection; this.selected = []; break;
        case 'select-all': this.selected = this.selected.length === this.records.length ? [] : this.records.map(r => r.id); break;
        case 'create': await this.edit(true); return;
        case 'edit': await this.edit(); return;
        case 'save': await this.save(); return;
        case 'picker': await this.openOptions(value.replace(/^form\./, '')); return;
        case 'option': this.selectOption(value); return;
        case 'options-more': await this.loadOptions(false); return;
        case 'options-retry': await this.loadOptions(true); return;
        case 'delete': this.push({ type: 'operation', title: this.isSent ? 'app.msg.deleteGlobalConfirm' : 'deleteConfirm', operation: 'delete', ids: this.selected.length ? [...this.selected] : [this.record?.id] }); return;
        case 'review': case 'lock-user': case 'unlock-user': case 'unlock-password':
          this.form = { decision: 'approve', reason: '', lockMode: 'until', lockUntil: this.date(Date.now() + 86400000) };
          this.push({ type: 'operation', title: 'operation', operation: { review: 'review', 'lock-user': 'lock', 'unlock-user': 'unlock', 'unlock-password': 'unlockPassword' }[name] }); return;
        case 'operate': await this.operate(); return;
        case 'decision': this.form.decision = value; break;
        case 'lock-mode': this.form.lockMode = value; break;
        case 'tools': case 'settings': case 'density': case 'columns': case 'style': case 'page-size': this.push({ type: name, title: name === 'columns' ? 'fields' : name === 'tools' ? 'more' : name === 'page-size' ? 'pageSize' : name }); return;
        case 'density-value': this.preferences.density = value; this.persist(); this.close(true); return;
        case 'style-value': this.preferences.style = value; this.persist(); this.close(true); return;
        case 'size-value': this.size = Number(value); this.page = 1; this.close(true); await this.load(); return;
        case 'column': { const cols = this.preferences.columns[this.resource] || ['role', 'code']; this.preferences.columns[this.resource] = cols.includes(value) ? cols.filter(x => x !== value) : [...cols, value]; this.persist(); break }
        case 'theme': this.preferences.dark = !this.preferences.dark; this.persist(); break;
        case 'language': this.client.locale = this.client.locale === 'zh-CN' ? 'en-US' : 'zh-CN'; this.client.platform.write(this.client.prefix + 'locale', this.client.locale); break;
        case 'preferences': this.form = { ...this.preferences }; this.initial = { ...this.form }; this.push({ type: 'preferences', title: 'copyright' }); return;
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
        case 'lock': await this.client.logout(); this.navigate('/auth/login', true); return;
        case 'login': await this.login(); return;
        case 'refresh-captcha': await this.refreshCaptcha(); return;
        case 'message-filter': this.messageRead = value; this.page = 1; await this.load(); return;
        case 'read-all': if (!this.isSent) { await this.client.request('/msg/inbox/read-all', { method: 'POST' }); await this.load(); await this.countMessages() } return;
        case 'compose': await this.compose(); return;
        case 'send': await this.sendMessage(); return;
        case 'message-type': this.form.type = value; break;
        case 'message-scope': this.form.scope = value; break;
      }
    } catch (e) { if (this.sheet) this.sheetError = this.errorMessage(e); else this.error = this.errorMessage(e) }
    this.emit();
  }
}
