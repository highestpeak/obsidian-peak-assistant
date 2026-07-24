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
	// Very wide row and small per-action width: every adaptive fits inline. The
	// only overflow left is Trace (overflowOnly) — always in the More popover.
	const layout = computeActionLayout(10000, actions, 100);
	assert(
		layout.overflow.every((a) => a.overflowOnly),
		'wide layout overflow must contain only overflowOnly actions (Trace)',
	);
	// Sub-actions (copy-markdown / copy-json) never appear as row buttons.
	const inlineIds = new Set(layout.inline.map((a) => a.id));
	assert(!inlineIds.has('copy-markdown') && !inlineIds.has('copy-json'), 'sub-actions must not render inline');
	// Every inline-eligible action (non-sub, non-overflowOnly) is inline.
	for (const a of actions.filter((x) => !x.subOf && !x.overflowOnly)) {
		assert(inlineIds.has(a.id), `expected ${a.id} inline in wide layout`);
	}
	// Trace is present, but in overflow — not inline.
	assert(!inlineIds.has('trace'), 'Trace must live in overflow, not inline');
	assert(layout.overflow.some((a) => a.id === 'trace'), 'Trace must be in overflow');
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

	// Reverse-priority demotion: the LOWEST adaptive priority (copy-trace-json,
	// priority=50) must be in overflow before higher-priority adaptives.
	assert(overflowIds.has('copy-trace-json'), 'lowest-priority copy-trace-json should demote first');
}

function testLayoutMoreShownOnlyWhenNeeded(): void {
	const msg = makeAssistantMessage({ debugRunId: 'run-1' });
	// Exclude destructive AND overflowOnly (Trace) so we can verify "wide keeps
	// every ADAPTIVE inline" — no adaptive is demoted purely by width.
	const actions = getApplicableActions(msg).filter((a) => !a.destructive && !a.overflowOnly);
	const wide = computeActionLayout(10000, actions, 60);
	assert.strictEqual(wide.overflow.length, 0, 'wide layout must not demote any adaptive');
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
	// Sub-actions and overflowOnly (Trace) are never inline-eligible; every other
	// action must survive inline so no measurable action goes missing.
	const inlineEligible = actions.filter((a) => !a.subOf && !a.overflowOnly);
	assert.strictEqual(layout.inline.length, inlineEligible.length, 'zero width must keep all inline-eligible actions inline');
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
