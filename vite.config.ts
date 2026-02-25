import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { Plugin } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Paths used by scripts/concat-css.mjs for streamdown isolated CSS (project root = __dirname). */
const CONCAT_SOURCE_FILES = [
	path.resolve(__dirname, 'src/styles/streamdown-shadow-host.css'),
];
const STREAMDOWN_ISOLATED_TS = path.resolve(__dirname, 'src/styles/streamdown-isolated-css.ts');

/** On change of concat sources, run concat and invalidate streamdown-isolated-css so HMR triggers. */
function streamdownCssHmrPlugin(): Plugin {
	return {
		name: 'streamdown-css-hmr',
		configureServer(server) {
			CONCAT_SOURCE_FILES.forEach((file) => server.watcher.add(file));
		},
		handleHotUpdate({ file, server }) {
			const normalized = path.normalize(file);
			if (!CONCAT_SOURCE_FILES.some((p) => path.normalize(p) === normalized)) return;
			try {
				execSync('node scripts/concat-css.mjs', { cwd: __dirname, stdio: 'pipe' });
			} catch (_e) {
				return;
			}
			const mods = server.moduleGraph.fileToModulesMap.get(STREAMDOWN_ISOLATED_TS);
			if (mods) {
				mods.forEach((m) => server.moduleGraph.invalidateModule(m));
				return Array.from(mods);
			}
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), streamdownCssHmrPlugin()],
	root: 'src/desktop',
		resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
			// Mock only libraries that cannot run in browser
			'obsidian': path.resolve(__dirname, 'src/desktop/mocks/libs/obsidian-mock.ts'), // Only exists in Obsidian environment
			'playwright': path.resolve(__dirname, 'src/desktop/mocks/libs/playwright-mock.ts'), // Browser automation tool, cannot run in browser
			'@langchain/community/document_loaders/web/playwright': path.resolve(__dirname, 'src/desktop/mocks/libs/langchain-playwright-mock.ts'), // Depends on playwright
			'crypto': path.resolve(__dirname, 'src/desktop/mocks/libs/crypto-mock.ts'), // Node.js crypto module, browser has different API
			'mammoth': path.resolve(__dirname, 'src/desktop/mocks/libs/mammoth-mock.ts'), // Node.js library, depends on Buffer
			'officeparser': path.resolve(__dirname, 'src/desktop/mocks/libs/officeparser-mock.ts'), // Node.js library, depends on Node.js APIs
		},
		extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
	},
	server: {
		port: 3000,
		open: true,
	},
	build: {
		outDir: '../../dist-desktop',
		emptyOutDir: true,
	},
	optimizeDeps: {
		exclude: [
			'obsidian',
			'playwright',
			'playwright-core',
			'better-sqlite3',
			'@langchain/community/document_loaders/web/playwright',
			'es-toolkit',
		],
	},
	ssr: {
		noExternal: [],
		external: [
			'obsidian',
			'playwright',
			'playwright-core',
			'better-sqlite3',
			'es-toolkit',
		],
	},
	define: {
		// Prevent playwright from being bundled
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
	},
});

