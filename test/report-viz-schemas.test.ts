import assert from 'assert';
import {
	vizSpecSchema,
} from '@/core/schemas/report-viz-schemas';

function testValidGraph(): void {
	const result = vizSpecSchema.safeParse({
		vizType: 'graph',
		title: 'Concept Map',
		data: {
			nodes: [
				{ id: 'a', label: 'Node A' },
				{ id: 'b', label: 'Node B', group: 'core' },
			],
			edges: [{ source: 'a', target: 'b', label: 'relates' }],
		},
	});
	assert.strictEqual(result.success, true, 'valid graph should pass');
}

function testValidBarChart(): void {
	const result = vizSpecSchema.safeParse({
		vizType: 'bar',
		title: 'Revenue',
		data: {
			items: [
				{ name: 'Q1', value: 100 },
				{ name: 'Q2', value: 200, value2: 50 },
			],
			xLabel: 'Quarter',
			yLabel: 'USD',
		},
	});
	assert.strictEqual(result.success, true, 'valid bar chart should pass');
}

function testValidComparisonTable(): void {
	const result = vizSpecSchema.safeParse({
		vizType: 'table',
		title: 'Feature Comparison',
		data: {
			headers: ['Feature', 'Plan A', 'Plan B'],
			rows: [
				['Storage', '10GB', '100GB'],
				['Price', '$5', '$15'],
			],
			highlightColumn: 2,
		},
	});
	assert.strictEqual(result.success, true, 'valid comparison table should pass');
}

function testValidTimeline(): void {
	const result = vizSpecSchema.safeParse({
		vizType: 'timeline',
		title: 'Project Milestones',
		data: {
			events: [
				{ date: '2026-01', title: 'Kickoff', description: 'Project started' },
				{ date: '2026-06', title: 'Launch' },
			],
		},
	});
	assert.strictEqual(result.success, true, 'valid timeline should pass');
}

function testRejectsUnknownVizType(): void {
	const result = vizSpecSchema.safeParse({
		vizType: 'pie',
		title: 'Unknown',
		data: {},
	});
	assert.strictEqual(result.success, false, 'unknown vizType should be rejected');
}

function testRejectsGraphEmptyNodes(): void {
	const result = vizSpecSchema.safeParse({
		vizType: 'graph',
		title: 'Empty Graph',
		data: {
			nodes: [],
			edges: [],
		},
	});
	assert.strictEqual(result.success, false, 'graph with empty nodes should be rejected');
}

function testRejectsBarChartEmptyItems(): void {
	const result = vizSpecSchema.safeParse({
		vizType: 'bar',
		title: 'Empty Bar',
		data: {
			items: [],
		},
	});
	assert.strictEqual(result.success, false, 'bar chart with empty items should be rejected');
}

async function run(): Promise<void> {
	const tests: Array<{ name: string; fn: () => void }> = [
		{ name: 'accepts valid graph spec', fn: testValidGraph },
		{ name: 'accepts valid bar chart spec', fn: testValidBarChart },
		{ name: 'accepts valid comparison table spec', fn: testValidComparisonTable },
		{ name: 'accepts valid timeline spec', fn: testValidTimeline },
		{ name: 'rejects unknown vizType', fn: testRejectsUnknownVizType },
		{ name: 'rejects graph with empty nodes', fn: testRejectsGraphEmptyNodes },
		{ name: 'rejects bar chart with empty items', fn: testRejectsBarChartEmptyItems },
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			test.fn();
			console.log(`✅ PASS: ${test.name}`);
			passed += 1;
		} catch (error) {
			failed += 1;
			console.error(`❌ FAIL: ${test.name}`);
			console.error(error);
		}
	}

	console.log(`\nReport viz schema tests: ${passed} passed, ${failed} failed`);
	if (failed > 0) {
		process.exit(1);
	}
}

void run();
