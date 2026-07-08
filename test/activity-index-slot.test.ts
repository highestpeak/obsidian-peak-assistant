/**
 * Track A guards (chat-unified-mode 2026-07-05): ActivityIndexSlot budget +
 * one-line render contract. The slot is required to
 *   - render at most the 10 most recent activities in one-liner form,
 *   - collapse to a single-line "N actions" summary at compression level 1,
 *   - keep rendering nothing (EMPTY_SLOT_CONTENT) when there is no activity.
 *
 * These properties are what makes `get_activity_detail(id)` the expansion
 * path — bloating the index breaks the tool contract in Track A.
 */

import assert from 'assert';
import { ActivityIndexSlot } from '../src/service/chat/context/slots/ActivityIndexSlot';
import type { PromptService } from '../src/service/prompt/PromptService';
import type { SessionContextService } from '../src/service/context/SessionContextService';
import type { ActivityEntry, WorkingContext } from '../src/service/context/types';

function makeActivity(overrides: Partial<ActivityEntry> & { id: string; summary: string; timestamp: number }): ActivityEntry {
	return {
		type: 'chat_message',
		relatedPaths: [],
		importanceLevel: 0,
		...overrides,
	};
}

function makeWorkingContext(activities: ActivityEntry[]): WorkingContext {
	return {
		activeFile: null,
		recentActivities: activities,
		workingTheme: {
			ruleBased: { topTags: [], topFolders: [], topKeywords: [], summary: '' },
			llmInferred: null,
		},
		updatedAt: Date.now(),
	};
}

function fakeSessionContext(activities: ActivityEntry[]): SessionContextService {
	const ctx = makeWorkingContext(activities);
	return { getWorkingContext: () => ctx } as unknown as SessionContextService;
}

function fakePromptService(): PromptService {
	// The Handlebars render is exercised in template tests; here we assemble
	// the one-line output deterministically so the slot logic (slicing +
	// counts) is what actually gets asserted.
	return {
		render: async (_id: unknown, vars: unknown) => {
			const v = vars as { activities: Array<{ id: string; timeAgo: string; summary: string }>; counts: Record<string, number> };
			const lines = v.activities.map((a) => `- [${a.id}] ${a.timeAgo}: ${a.summary}`);
			return `## Recent User Activity\n${lines.join('\n')}\n\nUse get_activity_detail(id) for full context.\n(total=${v.counts.total})`;
		},
	} as unknown as PromptService;
}

const now = Date.now();
const slotCtx = (activities: ActivityEntry[]) => ({
	sessionContext: fakeSessionContext(activities),
	app: {} as any,
});

async function main(): Promise<void> {

// 1. empty activity → empty slot content (no header/tokens)
{
	const slot = new ActivityIndexSlot(fakePromptService());
	const content = await slot.build(slotCtx([]) as any);
	assert.strictEqual(content.data, null);
	assert.strictEqual(content.tokens, 0);
	console.log('PASS: no activity → EMPTY_SLOT_CONTENT');
}

// 2. renders A1..A10 order, tops out at 10 even when 25 activities exist
{
	const activities: ActivityEntry[] = [];
	for (let i = 0; i < 25; i++) {
		activities.push(makeActivity({ id: `x${i}`, summary: `entry ${i}`, timestamp: now - i * 60_000 }));
	}
	const slot = new ActivityIndexSlot(fakePromptService());
	const content = await slot.build(slotCtx(activities) as any);
	const data = content.data as { text: string; activities: Array<{ id: string }> };
	assert.strictEqual(data.activities.length, 10, `slot must cap at 10, saw ${data.activities.length}`);
	assert.strictEqual(data.activities[0].id, 'A1');
	assert.strictEqual(data.activities[9].id, 'A10');
	// Ensure total count in the payload reflects the full 25 so the model
	// knows how many activities are addressable via get_activity_detail.
	assert.ok(data.text.includes('total=25'), `render must expose full total count, got: ${data.text}`);
	console.log('PASS: caps at 10 activities, A1..A10 index preserved');
}

// 3. compression level 1 collapses to a single "N actions" line, drops per-row detail
{
	const activities: ActivityEntry[] = [
		makeActivity({ id: 'a', summary: 'searched X', timestamp: now - 5 * 60_000 }),
		makeActivity({ id: 'b', summary: 'chatted', timestamp: now - 4 * 60_000 }),
		makeActivity({ id: 'c', summary: 'copilot ran', timestamp: now - 3 * 60_000 }),
	];
	const slot = new ActivityIndexSlot(fakePromptService());
	const level0 = await slot.build(slotCtx(activities) as any);
	assert.strictEqual(level0.compressionLevel, 0);

	const level1 = await slot.compress(level0, 1);
	assert.strictEqual(level1.compressionLevel, 1);
	const data1 = level1.data as { text: string; activities: unknown[] };
	assert.strictEqual(data1.activities.length, 0, 'compressed level must drop per-row detail');
	assert.ok(/3 actions/.test(data1.text), `expected "3 actions" summary, got: ${data1.text}`);
	assert.ok(level1.tokens <= level0.tokens, 'compressed payload must not grow token count');
	console.log('PASS: compression level 1 collapses to N-actions summary');
}

// 4. render() emits a single system message with the slot text (no bloat)
{
	const activities: ActivityEntry[] = [
		makeActivity({ id: 'a', summary: 'searched X', timestamp: now - 5 * 60_000 }),
	];
	const slot = new ActivityIndexSlot(fakePromptService());
	const content = await slot.build(slotCtx(activities) as any);
	const rendered = slot.render(content);
	assert.strictEqual(rendered.length, 1);
	assert.strictEqual(rendered[0].role, 'system');
	assert.ok(
		rendered[0].content.some((c: any) => typeof c.text === 'string' && /A1/.test(c.text)),
		'render must forward A-indexed one-liner text',
	);
	console.log('PASS: render returns one system message with A-index text');
}

console.log('\nAll activity-index-slot tests passed!');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
