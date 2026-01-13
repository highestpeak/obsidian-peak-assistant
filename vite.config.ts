import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
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
			'@lobehub/ui',
			'es-toolkit',
			'sqljs-wasm', // Virtual module created by esbuild plugin, doesn't exist as real package
		],
	},
	ssr: {
		noExternal: [],
		external: [
			'obsidian',
			'playwright',
			'playwright-core',
			'better-sqlite3',
			'@lobehub/ui',
			'es-toolkit',
			'sqljs-wasm', // Virtual module created by esbuild plugin
		],
	},
	define: {
		// Prevent playwright from being bundled
		'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
	},
});

