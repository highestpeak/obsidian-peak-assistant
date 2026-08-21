import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build, type Plugin } from 'esbuild';

// CJS keeps this build helper usable from both esbuild.config.mjs and the
// repository's CommonJS test runner.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
	gracefulFsQueueDataPropertyPlugin,
	patchGracefulFsQueuePublisher,
} = require('../scripts/build/graceful-fs-queue-patch.cjs') as {
	gracefulFsQueueDataPropertyPlugin: Plugin;
	patchGracefulFsQueuePublisher: (source: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
	patchReactReduxContextRegistry,
	reactReduxLocalContextPlugin,
} = require('../scripts/build/react-redux-context-patch.cjs') as {
	patchReactReduxContextRegistry: (source: string) => string;
	reactReduxLocalContextPlugin: Plugin;
};

const ROOT = process.cwd();

function source(relativePath: string): string {
	return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function testProductionBundleBoundaries(): void {
	const config = source('esbuild.config.mjs');
	const runtime = source('src/app/sheet/PeakSheetRuntime.ts');
	const main = source('main.ts');
	const loaderManager = source('src/core/document/loader/helper/DocumentLoaderManager.ts');
	const docxLoader = source('src/core/document/loader/DocxDocumentLoader.ts');
	const pptxLoader = source('src/core/document/loader/PptxDocumentLoader.ts');
	const workerClient = source('src/app/platform/worker/DisposableWorkerTaskClient.ts');
	const evalMemoryProbe = source('scripts/measure-eval-mem.mjs');

	assert.match(config, /gracefulFsQueueDataPropertyPlugin/);
	assert.match(config, /reactReduxLocalContextPlugin/);
	assert.match(config, /react-redux\/dist\/react-redux\.mjs/);
	assert.match(config, /lucide-react\/dist\/esm\/lucide-react\.js/);
	assert.doesNotMatch(config, /lucide-react\/dist\/cjs\/lucide-react\.js/);
	assert.doesNotMatch(runtime, /^import \{ parsePeakSheetXlsx \}/m);
	assert.doesNotMatch(runtime, /^import \{ exportPeakSheetXlsx \}/m);
	assert.doesNotMatch(runtime, /import\('@\/service\/sheet\/(?:import|export)\/PeakSheetXlsx/);
	assert.match(runtime, /requireXlsxRuntime\(\)\.preview/);
	assert.match(runtime, /requireXlsxRuntime\(\)\.export/);
	assert.match(runtime, /xlsxRuntime\?\.dispose\(\)/);
	assert.match(main, /PeakSheetXlsxWorkerClient/);
	assert.match(config, /PeakSheetXlsxWorker\.ts/);
	assert.match(config, /peak-sheet-xlsx-worker\.js/);
	assert.match(config, /DocxTextWorker\.ts/);
	assert.match(config, /document-docx-text-worker\.js/);
	assert.match(config, /PptxTextWorker\.ts/);
	assert.match(config, /document-pptx-text-worker\.js/);
	assert.match(config, /DIAGNOSTIC_BUNDLE_DIRECTORY/);
	assert.match(config, /diagnostic main bundle written outside production artifacts/);
	assert.match(config, /mainOutput\?\.imports/);
	assert.match(config, /imported\.external/);
	assert.match(config, /main\.js output metadata is missing/);
	assert.match(config, /Heavy parser packages left as external imports/);
	assert.match(evalMemoryProbe, /PEAK_EVAL_BUNDLE/);
	assert.match(evalMemoryProbe, /bundle-diagnostics/);
	assert.doesNotMatch(docxLoader, /from 'mammoth'/);
	assert.doesNotMatch(pptxLoader, /from 'officeparser'/);
	assert.match(loaderManager, /binaryTextExtractor\?\.dispose\(\)/);
	assert.match(main, /BinaryDocumentTextWorkerClient/);
	assert.match(workerClient, /taskTail/);
	assert.match(workerClient, /worker\.terminate\(\)\.then/);
}

function testReactReduxPatchIsFailLoud(): void {
	const original = source('node_modules/react-redux/dist/react-redux.mjs');
	const patched = patchReactReduxContextRegistry(original);
	assert.match(patched, /const peakBundleContextMap = \/\* @__PURE__ \*\/ new Map\(\);/);
	assert.match(patched, /const contextMap = peakBundleContextMap;/);
	assert.doesNotMatch(patched, /gT\[ContextKey\] \?\?=/);
	assert.throws(
		() => patchReactReduxContextRegistry(patched),
		/react-redux context registry pattern not found/,
	);
}

async function testReactReduxBundleDoesNotPublishContextMap(): Promise<void> {
	const directory = mkdtempSync(path.join(tmpdir(), 'peak-react-redux-memory-'));
	try {
		const entry = path.join(directory, 'entry.mjs');
		const output = path.join(directory, 'bundle.cjs');
		const reactReduxPath = path.join(ROOT, 'node_modules/react-redux/dist/react-redux.mjs');
		writeFileSync(entry, `import ${JSON.stringify(reactReduxPath)};`);
		await build({
			entryPoints: [entry],
			bundle: true,
			define: { 'process.env.NODE_ENV': '"production"' },
			format: 'cjs',
			platform: 'node',
			outfile: output,
			plugins: [reactReduxLocalContextPlugin],
			logLevel: 'silent',
		});
		const probe = path.join(directory, 'probe.cjs');
		writeFileSync(probe, [
			`const key = Symbol.for('react-redux-context');`,
			`delete globalThis[key];`,
			`const bundle = ${JSON.stringify(output)};`,
			`require(bundle);`,
			`delete require.cache[require.resolve(bundle)];`,
			`require(bundle);`,
			`if (globalThis[key] !== undefined) process.exit(2);`,
		].join('\n'));
		execFileSync(process.execPath, [probe], { stdio: 'pipe' });
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function testGracefulFsPatchIsFailLoud(): void {
	const original = source('node_modules/graceful-fs/graceful-fs.js');
	const patched = patchGracefulFsQueuePublisher(original);
	assert.match(patched, /Object\.defineProperty\(context, gracefulQueue, \{\s*value: queue\s*\}\)/);
	assert.doesNotMatch(patched, /Object\.defineProperty\(context, gracefulQueue, \{\s*get:/);
	assert.throws(
		() => patchGracefulFsQueuePublisher(patched),
		/graceful-fs queue publisher pattern not found/,
	);
}

async function testBundledDescriptorDoesNotCaptureAGetter(): Promise<void> {
	const directory = mkdtempSync(path.join(tmpdir(), 'peak-graceful-fs-memory-'));
	try {
		const entry = path.join(directory, 'entry.cjs');
		const output = path.join(directory, 'bundle.cjs');
		const gracefulFsPath = path.join(ROOT, 'node_modules/graceful-fs/graceful-fs.js');
		writeFileSync(entry, [
			`require(${JSON.stringify(gracefulFsPath)});`,
			`const descriptor = Object.getOwnPropertyDescriptor(globalThis, Symbol.for('graceful-fs.queue'));`,
			`if (!descriptor || typeof descriptor.get !== 'undefined' || !Array.isArray(descriptor.value)) process.exit(2);`,
		].join('\n'));
		await build({
			entryPoints: [entry],
			bundle: true,
			format: 'cjs',
			platform: 'node',
			outfile: output,
			plugins: [gracefulFsQueueDataPropertyPlugin],
			logLevel: 'silent',
		});
		execFileSync(process.execPath, [output], { stdio: 'pipe' });
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

async function run(): Promise<void> {
	testProductionBundleBoundaries();
	testGracefulFsPatchIsFailLoud();
	testReactReduxPatchIsFailLoud();
	await testBundledDescriptorDoesNotCaptureAGetter();
	await testReactReduxBundleDoesNotPublishContextMap();
	console.log('plugin bundle memory boundary: passed');
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
