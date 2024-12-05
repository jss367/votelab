import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    resolve: true,
  },
  sourcemap: true,
  clean: true,
  bundle: true, // Bundle all code into one file
  splitting: false,
  tsconfig: 'tsconfig.json',
  external: [],
});
