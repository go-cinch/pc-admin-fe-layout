import type { Platform } from './platform';
/** Account history deliberately contains usernames only, matching the 5671 UI. */
export function normalizeAccounts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean))].slice(0, 10);
}
export function readAccounts(platform: Platform, prefix: string): string[] {
  const accounts = normalizeAccounts(platform.read(prefix + 'accounts'));
  platform.write(prefix + 'accounts', accounts.length ? accounts : undefined);
  return accounts;
}
export function saveAccounts(platform: Platform, prefix: string, accounts: string[]): string[] {
  const normalized = normalizeAccounts(accounts);
  platform.write(prefix + 'accounts', normalized.length ? normalized : undefined);
  return normalized;
}
