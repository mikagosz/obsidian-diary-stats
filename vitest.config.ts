import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
	},
	resolve: {
		alias: {
			// The published `obsidian` package is types only, so anything importing it
			// as a value cannot be loaded here. See tests/obsidian-stub.ts.
			obsidian: fileURLToPath(new URL('./tests/obsidian-stub.ts', import.meta.url)),
		},
	},
});
