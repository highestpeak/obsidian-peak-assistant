import assert from 'assert';
import {
	VAULT_SUBMIT_PLAN_TOOL_NAME,
	buildVaultHarnessTools,
	createSubmitPlanState,
} from '@/service/agents/vault/vaultHarnessTools';

function makeApp() {
	const files = [
		{ path: 'projects/a.md', basename: 'a', extension: 'md' },
		{ path: 'projects/b.md', basename: 'b', extension: 'md' },
		{ path: 'notes/c.md', basename: 'c', extension: 'md' },
	];
	return {
		vault: {
			getMarkdownFiles: () => files,
			getAbstractFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
			cachedRead: async () => '# Body',
		},
		metadataCache: {
			getFileCache: () => ({ frontmatter: {}, links: [], tags: [] }),
			getFirstLinkpathDest: () => null,
		},
	};
}

async function run() {
	const submitState = createSubmitPlanState();
	const tools = buildVaultHarnessTools({
		app: makeApp() as any,
		searchFn: async (query, limit) => [{ path: 'projects/a.md', snippet: query, score: limit }],
		analysisHistory: {
			list: async () => [],
			get: async () => null,
		} as any,
		submitState,
		onSubmitPlan: async (plan) => ({
			approved: true,
			adjustedPaths: plan.selected_paths,
			adjustedOutline: plan.proposed_outline,
		}),
	});

	assert.ok(
		tools.every((t) => t.name.startsWith('mcp__vault__')),
		'all harness tools keep the UI-compatible vault prefix',
	);

	const listFolders = tools.find((t) => t.name === 'mcp__vault__vault_list_folders');
	assert.ok(listFolders, 'list folders tool exists');
	const folders = await listFolders!.execute({ maxDepth: 1 }, {} as any);
	assert.strictEqual(folders.ok, true);
	if (folders.ok) {
		assert.strictEqual((folders.data as any).totalMdFiles, 3);
	}

	const grep = tools.find((t) => t.name === 'mcp__vault__vault_grep');
	assert.ok(grep, 'grep tool exists');
	const grepResult = await grep!.execute({ query: 'alpha', limit: 7 }, {} as any);
	assert.strictEqual(grepResult.ok, true);
	if (grepResult.ok) {
		assert.strictEqual((grepResult.data as any).hits[0].score, 7);
	}

	const submit = tools.find((t) => t.name === VAULT_SUBMIT_PLAN_TOOL_NAME);
	assert.ok(submit, 'submit plan tool exists');
	const plan = {
		selected_paths: ['projects/a.md'],
		rationale: 'enough evidence',
		proposed_outline: 'outline',
		coverage_assessment: 'good',
		follow_up_questions: ['what next?', 'what risk?', 'what source?'],
	};
	const submitResult = await submit!.execute(plan, {} as any);
	assert.strictEqual(submitResult.ok, true);
	assert.strictEqual(submitState.submitted, true);
	assert.strictEqual(submitState.plans.length, 1);
	assert.deepStrictEqual(submitState.lastFeedback?.adjustedPaths, ['projects/a.md']);

	console.log('vault-harness-tools: all guards passed');
}

void run().catch((err) => {
	console.error(err);
	process.exit(1);
});
