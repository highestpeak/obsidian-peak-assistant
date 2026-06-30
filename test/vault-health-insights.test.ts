import assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildVaultHealthInsights } from '@/service/lint/insights';
import { TemplateManager, type TemplateContentProvider } from '@/core/template/TemplateManager';
import type { LintFinding } from '@/service/lint/types';

// T11Y-6: lint insight prompts now live in templates/prompts/*.md. Set up a
// simple file-backed TemplateManager so the synchronous expectations of this
// test continue to hold against the migrated builders.
const repoRoot = process.cwd();
const fsProvider: TemplateContentProvider = {
	async load(relativePath: string): Promise<string> {
		const abs = path.join(repoRoot, relativePath);
		return fs.promises.readFile(abs, 'utf8');
	},
};
TemplateManager.setInstance(new TemplateManager(fsProvider));

function brokenFinding(path: string, targets: string[], occurrences = targets.length): LintFinding {
	return {
		id: `broken-${path}`,
		signalId: 'S-BROKEN-LINK',
		severity: 'error',
		filePath: path,
		title: `${targets.length} broken link targets in ${path}`,
		description: '',
		fixActions: ['redirect-link'],
		metadata: {
			sourcePath: path,
			brokenTargets: targets,
			brokenTargetCount: targets.length,
			brokenOccurrenceCount: occurrences,
		},
		status: 'open',
	};
}

async function testBuildsRepairOrientedInsights(): Promise<void> {
	const findings = [
		brokenFinding('imports/a.md', ['Missing Concept', 'Alias One'], 20),
		brokenFinding('imports/b.md', ['Missing Concept', 'Alias Two'], 15),
		brokenFinding('imports/c.md', ['Missing Concept'], 12),
		{
			id: 'orphan-1',
			signalId: 'S-ORPHAN',
			severity: 'warning',
			filePath: 'notes/orphan.md',
			title: 'Orphan note',
			description: 'Disconnected',
			fixActions: ['suggest-links'],
			metadata: {},
			status: 'open',
		} satisfies LintFinding,
	];

	const insights = await buildVaultHealthInsights(findings);
	const repair = insights.find(i => i.kind === 'broken-link-repair');
	const missing = insights.find(i => i.kind === 'missing-targets');
	const orphan = insights.find(i => i.kind === 'orphan-reconnect');

	assert.ok(repair, 'should build a broken-link repair insight');
	assert.ok(missing, 'should build a repeated missing-target insight');
	assert.ok(orphan, 'should build an orphan reconnect insight');
	assert.ok(repair!.recommendedActions.some(action => action.mode === 'ai' && action.prompt?.includes('Repair these Obsidian broken links')));
	assert.strictEqual(missing!.impact[0]!.value, 1, 'only repeated missing targets should count');

	console.log('PASS: buildsRepairOrientedInsights');
}

testBuildsRepairOrientedInsights()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
