// CopilotCommandCenterService — planOnly parses schema; executePlan
// dispatches each step and halts on write-step failure.

import assert from 'assert';
import { CopilotCommandCenterService } from '@/service/copilot/CopilotCommandCenterService';
import type { CapabilityPlan } from '@/core/schemas/agents/copilotCommandCenter';

async function main() {
	await testPlanOnlyParsesLLMResponse();
	await testExecutePlanDispatchesEachStep();
	await testExecutePlanHaltsOnWriteFailure();
	console.log('copilot-command-center: ok');
}

const validPlan: CapabilityPlan = {
	planTitle: 'Test Plan',
	summary: 'Do the thing.',
	goalRestatement: 'You want to do the thing.',
	steps: [
		{ stepNumber: 1, commandId: 'cmd-a', commandLabel: 'A', rationale: 'first', readOnly: true },
		{ stepNumber: 2, commandId: 'cmd-b', commandLabel: 'B', rationale: 'second', readOnly: false },
		{ stepNumber: 3, commandId: 'cmd-c', commandLabel: 'C', rationale: 'third', readOnly: true },
	],
	confidence: 0.85,
};

function makeAI(planRaw: unknown): any {
	return {
		async queryStructured() { return planRaw; },
	};
}

function makeGateway(dispatchImpl: (id: string) => Promise<void>): any {
	return {
		all: () => [
			{ commandId: 'cmd-a', commandLabel: 'A', manifest: {} },
			{ commandId: 'cmd-b', commandLabel: 'B', manifest: {} },
			{ commandId: 'cmd-c', commandLabel: 'C', manifest: {} },
		],
		get: (id: string) => (['cmd-a', 'cmd-b', 'cmd-c'].includes(id) ? { commandId: id } : undefined),
		dispatch: async (id: string) => {
			await dispatchImpl(id);
			return { commandId: id, result: {} };
		},
	};
}

async function testPlanOnlyParsesLLMResponse() {
	const service = new CopilotCommandCenterService({
		aiServiceManager: makeAI(validPlan),
		commandGateway: makeGateway(async () => {}),
		readActiveFileExcerpt: async () => ({ path: null, excerpt: '' }),
	});
	const plan = await service.planOnly({ userGoal: 'test' });
	assert.strictEqual(plan.planTitle, 'Test Plan');
	assert.strictEqual(plan.steps.length, 3);
	assert.strictEqual(plan.confidence, 0.85);
	console.log('  ✓ planOnly parses schema');
}

async function testExecutePlanDispatchesEachStep() {
	const dispatched: string[] = [];
	const service = new CopilotCommandCenterService({
		aiServiceManager: makeAI(validPlan),
		commandGateway: makeGateway(async (id) => { dispatched.push(id); }),
		readActiveFileExcerpt: async () => ({ path: null, excerpt: '' }),
	});
	const result = await service.executePlan(validPlan);
	assert.deepStrictEqual(dispatched, ['cmd-a', 'cmd-b', 'cmd-c']);
	assert.strictEqual(result.stepOutcomes.length, 3);
	assert.ok(result.stepOutcomes.every((o) => o.status === 'succeeded'));
	console.log('  ✓ executePlan dispatches each step');
}

async function testExecutePlanHaltsOnWriteFailure() {
	const dispatched: string[] = [];
	const service = new CopilotCommandCenterService({
		aiServiceManager: makeAI(validPlan),
		commandGateway: makeGateway(async (id) => {
			dispatched.push(id);
			if (id === 'cmd-b') throw new Error('write failure');
		}),
		readActiveFileExcerpt: async () => ({ path: null, excerpt: '' }),
	});
	const result = await service.executePlan(validPlan);
	// cmd-b is readOnly=false; failure should halt cmd-c
	assert.deepStrictEqual(dispatched, ['cmd-a', 'cmd-b']);
	assert.strictEqual(result.stepOutcomes.length, 2);
	assert.strictEqual(result.stepOutcomes[1].status, 'failed');
	console.log('  ✓ executePlan halts on write-step failure');
}

main().catch((err) => { console.error(err); process.exit(1); });
