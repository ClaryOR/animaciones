const KEY = 'geocheck:registros';

// DEMO: guarda metadatos en localStorage, no la foto. Sustituir por una API segura
// antes de producción; el servidor debe validar PIN, ubicación y evidencia.
export async function submitAttendance(record) {
  const { photo, ...meta } = record;
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    list.unshift(meta);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    // El almacenamiento puede estar deshabilitado.
  }
  return { ok: true };
}