const KEY = 'geocheck:registros';

// DEMO local: no sustituye una API segura con almacenamiento de servidor.
export async function submitAttendance(record) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    list.unshift(record);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    throw new Error('No se pudo guardar el registro. El almacenamiento del navegador puede estar lleno; intenta retirar archivos adjuntos grandes.');
  }
  return { ok: true };
}
