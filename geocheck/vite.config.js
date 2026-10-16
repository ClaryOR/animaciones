import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La cámara y el GPS solo funcionan en HTTPS o localhost.
export default defineConfig(async () => {
  const plugins = [react()];
  if (process.env.HTTPS) {
    const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
    plugins.push(basicSsl());
  }
  return { plugins, server: { host: true } };
});