import assert from 'assert';
import { buildPromptRevisionRequest, splitHandlebarsTemplate } from '@/ui/view/ai-control-center/handlebarsTemplate';
import { readFileSync } from 'fs';

function testHighlightsHandlebarsWithoutChangingSource(): void {
	const template = 'Analyze {{sourceCount}} notes for {{{searchQuery}}}. {{#if webEnabled}}Use web{{/if}}';
	const segments = splitHandlebarsTemplate(template);
	assert.deepStrictEqual(segments.filter((segment) => segment.isHandlebars).map((segment) => segment.value), ['{{sourceCount}}', '{{{searchQuery}}}', '{{#if webEnabled}}', '{{/if}}']);
	assert.strictEqual(segments.map((segment) => segment.value).join(''), template, 'highlighting must preserve the executable template byte-for-byte');
	console.log('PASS: Handlebars expressions are highlighted without changing template source');
}

function testAIRevisionBriefProtectsTemplateSyntax(): void {
	const template = 'Use {{currentQuery}} and {{#if webEnabled}}cite sources{{/if}}.';
	const brief = buildPromptRevisionRequest(template);
	assert.match(brief, /Keep every Handlebars expression exactly unchanged/, 'AI handoff must protect runtime syntax');
	assert.ok(brief.endsWith(template), 'AI handoff must include the current source');
	console.log('PASS: AI revision brief preserves Handlebars instructions');
}

function testEveryPromptEditorUsesTheSharedTemplateEditor(): void {
	for (const file of ['src/ui/view/ai-control-center/PromptEditorModal.tsx', 'src/ui/view/ai-control-center/CustomPromptEditorModal.tsx']) {
		const source = readFileSync(file, 'utf8');
		assert.match(source, /PromptTemplateEditor/, `${file} must use the shared Handlebars editor`);
	}
	console.log('PASS: built-in and Custom Prompt editors share Handlebars guidance');
}

testHighlightsHandlebarsWithoutChangingSource();
testAIRevisionBriefProtectsTemplateSyntax();
testEveryPromptEditorUsesTheSharedTemplateEditor();
