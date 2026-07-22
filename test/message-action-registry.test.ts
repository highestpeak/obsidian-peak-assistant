/**
 * message-action-registry.test.ts — MSG-07 / MSG-08 focused tests.
 *
 * Complements the existing `chat-studio-message-actions.test.ts`:
 *   • Verifies the pure `computeActionLayout` invariants that the ui-agnostic
 *     algorithm actually holds (no duplicates, core never demoted, More only
 *     when needed, adaptive rendered inline in descending priority order).
 *   • Verifies Trace action semantics: calls `openTraceSurface` (NOT
 *     `copyDebugTrace`) on click; is disabled when the message has no
 *     debugRunId; the new `copy-trace-json` secondary action is only
 *     applicable when the message HAS a debugRunId.
 */

import assert from 'assert';
import {
	buildCanonicalMarkdown,
	computeActionLayout,
	getApplicableActions,
	type MessageActionContext,
} from '@/ui/view/chat-view/actions/messageActionRegistry';
import { DEFAULT_CHAT_STUDIO_STRINGS } from '@/ui/view/chat-view/chatStudioStrings';
import type { ChatMessage } from '@/service/chat/types';
import { MessageStatus } from '@/core/types/chat';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: 'a1',
		role: 'assistant',
		content: 'hello world',
		createdAtTimestamp: 1_700_000_000_000,
		createdAtZone: 'UTC',
		starred: false,
		model: 'sonnet',
		provider: 'anthropic',
		status: MessageStatus.COMPLETED,
		...overrides,
	};
}

function makeCtx(overrides: Partial<MessageActionContext> = {}): MessageActionContext {
	const noop = () => {};
	const message = overrides.message ?? makeAssistantMessage({ debugRunId: 'run-x' });
	return {
		message,
		copyText: async () => true,
		openTraceSurface: noop,
		copyDebugTrace: async () => {},
		toggleStar: async () => {},
		regenerate: async () => {},
		branch: async () => {},
		saveToVault: async () => null,
		openRawModal: noop,
		requestReplyToMessage: noop,
		requestEditResend: noop,
		...overrides,
	};
}

// ── Layout invariants ────────────────────────────────────────────────────────

function testInlinePlusOverflowNoDuplicates(): void {
	const msg = makeAssistantMessage({ debugRunId: 'run-1' });
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	// Force a narrow layout so both lists are non-empty.
	const layout = computeActionLayout(220, actions, 100, 24);
	const inlineIds = new Set(layout.inline.map((a) => a.id));
	const overflowIds = new Set(layout.overflow.map((a) => a.id));
	for (const id of inlineIds) {
		assert(!overflowIds.has(id), `action ${id} appeared in BOTH inline and overflow`);
	}
	// Every applicable action must appear exactly once across the two lists.
	const total = layout.inline.length + layout.overflow.length;
	assert.strictEqual(total, actions.length, 'layout should partition applicable actions exactly');
}

function testInlineDescendingPriority(): void {
	const msg = makeAssistantMessage({ debugRunId: 'run-1' });
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	// Wide layout — everything inline. Order must be descending by priority.
	const wide = computeActionLayout(9999, actions, 40);
	for (let i = 1; i < wide.inline.length; i++) {
		assert(
			wide.inline[i - 1].priority >= wide.inline[i].priority,
			`inline actions must be sorted descending by priority (found ${wide.inline[i - 1].id} before ${wide.inline[i].id})`,
		);
	}
}

function testMoreHiddenWhenAllInline(): void {
	const msg = makeAssistantMessage({ debugRunId: 'run-1' });
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	const wide = computeActionLayout(9999, actions, 40);
	assert.strictEqual(wide.overflow.length, 0, 'wide layout must produce no overflow');
}

function testCoreNeverInOverflow(): void {
	const msg = makeAssistantMessage({ debugRunId: 'run-1' });
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	// Cripplingly narrow width: only the core reserve fits.
	const narrow = computeActionLayout(1, actions, 100, 24);
	const overflowIds = new Set(narrow.overflow.map((a) => a.id));
	for (const a of actions.filter((x) => x.persistent)) {
		assert(!overflowIds.has(a.id), `persistent action ${a.id} MUST NOT appear in overflow`);
	}
}

// ── Trace semantics ──────────────────────────────────────────────────────────

async function testTraceClickCallsOpenSurface(): Promise<void> {
	const msg = makeAssistantMessage({ debugRunId: 'run-abc' });
	const actions = getApplicableActions(msg);
	const trace = actions.find((a) => a.id === 'trace')!;
	assert(trace, 'trace action must exist');

	let openCalledWith: string | null = null;
	let copyCalledWith: string | null = null;
	const ctx = makeCtx({
		message: msg,
		openTraceSurface: (runId: string) => { openCalledWith = runId; },
		copyDebugTrace: async (runId: string) => { copyCalledWith = runId; },
	});
	await trace.execute(ctx);
	assert.strictEqual(openCalledWith, 'run-abc', 'Trace click must call openTraceSurface with the message debugRunId');
	assert.strictEqual(copyCalledWith, null, 'Trace click must NOT trigger copyDebugTrace — that is the secondary Copy trace JSON action');
}

async function testTraceClickNoopWithoutDebugRunId(): Promise<void> {
	const msg = makeAssistantMessage({ debugRunId: undefined });
	const trace = getApplicableActions(msg).find((a) => a.id === 'trace')!;
	let openCalled = false;
	const ctx = makeCtx({
		message: msg,
		openTraceSurface: () => { openCalled = true; },
	});
	await trace.execute(ctx);
	assert.strictEqual(openCalled, false, 'Trace action must be a no-op when there is no debugRunId');
	// And the disabled reason is user-visible.
	const reason = trace.disabledReason?.(msg, DEFAULT_CHAT_STUDIO_STRINGS);
	assert.strictEqual(reason, DEFAULT_CHAT_STUDIO_STRINGS.messages.noTraceReason);
}

// ── copy-trace-json secondary action ────────────────────────────────────────

function testCopyTraceJsonAppliesOnlyWithRunId(): void {
	const withRun = makeAssistantMessage({ debugRunId: 'run-42' });
	const withoutRun = makeAssistantMessage({ debugRunId: undefined });
	assert(
		getApplicableActions(withRun).some((a) => a.id === 'copy-trace-json'),
		'copy-trace-json must be applicable when the message has a debugRunId',
	);
	assert(
		!getApplicableActions(withoutRun).some((a) => a.id === 'copy-trace-json'),
		'copy-trace-json must NOT be applicable when the message lacks a debugRunId',
	);
}

async function testCopyTraceJsonCallsCopyDebugTrace(): Promise<void> {
	const msg = makeAssistantMessage({ debugRunId: 'run-42' });
	const action = getApplicableActions(msg).find((a) => a.id === 'copy-trace-json')!;
	assert(action, 'copy-trace-json action must exist');
	let receivedRunId: string | null = null;
	const ctx = makeCtx({
		message: msg,
		copyDebugTrace: async (runId: string) => { receivedRunId = runId; },
	});
	await action.execute(ctx);
	assert.strictEqual(receivedRunId, 'run-42', 'copy-trace-json must call copyDebugTrace with the message debugRunId');
}

function testCopyTraceJsonSitsInOverflow(): void {
	// copy-trace-json has priority < the other adaptive actions, so it must
	// be the LAST inline action pushed to overflow — always sits in More.
	const msg = makeAssistantMessage({ debugRunId: 'run-x' });
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	// Even a very wide layout keeps copy-trace-json inline (as long as
	// all adaptive fit), but a narrow layout must place it in overflow
	// FIRST (it is the lowest-priority adaptive action).
	const narrow = computeActionLayout(300, actions, 100, 28);
	const overflowIds = new Set(narrow.overflow.map((a) => a.id));
	assert(
		overflowIds.has('copy-trace-json'),
		'copy-trace-json must demote to overflow before higher-priority adaptives when width is tight',
	);
}

// ── buildCanonicalMarkdown sanity ────────────────────────────────────────────

function testBuildCanonicalMarkdownIncludesReasoningAndTools(): void {
	const msg = makeAssistantMessage({
		content: 'body',
		reasoning: { content: 'why' },
		toolCalls: [{ toolName: 't1', input: 'x' }, { toolName: 't2' }],
	});
	const md = buildCanonicalMarkdown(msg);
	assert(md.includes('Reasoning'), 'canonical markdown must include the reasoning block header');
	assert(md.includes('why'), 'canonical markdown must include reasoning content');
	assert(md.includes('Tool calls'), 'canonical markdown must include the tool-calls block header');
	assert(md.includes('t1'), 'canonical markdown must list tool names');
	assert(md.endsWith('body'), 'canonical markdown must end with the message body');
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
	const tests: Array<[string, () => void | Promise<void>]> = [
		['inline + overflow contain no duplicates', testInlinePlusOverflowNoDuplicates],
		['inline actions sorted by descending priority', testInlineDescendingPriority],
		['More hidden when everything fits inline', testMoreHiddenWhenAllInline],
		['core actions never appear in overflow', testCoreNeverInOverflow],
		['Trace click calls openTraceSurface not copyDebugTrace', testTraceClickCallsOpenSurface],
		['Trace click is a no-op without debugRunId', testTraceClickNoopWithoutDebugRunId],
		['copy-trace-json is applicable only with a debugRunId', testCopyTraceJsonAppliesOnlyWithRunId],
		['copy-trace-json calls copyDebugTrace with runId', testCopyTraceJsonCallsCopyDebugTrace],
		['copy-trace-json demotes to overflow before other adaptives', testCopyTraceJsonSitsInOverflow],
		['buildCanonicalMarkdown includes reasoning + tools + body', testBuildCanonicalMarkdownIncludesReasoningAndTools],
	];

	let failed = 0;
	for (const [name, fn] of tests) {
		try {
			await fn();
			console.log(`PASS: ${name}`);
		} catch (err) {
			failed++;
			console.error(`FAIL: ${name}\n  ${err instanceof Error ? err.stack || err.message : String(err)}`);
		}
	}
	if (failed > 0) {
		console.error(`\n${failed} test(s) failed`);
		process.exit(1);
	}
	console.log(`\nAll ${tests.length} tests passed`);
}

void run();
