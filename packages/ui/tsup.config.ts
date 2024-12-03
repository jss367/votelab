import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    resolve: true, // Resolve path aliases in declaration files
  },
  sourcemap: true,
  clean: true,
  bundle: true, // Bundle files to simplify module resolution
  splitting: false,
  tsconfig: 'tsconfig.json', // Ensure tsup uses your tsconfig.json
  external: [],
});
