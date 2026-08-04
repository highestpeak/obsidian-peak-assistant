/**
 * Golden tests for PromptId / TemplateRegistry coherence (T11Z-B subwave).
 *
 * These lock the truth-source contract between:
 *   - `src/core/prompt/PromptId.ts` (PromptId enum + list constants)
 *   - `src/core/template/TemplateRegistry.ts` (TEMPLATE_METADATA descriptor table)
 *   - `templates/prompts/*.md` (actual template files)
 *
 * The tests intentionally do NOT pin specific values — they assert
 * structural invariants so the registry can be slimmed without silently
 * dropping a prompt, breaking a systemPromptId binding, or pointing at a
 * non-existent template file.
 */

import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
	PromptId,
} from '@/core/types/prompt';
import {
	TEMPLATE_METADATA,
	ToolTemplateId,
	AgentTemplateId,
	IndexingTemplateId,
	StopwordTemplateId,
	ConfigTemplateId,
} from '@/core/template/TemplateRegistry';

// run-test.js bundles this file into a temp script at the repo root and runs
// `node temp-test.js` from `process.cwd()`. So cwd === repo root.
const REPO_ROOT = process.cwd();

function enumValues<T extends Record<string, string>>(e: T): string[] {
	return Object.values(e);
}

// 1. Every PromptId in the enum has a TEMPLATE_METADATA entry.
{
	const promptIds = enumValues(PromptId);
	const missing: string[] = [];
	for (const id of promptIds) {
		if (!(id in TEMPLATE_METADATA)) missing.push(id);
	}
	assert.deepStrictEqual(
		missing,
		[],
		`PromptIds missing from TEMPLATE_METADATA: ${missing.join(', ')}`,
	);
	console.log(`PASS: all ${promptIds.length} PromptIds have TEMPLATE_METADATA entries`);
}

// 2. Every non-prompt TemplateId enum also has a metadata entry.
{
	const nonPromptIds = [
		...enumValues(ToolTemplateId),
		...enumValues(AgentTemplateId),
		...enumValues(IndexingTemplateId),
		...enumValues(StopwordTemplateId),
		...enumValues(ConfigTemplateId),
	];
	const missing: string[] = [];
	for (const id of nonPromptIds) {
		if (!(id in TEMPLATE_METADATA)) missing.push(id);
	}
	assert.deepStrictEqual(
		missing,
		[],
		`non-prompt TemplateIds missing from TEMPLATE_METADATA: ${missing.join(', ')}`,
	);
	console.log(`PASS: all ${nonPromptIds.length} non-prompt TemplateIds have metadata entries`);
}

// 3. Every metadata entry with a systemPromptId points at a real TEMPLATE_METADATA key.
{
	const orphanSystemPrompts: string[] = [];
	for (const [id, meta] of Object.entries(TEMPLATE_METADATA)) {
		const sysId = (meta as { systemPromptId?: string }).systemPromptId;
		if (sysId && !(sysId in TEMPLATE_METADATA)) {
			orphanSystemPrompts.push(`${id} -> ${sysId}`);
		}
	}
	assert.deepStrictEqual(
		orphanSystemPrompts,
		[],
		`systemPromptId targets missing from TEMPLATE_METADATA: ${orphanSystemPrompts.join(', ')}`,
	);
	console.log('PASS: every systemPromptId target exists');
}

// 4. Every metadata `path` that points into templates/prompts/ resolves to a real file.
{
	const missingFiles: string[] = [];
	for (const [id, meta] of Object.entries(TEMPLATE_METADATA)) {
		const p = (meta as { path?: string }).path;
		if (!p) continue;
		// Only verify templates/prompts/*.md — other dirs (templates/tools/*.json,
		// templates/agents/*.md, templates/config/*.json) are also valid but live
		// in different shapes; expand if needed.
		if (!p.startsWith('templates/prompts/')) continue;
		const abs = path.join(REPO_ROOT, p);
		if (!fs.existsSync(abs)) missingFiles.push(`${id} -> ${p}`);
	}
	assert.deepStrictEqual(
		missingFiles,
		[],
		`metadata path points at non-existent template file: ${missingFiles.join(', ')}`,
	);
	console.log('PASS: every prompts/ metadata path resolves to a real file');
}

// 6. No PromptId enum value is duplicated (catches accidental rename collisions).
{
	const seen = new Set<string>();
	const dupes: string[] = [];
	for (const v of enumValues(PromptId)) {
		if (seen.has(v)) dupes.push(v);
		seen.add(v);
	}
	assert.deepStrictEqual(dupes, [], `duplicate PromptId values: ${dupes.join(', ')}`);
	console.log(`PASS: all ${seen.size} PromptId values are unique`);
}

// 7. No orphan templates/prompts/*.md files (every .md file is referenced by
//    a TEMPLATE_METADATA entry, OR is intentionally a fallback/example).
{
	const referencedPaths = new Set<string>();
	for (const meta of Object.values(TEMPLATE_METADATA)) {
		const p = (meta as { path?: string }).path;
		if (p && p.startsWith('templates/prompts/')) referencedPaths.add(p);
	}
	const promptsDir = path.join(REPO_ROOT, 'templates', 'prompts');
	const onDisk = fs.existsSync(promptsDir)
		? fs.readdirSync(promptsDir).filter((f) => f.endsWith('.md'))
		: [];
	const orphans: string[] = [];
	for (const file of onDisk) {
		const rel = `templates/prompts/${file}`;
		if (!referencedPaths.has(rel)) orphans.push(rel);
	}
	// We assert orphans is empty so future deletions stay coherent with on-disk
	// files. If a real fallback needs to live on disk without metadata,
	// allow-list it here explicitly.
	assert.deepStrictEqual(
		orphans,
		[],
		`orphan template .md files not referenced from TEMPLATE_METADATA: ${orphans.join(', ')}`,
	);
	console.log(`PASS: all ${onDisk.length} templates/prompts/*.md files are referenced`);
}

console.log('\nAll prompt/template registry golden tests passed!');
