import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_INDEX_ENRICHMENT_CONFIG } from '@/core/document/IndexEnrichmentConfig';
import { extractTopicAndFunctionalTags } from '@/core/document/helper/TagService';
import { FUNCTIONAL_TAG_IDS } from '@/core/schemas/agents/search-agent-schemas';
import { usageFromHarnessResult } from '@/service/agents/harness/HarnessModelRunner';

assert.ok(DEFAULT_INDEX_ENRICHMENT_CONFIG.outputControl.tagsMaxTokens <= 512, 'AI Tags must use a bounded classification output budget');
assert.ok(DEFAULT_INDEX_ENRICHMENT_CONFIG.outputControl.summaryShortMaxTokens <= 512, 'short summaries must use a bounded output budget');

const tagSource = readFileSync('src/core/document/helper/TagService.ts', 'utf8');
const loaderSource = readFileSync('src/core/document/loader/MarkdownDocumentLoader.ts', 'utf8');
const serviceSource = readFileSync('src/service/chat/service-manager.ts', 'utf8');
assert.match(tagSource, /docTagResponseSchema\.parse\(raw\)/, 'parsed JSON must pass the actual Zod contract before it is committed');
assert.doesNotMatch(tagSource, /docTypeReasoning:/, 'verbose document-role reasoning must not remain in the tag output contract');
assert.match(loaderSource, /functionalTagEntries\.map\(\(entry\) => entry\.id\)/, 'presentation tags must use canonical ids, never internal functional labels');
assert.match(loaderSource, /tagsMaxTokens/, 'the Markdown loader must apply the configured Tag output limit');
assert.match(serviceSource, /modelSettings: opts\?\.maxOutputTokens/, 'single-turn calls must forward their bounded output limit to the Harness');
assert.match(tagSource, /includeSchemaInPrompt: false/, 'the compact Tag prompt must not resend a duplicate full JSON Schema for every document');
assert.match(serviceSource, /event\.type === 'reasoning_delta'/, 'provider reasoning deltas must remain observable rather than disappearing inside output usage');

const usage = usageFromHarnessResult({
	totalTokens: 150,
	steps: [{ promptTokens: 100, completionTokens: 50, reasoningTokens: 35, cachedInputTokens: 20 }],
} as never);
assert.equal(usage.outputTokens, 50);
assert.equal(usage.reasoningTokens, 35, 'reasoning tokens must no longer disappear inside aggregate output usage');
assert.equal(usage.cachedInputTokens, 20);

async function main(): Promise<void> {
	let capturedOptions: Record<string, unknown> | undefined;
	const validResult = await extractTopicAndFunctionalTags('A compact note about search quality.', {
		queryStructured: async (_prompt, _variables, _schema, options) => {
			capturedOptions = options as unknown as Record<string, unknown>;
			return {
				topicTagEntries: [{ id: 'search quality' }],
				functionalTagEntries: [{ id: FUNCTIONAL_TAG_IDS[0] }],
				timeTags: [], geoTags: [], personTags: [], inferCreatedAt: null,
			};
		},
	}, { maxOutputTokens: 512 });
	assert.deepEqual(validResult.topicTags, ['search quality']);
	assert.equal(capturedOptions?.maxOutputTokens, 512);
	assert.equal(capturedOptions?.includeSchemaInPrompt, false);

	await assert.rejects(
		() => extractTopicAndFunctionalTags('Invalid classifier output.', {
			queryStructured: async () => ({
				topicTagEntries: [], functionalTagEntries: [], timeTags: [], geoTags: [], personTags: [],
			}),
		}),
		/too_small|Array must contain at least 1 element|at least/i,
		'invalid structured output must throw instead of degrading into an empty successful result',
	);

	console.log('index enrichment contract tests passed');
}

void main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
