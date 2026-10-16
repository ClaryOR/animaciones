# GeoCheck Checador

Aplicación web móvil de demostración para registrar entrada y salida con NIP, ubicación y evidencia fotográfica. Está hecha con React y Vite.

## Requisitos
- Node.js 18 o posterior
- npm
- Navegador moderno

## Ejecutar localmente
Desde una terminal, entra en la carpeta `geocheck` y ejecuta:

```bash
npm install
npm run dev
```

Abre la URL local que indique Vite (normalmente http://localhost:5173).

Para probar desde un teléfono en la misma red, ejecuta `npm run dev:https` y abre la URL HTTPS que indique Vite. Acepta el certificado de desarrollo si el navegador lo solicita. La cámara y la geolocalización requieren HTTPS o localhost y permisos del navegador.

Para generar la versión de producción: `npm run build`.

## Pruebas
NIP de demostración: `1234`, `4821`, `7305`. Abre **Modo de pruebas** para simular estar dentro o fuera del radio permitido. Usa el modo GPS real para obtener la ubicación del dispositivo.

## Configuración
Edita `src/lib/config.js` para cambiar el nombre, las coordenadas y el radio del centro de trabajo. Las coordenadas incluidas son ejemplos y deben sustituirse por las reales antes de usar la app.

## Importante: demostración, no producción
La app guarda metadatos en el almacenamiento local del navegador. No tiene backend ni validación de NIP en servidor. Los NIP de ejemplo están en el código cliente y la ubicación/cámara del navegador pueden manipularse. Antes de usarla para control de asistencia real, implementa una API segura que valide el NIP, recalcule distancias y guarde evidencias en el servidor. No utilices datos de demostración como registros laborales oficiales.
