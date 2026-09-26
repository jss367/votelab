import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig uses "jsx": "preserve" for Next; component tests need the
  // automatic runtime so files don't have to import React.
  esbuild: { jsx: 'automatic' },
});
