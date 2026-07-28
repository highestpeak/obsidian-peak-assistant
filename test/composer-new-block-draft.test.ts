import { PromptId } from '@/core/types/prompt';
import {
	COMPOSER_BLOCK_DRAFT_CAPABILITY_ID,
	countDraftBlocks,
	createComposerBlockDraftGenerationPort,
	insertDraftSyntax,
	type ComposerCapabilityExecutorPort,
	type ComposerExecutionRequest,
	type ComposerExecutorStreamEvent,
} from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

async function main(): Promise<void> {
	const inserted = insertDraftSyntax('hello', 0, 5, '**', '**');
	check('syntax shortcut wraps an explicit selection', inserted.value === '**hello**', inserted.value);
	check('wrapped shortcut leaves caret after visible syntax', inserted.selectionStart === 9 && inserted.selectionEnd === 9);

	const atCaret = insertDraftSyntax('tail', 0, 0, '## ');
	check('syntax shortcut inserts at the caret', atCaret.value === '## tail', atCaret.value);
	check('empty selection places caret after prefix', atCaret.selectionStart === 3);

	check('one paragraph counts as one draft block', countDraftBlocks('Paragraph') === 1);
	check('arbitrary Markdown can insert multiple blocks', countDraftBlocks('## Heading\n\nParagraph') === 2);
	check('empty Markdown inserts no block', countDraftBlocks('   ') === 0);

	const requests: ComposerExecutionRequest[] = [];
	const executor: ComposerCapabilityExecutorPort = {
		async *stream(request): AsyncGenerator<ComposerExecutorStreamEvent, void, unknown> {
			requests.push(request);
			yield { type: 'text-delta', text: 'Generated ' };
			yield { type: 'text-delta', text: 'Markdown' };
			yield { type: 'complete' };
		},
	};
	const port = createComposerBlockDraftGenerationPort(executor);
	let output = '';
	for await (const event of port.stream({
		prompt: 'Continue this idea',
		targetSource: '# Note',
		before: '# Note',
		after: '',
	})) {
		if (event.type === 'text-delta') output += event.text;
	}
	check('draft generation streams local candidate text', output === 'Generated Markdown', output);
	check('draft generation uses the dedicated registered prompt', requests[0]?.promptId === PromptId.ComposerBlockDraft);
	check('draft generation keeps an explicit capability id', requests[0]?.capabilityId === COMPOSER_BLOCK_DRAFT_CAPABILITY_ID);
	check('draft generation forwards user instruction', requests[0]?.variables.instruction === 'Continue this idea');

	done();
}

void main();
