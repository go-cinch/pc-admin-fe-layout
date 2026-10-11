import type { Client } from './client';
import type { Platform } from './platform';
import type { FilterDefinition, ResourceConfig } from './resources';
import type { ResourceKind } from './types';

export interface FilterSuggestion {
  value: string;
  parts: { value: string; match: boolean }[];
  history: boolean;
}

/** Match the reference search hierarchy; a whitelist searches resource rules first. */
export function primaryFilter(config: ResourceConfig): FilterDefinition {
  return config.filters.find(field => field.type === 'input')
    || config.filters.find(field => field.key === 'resource') || config.filters[0];
}

function decodeQuery(value: string): string {
  try { return decodeURIComponent(value.replace(/\+/g, ' ')) } catch { return value }
}

/** Native route options are already decoded; string URLs are decoded once here. */
export function parseFilterQuery(query: Record<string, string | string[]> | string, definitions: FilterDefinition[]): Record<string, unknown> {
  const params: Record<string, string[]> = {};
  if (typeof query === 'string') {
    for (const pair of query.replace(/^[^?]*\?/, '').replace(/^\?/, '').split('&')) {
      if (!pair) continue;
      const at = pair.indexOf('='), key = decodeQuery(at < 0 ? pair : pair.slice(0, at));
      const value = decodeQuery(at < 0 ? '' : pair.slice(at + 1));
      (params[key] ||= []).push(value);
    }
  } else {
    for (const [key, value] of Object.entries(query)) params[key] = Array.isArray(value) ? value : [value];
  }
  const filters: Record<string, unknown> = {};
  for (const field of definitions) {
    const values = (params[field.key] || []).filter(Boolean);
    if (!values.length) continue;
    if (field.type === 'status-multi-select') {
      const statuses = [...new Set(values.flatMap(value => value.split(',')).map(Number).filter(value => [0, 1, 2].includes(value)))];
      if (statuses.length) filters[field.key] = statuses;
    } else if (field.type === 'input-multi-select') {
      const items = [...new Set(values.flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean))];
      if (items.length) filters[field.key] = items;
    } else if (field.type === 'category') {
      const category = Number(values[0]);
      if ([0, 1].includes(category)) filters[field.key] = category;
    } else filters[field.key] = values[0];
  }
  return filters;
}

export function normalizeFilterText(resource: ResourceKind, key: string, value: unknown): string {
  const text = String(value ?? '').trim();
  return ['user', 'action'].includes(resource) && key === 'code' ? text.toUpperCase() : text;
}

/** Empty draft text must not clear values already selected by a multi-value filter. */
export function pickFilterValue(resource: ResourceKind, field: FilterDefinition, current: unknown, draft: string): string | string[] {
  const value = normalizeFilterText(resource, field.key, draft);
  if (field.type !== 'input-multi-select') return value;
  return [...new Set([
    ...(Array.isArray(current) ? current.map(item => String(item)) : []),
    ...value.split(',').map(item => normalizeFilterText(resource, field.key, item)).filter(Boolean),
  ])];
}

type Storage = Pick<Platform, 'read' | 'write'>;
export function filterHistoryKey(prefix: string, resource: ResourceKind, fieldKey: string): string {
  return `${prefix}filter-history:${resource}:${fieldKey}`;
}

export function readFilterHistory(platform: Storage, prefix: string, resource: ResourceKind, fieldKey: string): string[] {
  const value = platform.read(filterHistoryKey(prefix, resource, fieldKey));
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string')
    .map(item => normalizeFilterText(resource, fieldKey, item)).filter(Boolean))].slice(0, 10);
}

export function saveFilterHistory(platform: Storage, prefix: string, resource: ResourceKind, fieldKey: string, value: string): string[] {
  const normalized = normalizeFilterText(resource, fieldKey, value);
  const history = readFilterHistory(platform, prefix, resource, fieldKey);
  if (!normalized) return history;
  const next = [normalized, ...history.filter(item => item !== normalized)].slice(0, 10);
  platform.write(filterHistoryKey(prefix, resource, fieldKey), next);
  return next;
}

/** Omitting the value clears this field's history, without touching other fields. */
export function removeFilterHistory(platform: Storage, prefix: string, resource: ResourceKind, fieldKey: string, value?: string): string[] {
  const next = value === undefined ? [] : readFilterHistory(platform, prefix, resource, fieldKey).filter(item => item !== value);
  platform.write(filterHistoryKey(prefix, resource, fieldKey), next.length ? next : undefined);
  return next;
}

/** Query only through the public request client and preserve multiline rule values. */
export async function queryFilterSuggestions(client: Pick<Client, 'list' | 'can'>, resource: ResourceKind, field: FilterDefinition, query: string): Promise<string[]> {
  const target = field.suggestion?.resource || resource, key = field.suggestion?.fieldKey || field.key;
  const value = normalizeFilterText(resource, field.key, query);
  if (!value || !client.can(target, 'read')) return [];
  const result = await client.list(target, { p: 1, s: 20, [key]: value });
  return [...new Set(result.items.flatMap(row => typeof row[key] === 'string' ? [String(row[key])] : []))];
}

export function presentSuggestions(values: string[], query: string, history: string[] = []): FilterSuggestion[] {
  const needle = query.trim().toLowerCase();
  return [...new Set([...values, ...history])].slice(0, 15).map(value => {
    const at = needle ? value.toLowerCase().indexOf(needle) : -1;
    const parts = at < 0 ? [{ value, match: false }] : [
      { value: value.slice(0, at), match: false },
      { value: value.slice(at, at + needle.length), match: true },
      { value: value.slice(at + needle.length), match: false },
    ];
    return { value, parts, history: history.includes(value) };
  });
}
