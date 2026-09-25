import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

// La declaración responsable del art. 13 RD 1007/2023 es por versión concreta,
// y debe mostrarse en el propio sistema. La versión sale de package.json.
const appVersion = createRequire(import.meta.url)('./package.json').version;

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendProvider = env.VITE_APP_BACKEND_PROVIDER ?? 'rest';
  const apiUrl = env.VITE_APP_API_URL;

  const proxy =
    backendProvider === 'rest' && apiUrl
      ? {
          '/api': {
            target: apiUrl,
            changeOrigin: true,
          },
          '/uploads': {
            target: apiUrl,
            changeOrigin: true,
          },
        }
      : undefined;

  // Determinar si estamos en modo análisis
  const isAnalyze = mode === 'analyze';
  const isProduction = command === 'build';

  return {
    logLevel: 'error',
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy,
      host: '0.0.0.0',  // Permite acceder desde dispositivos en la red local
      // VITE_DEV_PORT permite levantar un segundo entorno local sin chocar con el 5173 por defecto
      port: Number(env.VITE_DEV_PORT) || 5173,
      strictPort: Boolean(env.VITE_DEV_PORT),
    },
    plugins: [
      react(),
      // Agregar visualizer solo en modo analizar
      isAnalyze && visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    build: {
      // Configuración optimizada para producción
      sourcemap: !isProduction,
      minify: isProduction ? 'terser' : false,
      terserOptions: isProduction ? {
        compress: {
          drop_console: true,  // Eliminar console.log en producción
          drop_debugger: true  // Eliminar debugger statements
        }
      } : undefined,
      rollupOptions: {
        output: {
          manualChunks: {
            // Separar los vendors en chunks
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': [
              '@radix-ui/react-accordion',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
            ],
            'chart-vendor': ['recharts'],
            'util-vendor': ['date-fns', 'moment']
          }
        }
      }
    },
    optimizeDeps: {
      // moment y su idioma deben pre-empaquetarse juntos: si no, en desarrollo
      // el locale se registra en otra copia de moment y las fechas salen en inglés.
      include: ['react', 'react-dom', 'react-router-dom', 'moment', 'moment/dist/locale/es'],
      exclude: []
    }
  };
});
