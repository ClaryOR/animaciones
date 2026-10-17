import { MAX_ACCURACY_M } from './config.js';

const EARTH_RADIUS_M = 6371000;
const toRad = degrees => degrees * Math.PI / 180;

export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function getOneShotPosition(maxAccuracy = MAX_ACCURACY_M) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este dispositivo no admite geolocalización.'));
    navigator.geolocation.getCurrentPosition(position => {
      const accuracy = Math.round(position.coords.accuracy);
      if (accuracy > maxAccuracy) return reject(new Error(`Precisión GPS insuficiente (±${accuracy} m). Inténtalo en un espacio abierto.`));
      resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy });
    }, error => {
      const messages = { 1: 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.', 2: 'No se pudo determinar tu ubicación.', 3: 'Se agotó el tiempo esperando al GPS.' };
      reject(new Error(messages[error.code] || 'Error al obtener la ubicación.'));
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}

export async function getPosition(mode, site) {
  if (mode === 'inside') return { lat: site.lat + 0.0003, lng: site.lng + 0.0002, accuracy: 8 };
  if (mode === 'outside') return { lat: site.lat + 0.0062, lng: site.lng - 0.004, accuracy: 8 };
  return getOneShotPosition(site?.accuracyM ?? MAX_ACCURACY_M);
}

export function evaluateArea(position, site) {
  const distance = Math.round(distanceMeters(position, site));
  return { pos: position, distance, accuracy: position.accuracy, inside: distance <= site.radiusM && position.accuracy <= (site.accuracyM ?? MAX_ACCURACY_M) };
}
