import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(utc); dayjs.extend(timezone); dayjs.extend(customParseFormat);
export function formatDate(value: unknown, zone: string) {
  if (typeof value !== 'number') return typeof value === 'string' ? value : '—';
  return dayjs(value).isValid() ? dayjs(value).tz(zone).format('YYYY-MM-DD HH:mm:ss') : '—';
}
export function parseDate(value: string, zone: string) {
  if (!dayjs.utc(value, 'YYYY-MM-DD HH:mm:ss', true).isValid()) return NaN;
  const d = dayjs.tz(value, 'YYYY-MM-DD HH:mm:ss', zone);
  return d.format('YYYY-MM-DD HH:mm:ss') === value ? d.valueOf() : NaN;
}
export function systemTimezone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' } catch { return 'Asia/Shanghai' } }
export function text(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
