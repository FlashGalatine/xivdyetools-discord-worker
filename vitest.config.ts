import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'html', 'json'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/types/**',
                'src/locales/**',
                'src/fonts/**',
                'src/data/**',
                // WASM-dependent files that can't be easily unit tested
                'src/services/svg/renderer.ts',
                // Re-export index files (no logic, just re-exports)
                'src/handlers/modals/index.ts',
                'src/handlers/commands/index.ts',
                'src/services/image/index.ts',
                'src/services/svg/index.ts',
            ],
            thresholds: {
                global: {
                    statements: 85,
                    branches: 70,
                    functions: 85,
                    lines: 85,
                },
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
