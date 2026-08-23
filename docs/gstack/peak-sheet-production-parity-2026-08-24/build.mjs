import esbuild from 'esbuild';
import alias from 'esbuild-plugin-alias';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../..');
await esbuild.build({
	entryPoints: [path.join(directory, 'harness.tsx')],
	outfile: path.join(directory, 'harness.js'),
	bundle: true,
	format: 'esm',
	platform: 'browser',
	target: 'es2020',
	sourcemap: false,
	plugins: [alias({ '@': path.join(root, 'src') })],
});
console.log('Built Production Peak Sheet parity harness');
