export interface Response { status: number; data: any }
export interface Platform {
  native?: boolean;
  topInset?: number;
  theme?(dark: boolean): void;
  request(url: string, options: { method: string; data?: unknown; headers: Record<string, string> }): Promise<Response>;
  read(key: string): unknown;
  write(key: string, value: unknown): void;
  random(length: number): Promise<Uint8Array>;
  navigate(url: string): void;
  title(value: string): void;
  toast(value: string): void;
}
export interface MiniConfig { apiBase: string; variant: 'ant' | 'tdesign' | 'wot' }
export const ROUTES = ['/dashboard/overview', '/dashboard/workspace', '/system/user', '/system/role', '/system/user-group', '/system/action', '/system/dictionary', '/system/whitelist', '/system/msg', '/msg/inbox', '/profile', '/auth/login', '/auth/register', '/auth/reset-password'] as const;
export function pageURL(route: string): string {
  const [path, query] = route.split('?');
  if (!(ROUTES as readonly string[]).includes(path)) throw new Error('Unknown application route');
  return `/pages${path}/index${query ? `?${query}` : ''}`;
}
export function createNativePlatform(api: any): Platform {
  return {
    native: true,
    theme: dark => { api.setNavigationBarColor?.({ frontColor: dark ? '#ffffff' : '#000000', backgroundColor: dark ? '#1c1c24' : '#ffffff' }) },
    topInset: api.getWindowInfo?.().statusBarHeight || 24,
    request: (url, options) => new Promise((resolve, reject) => api.request({ url, method: options.method, data: options.data, header: options.headers, timeout: 20000, success: (r: any) => resolve({ status: r.statusCode, data: r.data }), fail: reject })),
    read: key => { try { return api.getStorageSync(key) } catch { return undefined } },
    write: (key, value) => { if (value === undefined) api.removeStorageSync(key); else api.setStorageSync(key, value) },
    random: length => new Promise((resolve, reject) => {
      // Fail closed. Password encryption must never fall back to Math.random.
      const crypto = typeof wx !== 'undefined' ? wx : api;
      const fn = crypto.getRandomValues?.bind(crypto) || crypto.getUserCryptoManager?.().getRandomValues?.bind(crypto.getUserCryptoManager());
      if (!fn) { reject(new Error('Cryptographic randomness is unavailable. Update WeChat.')); return }
      fn({ length, success: (r: any) => {
        const bytes = new Uint8Array(r.randomValues);
        bytes.length === length ? resolve(bytes) : reject(new Error('Invalid random bytes'));
      }, fail: reject });
    }),
    navigate: url => api.redirectTo({ url }),
    title: title => api.setNavigationBarTitle({ title }),
    toast: title => api.showToast({ title, icon: 'none' }),
  };
}
