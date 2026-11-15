import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Gitignored dev data and caches can hold third-party or raw files; never collect tests from them.
    exclude: [...configDefaults.exclude, '.cache/**', '.dev-raw/**', '.dev-data/**'],
  },
});
