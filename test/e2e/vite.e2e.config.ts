import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Browser smoke tests: the app with a fake Firebase sign-in; /api is mocked by Playwright.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [
    react(),
    {
      name: 'fake-firebase',
      enforce: 'pre',
      resolveId(id, importer) {
        if (importer && /src[\\/]/.test(importer) && /(^|\/)lib\/firebase$|^\.\/firebase$|^\.\.\/lib\/firebase$/.test(id)) {
          return fileURLToPath(new URL('./fake-firebase.ts', import.meta.url));
        }
        return null;
      },
    },
  ],
  server: { port: 5174 },
});
