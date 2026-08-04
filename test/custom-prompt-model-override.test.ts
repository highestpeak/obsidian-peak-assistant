import assert from 'assert';
import {
	buildCustomPromptAction,
	parseCustomPromptFile,
} from '@/service/copilot/CustomPromptRegistry';

async function drain<T, R>(generator: AsyncGenerator<T, R, unknown>): Promise<R | undefined> {
	while (true) {
		const next = await generator.next();
		if (next.done) return next.value;
	}
}

function testParserKeepsOptionalModelOverride(): void {
	const definition = parseCustomPromptFile(
		'Rewrite',
		'ChatFolder/Prompts/Custom/Rewrite.md',
		'---\nlabel: "Rewrite"\ncategory: writing\nmodel: "gpt-5-mini"\n---\nRewrite {{content}}',
	);
	assert.strictEqual(definition?.modelId, 'gpt-5-mini');
	assert.strictEqual(definition?.category, 'writing');
	console.log('PASS: parserKeepsOptionalModelOverride');
}

async function testActionPassesModelOverrideToAgent(): Promise<void> {
	const definition = parseCustomPromptFile(
		'Rewrite',
		'ChatFolder/Prompts/Custom/Rewrite.md',
		'---\nmodel: gpt-5-mini\n---\nRewrite {{content}}',
	);
	assert.ok(definition);
	let receivedModelId: string | undefined;
	const action = buildCustomPromptAction(
		definition,
		{
			async *runAgentStream(input) {
				receivedModelId = input.modelId;
				return { type: 'structured' as const, data: {} };
			},
		},
		{ render: (template, variables) => `${template}:${variables.title}` },
	);
	await drain(action.execute({
		file: { path: 'Notes/Strategy.md' } as any,
		title: 'Strategy',
		content: 'Current note',
		scope: 'full',
		wordCount: 2,
		tags: [],
		links: [],
		backlinks: 0,
		headingCount: 0,
		isOrphan: false,
		frontmatter: {},
	}, undefined));
	assert.strictEqual(receivedModelId, 'gpt-5-mini');
	console.log('PASS: actionPassesModelOverrideToAgent');
}

async function main(): Promise<void> {
	testParserKeepsOptionalModelOverride();
	await testActionPassesModelOverrideToAgent();
}

main().then(() => process.exit(0)).catch((error) => {
	console.error(error);
	process.exit(1);
});
