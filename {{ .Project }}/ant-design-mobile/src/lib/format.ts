import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);
export function dateTime(value: unknown) {
  if (typeof value === 'number')
    return dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—';
  return typeof value === 'string' ? value : '—';
}
export function parseDateTime(value: string) {
  return dayjs(value, 'YYYY-MM-DD HH:mm:ss', true);
}
export function labelFor(record: Record<string, unknown>) {
  return String(record.name || record.username || record.resource || record.key || record.id);
}
export function initials(value: string) {
  return value.slice(0, 2).toUpperCase();
}
