/**
 * message-variants.test.ts — MSG-08 variant model (pure helpers).
 *
 * Covers `filterActiveVariants`, `planRetryVariant`, `setActiveVariant`
 * and `collectVariantGroup`. These functions own the invariant that at
 * most one variant per group is active, and are consumed by the LLM
 * history assembler AND by the ConversationService variant methods.
 *
 * Also exercises the persistence round-trip for the new meta_json
 * fields via `buildMessageMetaJson` and the parsing helper mirrored on
 * the read side (variant-only extras are packed / unpacked losslessly).
 */

import assert from 'assert';
import { MessageStatus } from '@/core/types/chat';
import type { ChatMessage } from '@/core/types/chat';
import {
	collectVariantGroup,
	filterActiveVariants,
	isActiveInHistory,
	planRetryVariant,
	setActiveVariant,
} from '@/core/types/chat-message-variants';
import { buildMessageMetaJson } from '@/core/storage/sqlite/repositories/ChatMessageRepo';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: 'm-' + Math.random().toString(36).slice(2, 8),
		role: 'assistant',
		content: 'x',
		createdAtTimestamp: 1_700_000_000_000,
		createdAtZone: 'UTC',
		starred: false,
		model: 'sonnet',
		provider: 'anthropic',
		status: MessageStatus.COMPLETED,
		...overrides,
	};
}

// ── Backward compatibility ──────────────────────────────────────────────────

function testLegacyMessagesAlwaysActive(): void {
	// A message with no variant fields = legacy single-variant group of one.
	const legacy = makeMessage({ variantGroupId: undefined });
	assert(isActiveInHistory(legacy), 'legacy messages (no variantGroupId) must count as active');
}

function testFilterKeepsLegacyMessages(): void {
	const u = makeMessage({ id: 'u1', role: 'user' });
	const a1 = makeMessage({ id: 'a1' });
	const u2 = makeMessage({ id: 'u2', role: 'user' });
	const a2 = makeMessage({ id: 'a2' });
	const filtered = filterActiveVariants([u, a1, u2, a2]);
	assert.deepStrictEqual(
		filtered.map((m) => m.id),
		['u1', 'a1', 'u2', 'a2'],
		'filter must preserve order + keep every legacy message',
	);
}

function testFilterDropsInactiveVariants(): void {
	const messages: ChatMessage[] = [
		makeMessage({ id: 'u1', role: 'user' }),
		makeMessage({ id: 'a1-old', variantGroupId: 'g1', variantIndex: 0, isActiveVariant: false }),
		makeMessage({ id: 'a1-new', variantGroupId: 'g1', variantIndex: 1, isActiveVariant: true }),
		makeMessage({ id: 'u2', role: 'user' }),
		makeMessage({ id: 'a2', variantGroupId: undefined }),
	];
	const filtered = filterActiveVariants(messages);
	assert.deepStrictEqual(
		filtered.map((m) => m.id),
		['u1', 'a1-new', 'u2', 'a2'],
		'filter must drop inactive variants + keep everything else',
	);
}

// ── planRetryVariant ────────────────────────────────────────────────────────

function testPlanRetryFirstTimeAssignsGroup(): void {
	const messages: ChatMessage[] = [
		makeMessage({ id: 'u1', role: 'user' }),
		makeMessage({ id: 'a1' }), // legacy — no variant fields yet
	];
	const plan = planRetryVariant(messages, 'a1', () => 'grp-A');
	// New sibling gets index 1, active. Group id is grp-A.
	assert.strictEqual(plan.newVariantFields.variantGroupId, 'grp-A');
	assert.strictEqual(plan.newVariantFields.variantIndex, 1);
	assert.strictEqual(plan.newVariantFields.isActiveVariant, true);
	// Old message has been retroactively tagged with the same group,
	// index 0, inactive.
	const old = plan.updatedMessages.find((m) => m.id === 'a1')!;
	assert.strictEqual(old.variantGroupId, 'grp-A');
	assert.strictEqual(old.variantIndex, 0);
	assert.strictEqual(old.isActiveVariant, false);
}

function testPlanRetryReusesExistingGroup(): void {
	const messages: ChatMessage[] = [
		makeMessage({ id: 'u1', role: 'user' }),
		makeMessage({ id: 'a-v0', variantGroupId: 'grp-B', variantIndex: 0, isActiveVariant: false }),
		makeMessage({ id: 'a-v1', variantGroupId: 'grp-B', variantIndex: 1, isActiveVariant: true }),
	];
	let callCount = 0;
	const plan = planRetryVariant(messages, 'a-v1', () => {
		callCount++;
		return 'should-not-be-used';
	});
	assert.strictEqual(callCount, 0, 'must not generate a new group id when one already exists');
	assert.strictEqual(plan.newVariantFields.variantGroupId, 'grp-B');
	assert.strictEqual(plan.newVariantFields.variantIndex, 2, 'next index = max existing + 1');
	// Both prior members are now inactive.
	const active = plan.updatedMessages.filter((m) => m.variantGroupId === 'grp-B' && m.isActiveVariant === true);
	assert.strictEqual(active.length, 0, 'planning a retry must leave zero active members until the new sibling is added');
}

function testPlanRetryThrowsWhenPreviousMissing(): void {
	const messages: ChatMessage[] = [
		makeMessage({ id: 'u1', role: 'user' }),
	];
	assert.throws(() => planRetryVariant(messages, 'a-missing', () => 'x'));
}

// ── setActiveVariant ────────────────────────────────────────────────────────

function testSetActiveVariantFlipsExactlyOne(): void {
	const messages: ChatMessage[] = [
		makeMessage({ id: 'u1', role: 'user' }),
		makeMessage({ id: 'a-v0', variantGroupId: 'g', variantIndex: 0, isActiveVariant: true }),
		makeMessage({ id: 'a-v1', variantGroupId: 'g', variantIndex: 1, isActiveVariant: false }),
		makeMessage({ id: 'u2', role: 'user' }),
		makeMessage({ id: 'a-other', variantGroupId: 'h', variantIndex: 0, isActiveVariant: true }),
	];
	const updated = setActiveVariant(messages, 'g', 'a-v1');
	const groupG = updated.filter((m) => m.variantGroupId === 'g');
	const active = groupG.filter((m) => m.isActiveVariant === true);
	assert.strictEqual(active.length, 1, 'group must have exactly one active variant after switch');
	assert.strictEqual(active[0].id, 'a-v1', 'the chosen variant must be the active one');
	// Other group untouched.
	const other = updated.find((m) => m.id === 'a-other')!;
	assert.strictEqual(other.isActiveVariant, true, 'other groups must not be affected');
}

function testSetActiveVariantNoopWhenAlreadyActive(): void {
	const messages: ChatMessage[] = [
		makeMessage({ id: 'a-v0', variantGroupId: 'g', variantIndex: 0, isActiveVariant: true }),
		makeMessage({ id: 'a-v1', variantGroupId: 'g', variantIndex: 1, isActiveVariant: false }),
	];
	const updated = setActiveVariant(messages, 'g', 'a-v0');
	// The active one keeps the same object identity (pure helper doesn't
	// churn refs for no reason — useful when React memoizes on identity).
	assert.strictEqual(updated[0], messages[0], 'already-active member must keep object identity');
}

// ── collectVariantGroup ────────────────────────────────────────────────────

function testCollectVariantGroupEmptyForLegacy(): void {
	const legacy = makeMessage({ id: 'x' });
	assert.deepStrictEqual(collectVariantGroup([legacy], 'x'), [], 'legacy message has no group');
}

function testCollectVariantGroupReturnsSiblings(): void {
	const messages: ChatMessage[] = [
		makeMessage({ id: 'u1', role: 'user' }),
		makeMessage({ id: 'v0', variantGroupId: 'g', variantIndex: 0, isActiveVariant: false }),
		makeMessage({ id: 'v1', variantGroupId: 'g', variantIndex: 1, isActiveVariant: true }),
		makeMessage({ id: 'v2', variantGroupId: 'g', variantIndex: 2, isActiveVariant: false }),
	];
	const group = collectVariantGroup(messages, 'v1');
	assert.deepStrictEqual(group.map((m) => m.id), ['v0', 'v1', 'v2']);
}

// ── SQLite round-trip via buildMessageMetaJson + read shape ─────────────────

function testMetaJsonRoundTripPreservesVariantFields(): void {
	const msg = makeMessage({
		variantGroupId: 'grp-round-trip',
		variantIndex: 3,
		isActiveVariant: true,
		replyToMessageId: 'r1',
	});
	const json = buildMessageMetaJson(msg);
	assert(json, 'meta_json must not be null when variant fields are present');
	const parsed = JSON.parse(json!);
	assert.strictEqual(parsed.variantGroupId, 'grp-round-trip');
	assert.strictEqual(parsed.variantIndex, 3);
	assert.strictEqual(parsed.isActiveVariant, true);
	assert.strictEqual(parsed.replyToMessageId, 'r1', 'existing meta_json keys must survive alongside variant fields');
}

function testMetaJsonNullForLegacyMessage(): void {
	const legacy = makeMessage({});
	const json = buildMessageMetaJson(legacy);
	assert.strictEqual(json, null, 'legacy messages with no relationships or variant fields must still serialize to null meta_json (backward compatible)');
}

// ── Runner ───────────────────────────────────────────────────────────────────

function run(): void {
	const tests: Array<[string, () => void]> = [
		['legacy message counts as active in history', testLegacyMessagesAlwaysActive],
		['filterActiveVariants preserves legacy conversations', testFilterKeepsLegacyMessages],
		['filterActiveVariants drops inactive variants', testFilterDropsInactiveVariants],
		['planRetryVariant assigns a fresh group on first retry', testPlanRetryFirstTimeAssignsGroup],
		['planRetryVariant reuses an existing group and increments index', testPlanRetryReusesExistingGroup],
		['planRetryVariant throws when previous message is missing', testPlanRetryThrowsWhenPreviousMissing],
		['setActiveVariant flips exactly one member of the group', testSetActiveVariantFlipsExactlyOne],
		['setActiveVariant is a no-op (identity-preserving) when already active', testSetActiveVariantNoopWhenAlreadyActive],
		['collectVariantGroup returns [] for a legacy message', testCollectVariantGroupEmptyForLegacy],
		['collectVariantGroup returns all siblings ordered by array position', testCollectVariantGroupReturnsSiblings],
		['meta_json round-trips variant fields alongside relationships', testMetaJsonRoundTripPreservesVariantFields],
		['meta_json stays null for a legacy message (backcompat)', testMetaJsonNullForLegacyMessage],
	];

	let failed = 0;
	for (const [name, fn] of tests) {
		try {
			fn();
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

run();
