import { CopilotSessionMachine } from '@/service/composer';
import type { ComposerOperation } from '@/core/composer';
import type {
	ComposerTaskSession,
	ComposerWorkspaceIntelligenceProjection,
	FrozenComposerRunEnvelope,
} from '@/service/composer';
import { buildTaskDocumentRows } from '@/ui/view/composer/chrome/ComposerReviewNavigation';

let failures = 0;
let checks = 0;
function check(name: string, condition: boolean, detail = ''): void {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ` — ${detail}` : ''}`);
}

const session = new CopilotSessionMachine().exportState();
const task: ComposerTaskSession = {
	taskId: 'task-1',
	title: 'Provider 评测',
	documentIds: ['doc-a', 'doc-b', 'doc-new', 'doc-deleted', 'doc-context'],
	createdAt: 1,
	updatedAt: 2,
	session,
};

function run(
	runId: string,
	documentId: string,
	path: string,
	operations: readonly ComposerOperation[],
	target: FrozenComposerRunEnvelope['target'] = { kind: 'block', blockId: 'b1' },
): FrozenComposerRunEnvelope {
	return {
		runId,
		candidateId: `candidate-${runId}`,
		variantId: `variant-${runId}`,
		originDocumentId: documentId,
		originPathAtStart: path,
		originRevision: 'r1',
		originHost: 'composer',
		workSegmentId: 'segment-1',
		scopeSnapshot: { kind: 'document', documentId },
		capabilityId: 'composer.prose.polish',
		target,
		startedAt: Number(runId.replace(/\D/g, '')) || 1,
		status: 'ready',
		disposition: 'pending',
		review: {
			candidate: {
				candidateId: `candidate-${runId}`,
				target,
				baseRevision: 'r1',
				status: 'ready',
				variants: [{
					variantId: `variant-${runId}`,
					provenance: 'initial',
					status: 'ready',
					proposedChange: { operations },
					createdAt: 1,
				}],
				activeVariantId: `variant-${runId}`,
				proposedChange: { operations },
			},
			runtime: {
				ownerId: 'capability',
				rendererId: 'composer.renderer.text',
				payload: {},
			},
		},
	};
}

const projection: ComposerWorkspaceIntelligenceProjection = {
	activeSegment: null,
	scope: null,
	documents: {
		'doc-a': 'Provider 测评框架.md',
		'doc-b': '模型能力矩阵.md',
		'doc-new': 'Provider 对外内容通稿.md',
		'doc-deleted': '旧版 Provider 评测.md',
		'doc-context': '评测决策记录.md',
	},
	tasks: [task],
	activeTaskId: task.taskId,
	runs: [
		run('1', 'doc-a', 'Provider 测评框架.md', [
			{ kind: 'replaceRange', from: 10, to: 16, text: 'new content' },
		]),
		run('2', 'doc-b', '模型能力矩阵.md', [
			{ kind: 'replaceRange', from: 0, to: 11, text: 'expanded matrix' },
		]),
		run('3', 'doc-new', 'Provider 对外内容通稿.md', [
			{ kind: 'insertBlock', at: 0, text: 'complete new document' },
		], { kind: 'document', documentId: 'doc-new' }),
		run('4', 'doc-deleted', '旧版 Provider 评测.md', [
			{ kind: 'removeBlock', from: 0, to: 86 },
		], { kind: 'document', documentId: 'doc-deleted' }),
	],
};

const rows = buildTaskDocumentRows(
	projection,
	task,
	'doc-b',
	'模型能力矩阵.md',
);
check('every task document appears exactly once', rows.length === task.documentIds.length);
check('changed documents are sorted before context-only documents', rows[rows.length - 1]?.documentId === 'doc-context');
check('current document is marked without duplicating it', rows.filter((row) => row.current).length === 1);
check('addition and removal columns are derived separately', rows.find((row) => row.documentId === 'doc-a')?.added === 11
	&& rows.find((row) => row.documentId === 'doc-a')?.removed === 6);
check('whole new document projects as created', rows.find((row) => row.documentId === 'doc-new')?.created === true);
check('whole removed document projects as deleted', rows.find((row) => row.documentId === 'doc-deleted')?.deleted === true);
check('context-only document has no fake change stats', rows.find((row) => row.documentId === 'doc-context')?.pendingCount === 0);

console.log(`composer-task-review-navigation: ${checks - failures}/${checks} checks passed`);
if (failures > 0) throw new Error(`${failures} check(s) failed`);
