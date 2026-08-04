import assert from 'assert';
import { PromptService } from '@/service/prompt/PromptService';

function createService(): PromptService {
	return new PromptService(
		{} as any,
		{ rootFolder: 'Peak AI' } as any,
	);
}

function testDynamicTemplateUsesLiteralPromptText(): void {
	const service = createService();
	const result = service.renderDynamicTemplate(
		'{{title}}\n{{#if selection}}Selected: {{selection}}{{/if}}\n{{content}}\n{{tags}}',
		{
			title: 'Plan <draft>',
			selection: 'keep <this>',
			content: '# Heading\n[[A & B]]',
			tags: 'planning, research',
		},
	);

	assert.strictEqual(
		result,
		'Plan <draft>\nSelected: keep <this>\n# Heading\n[[A & B]]\nplanning, research',
		'dynamic prompt values must stay literal text rather than HTML-escaped',
	);
	console.log('PASS: dynamicTemplateUsesLiteralPromptText');
}

function testDynamicTemplateSupportsOptionalVariables(): void {
	const service = createService();
	const result = service.renderDynamicTemplate(
		'{{#if selection}}Selected: {{selection}}{{else}}No selection{{/if}}',
		{ selection: '' },
	);

	assert.strictEqual(result, 'No selection');
	console.log('PASS: dynamicTemplateSupportsOptionalVariables');
}

function main(): void {
	testDynamicTemplateUsesLiteralPromptText();
	testDynamicTemplateSupportsOptionalVariables();
}

main();
