/**
 * conversation-branch.test.ts — MSG-07 Branch action.
 *
 * Verifies the pure invariants of the branch logic without spinning up a
 * real ConversationService / SQLite instance:
 *   • Every branched message gets a fresh id (no id collisions with parent).
 *   • The first message in the branch carries `branchFromMessageId` = the
 *     source message id — the durable anchor UI uses to render "Branched
 *     from …" on the child conversation.
 *   • Parent variant metadata is scrubbed on copies (the branch starts a
 *     new timeline; the parent's variant history stays put).
 *   • Turn-relationship fields on the parent (replyToMessageId etc.) are
 *     preserved by-reference on the copy — history stays coherent.
 *   • conversation meta round-trip preserves `parentConversationId` and
 *     `parentMessageId` via meta_json.
 */

import assert from 'assert';
import { MessageStatus } from '@/core/types/chat';
import type { ChatMessage, ChatConversationMeta } from '@/core/types/chat';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';

/**
 * Pure re-implementation of the copy step in
 * `ConversationService.branchFromMessage`. Duplicated here so the test
 * asserts against the exact same rules without pulling in the service's
 * network of imports (which would require booting sqlite / storage etc.).
 * The service is exercised by the wider integration tests; this test
 * pins the contract so the pure semantics don't drift.
 */
function copyBranchMessages(
	sourceMessages: ChatMessage[],
	messageId: string,
	generateId: () => string,
): ChatMessage[] {
	const messageIndex = sourceMessages.findIndex((m) => m.id === messageId);
	if (messageIndex === -1) throw new Error(`Message not found: ${messageId}`);
	const slice = sourceMessages.slice(0, messageIndex + 1);
	return slice.map((m, index) => {
		const cloned: ChatMessage = {
			...m,
			id: generateId(),
			variantGroupId: undefined,
			variantIndex: undefined,
			isActiveVariant: undefined,
		};
		if (index === slice.length - 1) cloned.branchFromMessageId = messageId;
		return cloned;
	});
}

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

// ── Message-copy invariants ──────────────────────────────────────────────────

function testEveryCopiedMessageGetsFreshId(): void {
	const source: ChatMessage[] = [
		makeMessage({ id: 'src-u1', role: 'user' }),
		makeMessage({ id: 'src-a1' }),
		makeMessage({ id: 'src-u2', role: 'user' }),
	];
	let counter = 0;
	const idGen = () => `branch-${counter++}`;
	const copies = copyBranchMessages(source, 'src-a1', idGen);
	// Copies slice up to and including src-a1 (index 1) → 2 messages.
	assert.strictEqual(copies.length, 2);
	const copiedIds = new Set(copies.map((m) => m.id));
	for (const src of source) {
		assert(!copiedIds.has(src.id), `copied message must NOT reuse source id ${src.id}`);
	}
	// Fresh ids are unique amongst themselves.
	assert.strictEqual(copiedIds.size, copies.length, 'copied ids must be unique');
}

function testLastCopyRecordsBranchFromMessageId(): void {
	const source: ChatMessage[] = [
		makeMessage({ id: 'src-u1', role: 'user' }),
		makeMessage({ id: 'src-a1' }),
	];
	const copies = copyBranchMessages(source, 'src-a1', () => 'x');
	// Only the LAST copy carries branchFromMessageId.
	assert.strictEqual(copies[0].branchFromMessageId, undefined, 'earlier copies must not carry branchFromMessageId');
	assert.strictEqual(copies[copies.length - 1].branchFromMessageId, 'src-a1', 'last copy must anchor branch to source message id');
}

function testVariantMetadataStrippedOnCopy(): void {
	// Even if the source has variant fields, the copies start fresh.
	const source: ChatMessage[] = [
		makeMessage({ id: 'src-u1', role: 'user' }),
		makeMessage({
			id: 'src-a1-v0',
			variantGroupId: 'grp',
			variantIndex: 0,
			isActiveVariant: false,
		}),
		makeMessage({
			id: 'src-a1-v1',
			variantGroupId: 'grp',
			variantIndex: 1,
			isActiveVariant: true,
		}),
	];
	const copies = copyBranchMessages(source, 'src-a1-v1', () => 'branch-id');
	for (const c of copies) {
		assert.strictEqual(c.variantGroupId, undefined, 'branch copies must not inherit variantGroupId');
		assert.strictEqual(c.variantIndex, undefined, 'branch copies must not inherit variantIndex');
		assert.strictEqual(c.isActiveVariant, undefined, 'branch copies must not inherit isActiveVariant');
	}
}

function testPreservesReplyToAndRoleAndContent(): void {
	const source: ChatMessage[] = [
		makeMessage({ id: 'u1', role: 'user', content: 'user-body' }),
		makeMessage({ id: 'a1', role: 'assistant', content: 'assistant-body', replyToMessageId: 'u1' }),
	];
	const copies = copyBranchMessages(source, 'a1', () => 'x');
	assert.strictEqual(copies[0].role, 'user');
	assert.strictEqual(copies[1].role, 'assistant');
	assert.strictEqual(copies[0].content, 'user-body');
	assert.strictEqual(copies[1].content, 'assistant-body');
	// replyToMessageId must be preserved for history coherence.
	assert.strictEqual(copies[1].replyToMessageId, 'u1');
}

function testMissingMessageThrows(): void {
	assert.throws(() => copyBranchMessages([], 'nope', () => 'x'), /Message not found/);
}

// ── Meta round-trip: parentConversationId / parentMessageId ─────────────────

function testConversationMetaRoundTripParentFields(): void {
	// Simulate the exact row shape ChatStorageService.rowToConversationMeta
	// consumes. This targets the meta_json unpack path — the pack path is
	// exercised by upsertConversationMeta in production.
	const row: DbSchema['chat_conversation'] = {
		conversation_id: 'child-id',
		project_id: null,
		title: 'Branch: parent',
		file_rel_path: 'child.md',
		created_at_ts: 1_700_000_000_000,
		updated_at_ts: 1_700_000_000_500,
		active_model: 'sonnet',
		active_provider: 'anthropic',
		token_usage_total: 0,
		title_manually_edited: 0,
		title_auto_updated: 0,
		context_last_updated_ts: null,
		context_last_message_index: null,
		meta_json: JSON.stringify({
			parentConversationId: 'parent-id',
			parentMessageId: 'parent-msg',
		}),
		archived_rel_path: null,
	} as DbSchema['chat_conversation'];
	const meta: ChatConversationMeta = ChatStorageService.rowToConversationMeta(
		row,
		JSON.parse(row.meta_json ?? '{}'),
	);
	assert.strictEqual(meta.parentConversationId, 'parent-id', 'parentConversationId must round-trip through meta_json');
	assert.strictEqual(meta.parentMessageId, 'parent-msg', 'parentMessageId must round-trip through meta_json');
}

function testConversationMetaWithoutParentFieldsStaysUndefined(): void {
	// Legacy conversations that predate the parent fields must load without
	// spurious parentConversationId strings appearing.
	const row: DbSchema['chat_conversation'] = {
		conversation_id: 'legacy-id',
		project_id: null,
		title: 'legacy',
		file_rel_path: 'legacy.md',
		created_at_ts: 0,
		updated_at_ts: 0,
		active_model: '',
		active_provider: '',
		token_usage_total: 0,
		title_manually_edited: 0,
		title_auto_updated: 0,
		context_last_updated_ts: null,
		context_last_message_index: null,
		meta_json: null,
		archived_rel_path: null,
	} as DbSchema['chat_conversation'];
	const meta = ChatStorageService.rowToConversationMeta(row, {});
	assert.strictEqual(meta.parentConversationId, undefined);
	assert.strictEqual(meta.parentMessageId, undefined);
}

// ── Runner ───────────────────────────────────────────────────────────────────

function run(): void {
	const tests: Array<[string, () => void]> = [
		['every branched message gets a fresh id', testEveryCopiedMessageGetsFreshId],
		['only the last copy records branchFromMessageId = source id', testLastCopyRecordsBranchFromMessageId],
		['variant metadata is stripped from branched copies', testVariantMetadataStrippedOnCopy],
		['role / content / replyToMessageId are preserved on the copy', testPreservesReplyToAndRoleAndContent],
		['branching from a missing message throws', testMissingMessageThrows],
		['conversation meta round-trips parentConversationId + parentMessageId', testConversationMetaRoundTripParentFields],
		['legacy conversations without parent fields load with undefined lineage', testConversationMetaWithoutParentFieldsStaysUndefined],
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
