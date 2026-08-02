import assert from 'node:assert/strict';
import { AppRuntimeRegistry } from '@/app/context/AppRuntimeRegistry';
import { resolveAIGraphStoragePaths } from '@/app/ai-graph/AIGraphStoragePaths';
import {
	GeneratedOutputRegistry,
	createDefaultGeneratedOutputRegistry,
	type GeneratedOutputDescriptor,
} from '@/core/storage/generated-output';

function testAppRuntimeOwnsGeneratedOutputRegistry(): void {
	const defaultRuntime = new AppRuntimeRegistry();
	assert.equal(
		defaultRuntime.getGeneratedOutputRegistry().require('ai-graph.artifact').documentationId,
		'DR-10',
	);

	const custom = createDefaultGeneratedOutputRegistry();
	const injectedRuntime = new AppRuntimeRegistry(custom);
	assert.equal(injectedRuntime.getGeneratedOutputRegistry(), custom);
	console.log('PASS: AppRuntimeRegistry owns generated output registry');
}

function activeRecord(
	documentationId: string,
	id: string,
	template: string,
): GeneratedOutputDescriptor {
	return {
		documentationId,
		id,
		owner: 'test',
		lifecycle: 'active',
		outputClass: 'durable-record',
		carrier: 'jsonl',
		syncPolicy: 'required',
		peakIndexPolicy: 'exclude',
		materializationPolicy: 'never',
		retentionPolicy: 'durable',
		path: { scope: 'data-store', template },
		schemaVersion: 1,
		writerEvidence: ['src/test-writer.ts'],
	};
}

function testAIGraphCompositionUsesRegistryPaths(): void {
	const registry = new GeneratedOutputRegistry([
		{
			...activeRecord('DR-90', 'ai-graph.artifact', 'custom/graphs'),
			carrier: 'json',
		},
		activeRecord('DR-91', 'run.events', 'custom/{domain}/events'),
	]);
	assert.deepEqual(
		resolveAIGraphStoragePaths('PeakData', registry),
		{
			artifactDirectory: 'PeakData/custom/graphs',
			runEventsDirectory: 'PeakData/custom/analysis/events',
		},
	);
	console.log('PASS: AI Graph composition resolves paths through generated output registry');
}

testAppRuntimeOwnsGeneratedOutputRegistry();
testAIGraphCompositionUsesRegistryPaths();
