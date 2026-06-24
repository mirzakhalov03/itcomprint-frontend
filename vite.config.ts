import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Split long-lived vendor code into its own chunk so app updates
        // don't bust the React/Query cache. xlsx is code-split automatically
        // via the lazy ImportDialog import.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|@tanstack|zustand)/.test(id)) {
            return 'vendor';
          }
        },
      },
    },
  },
});
