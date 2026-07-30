import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const packageJson = JSON.parse(
  readFileSync(resolve(currentDirectory, 'package.json'), 'utf-8'),
) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
});
