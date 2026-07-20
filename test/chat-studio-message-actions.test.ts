/**
 * chat-studio-message-actions.test.ts — Track D unit tests
 *
 * Covers:
 *   • computeActionLayout: wide → no overflow, narrow → reverse-priority
 *     demotion and persistent actions never demoted.
 *   • getApplicableActions: trace disabled without debugRunId, no placeholder
 *     delete action, user vs assistant applicability sets.
 */

import assert from 'assert';
import {
	computeActionLayout,
	getApplicableActions,
	type MessageActionDefinition,
} from '@/ui/view/chat-view/actions/messageActionRegistry';
import { DEFAULT_CHAT_STUDIO_STRINGS } from '@/ui/view/chat-view/chatStudioStrings';
import type { ChatMessage } from '@/service/chat/types';
import { MessageStatus } from '@/core/types/chat';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: 'a1',
		role: 'assistant',
		content: 'hello',
		createdAtTimestamp: Date.now(),
		createdAtZone: 'UTC',
		starred: false,
		model: 'test-model',
		provider: 'test-provider',
		status: MessageStatus.COMPLETED,
		...overrides,
	};
}

function makeUserMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: 'u1',
		role: 'user',
		content: 'question',
		createdAtTimestamp: Date.now(),
		createdAtZone: 'UTC',
		starred: false,
		model: '',
		provider: '',
		status: MessageStatus.COMPLETED,
		...overrides,
	};
}

// ── Tests ────────────────────────────────────────────────────────────────────

function testAssistantApplicability(): void {
	const msg = makeAssistantMessage();
	const actions = getApplicableActions(msg);
	const ids = actions.map((a) => a.id).sort();
	// Assistant registry must include copy, retry, star, branch, trace,
	// targeted-follow-up, save-to-vault, view-raw, copy-markdown and copy-json.
	// It must NOT include edit-resend (user-only) or an unwired delete action.
	for (const required of [
		'copy',
		'retry',
		'star',
		'branch',
		'trace',
		'targeted-follow-up',
		'save-to-vault',
		'view-raw',
		'copy-markdown',
		'copy-json',
	]) {
		assert(ids.includes(required), `assistant missing action ${required}: got ${ids.join(', ')}`);
	}
	assert(!ids.includes('edit-resend'), 'assistant should not offer edit-resend');
	assert(!ids.includes('delete'), 'assistant should not advertise an unwired delete action');
}

function testUserApplicability(): void {
	const msg = makeUserMessage();
	const actions = getApplicableActions(msg);
	const ids = actions.map((a) => a.id).sort();
	// User: copy, branch, view-raw, copy-markdown, copy-json and edit-resend.
	for (const required of ['copy', 'branch', 'view-raw', 'copy-markdown', 'copy-json', 'edit-resend']) {
		assert(ids.includes(required), `user missing action ${required}: got ${ids.join(', ')}`);
	}
	assert(!ids.includes('delete'), 'user should not advertise an unwired delete action');
	// User must NOT include assistant-only actions.
	for (const forbidden of ['retry', 'star', 'trace', 'targeted-follow-up', 'save-to-vault']) {
		assert(!ids.includes(forbidden), `user should not offer ${forbidden}`);
	}
}

function testTraceDisabledWithoutDebugRunId(): void {
	const msg = makeAssistantMessage({ debugRunId: undefined });
	const actions = getApplicableActions(msg);
	const trace = actions.find((a) => a.id === 'trace');
	assert(trace, 'trace action must exist');
	const reason = trace!.disabledReason?.(msg, DEFAULT_CHAT_STUDIO_STRINGS);
	assert.strictEqual(
		reason,
		DEFAULT_CHAT_STUDIO_STRINGS.messages.noTraceReason,
		'trace should be disabled with noTraceReason when debugRunId absent',
	);

	// With debugRunId, trace is enabled.
	const enabledMsg = makeAssistantMessage({ debugRunId: 'run-xyz' });
	const enabledReason = trace!.disabledReason?.(enabledMsg, DEFAULT_CHAT_STUDIO_STRINGS);
	assert.strictEqual(enabledReason, null, 'trace should be enabled with debugRunId present');
}

function testLayoutWideNoOverflow(): void {
	const msg = makeAssistantMessage({ debugRunId: 'run-1' });
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	// Very wide row and small per-action width: everything adaptive fits inline.
	const layout = computeActionLayout(10000, actions, 100);
	assert.strictEqual(layout.overflow.length, 0, 'no overflow when width is abundant and no destructive');
	// Persistent + all adaptive should be inline.
	const inlineIds = new Set(layout.inline.map((a) => a.id));
	for (const a of actions) {
		assert(inlineIds.has(a.id), `expected ${a.id} inline in wide layout`);
	}
}

function testLayoutNarrowReversePriority(): void {
	const msg = makeAssistantMessage({ debugRunId: 'run-1' });
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	// perActionPx=100, only 2 slots free after persistent + more trigger.
	// We give width=200 total → floor(200/100)=2 fits without more; but we
	// have several adaptive actions, so we need More → fitsWithMore = 1.
	const layout = computeActionLayout(200, actions, 100);
	assert(layout.overflow.length > 0, 'overflow expected when width is tight');
	// Persistent must be inline no matter what.
	const inlineIds = new Set(layout.inline.map((a) => a.id));
	const persistentIds = actions.filter((a) => a.persistent).map((a) => a.id);
	for (const pid of persistentIds) {
		assert(inlineIds.has(pid), `persistent ${pid} was demoted — layout bug`);
	}
	// Persistent never appears in overflow.
	const overflowIds = new Set(layout.overflow.map((a) => a.id));
	for (const pid of persistentIds) {
		assert(!overflowIds.has(pid), `persistent ${pid} appeared in overflow`);
	}

	// Reverse-priority demotion: the LOWEST adaptive priority (copy-json,
	// priority=100) must be in overflow before higher-priority adaptives.
	// Since copy-json has the lowest priority, it must be demoted.
	assert(overflowIds.has('copy-json'), 'lowest-priority copy-json should demote first');
}

function testLayoutMoreShownOnlyWhenNeeded(): void {
	const msg = makeAssistantMessage({ debugRunId: 'run-1' });
	// Exclude destructive so we can verify "wide with no overflow".
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	const wide = computeActionLayout(10000, actions, 60);
	assert.strictEqual(wide.overflow.length, 0, 'wide layout must not force More');
}

function testEmptyActionsSafe(): void {
	const layout = computeActionLayout(500, [], 100);
	assert.strictEqual(layout.inline.length, 0);
	assert.strictEqual(layout.overflow.length, 0);
}

function testInvalidWidthKeepsActionsInline(): void {
	const msg = makeAssistantMessage({ debugRunId: 'r' });
	const actions = getApplicableActions(msg).filter((a) => !a.destructive);
	// A zero/NaN width shouldn't discard adaptive actions; treat as "unknown
	// → keep everything inline so no user-visible action goes missing".
	const layout = computeActionLayout(0, actions, 100);
	assert(layout.inline.length === actions.length, 'zero width must keep all actions inline');
}

// ── Runner ───────────────────────────────────────────────────────────────────

function run(): void {
	const tests: Array<[string, () => void]> = [
		['assistant applicability set', testAssistantApplicability],
		['user applicability set', testUserApplicability],
		['trace disabled without debugRunId', testTraceDisabledWithoutDebugRunId],
		['wide layout has no overflow', testLayoutWideNoOverflow],
		['narrow layout demotes by reverse priority', testLayoutNarrowReversePriority],
		['more shown only when needed', testLayoutMoreShownOnlyWhenNeeded],
		['empty actions safe', testEmptyActionsSafe],
		['invalid width keeps actions inline', testInvalidWidthKeepsActionsInline],
	];

	let failed = 0;
	for (const [name, fn] of tests) {
		try {
			fn();
			console.log(`✓ ${name}`);
		} catch (err) {
			failed++;
			console.error(`✗ ${name}\n  ${err instanceof Error ? err.stack || err.message : String(err)}`);
		}
	}
	if (failed > 0) {
		console.error(`\n${failed} test(s) failed`);
		process.exit(1);
	}
	console.log(`\nAll ${tests.length} tests passed`);
}

run();

// Silence "unused import" for the type-only reference used above.
export type _Guard = MessageActionDefinition;
