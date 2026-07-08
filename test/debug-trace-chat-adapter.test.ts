import assert from 'assert';
import {
	DebugTraceRecorder,
	type DebugClock,
	type DebugIdFactory,
} from '@/core/debug-trace';
import {
	recordSlotBuild,
	recordBudgetGovernance,
	recordAssembledPrompt,
} from '@/service/chat/context/debugTraceAdapter';
import type { GovernedSlot } from '@/service/chat/context/BudgetGovernor';
import type { ContextSlot, SlotContent } from '@/service/chat/context/slots/types';

function makeClock(): DebugClock {
	let t = 1000;
	return { now: () => t++ };
}
function makeIds(): DebugIdFactory {
	let n = 0;
	return { next: () => `id-${++n}` };
}

function stubSlot(id: string, rendered: string): ContextSlot {
	return {
		id,
		async build() {
			return { data: rendered, tokens: 100, compressionLevel: 0 };
		},
		async compress(c) {
			return c;
		},
		estimateTokens(c) {
			return c.tokens;
		},
		render(_c: SlotContent) {
			return [{ role: 'user', content: rendered } as any];
		},
	};
}

function governed(slotId: string, rendered: string, tokens: number): GovernedSlot {
	return {
		slot: stubSlot(slotId, rendered),
		content: { data: null, tokens, compressionLevel: 0 },
		config: {
			slotId,
			priority: 1,
			maxTokens: 'rest',
			required: false,
			maxCompressionLevel: 0,
		},
	};
}

console.log('debug-trace-chat-adapter: slot build + budget drops');
{
	const rec = new DebugTraceRecorder({
		mode: 'redacted',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'chat', capabilityId: 'chat.conversation.run' });

	const built: GovernedSlot[] = [
		governed('system', 'You are Peak.', 200),
		governed('user-turn', 'What is a mobius node?', 400),
		governed('recent-messages', 'previous chat…', 800),
		governed('active-file', '# Active file content…', 1000),
	];

	recordSlotBuild(run, built);

	const after = built.slice(0, 2);
	recordBudgetGovernance(run, {
		before: built,
		after,
		compactSummaries: [
			{
				summary: 'Dropped recent-messages',
				anchors: [],
				lostDetail: 'previous chat text',
				suggestedRefetch: ['conversation:getMessage'],
				origin: 'recent-messages',
				level: 4,
			},
		],
		totalBudget: 600,
	});

	recordAssembledPrompt(run, {
		profileId: 'default',
		messageCount: 2,
		totalTokens: 600,
		durationMs: 12,
	});

	const finished = run.finish('completed');

	const assembleSpans = finished.spans.filter((s) => s.kind === 'context.assemble');
	assert.strictEqual(assembleSpans.length, 4);
	const activeFile = assembleSpans.find((s) => s.name === 'active-file')!;
	assert.strictEqual(activeFile.metrics?.tokens, 1000);
	assert.ok(activeFile.output?.excerpt.length > 0);
	// Redacted mode: raw must NOT be present.
	assert.strictEqual(activeFile.output?.raw, undefined);

	const compactSpan = finished.spans.find((s) => s.kind === 'context.compact')!;
	assert.ok(compactSpan);
	assert.strictEqual(compactSpan.metrics?.slotsBefore, 4);
	assert.strictEqual(compactSpan.metrics?.slotsAfter, 2);
	// Dropped slots are recorded
	const dropped = compactSpan.decisions?.filter((d) => d.decision === 'drop');
	assert.strictEqual(dropped?.length, 2);
	assert.ok(dropped!.some((d) => d.target === 'active-file'));
	// Compact summary is recorded as demote
	const demote = compactSpan.decisions?.find((d) => d.decision === 'demote');
	assert.ok(demote);
	assert.strictEqual(demote!.target, 'recent-messages');

	assert.strictEqual(finished.summary?.profileId, 'default');
	assert.strictEqual(finished.summary?.contextTokens, 600);
}

console.log('debug-trace-chat-adapter: raw mode captures slot content');
{
	const rec = new DebugTraceRecorder({
		mode: 'raw',
		clock: makeClock(),
		idFactory: makeIds(),
	});
	const run = rec.startRun({ surface: 'chat' });
	const built = [governed('user-turn', 'raw prompt text', 100)];
	recordSlotBuild(run, built);
	const finished = run.finish('completed');
	const span = finished.spans[0];
	assert.strictEqual(span.output?.raw, 'raw prompt text');
}

console.log('debug-trace-chat-adapter: OK');
