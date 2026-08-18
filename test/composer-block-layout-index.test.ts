import { parseComposerDocument } from '@/service/composer';
import {
	ComposerBlockLayoutIndex,
	ComposerHardPinRegistry,
} from '@/ui/view/composer/virtualization/ComposerBlockLayoutIndex';
import { DEFAULT_COMPOSER_VIRTUALIZATION_CONFIG } from '@/ui/view/composer/config/composerConfig';

let failures = 0;
let checks = 0;
function check(name: string, condition: boolean, detail = ''): void {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ` — ${detail}` : ''}`);
}

function documentWithBlocks(count: number) {
	return parseComposerDocument(
		Array.from({ length: count }, (_, index) => `Paragraph ${index}.`).join('\n\n'),
		{ filePath: 'Stress.md' },
	);
}

function main(): void {
	const snapshot = documentWithBlocks(5_000);
	const layout = new ComposerBlockLayoutIndex(DEFAULT_COMPOSER_VIRTUALIZATION_CONFIG);
	layout.update(snapshot.blocks);
	check('stress fixture has 5000 blocks', layout.length === 5_000, String(layout.length));
	const top = layout.range(0, 900);
	check('first viewport stays bounded', top.items.length < 80, String(top.items.length));
	const middle = layout.range(layout.totalHeight / 2, 900);
	check('middle viewport stays bounded', middle.items.length < 80, String(middle.items.length));
	check('window is independent of full length', middle.items.length < layout.length / 50);

	const measuredId = snapshot.blocks[100].blockId;
	const before = layout.totalHeight;
	check('measurement changes known row', layout.measure(measuredId, 400));
	check('measurement advances total height', layout.totalHeight > before);
	check('invalid measurement is ignored', !layout.measure(measuredId, 0));

	const batchAnchorId = snapshot.blocks[100].blockId;
	const beforeBatchTotal = layout.totalHeight;
	const batch = layout.measureBatch([
		[snapshot.blocks[10].blockId, 120],
		[snapshot.blocks[20].blockId, 160],
		[snapshot.blocks[200].blockId, 200],
	], layout.offsetOf(batchAnchorId) ?? 0);
	check('measurement batch applies every changed row', batch.changedCount === 3, String(batch.changedCount));
	check('measurement batch reports one combined anchor correction', batch.anchorDelta === 136, String(batch.anchorDelta));
	check('measurement batch updates total height', layout.totalHeight === beforeBatchTotal + 264);
	const settledBatch = layout.measureBatch([
		[snapshot.blocks[10].blockId, 120],
		[snapshot.blocks[20].blockId, 160],
	], layout.offsetOf(batchAnchorId) ?? 0);
	check('settled measurement batch is a no-op', settledBatch.changedCount === 0 && settledBatch.anchorDelta === 0);
	const duplicateBatch = layout.measureBatch([
		[snapshot.blocks[30].blockId, 120],
		[snapshot.blocks[30].blockId, 140],
	], layout.offsetOf(batchAnchorId) ?? 0);
	check('measurement batch keeps only the latest report per row', duplicateBatch.changedCount === 1);
	check('deduplicated row contributes one anchor correction', duplicateBatch.anchorDelta === 68);

	const pinnedId = snapshot.blocks[4_900].blockId;
	const pinned = layout.range(0, 900, new Set([pinnedId]));
	check('far hard pin mounts requested block', pinned.items.some((item) => item.blockId === pinnedId));
	check('one far pin does not mount corridor', pinned.items.length === layout.range(0, 900).items.length + 1);
	check('drop index resolves from complete layout', layout.insertionIndexAtOffset(layout.totalHeight - 1) === 5_000);
	const forwardWindow = layout.range(10_000, 900, new Set(), { before: 900, after: 4_800 });
	const reverseWindow = layout.range(10_000, 900, new Set(), { before: 4_800, after: 900 });
	check('forward overscan projects farther below', forwardWindow.end > reverseWindow.end);
	check('reverse overscan projects farther above', reverseWindow.start < forwardWindow.start);
	check(
		'layout range exposes contiguous viewport coverage',
		forwardWindow.coverageStart <= 10_000 && forwardWindow.coverageEnd >= 10_900,
	);

	const pins = new ComposerHardPinRegistry(2);
	check('first ordinary pin accepted', pins.acquire('panel', snapshot.blocks[0].blockId));
	check('second ordinary pin accepted', pins.acquire('drag', snapshot.blocks[1].blockId));
	check('non-critical pin respects limit', !pins.acquire('reveal', snapshot.blocks[2].blockId));
	check('critical composition pin may exceed limit', pins.acquire('composition', snapshot.blocks[2].blockId, true));
	pins.release('drag');
	check('released owner leaves registry', !pins.blocks().has(snapshot.blocks[1].blockId));

	console.log(`composer-block-layout-index: ${checks - failures}/${checks} checks passed`);
	if (failures > 0) throw new Error(`${failures} check(s) failed`);
}

main();
