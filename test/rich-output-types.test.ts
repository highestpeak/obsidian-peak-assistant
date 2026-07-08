/**
 * Guards for the rich-output types config template (chat-unified-mode 2026-07-05).
 *
 * Track C intent:
 *   - The list of supported rich-output blocks is declared in
 *     templates/config/rich-output-types.json — no per-type code branches.
 *   - conversation-system.md pulls the list via Handlebars iteration; the
 *     Mermaid + Bases conventions must still land in the rendered prompt.
 *   - The compiled DEFAULT_RICH_OUTPUT_TYPES mirrors the shipped JSON for
 *     bootstrap fallback (documented under configurability rule).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { DEFAULT_RICH_OUTPUT_TYPES, RichOutputTypeSchema } from '../src/service/prompt/richOutputTypes';

const ROOT = process.cwd();
const CONFIG_PATH = path.resolve(ROOT, 'templates/config/rich-output-types.json');
const CONV_PROMPT_PATH = path.resolve(ROOT, 'templates/prompts/conversation-system.md');
const REGISTRY_PATH = path.resolve(ROOT, 'src/core/template/TemplateRegistry.ts');

const RichOutputTypesFileSchema = z.object({
	types: z.array(RichOutputTypeSchema).min(1),
}).passthrough();

function readJson<T>(p: string): T {
	return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

// 1. shipped JSON parses against schema
{
	const raw = readJson<unknown>(CONFIG_PATH);
	const parsed = RichOutputTypesFileSchema.safeParse(raw);
	assert.ok(parsed.success, `rich-output-types.json failed schema: ${!parsed.success ? JSON.stringify(parsed.error.issues) : ''}`);
	console.log('PASS: JSON template validates against Zod schema');
}

// 2. Mermaid + Bases are both present (baseline coverage guard)
{
	const raw = readJson<{ types: Array<{ id: string; renderer: string }> }>(CONFIG_PATH);
	const ids = raw.types.map((t) => t.id);
	assert.ok(ids.includes('mermaid'), 'Mermaid entry must exist');
	assert.ok(ids.includes('bases'), 'Bases entry must exist');
	const bases = raw.types.find((t) => t.id === 'bases');
	assert.strictEqual(bases?.renderer, 'source-only', 'Bases must stay source-only in Chat');
	const mermaid = raw.types.find((t) => t.id === 'mermaid');
	assert.strictEqual(mermaid?.renderer, 'native', 'Mermaid remains a native renderer');
	console.log('PASS: Mermaid (native) + Bases (source-only) both registered');
}

// 3. conversation-system prompt iterates rich-output types, no hardcoded conventions
{
	const src = fs.readFileSync(CONV_PROMPT_PATH, 'utf8');
	assert.ok(
		src.includes('{{#each richOutputTypes}}'),
		'conversation-system.md must iterate {{#each richOutputTypes}} — hardcoding a specific type block is banned',
	);
	assert.ok(
		src.includes('{{{conventionMarkdown}}}'),
		'conversation-system.md must expand each conventionMarkdown block',
	);
	// The template should NOT still carry the raw Mermaid/Bases prose that
	// used to be inlined — that content lives in the JSON now.
	assert.ok(
		!src.includes('Mermaid diagram conventions'),
		'conversation-system.md must not inline the Mermaid convention text — it belongs in rich-output-types.json',
	);
	assert.ok(
		!src.includes('Obsidian Bases view conventions'),
		'conversation-system.md must not inline the Bases convention text — it belongs in rich-output-types.json',
	);
	console.log('PASS: conversation-system.md delegates to rich-output-types iteration');
}

// 4. RichOutputTypes is registered on ConfigTemplateId
{
	const src = fs.readFileSync(REGISTRY_PATH, 'utf8');
	assert.ok(
		src.includes('RichOutputTypes:'),
		'ConfigTemplateId must expose RichOutputTypes',
	);
	assert.ok(
		src.includes("meta('config', 'rich-output-types'"),
		'TemplateRegistry must map RichOutputTypes to templates/config/rich-output-types.json',
	);
	console.log('PASS: TemplateRegistry registers RichOutputTypes');
}

// 5. Compiled fallback mirrors the shipped JSON entry set
{
	const raw = readJson<{ types: Array<{ id: string }> }>(CONFIG_PATH);
	const shippedIds = new Set(raw.types.map((t) => t.id));
	const fallbackIds = new Set(DEFAULT_RICH_OUTPUT_TYPES.map((t) => t.id));
	assert.deepStrictEqual(
		[...fallbackIds].sort(),
		[...shippedIds].sort(),
		'DEFAULT_RICH_OUTPUT_TYPES must mirror rich-output-types.json id set',
	);
	console.log('PASS: DEFAULT_RICH_OUTPUT_TYPES mirrors template file');
}

console.log('\nAll rich-output-types tests passed!');
