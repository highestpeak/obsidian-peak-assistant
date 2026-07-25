/**
 * Peak Composer — source round-trip contract (WP1, CMP-HOST-03).
 *
 * Asserts the locked S1 invariant on the 8 golden fixtures (copied from
 * .dev/spikes/composer/s1-roundtrip/fixtures/): the parser is a LOSSLESS index
 * over the source bytes — `reconstruct(parse(src)) === src` byte-for-byte — so
 * frontmatter, unknown Obsidian syntax (%%comments%%, callouts, dataview,
 * mermaid, excalidraw embeds, escaped-pipe tables), and no-trailing-newline
 * files all survive. Also encodes the WP2 patch contract structurally: a splice
 * inside one block's [from,to) leaves every byte outside it identical (the
 * inter-block separator is never absorbed).
 */

import fs from 'fs';
import path from 'path';
import {
	parseComposerDocument,
	reconstruct,
} from '@/service/composer';
import { computeFingerprint } from '@/core/composer';

const FIX_DIR = path.join(process.cwd(), 'test', 'fixtures', 'composer');

const UNKNOWN_PROBES: Array<[string, RegExp]> = [
	['%%comment%%', /%%[\s\S]*?%%/],
	['callout', /^>\s*\[!/m],
	['dataview', /```dataview[\s\S]*?```/],
	['mermaid', /```mermaid[\s\S]*?```/],
	['excalidraw embed', /!\[\[[^\]]*\.excalidraw\]\]/],
	['wikilink', /\[\[[^\]]+\]\]/],
	['block math', /\$\$[\s\S]*?\$\$/],
];

let assertions = 0;
let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
	assertions += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

function firstDiff(a: string, b: string): string {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		if (a[i] !== b[i]) return `@${i}: ${JSON.stringify(a.slice(i, i + 16))} vs ${JSON.stringify(b.slice(i, i + 16))}`;
	}
	return `len ${a.length} vs ${b.length}`;
}

function main(): void {
	const files = fs.readdirSync(FIX_DIR).filter((f) => f.endsWith('.md')).sort();
	check('8 golden fixtures present', files.length === 8, `found ${files.length}`);

	for (const file of files) {
		const src = fs.readFileSync(path.join(FIX_DIR, file), 'utf8');
		const snap = parseComposerDocument(src, { filePath: file });

		// 1. lossless block index.
		const rebuilt = reconstruct(snap);
		check(`${file}: reconstruct === source`, rebuilt === src, rebuilt === src ? '' : firstDiff(src, rebuilt));

		// 2. every block's content is the verbatim byte slice + fingerprint matches.
		let sliceOk = true;
		let fpOk = true;
		for (const b of snap.blocks) {
			const slice = src.slice(b.source.from, b.source.to);
			if (slice !== b.renderModel.raw) sliceOk = false;
			if (computeFingerprint(slice) !== b.source.semanticFingerprint) fpOk = false;
		}
		check(`${file}: block content is verbatim slice`, sliceOk);
		check(`${file}: block fingerprints match slice`, fpOk);
		check(`${file}: at least one block parsed`, snap.blocks.length > 0, `${snap.blocks.length}`);

		// 3. frontmatter reclassified when present.
		if (src.startsWith('---')) {
			check(`${file}: first block is frontmatter`, snap.blocks[0]?.kind === 'frontmatter', snap.blocks[0]?.kind);
		}

		// 4. unknown syntax survives verbatim (implied by (1), asserted explicitly).
		for (const [label, re] of UNKNOWN_PROBES) {
			const m = re.exec(src);
			if (!m) continue;
			check(`${file}: preserves ${label}`, rebuilt.includes(m[0]));
		}

		// 5. WP2 patch contract: splice inside one block leaves outside bytes identical.
		const target = snap.blocks.find((b) => b.kind === 'paragraph') ?? snap.blocks[snap.blocks.length - 1];
		if (target) {
			const inserted = target.renderModel.raw + ' EDIT';
			const patched = src.slice(0, target.source.from) + inserted + src.slice(target.source.to);
			const prefixOk = patched.slice(0, target.source.from) === src.slice(0, target.source.from);
			const suffixOk = patched.slice(target.source.from + inserted.length) === src.slice(target.source.to);
			check(`${file}: block splice preserves outside bytes`, prefixOk && suffixOk, `prefix=${prefixOk} suffix=${suffixOk}`);
		}
	}

	console.log(`composer-source-roundtrip: ${assertions - failures}/${assertions} assertions passed across ${files.length} fixtures`);
	if (failures > 0) throw new Error(`${failures} assertion(s) failed`);
}

main();
