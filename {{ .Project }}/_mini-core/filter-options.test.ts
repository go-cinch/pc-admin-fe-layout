import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getConfigs, type FilterDefinition } from './resources';
import { filterHistoryKey, parseFilterQuery, pickFilterValue, presentSuggestions, primaryFilter, queryFilterSuggestions, readFilterHistory, removeFilterHistory, saveFilterHistory } from './filter-options';

const fields: FilterDefinition[] = [
  { key: 'status', type: 'status-multi-select', label: 'Status' },
  { key: 'code', type: 'input-multi-select', label: 'Code' },
  { key: 'category', type: 'category', label: 'Category' },
  { key: 'name', type: 'input', label: 'Name' },
];

test('native filter deep links preserve numeric zero, multiple values and multiline rules', () => {
  const query = '?status=0,2&status=0&category=0&code=A,B&code=B,C&name=%E6%B5%8B%E8%AF%95';
  assert.deepEqual(parseFilterQuery(query, fields), { status: [0, 2], category: 0, code: ['A', 'B', 'C'], name: '测试' });
  assert.deepEqual(parseFilterQuery({ status: '0,2', category: '0', code: 'GET|/x\nPOST|/x', name: '100% name', tab: 'manage' }, fields), { status: [0, 2], category: 0, code: ['GET|/x\nPOST|/x'], name: '100% name' });
  assert.deepEqual(parseFilterQuery('?status=99&category=bad&code=&name=', fields), {});
});

test('whitelist searches rules while retaining category as a separate filter', () => {
  assert.equal(primaryFilter(getConfigs(key => key).whitelist).key, 'resource');
  assert.equal(primaryFilter(getConfigs(key => key).user).key, 'username');
});

test('clearing a multi-value draft preserves selected values and code values normalize', () => {
  assert.deepEqual(pickFilterValue('user', fields[1], ['ABC'], ''), ['ABC']);
  assert.deepEqual(pickFilterValue('user', fields[1], ['ABC'], ' abc, def '), ['ABC', 'DEF']);
  assert.equal(pickFilterValue('user', { key: 'username', label: '', type: 'input' }, 'before', '  Alice  '), 'Alice');
});

test('filter history is isolated by resource and field and permits individual deletion', () => {
  const values = new Map<string, unknown>();
  const storage = { read: (key: string) => values.get(key), write: (key: string, value: unknown) => { value === undefined ? values.delete(key) : values.set(key, value) } };
  saveFilterHistory(storage, 'test:', 'user', 'username', 'Alice');
  saveFilterHistory(storage, 'test:', 'user', 'code', 'abc');
  saveFilterHistory(storage, 'test:', 'user', 'code', 'def');
  saveFilterHistory(storage, 'test:', 'user', 'code', ' abc ');
  assert.deepEqual(readFilterHistory(storage, 'test:', 'user', 'code'), ['ABC', 'DEF']);
  assert.deepEqual(removeFilterHistory(storage, 'test:', 'user', 'code', 'ABC'), ['DEF']);
  removeFilterHistory(storage, 'test:', 'user', 'code');
  assert.equal(values.has(filterHistoryKey('test:', 'user', 'code')), false);
  assert.deepEqual(readFilterHistory(storage, 'test:', 'user', 'username'), ['Alice']);
});

test('remote suggestions use declared association resource and retain whole rule lines', async () => {
  const calls: unknown[] = [];
  const client = { can: () => true, list: async (resource: string, params: Record<string, unknown>) => {
    calls.push({ resource, params });
    return { items: [{ id: 1, code: 'GET|/x\nPOST|/x', created_at: 1, updated_at: 1 }, { id: 2, code: 'GET|/x\nPOST|/x', created_at: 1, updated_at: 1 }], t: 2, p: 1, s: 20 };
  } };
  const field: FilterDefinition = { key: 'action_code', label: '', type: 'input-multi-select', suggestion: { resource: 'action', fieldKey: 'code' } };
  assert.deepEqual(await queryFilterSuggestions(client, 'role', field, ' X '), ['GET|/x\nPOST|/x']);
  assert.deepEqual(calls, [{ resource: 'action', params: { p: 1, s: 20, code: 'X' } }]);
  await queryFilterSuggestions({ ...client, can: () => false }, 'role', field, 'X');
  assert.equal(calls.length, 1);
});

test('suggestions mark matches and deduplicate history without removing its delete affordance', () => {
  const rows = presentSuggestions(['Alice', 'Alicia'], 'ali', ['Alice', 'Bob']);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].history, true);
  assert.equal(rows[0].parts.filter(part => part.match).map(part => part.value).join(''), 'Ali');
  assert.deepEqual(rows[2].parts, [{ value: 'Bob', match: false }]);
});
