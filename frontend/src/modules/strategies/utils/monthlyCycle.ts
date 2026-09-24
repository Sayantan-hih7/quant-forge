export function monthKey(time: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit',
  }).formatToParts(time);
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}
export function nextMonth(month: string) {
  const [year, index] = month.split('-').map(Number);
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
}
export function previousMonth(month: string) {
  const [year, index] = month.split('-').map(Number);
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, '0')}`;
}
export function formatMonth(month: string, short = false) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: short ? 'short' : 'long', year: 'numeric' })
    .format(new Date(`${month}-01T00:00:00Z`));
}
export function formatSavedDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}
export function isRefreshDue(savedMonth: string, currentMonth: string) {
  return currentMonth > savedMonth;
}
