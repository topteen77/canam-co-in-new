import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        host: true,
        port: Number(env.FRONTEND_PORT) || 3001,
        strictPort: false,
        allowedHosts: ['canam.co.in', '10.0.0.118', 'localhost', '127.0.0.1'],
        proxy: {
          '/api': {
            target: `http://${env.BACKEND_HOST || '127.0.0.1'}:${env.PORT || 5002}`,
            changeOrigin: true,
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          input: {
            main: './index.html'
          }
        }
      }
    };
});
