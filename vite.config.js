import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

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
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy,
      host: '0.0.0.0',  // Permite acceder desde dispositivos en la red local
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
      include: ['react', 'react-dom', 'react-router-dom'],
      exclude: []
    }
  };
});
