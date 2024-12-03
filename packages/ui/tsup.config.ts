import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.tsx'], // Include all .ts and .tsx files in src
  format: ['esm'],
  dts: {
    resolve: true, // Resolve path aliases in declaration files
  },
  sourcemap: true,
  clean: true,
  bundle: false, // Do not bundle; compile each module separately
  splitting: false,
  tsconfig: 'tsconfig.json', // Ensure tsup uses your tsconfig.json
  preserveModules: true, // Preserve the directory structure in the output
  external: [],
});
