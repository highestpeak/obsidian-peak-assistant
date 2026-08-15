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

	const pinnedId = snapshot.blocks[4_900].blockId;
	const pinned = layout.range(0, 900, new Set([pinnedId]));
	check('far hard pin mounts requested block', pinned.items.some((item) => item.blockId === pinnedId));
	check('one far pin does not mount corridor', pinned.items.length === top.items.length + 1);
	check('drop index resolves from complete layout', layout.insertionIndexAtOffset(layout.totalHeight - 1) === 5_000);

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
