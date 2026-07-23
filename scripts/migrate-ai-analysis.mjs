/**
 * One-shot migration: legacy AI-Analysis markdown reports → JSON records.
 *
 * Why: 1139 machine-generated .md reports in the vault made Obsidian's
 * startup metadata indexing balloon ~2GB (renderer OOM white-screen, see
 * docs/recurring-pitfalls.md §9). The new persistence medium is one .json
 * per analysis under ChatFolder/DataStore/ai-analysis/ (non-.md = zero
 * Obsidian index cost), record shape matching AiAnalysisJsonStore:
 *   { formatVersion: 1, savedAt, query, webEnabled, title?, snapshot }
 *
 * Usage:
 *   node scripts/migrate-ai-analysis.mjs <src-dir-of-md> <vault-ChatFolder>
 * e.g.
 *   node scripts/migrate-ai-analysis.mjs \
 *     /Users/zhangjike/code/my-code/mobius-highestpeak-kb-quarantine/AI-Analysis \
 *     /Users/zhangjike/code/my-code/mobius-highestpeak-kb/ChatFolder
 *
 * Unparseable files are preserved verbatim as .md.txt under
 * DataStore/ai-analysis/legacy-md/ so nothing is ever lost.
 */
import esbuild from 'esbuild';
import alias from 'esbuild-plugin-alias';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const [srcDir, chatFolder] = process.argv.slice(2);
if (!srcDir || !chatFolder) {
	console.error('usage: node scripts/migrate-ai-analysis.mjs <src-dir-of-md> <vault-ChatFolder>');
	process.exit(1);
}
const outDir = path.join(chatFolder, 'DataStore', 'ai-analysis');
const legacyDir = path.join(outDir, 'legacy-md');
fs.mkdirSync(outDir, { recursive: true });

// Compile the parser + snapshot converter to a temp CJS bundle.
const entrySrc = `
export { parse } from '@/core/storage/vault/search-docs/analysis-markdown-parser';
export { toCompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/AiSearchAnalysisDoc';
`;
const entryPath = path.join(__dirname, '.migrate-entry.ts');
const bundlePath = path.join(__dirname, '.migrate-bundle.cjs');
fs.writeFileSync(entryPath, entrySrc);
await esbuild.build({
	entryPoints: [entryPath],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: bundlePath,
	external: ['obsidian', 'electron'],
	plugins: [alias({ '@': path.join(repoRoot, 'src') })],
	logLevel: 'silent',
});
const { parse, toCompletedAnalysisSnapshot } = require(bundlePath);

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'));
let ok = 0;
let failed = 0;
const failures = [];

for (const file of files) {
	const mdPath = path.join(srcDir, file);
	const md = fs.readFileSync(mdPath, 'utf8');
	const base = file.replace(/\.md$/, '');
	const tsMatch = base.match(/^(\d{10,})/);
	const createdTs = tsMatch ? Number(tsMatch[1]) : fs.statSync(mdPath).mtimeMs;
	try {
		const docModel = parse(md);
		const snapshot = toCompletedAnalysisSnapshot(docModel, createdTs);
		const record = {
			formatVersion: 1,
			savedAt: createdTs,
			query: docModel.query ?? '',
			webEnabled: Boolean(docModel.webEnabled),
			title: docModel.title || undefined,
			snapshot,
		};
		fs.writeFileSync(path.join(outDir, `${base}.json`), JSON.stringify(record));
		ok++;
	} catch (e) {
		failed++;
		failures.push(`${file}: ${e?.message ?? e}`);
		fs.mkdirSync(legacyDir, { recursive: true });
		fs.copyFileSync(mdPath, path.join(legacyDir, `${file}.txt`));
	}
}

fs.rmSync(entryPath, { force: true });
fs.rmSync(bundlePath, { force: true });

console.log(`migrated ${ok}/${files.length} → ${outDir}`);
if (failed) {
	console.log(`${failed} unparseable, preserved verbatim in ${legacyDir}:`);
	for (const f of failures.slice(0, 10)) console.log('  ' + f);
	if (failures.length > 10) console.log(`  … and ${failures.length - 10} more`);
}
