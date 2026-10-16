// Configuración del centro de trabajo y directorio de ejemplo.
// En producción, ambos deben venir de tu backend (nunca del cliente).
export const WORK_SITE = {
  name: 'Obra Norte',
  lat: 10.4806,
  lng: -66.9036,
  radiusM: 150,
};
export const MAX_ACCURACY_M = 100;
export const EMPLOYEES = {
  '1234': { id: 'EMP-001', name: 'Carlos Medina' },
  '4821': { id: 'EMP-002', name: 'Ana Rodríguez' },
  '7305': { id: 'EMP-003', name: 'Luis Pérez' },
};
export const SHOW_DEMO_PANEL = import.meta.env.VITE_DEMO_PANEL !== 'false';