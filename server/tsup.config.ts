import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // node_modules'dagi barcha paketlar (jumladan root'dagi @prisma/client) bundle qilinmaydi
  skipNodeModulesBundle: true,
  external: ['@prisma/client', '.prisma/client'],
});
