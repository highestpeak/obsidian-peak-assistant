import {
	COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	COMPOSER_LIST_ITEM_PATCH_WRITEBACK_ID,
	applyOperations,
	type ComposerContextSnapshot,
} from '@/core/composer';
import {
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
	createDefaultResultMaterializers,
	createDefaultWritebackAdapters,
	createProseCapabilityPack,
} from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();
const config = () => DEFAULT_COMPOSER_CAPABILITIES_CONFIG;
const definitions = createProseCapabilityPack(config).definitions();

const TRANSFORMS = new Set([
	'composer.prose.to-table',
	'composer.list.reorder',
	'composer.list.to-table',
	'composer.task.prioritize',
	'composer.quote.to-callout',
	'composer.callout.to-checklist',
]);

for (const definition of definitions) {
	if (!TRANSFORMS.has(definition.manifest.id)) continue;
	check(
		`${definition.manifest.id}: structural edits use transform placement`,
		definition.effectKind === 'transform',
		definition.effectKind,
	);
	check(
		`${definition.manifest.id}: structural acceptance stays atomic`,
		definition.resultKind === 'text-patch',
		definition.resultKind,
	);
}

const fillGaps = definitions.find(
	(definition) => definition.manifest.id === 'composer.list.fill-gaps',
);
if (!fillGaps) throw new Error('list fill-gaps definition missing');
check('fill-gaps is an insertion effect', fillGaps.effectKind === 'insert', fillGaps.effectKind);
check('fill-gaps uses typed list item result', fillGaps.resultKind === 'list-item-patch', fillGaps.resultKind);
check(
	'fill-gaps uses the anchored renderer',
	fillGaps.rendererId === COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	fillGaps.rendererId,
);
check(
	'fill-gaps uses the dedicated writeback adapter',
	fillGaps.writebackAdapterId === COMPOSER_LIST_ITEM_PATCH_WRITEBACK_ID,
	fillGaps.writebackAdapterId,
);
const fillInstruction = config().instructions['composer.list.fill-gaps'] ?? '';
check(
	'fill-gaps prompt declares the typed position contract',
	fillInstruction.includes('insertionIndex') && fillInstruction.includes('itemMarkdown'),
	fillInstruction,
);

const source = [
	'- 收集用户反馈',
	'- 完成实现',
	'- 发布版本',
].join('\n');
const snapshot: ComposerContextSnapshot = {
	documentId: 'doc.md',
	revision: 'rev-1',
	target: { kind: 'block', blockId: 'list-1' },
	targetSource: source,
};
const envelope = createDefaultResultMaterializers()
	.resolve('list-item-patch')
	.materialize({
		definition: fillGaps,
		snapshot,
		text: JSON.stringify({
			insertionIndex: 1,
			itemMarkdown: '- 确认验收标准',
		}),
	});
const payload = envelope.payload as {
	insertionIndex: number;
	itemMarkdown: string;
	replacementText: string;
};
check('model-selected middle gap is preserved', payload.insertionIndex === 1, payload.insertionIndex);
check(
	'candidate replacement inserts exactly at the semantic middle gap',
	payload.replacementText === [
		'- 收集用户反馈',
		'- 确认验收标准',
		'- 完成实现',
		'- 发布版本',
	].join('\n'),
	payload.replacementText,
);

const operations = createDefaultWritebackAdapters()
	.resolve(envelope)
	.buildOperations(envelope, {
		target: snapshot.target,
		anchor: { from: 0, to: source.length },
	});
check('list item acceptance is one atomic operation', operations.length === 1 && operations[0].kind === 'replaceRange');
check(
	'atomic list acceptance produces the reviewed list',
	applyOperations(source, operations) === payload.replacementText,
);

let invalidGapFailed = false;
try {
	createDefaultResultMaterializers()
		.resolve('list-item-patch')
		.materialize({
			definition: fillGaps,
			snapshot,
			text: JSON.stringify({
				insertionIndex: 99,
				itemMarkdown: '- 不应写入',
			}),
		});
} catch {
	invalidGapFailed = true;
}
check('out-of-range model positions fail closed', invalidGapFailed);

let mismatchedStyleFailed = false;
try {
	createDefaultResultMaterializers()
		.resolve('list-item-patch')
		.materialize({
			definition: fillGaps,
			snapshot,
			text: JSON.stringify({
				insertionIndex: 1,
				itemMarkdown: '1. 不匹配的有序项',
			}),
		});
} catch {
	mismatchedStyleFailed = true;
}
check('list marker style drift fails closed', mismatchedStyleFailed);

done('composer-ai-result-semantics');
