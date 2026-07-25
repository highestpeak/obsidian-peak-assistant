/**
 * Peak Composer — block identity + sub-block anchors (WP1, CMP-HOST-04 / -06).
 *
 * Asserts: (1) blockId is stable within a revision (same source → same ids);
 * (2) fingerprints are the content hash of the verbatim slice; (3) editing one
 * block changes only that block's id and `matchBlocks` rematches the rest;
 * (4) list-item / table-cell / callout-body sub-block anchors carry correct
 * offsets (WP4/WP6 addressing); (5) the snapshot validates against the Zod
 * schema.
 */

import {
	matchBlocks,
	parseComposerDocument,
} from '@/service/composer';
import { computeFingerprint } from '@/core/composer';
import { ComposerDocumentSnapshotSchema } from '@/core/schemas';

const DOC = `# Title

Intro paragraph.

- alpha
- beta
  - nested

| Name | Role |
| ---- | ---- |
| Ada  | Eng  |
| Bob  | PM   |

> [!note] Principle
> Body line one.
`;

const DOC_EDITED = DOC.replace('Intro paragraph.', 'Intro paragraph, revised.');

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

function main(): void {
	const a = parseComposerDocument(DOC, { filePath: 'ident.md' });
	const b = parseComposerDocument(DOC, { filePath: 'ident.md' });

	// 1. same source → identical block ids.
	const idsA = a.blocks.map((x) => x.blockId).join('|');
	const idsB = b.blocks.map((x) => x.blockId).join('|');
	check('blockId stable within a revision', idsA === idsB);

	// 2. fingerprints hash the verbatim slice.
	const fpOk = a.blocks.every(
		(x) => x.source.semanticFingerprint === computeFingerprint(DOC.slice(x.source.from, x.source.to)),
	);
	check('fingerprint = hash(slice)', fpOk);

	// 3. editing one block changes only that id; matchBlocks rematches the rest.
	const c = parseComposerDocument(DOC_EDITED, { filePath: 'ident.md' });
	const heading = a.blocks.find((x) => x.kind === 'heading')!;
	const headingC = c.blocks.find((x) => x.kind === 'heading')!;
	check('unchanged heading keeps id across edit', heading.blockId === headingC.blockId);

	const paraA = a.blocks.find((x) => x.kind === 'paragraph')!;
	const paraC = c.blocks.find((x) => x.kind === 'paragraph')!;
	check('edited paragraph gets a new id', paraA.blockId !== paraC.blockId);

	const matches = matchBlocks(a.blocks, c.blocks);
	const headingMatch = matches.find((m) => m.newBlockId === headingC.blockId);
	check('unchanged block rematched by fingerprint', headingMatch?.reason === 'fingerprint', headingMatch?.reason);
	const paraMatch = matches.find((m) => m.newBlockId === paraC.blockId);
	check('edited block rematched by kind-ordinal', paraMatch?.oldBlockId === paraA.blockId && paraMatch?.reason === 'kind-ordinal', `${paraMatch?.reason}`);

	// 4a. list-item units.
	const list = a.blocks.find((x) => x.kind === 'list')!;
	const items = list.units.filter((u) => u.unitKind === 'list-item');
	check('list has list-item units', items.length >= 2, `${items.length}`);
	check('list-item offset slices to item text', DOC.slice(items[0].from, items[0].to).includes('alpha'));
	const nested = items.find((u) => u.parentUnitId);
	check('nested list-item carries parentUnitId', Boolean(nested) && DOC.slice(nested!.from, nested!.to).includes('nested'));

	// 4b. table-cell units with grid coords + header flag.
	const table = a.blocks.find((x) => x.kind === 'table')!;
	const cells = table.units.filter((u) => u.unitKind === 'table-cell');
	check('table has cell units', cells.length >= 6, `${cells.length}`);
	const header00 = cells.find((u) => u.row === 0 && u.col === 0);
	check('header cell (0,0) is flagged + slices to text', header00?.isHeader === true && DOC.slice(header00!.from, header00!.to).includes('Name'));
	const body = cells.find((u) => u.row === 1 && u.col === 0);
	check('body cell (1,0) slices to text', DOC.slice(body!.from, body!.to).includes('Ada'));
	check('table has row units', table.units.some((u) => u.unitKind === 'table-row'));

	// 4c. callout-body units.
	const callout = a.blocks.find((x) => x.kind === 'callout')!;
	check('callout classified', Boolean(callout));
	check('callout has body units', callout.units.some((u) => u.unitKind === 'callout-body'));

	// 5. schema validation.
	const parsed = ComposerDocumentSnapshotSchema.safeParse(a);
	check('snapshot validates against Zod schema', parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues?.[0]));

	console.log(`composer-block-identity: ${count - failures}/${count} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main();
