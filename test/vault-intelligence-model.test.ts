import assert from 'node:assert/strict';
import type { LintFinding } from '@/core/types/lint';
import type { VaultMaintenanceTask } from '@/core/types/vault-intelligence';
import {
	deriveMaintenanceState,
	deriveVaultMaintenanceTasks,
} from '@/ui/view/vault-intelligence/VaultIntelligenceModel';
import { DEFAULT_VAULT_INTELLIGENCE_CONFIG } from '@/ui/view/vault-intelligence/VaultIntelligenceDefaults';

function finding(overrides: Partial<LintFinding> & Pick<LintFinding, 'id' | 'signalId'>): LintFinding {
	return {
		id: overrides.id,
		signalId: overrides.signalId,
		severity: overrides.severity ?? 'warning',
		filePath: overrides.filePath ?? `${overrides.id}.md`,
		title: overrides.title ?? overrides.id,
		description: overrides.description ?? `Evidence for ${overrides.id}`,
		fixActions: overrides.fixActions ?? [],
		metadata: overrides.metadata ?? {},
		status: overrides.status ?? 'open',
	};
}

function derive(findings: LintFinding[], previous: VaultMaintenanceTask[] = []) {
	return deriveVaultMaintenanceTasks({
		config: DEFAULT_VAULT_INTELLIGENCE_CONFIG,
		findings,
		unreadableErrors: [{ path: 'broken.pdf', message: 'Parser rejected the document.' }],
		previous,
		runId: 'run-2',
		now: 2_000,
		fileMtime: () => 2_000,
	});
}

assert.equal(DEFAULT_VAULT_INTELLIGENCE_CONFIG.tasks.length, 11, 'the owner surface must cover all 11 maintenance task kinds');
assert.equal(DEFAULT_VAULT_INTELLIGENCE_CONFIG.scanOperations.length, 10, 'scan setup must disclose every routed V2 operation');
assert.deepEqual(
	DEFAULT_VAULT_INTELLIGENCE_CONFIG.checkGroups.map((group) => group.id),
	['knowledge-index', 'content', 'connections', 'follow-up'],
	'Scan checks must use the four owner-facing groups from the final contract',
);
assert.deepEqual(
	DEFAULT_VAULT_INTELLIGENCE_CONFIG.checkGroups.map((group) => group.checks.length),
	[5, 4, 8, 2],
	'Scan Setup must preserve the 5 / 4 / 8 / 2 owner-facing task contract',
);
assert.equal(
	DEFAULT_VAULT_INTELLIGENCE_CONFIG.checkGroups.flatMap((group) => group.checks).length,
	19,
	'Scan Setup must expose the 19 deterministic checks independently of maintenance task kinds',
);
assert.equal(DEFAULT_VAULT_INTELLIGENCE_CONFIG.indexOutputs.length, 20, 'the detailed Index plan must retain every Reference output, including Later rows');

const tasks = derive([
	finding({ id: 'broken-a', signalId: 'S-BROKEN-LINK', metadata: { brokenTarget: 'Missing note' } }),
	finding({ id: 'broken-b', signalId: 'S-MISSING-BACKLINK', metadata: { brokenTarget: 'Missing note' } }),
	finding({ id: 'orphan-a', signalId: 'S-ORPHAN', metadata: { suggestedCommunityLabel: 'Research' } }),
	finding({ id: 'ignored', signalId: 'C-STUB', status: 'dismissed' }),
]);

assert.deepEqual(
	tasks.map((task) => task.kind),
	['broken-links', 'community-membership', 'unreadable-files'],
	'only open evidence and real index errors may become owner work',
);
assert.equal(new Set(tasks.map((task) => task.id)).size, tasks.length, 'there must be one canonical task per maintenance kind');
assert.equal(tasks.find((task) => task.kind === 'broken-links')?.affectedLabel, '2 references');
assert.equal(tasks.find((task) => task.kind === 'broken-links')?.atomicItems[0]?.projectionLabel, 'Missing note');
assert.equal(tasks.find((task) => task.kind === 'community-membership')?.atomicItems[0]?.suggestedChoiceId, 'suggested');
assert.equal(tasks.find((task) => task.kind === 'unreadable-files')?.atomicItems[0]?.suggestedChoiceId, 'retry');

const previous = tasks.find((task) => task.kind === 'broken-links')!;
const chosen: VaultMaintenanceTask = {
	...previous,
	defaultChoice: {
		choiceId: 'keep',
		chosenAt: 1_000,
		status: 'selected',
		sourceRevision: null,
	},
	atomicItems: previous.atomicItems.map((item, index) => ({
		...item,
		ownerChoice: index === 0 ? {
			choiceId: 'redirect',
			chosenAt: 1_100,
			status: 'selected',
			sourceRevision: 1_000,
		} : {
			choiceId: 'keep',
			chosenAt: 1_000,
			status: 'selected',
			sourceRevision: 1_000,
		},
	})),
};
const rescanned = derive([
	finding({ id: 'broken-a', signalId: 'S-BROKEN-LINK', metadata: { brokenTarget: 'New suggestion' } }),
	finding({ id: 'broken-b', signalId: 'S-MISSING-BACKLINK' }),
], [chosen]).find((task) => task.kind === 'broken-links')!;

assert.equal(rescanned.defaultChoice?.choiceId, 'keep', 'the current owner default must survive a newer Peak suggestion');
assert.equal(rescanned.atomicItems[0]?.ownerChoice?.choiceId, 'redirect', 'an atomic owner choice must outrank defaults and suggestions');
assert.equal(rescanned.atomicItems[0]?.ownerChoice?.sourceRevision, 1_000, 'a rescan must not erase the revision guard captured with the owner choice');
assert.equal(rescanned.state, 'recovery', 'a changed source revision must surface recovery without erasing the owner choice');

const expanded = derive([
	finding({ id: 'broken-a', signalId: 'S-BROKEN-LINK', metadata: { brokenTarget: 'Missing note' } }),
	finding({ id: 'broken-b', signalId: 'S-MISSING-BACKLINK', metadata: { brokenTarget: 'Missing note' } }),
	finding({ id: 'broken-c', signalId: 'S-BROKEN-LINK', metadata: { brokenTarget: 'New missing note' } }),
], [chosen]).find((task) => task.kind === 'broken-links')!;
assert.equal(expanded.defaultChoice, null, 'a bulk choice from an older canonical set must not silently apply to newly discovered atoms');
assert.equal(expanded.atomicItems.find((item) => item.id === 'broken-c')?.ownerChoice, null);

assert.equal(deriveMaintenanceState('needs-choice', [], null), 'needs-choice');
assert.equal(deriveMaintenanceState('ready-review', rescanned.atomicItems, rescanned.defaultChoice), 'ready-apply');
assert.equal(deriveMaintenanceState('needs-choice', rescanned.atomicItems.map((item) => ({
	...item,
	ownerChoice: { choiceId: 'keep', chosenAt: 1, status: 'verified', sourceRevision: null },
})), null), 'verified');

console.log('vault-intelligence-model: passed');
