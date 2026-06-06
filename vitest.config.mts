import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // 'server-only' is not a real installed package — Next.js injects it at build time.
    // In tests we alias it to a no-op stub so server-only modules can be imported.
    alias: {
      'server-only': new URL('./src/test/__mocks__/server-only.ts', import.meta.url).pathname,
    },
  },
  // Note: @vitejs/plugin-react is intentionally NOT included here.
  // Vitest 4 (Vite 8) uses oxc for JSX transformation with the react-jsx preset
  // from tsconfig automatically. Adding @vitejs/plugin-react injects a React
  // Refresh HMR preamble that resets the React dispatcher in test environments,
  // causing "Invalid hook call" errors with React 19 + pnpm.

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e', 'playwright-report', 'test-results'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/generated/**',
        'src/**/*.d.ts',
      ],
      // Thresholds are declared as a soft target (no CI failure until ci-pipeline change).
      // Uncomment when project-wide average reaches 70%:
      // thresholds: {
      //   lines: 70,
      //   branches: 70,
      //   functions: 70,
      //   statements: 70,
      // },
    },
  },
});
