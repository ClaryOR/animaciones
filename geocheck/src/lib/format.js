const LOCALE = 'es-VE';
export function formatDay(date) {
  return date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function formatTime(date) {
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);