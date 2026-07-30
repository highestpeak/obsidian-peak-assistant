import {
	COMPOSER_BLOCK_INSERTION_WRITEBACK_ID,
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

const INSERT_ACTIONS = new Set([
	'composer.prose.add-example',
	'composer.heading.outline',
	'composer.heading.questions',
	'composer.task.find-blockers',
	'composer.task.add-next-step',
	'composer.quote.explain',
	'composer.quote.counterexample',
]);

const definitions = createProseCapabilityPack(config).definitions();
for (const definition of definitions) {
	if (!INSERT_ACTIONS.has(definition.manifest.id)) continue;
	check(
		`${definition.manifest.id}: additive effect`,
		definition.effectKind === 'insert',
		definition.effectKind,
	);
	check(
		`${definition.manifest.id}: additive result kind`,
		definition.resultKind === 'block-insertion',
		definition.resultKind,
	);
	check(
		`${definition.manifest.id}: additive writeback`,
		definition.writebackAdapterId === COMPOSER_BLOCK_INSERTION_WRITEBACK_ID,
		definition.writebackAdapterId,
	);
	const instruction = config().instructions[definition.manifest.id] ?? '';
	check(
		`${definition.manifest.id}: prompt requests only additive content`,
		instruction.includes('插入') && !instruction.includes('完整替换'),
		instruction,
	);
}

const polish = definitions.find((definition) => definition.manifest.id === 'composer.prose.polish-block');
check('polish remains an in-place rewrite', polish?.effectKind === 'rewrite' && polish.resultKind === 'text-patch');

const questions = definitions.find((definition) => definition.manifest.id === 'composer.heading.questions');
if (!questions) throw new Error('heading questions definition missing');
const snapshot: ComposerContextSnapshot = {
	documentId: 'doc.md',
	revision: 'rev-1',
	target: { kind: 'block', blockId: 'heading-1' },
	targetSource: '## Source heading',
};
const envelope = createDefaultResultMaterializers()
	.resolve('block-insertion')
	.materialize({
		definition: questions,
		snapshot,
		text: '\n- What is the main claim?\n- What evidence supports it?\n',
	});
check('materializer preserves draft content without source replacement', (
	envelope.payload as { insertedText?: string }
).insertedText === '- What is the main claim?\n- What evidence supports it?');

const source = '## Source heading\n\nExisting paragraph.';
const anchor = { from: 0, to: '## Source heading'.length };
const operations = createDefaultWritebackAdapters()
	.resolve(envelope)
	.buildOperations(envelope, {
		target: snapshot.target,
		anchor,
	});
check('accept compiles to one insertBlock operation', operations.length === 1 && operations[0].kind === 'insertBlock');
check(
	'insert operation starts after the frozen source block',
	operations[0]?.kind === 'insertBlock' && operations[0].at === anchor.to,
);
check(
	'original block stays unchanged and draft lands before the following block',
	applyOperations(source, operations) === [
		'## Source heading',
		'',
		'- What is the main claim?',
		'- What evidence supports it?',
		'',
		'Existing paragraph.',
	].join('\n'),
);

done('composer-additive-draft-contract');
