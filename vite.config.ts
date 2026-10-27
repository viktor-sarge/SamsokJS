import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, normalizePath } from 'vite';
import react from '@vitejs/plugin-react';
import { idSchema, resolveInstance } from './config/schema.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const id = idSchema.parse(process.env.SAMSOK_INSTANCE ?? 'halland');
const instancePath = resolve(root, 'instances', `${id}.json`);
if (!existsSync(instancePath)) {
  throw new Error(`Instance "${id}" does not exist: ${instancePath}`);
}
const instance = resolveInstance(
  JSON.parse(readFileSync(instancePath, 'utf8')),
  JSON.parse(readFileSync(resolve(root, 'config', 'sources.json'), 'utf8')),
);
if (instance.id !== id) {
  throw new Error(`Instance ID "${instance.id}" must match its filename "${id}.json"`);
}
const themePath = resolve(root, 'modern', 'themes', `${instance.theme}.css`);
if (!existsSync(themePath)) {
  throw new Error(`Theme "${instance.theme}" does not exist: ${themePath}`);
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

export default defineConfig({
  root: resolve(root, 'modern'),
  base: './',
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'samsok-instance',
      resolveId(source) {
        if (source === 'virtual:samsok-instance') return '\0samsok-instance';
      },
      load(source) {
        if (source !== '\0samsok-instance') return;
        return `import ${JSON.stringify(normalizePath(themePath))};
export default ${JSON.stringify(instance)};`;
      },
      transformIndexHtml(html) {
        return html.replace('__INSTANCE_TITLE__', escapeHtml(instance.branding.title));
      },
    },
  ],
  build: {
    outDir: resolve(root, 'dist', id),
    emptyOutDir: true,
  },
});
