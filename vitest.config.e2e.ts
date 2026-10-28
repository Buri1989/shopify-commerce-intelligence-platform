import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    exclude: [...configDefaults.exclude, 'infra/**'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/e2e-setup.ts'],
  },
});
